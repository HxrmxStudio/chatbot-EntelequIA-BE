import type { ContextBlock } from './types';

export function appendPolicyFactsContextBlock(
  contextBlocks: ContextBlock[],
  policyFactsContext: unknown,
): ContextBlock[] {
  if (
    typeof policyFactsContext !== 'string' ||
    policyFactsContext.trim().length === 0
  ) {
    return Array.isArray(contextBlocks) ? contextBlocks : [];
  }

  const trimmedContext = policyFactsContext.trim();
  const policyFactsBlock: ContextBlock = {
    contextType: 'policy_facts',
    contextPayload: { context: trimmedContext },
  };

  if (!Array.isArray(contextBlocks) || contextBlocks.length === 0) {
    return [policyFactsBlock];
  }

  const filtered = contextBlocks.filter((block) => block.contextType !== 'policy_facts');
  return [...filtered, policyFactsBlock];
}
