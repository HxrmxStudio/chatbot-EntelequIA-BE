export interface MetricsPort {
  incrementMessage(input: {
    source: string;
    intent: string;
    llmPath: string;
  }): void;

  observeResponseLatency(input: {
    intent: string;
    seconds: number;
  }): void;

  incrementFallback(reason: string): void;

  incrementStockExactDisclosure(): void;

  incrementOrderLookupRateLimited(scope: 'ip' | 'user' | 'order' | 'backend'): void;

  incrementOrderLookupRateLimitDegraded(): void;

  incrementOrderLookupVerificationFailed(): void;

  incrementRecommendationsFranchiseMatch(): void;

  incrementRecommendationsCatalogDegraded(): void;

  incrementRecommendationsNoMatch(): void;

  incrementRecommendationsDisambiguationTriggered(): void;

  incrementRecommendationsDisambiguationResolved(): void;

  incrementRecommendationsEditorialMatch(): void;

  incrementRecommendationsEditorialSuggested(): void;

  incrementOrderFlowAmbiguousAck(): void;

  incrementOrderFlowHijackPrevented(): void;

  incrementOutputTechnicalTermsSanitized(): void;

  incrementFeedbackReceived(rating: 'up' | 'down'): void;

  incrementUiPayloadEmitted(): void;

  incrementUiPayloadSuppressed(reason: 'flag_off' | 'no_cards' | 'duplicate'): void;

  incrementLearningAutopromote(): void;

  incrementLearningAutorollback(): void;
}
