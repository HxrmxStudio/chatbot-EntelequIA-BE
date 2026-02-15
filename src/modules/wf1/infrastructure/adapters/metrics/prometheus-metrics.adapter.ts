import { Injectable } from '@nestjs/common';
import type { MetricsPort } from '@/modules/wf1/application/ports/metrics.port';
import {
  WF1_METRIC_CRITICAL_POLICY_CONTEXT_INJECTED_TOTAL,
  WF1_METRIC_CRITICAL_POLICY_CONTEXT_TRIMMED_TOTAL,
  WF1_METRIC_EXEMPLARS_USED_IN_PROMPT_TOTAL,
  WF1_METRIC_FEEDBACK_NEGATIVE_TOTAL,
  WF1_METRIC_FEEDBACK_RECEIVED_TOTAL,
  WF1_METRIC_FEEDBACK_WITH_CATEGORY_TOTAL,
  WF1_METRIC_FALLBACK_TOTAL,
  WF1_METRIC_LEARNING_AUTOPROMOTE_TOTAL,
  WF1_METRIC_LEARNING_AUTOROLLBACK_TOTAL,
  WF1_METRIC_MESSAGES_TOTAL,
  WF1_METRIC_OPENAI_CACHED_TOKENS_TOTAL,
  WF1_METRIC_OPENAI_ESTIMATED_COST_USD_TOTAL,
  WF1_METRIC_OPENAI_INPUT_TOKENS_TOTAL,
  WF1_METRIC_OPENAI_OUTPUT_TOKENS_TOTAL,
  WF1_METRIC_OPENAI_REQUESTS_TOTAL,
  WF1_METRIC_ORDER_FLOW_AMBIGUOUS_ACK_TOTAL,
  WF1_METRIC_ORDER_FLOW_HIJACK_PREVENTED_TOTAL,
  WF1_METRIC_ORDER_LOOKUP_RATE_LIMIT_DEGRADED_TOTAL,
  WF1_METRIC_ORDER_LOOKUP_RATE_LIMITED_TOTAL,
  WF1_METRIC_ORDER_LOOKUP_VERIFICATION_FAILED_TOTAL,
  WF1_METRIC_ORDERS_BACKEND_CALLS_TOTAL,
  WF1_METRIC_ORDERS_BACKEND_LATENCY_SECONDS,
  WF1_METRIC_OUTPUT_TECHNICAL_TERMS_SANITIZED_TOTAL,
  WF1_METRIC_POLICY_DIRECT_ANSWER_TOTAL,
  WF1_METRIC_PROMPT_CONTEXT_TRUNCATED_TOTAL,
  WF1_METRIC_RETURNS_POLICY_DIRECT_ANSWER_TOTAL,
  WF1_METRIC_RECOMMENDATIONS_CATALOG_DEGRADED_TOTAL,
  WF1_METRIC_RECOMMENDATIONS_DISAMBIGUATION_RESOLVED_TOTAL,
  WF1_METRIC_RECOMMENDATIONS_DISAMBIGUATION_TRIGGERED_TOTAL,
  WF1_METRIC_RECOMMENDATIONS_EDITORIAL_MATCH_TOTAL,
  WF1_METRIC_RECOMMENDATIONS_EDITORIAL_SUGGESTED_TOTAL,
  WF1_METRIC_RECOMMENDATIONS_FRANCHISE_MATCH_TOTAL,
  WF1_METRIC_RECOMMENDATIONS_NO_MATCH_TOTAL,
  WF1_METRIC_RESPONSE_LATENCY_SECONDS,
  WF1_METRIC_SCOPE_REDIRECT_TOTAL,
  WF1_METRIC_STOCK_EXACT_DISCLOSURE_TOTAL,
  WF1_METRIC_UI_PAYLOAD_EMITTED_TOTAL,
  WF1_METRIC_UI_PAYLOAD_SUPPRESSED_TOTAL,
  WF1_METRIC_EVAL_BATCH_COMPLETED_TOTAL,
  WF1_METRIC_EVAL_BATCH_FAILED_TOTAL,
  WF1_METRIC_EVAL_BATCH_SUBMITTED_TOTAL,
  WF1_RESPONSE_LATENCY_BUCKETS,
} from '@/common/metrics';

@Injectable()
export class PrometheusMetricsAdapter implements MetricsPort {
  private readonly messages = new Map<string, number>();
  private readonly fallbacks = new Map<string, number>();
  private readonly stockExactDisclosure = new Map<string, number>();
  private readonly orderLookupRateLimited = new Map<string, number>();
  private orderLookupRateLimitDegraded = 0;
  private orderLookupVerificationFailed = 0;
  private recommendationsFranchiseMatch = 0;
  private recommendationsCatalogDegraded = 0;
  private recommendationsNoMatch = 0;
  private recommendationsDisambiguationTriggered = 0;
  private recommendationsDisambiguationResolved = 0;
  private recommendationsEditorialMatch = 0;
  private recommendationsEditorialSuggested = 0;
  private orderFlowAmbiguousAck = 0;
  private orderFlowHijackPrevented = 0;
  private readonly ordersBackendCalls = new Map<string, number>();
  private readonly ordersBackendLatencyBuckets = new Map<string, number>();
  private readonly ordersBackendLatencySum = new Map<string, number>();
  private readonly ordersBackendLatencyCount = new Map<string, number>();
  private outputTechnicalTermsSanitized = 0;
  private readonly criticalPolicyContextInjected = new Map<string, number>();
  private readonly criticalPolicyContextTrimmed = new Map<string, number>();
  private readonly promptContextTruncated = new Map<string, number>();
  private returnsPolicyDirectAnswer = 0;
  private readonly policyDirectAnswers = new Map<string, number>();
  private readonly scopeRedirects = new Map<string, number>();
  private feedbackReceived = new Map<string, number>();
  private feedbackNegative = 0;
  private readonly feedbackWithCategory = new Map<string, number>();
  private uiPayloadEmitted = 0;
  private readonly uiPayloadSuppressed = new Map<string, number>();
  private learningAutopromote = 0;
  private learningAutorollback = 0;
  private readonly exemplarsUsedInPrompt = new Map<string, number>();
  private readonly openAiRequests = new Map<string, number>();
  private readonly openAiInputTokens = new Map<string, number>();
  private readonly openAiOutputTokens = new Map<string, number>();
  private readonly openAiCachedTokens = new Map<string, number>();
  private readonly openAiEstimatedCostUsd = new Map<string, number>();
  private evalBatchSubmitted = 0;
  private evalBatchCompleted = 0;
  private evalBatchFailed = 0;

  private readonly latencyBuckets = new Map<string, number>();
  private readonly latencySum = new Map<string, number>();
  private readonly latencyCount = new Map<string, number>();

  incrementMessage(input: { source: string; intent: string; llmPath: string }): void {
    const key = `${sanitizeLabelValue(input.source)}|${sanitizeLabelValue(input.intent)}|${sanitizeLabelValue(input.llmPath)}`;
    this.messages.set(key, (this.messages.get(key) ?? 0) + 1);
  }

  observeResponseLatency(input: { intent: string; seconds: number }): void {
    const intent = sanitizeLabelValue(input.intent);
    const latency = Number.isFinite(input.seconds) && input.seconds >= 0 ? input.seconds : 0;

    this.latencySum.set(intent, (this.latencySum.get(intent) ?? 0) + latency);
    this.latencyCount.set(intent, (this.latencyCount.get(intent) ?? 0) + 1);

    for (const bucket of WF1_RESPONSE_LATENCY_BUCKETS) {
      if (latency <= bucket) {
        const key = `${intent}|${bucket}`;
        this.latencyBuckets.set(key, (this.latencyBuckets.get(key) ?? 0) + 1);
      }
    }

    const infKey = `${intent}|+Inf`;
    this.latencyBuckets.set(infKey, (this.latencyBuckets.get(infKey) ?? 0) + 1);
  }

  incrementFallback(reason: string): void {
    const key = sanitizeLabelValue(reason);
    this.fallbacks.set(key, (this.fallbacks.get(key) ?? 0) + 1);
  }

  incrementStockExactDisclosure(): void {
    const key = 'exact';
    this.stockExactDisclosure.set(key, (this.stockExactDisclosure.get(key) ?? 0) + 1);
  }

  incrementOrderLookupRateLimited(scope: 'ip' | 'user' | 'order' | 'backend'): void {
    const key = sanitizeLabelValue(scope);
    this.orderLookupRateLimited.set(key, (this.orderLookupRateLimited.get(key) ?? 0) + 1);
  }

  incrementOrderLookupRateLimitDegraded(): void {
    this.orderLookupRateLimitDegraded += 1;
  }

  incrementOrderLookupVerificationFailed(): void {
    this.orderLookupVerificationFailed += 1;
  }

  incrementRecommendationsFranchiseMatch(): void {
    this.recommendationsFranchiseMatch += 1;
  }

  incrementRecommendationsCatalogDegraded(): void {
    this.recommendationsCatalogDegraded += 1;
  }

  incrementRecommendationsNoMatch(): void {
    this.recommendationsNoMatch += 1;
  }

  incrementRecommendationsDisambiguationTriggered(): void {
    this.recommendationsDisambiguationTriggered += 1;
  }

  incrementRecommendationsDisambiguationResolved(): void {
    this.recommendationsDisambiguationResolved += 1;
  }

  incrementRecommendationsEditorialMatch(): void {
    this.recommendationsEditorialMatch += 1;
  }

  incrementRecommendationsEditorialSuggested(): void {
    this.recommendationsEditorialSuggested += 1;
  }

  incrementOrderFlowAmbiguousAck(): void {
    this.orderFlowAmbiguousAck += 1;
  }

  incrementOrderFlowHijackPrevented(): void {
    this.orderFlowHijackPrevented += 1;
  }

  incrementOrdersBackendCall(input: {
    endpoint: '/account/orders' | '/account/orders/{id}';
    outcome: 'succeeded' | 'failed';
    statusCode: number;
  }): void {
    const endpoint = sanitizeLabelValue(input.endpoint);
    const outcome = sanitizeLabelValue(input.outcome);
    const statusCode =
      Number.isFinite(input.statusCode) && input.statusCode >= 0
        ? String(Math.trunc(input.statusCode))
        : '0';
    const key = `${endpoint}|${outcome}|${statusCode}`;
    this.ordersBackendCalls.set(key, (this.ordersBackendCalls.get(key) ?? 0) + 1);
  }

  observeOrdersBackendLatency(input: {
    endpoint: '/account/orders' | '/account/orders/{id}';
    seconds: number;
  }): void {
    const endpoint = sanitizeLabelValue(input.endpoint);
    const latency = Number.isFinite(input.seconds) && input.seconds >= 0 ? input.seconds : 0;

    this.ordersBackendLatencySum.set(
      endpoint,
      (this.ordersBackendLatencySum.get(endpoint) ?? 0) + latency,
    );
    this.ordersBackendLatencyCount.set(
      endpoint,
      (this.ordersBackendLatencyCount.get(endpoint) ?? 0) + 1,
    );

    for (const bucket of WF1_RESPONSE_LATENCY_BUCKETS) {
      if (latency <= bucket) {
        const key = `${endpoint}|${bucket}`;
        this.ordersBackendLatencyBuckets.set(
          key,
          (this.ordersBackendLatencyBuckets.get(key) ?? 0) + 1,
        );
      }
    }

    const infKey = `${endpoint}|+Inf`;
    this.ordersBackendLatencyBuckets.set(
      infKey,
      (this.ordersBackendLatencyBuckets.get(infKey) ?? 0) + 1,
    );
  }

  incrementOutputTechnicalTermsSanitized(): void {
    this.outputTechnicalTermsSanitized += 1;
  }

  incrementCriticalPolicyContextInjected(input: { intent: string }): void {
    const key = sanitizeLabelValue(input.intent);
    this.criticalPolicyContextInjected.set(
      key,
      (this.criticalPolicyContextInjected.get(key) ?? 0) + 1,
    );
  }

  incrementCriticalPolicyContextTrimmed(input: { intent: string }): void {
    const key = sanitizeLabelValue(input.intent);
    this.criticalPolicyContextTrimmed.set(
      key,
      (this.criticalPolicyContextTrimmed.get(key) ?? 0) + 1,
    );
  }

  incrementPromptContextTruncated(input: { intent: string; strategy: string }): void {
    const key = `${sanitizeLabelValue(input.intent)}|${sanitizeLabelValue(input.strategy)}`;
    this.promptContextTruncated.set(
      key,
      (this.promptContextTruncated.get(key) ?? 0) + 1,
    );
  }

  incrementReturnsPolicyDirectAnswer(): void {
    this.returnsPolicyDirectAnswer += 1;
  }

  incrementPolicyDirectAnswer(input: { policyType: string }): void {
    const key = sanitizeLabelValue(input.policyType);
    this.policyDirectAnswers.set(key, (this.policyDirectAnswers.get(key) ?? 0) + 1);
  }

  incrementScopeRedirect(input: { reason: string }): void {
    const key = sanitizeLabelValue(input.reason);
    this.scopeRedirects.set(key, (this.scopeRedirects.get(key) ?? 0) + 1);
  }

  incrementFeedbackReceived(rating: 'up' | 'down'): void {
    const key = sanitizeLabelValue(rating);
    this.feedbackReceived.set(key, (this.feedbackReceived.get(key) ?? 0) + 1);
    if (rating === 'down') {
      this.feedbackNegative += 1;
    }
  }

  incrementFeedbackWithCategory(input: { category: string }): void {
    const key = sanitizeLabelValue(input.category);
    this.feedbackWithCategory.set(key, (this.feedbackWithCategory.get(key) ?? 0) + 1);
  }

  incrementUiPayloadEmitted(): void {
    this.uiPayloadEmitted += 1;
  }

  incrementUiPayloadSuppressed(reason: 'flag_off' | 'no_cards' | 'duplicate'): void {
    const key = sanitizeLabelValue(reason);
    this.uiPayloadSuppressed.set(key, (this.uiPayloadSuppressed.get(key) ?? 0) + 1);
  }

  incrementLearningAutopromote(): void {
    this.learningAutopromote += 1;
  }

  incrementLearningAutorollback(): void {
    this.learningAutorollback += 1;
  }

  incrementExemplarsUsedInPrompt(input: { intent: string; source: string }): void {
    const key = `${sanitizeLabelValue(input.intent)}${EXEMPLAR_KEY_SEP}${sanitizeLabelValue(input.source)}`;
    this.exemplarsUsedInPrompt.set(key, (this.exemplarsUsedInPrompt.get(key) ?? 0) + 1);
  }

  incrementOpenAiRequest(input: { model: string; intent: string; path: string }): void {
    const key = `${sanitizeLabelValue(input.model)}|${sanitizeLabelValue(input.intent)}|${sanitizeLabelValue(input.path)}`;
    this.openAiRequests.set(key, (this.openAiRequests.get(key) ?? 0) + 1);
  }

  addOpenAiInputTokens(input: { model: string; tokens: number | null }): void {
    this.addTokens(this.openAiInputTokens, input.model, input.tokens);
  }

  addOpenAiOutputTokens(input: { model: string; tokens: number | null }): void {
    this.addTokens(this.openAiOutputTokens, input.model, input.tokens);
  }

  addOpenAiCachedTokens(input: { model: string; tokens: number | null }): void {
    this.addTokens(this.openAiCachedTokens, input.model, input.tokens);
  }

  addOpenAiEstimatedCostUsd(input: { model: string; amountUsd: number }): void {
    const model = sanitizeLabelValue(input.model);
    const amount =
      Number.isFinite(input.amountUsd) && input.amountUsd > 0
        ? Number(input.amountUsd.toFixed(6))
        : 0;
    this.openAiEstimatedCostUsd.set(model, (this.openAiEstimatedCostUsd.get(model) ?? 0) + amount);
  }

  incrementEvalBatchSubmitted(): void {
    this.evalBatchSubmitted += 1;
  }

  incrementEvalBatchCompleted(): void {
    this.evalBatchCompleted += 1;
  }

  incrementEvalBatchFailed(): void {
    this.evalBatchFailed += 1;
  }

  renderPrometheus(): string {
    const lines: string[] = [];

    lines.push(`# HELP ${WF1_METRIC_MESSAGES_TOTAL} Total WF1 messages processed.`);
    lines.push(`# TYPE ${WF1_METRIC_MESSAGES_TOTAL} counter`);
    for (const [key, value] of this.messages.entries()) {
      const [source, intent, llmPath] = key.split('|');
      lines.push(
        `${WF1_METRIC_MESSAGES_TOTAL}{source="${source}",intent="${intent}",llm_path="${llmPath}"} ${value}`,
      );
    }

    lines.push(`# HELP ${WF1_METRIC_FALLBACK_TOTAL} Total fallback responses by reason.`);
    lines.push(`# TYPE ${WF1_METRIC_FALLBACK_TOTAL} counter`);
    for (const [reason, value] of this.fallbacks.entries()) {
      lines.push(`${WF1_METRIC_FALLBACK_TOTAL}{reason="${reason}"} ${value}`);
    }

    lines.push(
      `# HELP ${WF1_METRIC_STOCK_EXACT_DISCLOSURE_TOTAL} Total responses where exact stock was intentionally disclosed.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_STOCK_EXACT_DISCLOSURE_TOTAL} counter`);
    for (const [policy, value] of this.stockExactDisclosure.entries()) {
      lines.push(`${WF1_METRIC_STOCK_EXACT_DISCLOSURE_TOTAL}{policy="${policy}"} ${value}`);
    }

    lines.push(
      `# HELP ${WF1_METRIC_ORDER_LOOKUP_RATE_LIMITED_TOTAL} Total anonymous order lookups blocked by rate limiting.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_ORDER_LOOKUP_RATE_LIMITED_TOTAL} counter`);
    for (const [scope, value] of this.orderLookupRateLimited.entries()) {
      lines.push(`${WF1_METRIC_ORDER_LOOKUP_RATE_LIMITED_TOTAL}{scope="${scope}"} ${value}`);
    }

    lines.push(
      `# HELP ${WF1_METRIC_ORDER_LOOKUP_RATE_LIMIT_DEGRADED_TOTAL} Total anonymous order lookups processed in degraded rate-limit mode.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_ORDER_LOOKUP_RATE_LIMIT_DEGRADED_TOTAL} counter`);
    lines.push(
      `${WF1_METRIC_ORDER_LOOKUP_RATE_LIMIT_DEGRADED_TOTAL} ${this.orderLookupRateLimitDegraded}`,
    );

    lines.push(
      `# HELP ${WF1_METRIC_ORDER_LOOKUP_VERIFICATION_FAILED_TOTAL} Total anonymous order lookup verification failures.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_ORDER_LOOKUP_VERIFICATION_FAILED_TOTAL} counter`);
    lines.push(
      `${WF1_METRIC_ORDER_LOOKUP_VERIFICATION_FAILED_TOTAL} ${this.orderLookupVerificationFailed}`,
    );

    lines.push(
      `# HELP ${WF1_METRIC_RECOMMENDATIONS_FRANCHISE_MATCH_TOTAL} Total recommendation flows with franchise keyword matches.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_RECOMMENDATIONS_FRANCHISE_MATCH_TOTAL} counter`);
    lines.push(
      `${WF1_METRIC_RECOMMENDATIONS_FRANCHISE_MATCH_TOTAL} ${this.recommendationsFranchiseMatch}`,
    );

    lines.push(
      `# HELP ${WF1_METRIC_RECOMMENDATIONS_CATALOG_DEGRADED_TOTAL} Total recommendation flows degraded due to catalog unavailability.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_RECOMMENDATIONS_CATALOG_DEGRADED_TOTAL} counter`);
    lines.push(
      `${WF1_METRIC_RECOMMENDATIONS_CATALOG_DEGRADED_TOTAL} ${this.recommendationsCatalogDegraded}`,
    );

    lines.push(
      `# HELP ${WF1_METRIC_RECOMMENDATIONS_NO_MATCH_TOTAL} Total recommendation flows with no matches after filtering.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_RECOMMENDATIONS_NO_MATCH_TOTAL} counter`);
    lines.push(
      `${WF1_METRIC_RECOMMENDATIONS_NO_MATCH_TOTAL} ${this.recommendationsNoMatch}`,
    );

    lines.push(
      `# HELP ${WF1_METRIC_RECOMMENDATIONS_DISAMBIGUATION_TRIGGERED_TOTAL} Total recommendation flows where disambiguation was requested.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_RECOMMENDATIONS_DISAMBIGUATION_TRIGGERED_TOTAL} counter`);
    lines.push(
      `${WF1_METRIC_RECOMMENDATIONS_DISAMBIGUATION_TRIGGERED_TOTAL} ${this.recommendationsDisambiguationTriggered}`,
    );

    lines.push(
      `# HELP ${WF1_METRIC_RECOMMENDATIONS_DISAMBIGUATION_RESOLVED_TOTAL} Total recommendation disambiguations resolved with user follow-up.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_RECOMMENDATIONS_DISAMBIGUATION_RESOLVED_TOTAL} counter`);
    lines.push(
      `${WF1_METRIC_RECOMMENDATIONS_DISAMBIGUATION_RESOLVED_TOTAL} ${this.recommendationsDisambiguationResolved}`,
    );

    lines.push(
      `# HELP ${WF1_METRIC_RECOMMENDATIONS_EDITORIAL_MATCH_TOTAL} Total recommendation flows with explicit editorial matches.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_RECOMMENDATIONS_EDITORIAL_MATCH_TOTAL} counter`);
    lines.push(
      `${WF1_METRIC_RECOMMENDATIONS_EDITORIAL_MATCH_TOTAL} ${this.recommendationsEditorialMatch}`,
    );

    lines.push(
      `# HELP ${WF1_METRIC_RECOMMENDATIONS_EDITORIAL_SUGGESTED_TOTAL} Total recommendation flows where editorials were suggested.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_RECOMMENDATIONS_EDITORIAL_SUGGESTED_TOTAL} counter`);
    lines.push(
      `${WF1_METRIC_RECOMMENDATIONS_EDITORIAL_SUGGESTED_TOTAL} ${this.recommendationsEditorialSuggested}`,
    );

    lines.push(
      `# HELP ${WF1_METRIC_ORDER_FLOW_AMBIGUOUS_ACK_TOTAL} Total ambiguous short acknowledgments detected while order guest flow was pending.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_ORDER_FLOW_AMBIGUOUS_ACK_TOTAL} counter`);
    lines.push(
      `${WF1_METRIC_ORDER_FLOW_AMBIGUOUS_ACK_TOTAL} ${this.orderFlowAmbiguousAck}`,
    );

    lines.push(
      `# HELP ${WF1_METRIC_ORDER_FLOW_HIJACK_PREVENTED_TOTAL} Total pending order flow interceptions prevented due to non-order routing.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_ORDER_FLOW_HIJACK_PREVENTED_TOTAL} counter`);
    lines.push(
      `${WF1_METRIC_ORDER_FLOW_HIJACK_PREVENTED_TOTAL} ${this.orderFlowHijackPrevented}`,
    );

    lines.push(
      `# HELP ${WF1_METRIC_ORDERS_BACKEND_CALLS_TOTAL} Total authenticated orders backend calls by endpoint, outcome and status code.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_ORDERS_BACKEND_CALLS_TOTAL} counter`);
    for (const [key, value] of this.ordersBackendCalls.entries()) {
      const [endpoint, outcome, statusCode] = key.split('|');
      lines.push(
        `${WF1_METRIC_ORDERS_BACKEND_CALLS_TOTAL}{endpoint="${endpoint}",outcome="${outcome}",status_code="${statusCode}"} ${value}`,
      );
    }

    lines.push(
      `# HELP ${WF1_METRIC_ORDERS_BACKEND_LATENCY_SECONDS} Authenticated orders backend latency in seconds by endpoint.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_ORDERS_BACKEND_LATENCY_SECONDS} histogram`);
    for (const [key, value] of this.ordersBackendLatencyBuckets.entries()) {
      const [endpoint, bucket] = key.split('|');
      lines.push(
        `${WF1_METRIC_ORDERS_BACKEND_LATENCY_SECONDS}_bucket{endpoint="${endpoint}",le="${bucket}"} ${value}`,
      );
    }
    for (const [endpoint, value] of this.ordersBackendLatencySum.entries()) {
      lines.push(`${WF1_METRIC_ORDERS_BACKEND_LATENCY_SECONDS}_sum{endpoint="${endpoint}"} ${value}`);
    }
    for (const [endpoint, value] of this.ordersBackendLatencyCount.entries()) {
      lines.push(`${WF1_METRIC_ORDERS_BACKEND_LATENCY_SECONDS}_count{endpoint="${endpoint}"} ${value}`);
    }

    lines.push(
      `# HELP ${WF1_METRIC_OUTPUT_TECHNICAL_TERMS_SANITIZED_TOTAL} Total responses sanitized to remove technical jargon from user-facing output.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_OUTPUT_TECHNICAL_TERMS_SANITIZED_TOTAL} counter`);
    lines.push(
      `${WF1_METRIC_OUTPUT_TECHNICAL_TERMS_SANITIZED_TOTAL} ${this.outputTechnicalTermsSanitized}`,
    );

    lines.push(
      `# HELP ${WF1_METRIC_CRITICAL_POLICY_CONTEXT_INJECTED_TOTAL} Total prompts where critical policy context was injected by intent.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_CRITICAL_POLICY_CONTEXT_INJECTED_TOTAL} counter`);
    for (const [intent, value] of this.criticalPolicyContextInjected.entries()) {
      lines.push(
        `${WF1_METRIC_CRITICAL_POLICY_CONTEXT_INJECTED_TOTAL}{intent="${intent}"} ${value}`,
      );
    }

    lines.push(
      `# HELP ${WF1_METRIC_CRITICAL_POLICY_CONTEXT_TRIMMED_TOTAL} Total prompts where critical policy context was trimmed by intent.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_CRITICAL_POLICY_CONTEXT_TRIMMED_TOTAL} counter`);
    for (const [intent, value] of this.criticalPolicyContextTrimmed.entries()) {
      lines.push(
        `${WF1_METRIC_CRITICAL_POLICY_CONTEXT_TRIMMED_TOTAL}{intent="${intent}"} ${value}`,
      );
    }

    lines.push(
      `# HELP ${WF1_METRIC_PROMPT_CONTEXT_TRUNCATED_TOTAL} Total prompts with context truncation by intent and strategy.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_PROMPT_CONTEXT_TRUNCATED_TOTAL} counter`);
    for (const [key, value] of this.promptContextTruncated.entries()) {
      const [intent, strategy] = key.split('|');
      lines.push(
        `${WF1_METRIC_PROMPT_CONTEXT_TRUNCATED_TOTAL}{intent="${intent}",strategy="${strategy}"} ${value}`,
      );
    }

    lines.push(
      `# HELP ${WF1_METRIC_RETURNS_POLICY_DIRECT_ANSWER_TOTAL} Total ticket flows answered directly with returns policy context.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_RETURNS_POLICY_DIRECT_ANSWER_TOTAL} counter`);
    lines.push(
      `${WF1_METRIC_RETURNS_POLICY_DIRECT_ANSWER_TOTAL} ${this.returnsPolicyDirectAnswer}`,
    );

    lines.push(
      `# HELP ${WF1_METRIC_POLICY_DIRECT_ANSWER_TOTAL} Total deterministic business policy answers emitted by policy type.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_POLICY_DIRECT_ANSWER_TOTAL} counter`);
    for (const [policyType, value] of this.policyDirectAnswers.entries()) {
      lines.push(`${WF1_METRIC_POLICY_DIRECT_ANSWER_TOTAL}{policy_type="${policyType}"} ${value}`);
    }

    lines.push(
      `# HELP ${WF1_METRIC_SCOPE_REDIRECT_TOTAL} Total out-of-scope redirections by reason.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_SCOPE_REDIRECT_TOTAL} counter`);
    for (const [reason, value] of this.scopeRedirects.entries()) {
      lines.push(`${WF1_METRIC_SCOPE_REDIRECT_TOTAL}{reason="${reason}"} ${value}`);
    }

    lines.push(`# HELP ${WF1_METRIC_FEEDBACK_RECEIVED_TOTAL} Total chat feedback events.`);
    lines.push(`# TYPE ${WF1_METRIC_FEEDBACK_RECEIVED_TOTAL} counter`);
    for (const [rating, value] of this.feedbackReceived.entries()) {
      lines.push(`${WF1_METRIC_FEEDBACK_RECEIVED_TOTAL}{rating="${rating}"} ${value}`);
    }

    lines.push(`# HELP ${WF1_METRIC_FEEDBACK_NEGATIVE_TOTAL} Total negative chat feedback events.`);
    lines.push(`# TYPE ${WF1_METRIC_FEEDBACK_NEGATIVE_TOTAL} counter`);
    lines.push(`${WF1_METRIC_FEEDBACK_NEGATIVE_TOTAL} ${this.feedbackNegative}`);

    lines.push(
      `# HELP ${WF1_METRIC_FEEDBACK_WITH_CATEGORY_TOTAL} Total chat feedback events with explicit category.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_FEEDBACK_WITH_CATEGORY_TOTAL} counter`);
    for (const [category, value] of this.feedbackWithCategory.entries()) {
      lines.push(`${WF1_METRIC_FEEDBACK_WITH_CATEGORY_TOTAL}{category="${category}"} ${value}`);
    }

    lines.push(`# HELP ${WF1_METRIC_UI_PAYLOAD_EMITTED_TOTAL} Total WF1 responses with ui payload attached.`);
    lines.push(`# TYPE ${WF1_METRIC_UI_PAYLOAD_EMITTED_TOTAL} counter`);
    lines.push(`${WF1_METRIC_UI_PAYLOAD_EMITTED_TOTAL} ${this.uiPayloadEmitted}`);

    lines.push(`# HELP ${WF1_METRIC_UI_PAYLOAD_SUPPRESSED_TOTAL} Total WF1 responses where ui payload was not attached.`);
    lines.push(`# TYPE ${WF1_METRIC_UI_PAYLOAD_SUPPRESSED_TOTAL} counter`);
    for (const [reason, value] of this.uiPayloadSuppressed.entries()) {
      lines.push(`${WF1_METRIC_UI_PAYLOAD_SUPPRESSED_TOTAL}{reason="${reason}"} ${value}`);
    }

    lines.push(`# HELP ${WF1_METRIC_LEARNING_AUTOPROMOTE_TOTAL} Total autonomous learning promotions executed.`);
    lines.push(`# TYPE ${WF1_METRIC_LEARNING_AUTOPROMOTE_TOTAL} counter`);
    lines.push(`${WF1_METRIC_LEARNING_AUTOPROMOTE_TOTAL} ${this.learningAutopromote}`);

    lines.push(`# HELP ${WF1_METRIC_LEARNING_AUTOROLLBACK_TOTAL} Total autonomous learning rollbacks executed.`);
    lines.push(`# TYPE ${WF1_METRIC_LEARNING_AUTOROLLBACK_TOTAL} counter`);
    lines.push(`${WF1_METRIC_LEARNING_AUTOROLLBACK_TOTAL} ${this.learningAutorollback}`);

    lines.push(
      `# HELP ${WF1_METRIC_EXEMPLARS_USED_IN_PROMPT_TOTAL} Total adaptive exemplars injected into prompts by intent and source.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_EXEMPLARS_USED_IN_PROMPT_TOTAL} counter`);
    for (const [key, value] of this.exemplarsUsedInPrompt.entries()) {
      const [intent, source] = key.split(EXEMPLAR_KEY_SEP);
      lines.push(
        `${WF1_METRIC_EXEMPLARS_USED_IN_PROMPT_TOTAL}{intent="${intent}",source="${source}"} ${value}`,
      );
    }

    lines.push(
      `# HELP ${WF1_METRIC_OPENAI_REQUESTS_TOTAL} Total OpenAI requests by model, intent and path.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_OPENAI_REQUESTS_TOTAL} counter`);
    for (const [key, value] of this.openAiRequests.entries()) {
      const [model, intent, path] = key.split('|');
      lines.push(
        `${WF1_METRIC_OPENAI_REQUESTS_TOTAL}{model="${model}",intent="${intent}",path="${path}"} ${value}`,
      );
    }

    lines.push(
      `# HELP ${WF1_METRIC_OPENAI_INPUT_TOKENS_TOTAL} Total OpenAI input tokens by model.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_OPENAI_INPUT_TOKENS_TOTAL} counter`);
    for (const [model, value] of this.openAiInputTokens.entries()) {
      lines.push(`${WF1_METRIC_OPENAI_INPUT_TOKENS_TOTAL}{model="${model}"} ${value}`);
    }

    lines.push(
      `# HELP ${WF1_METRIC_OPENAI_OUTPUT_TOKENS_TOTAL} Total OpenAI output tokens by model.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_OPENAI_OUTPUT_TOKENS_TOTAL} counter`);
    for (const [model, value] of this.openAiOutputTokens.entries()) {
      lines.push(`${WF1_METRIC_OPENAI_OUTPUT_TOKENS_TOTAL}{model="${model}"} ${value}`);
    }

    lines.push(
      `# HELP ${WF1_METRIC_OPENAI_CACHED_TOKENS_TOTAL} Total OpenAI cached input tokens by model.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_OPENAI_CACHED_TOKENS_TOTAL} counter`);
    for (const [model, value] of this.openAiCachedTokens.entries()) {
      lines.push(`${WF1_METRIC_OPENAI_CACHED_TOKENS_TOTAL}{model="${model}"} ${value}`);
    }

    lines.push(
      `# HELP ${WF1_METRIC_OPENAI_ESTIMATED_COST_USD_TOTAL} Estimated OpenAI cost in USD accumulated by model.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_OPENAI_ESTIMATED_COST_USD_TOTAL} counter`);
    for (const [model, value] of this.openAiEstimatedCostUsd.entries()) {
      lines.push(
        `${WF1_METRIC_OPENAI_ESTIMATED_COST_USD_TOTAL}{model="${model}"} ${Number(value.toFixed(6))}`,
      );
    }

    lines.push(
      `# HELP ${WF1_METRIC_EVAL_BATCH_SUBMITTED_TOTAL} Total eval batches submitted.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_EVAL_BATCH_SUBMITTED_TOTAL} counter`);
    lines.push(`${WF1_METRIC_EVAL_BATCH_SUBMITTED_TOTAL} ${this.evalBatchSubmitted}`);

    lines.push(
      `# HELP ${WF1_METRIC_EVAL_BATCH_COMPLETED_TOTAL} Total eval batches completed.`,
    );
    lines.push(`# TYPE ${WF1_METRIC_EVAL_BATCH_COMPLETED_TOTAL} counter`);
    lines.push(`${WF1_METRIC_EVAL_BATCH_COMPLETED_TOTAL} ${this.evalBatchCompleted}`);

    lines.push(`# HELP ${WF1_METRIC_EVAL_BATCH_FAILED_TOTAL} Total eval batches failed.`);
    lines.push(`# TYPE ${WF1_METRIC_EVAL_BATCH_FAILED_TOTAL} counter`);
    lines.push(`${WF1_METRIC_EVAL_BATCH_FAILED_TOTAL} ${this.evalBatchFailed}`);

    lines.push(`# HELP ${WF1_METRIC_RESPONSE_LATENCY_SECONDS} WF1 response latency in seconds.`);
    lines.push(`# TYPE ${WF1_METRIC_RESPONSE_LATENCY_SECONDS} histogram`);
    for (const [key, value] of this.latencyBuckets.entries()) {
      const [intent, bucket] = key.split('|');
      lines.push(
        `${WF1_METRIC_RESPONSE_LATENCY_SECONDS}_bucket{intent="${intent}",le="${bucket}"} ${value}`,
      );
    }
    for (const [intent, value] of this.latencySum.entries()) {
      lines.push(`${WF1_METRIC_RESPONSE_LATENCY_SECONDS}_sum{intent="${intent}"} ${value}`);
    }
    for (const [intent, value] of this.latencyCount.entries()) {
      lines.push(`${WF1_METRIC_RESPONSE_LATENCY_SECONDS}_count{intent="${intent}"} ${value}`);
    }

    return `${lines.join('\n')}\n`;
  }

  private addTokens(target: Map<string, number>, model: string, tokens: number | null): void {
    if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) {
      return;
    }

    const key = sanitizeLabelValue(model);
    target.set(key, (target.get(key) ?? 0) + tokens);
  }
}

const EXEMPLAR_KEY_SEP = '\u001f';

function sanitizeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
