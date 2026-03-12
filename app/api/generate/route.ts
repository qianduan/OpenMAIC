/**
 * Generation API Route
 *
 * Triggers the three-stage generation pipeline
 */

import { getModel, parseModelString } from '@/lib/ai/providers';
import { resolveApiKey, resolveBaseUrl, resolveProxy } from '@/lib/server/provider-config';
import { callLLM } from '@/lib/ai/llm';
import {
  runGenerationPipeline,
  createGenerationSession,
  type GenerationCallbacks,
} from '@/lib/generation/generation-pipeline';
import type { UserRequirements } from '@/lib/types/generation';
import type { Stage, Scene } from '@/lib/types/stage';
import { createLogger } from '@/lib/logger'
import { apiError, apiSuccess } from '@/lib/server/api-response'
const log = createLogger('Generate')


// Create a mock store adapter for server-side generation
function createMockStore(initialStage: Stage, initialScenes: Scene[]) {
  let state: {
    stage: Stage | null;
    scenes: Scene[];
    currentSceneId: string | null;
    mode: 'autonomous' | 'playback';
  } = {
    stage: initialStage,
    scenes: initialScenes,
    currentSceneId: initialScenes[0]?.id || null,
    mode: 'autonomous',
  };

  return {
    getState: () => state,
    setState: (newState: Partial<typeof state>) => {
      state = { ...state, ...newState };
    },
    subscribe: () => () => {},
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { requirements, stage, scenes } = body as {
      requirements: UserRequirements;
      stage: Stage;
      scenes: Scene[];
    };

    // Get API configuration from request headers
    const modelString = req.headers.get('x-model') || 'gpt-4o-mini';
    const clientApiKey = req.headers.get('x-api-key') || '';
    const clientBaseUrl = req.headers.get('x-base-url') || undefined;
    const providerType = req.headers.get('x-provider-type') || undefined;
    const requiresApiKey = req.headers.get('x-requires-api-key') === 'true';

    // Parse model string and get configured model instance
    const { providerId, modelId } = parseModelString(modelString);
    const apiKey = resolveApiKey(providerId, clientApiKey);
    const baseUrl = resolveBaseUrl(providerId, clientBaseUrl);
    const proxy = resolveProxy(providerId);
    const { model: languageModel, modelInfo } = getModel({
      providerId,
      modelId,
      apiKey,
      baseUrl,
      proxy,
      providerType: providerType as 'openai' | 'anthropic' | 'google' | undefined,
      requiresApiKey,
    });

    // AI call function for the pipeline
    const aiCall = async (systemPrompt: string, userPrompt: string): Promise<string> => {
      const result = await callLLM({
        model: languageModel,
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens: modelInfo?.outputWindow,
      }, 'generate-pipeline');
      return result.text;
    };

    // Create mock store
    const mockStore = createMockStore(stage, scenes);

    // Create session
    const session = createGenerationSession(requirements);

    // Track progress
    const progressLog: string[] = [];
    const callbacks: GenerationCallbacks = {
      onProgress: (progress) => {
        progressLog.push(`[Stage ${progress.currentStage}] ${progress.statusMessage} (${progress.overallProgress}%)`);
      },
      onStageComplete: (stageNum, _result) => {
        progressLog.push(`Stage ${stageNum} completed`);
      },
      onError: (error) => {
        progressLog.push(`Error: ${error}`);
      },
    };

    // Run pipeline
    const result = await runGenerationPipeline(session, mockStore, aiCall, callbacks);

    if (!result.success) {
      return apiError('GENERATION_FAILED', 500, result.error || 'Generation failed', JSON.stringify(progressLog));
    }

    // Return generated scenes
    return apiSuccess({ data: { session: result.data, scenes: mockStore.getState().scenes, progressLog } });
  } catch (error) {
    log.error('Generation error:', error);
    return apiError('INTERNAL_ERROR', 500, String(error));
  }
}
