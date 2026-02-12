import { sanitizeAssistantUserMessage } from '@/modules/wf1/domain/assistant-output-safety';

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
});
