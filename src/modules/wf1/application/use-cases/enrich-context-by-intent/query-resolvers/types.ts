/**
 * Product category detected from user text. These are "core buckets" aligned with
 * Entelequia's category tree (slugs) and can be used to narrow product searches.
 */
export type DetectedProductCategory =
  | 'manga'
  | 'comic'
  | 'libro'
  | 'tarot'
  | 'juego_mesa'
  | 'juego_tcg'
  | 'juego_rol'
  | 'merch_figuras'
  | 'merch_ropa'
  | 'juego'
  | 'merch';

/**
 * Result of resolving a products query: product name, category, cleaned entities, and hint flags.
 */
export interface ResolvedProductsQuery {
  productName: string;
  category: DetectedProductCategory | null;
  /**
   * Entelequia category slug that best matches the detected category, when available.
   * Used as path param for `/products-list/{categorySlug}`.
   */
  categorySlug: string | undefined;
  originalEntities: string[];
  cleanedEntities: string[];
  hasVolumeHint: boolean;
  hasFormatHint: boolean;
  hasLanguageHint: boolean;
  hasOfferHint: boolean;
}
