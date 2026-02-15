import { isRecord } from '@/common/utils/object.utils';
import type { ConversationHistoryRow } from '@/modules/wf1/domain/conversation-history';
import {
  resolveRecommendationFranchiseKeywords,
  resolveRecommendationVolumeSignals,
  resolveRecommendationsPreferences,
} from '../../../enrich-context-by-intent/query-resolvers';

export const RECOMMENDATIONS_FLOW_STATE_METADATA_KEY = 'recommendationsFlowState';
export const RECOMMENDATIONS_FLOW_FRANCHISE_METADATA_KEY = 'recommendationsFlowFranchise';
export const RECOMMENDATIONS_FLOW_CATEGORY_HINT_METADATA_KEY =
  'recommendationsFlowCategoryHint';

export type RecommendationDisambiguationState =
  | 'awaiting_category_or_volume'
  | 'awaiting_volume_detail'
  | null;

export interface RecommendationFlowStateSnapshot {
  state: RecommendationDisambiguationState;
  franchise: string | null;
  categoryHint: string | null;
}

export interface ResolvedRecommendationFollowup {
  hasSignals: boolean;
  requestedType: string | null;
  volumeNumber: number | null;
  wantsLatest: boolean;
  wantsStart: boolean;
  mentionedFranchise: string | null;
}

export function resolveRecommendationFlowStateFromHistory(
  historyRows: ConversationHistoryRow[],
): RecommendationFlowStateSnapshot {
  for (const row of historyRows) {
    if (row.sender !== 'bot') {
      continue;
    }

    const parsed = parseRecommendationsFlowMetadata(row.metadata);
    if (parsed) {
      return parsed;
    }
  }

  return {
    state: null,
    franchise: null,
    categoryHint: null,
  };
}

export function resolveRecommendationFollowup(input: {
  text: string;
  entities: string[];
}): ResolvedRecommendationFollowup {
  const preferences = resolveRecommendationsPreferences({
    text: input.text,
    entities: input.entities,
  });
  const volumeSignals = resolveRecommendationVolumeSignals(input.text);
  const franchises = resolveRecommendationFranchiseKeywords({
    text: input.text,
    entities: input.entities,
  });

  const requestedType = preferences.type[0] ?? null;
  const mentionedFranchise = franchises[0] ?? null;

  return {
    hasSignals:
      Boolean(requestedType) ||
      volumeSignals.hasVolumeSignal ||
      Boolean(mentionedFranchise),
    requestedType,
    volumeNumber: volumeSignals.volumeNumber,
    wantsLatest: volumeSignals.wantsLatest,
    wantsStart: volumeSignals.wantsStart,
    mentionedFranchise,
  };
}

/** Phrases that are polite closings / thanks; do not treat as continuing recommendations flow. */
const POLITE_CLOSING_PATTERN = /^(?:gracias(?:\s+por\s+la\s+ayuda)?|muchas\s+gracias|ok\s+gracias|genial\s+gracias|perfecto\s+gracias|dale\s+gracias)\s*$/i;

export function isPoliteClosing(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, ' ');
  return POLITE_CLOSING_PATTERN.test(normalized);
}

export function shouldContinueRecommendationsFlow(input: {
  currentFlowState: RecommendationDisambiguationState;
  text: string;
  entities: string[];
}): boolean {
  if (input.currentFlowState === null) {
    return false;
  }

  const normalized = input.text.trim().replace(/\s+/g, ' ');
  if (POLITE_CLOSING_PATTERN.test(normalized)) {
    return false;
  }

  return resolveRecommendationFollowup({
    text: input.text,
    entities: input.entities,
  }).hasSignals;
}

function parseRecommendationsFlowMetadata(
  metadata: unknown,
): RecommendationFlowStateSnapshot | null {
  if (!isRecord(metadata)) {
    return null;
  }

  if (!(RECOMMENDATIONS_FLOW_STATE_METADATA_KEY in metadata)) {
    return null;
  }

  const stateValue = metadata[RECOMMENDATIONS_FLOW_STATE_METADATA_KEY];
  const parsedState = parseRecommendationFlowState(stateValue);

  return {
    state: parsedState,
    franchise: parseStringOrNull(metadata[RECOMMENDATIONS_FLOW_FRANCHISE_METADATA_KEY]),
    categoryHint: parseStringOrNull(metadata[RECOMMENDATIONS_FLOW_CATEGORY_HINT_METADATA_KEY]),
  };
}

function parseRecommendationFlowState(value: unknown): RecommendationDisambiguationState {
  if (
    value === 'awaiting_category_or_volume' ||
    value === 'awaiting_volume_detail' ||
    value === null
  ) {
    return value;
  }

  return null;
}

function parseStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
