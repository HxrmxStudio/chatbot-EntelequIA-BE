/**
 * Pure domain utility: sanitizes user text by removing HTML tags,
 * control characters, and normalizing whitespace.
 * No framework dependencies.
 */
export function sanitizeText(rawText: string): string {
  if (typeof rawText !== 'string') {
    return '';
  }

  const withoutTags = rawText.replace(/<[^>]*>/g, ' ');
  const withoutControls = withoutTags.replace(/[\u0000-\u001F\u007F]/g, ' ');
  const normalizedWhitespace = withoutControls.replace(/\s+/g, ' ').trim();
  return normalizedWhitespace;
}
