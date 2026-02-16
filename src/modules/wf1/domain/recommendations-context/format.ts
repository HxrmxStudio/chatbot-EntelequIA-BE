import { formatMoney } from '../money';
import { WF1_RECOMMENDATIONS_CONTEXT_AI_MAX_ITEMS } from './constants';
import type {
  RecommendationItem,
  RecommendationPreferences,
  RecommendationTypeKey,
  RecommendationsAiContext,
  RecommendationsTemplates,
} from './types';

const RECOMMENDATION_TYPE_LABELS: Readonly<Record<RecommendationTypeKey, string>> = {
  mangas: 'Mangas',
  comics: 'Comics',
  libros: 'Libros',
  tarot_y_magia: 'Tarot y Magia',
  juego_tcg_magic: 'TCG - Magic',
  juego_tcg_yugioh: 'TCG - Yu-Gi-Oh',
  juego_tcg_pokemon: 'TCG - Pokemon',
  juego_tcg_digimon: 'TCG - Digimon',
  juego_tcg_accesorios: 'TCG - Accesorios',
  juego_tcg_generico: 'TCG',
  juego_mesa: 'Juegos de mesa',
  juego_rol: 'Juegos de rol',
  juego_lego: 'Lego',
  juego: 'Juegos',
  merch_funko: 'Merch - Funko',
  merch_peluches: 'Merch - Peluches',
  merch_ropa_remeras: 'Ropa - Remeras',
  merch_ropa_buzos: 'Ropa - Buzos',
  merch_ropa_gorras: 'Ropa - Gorras',
  merch_ropa_cosplay: 'Ropa - Cosplay',
  merch_ropa_pantuflas: 'Ropa - Pantuflas',
  merch_ropa_medias: 'Ropa - Medias',
  merch_ropa_bufandas: 'Ropa - Bufandas',
  merch_ropa_generico: 'Merch - Ropa',
  merch_figuras: 'Merch - Figuras',
  merch_otros: 'Merch - Otros',
  merch: 'Merchandising',
};

/**
 * @param input.templates - REQUIRED. Templates must be provided by the adapter (no fallbacks).
 */
export function buildRecommendationsAiContext(input: {
  items: RecommendationItem[];
  total?: number;
  preferences: RecommendationPreferences;
  templates: RecommendationsTemplates;
}): RecommendationsAiContext {
  const shownItems = input.items.slice(0, WF1_RECOMMENDATIONS_CONTEXT_AI_MAX_ITEMS);
  const totalRecommendations =
    typeof input.total === 'number' ? input.total : input.items.length;
  const preferencesLines = formatPreferences(input.preferences);
  const list = shownItems.map((item, index) => formatRecommendation(item, index)).join('\n\n');

  const lines: string[] = [
    input.templates.header,
    ...(preferencesLines.length > 0 ? ['', ...preferencesLines] : []),
    '',
    list.length > 0 ? list : '(Sin recomendaciones disponibles)',
    '',
    input.templates.whyThese,
    '',
    input.templates.instructions,
  ];

  return {
    contextText: lines.join('\n'),
    recommendationsCount: shownItems.length,
    totalRecommendations,
    preferences: input.preferences,
    apiFallback: false,
    isEmpty: false,
  };
}

/**
 * @param input.templates - REQUIRED. Templates must be provided by the adapter (no fallbacks).
 */
export function buildEmptyRecommendationsAiContext(input: {
  preferences: RecommendationPreferences;
  templates: RecommendationsTemplates & {
    noMatchSuggestion?: string;
    apiFallbackNote?: string;
    catalogUnavailableMessage?: string;
  };
  apiFallback: boolean;
  fallbackReason?: 'no_matches' | 'api_error' | 'catalog_unavailable';
}): RecommendationsAiContext {
  const preferencesLines = formatPreferences(input.preferences);
  const emptyMessage = resolveEmptyMessage(input.fallbackReason, input.templates.emptyMessage, input.templates.catalogUnavailableMessage);
  const suggestionLine = input.fallbackReason === 'no_matches'
    ? input.templates.noMatchSuggestion
    : null;
  const apiFallbackLine = input.apiFallback
    ? input.templates.apiFallbackNote
    : null;

  const lines: string[] = [
    emptyMessage,
    ...(preferencesLines.length > 0 ? ['', ...preferencesLines] : []),
    ...(suggestionLine ? ['', suggestionLine] : []),
    ...(apiFallbackLine ? ['', apiFallbackLine] : []),
    '',
    input.templates.instructions,
  ];

  return {
    contextText: lines.join('\n'),
    recommendationsCount: 0,
    totalRecommendations: 0,
    preferences: input.preferences,
    apiFallback: input.apiFallback,
    isEmpty: true,
  };
}

function formatRecommendation(item: RecommendationItem, index: number): string {
  const category = item.categoryName ?? 'Producto';
  const money = item.priceWithDiscount ?? item.price;
  const priceText = money ? formatMoney(money) : 'Consultar';
  const discount =
    typeof item.discountPercent === 'number' ? ` (-${item.discountPercent}%)` : '';

  return [
    `${index + 1}. **${item.title}**`,
    `- Categoria: ${category}`,
    `- Precio: ${priceText}${discount}`,
    item.url ? `- Ver mas: ${item.url}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

function formatPreferences(preferences: RecommendationPreferences): string[] {
  const lines: string[] = [];

  if (preferences.franchiseKeywords.length > 0) {
    lines.push(`Franquicias de interes: ${preferences.franchiseKeywords.join(', ')}`);
  }

  if (preferences.genre.length > 0) {
    lines.push(`Generos de interes: ${preferences.genre.join(', ')}`);
  }

  if (preferences.type.length > 0) {
    const readableTypes = [...new Set(preferences.type.map((type) =>
      RECOMMENDATION_TYPE_LABELS[type as RecommendationTypeKey] ?? type,
    ))];
    lines.push(`Tipo de producto: ${readableTypes.join(', ')}`);
  }

  if (typeof preferences.age === 'number') {
    lines.push(`Edad aproximada: ${preferences.age} anos`);
  }

  if (preferences.prefersLowPrice) {
    lines.push('Precio: priorizar opciones economicas');
  }

  return lines;
}

function resolveEmptyMessage(
  fallbackReason: 'no_matches' | 'api_error' | 'catalog_unavailable' | undefined,
  templateEmptyMessage: string,
  catalogUnavailableMessage?: string,
): string {
  if (fallbackReason === 'catalog_unavailable' && catalogUnavailableMessage) {
    return catalogUnavailableMessage;
  }

  return templateEmptyMessage;
}
