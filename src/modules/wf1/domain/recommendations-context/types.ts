import type { Money } from '../money';

export type RecommendationTypeKey =
  | 'mangas'
  | 'comics'
  | 'libros'
  | 'tarot_y_magia'
  | 'juego_tcg_magic'
  | 'juego_tcg_yugioh'
  | 'juego_tcg_pokemon'
  | 'juego_tcg_digimon'
  | 'juego_tcg_accesorios'
  | 'juego_tcg_generico'
  | 'juego_mesa'
  | 'juego_rol'
  | 'juego_lego'
  | 'juego'
  | 'merch_funko'
  | 'merch_peluches'
  | 'merch_ropa_remeras'
  | 'merch_ropa_buzos'
  | 'merch_ropa_gorras'
  | 'merch_ropa_cosplay'
  | 'merch_ropa_pantuflas'
  | 'merch_ropa_medias'
  | 'merch_ropa_bufandas'
  | 'merch_ropa_generico'
  | 'merch_figuras'
  | 'merch_otros'
  | 'merch';

export interface RecommendationPreferences {
  franchiseKeywords: string[];
  genre: string[];
  type: string[];
  age: number | null;
  /** True when user asks for cheap/affordable options (e.g. "algo barato", "económico"). */
  prefersLowPrice?: boolean;
}

export interface RecommendationItem {
  id: string | number;
  slug: string;
  title: string;
  stock: number;
  categoryName?: string;
  categorySlug?: string;
  categoryNames: string[];
  categorySlugs: string[];
  price?: Money;
  priceWithDiscount?: Money | null;
  discountPercent?: number | null;
  url?: string;
  imageUrl?: string;
}

export interface RecommendationsTemplates {
  header: string;
  whyThese: string;
  instructions: string;
  emptyMessage: string;
}

export interface RecommendationsAiContext {
  contextText: string;
  recommendationsCount: number;
  totalRecommendations: number;
  preferences: RecommendationPreferences;
  apiFallback: boolean;
  isEmpty: boolean;
}
