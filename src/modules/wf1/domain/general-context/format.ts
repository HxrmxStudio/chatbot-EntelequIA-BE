import {
  DEFAULT_GENERAL_CONTEXT_HINT,
  DEFAULT_GENERAL_CONTEXT_INSTRUCTIONS,
} from './constants';
import type { GeneralAiContext, GeneralTemplates } from './types';

/**
 * Builds a short AI context for general intent.
 */
export function buildGeneralAiContext(input?: {
  templates?: Partial<GeneralTemplates>;
}): GeneralAiContext {
  const hint = input?.templates?.hint ?? DEFAULT_GENERAL_CONTEXT_HINT;
  const instructions =
    input?.templates?.instructions ?? DEFAULT_GENERAL_CONTEXT_INSTRUCTIONS;

  const lines = [hint, '', instructions];

  return {
    contextText: lines.join('\n'),
  };
}
