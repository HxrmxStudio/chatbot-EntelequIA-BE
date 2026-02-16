import { isRecord } from '@/common/utils/object.utils';
import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import type { ConversationHistoryRow } from '@/modules/wf1/domain/conversation-history';
import {
  resolveRecommendationFranchiseKeywords,
  resolveRecommendationsPreferences,
} from '../../../enrich-context-by-intent/query-resolvers';
import {
  containsNormalizedTerm,
  normalizeTextForSearch,
} from '@/common/utils/text-normalize.utils';

export const RECOMMENDATIONS_LAST_FRANCHISE_METADATA_KEY = 'recommendationsLastFranchise';
export const RECOMMENDATIONS_LAST_TYPE_METADATA_KEY = 'recommendationsLastType';
export const RECOMMENDATIONS_SNAPSHOT_TIMESTAMP_METADATA_KEY = 'recommendationsSnapshotTimestamp';
export const RECOMMENDATIONS_SNAPSHOT_SOURCE_METADATA_KEY = 'recommendationsSnapshotSource';
export const RECOMMENDATIONS_SNAPSHOT_ITEM_COUNT_METADATA_KEY = 'recommendationsSnapshotItemCount';
export const RECOMMENDATIONS_PROMPTED_FRANCHISE_METADATA_KEY = 'recommendationsPromptedFranchise';

const SHORT_ACK_TERMS = new Set([
  'si',
  'sii',
  'siii',
  'seh',
  'sep',
  'yes',
  'dale',
  'ok',
  'okey',
  'oka',
  'okay',
  'bueno',
  'va',
  'va bien',
  'listo',
  'joya',
  'de una',
  'barbaro',
  'genial',
  'perfecto',
  'excelente',
  'claro',
  'obvio',
  'seguro',
  'por supuesto',
  'desde ya',
  'no',
  'nop',
  'nope',
  'negativo',
  'no gracias',
]);

/**
 * Patterns that indicate continuation of a previous recommendation flow.
 * Excludes standalone "barato"/"económico" - those are new requests, not continuations.
 * "presupuesto" stays: "tengo poco presupuesto" after k pop = valid continuation.
 */
const CONTINUATION_PATTERNS: readonly RegExp[] = [
  /\b(mas|más)\s+barat[oa]\b/i,
  /\b(algo\s+mas|algo\s+m[aá]s)\b/i,
  /\b(tenes|ten[eé]s|tienes)\b/i,
  /\b(que\s+tenes|que\s+ten[eé]s)\b/i,
  /\bpresupuesto\b/i,
];

const CATALOG_SIGNAL_PATTERN =
  /\b(manga|mangas|comic|comics|figura|figuras|funko|merch|k\s*-?\s*pop|kpop|booster|tcg|carta|cartas|yu\s*-?\s*gi\s*-?\s*oh|yugioh|pokemon|evangelion|naruto|chainsaw\s+man|demon\s+slayer|one\s+piece|attack\s+on\s+titan|shingeki|boku\s+no\s+hero|dragon\s+ball|jujutsu\s+kaisen|spy\s+family|bleach|hunter|kimetsu|my\s+hero\s+academia)\b/i;

// Removed PROMPTED_FRANCHISE_PATTERNS - no longer used after deprecating message parsing

export interface RecommendationsMemorySnapshot {
  lastFranchise: string | null;
  lastType: string | null;
  promptedFranchise: string | null;
  snapshotTimestamp?: number | null;
  snapshotSource?: string | null;
  snapshotItemCount?: number | null;
}

export interface RecommendationsMemoryUpdate {
  lastFranchise?: string | null;
  lastType?: string | null;
  snapshotTimestamp?: number | null;
  snapshotSource?: string | null;
  snapshotItemCount?: number | null;
}

export interface RecommendationContinuationResolution {
  forceRecommendationsIntent: boolean;
  rewrittenText: string;
  entitiesOverride: string[];
}

export function resolveRecommendationsMemoryFromHistory(
  historyRows: ConversationHistoryRow[],
): RecommendationsMemorySnapshot {
  let lastFranchise: string | null = null;
  let lastType: string | null = null;
  let promptedFranchise: string | null = null;
  let snapshotTimestamp: number | null = null;
  let snapshotSource: string | null = null;
  let snapshotItemCount: number | null = null;

  for (const row of historyRows) {
    if (row.sender !== 'bot') {
      continue;
    }

    if (isRecord(row.metadata)) {
      if (lastFranchise === null && RECOMMENDATIONS_LAST_FRANCHISE_METADATA_KEY in row.metadata) {
        lastFranchise = normalizeStringOrNull(
          row.metadata[RECOMMENDATIONS_LAST_FRANCHISE_METADATA_KEY],
        );
      }

      if (lastType === null && RECOMMENDATIONS_LAST_TYPE_METADATA_KEY in row.metadata) {
        lastType = normalizeStringOrNull(row.metadata[RECOMMENDATIONS_LAST_TYPE_METADATA_KEY]);
      }

      if (
        snapshotTimestamp === null &&
        RECOMMENDATIONS_SNAPSHOT_TIMESTAMP_METADATA_KEY in row.metadata
      ) {
        const v = row.metadata[RECOMMENDATIONS_SNAPSHOT_TIMESTAMP_METADATA_KEY];
        snapshotTimestamp = typeof v === 'number' ? v : null;
      }

      if (snapshotSource === null && RECOMMENDATIONS_SNAPSHOT_SOURCE_METADATA_KEY in row.metadata) {
        snapshotSource = normalizeStringOrNull(
          row.metadata[RECOMMENDATIONS_SNAPSHOT_SOURCE_METADATA_KEY],
        );
      }

      if (
        snapshotItemCount === null &&
        RECOMMENDATIONS_SNAPSHOT_ITEM_COUNT_METADATA_KEY in row.metadata
      ) {
        const v = row.metadata[RECOMMENDATIONS_SNAPSHOT_ITEM_COUNT_METADATA_KEY];
        snapshotItemCount = typeof v === 'number' ? v : null;
      }

      // Read prompted franchise from metadata instead of parsing message
      if (
        promptedFranchise === null &&
        RECOMMENDATIONS_PROMPTED_FRANCHISE_METADATA_KEY in row.metadata
      ) {
        promptedFranchise = normalizeStringOrNull(
          row.metadata[RECOMMENDATIONS_PROMPTED_FRANCHISE_METADATA_KEY],
        );
      }
    }

    // No fallback to message parsing - rely exclusively on metadata
    if (lastFranchise !== null && lastType !== null && promptedFranchise !== null) {
      break;
    }
  }

  return {
    lastFranchise,
    lastType,
    promptedFranchise,
    snapshotTimestamp,
    snapshotSource,
    snapshotItemCount,
  };
}

export function resolveRecommendationsMemoryUpdateFromContext(input: {
  contextBlocks: ContextBlock[];
  text: string;
  entities: string[];
}): RecommendationsMemoryUpdate {
  const recommendationsBlock = input.contextBlocks.find(
    (entry) => entry.contextType === 'recommendations',
  );

  if (recommendationsBlock && isRecord(recommendationsBlock.contextPayload)) {
    const products = Array.isArray(recommendationsBlock.contextPayload.products)
      ? recommendationsBlock.contextPayload.products
      : [];
    if (products.length > 0) {
      const matchedFranchises = parseStringArray(
        recommendationsBlock.contextPayload.matchedFranchises,
      );
      const preferences = isRecord(recommendationsBlock.contextPayload.preferences)
        ? recommendationsBlock.contextPayload.preferences
        : null;
      const preferenceTypes = parseStringArray(preferences?.type);
      const preferenceFranchises = parseStringArray(preferences?.franchiseKeywords);

      const lastFranchise =
        matchedFranchises[0] ??
        preferenceFranchises[0] ??
        resolveRecommendationFranchiseKeywords({
          text: input.text,
          entities: input.entities,
        })[0] ??
        null;

      return {
        lastFranchise,
        lastType: preferenceTypes[0] ?? null,
        snapshotTimestamp: Date.now(),
        snapshotSource: 'recommendations',
        snapshotItemCount: products.length,
      };
    }
  }

  const productsBlock = input.contextBlocks.find((entry) => entry.contextType === 'products');
  if (!productsBlock || !isRecord(productsBlock.contextPayload)) {
    return {};
  }

  const items = Array.isArray(productsBlock.contextPayload.items)
    ? productsBlock.contextPayload.items
    : [];
  if (items.length === 0) {
    return {};
  }

  const resolvedQuery = isRecord(productsBlock.contextPayload.resolvedQuery)
    ? productsBlock.contextPayload.resolvedQuery
    : null;
  const queryText = normalizeStringOrNull(resolvedQuery?.productName) ?? input.text;
  const detectedFranchise =
    resolveRecommendationFranchiseKeywords({
      text: queryText,
      entities: input.entities,
    })[0] ?? null;
  const detectedType =
    resolveRecommendationsPreferences({
      text: input.text,
      entities: input.entities,
    }).type[0] ?? null;

  if (detectedFranchise === null && detectedType === null) {
    return {};
  }

  return {
    lastFranchise: detectedFranchise,
    lastType: detectedType,
    snapshotTimestamp: Date.now(),
    snapshotSource: 'products',
    snapshotItemCount: items.length,
  };
}

export function resolveRecommendationContinuation(input: {
  text: string;
  entities: string[];
  routedIntent: string;
  memory: RecommendationsMemorySnapshot;
}): RecommendationContinuationResolution {
  const explicitFranchises = resolveRecommendationFranchiseKeywords({
    text: input.text,
    entities: input.entities,
  });
  const normalizedText = normalizeTextForSearch(input.text);
  const isShortAck = SHORT_ACK_TERMS.has(normalizedText);
  const hasContinuationSignal =
    isShortAck || CONTINUATION_PATTERNS.some((pattern) => pattern.test(normalizedText));
  const hasCatalogSignals =
    explicitFranchises.length > 0 || CATALOG_SIGNAL_PATTERN.test(normalizedText);

  let continuationFranchise = resolveContinuationFranchise({
    explicitFranchise: explicitFranchises[0] ?? null,
    isShortAck,
    hasContinuationSignal,
    memory: input.memory,
  });

  if (
    continuationFranchise !== null &&
    explicitFranchises.length === 0 &&
    hasContinuationSignal &&
    !isSnapshotFresh(input.memory)
  ) {
    continuationFranchise = input.memory.promptedFranchise;
  }

  if (
    continuationFranchise !== null &&
    isShortAck &&
    input.memory.promptedFranchise === null &&
    !isSnapshotFresh(input.memory)
  ) {
    continuationFranchise = null;
  }

  const shouldForceRecommendationsIntent =
    input.routedIntent === 'recommendations' ||
    (input.routedIntent === 'general' &&
      (hasCatalogSignals ||
        (isShortAck && input.memory.promptedFranchise !== null) ||
        (hasContinuationSignal && input.memory.lastFranchise !== null)));

  if (!continuationFranchise || explicitFranchises.length > 0) {
    return {
      forceRecommendationsIntent: shouldForceRecommendationsIntent,
      rewrittenText: input.text,
      entitiesOverride: input.entities,
    };
  }

  if (!hasContinuationSignal && input.routedIntent !== 'general') {
    return {
      forceRecommendationsIntent: shouldForceRecommendationsIntent,
      rewrittenText: input.text,
      entitiesOverride: input.entities,
    };
  }

  const queryFranchise = normalizeFranchiseQuery(continuationFranchise);
  const rewrittenText = isShortAck
    ? `quiero ver productos de ${queryFranchise}`
    : appendFranchiseToText(input.text, queryFranchise);

  return {
    forceRecommendationsIntent: shouldForceRecommendationsIntent,
    rewrittenText,
    entitiesOverride: appendEntity(input.entities, queryFranchise),
  };
}

const DEFAULT_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;

export function isSnapshotFresh(
  memory: Pick<RecommendationsMemorySnapshot, 'snapshotTimestamp'>,
  maxAgeMs: number = DEFAULT_SNAPSHOT_MAX_AGE_MS,
): boolean {
  const ts = memory.snapshotTimestamp;
  if (ts == null || typeof ts !== 'number') return false;
  return Date.now() - ts <= maxAgeMs;
}

export function buildRecommendationsMemoryMetadata(input: {
  lastFranchise?: string | null;
  lastType?: string | null;
  snapshotTimestamp?: number | null;
  snapshotSource?: string | null;
  snapshotItemCount?: number | null;
  promptedFranchise?: string | null;
}): Record<string, unknown> {
  const hasAny =
    input.lastFranchise !== undefined ||
    input.lastType !== undefined ||
    input.snapshotTimestamp !== undefined ||
    input.snapshotSource !== undefined ||
    input.snapshotItemCount !== undefined ||
    input.promptedFranchise !== undefined;
  if (!hasAny) return {};

  const result: Record<string, unknown> = {
    [RECOMMENDATIONS_LAST_FRANCHISE_METADATA_KEY]: input.lastFranchise ?? null,
    [RECOMMENDATIONS_LAST_TYPE_METADATA_KEY]: input.lastType ?? null,
  };
  if (input.snapshotTimestamp !== undefined) {
    result[RECOMMENDATIONS_SNAPSHOT_TIMESTAMP_METADATA_KEY] = input.snapshotTimestamp ?? null;
  }
  if (input.snapshotSource !== undefined) {
    result[RECOMMENDATIONS_SNAPSHOT_SOURCE_METADATA_KEY] = input.snapshotSource ?? null;
  }
  if (input.snapshotItemCount !== undefined) {
    result[RECOMMENDATIONS_SNAPSHOT_ITEM_COUNT_METADATA_KEY] = input.snapshotItemCount ?? null;
  }
  if (input.promptedFranchise !== undefined) {
    result[RECOMMENDATIONS_PROMPTED_FRANCHISE_METADATA_KEY] = input.promptedFranchise ?? null;
  }
  return result;
}

function resolveContinuationFranchise(input: {
  explicitFranchise: string | null;
  isShortAck: boolean;
  hasContinuationSignal: boolean;
  memory: RecommendationsMemorySnapshot;
}): string | null {
  if (input.explicitFranchise) {
    return input.explicitFranchise;
  }

  if (input.isShortAck) {
    return input.memory.promptedFranchise ?? input.memory.lastFranchise;
  }

  if (input.hasContinuationSignal) {
    return input.memory.lastFranchise;
  }

  return null;
}

function appendFranchiseToText(text: string, franchise: string): string {
  const normalizedText = normalizeTextForSearch(text);
  const normalizedFranchise = normalizeTextForSearch(franchise);

  if (
    normalizedFranchise.length > 0 &&
    containsNormalizedTerm(normalizedText, normalizedFranchise)
  ) {
    return text;
  }

  return `${text} de ${franchise}`;
}

function normalizeFranchiseQuery(value: string): string {
  return value.replace(/_/g, ' ').trim();
}

function appendEntity(entities: string[], candidate: string): string[] {
  const normalizedCandidate = normalizeTextForSearch(candidate);
  if (normalizedCandidate.length === 0) {
    return entities;
  }

  for (const entity of entities) {
    if (normalizeTextForSearch(entity) === normalizedCandidate) {
      return entities;
    }
  }

  return [...entities, candidate];
}

function normalizeStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}
