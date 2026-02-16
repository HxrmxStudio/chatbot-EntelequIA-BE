import {
  normalizeTextBasic,
  normalizeTextForSearch,
  normalizeTextStrict,
  normalizeTextWithRepeatedCharRemoval,
} from '@/common/utils/text-normalize.utils';

describe('text-normalize.utils', () => {
  describe('normalizeTextBasic', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizeTextBasic('  hello  ')).toBe('hello');
      expect(normalizeTextBasic('\t\nhello\n\t')).toBe('hello');
    });

    it('preserves case', () => {
      expect(normalizeTextBasic('Hello World')).toBe('Hello World');
    });

    it('preserves special characters', () => {
      expect(normalizeTextBasic('hello@world.com')).toBe('hello@world.com');
    });

    it('preserves accents', () => {
      expect(normalizeTextBasic('café')).toBe('café');
      expect(normalizeTextBasic('niño')).toBe('niño');
    });

    it('handles empty string', () => {
      expect(normalizeTextBasic('')).toBe('');
      expect(normalizeTextBasic('   ')).toBe('');
    });

    it('handles non-string input', () => {
      expect(normalizeTextBasic(null as unknown as string)).toBe('');
      expect(normalizeTextBasic(undefined as unknown as string)).toBe('');
    });
  });

  describe('normalizeTextForSearch', () => {
    it('converts to lowercase', () => {
      expect(normalizeTextForSearch('HELLO WORLD')).toBe('hello world');
      expect(normalizeTextForSearch('HeLLo WoRLd')).toBe('hello world');
    });

    it('removes diacritics and accents', () => {
      expect(normalizeTextForSearch('café')).toBe('cafe');
      expect(normalizeTextForSearch('niño')).toBe('nino');
      expect(normalizeTextForSearch('José María')).toBe('jose maria');
      expect(normalizeTextForSearch('São Paulo')).toBe('sao paulo');
    });

    it('replaces special characters with spaces', () => {
      expect(normalizeTextForSearch('hello-world')).toBe('hello world');
      expect(normalizeTextForSearch('hello@world.com')).toBe('hello world com');
      expect(normalizeTextForSearch('one/two\\three')).toBe('one two three');
    });

    it('preserves word characters (alphanumeric and underscore)', () => {
      expect(normalizeTextForSearch('hello_world123')).toBe('hello_world123');
    });

    it('collapses multiple spaces', () => {
      expect(normalizeTextForSearch('hello   world')).toBe('hello world');
      expect(normalizeTextForSearch('a  b  c')).toBe('a b c');
    });

    it('trims leading and trailing whitespace', () => {
      expect(normalizeTextForSearch('  hello  ')).toBe('hello');
    });

    it('handles complex Spanish text', () => {
      expect(normalizeTextForSearch('¿Cómo está? ¡Muy bien!')).toBe('como esta muy bien');
    });

    it('handles empty string', () => {
      expect(normalizeTextForSearch('')).toBe('');
    });
  });

  describe('normalizeTextStrict', () => {
    it('converts to lowercase', () => {
      expect(normalizeTextStrict('HELLO')).toBe('hello');
    });

    it('removes diacritics and accents', () => {
      expect(normalizeTextStrict('café')).toBe('cafe');
      expect(normalizeTextStrict('niño')).toBe('nino');
    });

    it('removes special characters including underscores', () => {
      expect(normalizeTextStrict('hello_world')).toBe('hello world');
      expect(normalizeTextStrict('hello-world')).toBe('hello world');
      expect(normalizeTextStrict('hello@world.com')).toBe('hello world com');
    });

    it('allows only alphanumeric and spaces by default', () => {
      expect(normalizeTextStrict('abc123 xyz')).toBe('abc123 xyz');
      expect(normalizeTextStrict('!@#$%')).toBe('');
    });

    it('does not allow # by default', () => {
      expect(normalizeTextStrict('pedido#12345')).toBe('pedido 12345');
    });

    it('allows # when allowHash is true', () => {
      expect(normalizeTextStrict('pedido#12345', true)).toBe('pedido#12345');
      expect(normalizeTextStrict('order #123', true)).toBe('order #123');
    });

    it('collapses multiple spaces', () => {
      expect(normalizeTextStrict('hello   world')).toBe('hello world');
    });

    it('trims leading and trailing whitespace', () => {
      expect(normalizeTextStrict('  hello  ')).toBe('hello');
    });

    it('handles empty string', () => {
      expect(normalizeTextStrict('')).toBe('');
    });
  });

  describe('normalizeTextWithRepeatedCharRemoval', () => {
    it('converts to lowercase', () => {
      expect(normalizeTextWithRepeatedCharRemoval('HELLO')).toBe('hello');
    });

    it('removes diacritics and accents', () => {
      expect(normalizeTextWithRepeatedCharRemoval('café')).toBe('cafe');
    });

    it('reduces 3+ repeated characters to 2', () => {
      expect(normalizeTextWithRepeatedCharRemoval('holaaaa')).toBe('holaa');
      expect(normalizeTextWithRepeatedCharRemoval('siiii')).toBe('sii');
      expect(normalizeTextWithRepeatedCharRemoval('noooo')).toBe('noo');
    });

    it('preserves 2 repeated characters', () => {
      expect(normalizeTextWithRepeatedCharRemoval('hello')).toBe('hello'); // double 'l' is fine
      expect(normalizeTextWithRepeatedCharRemoval('book')).toBe('book'); // double 'o' is fine
    });

    it('preserves single characters', () => {
      expect(normalizeTextWithRepeatedCharRemoval('hola')).toBe('hola');
    });

    it('handles mixed repeated and non-repeated', () => {
      expect(normalizeTextWithRepeatedCharRemoval('hoooolaaaa muuuundo')).toBe('hoolaa muundo');
    });

    it('replaces special characters with spaces', () => {
      expect(normalizeTextWithRepeatedCharRemoval('hello-world')).toBe('hello world');
    });

    it('collapses multiple spaces', () => {
      expect(normalizeTextWithRepeatedCharRemoval('hello   world')).toBe('hello world');
    });

    it('trims leading and trailing whitespace', () => {
      expect(normalizeTextWithRepeatedCharRemoval('  hello  ')).toBe('hello');
    });

    it('handles empty string', () => {
      expect(normalizeTextWithRepeatedCharRemoval('')).toBe('');
    });
  });

  describe('Integration scenarios', () => {
    it('normalizeTextForSearch handles typical user queries', () => {
      expect(normalizeTextForSearch('¿Tienen productos de Evangelion?')).toBe(
        'tienen productos de evangelion',
      );
      expect(normalizeTextForSearch('Quiero devolver un pedido #12345')).toBe(
        'quiero devolver un pedido 12345',
      );
    });

    it('normalizeTextStrict handles pattern matching for policies', () => {
      expect(normalizeTextStrict('30 días de devolución')).toBe('30 dias de devolucion');
      expect(normalizeTextStrict('reserva 48hs')).toBe('reserva 48hs');
    });

    it('normalizeTextStrict with allowHash handles order IDs', () => {
      expect(normalizeTextStrict('pedido #12345', true)).toBe('pedido #12345');
      expect(normalizeTextStrict('Mi orden #ABC-123', true)).toBe('mi orden #abc 123');
    });

    it('normalizeTextWithRepeatedCharRemoval handles emphatic user input', () => {
      expect(normalizeTextWithRepeatedCharRemoval('Holaaaaa!!!! Como estaaaan???')).toBe(
        'holaa como estaan',
      );
    });
  });
});
