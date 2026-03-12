/**
 * Single-Scene Generation API (JSON)
 *
 * Generates one scene at a time from a given outline.
 * No streaming, no TTS — just scene content generation.
 * The client calls this once per scene and handles orchestration.
 */

import { NextRequest } from 'next/server';
import { getModel, parseModelString } from '@/lib/ai/providers';
import { resolveApiKey, resolveBaseUrl, resolveProxy } from '@/lib/server/provider-config';
import { callLLM } from '@/lib/ai/llm';
import {
  buildSceneFromOutline,
  buildVisionUserContent,
  type SceneGenerationContext,
  type AgentInfo,
} from '@/lib/generation/generation-pipeline';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import type { SpeechAction } from '@/lib/types/action';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('Scene API');

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      outline,
      allOutlines,
      pdfImages,
      imageMapping,
      stageInfo,
      stageId,
      agents,
      previousSpeeches: incomingPreviousSpeeches,
      userProfile,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      stageInfo: {
        name: string;
        description?: string;
        language?: string;
        style?: string;
      };
      stageId: string;
      agents?: AgentInfo[];
      previousSpeeches?: string[];
      userProfile?: string;
    };

    // Validate required fields
    if (!outline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'allOutlines is required and must not be empty');
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }

    // Ensure outline has language from stageInfo (fallback for older outlines)
    if (!outline.language) {
      outline.language = (stageInfo?.language as 'zh-CN' | 'en-US') || 'zh-CN';
    }

    // ── Model resolution from request headers ──
    const modelString = req.headers.get('x-model') || 'gpt-4o-mini';
    const clientApiKey = req.headers.get('x-api-key') || '';
    const clientBaseUrl = req.headers.get('x-base-url') || undefined;
    const providerType = req.headers.get('x-provider-type') || undefined;
    const requiresApiKey = req.headers.get('x-requires-api-key') === 'true';

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

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;

    // Vision-aware AI call function for the pipeline
    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      if (images?.length && hasVision) {
        // Multimodal: use messages format with image content parts
        const result = await callLLM(
          {
            model: languageModel,
            system: systemPrompt,
            messages: [
              { role: 'user' as const, content: buildVisionUserContent(userPrompt, images) },
            ],
            maxOutputTokens: modelInfo?.outputWindow,
          },
          'scene',
        );
        return result.text;
      }
      // Text-only fallback
      const result = await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: modelInfo?.outputWindow,
        },
        'scene',
      );
      return result.text;
    };

    // ── Build cross-scene context ──
    const allTitles = allOutlines.map((o) => o.title);
    const pageIndex = allOutlines.findIndex((o) => o.id === outline.id);
    const ctx: SceneGenerationContext = {
      pageIndex: (pageIndex >= 0 ? pageIndex : 0) + 1,
      totalPages: allOutlines.length,
      allTitles,
      previousSpeeches: incomingPreviousSpeeches ?? [],
    };

    // ── Filter images assigned to this outline ──
    let assignedImages: PdfImage[] | undefined;
    if (
      pdfImages &&
      pdfImages.length > 0 &&
      outline.suggestedImageIds &&
      outline.suggestedImageIds.length > 0
    ) {
      const suggestedIds = new Set(outline.suggestedImageIds);
      assignedImages = pdfImages.filter((img) => suggestedIds.has(img.id));
    }

    // ── Generate the scene ──
    log.info(`Generating scene: "${outline.title}" (${outline.type}) [model=${modelString}]`);

    const scene = await buildSceneFromOutline(
      outline,
      aiCall,
      stageId,
      assignedImages,
      imageMapping,
      outline.type === 'pbl' ? languageModel : undefined,
      hasVision,
      ctx,
      agents,
      undefined, // onPhaseChange — not needed for non-streaming
      userProfile,
    );

    if (!scene) {
      log.error(`Failed to generate scene: "${outline.title}"`);

      return apiError('GENERATION_FAILED', 500, `Failed to generate scene: ${outline.title}`);
    }

    // ── Extract speeches for cross-scene coherence ──
    const outputPreviousSpeeches = (scene.actions || [])
      .filter((a): a is SpeechAction => a.type === 'speech')
      .map((a) => a.text);

    log.info(
      `Scene generated successfully: "${outline.title}" — ${scene.actions?.length ?? 0} actions`,
    );

    return apiSuccess({ scene, previousSpeeches: outputPreviousSpeeches });
  } catch (error) {
    log.error('Scene generation error:', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
