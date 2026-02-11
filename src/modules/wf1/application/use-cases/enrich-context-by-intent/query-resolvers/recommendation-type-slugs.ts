import {
  normalizeRecommendationType,
  type RecommendationTypeKey,
} from '@/modules/wf1/domain/recommendations-context';
import {
  SLUG_BUZOS,
  SLUG_COMICS,
  SLUG_DIGIMON,
  SLUG_FUNKO_POPS,
  SLUG_JUEGOS,
  SLUG_JUEGOS_JUEGOS_DE_MESA,
  SLUG_JUEGOS_JUEGOS_DE_ROL,
  SLUG_LEGO,
  SLUG_LIBROS,
  SLUG_MANGAS,
  SLUG_MERCHANDISING,
  SLUG_MERCHANDISING_FIGURAS,
  SLUG_MERCHANDISING_PELUCHES,
  SLUG_MERCHANDISING_ROPA,
  SLUG_ROPA_BUFANDAS,
  SLUG_ROPA_COSPLAY,
  SLUG_ROPA_GORRAS,
  SLUG_ROPA_MEDIAS,
  SLUG_ROPA_PANTUFLAS,
  SLUG_ROPA_REMERAS,
  SLUG_TAROT_Y_MAGIA,
  SLUG_TCG_ACCESORIOS,
  SLUG_TCG_GENERIC,
  SLUG_TCG_MAGIC,
  SLUG_TCG_POKEMON,
  SLUG_TCG_YUGIOH,
} from './category-slugs';

const RECOMMENDATION_TYPE_TO_SLUG: Readonly<Record<RecommendationTypeKey, string>> = {
  mangas: SLUG_MANGAS,
  comics: SLUG_COMICS,
  libros: SLUG_LIBROS,
  tarot_y_magia: SLUG_TAROT_Y_MAGIA,
  juego_tcg_magic: SLUG_TCG_MAGIC,
  juego_tcg_yugioh: SLUG_TCG_YUGIOH,
  juego_tcg_pokemon: SLUG_TCG_POKEMON,
  juego_tcg_digimon: SLUG_DIGIMON,
  juego_tcg_accesorios: SLUG_TCG_ACCESORIOS,
  juego_tcg_generico: SLUG_TCG_GENERIC,
  juego_mesa: SLUG_JUEGOS_JUEGOS_DE_MESA,
  juego_rol: SLUG_JUEGOS_JUEGOS_DE_ROL,
  juego_lego: SLUG_LEGO,
  juego: SLUG_JUEGOS,
  merch_funko: SLUG_FUNKO_POPS,
  merch_peluches: SLUG_MERCHANDISING_PELUCHES,
  merch_ropa_remeras: SLUG_ROPA_REMERAS,
  merch_ropa_buzos: SLUG_BUZOS,
  merch_ropa_gorras: SLUG_ROPA_GORRAS,
  merch_ropa_cosplay: SLUG_ROPA_COSPLAY,
  merch_ropa_pantuflas: SLUG_ROPA_PANTUFLAS,
  merch_ropa_medias: SLUG_ROPA_MEDIAS,
  merch_ropa_bufandas: SLUG_ROPA_BUFANDAS,
  merch_ropa_generico: SLUG_MERCHANDISING_ROPA,
  merch_figuras: SLUG_MERCHANDISING_FIGURAS,
  merch_otros: SLUG_MERCHANDISING,
  merch: SLUG_MERCHANDISING,
};

export function getDefaultCategorySlug(recommendationType: string): string | null {
  const normalizedType = normalizeRecommendationType(recommendationType);
  if (!normalizedType) {
    return null;
  }

  return RECOMMENDATION_TYPE_TO_SLUG[normalizedType] ?? null;
}
