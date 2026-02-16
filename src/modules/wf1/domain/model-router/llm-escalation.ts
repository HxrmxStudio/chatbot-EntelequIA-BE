/**
 * Domain rules for when to escalate from a cheaper model to the primary model.
 * Extracted from infrastructure so business logic stays in domain.
 */
export type ConfidenceLabel = 'high' | 'medium' | 'low';

export interface LlmEscalationSignals {
  confidenceLabel: ConfidenceLabel;
  requiresClarification: boolean;
}

/**
 * Returns true when the cheap model's output suggests we should retry with the primary model.
 * - Low confidence: always escalate
 * - Requires clarification for non-general intents: escalate (quality risk)
 */
export function shouldEscalateToPrimary(
  signals: LlmEscalationSignals | null,
  intent: string,
): boolean {
  if (!signals) {
    return false;
  }

  if (signals.confidenceLabel === 'low') {
    return true;
  }

  return signals.requiresClarification && intent !== 'general';
}
