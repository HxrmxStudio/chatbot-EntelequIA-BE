import { IntentValidationError } from '../intent-validator';
import { IntentExtractorHttpError, IntentExtractorNetworkError } from './errors';
import type { OpenAiResponse } from './types';

export function resolveModelPayload(response: OpenAiResponse): unknown {
  if (response.output_text && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  for (const outputItem of response.output ?? []) {
    for (const content of outputItem.content ?? []) {
      if (content && typeof content === 'object') {
        if (content.json !== undefined) {
          return content.json;
        }

        if (typeof content.text === 'string' && content.text.trim().length > 0) {
          return content.text;
        }
      }
    }
  }

  throw new IntentValidationError('OpenAI response did not contain output payload');
}

export function shouldRetry(error: unknown): boolean {
  if (error instanceof IntentValidationError) {
    return true;
  }

  if (error instanceof IntentExtractorNetworkError) {
    return true;
  }

  if (error instanceof IntentExtractorHttpError) {
    return [429, 500, 502, 503, 504].includes(error.statusCode);
  }

  return true;
}

export function classifyFailure(error: unknown): string {
  if (error instanceof IntentValidationError) {
    return error.message;
  }

  if (error instanceof IntentExtractorNetworkError) {
    return error.code;
  }

  if (error instanceof IntentExtractorHttpError) {
    return `http_${error.statusCode}`;
  }

  return 'unknown_error';
}
