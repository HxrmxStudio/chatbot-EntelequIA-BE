import { buildTicketsAiContext } from '@/modules/wf1/domain/tickets-context';

describe('tickets-context', () => {
  it('builds ai context with priority note when escalation is required', () => {
    const result = buildTicketsAiContext({
      signals: {
        issueType: 'payment',
        priority: 'high',
        sentiment: 'negative',
        requiresHumanEscalation: true,
      },
    });

    expect(result.contextText).toContain('SOPORTE TÉCNICO ENTELEQUIA');
    expect(result.contextText).toContain('Prioridad: Alta prioridad');
    expect(result.contextText).toContain('Prioridad alta detectada');
    expect(result.contextText).not.toContain('Uruguay 341');
    expect(result.contextText).not.toContain('+54 9 11 6189-8533');
  });

  it('does not include high priority note when escalation is false', () => {
    const result = buildTicketsAiContext({
      signals: {
        issueType: 'order',
        priority: 'normal',
        sentiment: 'neutral',
        requiresHumanEscalation: false,
      },
    });

    expect(result.contextText).toContain('Prioridad: Normal');
    expect(result.contextText).not.toContain('Prioridad alta detectada');
  });

  it('prioritizes returns policy details before contact options on returns issues', () => {
    const result = buildTicketsAiContext({
      signals: {
        issueType: 'returns',
        priority: 'normal',
        sentiment: 'neutral',
        requiresHumanEscalation: false,
      },
    });

    expect(result.contextText).toContain('Politica de cambios y devoluciones');
    expect(result.contextText).toContain('30 dias corridos');
    expect(result.contextText).toContain('48 horas');
    expect(result.contextText).toContain('canal oficial');
    expect(result.contextText).not.toContain('Tipo detectado: Devolución o cambio');
  });
});
