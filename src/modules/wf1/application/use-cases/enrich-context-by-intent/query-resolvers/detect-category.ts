import type { DetectedProductCategory } from './types';
import {
  COMIC_CATEGORY_PATTERN,
  GAMES_CATEGORY_PATTERN,
  MANGA_CATEGORY_PATTERN,
  MERCH_CATEGORY_PATTERN,
  TAROT_CATEGORY_PATTERN,
} from './patterns';
import { normalizeForToken } from './normalize';

/**
 * Detects product category from user text (juego, merch, tarot, manga, comic).
 * @param text - Raw user input or sentence
 * @returns Detected category or null if none matches
 */
export function detectProductCategory(text: string): DetectedProductCategory | null {
  const normalized = normalizeForToken(text);

  if (GAMES_CATEGORY_PATTERN.test(normalized)) return 'juego';
  if (MERCH_CATEGORY_PATTERN.test(normalized)) return 'merch';
  if (TAROT_CATEGORY_PATTERN.test(normalized)) return 'tarot';
  if (MANGA_CATEGORY_PATTERN.test(normalized) && !normalized.includes('comic')) return 'manga';
  if (COMIC_CATEGORY_PATTERN.test(normalized)) return 'comic';

  return null;
}
