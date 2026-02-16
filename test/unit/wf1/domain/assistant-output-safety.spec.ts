import {
  dedupeAssistantGreeting,
  sanitizeAssistantUserMessage,
  sanitizeEmptyListItems,
} from '@/modules/wf1/domain/assistant-output-safety';

describe('assistant-output-safety', () => {
  it('rewrites context wording to user-safe language', () => {
    const result = sanitizeAssistantUserMessage(
      'No tenemos el numero 1 de Naruto en el contexto.',
    );

    expect(result.message).toContain('ahora');
    expect(result.message.toLowerCase()).not.toContain('contexto');
    expect(result.rewritten).toBe(true);
  });

  it('rewrites technical terms without breaking urls or prices', () => {
    const message =
      'La API devolvio JSON invalido por timeout. Precio: $10.499 ARS https://entelequia.com.ar/producto/test';
    const result = sanitizeAssistantUserMessage(message);

    expect(result.message.toLowerCase()).not.toContain('api');
    expect(result.message.toLowerCase()).not.toContain('json');
    expect(result.message.toLowerCase()).not.toContain('timeout');
    expect(result.message).toContain('$10.499 ARS');
    expect(result.message).toContain('https://entelequia.com.ar/producto/test');
  });

  it('rewrites hard generic processing error', () => {
    const result = sanitizeAssistantUserMessage('No pudimos procesar tu mensaje.');

    expect(result.message).toContain('Se complico esta consulta');
    expect(result.message).not.toContain('No pudimos procesar tu mensaje');
  });

  it('does not rewrite clean user-facing text', () => {
    const input = 'Tenemos Evangelion Deluxe tomo 1 con hay stock y precio $10.499 ARS.';
    const result = sanitizeAssistantUserMessage(input);

    expect(result.message).toBe(input);
    expect(result.rewritten).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  describe('sanitizeEmptyListItems', () => {
    it('removes empty list items with colons', () => {
      const input = 'Contact:\n- Phone: 123\n- Web:\n- Email: foo@bar.com';
      const result = sanitizeEmptyListItems(input);
      expect(result).not.toContain('- Web:');
      expect(result).toContain('- Phone: 123');
      expect(result).toContain('- Email: foo@bar.com');
    });

    it('does not remove list items with content', () => {
      const input = '- Web: https://example.com\n- Phone: 123';
      expect(sanitizeEmptyListItems(input)).toBe(input);
    });

    it('handles multiple empty items', () => {
      const input = '- Field1:\n- Field2: value\n- Field3:  \n';
      const result = sanitizeEmptyListItems(input);
      expect(result).toContain('- Field2: value');
      expect(result).not.toContain('- Field1:');
      expect(result).not.toContain('- Field3:');
    });

    it('returns empty string unchanged', () => {
      expect(sanitizeEmptyListItems('')).toBe('');
    });
  });

  it('dedupes repeated greeting when previous bot turn already greeted', () => {
    const deduped = dedupeAssistantGreeting({
      message: 'Hola! Tenemos mangas de Evangelion en stock.',
      previousBotMessage: 'Hola, en que te puedo ayudar?',
    });

    expect(deduped.rewritten).toBe(true);
    expect(deduped.message.startsWith('Hola')).toBe(false);
    expect(deduped.message).toContain('Tenemos mangas de Evangelion');
  });
});
