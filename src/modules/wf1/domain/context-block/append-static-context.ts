import type { ContextBlock } from './types';

/**
 * Appends or replaces a static context block in the context blocks array.
 * If staticContext is empty or invalid, returns the original array unchanged.
 * If contextBlocks is empty and staticContext is valid, returns a new array with only the static context.
 * If a static_context block already exists, it is replaced with the new one.
 *
 * @param contextBlocks - Array of existing context blocks (may be empty)
 * @param staticContext - Static context string to append (may be unknown type)
 * @returns New array with static context block appended or replaced
 */
export function appendStaticContextBlock(
  contextBlocks: ContextBlock[],
  staticContext: unknown,
): ContextBlock[] {
  // Validate staticContext: must be a non-empty string
  if (typeof staticContext !== 'string' || staticContext.trim().length === 0) {
    return Array.isArray(contextBlocks) ? contextBlocks : [];
  }

  const trimmedContext = staticContext.trim();
  const staticContextBlock: ContextBlock = {
    contextType: 'static_context',
    contextPayload: { context: trimmedContext },
  };

  // If no existing blocks, return array with only static context
  if (!Array.isArray(contextBlocks) || contextBlocks.length === 0) {
    return [staticContextBlock];
  }

  // Remove any existing static_context blocks and append the new one
  const filtered = contextBlocks.filter((block) => block.contextType !== 'static_context');
  return [...filtered, staticContextBlock];
}

