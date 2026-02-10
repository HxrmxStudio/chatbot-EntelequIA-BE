import { IntentValidationError } from '../intent-validator';
import { fetchWithTimeout } from '../shared';
import {
  INTENT_MAX_OUTPUT_TOKENS,
  INTENT_MODEL,
  INTENT_TEMPERATURE,
  INTENT_VERBOSITY,
  SCHEMA_NAME,
} from './constants';
import { openaiResponsesUrl } from './endpoints';
import { IntentExtractorHttpError, IntentExtractorNetworkError } from './errors';
import type { OpenAiResponse } from './types';

export async function requestIntent(input: {
  apiKey: string;
  text: string;
  timeoutMs: number;
  systemPrompt: string;
  schema: Record<string, unknown>;
}): Promise<OpenAiResponse> {
  try {
    const response = await fetchWithTimeout(
      openaiResponsesUrl(),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify({
          model: INTENT_MODEL,
          temperature: INTENT_TEMPERATURE,
          max_output_tokens: INTENT_MAX_OUTPUT_TOKENS,
          input: [
            {
              role: 'system',
              content: [{ type: 'input_text', text: input.systemPrompt }],
            },
            {
              role: 'user',
              content: [{ type: 'input_text', text: input.text }],
            },
          ],
          text: {
            verbosity: INTENT_VERBOSITY,
            format: {
              type: 'json_schema',
              name: SCHEMA_NAME,
              schema: input.schema,
              strict: false,
            },
          },
        }),
      },
      input.timeoutMs,
    );

    const responseText = await response.text();
    if (!response.ok) {
      throw new IntentExtractorHttpError(response.status, responseText);
    }

    try {
      return JSON.parse(responseText) as OpenAiResponse;
    } catch {
      throw new IntentValidationError('OpenAI response is not valid JSON');
    }
  } catch (error: unknown) {
    if (error instanceof IntentExtractorHttpError || error instanceof IntentValidationError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new IntentExtractorNetworkError('timeout');
    }

    throw new IntentExtractorNetworkError('network');
  }
}
