/**
 * Regex and constant sets used by product/order query resolvers.
 * Centralized to avoid magic numbers and improve maintainability.
 */

/** Minimum and maximum digit count for a valid order ID (avoids short numbers like 12345). */
export const ORDER_ID_DIGIT_MIN = 6;
export const ORDER_ID_DIGIT_MAX = 12;

export const PURE_COUNT_PATTERN = /^\d{1,12}$/;

export const PRODUCT_MODIFIERS_PATTERN =
  /\b(?:\d+\s*(?:unidades|unidad|uds|ud)\b|(?:en\s*)?r[uú]stica|tapa[-\s]*dura|tapa[-\s]*blanda|tapa[-\s]*suave|grapa|carton[eé]|cartone|encuadernada|hard\s*cover|hardcover|paperback|(?:en\s*)?(?:ingl[eé]s|ingles|english|japon[eé]s|japones|japanese)|preventa|pre[-\s]*venta|pre[-\s]*(?:orden|order)|preorden|agotad[oa]|oferta|ofertas|descuento|rebaja|promo(?:ci[oó]n)?|en\s+stock|stock|pack\s*x?\s*\d+|bundle|set|lote|caja|estuche|colecci[oó]n\s*completa)\b/gi;

/** Tokens that are too generic to use as the sole product query (explicit list to keep relevant series). */
export const GENERIC_PRODUCTS_TOKENS = new Set<string>([
  'manga', 'mangas', 'comic', 'comics', 'libro', 'libros', 'producto', 'productos',
  'juego', 'juegos', 'game', 'games', 'carta', 'cartas', 'tcg', 'card game', 'cardgame',
  'juego de cartas', 'juegos de cartas', 'juegos de cartas coleccionables', 'juego de rol',
  'juegos de rol', 'roleplaying', 'estrategia', 'deck', 'playmat', 'booster',
  'merchandising', 'merch', 'figura', 'figuras', 'figurita', 'figuritas', 'accesorio',
  'accesorios', 'ropa', 'remera', 'camiseta', 'gorro', 'mochila', 'poster', 'pin', 'llavero',
  'tarot', 'magia', 'magic book', 'grimorio', 'oraculo',
  'rustica', 'tapa dura', 'tapa blanda', 'grapa', 'ingles', 'english', 'japones', 'japanese',
  'preventa', 'preorden', 'pre order', 'oferta', 'descuento', 'agotado',
  'articulo', 'articulos', 'item', 'items', 'cosa', 'cosas', 'stuff',
]);

export const GAMES_CATEGORY_PATTERN =
  /\b(?:carta(?:s)?|magic|yugioh|pokemon\s+ccg|tcg|booster(?:s)?|deck(?:s)?|playmat(?:s)?|card\s+game|juego\s+de\s+rol|roleplaying|estrategia)\b/;

export const MERCH_CATEGORY_PATTERN =
  /\b(?:merch(?:andising)?|figura(?:s)?|figurita(?:s)?|remera(?:s)?|camiseta(?:s)?|gorro(?:s)?|poster(?:s)?|pin(?:s)?|accesorio(?:s)?|llavero(?:s)?|mochila(?:s)?|ropa)\b/;

export const TAROT_CATEGORY_PATTERN = /\b(?:tarot|oraculo(?:s)?|grimorio(?:s)?|magia)\b/;

export const MANGA_CATEGORY_PATTERN = /\b(?:manga(?:s)?|tomo(?:s)?|volumen(?:es)?)\b/;

export const COMIC_CATEGORY_PATTERN = /\b(?:comic(?:s)?|grapa)\b/;

/** Used with .test() to detect volume hints in text (no global flag). */
export const VOLUME_HINT_PATTERN = /(?:tomo|vol(?:umen)?|nro|n|no|numero|#)\s*0*\d{1,3}\b/;

export const VOLUME_HINT_STRIP_PATTERN =
  /(?:tomos?|vol(?:umen)?|nro|n|no|numero|#)\s*0*\d{1,3}\b/gi;

export const FORMAT_HINT_PATTERN =
  /\b(?:rustica|tapa[-\s]*dura|tapa[-\s]*blanda|grapa|cartone|encuadernada|hard\s*cover|hardcover|paperback)\b/;

export const LANGUAGE_HINT_PATTERN = /\b(?:en\s*)?(?:ingles|english|japones|japanese)\b/;

export const OFFER_HINT_PATTERN =
  /\b(?:preventa|pre[-\s]*venta|pre[-\s]*(?:orden|order)|preorden|agotad[oa]|oferta|ofertas|descuento|rebaja|promocion|en\s+stock|stock)\b/;

/** Matches "pedido/orden/order #123456" and variants; capture group 1 = digits. */
export const ORDER_ID_PREFIX_PATTERN = new RegExp(
  `(?:pedido|orden|order)?\\s*#?\\s*(\\d{${ORDER_ID_DIGIT_MIN},${ORDER_ID_DIGIT_MAX}})`,
  'i',
);

/** Pure numeric order ID (6–12 digits). */
export const ORDER_ID_PURE_PATTERN = new RegExp(
  `^\\d{${ORDER_ID_DIGIT_MIN},${ORDER_ID_DIGIT_MAX}}$`,
);
