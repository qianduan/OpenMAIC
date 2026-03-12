/**
 * Scene Outlines Generation API
 *
 * Generates scene outlines directly from user requirements.
 */

import { NextRequest } from 'next/server';
import { generateText } from 'ai';
import { getModel, parseModelString } from '@/lib/ai/providers';
import { resolveApiKey, resolveBaseUrl, resolveProxy } from '@/lib/server/provider-config';
import { generateSceneOutlinesFromRequirements } from '@/lib/generation/generation-pipeline';
import type { UserRequirements, PdfImage } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger'
import { apiError, apiSuccess } from '@/lib/server/api-response'
const log = createLogger('Outlines')


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Get API configuration from request headers
    const modelString = req.headers.get('x-model') || 'gpt-4o-mini';
    const clientApiKey = req.headers.get('x-api-key') || '';
    const clientBaseUrl = req.headers.get('x-base-url') || undefined;
    const providerType = req.headers.get('x-provider-type') || undefined;
    const requiresApiKey = req.headers.get('x-requires-api-key') === 'true';

    // Parse model string and resolve server-side fallback
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
      const result = await generateText({
        model: languageModel,
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens: modelInfo?.outputWindow,
      });
      return result.text;
    };

    // Validate request body
    if (!body.requirements) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Requirements are required');
    }

    const { requirements, pdfText, pdfImages } = body as {
      requirements: UserRequirements;
      pdfText?: string;
      pdfImages?: PdfImage[];
    };

    const imageGenerationEnabled = req.headers.get('x-image-generation-enabled') === 'true';
    const videoGenerationEnabled = req.headers.get('x-video-generation-enabled') === 'true';

    const result = await generateSceneOutlinesFromRequirements(requirements, pdfText, pdfImages, aiCall, undefined, {
      imageGenerationEnabled,
      videoGenerationEnabled,
    });

    if (!result.success) {
      return apiError('GENERATION_FAILED', 500, result.error || 'Failed to generate scene outlines');
    }

    return apiSuccess({ outlines: result.data });
  } catch (error) {
    log.error('Generation error:', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
