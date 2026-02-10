import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads a prompt file from the filesystem with fallback to default content.
 * Used by OpenAI and Intent Extractor adapters.
 *
 * @param relativePath - Path relative to process.cwd() (e.g., 'prompts/assistant.txt')
 * @param defaultContent - Fallback content if file cannot be loaded
 * @returns The file content or defaultContent
 */
export function loadPromptFile(relativePath: string, defaultContent: string): string {
  const promptPath = resolve(process.cwd(), relativePath);

  try {
    const value = readFileSync(promptPath, 'utf8').trim();
    if (value.length === 0) {
      return defaultContent;
    }

    return value;
  } catch {
    return defaultContent;
  }
}
