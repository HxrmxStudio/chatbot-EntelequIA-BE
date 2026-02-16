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

  it('trims static context before active context when context exceeds budget', () => {
    const activeContent = `ACTIVO-${'a'.repeat(2200)}`;
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
    expect(result.diagnostics.contextCharsAfter).toBeLessThanOrEqual(9000);
    expect(result.diagnostics.truncationStrategy).toBe('static_context_trimmed');
    expect(result.userPrompt).toContain('ACTIVO-');
    expect(result.diagnostics.policyFactsIncluded).toBe(false);
    expect(result.diagnostics.criticalPolicyIncluded).toBe(false);
    expect(result.diagnostics.criticalPolicyTrimmed).toBe(false);
  });

  it('keeps critical policy context before trimming active blocks', () => {
    const activeContent = `ACTIVO-${'a'.repeat(6000)}`;
    const criticalContent = `CRITICAL-${'c'.repeat(600)}`;
    const staticContent = `STATIC-${'s'.repeat(3000)}`;

    const result = buildPrompt(
      'consulta de devoluciones',
      'tickets',
      [],
      [
        {
          contextType: 'tickets',
          contextPayload: { aiContext: activeContent },
        },
        {
          contextType: 'static_context',
          contextPayload: { context: staticContent },
        },
        {
          contextType: 'critical_policy',
          contextPayload: { context: criticalContent },
        },
      ],
    );

    expect(result.diagnostics.contextTruncated).toBe(true);
    expect(result.diagnostics.criticalPolicyIncluded).toBe(true);
    expect(result.diagnostics.policyFactsIncluded).toBe(false);
    expect(result.userPrompt).toContain('CRITICAL-');
  });

  it('keeps policy facts and critical policy when optional context overflows', () => {
    const policyFactsContent = `POLICY_FACTS-${'p'.repeat(500)}`;
    const criticalContent = `CRITICAL-${'c'.repeat(1000)}`;
    const staticContent = `STATIC-${'s'.repeat(9000)}`;

    const result = buildPrompt(
      'consulta de reservas y envios internacionales',
      'products',
      [],
      [
        {
          contextType: 'policy_facts',
          contextPayload: { context: policyFactsContent },
        },
        {
          contextType: 'critical_policy',
          contextPayload: { context: criticalContent },
        },
        {
          contextType: 'static_context',
          contextPayload: { context: staticContent },
        },
      ],
    );

    expect(result.diagnostics.contextTruncated).toBe(true);
    expect(result.diagnostics.policyFactsIncluded).toBe(true);
    expect(result.diagnostics.criticalPolicyIncluded).toBe(true);
    expect(result.diagnostics.criticalPolicyTrimmed).toBe(false);
    expect(result.userPrompt).toContain('POLICY_FACTS-');
    expect(result.userPrompt).toContain('CRITICAL-');
    expect(result.diagnostics.contextCharsAfter).toBeLessThanOrEqual(9000);
  });

  it('preserves canonical shipping ranges in critical policy when static context is trimmed', () => {
    const paymentInfoContent = [
      'TIEMPOS DE ENTREGA',
      '- CABA (moto): en el dia (pedido antes de las 13hs).',
      '- Interior con Andreani: 3-5 dias habiles.',
    ].join('\n');
    const criticalPolicyContent = [
      'TIEMPOS ESTIMADOS DE ENVIO (REFERENCIA)',
      '- CABA (moto): 24-48hs (entrega en el dia comprando antes de las 13hs).',
      '- Interior con Andreani: 3-5 dias habiles.',
      '- Interior con Correo Argentino: 5-7 dias habiles.',
      '- Internacional con DHL: menos de 4 dias habiles.',
    ].join('\n');
    const staticContent = `STATIC-${'s'.repeat(12000)}`;

    const result = buildPrompt(
      'cuanto tarda el envio',
      'payment_shipping',
      [],
      [
        {
          contextType: 'payment_info',
          contextPayload: { aiContext: paymentInfoContent },
        },
        {
          contextType: 'critical_policy',
          contextPayload: { context: criticalPolicyContent },
        },
        {
          contextType: 'static_context',
          contextPayload: { context: staticContent },
        },
      ],
    );

    expect(result.diagnostics.contextTruncated).toBe(true);
    expect(result.diagnostics.truncationStrategy).toBe('static_context_trimmed');
    expect(result.diagnostics.criticalPolicyIncluded).toBe(true);
    expect(result.userPrompt).toContain('24-48hs');
    expect(result.userPrompt).toContain('3-5 dias habiles');
    expect(result.userPrompt).toContain('5-7 dias habiles');
    expect(result.userPrompt).toContain('DHL');
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
