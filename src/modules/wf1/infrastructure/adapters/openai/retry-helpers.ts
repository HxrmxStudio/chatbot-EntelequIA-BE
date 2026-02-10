import { OpenAiHttpError } from './errors';

export function isRetryableHttpStatus(err: unknown): boolean {
  if (err instanceof OpenAiHttpError) {
    return [429, 500, 502, 503, 504].includes(err.status);
  }
  return false;
}

export function isTimeoutOrNetwork(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.message?.includes('fetch'));
}
