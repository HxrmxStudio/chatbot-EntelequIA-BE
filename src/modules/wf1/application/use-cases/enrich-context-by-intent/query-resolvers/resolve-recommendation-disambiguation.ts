import { normalizeForToken } from './normalize';

export type RecommendationDisambiguationReason =
  | 'franchise_scope'
  | 'volume_scope'
  | null;

export interface RecommendationDisambiguationResult {
  needsDisambiguation: boolean;
  reason: RecommendationDisambiguationReason;
  franchise: string | null;
  suggestedTypes: string[];
  totalCandidates: number;
}

export interface RecommendationVolumeSignals {
  hasVolumeSignal: boolean;
  volumeNumber: number | null;
  wantsLatest: boolean;
  wantsStart: boolean;
}

const VOLUME_SIGNAL_PATTERN =
  /\b(?:tomo|tomos|vol|volumen|volumenes|nro|numero|num|#)\s*(\d{1,3})\b/;
const LATEST_SIGNAL_PATTERN =
  /\b(?:ultim[oa]s?|recientes|nuev[oa]s?|lanzamientos?)\b/;
const START_SIGNAL_PATTERN =
  /\b(?:desde\s+el\s+inicio|arrancar|empezar|principio|primer\s+tomo|tomo\s*1)\b/;

export function resolveRecommendationDisambiguation(input: {
  text: string;
  franchise: string | null;
  suggestedTypes: string[];
  totalCandidates: number;
  preferredTypes: string[];
  franchiseThreshold: number;
  volumeThreshold: number;
}): RecommendationDisambiguationResult {
  const volumeSignals = resolveRecommendationVolumeSignals(input.text);
  const selectedTypes = dedupe([...input.preferredTypes, ...input.suggestedTypes]);
  const hasTypeSelection = input.preferredTypes.length > 0;

  if (
    input.franchise &&
    input.totalCandidates >= input.franchiseThreshold &&
    !hasTypeSelection &&
    !volumeSignals.hasVolumeSignal
  ) {
    return {
      needsDisambiguation: true,
      reason: 'franchise_scope',
      franchise: input.franchise,
      suggestedTypes: selectedTypes,
      totalCandidates: input.totalCandidates,
    };
  }

  if (
    input.franchise &&
    input.totalCandidates >= input.volumeThreshold &&
    isMangaOrComicRecommendation(selectedTypes) &&
    !volumeSignals.hasVolumeSignal
  ) {
    return {
      needsDisambiguation: true,
      reason: 'volume_scope',
      franchise: input.franchise,
      suggestedTypes: selectedTypes,
      totalCandidates: input.totalCandidates,
    };
  }

  return {
    needsDisambiguation: false,
    reason: null,
    franchise: input.franchise,
    suggestedTypes: selectedTypes,
    totalCandidates: input.totalCandidates,
  };
}

export function resolveRecommendationVolumeSignals(text: string): RecommendationVolumeSignals {
  const normalized = normalizeForToken(text);
  const volumeMatch = normalized.match(VOLUME_SIGNAL_PATTERN);
  const parsedVolume = volumeMatch?.[1] ? Number(volumeMatch[1]) : null;

  return {
    hasVolumeSignal:
      Boolean(volumeMatch?.[1]) ||
      LATEST_SIGNAL_PATTERN.test(normalized) ||
      START_SIGNAL_PATTERN.test(normalized),
    volumeNumber:
      typeof parsedVolume === 'number' && Number.isFinite(parsedVolume)
        ? parsedVolume
        : null,
    wantsLatest: LATEST_SIGNAL_PATTERN.test(normalized),
    wantsStart: START_SIGNAL_PATTERN.test(normalized),
  };
}

function isMangaOrComicRecommendation(types: string[]): boolean {
  return types.some((type) => type === 'mangas' || type === 'comics');
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
