import type { Wf1Response } from '@/modules/wf1/domain/wf1-response';
import {
  buildRecommendationsFranchiseDisambiguationResponse,
  buildRecommendationsVolumeDisambiguationResponse,
  formatRecommendationCategoryLabel,
} from '../../responses/recommendations/recommendations-disambiguation-response';
import type { RecommendationDisambiguationState } from './resolve-recommendations-flow-state';

export interface RecommendationsContextDisambiguationResult {
  response: Wf1Response;
  nextState: RecommendationDisambiguationState;
  nextFranchise: string | null;
  nextCategoryHint: string | null;
}

export function buildRecommendationsDisambiguationResponseFromContext(input: {
  contextBlocks:
    | Array<{ contextType: string; contextPayload: Record<string, unknown> }>
    | undefined;
}): RecommendationsContextDisambiguationResult | null {
  if (!Array.isArray(input.contextBlocks)) {
    return null;
  }

  const block = input.contextBlocks.find((entry) => entry.contextType === 'recommendations');
  if (!block) {
    return null;
  }

  const needsDisambiguation = block.contextPayload['needsDisambiguation'] === true;
  if (!needsDisambiguation) {
    return null;
  }

  const reason =
    typeof block.contextPayload['disambiguationReason'] === 'string'
      ? block.contextPayload['disambiguationReason']
      : null;
  const franchise =
    typeof block.contextPayload['disambiguationFranchise'] === 'string'
      ? block.contextPayload['disambiguationFranchise']
      : null;
  const suggestedTypes = Array.isArray(block.contextPayload['disambiguationSuggestedTypes'])
    ? (block.contextPayload['disambiguationSuggestedTypes'] as unknown[]).filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      )
    : [];
  const totalCandidates =
    typeof block.contextPayload['disambiguationTotalCandidates'] === 'number'
      ? block.contextPayload['disambiguationTotalCandidates']
      : 0;

  if (!franchise) {
    return null;
  }

  if (reason === 'volume_scope') {
    const categoryHint = suggestedTypes[0] ?? 'mangas';
    return {
      response: buildRecommendationsVolumeDisambiguationResponse({
        franchiseLabel: franchise.replace(/_/g, ' '),
        categoryLabel: formatRecommendationCategoryLabel(categoryHint),
      }),
      nextState: 'awaiting_volume_detail',
      nextFranchise: franchise,
      nextCategoryHint: categoryHint,
    };
  }

  return {
    response: buildRecommendationsFranchiseDisambiguationResponse({
      franchiseLabel: franchise.replace(/_/g, ' '),
      totalCandidates,
      suggestedTypes,
    }),
    nextState: 'awaiting_category_or_volume',
    nextFranchise: franchise,
    nextCategoryHint: null,
  };
}
