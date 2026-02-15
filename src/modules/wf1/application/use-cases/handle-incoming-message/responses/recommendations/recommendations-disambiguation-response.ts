import type { Wf1Response } from '../../../../../domain/wf1-response';

const DEFAULT_TYPE_OPTIONS = ['mangas/comics', 'figuras y coleccionables', 'ropa/accesorios'];

export function buildRecommendationsFranchiseDisambiguationResponse(input: {
  franchiseLabel: string;
  totalCandidates?: number;
  suggestedTypes: string[];
}): Wf1Response {
  const suggestedOptions = resolveSuggestedOptions(input.suggestedTypes);
  const header =
    typeof input.totalCandidates === 'number' && input.totalCandidates >= 0
      ? `Encontre ${input.totalCandidates} producto(s) de ${input.franchiseLabel}.`
      : `Tengo opciones de ${input.franchiseLabel}.`;

  const message = [
    header,
    'Para recomendarte mejor, decime que tipo te interesa:',
    ...suggestedOptions.map((option) => `- ${option}`),
    '',
    'Si ya sabes que tomo/numero buscas, decimelo en el mismo mensaje.',
  ].join('\n');

  return {
    ok: false,
    message,
  };
}

export function buildRecommendationsVolumeDisambiguationResponse(input: {
  franchiseLabel: string;
  categoryLabel: string;
}): Wf1Response {
  const message = [
    `Perfecto, vamos con ${input.categoryLabel} de ${input.franchiseLabel}.`,
    'Para afinar la recomendacion, decime una opcion:',
    '- tomo/numero especifico (ej: tomo 3)',
    '- desde el inicio',
    '- ultimos lanzamientos',
  ].join('\n');

  return {
    ok: false,
    message,
  };
}

export function buildRecommendationsUnknownFollowupResponse(input: {
  franchiseLabel: string;
  state: 'awaiting_category_or_volume' | 'awaiting_volume_detail';
  suggestedTypes?: string[];
  categoryLabel?: string;
}): Wf1Response {
  if (input.state === 'awaiting_volume_detail') {
    return buildRecommendationsVolumeDisambiguationResponse({
      franchiseLabel: input.franchiseLabel,
      categoryLabel: input.categoryLabel ?? 'mangas/comics',
    });
  }

  return buildRecommendationsFranchiseDisambiguationResponse({
    franchiseLabel: input.franchiseLabel,
    suggestedTypes: input.suggestedTypes ?? [],
  });
}

export function formatRecommendationCategoryLabel(type: string | null): string {
  switch (type) {
    case 'mangas':
      return 'mangas';
    case 'comics':
      return 'comics';
    case 'merch_figuras':
    case 'merch_funko':
    case 'merch_peluches':
      return 'figuras y coleccionables';
    case 'merch_ropa_generico':
    case 'merch_ropa_remeras':
    case 'merch_ropa_buzos':
    case 'merch_ropa_gorras':
    case 'merch_ropa_cosplay':
    case 'merch_ropa_pantuflas':
    case 'merch_ropa_medias':
    case 'merch_ropa_bufandas':
      return 'ropa y accesorios';
    case 'libros':
      return 'libros';
    case 'juego':
    case 'juego_mesa':
    case 'juego_rol':
    case 'juego_tcg_generico':
    case 'juego_tcg_magic':
    case 'juego_tcg_yugioh':
    case 'juego_tcg_pokemon':
    case 'juego_tcg_digimon':
    case 'juego_tcg_accesorios':
      return 'juegos';
    default:
      return 'productos';
  }
}

function resolveSuggestedOptions(types: string[]): string[] {
  if (types.length === 0) {
    return DEFAULT_TYPE_OPTIONS;
  }

  const normalized = [...new Set(types.map((type) => formatRecommendationCategoryLabel(type)))];
  return normalized.length > 0 ? normalized.map((value) => value) : DEFAULT_TYPE_OPTIONS;
}
