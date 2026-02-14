import type { LlmModelPricing, SupportedLlmModel } from './constants';
import { LLM_MODEL_PRICING } from './constants';

const TOKENS_PER_MILLION = 1_000_000;

export function estimateCostUsd(input: {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
}): number {
  const pricing = resolvePricing(input.model);
  if (!pricing) {
    return 0;
  }

  const inputTokens = clampNonNegative(input.inputTokens);
  const outputTokens = clampNonNegative(input.outputTokens);
  const cachedTokens = clampNonNegative(input.cachedTokens);
  const billableInputTokens = Math.max(inputTokens - cachedTokens, 0);

  const inputCost = billableInputTokens * (pricing.inputPer1MTokensUsd / TOKENS_PER_MILLION);
  const cachedInputCost = cachedTokens * (pricing.cachedInputPer1MTokensUsd / TOKENS_PER_MILLION);
  const outputCost = outputTokens * (pricing.outputPer1MTokensUsd / TOKENS_PER_MILLION);

  return roundTo6(inputCost + cachedInputCost + outputCost);
}

function resolvePricing(model: string): LlmModelPricing | null {
  if (!isSupportedModel(model)) {
    return null;
  }

  return LLM_MODEL_PRICING[model];
}

function isSupportedModel(model: string): model is SupportedLlmModel {
  return model in LLM_MODEL_PRICING;
}

function clampNonNegative(value: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(value, 0);
}

function roundTo6(value: number): number {
  return Number(value.toFixed(6));
}

