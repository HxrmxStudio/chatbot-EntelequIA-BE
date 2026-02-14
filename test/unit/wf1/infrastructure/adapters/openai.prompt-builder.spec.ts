import { buildPrompt } from '@/modules/wf1/infrastructure/adapters/openai/prompt-builder';

describe('openai/prompt-builder', () => {
  it('keeps only last 6 history messages and truncates each item', () => {
    const history = Array.from({ length: 8 }).map((_, index) => ({
      sender: 'user',
      content: `mensaje-${index}-${'x'.repeat(400)}`,
      createdAt: '2026-01-01T00:00:00.000Z',
    }));

    const result = buildPrompt('hola', 'general', history, []);

    expect(result.userPrompt).not.toContain('mensaje-0');
    expect(result.userPrompt).not.toContain('mensaje-1');
    expect(result.userPrompt).toContain('mensaje-7');
    expect(result.diagnostics.historyItemsIncluded).toBe(6);
  });

  it('trims static context first when context exceeds budget', () => {
    const activeContent = `ACTIVO-${'a'.repeat(300)}`;
    const staticContent = `STATIC-${'s'.repeat(8000)}`;

    const result = buildPrompt(
      'consulta productos',
      'products',
      [],
      [
        {
          contextType: 'products',
          contextPayload: { aiContext: activeContent },
        },
        {
          contextType: 'static_context',
          contextPayload: { context: staticContent },
        },
      ],
    );

    expect(result.diagnostics.contextTruncated).toBe(true);
    expect(result.diagnostics.contextCharsAfter).toBeLessThanOrEqual(5000);
    expect(result.diagnostics.truncationStrategy).toBe('static_context_trimmed');
    expect(result.userPrompt).toContain(activeContent);
  });

  it('is deterministic for the same input', () => {
    const inputBlocks = [
      {
        contextType: 'products' as const,
        contextPayload: { aiContext: `productos-${'p'.repeat(200)}` },
      },
      {
        contextType: 'static_context' as const,
        contextPayload: { context: `static-${'s'.repeat(6000)}` },
      },
    ];
    const inputHistory = [
      {
        sender: 'user' as const,
        content: `historial-${'h'.repeat(320)}`,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const first = buildPrompt('hola', 'products', inputHistory, inputBlocks);
    const second = buildPrompt('hola', 'products', inputHistory, inputBlocks);

    expect(first).toEqual(second);
  });

  it('places user message after context and history to maximize stable prefix reuse', () => {
    const result = buildPrompt(
      'quiero saber stock',
      'products',
      [{ sender: 'user', content: 'hola', createdAt: '2026-01-01T00:00:00.000Z' }],
      [{ contextType: 'products', contextPayload: { aiContext: 'contexto de productos' } }],
    );

    const contextIndex = result.userPrompt.indexOf('Contexto negocio:');
    const historyIndex = result.userPrompt.indexOf('Historial reciente:');
    const userMessageIndex = result.userPrompt.indexOf('Mensaje usuario: quiero saber stock');

    expect(contextIndex).toBeGreaterThan(-1);
    expect(historyIndex).toBeGreaterThan(contextIndex);
    expect(userMessageIndex).toBeGreaterThan(historyIndex);
    expect(result.diagnostics.sectionOrder).toEqual([
      'intent',
      'business_context',
      'history',
      'user_message',
    ]);
  });
});
