import type { ContextBlock } from '../../../domain/context-block';
import { fetchWithTimeout } from '../shared';
import { OpenAiHttpError } from './errors';
import type { OpenAiResponse } from './types';
import { buildPrompt } from './prompt-builder';

export async function requestOpenAi(
  apiKey: string,
  model: string,
  timeoutMs: number,
  systemPrompt: string,
  input: {
    userText: string;
    intent: string;
    history: Array<{ sender: string; content: string; createdAt: string }>;
    contextBlocks: ContextBlock[];
  },
): Promise<string> {
  const prompt = buildPrompt(
    systemPrompt,
    input.userText,
    input.intent,
    input.history,
    input.contextBlocks,
  );

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: prompt,
        temperature: 0.2,
        max_output_tokens: 220,
      }),
    },
    timeoutMs,
  );

  if (!response.ok) {
    throw new OpenAiHttpError(response.status);
  }

  const parsed = (await response.json()) as OpenAiResponse;

  const text =
    parsed.output_text ??
    parsed.output?.[0]?.content?.find((c) => typeof c.text === 'string')?.text;

  if (!text || text.trim().length === 0) {
    throw new Error('OpenAI response missing text');
  }

  return text.trim();
}
