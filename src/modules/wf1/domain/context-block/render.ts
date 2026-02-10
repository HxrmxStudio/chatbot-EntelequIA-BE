import type { ContextBlock } from './types';

/**
 * Block title constants for rendering context blocks.
 */
const BLOCK_TITLE_PRODUCTS = 'Productos';
const BLOCK_TITLE_STATIC_CONTEXT = 'Contexto estatico';
const BLOCK_TITLE_GENERAL = 'Contexto general';
const CONTEXT_SEPARATOR = '\n\n---\n\n';
const GENERAL_CONTEXT_PREFIX = 'Contexto general:\n';
const FALLBACK_NON_SERIALIZABLE = '(payload no serializable)';

/**
 * Renders an array of context blocks into a formatted string for LLM prompts.
 * Each block is separated by a separator, and empty blocks are filtered out.
 *
 * @param contextBlocks - Array of context blocks to render
 * @returns Formatted string with all context blocks, or empty string if no valid blocks
 */
export function renderContextBlocksForPrompt(contextBlocks: ContextBlock[]): string {
  if (!Array.isArray(contextBlocks) || contextBlocks.length === 0) {
    return '';
  }

  const rendered = contextBlocks
    .map((block) => renderContextBlock(block))
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());

  return rendered.join(CONTEXT_SEPARATOR);
}

/**
 * Renders a single context block to a string representation.
 * Handles different context types with appropriate formatting.
 *
 * @param block - Context block to render
 * @returns Rendered string or null if block cannot be rendered
 */
function renderContextBlock(block: ContextBlock): string | null {
  switch (block.contextType) {
    case 'products': {
      const aiContext = readString(block.contextPayload, 'aiContext');
      if (aiContext) return aiContext;

      const summary = readString(block.contextPayload, 'summary');
      if (summary) return summary;

      return safeJsonBlock(BLOCK_TITLE_PRODUCTS, block.contextPayload);
    }

    case 'static_context': {
      const staticContext = readString(block.contextPayload, 'context');
      if (staticContext) return staticContext;
      return safeJsonBlock(BLOCK_TITLE_STATIC_CONTEXT, block.contextPayload);
    }

    case 'general': {
      const hint = readString(block.contextPayload, 'hint');
      if (hint) return `${GENERAL_CONTEXT_PREFIX}${hint}`;
      return safeJsonBlock(BLOCK_TITLE_GENERAL, block.contextPayload);
    }

    default: {
      return safeJsonBlock(block.contextType, block.contextPayload);
    }
  }
}

/**
 * Safely reads a string value from a payload object.
 * Returns null if the value is not a non-empty string.
 *
 * @param payload - Object to read from
 * @param key - Key to read
 * @returns Trimmed string value or null
 */
function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Safely serializes a payload to JSON with error handling.
 * Falls back to a non-serializable message if JSON.stringify fails.
 *
 * @param title - Title/prefix for the JSON block
 * @param payload - Payload to serialize
 * @returns Formatted string with title and JSON payload
 */
function safeJsonBlock(title: string, payload: Record<string, unknown>): string {
  try {
    return `${title}:\n${JSON.stringify(payload)}`;
  } catch {
    return `${title}: ${FALLBACK_NON_SERIALIZABLE}`;
  }
}

