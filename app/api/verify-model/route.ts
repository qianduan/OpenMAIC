import { NextRequest } from 'next/server';
import { getModel, parseModelString } from '@/lib/ai/providers';
import { resolveApiKey, resolveBaseUrl, resolveProxy } from '@/lib/server/provider-config';
import { generateText } from 'ai';
import { createLogger } from '@/lib/logger'
import { apiError, apiSuccess } from '@/lib/server/api-response';
const log = createLogger('Verify Model')


export async function POST(req: NextRequest) {
  try {
    const { apiKey, baseUrl, model, providerType, requiresApiKey } = await req.json();

    if (!model) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Model name is required');
    }

    // Parse model string and resolve server-side fallback
    const { providerId, modelId } = parseModelString(model);
    const effectiveApiKey = resolveApiKey(providerId, apiKey);
    const effectiveBaseUrl = resolveBaseUrl(providerId, baseUrl);
    const proxy = resolveProxy(providerId);
    let languageModel;
    try {
      const result = getModel({
        providerId,
        modelId,
        apiKey: effectiveApiKey || "",
        baseUrl: effectiveBaseUrl || undefined,
        proxy,
        providerType: providerType as "openai" | "anthropic" | "google" | undefined,
        requiresApiKey,
      });
      languageModel = result.model;
    } catch (error) {
      return apiError('INVALID_REQUEST', 401, error instanceof Error ? error.message : String(error));
    }

    // Send a minimal test message
    const { text } = await generateText({
      model: languageModel,
      prompt: 'Say "OK" if you can hear me.',
    });

    return apiSuccess({
      message: 'Connection successful',
      response: text,
    });
  } catch (error) {
    log.error('API test error:', error);

    let errorMessage = 'Connection failed';
    if (error instanceof Error) {
      // Parse common error messages
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorMessage = 'API key is invalid or expired';
      } else if (error.message.includes('404') || error.message.includes('not found')) {
        errorMessage = 'Model not found or API endpoint error';
      } else if (error.message.includes('429')) {
        errorMessage = 'API rate limit exceeded, please try again later';
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Cannot connect to API server, please check the Base URL';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Connection timed out, please check your network';
      } else {
        errorMessage = error.message;
      }
    }

    return apiError('INTERNAL_ERROR', 500, errorMessage);
  }
}
