/**
 * Fetches a URL with timeout support using AbortController.
 * Shared utility for all HTTP adapters to avoid code duplication.
 *
 * @param url - Full URL to fetch
 * @param options - Fetch options (method, headers, body, etc.)
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise<Response> that resolves when fetch completes or rejects on timeout
 * @throws Error with name 'AbortError' if timeout occurs
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
