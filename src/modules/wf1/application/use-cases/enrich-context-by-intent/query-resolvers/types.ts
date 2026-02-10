/**
 * Product category detected from user text (juegos, merchandising, tarot, manga, comic).
 */
export type DetectedProductCategory = 'juego' | 'merch' | 'tarot' | 'manga' | 'comic';

/**
 * Result of resolving a products query: product name, category, cleaned entities, and hint flags.
 */
export interface ResolvedProductsQuery {
  productName: string;
  category: DetectedProductCategory | null;
  originalEntities: string[];
  cleanedEntities: string[];
  hasVolumeHint: boolean;
  hasFormatHint: boolean;
  hasLanguageHint: boolean;
  hasOfferHint: boolean;
}
