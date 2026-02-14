export type AssistantConfidenceLabel = 'high' | 'medium' | 'low';

export interface AssistantReplyPayload {
  reply: string;
  requires_clarification: boolean;
  clarifying_question: string | null;
  confidence_label: AssistantConfidenceLabel;
  _schema_version: '1.0';
}

export interface OpenAiUsageDetails {
  cached_tokens?: number;
}

export interface OpenAiUsageRaw {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: OpenAiUsageDetails;
  prompt_tokens_details?: OpenAiUsageDetails;
}

export interface OpenAiUsageMetrics {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
}

export interface OpenAiResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: OpenAiUsageRaw | null;
}

export type PromptTruncationStrategy =
  | 'none'
  | 'static_context_trimmed'
  | 'secondary_blocks_trimmed'
  | 'active_blocks_trimmed'
  | 'hard_cut';

export interface PromptBuildDiagnostics {
  contextBudget: number;
  contextCharsBefore: number;
  contextCharsAfter: number;
  contextTruncated: boolean;
  truncationStrategy: PromptTruncationStrategy;
  historyItemsIncluded: number;
  historyChars: number;
  sectionOrder?: string[];
}

export interface PromptBuildResult {
  userPrompt: string;
  diagnostics: PromptBuildDiagnostics;
}

export interface OpenAiLegacyResult {
  reply: string;
  usage: OpenAiUsageMetrics;
  promptDiagnostics: PromptBuildDiagnostics;
}

export interface OpenAiStructuredResult {
  payload: AssistantReplyPayload;
  usage: OpenAiUsageMetrics;
  promptDiagnostics: PromptBuildDiagnostics;
}
