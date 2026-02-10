/**
 * Regex and constant sets used by product/order query resolvers.
 * Centralized to avoid magic numbers and improve maintainability.
 */

// --- Order ID and numeric bounds ---

/** Minimum and maximum digit count for a valid order ID (avoids short numbers like 12345). */
export const ORDER_ID_DIGIT_MIN = 6;
export const ORDER_ID_DIGIT_MAX = 12;

/** Max digits for "pure count" token (e.g. "3" in "3 mangas"); same ceiling as order ID for consistency. */
const PURE_COUNT_MAX_DIGITS = ORDER_ID_DIGIT_MAX;

export const PURE_COUNT_PATTERN = new RegExp(`^\\d{1,${PURE_COUNT_MAX_DIGITS}}$`);

export const PRODUCT_MODIFIERS_PATTERN =
  /\b(?:\d+\s*(?:unidades|unidad|uds|ud)\b|(?:en\s*)?r[uú]stica|tapa[-\s]*dura|tapa[-\s]*blanda|tapa[-\s]*suave|grapa|carton[eé]|cartone|encuadernada|hard\s*cover|hardcover|paperback|(?:en\s*)?(?:ingl[eé]s|ingles|english|japon[eé]s|japones|japanese)|preventa|pre[-\s]*venta|pre[-\s]*(?:orden|order)|preorden|agotad[oa]|oferta|ofertas|descuento|rebaja|promo(?:ci[oó]n)?|en\s+stock|stock|pack\s*x?\s*\d+|bundle|set|lote|caja|estuche|colecci[oó]n\s*completa)\b/gi;

// --- Generic product tokens (explicit list to keep relevant series) ---

/** Tokens that are too generic to use as the sole product query (explicit list to keep relevant series). */
export const GENERIC_PRODUCTS_TOKENS = new Set<string>([
  'manga', 'mangas', 'comic', 'comics', 'libro', 'libros', 'producto', 'productos',
  'juego', 'juegos', 'game', 'games', 'carta', 'cartas', 'tcg', 'card game', 'cardgame',
  'juego de cartas', 'juegos de cartas', 'juegos de cartas coleccionables', 'juego de rol',
  'juegos de rol', 'juego de mesa', 'juegos de mesa', 'roleplaying', 'estrategia', 'deck', 'playmat', 'booster',
  'merchandising', 'merch', 'figura', 'figuras', 'figurita', 'figuritas', 'accesorio',
  'accesorios', 'ropa', 'remera', 'remeras', 'camiseta', 'camisetas', 'buzo', 'buzos', 'gorro',
  'gorra', 'gorras', 'cosplay', 'funko', 'funkos', 'peluche', 'peluches', 'mochila', 'poster',
  'posters', 'pin', 'llavero',
  'tarot', 'magia', 'magic book', 'grimorio', 'oraculo',
  'rustica', 'tapa dura', 'tapa blanda', 'grapa', 'ingles', 'english', 'japones', 'japanese',
  'preventa', 'preorden', 'pre order', 'oferta', 'descuento', 'agotado',
  'articulo', 'articulos', 'item', 'items', 'cosa', 'cosas', 'stuff',
]);

// --- Category detection patterns ---

export const BOOK_CATEGORY_PATTERN = /\b(?:libro(?:s)?|novela(?:s)?|literatura)\b/;

export const GAMES_TCG_CATEGORY_PATTERN =
  /\b(?:tcg|card\s*game|cardgame|carta(?:s)?|cartas\s+coleccionables|booster(?:s)?|deck(?:s)?|playmat(?:s)?|magic|yugioh|yu[-\s]*gi[-\s]*oh|pokemon(?:\s+ccg)?|digimon)\b/;

export const GAMES_RPG_CATEGORY_PATTERN =
  /\b(?:juego(?:s)?\s+de\s+rol|roleplaying|rol|d&d|dnd|dungeons\s*&?\s*dragons|pathfinder)\b/;

export const GAMES_BOARD_CATEGORY_PATTERN =
  /\b(?:juego(?:s)?\s+de\s+mesa|board\s*game(?:s)?|boardgame(?:s)?|tabletop|rompecabezas|puzzle(?:s)?|dado(?:s)?)\b/;

/** Fallback for "juego(s)" without a clear subtype. */
export const GAMES_GENERIC_CATEGORY_PATTERN = /\bjuego(?:s)?\b/;

export const MERCH_CLOTHING_CATEGORY_PATTERN =
  /\b(?:ropa|remera(?:s)?|camiseta(?:s)?|buzo(?:s)?|gorra(?:s)?|gorro(?:s)?|cosplay|hoodie(?:s)?|pijama(?:s)?|tapaboca(?:s)?|bufanda(?:s)?|medias|pantufla(?:s)?)\b/;

export const MERCH_FIGURES_CATEGORY_PATTERN =
  /\b(?:figura(?:s)?|figurita(?:s)?|funko(?:s)?(?:\s*pops?)?|peluche(?:s)?|playmobil)\b/;

export const MERCH_GENERIC_CATEGORY_PATTERN =
  /\b(?:merch(?:andising)?|accesorio(?:s)?|llavero(?:s)?|mochila(?:s)?|poster(?:s)?|pin(?:s)?)\b/;

export const TAROT_CATEGORY_PATTERN = /\b(?:tarot|oraculo(?:s)?|grimorio(?:s)?|magia)\b/;

export const MANGA_CATEGORY_PATTERN = /\b(?:manga(?:s)?|tomo(?:s)?|volumen(?:es)?)\b/;

export const COMIC_CATEGORY_PATTERN = /\b(?:comic(?:s)?|grapa)\b/;

// --- Hint patterns for slug refinement (used in resolve-products) ---

export const TCG_MAGIC_HINT_PATTERN = /\bmagic\b/;
export const TCG_YUGIOH_HINT_PATTERN = /\b(?:yugioh|yu[-\s]*gi[-\s]*oh)\b/;
export const TCG_POKEMON_HINT_PATTERN = /\bpokemon\b/;
export const TCG_DIGIMON_HINT_PATTERN = /\bdigimon\b/;
export const TCG_ACCESSORIES_HINT_PATTERN =
  /\b(?:accesorio(?:s)?|playmat(?:s)?|sleeve(?:s)?|funda(?:s)?|deck\s*box|porta\s*mazo|binder|carpeta)\b/;

export const MERCH_FUNKO_HINT_PATTERN = /\bfunko(?:s)?\b/;
export const MERCH_PLUSH_HINT_PATTERN = /\bpeluche(?:s)?\b/;

export const MERCH_REMERAS_HINT_PATTERN = /\b(?:remera(?:s)?|camiseta(?:s)?)\b/;
export const MERCH_GORRAS_HINT_PATTERN = /\b(?:gorra(?:s)?|gorro(?:s)?)\b/;
export const MERCH_COSPLAY_HINT_PATTERN = /\bcosplay\b/;
export const MERCH_BUZOS_HINT_PATTERN = /\bbuzo(?:s)?\b/;

export const BOARD_PUZZLE_HINT_PATTERN = /\b(?:rompecabezas|puzzle(?:s)?)\b/;
export const BOARD_DICE_HINT_PATTERN = /\b(?:dado(?:s)?)\b/;

// --- Volume, format, language, offer hints ---

/** Used with .test() to detect volume hints in text (no global flag). */
export const VOLUME_HINT_PATTERN = /(?:tomo|vol(?:umen)?|nro|n|no|numero|#)\s*0*\d{1,3}\b/;

export const VOLUME_HINT_STRIP_PATTERN =
  /(?:tomos?|vol(?:umen)?|nro|n|no|numero|#)\s*0*\d{1,3}\b/gi;

export const FORMAT_HINT_PATTERN =
  /\b(?:rustica|tapa[-\s]*dura|tapa[-\s]*blanda|grapa|cartone|encuadernada|hard\s*cover|hardcover|paperback)\b/;

export const LANGUAGE_HINT_PATTERN = /\b(?:en\s*)?(?:ingles|english|japones|japanese)\b/;

export const OFFER_HINT_PATTERN =
  /\b(?:preventa|pre[-\s]*venta|pre[-\s]*(?:orden|order)|preorden|agotad[oa]|oferta|ofertas|descuento|rebaja|promocion|en\s+stock|stock)\b/;

// --- Order ID patterns ---

/** Matches "pedido/orden/order #123456" and variants; capture group 1 = digits. */
export const ORDER_ID_PREFIX_PATTERN = new RegExp(
  `(?:pedido|orden|order)?\\s*#?\\s*(\\d{${ORDER_ID_DIGIT_MIN},${ORDER_ID_DIGIT_MAX}})`,
  'i',
);

/** Pure numeric order ID (6–12 digits). */
export const ORDER_ID_PURE_PATTERN = new RegExp(
  `^\\d{${ORDER_ID_DIGIT_MIN},${ORDER_ID_DIGIT_MAX}}$`,
);
