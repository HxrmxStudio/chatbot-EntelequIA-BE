import type { RecommendationItem, RecommendationTypeKey } from './types';

/**
 * Mapping of recommendation type preferences to search terms.
 * Used to filter recommendations based on user preferences.
 */
export const RECOMMENDATIONS_TYPE_TERMS: Record<RecommendationTypeKey, readonly string[]> = {
  mangas: [
    'manga',
    'mangas',
    'tomo',
    'tomos',
    'volumen',
    'volumenes',
    'shonen',
    'shounen',
    'seinen',
    'shojo',
    'shoujo',
    'josei',
    'kodomo',
    'yaoi',
    'yuri',
    'manhwa',
    'manhua',
  ],
  comics: [
    'comic',
    'comics',
    'grapa',
    'tpb',
    'hardcover',
    'americano',
    'europeo',
    'nacional',
    'marvel',
    'dc',
    'dc comics',
  ],
  libros: [
    'libro',
    'libros',
    'novela',
    'novelas',
    'ensayo',
    'autoayuda',
    'artbook',
    'art book',
    'fantasia',
    'ciencia ficcion',
  ],
  tarot_y_magia: [
    'tarot',
    'oraculo',
    'grimorio',
    'magia',
    'adivinacion',
  ],
  juego_tcg_magic: [
    'magic',
    'mtg',
    'magic the gathering',
    'magic cartas',
    'magic booster',
    'magic mazo',
  ],
  juego_tcg_yugioh: [
    'yu gi oh',
    'yugioh',
    'ygo',
    'yugioh booster',
    'yugioh deck',
  ],
  juego_tcg_pokemon: [
    'pokemon cartas',
    'pokemon tcg',
    'pokemon ccg',
    'pokemon booster',
    'pokemon trading',
  ],
  juego_tcg_digimon: [
    'digimon',
    'digimon cartas',
    'digimon tcg',
    'digimon ccg',
  ],
  juego_tcg_accesorios: [
    'playmat',
    'playmats',
    'sleeve',
    'sleeves',
    'funda',
    'fundas',
    'deck box',
    'porta mazo',
    'binder',
  ],
  juego_tcg_generico: [
    'tcg',
    'card game',
    'cardgame',
    'carta',
    'cartas',
    'cartas coleccionables',
    'booster',
    'deck',
    'sobre',
    'juego de cartas',
    'juegos de cartas',
  ],
  juego_mesa: [
    'juego de mesa',
    'juegos de mesa',
    'boardgame',
    'board game',
    'rompecabezas',
    'puzzle',
    'dado',
    'dados',
    'tablero',
    'estrategia',
    'cooperativo',
  ],
  juego_rol: [
    'juego de rol',
    'juegos de rol',
    'rol',
    'rpg',
    'd&d',
    'dnd',
    'dungeons dragons',
    'manual rol',
    'campana',
    'pathfinder',
  ],
  juego_lego: ['lego', 'lego sets'],
  juego: ['juego', 'juegos'],
  merch_funko: ['funko', 'funko pop', 'funko pops', 'pop funko', 'pop vinyl'],
  merch_peluches: ['peluche', 'peluches', 'plushie', 'plush'],
  merch_ropa_remeras: [
    'remera',
    'remeras',
    'camiseta',
    'camisetas',
    't shirt',
    'tee',
    'playera',
  ],
  merch_ropa_buzos: ['buzo', 'buzos', 'hoodie', 'sudadera'],
  merch_ropa_gorras: ['gorra', 'gorras', 'gorro', 'gorros', 'cap', 'beanie'],
  merch_ropa_cosplay: ['cosplay', 'disfraz', 'disfraces', 'uniforme'],
  merch_ropa_pantuflas: ['pantufla', 'pantuflas', 'slipper', 'slippers'],
  merch_ropa_medias: ['media', 'medias', 'sock', 'socks', 'calcetin', 'calcetines'],
  merch_ropa_bufandas: ['bufanda', 'bufandas', 'scarf', 'chalina'],
  merch_ropa_generico: ['ropa', 'prenda', 'vestimenta', 'merchandising ropa'],
  merch_figuras: [
    'figura',
    'figuras',
    'figurita',
    'figuritas',
    'estatua',
    'sculpture',
    'chibi',
  ],
  merch_otros: [
    'poster',
    'posters',
    'cuadro',
    'cuadros',
    'pin',
    'pins',
    'anillo',
    'billetera',
    'llavero',
    'mochila',
    'taza',
    'vaso',
    'agenda',
    'cuaderno',
    'sticker',
    'stickers',
    'photocard',
  ],
  merch: ['merch', 'merchandising'],
};

export const RECOMMENDATIONS_TYPE_PRIORITY: readonly RecommendationTypeKey[] = [
  'juego_tcg_magic',
  'juego_tcg_yugioh',
  'juego_tcg_pokemon',
  'juego_tcg_digimon',
  'juego_tcg_accesorios',
  'juego_tcg_generico',
  'juego_lego',
  'juego_mesa',
  'juego_rol',
  'merch_funko',
  'merch_peluches',
  'merch_ropa_remeras',
  'merch_ropa_buzos',
  'merch_ropa_gorras',
  'merch_ropa_cosplay',
  'merch_ropa_pantuflas',
  'merch_ropa_medias',
  'merch_ropa_bufandas',
  'merch_figuras',
  'merch_otros',
  'merch_ropa_generico',
  'mangas',
  'comics',
  'libros',
  'tarot_y_magia',
  'juego',
  'merch',
] as const;

export const RECOMMENDATIONS_TYPE_ALIASES: Readonly<Record<string, RecommendationTypeKey>> = {
  tarot: 'tarot_y_magia',
  juego_tcg: 'juego_tcg_generico',
  merch_ropa: 'merch_ropa_generico',
  merch_figuras: 'merch_figuras',
};

const NORMALIZED_TYPE_KEYS: Readonly<Record<string, RecommendationTypeKey>> = Object.freeze(
  Object.keys(RECOMMENDATIONS_TYPE_TERMS).reduce<Record<string, RecommendationTypeKey>>((acc, key) => {
    const typedKey = key as RecommendationTypeKey;
    acc[normalizeRecommendationTerm(typedKey)] = typedKey;
    return acc;
  }, {}),
);

const NORMALIZED_TYPE_ALIASES: Readonly<Record<string, RecommendationTypeKey>> = Object.freeze(
  Object.entries(RECOMMENDATIONS_TYPE_ALIASES).reduce<Record<string, RecommendationTypeKey>>(
    (acc, [alias, value]) => {
      acc[normalizeRecommendationTerm(alias)] = value;
      return acc;
    },
    {},
  ),
);

const NORMALIZED_TERMS_BY_TYPE: Readonly<Record<RecommendationTypeKey, readonly string[]>> =
  Object.freeze(
    Object.entries(RECOMMENDATIONS_TYPE_TERMS).reduce<
      Record<RecommendationTypeKey, readonly string[]>
    >((acc, [type, terms]) => {
      acc[type as RecommendationTypeKey] = terms.map((term) =>
        normalizeRecommendationTerm(term),
      );
      return acc;
    }, {} as Record<RecommendationTypeKey, readonly string[]>),
  );

export function normalizeRecommendationType(value: string): RecommendationTypeKey | null {
  const normalized = normalizeRecommendationTerm(value);
  if (normalized.length === 0) {
    return null;
  }

  const aliased = NORMALIZED_TYPE_ALIASES[normalized];
  if (aliased) {
    return aliased;
  }

  return NORMALIZED_TYPE_KEYS[normalized] ?? null;
}

export function detectRecommendationType(text: string): RecommendationTypeKey | null {
  const normalizedText = normalizeRecommendationTerm(text);
  if (normalizedText.length === 0) {
    return null;
  }

  for (const type of RECOMMENDATIONS_TYPE_PRIORITY) {
    const terms = NORMALIZED_TERMS_BY_TYPE[type];
    const found = terms.some((term) => containsNormalizedTerm(normalizedText, term));
    if (found) {
      return type;
    }
  }

  return null;
}

/**
 * Filters recommendation items by type preferences.
 * Matches items based on category names and slugs against preference terms.
 *
 * @param items - Recommendation items to filter
 * @param preferredTypes - Array of preferred type strings (e.g., ['mangas', 'comics'])
 * @returns Filtered items that match the preferred types
 */
export function filterRecommendationsByType(
  items: RecommendationItem[],
  preferredTypes: string[],
): RecommendationItem[] {
  if (!Array.isArray(preferredTypes) || preferredTypes.length === 0) {
    return items;
  }

  const termsSet = new Set<string>();
  for (const preferredType of preferredTypes) {
    const normalizedType = normalizeRecommendationType(preferredType);
    if (!normalizedType) {
      const normalizedTerm = normalizeRecommendationTerm(preferredType);
      if (normalizedTerm.length > 0) {
        termsSet.add(normalizedTerm);
      }
      continue;
    }

    for (const term of NORMALIZED_TERMS_BY_TYPE[normalizedType]) {
      termsSet.add(term);
    }
  }

  const terms = [...termsSet];

  if (terms.length === 0) {
    return items;
  }

  return items.filter((item) => {
    const categories = [
      ...item.categoryNames,
      ...item.categorySlugs,
      item.categoryName ?? '',
      item.categorySlug ?? '',
    ]
      .map((value) => normalizeRecommendationTerm(value))
      .filter((value) => value.length > 0);

    return categories.some((category) =>
      terms.some((term) => containsNormalizedTerm(category, term)),
    );
  });
}

function containsNormalizedTerm(normalizedValue: string, normalizedTerm: string): boolean {
  if (normalizedTerm.length === 0) {
    return false;
  }

  if (normalizedTerm.includes(' ')) {
    return normalizedValue.includes(normalizedTerm);
  }

  const escaped = escapeRegExp(normalizedTerm);
  const bounded = new RegExp(`(^|\\b)${escaped}(\\b|$)`);
  return bounded.test(normalizedValue);
}

/**
 * Normalizes a recommendation term for comparison.
 * Removes accents, converts to lowercase, normalizes whitespace and separators.
 *
 * @param value - Term to normalize
 * @returns Normalized term
 */
function normalizeRecommendationTerm(value: string): string {
  return value
    .trim()
    .replace(/[-_]+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s{2,}/g, ' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
