export type SupportedLlmModel = 'gpt-4.1-mini' | 'gpt-4.1-nano' | 'gpt-4o-mini';

export interface LlmModelPricing {
  inputPer1MTokensUsd: number;
  outputPer1MTokensUsd: number;
  cachedInputPer1MTokensUsd: number;
}

export const MONTHLY_BUDGET_USD = 20;
export const DAILY_SOFT_BUDGET_USD = 0.67;
export const DEFAULT_RANDOM_SAMPLE_PERCENT = 2;

export const LLM_MODEL_PRICING: Record<SupportedLlmModel, LlmModelPricing> = {
  'gpt-4.1-mini': {
    inputPer1MTokensUsd: 0.4,
    outputPer1MTokensUsd: 1.6,
    cachedInputPer1MTokensUsd: 0.1,
  },
  'gpt-4.1-nano': {
    inputPer1MTokensUsd: 0.1,
    outputPer1MTokensUsd: 0.4,
    cachedInputPer1MTokensUsd: 0.025,
  },
  'gpt-4o-mini': {
    inputPer1MTokensUsd: 0.15,
    outputPer1MTokensUsd: 0.6,
    cachedInputPer1MTokensUsd: 0.075,
  },
};

