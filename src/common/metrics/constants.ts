export const WF1_METRIC_MESSAGES_TOTAL = 'wf1_messages_total';
export const WF1_METRIC_FALLBACK_TOTAL = 'wf1_fallback_total';
export const WF1_METRIC_STOCK_EXACT_DISCLOSURE_TOTAL =
  'wf1_stock_exact_disclosure_total';
export const WF1_METRIC_RESPONSE_LATENCY_SECONDS = 'wf1_response_latency_seconds';
export const WF1_METRIC_ORDER_LOOKUP_RATE_LIMITED_TOTAL =
  'wf1_order_lookup_rate_limited_total';
export const WF1_METRIC_ORDER_LOOKUP_RATE_LIMIT_DEGRADED_TOTAL =
  'wf1_order_lookup_rate_limit_degraded_total';
export const WF1_METRIC_ORDER_LOOKUP_VERIFICATION_FAILED_TOTAL =
  'wf1_order_lookup_verification_failed_total';
export const WF1_METRIC_RECOMMENDATIONS_FRANCHISE_MATCH_TOTAL =
  'wf1_recommendations_franchise_match_total';
export const WF1_METRIC_RECOMMENDATIONS_CATALOG_DEGRADED_TOTAL =
  'wf1_recommendations_catalog_degraded_total';
export const WF1_METRIC_RECOMMENDATIONS_NO_MATCH_TOTAL =
  'wf1_recommendations_no_match_total';
export const WF1_METRIC_RECOMMENDATIONS_DISAMBIGUATION_TRIGGERED_TOTAL =
  'wf1_recommendations_disambiguation_triggered_total';
export const WF1_METRIC_RECOMMENDATIONS_DISAMBIGUATION_RESOLVED_TOTAL =
  'wf1_recommendations_disambiguation_resolved_total';
export const WF1_METRIC_RECOMMENDATIONS_EDITORIAL_MATCH_TOTAL =
  'wf1_recommendations_editorial_match_total';
export const WF1_METRIC_RECOMMENDATIONS_EDITORIAL_SUGGESTED_TOTAL =
  'wf1_recommendations_editorial_suggested_total';
export const WF1_METRIC_ORDER_FLOW_AMBIGUOUS_ACK_TOTAL =
  'wf1_order_flow_ambiguous_ack_total';
export const WF1_METRIC_ORDER_FLOW_HIJACK_PREVENTED_TOTAL =
  'wf1_order_flow_hijack_prevented_total';
export const WF1_METRIC_OUTPUT_TECHNICAL_TERMS_SANITIZED_TOTAL =
  'wf1_output_technical_terms_sanitized_total';
export const WF1_METRIC_FEEDBACK_RECEIVED_TOTAL = 'wf1_feedback_received_total';
export const WF1_METRIC_FEEDBACK_NEGATIVE_TOTAL = 'wf1_feedback_negative_total';
export const WF1_METRIC_UI_PAYLOAD_EMITTED_TOTAL = 'wf1_ui_payload_emitted_total';
export const WF1_METRIC_UI_PAYLOAD_SUPPRESSED_TOTAL = 'wf1_ui_payload_suppressed_total';
export const WF1_METRIC_LEARNING_AUTOPROMOTE_TOTAL = 'wf1_learning_autopromote_total';
export const WF1_METRIC_LEARNING_AUTOROLLBACK_TOTAL = 'wf1_learning_autorollback_total';
export const WF1_METRIC_EXEMPLARS_USED_IN_PROMPT_TOTAL = 'wf1_exemplars_used_in_prompt_total';
export const WF1_METRIC_OPENAI_REQUESTS_TOTAL = 'wf1_openai_requests_total';
export const WF1_METRIC_OPENAI_INPUT_TOKENS_TOTAL = 'wf1_openai_input_tokens_total';
export const WF1_METRIC_OPENAI_OUTPUT_TOKENS_TOTAL = 'wf1_openai_output_tokens_total';
export const WF1_METRIC_OPENAI_CACHED_TOKENS_TOTAL = 'wf1_openai_cached_tokens_total';
export const WF1_METRIC_OPENAI_ESTIMATED_COST_USD_TOTAL = 'wf1_openai_estimated_cost_usd_total';
export const WF1_METRIC_EVAL_BATCH_SUBMITTED_TOTAL = 'wf1_eval_batch_submitted_total';
export const WF1_METRIC_EVAL_BATCH_COMPLETED_TOTAL = 'wf1_eval_batch_completed_total';
export const WF1_METRIC_EVAL_BATCH_FAILED_TOTAL = 'wf1_eval_batch_failed_total';

export const WF1_RESPONSE_LATENCY_BUCKETS = [0.25, 0.5, 1, 2, 3, 5, 8, 13] as const;
