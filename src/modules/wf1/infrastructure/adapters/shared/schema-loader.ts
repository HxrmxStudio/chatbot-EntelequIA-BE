import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads a JSON file from the filesystem with fallback to default value.
 * Used by Intent Extractor adapter to load JSON schemas.
 *
 * @param relativePath - Path relative to process.cwd() (e.g., 'schemas/intent.json')
 * @param defaultValue - Fallback value if file cannot be loaded or parsed
 * @returns The parsed JSON object or defaultValue
 */
export function loadJsonFile<T>(relativePath: string, defaultValue: T): T {
  const schemaPath = resolve(process.cwd(), relativePath);

  try {
    const parsed = JSON.parse(readFileSync(schemaPath, 'utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return defaultValue;
    }

    return parsed as T;
  } catch {
    return defaultValue;
  }
}
