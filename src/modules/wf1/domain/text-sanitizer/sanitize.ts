/**
 * Pure domain utility: sanitizes user text by removing HTML tags,
 * control characters, and normalizing whitespace.
 * No framework dependencies.
 */
export function sanitizeText(rawText: string): string {
  const linePreserved = sanitizeTextPreservingLineBreaks(rawText);
  return linePreserved.replace(/\s+/g, ' ').trim();
}

export function sanitizeTextPreservingLineBreaks(rawText: string): string {
  if (typeof rawText !== 'string') {
    return '';
  }

  const withoutTags = rawText.replace(/<[^>]*>/g, ' ');
  const normalizedLineBreaks = withoutTags.replace(/\r\n?/g, '\n');
  const withoutControls = normalizedLineBreaks.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
  const normalizedLines = withoutControls
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  return normalizedLines.join('\n').trim();
}
