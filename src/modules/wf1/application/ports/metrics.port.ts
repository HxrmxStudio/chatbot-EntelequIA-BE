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

  incrementOrdersBackendCall?(input: {
    endpoint: '/account/orders' | '/account/orders/{id}';
    outcome: 'succeeded' | 'failed';
    statusCode: number;
  }): void;

  observeOrdersBackendLatency?(input: {
    endpoint: '/account/orders' | '/account/orders/{id}';
    seconds: number;
  }): void;

  incrementOutputTechnicalTermsSanitized(): void;

  incrementCriticalPolicyContextInjected(input: { intent: string }): void;

  incrementCriticalPolicyContextTrimmed(input: { intent: string }): void;

  incrementPromptContextTruncated(input: { intent: string; strategy: string }): void;

  incrementReturnsPolicyDirectAnswer(): void;

  incrementPolicyDirectAnswer(input: { policyType: string }): void;

  incrementScopeRedirect(input: { reason: string }): void;

  incrementFeedbackReceived(rating: 'up' | 'down'): void;

  incrementFeedbackWithCategory(input: { category: string }): void;

  incrementUiPayloadEmitted(): void;

  incrementUiPayloadSuppressed(reason: 'flag_off' | 'no_cards' | 'duplicate'): void;

  incrementLearningAutopromote(): void;

  incrementLearningAutorollback(): void;

  incrementExemplarsUsedInPrompt(input: { intent: string; source: string }): void;

  incrementOpenAiRequest(input: { model: string; intent: string; path: string }): void;

  addOpenAiInputTokens(input: { model: string; tokens: number | null }): void;

  addOpenAiOutputTokens(input: { model: string; tokens: number | null }): void;

  addOpenAiCachedTokens(input: { model: string; tokens: number | null }): void;

  addOpenAiEstimatedCostUsd(input: { model: string; amountUsd: number }): void;

  incrementEvalBatchSubmitted(): void;

  incrementEvalBatchCompleted(): void;

  incrementEvalBatchFailed(): void;
}
