import { createHash } from 'node:crypto';

export function normalizeText(text: string): string {
  return typeof text === 'string' ? text.trim() : '';
}

export function truncateText(
  text: string,
  maxChars: number,
): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= maxChars) {
    return {
      text,
      truncated: false,
    };
  }

  return {
    text: text.slice(0, maxChars),
    truncated: true,
  };
}

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
