import type { ContextBlock } from './types';

export function appendCriticalPolicyContextBlock(
  contextBlocks: ContextBlock[],
  criticalPolicyContext: unknown,
): ContextBlock[] {
  if (
    typeof criticalPolicyContext !== 'string' ||
    criticalPolicyContext.trim().length === 0
  ) {
    return Array.isArray(contextBlocks) ? contextBlocks : [];
  }

  const trimmedContext = criticalPolicyContext.trim();
  const criticalPolicyBlock: ContextBlock = {
    contextType: 'critical_policy',
    contextPayload: { context: trimmedContext },
  };

  if (!Array.isArray(contextBlocks) || contextBlocks.length === 0) {
    return [criticalPolicyBlock];
  }

  const filtered = contextBlocks.filter(
    (block) => block.contextType !== 'critical_policy',
  );
  return [...filtered, criticalPolicyBlock];
}
