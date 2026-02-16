export type { DetectedProductCategory, ResolvedProductsQuery } from './types';
export { detectProductCategory } from './detect-category';
export { resolveProductsQuery } from './resolve-products';
export { resolveOrderId } from './resolve-order';
export { resolvePaymentShippingQueryType } from './resolve-payment-shipping-query-type';
export { resolveRecommendationsPreferences } from './resolve-recommendations-preferences';
export { resolveTicketSignals } from './resolve-ticket-signals';
export { resolveStoreInfoQueryType } from './resolve-store-info-query-type';
export { getDefaultCategorySlug } from './recommendation-type-slugs';
export { resolveStockDisclosure } from './resolve-stock-disclosure';
export {
  buildDynamicFranchiseAliases,
  getRecommendationFranchiseTerms,
  resolveRecommendationFranchiseQuery,
  resolveRecommendationFranchiseKeywords,
} from './recommendation-franchise-keywords';
export {
  resolveRecommendationDisambiguation,
  resolveRecommendationVolumeSignals,
  type RecommendationDisambiguationResult,
  type RecommendationDisambiguationReason,
} from './resolve-recommendation-disambiguation';
export {
  resolveRecommendationEditorialMatch,
  type RecommendationEditorialMatchResult,
} from './resolve-recommendation-editorial-match';
