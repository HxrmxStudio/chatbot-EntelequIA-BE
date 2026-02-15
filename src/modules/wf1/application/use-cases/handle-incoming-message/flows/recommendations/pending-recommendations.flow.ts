import type { Wf1Response } from '@/modules/wf1/domain/wf1-response';
import {
  buildRecommendationsUnknownFollowupResponse,
  buildRecommendationsVolumeDisambiguationResponse,
  formatRecommendationCategoryLabel,
} from '../../responses/recommendations/recommendations-disambiguation-response';
import { buildRecommendationsRewriteText } from '../../support/handle-incoming-message.helpers';
import {
  type RecommendationDisambiguationState,
  type RecommendationFlowStateSnapshot,
  resolveRecommendationFollowup,
} from './resolve-recommendations-flow-state';

export interface PendingRecommendationFlowResult {
  response: Wf1Response | undefined;
  rewrittenText: string;
  entitiesOverride: string[];
  nextState: RecommendationDisambiguationState;
  nextFranchise: string | null;
  nextCategoryHint: string | null;
  resolved: boolean;
}

export function handlePendingRecommendationsFlow(input: {
  currentFlow: RecommendationFlowStateSnapshot;
  text: string;
  entities: string[];
}): PendingRecommendationFlowResult {
  const followup = resolveRecommendationFollowup({
    text: input.text,
    entities: input.entities,
  });

  if (!followup.hasSignals) {
    return {
      response: undefined,
      rewrittenText: input.text,
      entitiesOverride: input.entities,
      nextState: input.currentFlow.state,
      nextFranchise: input.currentFlow.franchise,
      nextCategoryHint: input.currentFlow.categoryHint,
      resolved: false,
    };
  }

  const franchise = followup.mentionedFranchise ?? input.currentFlow.franchise;
  if (!franchise) {
    return {
      response: undefined,
      rewrittenText: input.text,
      entitiesOverride: input.entities,
      nextState: null,
      nextFranchise: null,
      nextCategoryHint: null,
      resolved: false,
    };
  }

  if (input.currentFlow.state === 'awaiting_category_or_volume') {
    return handleAwaitingCategoryOrVolume({
      input,
      followup,
      franchise,
    });
  }

  if (input.currentFlow.state === 'awaiting_volume_detail') {
    return handleAwaitingVolumeDetail({
      input,
      followup,
      franchise,
    });
  }

  return {
    response: undefined,
    rewrittenText: input.text,
    entitiesOverride: input.entities,
    nextState: null,
    nextFranchise: null,
    nextCategoryHint: null,
    resolved: false,
  };
}

function handleAwaitingCategoryOrVolume(input: {
  input: {
    currentFlow: RecommendationFlowStateSnapshot;
    text: string;
    entities: string[];
  };
  followup: ReturnType<typeof resolveRecommendationFollowup>;
  franchise: string;
}): PendingRecommendationFlowResult {
  const categoryHint = input.followup.requestedType ?? input.input.currentFlow.categoryHint;

  if (input.followup.volumeNumber || input.followup.wantsLatest || input.followup.wantsStart) {
    return {
      response: undefined,
      rewrittenText: buildRecommendationsRewriteText({
        franchise: input.franchise,
        categoryHint,
        volumeNumber: input.followup.volumeNumber,
        wantsLatest: input.followup.wantsLatest,
        wantsStart: input.followup.wantsStart,
      }),
      entitiesOverride: [input.franchise],
      nextState: null,
      nextFranchise: null,
      nextCategoryHint: null,
      resolved: true,
    };
  }

  if (categoryHint) {
    const categoryLabel = formatRecommendationCategoryLabel(categoryHint);
    if (categoryHint === 'mangas' || categoryHint === 'comics') {
      return {
        response: buildRecommendationsVolumeDisambiguationResponse({
          franchiseLabel: input.franchise.replace(/_/g, ' '),
          categoryLabel,
        }),
        rewrittenText: input.input.text,
        entitiesOverride: input.input.entities,
        nextState: 'awaiting_volume_detail',
        nextFranchise: input.franchise,
        nextCategoryHint: categoryHint,
        resolved: false,
      };
    }

    return {
      response: undefined,
      rewrittenText: buildRecommendationsRewriteText({
        franchise: input.franchise,
        categoryHint,
        volumeNumber: null,
        wantsLatest: false,
        wantsStart: false,
      }),
      entitiesOverride: [input.franchise],
      nextState: null,
      nextFranchise: null,
      nextCategoryHint: null,
      resolved: true,
    };
  }

  return {
    response: buildRecommendationsUnknownFollowupResponse({
      franchiseLabel: input.franchise.replace(/_/g, ' '),
      state: 'awaiting_category_or_volume',
    }),
    rewrittenText: input.input.text,
    entitiesOverride: input.input.entities,
    nextState: 'awaiting_category_or_volume',
    nextFranchise: input.franchise,
    nextCategoryHint: null,
    resolved: false,
  };
}

function handleAwaitingVolumeDetail(input: {
  input: {
    currentFlow: RecommendationFlowStateSnapshot;
    text: string;
    entities: string[];
  };
  followup: ReturnType<typeof resolveRecommendationFollowup>;
  franchise: string;
}): PendingRecommendationFlowResult {
  const categoryHint = input.input.currentFlow.categoryHint ?? input.followup.requestedType;

  if (input.followup.volumeNumber || input.followup.wantsLatest || input.followup.wantsStart) {
    return {
      response: undefined,
      rewrittenText: buildRecommendationsRewriteText({
        franchise: input.franchise,
        categoryHint,
        volumeNumber: input.followup.volumeNumber,
        wantsLatest: input.followup.wantsLatest,
        wantsStart: input.followup.wantsStart,
      }),
      entitiesOverride: [input.franchise],
      nextState: null,
      nextFranchise: null,
      nextCategoryHint: null,
      resolved: true,
    };
  }

  return {
    response: buildRecommendationsUnknownFollowupResponse({
      franchiseLabel: input.franchise.replace(/_/g, ' '),
      state: 'awaiting_volume_detail',
      categoryLabel: formatRecommendationCategoryLabel(categoryHint),
    }),
    rewrittenText: input.input.text,
    entitiesOverride: input.input.entities,
    nextState: 'awaiting_volume_detail',
    nextFranchise: input.franchise,
    nextCategoryHint: categoryHint,
    resolved: false,
  };
}
