import { ORDER_ID_PREFIX_PATTERN, ORDER_ID_PURE_PATTERN } from './patterns';

/**
 * Extracts an order ID from entities and original text.
 * Accepts "pedido/orden/order #123456" or a pure 6–12 digit number.
 *
 * @param entities - Extracted entities (may contain the id as string)
 * @param originalText - Raw user message
 * @returns The order ID string or undefined if not found
 */
export function resolveOrderId(entities: string[], originalText: string): string | undefined {
  const candidates: string[] = [...entities, originalText];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;

    const trimmed = candidate.trim();
    if (trimmed.length === 0) continue;

    const prefixMatch = trimmed.match(ORDER_ID_PREFIX_PATTERN);
    if (prefixMatch?.[1]) return prefixMatch[1];

    if (ORDER_ID_PURE_PATTERN.test(trimmed)) return trimmed;
  }

  return undefined;
}
