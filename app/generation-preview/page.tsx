'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  FileText,
  ScanLine,
  Search,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bot,
  Puzzle,
  Globe,
  MousePointer2,
  LayoutPanelLeft,
  Clapperboard,
  MessageSquare,
  Focus,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useStageStore } from '@/lib/store/stage';
import { useSettingsStore } from '@/lib/store/settings';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { useI18n } from '@/lib/use-i18n';
import { loadImageMapping, loadPdfBlob, cleanupOldImages, storeImages } from '@/lib/utils/image-storage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { db } from '@/lib/utils/database';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import { nanoid } from 'nanoid';
import type { Stage } from '@/lib/types/stage';
import type { SceneOutline, UserRequirements, PdfImage, ImageMapping } from '@/lib/types/generation';
import { AgentRevealModal } from '@/components/agent-reveal-modal';
import { createLogger } from '@/lib/logger';

const log = createLogger('GenerationPreview');

// Session state stored in sessionStorage
interface GenerationSessionState {
  sessionId: string;
  requirements: UserRequirements;
  pdfText: string;
  pdfImages?: PdfImage[];
  imageStorageIds?: string[];
  imageMapping?: ImageMapping;
  sceneOutlines?: SceneOutline[] | null;
  currentStep: "generating" | "complete";
  // PDF deferred parsing fields
  pdfStorageKey?: string;
  pdfFileName?: string;
  pdfProviderId?: string;
  pdfProviderConfig?: { apiKey?: string; baseUrl?: string };
  // Web search context
  researchContext?: string;
  researchSources?: Array<{ title: string; url: string }>;
}

type GenerationStep = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  type: 'analysis' | 'writing' | 'visual';
};

const ALL_STEPS: GenerationStep[] = [
  {
    id: 'pdf-analysis',
    title: 'generation.analyzingPdf',
    description: 'generation.analyzingPdfDesc',
    icon: ScanLine,
    type: 'analysis'
  },
  {
    id: 'web-search',
    title: 'generation.webSearching',
    description: 'generation.webSearchingDesc',
    icon: Search,
    type: 'analysis'
  },
  {
    id: 'agent-generation',
    title: 'generation.agentGeneration',
    description: 'generation.agentGenerationDesc',
    icon: Bot,
    type: 'writing'
  },
  {
    id: 'outline',
    title: 'generation.generatingOutlines',
    description: 'generation.generatingOutlinesDesc',
    icon: FileText,
    type: 'writing'
  },
  {
    id: 'slide-content',
    title: 'generation.generatingSlideContent',
    description: 'generation.generatingSlideContentDesc',
    icon: LayoutPanelLeft,
    type: 'visual'
  },
  {
    id: 'actions',
    title: 'generation.generatingActions',
    description: 'generation.generatingActionsDesc',
    icon: Clapperboard,
    type: 'visual'
  },
];

const getActiveSteps = (session: GenerationSessionState | null) => {
  return ALL_STEPS.filter(step => {
    if (step.id === 'pdf-analysis') return !!session?.pdfStorageKey;
    if (step.id === 'web-search') return !!session?.requirements?.webSearch;
    if (step.id === 'agent-generation') return useSettingsStore.getState().agentMode === 'auto';
    return true;
  });
};

function GenerationPreviewContent() {
  const router = useRouter();
  const { t } = useI18n();
  const hasStartedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [session, setSession] = useState<GenerationSessionState | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [streamingOutlines, setStreamingOutlines] = useState<SceneOutline[] | null>(null);
  const [truncationWarnings, setTruncationWarnings] = useState<string[]>([]);
  const [webSearchSources, setWebSearchSources] = useState<Array<{ title: string; url: string }>>([]);
  const [showAgentReveal, setShowAgentReveal] = useState(false);
  const [generatedAgents, setGeneratedAgents] = useState<Array<{ id: string; name: string; role: string; persona: string; avatar: string; color: string; priority: number }>>([]);
  const agentRevealResolveRef = useRef<(() => void) | null>(null);

  // Compute active steps based on session state
  const activeSteps = getActiveSteps(session);

  // Load session from sessionStorage
  useEffect(() => {
    cleanupOldImages(24).catch((e) => log.error(e));

    const saved = sessionStorage.getItem("generationSession");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as GenerationSessionState;
        setSession(parsed);
      } catch (e) {
        log.error("Failed to parse generation session:", e);
      }
    }
    setSessionLoaded(true);
  }, []);

  // Abort all in-flight requests on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Get API credentials from localStorage
  const getApiHeaders = () => {
    const modelConfig = getCurrentModelConfig();
    const settings = useSettingsStore.getState();
    const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];
    const videoProviderConfig = settings.videoProvidersConfig?.[settings.videoProviderId];
    return {
      "Content-Type": "application/json",
      "x-model": modelConfig.modelString,
      "x-api-key": modelConfig.apiKey,
      "x-base-url": modelConfig.baseUrl,
      "x-provider-type": modelConfig.providerType || '',
      "x-requires-api-key": modelConfig.requiresApiKey ? 'true' : 'false',
      // Image generation provider
      "x-image-provider": settings.imageProviderId || '',
      "x-image-model": settings.imageModelId || '',
      "x-image-api-key": imageProviderConfig?.apiKey || '',
      "x-image-base-url": imageProviderConfig?.baseUrl || '',
      // Video generation provider
      "x-video-provider": settings.videoProviderId || '',
      "x-video-model": settings.videoModelId || '',
      "x-video-api-key": videoProviderConfig?.apiKey || '',
      "x-video-base-url": videoProviderConfig?.baseUrl || '',
      // Media generation toggles
      "x-image-generation-enabled": String(settings.imageGenerationEnabled ?? false),
      "x-video-generation-enabled": String(settings.videoGenerationEnabled ?? false),
    };
  };


  // Auto-start generation when session is loaded
  useEffect(() => {
    if (session && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Main generation flow
  const startGeneration = async () => {
    if (!session) return;

    // Create AbortController for this generation run
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    // Use a local mutable copy so we can update it after PDF parsing
    let currentSession = session;

    setError(null);
    setCurrentStepIndex(0);

    try {
      // Compute active steps for this session (recomputed after session mutations)
      let activeSteps = getActiveSteps(currentSession);

      // Determine if we need the PDF analysis step
      const hasPdfToAnalyze = !!currentSession.pdfStorageKey && !currentSession.pdfText;
      // If no PDF to analyze, skip to the next available step
      if (!hasPdfToAnalyze) {
        const firstNonPdfIdx = activeSteps.findIndex(s => s.id !== 'pdf-analysis');
        setCurrentStepIndex(Math.max(0, firstNonPdfIdx));
      }

      // Step 0: Parse PDF if needed
      if (hasPdfToAnalyze) {
        log.debug('=== Generation Preview: Parsing PDF ===');
        const pdfBlob = await loadPdfBlob(currentSession.pdfStorageKey!);
        if (!pdfBlob) {
          throw new Error(t('generation.pdfLoadFailed'));
        }

        // Ensure pdfBlob is a valid Blob with content
        if (!(pdfBlob instanceof Blob) || pdfBlob.size === 0) {
          log.error('Invalid PDF blob:', { type: typeof pdfBlob, size: pdfBlob instanceof Blob ? pdfBlob.size : 'N/A' });
          throw new Error(t('generation.pdfLoadFailed'));
        }

        // Wrap as a File to guarantee multipart/form-data with correct content-type
        const pdfFile = new File([pdfBlob], currentSession.pdfFileName || 'document.pdf', {
          type: 'application/pdf',
        });

        const parseFormData = new FormData();
        parseFormData.append('pdf', pdfFile);

        if (currentSession.pdfProviderId) {
          parseFormData.append('providerId', currentSession.pdfProviderId);
        }
        if (currentSession.pdfProviderConfig?.apiKey?.trim()) {
          parseFormData.append('apiKey', currentSession.pdfProviderConfig.apiKey);
        }
        if (currentSession.pdfProviderConfig?.baseUrl?.trim()) {
          parseFormData.append('baseUrl', currentSession.pdfProviderConfig.baseUrl);
        }

        const parseResponse = await fetch('/api/parse-pdf', {
          method: 'POST',
          body: parseFormData,
          signal,
        });

        if (!parseResponse.ok) {
          const errorData = await parseResponse.json();
          throw new Error(errorData.error || t('generation.pdfParseFailed'));
        }

        const parseResult = await parseResponse.json();
        if (!parseResult.success || !parseResult.data) {
          throw new Error(t('generation.pdfParseFailed'));
        }

        let pdfText = parseResult.data.text as string;

        // Truncate if needed
        if (pdfText.length > MAX_PDF_CONTENT_CHARS) {
          pdfText = pdfText.substring(0, MAX_PDF_CONTENT_CHARS);
        }

        // Create image metadata and store images
        // Prefer metadata.pdfImages (both parsers now return this)
        const rawPdfImages = parseResult.data.metadata?.pdfImages;
        const images = rawPdfImages
          ? rawPdfImages.map((img: { id: string; src?: string; pageNumber?: number; description?: string; width?: number; height?: number }) => ({
              id: img.id,
              src: img.src || '',
              pageNumber: img.pageNumber || 1,
              description: img.description,
              width: img.width,
              height: img.height,
            }))
          : (parseResult.data.images as string[]).map((src: string, i: number) => ({
              id: `img_${i + 1}`,
              src,
              pageNumber: 1,
            }));

        const imageStorageIds = await storeImages(images);

        const pdfImages: PdfImage[] = images.map((img: { id: string; src: string; pageNumber: number; description?: string; width?: number; height?: number }, i: number) => ({
          id: img.id,
          src: '',
          pageNumber: img.pageNumber,
          description: img.description,
          width: img.width,
          height: img.height,
          storageId: imageStorageIds[i],
        }));

        // Update session with parsed PDF data
        const updatedSession = {
          ...currentSession,
          pdfText,
          pdfImages,
          imageStorageIds,
          pdfStorageKey: undefined, // Clear so we don't re-parse
        };
        setSession(updatedSession);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSession));

        // Truncation warnings
        const warnings: string[] = [];
        if ((parseResult.data.text as string).length > MAX_PDF_CONTENT_CHARS) {
          warnings.push(t('generation.textTruncated').replace('{n}', String(MAX_PDF_CONTENT_CHARS)));
        }
        if (images.length > MAX_VISION_IMAGES) {
          warnings.push(
            t('generation.imageTruncated')
              .replace('{total}', String(images.length))
              .replace('{max}', String(MAX_VISION_IMAGES))
          );
        }
        if (warnings.length > 0) {
          setTruncationWarnings(warnings);
        }

        // Reassign local reference for subsequent steps
        currentSession = updatedSession;
        activeSteps = getActiveSteps(currentSession);
      }

      // Step: Web Search (if enabled)
      const webSearchStepIdx = activeSteps.findIndex(s => s.id === 'web-search');
      if (currentSession.requirements.webSearch && webSearchStepIdx >= 0) {
        setCurrentStepIndex(webSearchStepIdx);
        setWebSearchSources([]);

        const wsSettings = useSettingsStore.getState();
        const wsApiKey = wsSettings.webSearchProvidersConfig?.[wsSettings.webSearchProviderId]?.apiKey;
        const res = await fetch('/api/web-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: currentSession.requirements.requirement,
            apiKey: wsApiKey || undefined,
          }),
          signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Web search failed' }));
          throw new Error(data.error || t('generation.webSearchFailed'));
        }

        const searchData = await res.json();
        const sources = (searchData.sources || []).map((s: { title: string; url: string }) => ({ title: s.title, url: s.url }));
        setWebSearchSources(sources);

        const updatedSessionWithSearch = {
          ...currentSession,
          researchContext: searchData.context || '',
          researchSources: sources,
        };
        setSession(updatedSessionWithSearch);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSessionWithSearch));
        currentSession = updatedSessionWithSearch;
        activeSteps = getActiveSteps(currentSession);
      }

      // Load imageMapping early (needed for both outline and scene generation)
      let imageMapping: ImageMapping = {};
      if (currentSession.imageStorageIds && currentSession.imageStorageIds.length > 0) {
        log.debug('Loading images from IndexedDB');
        imageMapping = await loadImageMapping(currentSession.imageStorageIds);
      } else if (currentSession.imageMapping && Object.keys(currentSession.imageMapping).length > 0) {
        log.debug('Using imageMapping from session (old format)');
        imageMapping = currentSession.imageMapping;
      }

      // ── Agent generation (before outlines so persona can influence structure) ──
      const settings = useSettingsStore.getState();
      let agents: Array<{ id: string; name: string; role: string; persona?: string }> = [];

      // Create stage client-side (needed for agent generation stageId)
      const stageId = nanoid(10);
      const stage: Stage = {
        id: stageId,
        name: extractTopicFromRequirement(currentSession.requirements.requirement),
        description: '',
        language: currentSession.requirements.language || 'zh-CN',
        style: 'professional',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      if (settings.agentMode === 'auto') {
        const agentStepIdx = activeSteps.findIndex(s => s.id === 'agent-generation');
        if (agentStepIdx >= 0) setCurrentStepIndex(agentStepIdx);

        try {
          const allAvatars = [
            '/avatars/assist.png', '/avatars/assist-2.png',
            '/avatars/clown.png', '/avatars/clown-2.png',
            '/avatars/curious.png', '/avatars/curious-2.png',
            '/avatars/note-taker.png', '/avatars/note-taker-2.png',
            '/avatars/teacher.png', '/avatars/teacher-2.png',
            '/avatars/thinker.png', '/avatars/thinker-2.png',
          ];

          // No outlines yet — agent generation uses only stage name + description
          const agentResp = await fetch('/api/generate/agent-profiles', {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({
              stageInfo: { name: stage.name, description: stage.description },
              language: currentSession.requirements.language || 'zh-CN',
              availableAvatars: allAvatars,
            }),
            signal,
          });

          if (!agentResp.ok) throw new Error('Agent generation failed');
          const agentData = await agentResp.json();
          if (!agentData.success) throw new Error(agentData.error || 'Agent generation failed');

          // Save to IndexedDB and registry
          const { saveGeneratedAgents } = await import('@/lib/orchestration/registry/store');
          const savedIds = await saveGeneratedAgents(stage.id, agentData.agents);
          settings.setSelectedAgentIds(savedIds);

          // Show card-reveal modal, continue generation once all cards are revealed
          setGeneratedAgents(agentData.agents);
          setShowAgentReveal(true);
          await new Promise<void>(resolve => {
            agentRevealResolveRef.current = resolve;
          });

          agents = savedIds
            .map(id => useAgentRegistry.getState().getAgent(id))
            .filter(Boolean)
            .map(a => ({ id: a!.id, name: a!.name, role: a!.role, persona: a!.persona }));
        } catch (err: unknown) {
          log.warn('[Generation] Agent generation failed, falling back to presets:', err);
          const registry = useAgentRegistry.getState();
          agents = settings.selectedAgentIds
            .map(id => registry.getAgent(id))
            .filter(Boolean)
            .map(a => ({ id: a!.id, name: a!.name, role: a!.role, persona: a!.persona }));
        }
      } else {
        // Preset mode — use selected agents (include persona)
        const registry = useAgentRegistry.getState();
        agents = settings.selectedAgentIds
          .map(id => registry.getAgent(id))
          .filter(Boolean)
          .map(a => ({ id: a!.id, name: a!.name, role: a!.role, persona: a!.persona }));
      }

      // ── Generate outlines (with agent personas for teacher context) ──
      let outlines = currentSession.sceneOutlines;

      const outlineStepIdx = activeSteps.findIndex(s => s.id === 'outline');
      setCurrentStepIndex(outlineStepIdx >= 0 ? outlineStepIdx : 0);
      if (!outlines || outlines.length === 0) {
        log.debug("=== Generating outlines (SSE) ===");
        setStreamingOutlines([]);

        outlines = await new Promise<SceneOutline[]>((resolve, reject) => {
          const collected: SceneOutline[] = [];

          fetch("/api/generate/scene-outlines-stream", {
            method: "POST",
            headers: getApiHeaders(),
            body: JSON.stringify({
              requirements: currentSession.requirements,
              pdfText: currentSession.pdfText,
              pdfImages: currentSession.pdfImages,
              imageMapping,
              researchContext: currentSession.researchContext,
              agents,
            }),
            signal,
          }).then(res => {
            if (!res.ok) {
              return res.json().then(d => {
                reject(new Error(d.error || t('generation.outlineGenerateFailed')));
              });
            }

            const reader = res.body?.getReader();
            if (!reader) {
              reject(new Error(t('generation.streamNotReadable')));
              return;
            }

            const decoder = new TextDecoder();
            let sseBuffer = '';

            const pump = (): Promise<void> => reader.read().then(({ done, value }) => {
              if (value) {
                sseBuffer += decoder.decode(value, { stream: !done });
                const lines = sseBuffer.split('\n');
                sseBuffer = lines.pop() || '';

                for (const line of lines) {
                  if (!line.startsWith('data: ')) continue;
                  try {
                    const evt = JSON.parse(line.slice(6));
                    if (evt.type === 'outline') {
                      collected.push(evt.data);
                      setStreamingOutlines([...collected]);
                    } else if (evt.type === 'retry') {
                      collected.length = 0;
                      setStreamingOutlines([]);
                      setStatusMessage(t('generation.outlineRetrying'));
                    } else if (evt.type === 'done') {
                      resolve(evt.outlines || collected);
                      return;
                    } else if (evt.type === 'error') {
                      reject(new Error(evt.error));
                      return;
                    }
                  } catch (e) {
                    log.error('Failed to parse outline SSE:', line, e);
                  }
                }
              }
              if (done) {
                if (collected.length > 0) {
                  resolve(collected);
                } else {
                  reject(new Error(t('generation.outlineEmptyResponse')));
                }
                return;
              }
              return pump();
            });

            pump().catch(reject);
          }).catch(reject);
        });

        const updatedSession = { ...currentSession, sceneOutlines: outlines };
        setSession(updatedSession);
        sessionStorage.setItem(
          "generationSession",
          JSON.stringify(updatedSession)
        );

        // Outline generation succeeded — clear homepage draft cache
        try { localStorage.removeItem('requirementDraft'); } catch { /* ignore */ }

        // Brief pause to let user see the final outline state
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      // Move to scene generation step
      setStatusMessage('');
      if (!outlines || outlines.length === 0) {
        throw new Error(t('generation.outlineEmptyResponse'));
      }

      // Store stage and outlines
      const store = useStageStore.getState();
      store.setStage(stage);
      store.setOutlines(outlines);

      // Advance to slide-content step
      const contentStepIdx = activeSteps.findIndex(s => s.id === 'slide-content');
      if (contentStepIdx >= 0) setCurrentStepIndex(contentStepIdx);

      // Build stageInfo and userProfile for API call
      const stageInfo = {
        name: stage.name,
        description: stage.description,
        language: stage.language,
        style: stage.style,
      };

      const userProfile = (currentSession.requirements.userNickname || currentSession.requirements.userBio)
        ? `Student: ${currentSession.requirements.userNickname || 'Unknown'}${currentSession.requirements.userBio ? ` — ${currentSession.requirements.userBio}` : ''}`
        : undefined;

      // Generate ONLY the first scene
      store.setGeneratingOutlines(outlines);

      const firstOutline = outlines[0];

      // Step 2: Generate content (currentStepIndex is already 2)
      const contentResp = await fetch('/api/generate/scene-content', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          outline: firstOutline,
          allOutlines: outlines,
          pdfImages: currentSession.pdfImages,
          imageMapping,
          stageInfo,
          stageId: stage.id,
          agents,
        }),
        signal,
      });

      if (!contentResp.ok) {
        const errorData = await contentResp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || t('generation.sceneGenerateFailed'));
      }

      const contentData = await contentResp.json();
      if (!contentData.success || !contentData.content) {
        throw new Error(contentData.error || t('generation.sceneGenerateFailed'));
      }

      // Generate actions (activate actions step indicator)
      const actionsStepIdx = activeSteps.findIndex(s => s.id === 'actions');
      setCurrentStepIndex(actionsStepIdx >= 0 ? actionsStepIdx : currentStepIndex + 1);

      const actionsResp = await fetch('/api/generate/scene-actions', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          outline: contentData.effectiveOutline || firstOutline,
          allOutlines: outlines,
          content: contentData.content,
          stageId: stage.id,
          agents,
          previousSpeeches: [],
          userProfile,
        }),
        signal,
      });

      if (!actionsResp.ok) {
        const errorData = await actionsResp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || t('generation.sceneGenerateFailed'));
      }

      const data = await actionsResp.json();
      if (!data.success || !data.scene) {
        throw new Error(data.error || t('generation.sceneGenerateFailed'));
      }

      // Generate TTS for first scene (part of actions step — blocking)
      if (settings.ttsEnabled && settings.ttsProviderId !== 'browser-native-tts') {
        const ttsProviderConfig = settings.ttsProvidersConfig?.[settings.ttsProviderId];
        const speechActions = (data.scene.actions || []).filter(
          (a: { type: string; text?: string }) => a.type === 'speech' && a.text
        );

        let ttsFailCount = 0;
        for (const action of speechActions) {
          const audioId = `tts_${action.id}`;
          action.audioId = audioId;
          try {
            const resp = await fetch('/api/generate/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: action.text,
                audioId,
                ttsProviderId: settings.ttsProviderId,
                ttsVoice: settings.ttsVoice,
                ttsSpeed: settings.ttsSpeed,
                ttsApiKey: ttsProviderConfig?.apiKey || undefined,
                ttsBaseUrl: ttsProviderConfig?.baseUrl || undefined,
              }),
              signal,
            });
            if (!resp.ok) { ttsFailCount++; continue; }
            const ttsData = await resp.json();
            if (!ttsData.success) { ttsFailCount++; continue; }
            const binary = atob(ttsData.base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: `audio/${ttsData.format}` });
            await db.audioFiles.put({ id: audioId, blob, format: ttsData.format, createdAt: Date.now() });
          } catch (err) {
            log.warn(`[TTS] Failed for ${audioId}:`, err);
            ttsFailCount++;
          }
        }

        if (ttsFailCount > 0 && speechActions.length > 0) {
          throw new Error(t('generation.speechFailed'));
        }
      }

      // Add scene to store and navigate
      store.addScene(data.scene);
      store.setCurrentSceneId(data.scene.id);

      // Set remaining outlines as skeleton placeholders
      const remaining = outlines.filter((o) => o.order !== data.scene.order);
      store.setGeneratingOutlines(remaining);

      // Store generation params for classroom to continue generation
      sessionStorage.setItem('generationParams', JSON.stringify({
        pdfImages: currentSession.pdfImages,
        agents,
        userProfile,
      }));

      sessionStorage.removeItem('generationSession');
      await store.saveToStorage();
      router.push(`/classroom/${stage.id}`);
    } catch (err) {
      // AbortError is expected when navigating away — don't show as error
      if (err instanceof DOMException && err.name === 'AbortError') {
        log.info('[GenerationPreview] Generation aborted');
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const extractTopicFromRequirement = (requirement: string): string => {
    const trimmed = requirement.trim();
    if (trimmed.length <= 500) {
      return trimmed;
    }
    return trimmed.substring(0, 500).trim() + "...";
  };

  const goBackToHome = () => {
    abortControllerRef.current?.abort();
    sessionStorage.removeItem("generationSession");
    router.push("/");
  };

  // Still loading session from sessionStorage
  if (!sessionLoaded) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="text-center text-muted-foreground">
          <div className="size-8 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // No session found
  if (!session) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full">
          <div className="text-center space-y-4">
            <AlertCircle className="size-12 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-semibold">{t('generation.sessionNotFound')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('generation.sessionNotFoundDesc')}
            </p>
            <Button onClick={() => router.push('/')} className="w-full">
              <ArrowLeft className="size-4 mr-2" />
              {t("generation.backToHome")}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const activeStep = activeSteps.length > 0
    ? activeSteps[Math.min(currentStepIndex, activeSteps.length - 1)]
    : ALL_STEPS[0];

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden text-center">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
      </div>

      {/* Back button */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-4 left-4 z-20"
      >
        <Button variant="ghost" size="sm" onClick={goBackToHome}>
          <ArrowLeft className="size-4 mr-2" />
          {t("generation.backToHome")}
        </Button>
      </motion.div>

      <div className="z-10 w-full max-w-lg space-y-8 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          <Card className="relative overflow-hidden border-muted/40 shadow-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl min-h-[400px] flex flex-col items-center justify-center p-8 md:p-12">
            {/* Progress Dots */}
            <div className="absolute top-6 left-0 right-0 flex justify-center gap-2">
              {activeSteps.map((step, idx) => (
                <div
                  key={step.id}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-500",
                    idx < currentStepIndex ? "w-1.5 bg-blue-500/30" :
                      idx === currentStepIndex ? "w-8 bg-blue-500" :
                        "w-1.5 bg-muted/50"
                  )}
                />
              ))}
            </div>

            {/* Central Content */}
            <div className="flex-1 flex flex-col items-center justify-center w-full space-y-8 mt-4">
              {/* Icon / Visualizer Container */}
              <div className="relative size-48 flex items-center justify-center">
                <AnimatePresence mode="popLayout">
                  {error ? (
                    <motion.div
                      key="error"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="size-32 rounded-full bg-red-500/10 flex items-center justify-center border-2 border-red-500/20"
                    >
                      <AlertCircle className="size-16 text-red-500" />
                    </motion.div>
                  ) : isComplete ? (
                    <motion.div
                      key="complete"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="size-32 rounded-full bg-green-500/10 flex items-center justify-center border-2 border-green-500/20"
                    >
                      <CheckCircle2 className="size-16 text-green-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key={activeStep.id}
                      initial={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
                      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                      exit={{ scale: 1.2, opacity: 0, filter: 'blur(10px)' }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <StepVisualizer stepId={activeStep.id} outlines={streamingOutlines} webSearchSources={webSearchSources} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Text Content */}
              <div className="space-y-3 max-w-sm mx-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={error ? "error" : isComplete ? "done" : activeStep.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-2"
                  >
                    <h2 className="text-2xl font-bold tracking-tight">
                      {error ? t('generation.generationFailed') : isComplete ? t('generation.generationComplete') : t(activeStep.title)}
                    </h2>
                    <p className="text-muted-foreground text-base">
                      {error ? error : isComplete ? t('generation.classroomReady') : statusMessage || t(activeStep.description)}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {/* Truncation warning indicator */}
                <AnimatePresence>
                  {truncationWarnings.length > 0 && !error && !isComplete && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="flex justify-center"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.button
                            type="button"
                            animate={{
                              boxShadow: [
                                '0 0 0 0 rgba(251, 191, 36, 0), 0 0 0 0 rgba(251, 191, 36, 0)',
                                '0 0 16px 4px rgba(251, 191, 36, 0.12), 0 0 4px 1px rgba(251, 191, 36, 0.08)',
                                '0 0 0 0 rgba(251, 191, 36, 0), 0 0 0 0 rgba(251, 191, 36, 0)',
                              ],
                            }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                            className="relative size-7 rounded-full flex items-center justify-center cursor-default
                                       bg-gradient-to-br from-amber-400/15 to-orange-400/10
                                       border border-amber-400/25 hover:border-amber-400/40
                                       hover:from-amber-400/20 hover:to-orange-400/15
                                       transition-colors duration-300
                                       focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
                          >
                            <AlertTriangle className="size-3.5 text-amber-500 dark:text-amber-400" strokeWidth={2.5} />
                          </motion.button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={6}>
                          <div className="space-y-1 py-0.5">
                            {truncationWarnings.map((w, i) => (
                              <p key={i} className="text-xs leading-relaxed">{w}</p>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Footer Action */}
        <div className="h-16 flex items-center justify-center w-full">
          <AnimatePresence>
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-xs"
              >
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full h-12"
                  onClick={goBackToHome}
                >
                  {t('generation.goBackAndRetry')}
                </Button>
              </motion.div>
            ) : !isComplete ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 text-sm text-muted-foreground/50 font-medium uppercase tracking-widest"
              >
                <Sparkles className="size-3 animate-pulse" />
                {t('generation.aiWorking')}
                {generatedAgents.length > 0 && !showAgentReveal && (
                  <button
                    onClick={() => setShowAgentReveal(true)}
                    className="ml-2 flex items-center gap-1.5 rounded-full border border-purple-300/30 bg-purple-500/10 px-3 py-1 text-xs font-medium normal-case tracking-normal text-purple-400 transition-colors hover:bg-purple-500/20 hover:text-purple-300"
                  >
                    <Bot className="size-3" />
                    {t('generation.viewAgents')}
                  </button>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Agent Reveal Modal */}
      <AgentRevealModal
        agents={generatedAgents}
        open={showAgentReveal}
        onClose={() => setShowAgentReveal(false)}
        onAllRevealed={() => {
          agentRevealResolveRef.current?.();
          agentRevealResolveRef.current = null;
        }}
      />
    </div>
  );
}

// Step-specific visualizers
function StepVisualizer({ stepId, outlines, webSearchSources }: {
  stepId: string;
  outlines?: SceneOutline[] | null;
  webSearchSources?: Array<{ title: string; url: string }>;
}) {
  switch (stepId) {
    case 'pdf-analysis':
      return <PdfScanVisualizer />;
    case 'web-search':
      return <WebSearchVisualizer sources={webSearchSources || []} />;
    case 'outline':
      return <StreamingOutlineVisualizer outlines={outlines || []} />;
    case 'agent-generation':
      return <AgentGenerationVisualizer />;
    case 'slide-content':
      return <ContentVisualizer />;
    case 'actions':
      return <ActionsVisualizer />;
    default:
      return null;
  }
}

// PDF: Document with scanning laser line
function PdfScanVisualizer() {
  return (
    <div className="size-32 relative flex items-center justify-center">
      <motion.div
        className="absolute inset-2 bg-cyan-500/5 rounded-2xl blur-lg"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <div className="w-20 h-28 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl relative overflow-hidden">
        <div className="p-3 space-y-2 mt-1">
          {[80, 60, 90, 45, 70].map((w, i) => (
            <motion.div
              key={i}
              className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded"
              style={{ width: `${w}%` }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
        {/* Scanning laser */}
        <motion.div
          className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_rgba(34,211,238,0.6)]"
          animate={{ top: ['5%', '90%', '5%'] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <motion.div
        className="absolute -top-1 -right-1"
        animate={{ rotate: [0, 10, -10, 0] }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        <ScanLine className="size-6 text-cyan-500/70" />
      </motion.div>
    </div>
  );
}

// Web Search: Miniature search engine results page with animated query + result rows
function WebSearchVisualizer({ sources }: { sources: Array<{ title: string; url: string }> }) {
  const [activeResult, setActiveResult] = useState(0);

  // Cycle through result highlight when we have sources
  useEffect(() => {
    if (sources.length === 0) return;
    const timer = setInterval(() => {
      setActiveResult(prev => (prev + 1) % Math.min(sources.length, 4));
    }, 1400);
    return () => clearInterval(timer);
  }, [sources.length]);

  // Placeholder results for skeleton state
  const skeletonResults = [
    { titleW: 70, urlW: 45, snippetW: [90, 60] },
    { titleW: 55, urlW: 50, snippetW: [80, 75] },
    { titleW: 65, urlW: 40, snippetW: [85, 50] },
    { titleW: 50, urlW: 55, snippetW: [70, 65] },
  ];

  const ROW_H = 38;

  return (
    <div className="size-56 relative flex items-center justify-center">
      {/* Background glow */}
      <motion.div
        className="absolute inset-0 blur-3xl rounded-full bg-teal-500/8"
        animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 3.5, repeat: Infinity }}
      />

      {/* Search results card */}
      <div className="w-44 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden relative">
        {/* Search bar header */}
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
          <Search className="size-3 text-teal-500 shrink-0" />
          <div className="flex-1 h-4 bg-slate-50 dark:bg-slate-700/50 rounded-full overflow-hidden flex items-center px-2">
            <motion.div
              className="h-1.5 bg-teal-500/25 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: '70%' }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Results list */}
        <div className="p-2 space-y-0.5 relative">
          {/* Sliding highlight */}
          {sources.length > 0 && (
            <motion.div
              className="absolute left-2 right-2 rounded-lg bg-teal-500/[0.06] dark:bg-teal-400/[0.08]"
              style={{ height: ROW_H - 6 }}
              animate={{ y: activeResult * ROW_H }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            />
          )}

          {sources.length === 0 ? (
            // Skeleton: pulsing result placeholders
            skeletonResults.map((item, i) => (
              <motion.div
                key={i}
                className="px-2 py-1.5 space-y-1"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }}
              >
                <div className="h-1.5 bg-teal-200/40 dark:bg-teal-800/30 rounded" style={{ width: `${item.titleW}%` }} />
                <div className="h-1 bg-slate-100 dark:bg-slate-700 rounded" style={{ width: `${item.urlW}%` }} />
                <div className="flex gap-1">
                  {item.snippetW.map((w, j) => (
                    <div key={j} className="h-1 bg-slate-100 dark:bg-slate-700 rounded" style={{ width: `${w * 0.5}%` }} />
                  ))}
                </div>
              </motion.div>
            ))
          ) : (
            // Live results
            sources.slice(0, 4).map((source, i) => {
              const isActive = i === activeResult;
              return (
                <motion.div
                  key={source.url}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.25 }}
                  className="relative px-2 py-1.5 space-y-0.5"
                >
                  <div className={cn(
                    "text-[8px] font-semibold truncate transition-colors duration-300 leading-tight",
                    isActive ? "text-teal-600 dark:text-teal-400" : "text-slate-600 dark:text-slate-400"
                  )}>
                    {source.title}
                  </div>
                  <div className="text-[6px] text-teal-500/50 truncate leading-tight">
                    {source.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 32)}
                  </div>
                  <div className="flex gap-1">
                    <div className="h-0.5 flex-1 bg-slate-100 dark:bg-slate-700 rounded-full" />
                    <div className="h-0.5 w-1/3 bg-slate-100 dark:bg-slate-700 rounded-full" />
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Scanning beam */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 dark:via-white/5 to-transparent -skew-x-12 pointer-events-none"
          initial={{ left: '-150%' }}
          animate={{ left: '200%' }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 2, ease: 'linear' }}
        />
      </div>

      {/* Source count badge */}
      {sources.length > 0 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="absolute -top-2 -right-2 h-6 px-2 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg shadow-teal-500/25 z-20 gap-0.5"
        >
          <Globe className="size-2.5" />
          {sources.length}
        </motion.div>
      )}
    </div>
  );
}

// Outline: Streams real outline data as it arrives from SSE
function StreamingOutlineVisualizer({ outlines }: { outlines: SceneOutline[] }) {
  // Build display lines from outlines
  const allLines: string[] = [];
  outlines.forEach((outline, i) => {
    allLines.push(`${i + 1}. ${outline.title}`);
    outline.keyPoints?.slice(0, 2).forEach(kp => {
      const text = kp.length > 18 ? kp.substring(0, 18) + '...' : kp;
      allLines.push(`   • ${text}`);
    });
  });

  return (
    <div className="w-40 h-52 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl p-4 overflow-hidden relative rotate-[-2deg] hover:rotate-0 transition-transform duration-500">
      <div className="absolute top-0 inset-x-0 h-1 bg-blue-500/50" />
      <div className="w-1/3 h-2 bg-slate-100 dark:bg-slate-700 rounded mb-3" />
      <div className="space-y-1.5 font-mono text-[8px] text-muted-foreground leading-tight">
        {allLines.length === 0 ? (
          // Waiting for first outline — show placeholder skeleton
          <div className="space-y-2">
            {[60, 80, 50, 70].map((w, i) => (
              <motion.div
                key={i}
                className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded"
                style={{ width: `${w}%` }}
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        ) : (
          allLines.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                "truncate",
                !line.startsWith("   ")
                  ? "text-blue-600 dark:text-blue-400 font-semibold text-[9px]"
                  : "pl-1 opacity-80"
              )}
            >
              {line}
            </motion.div>
          ))
        )}
      </div>
      <motion.div
        className="absolute bottom-3 right-3 size-2 bg-blue-500 rounded-full"
        animate={{ opacity: [0, 1, 0] }}
        transition={{ repeat: Infinity, duration: 0.8 }}
      />
    </div>
  );
}

// Content: Cycles through distinct representations of Slides, Quiz, PBL, Interactive
function AgentGenerationVisualizer() {
  return (
    <div className="w-60 h-40 mx-auto flex items-center justify-center">
      <div className="flex gap-3">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="w-14 h-20 rounded-lg bg-gradient-to-br from-purple-400 to-blue-500 dark:from-purple-600 dark:to-blue-700 shadow-lg"
            animate={{ y: [0, -8, 0], rotateZ: [0, 3, -3, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3, ease: 'easeInOut' }}
          >
            <div className="w-full h-full flex items-center justify-center text-white/80 text-lg font-bold">?</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ContentVisualizer() {
  const [index, setIndex] = useState(0);

  // 0: Slide (Blue)
  // 1: Quiz (Purple)
  // 2: PBL (Amber)
  // 3: Interactive (Emerald)
  const totalTypes = 4;

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % totalTypes);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  const variants = {
    enter: { x: 50, opacity: 0, scale: 0.9, rotateY: -15 },
    center: { x: 0, opacity: 1, scale: 1, rotateY: 0 },
    exit: { x: -50, opacity: 0, scale: 0.9, rotateY: 15 },
  };

  const getTheme = (idx: number) => {
    switch (idx) {
      case 0: return {
        color: 'blue',
        label: 'SLIDE',
        badge: 'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800'
      };
      case 1: return {
        color: 'purple',
        label: 'QUIZ',
        badge: 'bg-purple-100 text-purple-600 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800'
      };
      case 2: return {
        color: 'amber',
        label: 'PBL',
        badge: 'bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
      };
      case 3: return {
        color: 'emerald',
        label: 'WEB',
        badge: 'bg-emerald-100 text-emerald-600 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
      };
      default: return { color: 'blue', label: '', badge: '' };
    }
  };

  const theme = getTheme(index);

  return (
    <div className="size-56 relative flex items-center justify-center perspective-[800px]">
      {/* Background glow based on current theme */}
      <motion.div
        key={`glow-${index}`}
        className={cn(
          "absolute inset-0 blur-3xl rounded-full transition-colors duration-1000",
          theme.color === 'blue' && "bg-blue-500/10",
          theme.color === 'purple' && "bg-purple-500/10",
          theme.color === 'amber' && "bg-amber-500/10",
          theme.color === 'emerald' && "bg-emerald-500/10"
        )}
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity }}
      />

      {/* Subtle orbiting rings (pushed back, slower) */}
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          className={cn(
             "absolute border rounded-full transition-colors duration-1000",
             theme.color === 'blue' && "border-blue-500/10",
             theme.color === 'purple' && "border-purple-500/10",
             theme.color === 'amber' && "border-amber-500/10",
             theme.color === 'emerald' && "border-emerald-500/10"
          )}
          style={{
            width: 180 + i * 50,
            height: 180 + i * 50,
            borderStyle: "dashed",
          }}
          animate={{ rotate: 360 }}
          transition={{
            duration: 40 + i * 15,
            ease: "linear",
            repeat: Infinity,
            delay: i * -5,
          }}
        />
      ))}

      {/* Main Content Container */}
      <div className="w-40 h-28 relative">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={index}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 80, damping: 16 }}
            className={cn(
              "absolute inset-0 bg-white dark:bg-slate-800 rounded-xl border shadow-xl overflow-hidden flex flex-col p-3 origin-center",
              theme.color === 'blue' && "border-blue-200 dark:border-blue-900/30",
              theme.color === 'purple' && "border-purple-200 dark:border-purple-900/30",
              theme.color === 'amber' && "border-amber-200 dark:border-amber-900/30",
              theme.color === 'emerald' && "border-emerald-200 dark:border-emerald-900/30",
            )}
          >
            {/* Consistent Badge - Now outside content logic */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className={cn(
                "absolute top-1.5 right-1.5 z-20 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border backdrop-blur-md shadow-sm",
                theme.badge
              )}
            >
              {theme.label}
            </motion.div>

            {/* --- SLIDE TYPE --- */}
            {index === 0 && (
              <div className="flex flex-col h-full pt-1">
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: "55%" }}
                  transition={{ delay: 0.2 }}
                  className="h-2 bg-blue-500/20 rounded-full mb-3 shrink-0"
                />
                <div className="flex gap-2 flex-1">
                   <div className="flex-1 space-y-2">
                      {[0.8, 0.9, 0.6, 0.7].map((w, i) => (
                        <motion.div
                          key={i}
                          initial={{ width: 0 }}
                          animate={{ width: `${w * 100}%` }}
                          transition={{ delay: 0.3 + i * 0.1 }}
                          className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full"
                        />
                      ))}
                   </div>
                   <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center shrink-0"
                   >
                      <BarChart3 className="size-6 text-blue-500/60" />
                   </motion.div>
                </div>
              </div>
            )}

            {/* --- QUIZ TYPE --- */}
            {index === 1 && (
              <div className="flex flex-col h-full justify-center space-y-2 pt-2">
                 <motion.div
                    initial={{ y: -5, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex justify-center mb-1"
                 >
                    <div className="h-2 w-3/4 bg-purple-500/20 rounded-full" />
                 </motion.div>

                 <div className="grid grid-cols-2 gap-2">
                    {[0, 1, 2, 3].map((i) => (
                       <motion.div
                          key={i}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.3 + i * 0.1 }}
                          className={cn(
                            "h-6 rounded border flex items-center px-2",
                            i === 1 ? "bg-purple-500 text-white border-purple-500" : "bg-slate-50 dark:bg-slate-700/50 border-slate-100 dark:border-slate-700"
                          )}
                       >
                          <div className={cn("size-1.5 rounded-full mr-2", i === 1 ? "bg-white" : "bg-slate-300")} />
                          <div className={cn("h-1 w-8 rounded-full", i === 1 ? "bg-white/50" : "bg-slate-200 dark:bg-slate-600")} />
                       </motion.div>
                    ))}
                 </div>
              </div>
            )}

            {/* --- PBL TYPE --- */}
            {index === 2 && (
              <div className="flex flex-col h-full pt-1">
                 <div className="flex items-center gap-2 mb-2">
                    <Puzzle className="size-3 text-amber-500 shrink-0" />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "40%" }}
                      className="h-2 bg-amber-500/20 rounded-full"
                    />
                 </div>
                 <div className="flex-1 flex gap-2 overflow-hidden">
                    {[0, 1, 2].map((col) => (
                       <motion.div
                          key={col}
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.2 + col * 0.15 }}
                          className="flex-1 bg-slate-50 dark:bg-slate-700/30 rounded flex flex-col gap-1 p-1"
                       >
                          <div className="h-1 w-6 bg-slate-200 dark:bg-slate-600 rounded mb-1" />
                          {[0, 1].map((card) => (
                             <div key={card} className="h-3 w-full bg-white dark:bg-slate-600 rounded border border-slate-100 dark:border-slate-500 shadow-sm" />
                          ))}
                       </motion.div>
                    ))}
                 </div>
              </div>
            )}

            {/* --- INTERACTIVE TYPE --- */}
            {index === 3 && (
              <div className="flex flex-col h-full relative pt-1">
                 {/* Browser Chrome - Padded right to avoid badge */}
                 <div className="flex items-center gap-1 mb-2 border-b border-slate-100 dark:border-slate-700 pb-1 pr-10">
                    <div className="flex gap-0.5">
                       <div className="size-1.5 rounded-full bg-red-400" />
                       <div className="size-1.5 rounded-full bg-amber-400" />
                       <div className="size-1.5 rounded-full bg-green-400" />
                    </div>
                    <div className="h-1.5 flex-1 bg-slate-100 dark:bg-slate-700 rounded-full ml-1" />
                 </div>

                 <div className="flex-1 flex gap-2 relative">
                    <motion.div
                       initial={{ opacity: 0 }}
                       animate={{ opacity: 1 }}
                       transition={{ delay: 0.3 }}
                       className="w-1/3 bg-slate-50 dark:bg-slate-700/30 rounded p-1 space-y-1"
                    >
                       {[1,2,3].map(i => <div key={i} className="h-1 w-full bg-slate-200 dark:bg-slate-600 rounded-full" />)}
                    </motion.div>
                    <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/10 rounded border border-emerald-100 dark:border-emerald-900/30 relative overflow-hidden flex items-center justify-center">
                       <Globe className="size-8 text-emerald-200 dark:text-emerald-800" />
                       <motion.div
                          className="absolute"
                          animate={{ x: [20, -10, 15, 0], y: [10, -15, 5, 0] }}
                          transition={{ duration: 3, ease: "easeInOut" }}
                       >
                          <MousePointer2 className="size-3 text-emerald-600 fill-emerald-600" />
                       </motion.div>
                    </div>
                 </div>
              </div>
            )}

            {/* Scanning beam (shared) */}
            <motion.div
               className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 dark:via-white/10 to-transparent -skew-x-12 pointer-events-none"
               initial={{ left: "-150%" }}
               animate={{ left: "200%" }}
               transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1, ease: "linear" }}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// Actions: Timeline of speech, spotlight, and interactions being orchestrated
function ActionsVisualizer() {
  const [activeIdx, setActiveIdx] = useState(0);

  const actionItems = [
    { icon: MessageSquare, label: 'Speech', color: 'text-violet-500', activeBg: 'bg-violet-500/10', activeBorder: 'border-violet-200 dark:border-violet-800' },
    { icon: Focus, label: 'Spotlight', color: 'text-amber-500', activeBg: 'bg-amber-500/10', activeBorder: 'border-amber-200 dark:border-amber-800' },
    { icon: MessageSquare, label: 'Speech', color: 'text-violet-500', activeBg: 'bg-violet-500/10', activeBorder: 'border-violet-200 dark:border-violet-800' },
    { icon: Play, label: 'Interact', color: 'text-emerald-500', activeBg: 'bg-emerald-500/10', activeBorder: 'border-emerald-200 dark:border-emerald-800' },
    { icon: MessageSquare, label: 'Speech', color: 'text-violet-500', activeBg: 'bg-violet-500/10', activeBorder: 'border-violet-200 dark:border-violet-800' },
  ];

  // Row height (py-1.5 = 6px×2 padding + icon ~16px) + gap 6px ≈ 34px per row
  const ROW_H = 34;

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx(prev => (prev + 1) % actionItems.length);
    }, 1600);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="size-56 relative flex items-center justify-center">
      {/* Background pulse */}
      <motion.div
        className="absolute inset-0 blur-3xl rounded-full bg-violet-500/8"
        animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 3.5, repeat: Infinity }}
      />

      {/* Timeline card */}
      <div className="w-44 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden relative">
        {/* Header */}
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
          <Clapperboard className="size-3 text-violet-500" />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '50%' }}
            transition={{ delay: 0.2 }}
            className="h-1.5 bg-violet-500/20 rounded-full"
          />
        </div>

        {/* Action items */}
        <div className="p-2 space-y-1.5 relative">
          {/* Sliding highlight — absolute, animates via y transform, no layout impact */}
          <motion.div
            className="absolute left-2 right-2 rounded-lg bg-violet-500/[0.06] dark:bg-violet-400/[0.08]"
            style={{ height: ROW_H - 6 }}
            animate={{ y: activeIdx * ROW_H }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          />

          {actionItems.map((item, i) => {
            const Icon = item.icon;
            const isActive = i === activeIdx;
            const isPast = i < activeIdx;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: isPast ? 0.4 : 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.3 }}
                className="relative flex items-center gap-2 px-2 py-1.5 rounded-lg"
              >
                <div className={cn(
                  "size-4 rounded flex items-center justify-center shrink-0 transition-colors duration-300",
                  isActive ? item.color : "text-slate-300 dark:text-slate-600"
                )}>
                  <Icon className="size-3" />
                </div>
                <div className="flex-1 flex items-center gap-1.5">
                  <span className={cn(
                    "text-[8px] font-semibold uppercase tracking-wider transition-colors duration-300",
                    isActive ? item.color : "text-slate-400 dark:text-slate-500"
                  )}>
                    {item.label}
                  </span>
                  <div className={cn(
                    "h-1 flex-1 rounded-full transition-colors duration-300",
                    isActive ? "bg-current opacity-20" : "bg-slate-100 dark:bg-slate-700"
                  )} />
                </div>
                {/* Pulsing dot — always rendered, opacity-controlled, no layout shift */}
                <motion.div
                  className="size-1.5 rounded-full bg-violet-500"
                  animate={{ opacity: isActive ? [1, 0.3, 1] : 0 }}
                  transition={isActive ? { duration: 0.8, repeat: Infinity } : { duration: 0.2 }}
                />
              </motion.div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

export default function GenerationPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
          <div className="animate-pulse space-y-4 text-center">
            <div className="h-8 w-48 bg-muted rounded mx-auto" />
            <div className="h-4 w-64 bg-muted rounded mx-auto" />
          </div>
        </div>
      }
    >
      <GenerationPreviewContent />
    </Suspense>
  );
}
