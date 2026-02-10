import { sanitizeText } from '@/modules/wf1/domain/text-sanitizer';

describe('sanitizeText', () => {
  it('returns empty string for non-string input', () => {
    expect(sanitizeText(null as unknown as string)).toBe('');
    expect(sanitizeText(undefined as unknown as string)).toBe('');
    expect(sanitizeText(123 as unknown as string)).toBe('');
  });

  it('strips HTML tags', () => {
    expect(sanitizeText('<script>alert(1)</script>hello')).toBe('alert(1) hello');
    expect(sanitizeText('<b>bold</b> text')).toBe('bold text');
    expect(sanitizeText('a<b>c</b>d')).toBe('a c d');
  });

  it('removes control characters', () => {
    expect(sanitizeText('hello\u0000world')).toBe('hello world');
    expect(sanitizeText('a\n\t\rb')).toBe('a b');
  });

  it('normalizes whitespace', () => {
    expect(sanitizeText('  multiple   spaces  ')).toBe('multiple spaces');
    expect(sanitizeText('\n\t  trim  \t\n')).toBe('trim');
  });

  it('handles empty string', () => {
    expect(sanitizeText('')).toBe('');
    expect(sanitizeText('   ')).toBe('');
  });

  it('preserves valid text', () => {
    expect(sanitizeText('Hola, ¿cómo estás?')).toBe('Hola, ¿cómo estás?');
    expect(sanitizeText('One Piece tomo 33')).toBe('One Piece tomo 33');
  });
});
