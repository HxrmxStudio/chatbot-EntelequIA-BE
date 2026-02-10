/**
 * OpenAI API endpoints.
 * Centralized endpoint definitions for better maintainability.
 */

export const OPENAI_API_BASE_URL = 'https://api.openai.com';
export const OPENAI_RESPONSES_ENDPOINT = '/v1/responses';

export function openaiResponsesUrl(): string {
  return `${OPENAI_API_BASE_URL}${OPENAI_RESPONSES_ENDPOINT}`;
}
