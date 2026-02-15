import type { Logger } from '@/common/utils/logger';
import type { MetricsPort } from '@/modules/wf1/application/ports/metrics.port';
import {
  getContextStringArrayField,
  getContextStringField,
} from '../../support/handle-incoming-message.helpers';

export function recordRecommendationsObservability(input: {
  requestId: string;
  conversationId: string;
  intent: string;
  contextBlocks: Array<{ contextType: string; contextPayload: Record<string, unknown> }>;
  logger: Pick<Logger, 'chat'>;
  metricsPort: MetricsPort;
}): void {
  if (input.intent !== 'recommendations') {
    return;
  }

  const recommendationsBlock = input.contextBlocks.find(
    (block) => block.contextType === 'recommendations',
  );
  if (!recommendationsBlock) {
    return;
  }

  const fallbackReason = getContextStringField(
    recommendationsBlock.contextPayload,
    'fallbackReason',
  );
  const matchedFranchises = getContextStringArrayField(
    recommendationsBlock.contextPayload,
    'matchedFranchises',
  );
  const matchedBrands = getContextStringArrayField(
    recommendationsBlock.contextPayload,
    'matchedBrands',
  );
  const suggestedBrands = getContextStringArrayField(
    recommendationsBlock.contextPayload,
    'suggestedBrands',
  );

  input.logger.chat('recommendations_context_built', {
    event: 'recommendations_context_built',
    request_id: input.requestId,
    conversation_id: input.conversationId,
    intent: input.intent,
    fallback_reason: fallbackReason ?? 'none',
    catalog_status: fallbackReason === 'catalog_unavailable' ? 'degraded' : 'ok',
    matched_franchises_count: matchedFranchises.length,
    matched_brands_count: matchedBrands.length,
    suggested_brands_count: suggestedBrands.length,
  });

  if (matchedFranchises.length > 0) {
    input.metricsPort.incrementRecommendationsFranchiseMatch();
  }

  if (matchedBrands.length > 0) {
    input.metricsPort.incrementRecommendationsEditorialMatch();
  }

  if (suggestedBrands.length > 0) {
    input.metricsPort.incrementRecommendationsEditorialSuggested();
  }

  if (fallbackReason === 'catalog_unavailable') {
    input.metricsPort.incrementRecommendationsCatalogDegraded();
    return;
  }

  if (fallbackReason === 'no_matches') {
    input.metricsPort.incrementRecommendationsNoMatch();
  }
}
