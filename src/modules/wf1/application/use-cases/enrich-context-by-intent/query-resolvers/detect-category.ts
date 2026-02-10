import type { DetectedProductCategory } from './types';
import {
  BOOK_CATEGORY_PATTERN,
  COMIC_CATEGORY_PATTERN,
  GAMES_BOARD_CATEGORY_PATTERN,
  GAMES_GENERIC_CATEGORY_PATTERN,
  GAMES_RPG_CATEGORY_PATTERN,
  GAMES_TCG_CATEGORY_PATTERN,
  MANGA_CATEGORY_PATTERN,
  MERCH_CLOTHING_CATEGORY_PATTERN,
  MERCH_FIGURES_CATEGORY_PATTERN,
  MERCH_GENERIC_CATEGORY_PATTERN,
  TAROT_CATEGORY_PATTERN,
} from './patterns';
import { normalizeForToken } from './normalize';

/**
 * Detects product category from user text using a small set of deterministic heuristics.
 * Categories are aligned with Entelequia's product tree to enable better filtering.
 * Evaluation order: merch (clothing, figures) is checked before games so that ambiguous
 * phrases like "gorras de Pokemon" resolve to merch_ropa rather than juego_tcg.
 *
 * @param text - Raw user input or sentence
 * @returns Detected category or null if none matches
 */
export function detectProductCategory(text: string): DetectedProductCategory | null {
  const normalized = normalizeForToken(text);

  // Merch buckets should win when the user is explicitly asking for apparel/figures,
  // even if the text also contains a game brand keyword (e.g. "gorras de Pokemon").
  if (MERCH_CLOTHING_CATEGORY_PATTERN.test(normalized)) return 'merch_ropa';
  if (MERCH_FIGURES_CATEGORY_PATTERN.test(normalized)) return 'merch_figuras';

  if (TAROT_CATEGORY_PATTERN.test(normalized)) return 'tarot';
  if (MANGA_CATEGORY_PATTERN.test(normalized) && !normalized.includes('comic')) return 'manga';
  if (COMIC_CATEGORY_PATTERN.test(normalized)) return 'comic';
  if (BOOK_CATEGORY_PATTERN.test(normalized)) return 'libro';

  if (GAMES_TCG_CATEGORY_PATTERN.test(normalized)) return 'juego_tcg';
  if (GAMES_RPG_CATEGORY_PATTERN.test(normalized)) return 'juego_rol';
  if (GAMES_BOARD_CATEGORY_PATTERN.test(normalized)) return 'juego_mesa';
  if (GAMES_GENERIC_CATEGORY_PATTERN.test(normalized)) return 'juego';
  if (MERCH_GENERIC_CATEGORY_PATTERN.test(normalized)) return 'merch';

  return null;
}
