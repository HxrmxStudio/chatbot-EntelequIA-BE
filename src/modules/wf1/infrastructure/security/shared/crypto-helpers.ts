import { timingSafeEqual } from 'node:crypto';

/**
 * Crypto utility functions for secure comparisons.
 * Uses timing-safe comparison to prevent timing attacks.
 */

/**
 * Performs a constant-time string comparison to prevent timing attacks.
 * Returns true only if both strings have the same length and content.
 *
 * @param left - First string to compare
 * @param right - Second string to compare
 * @returns True if strings are equal, false otherwise
 */
export function secureEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
