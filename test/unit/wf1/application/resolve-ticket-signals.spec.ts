import { resolveTicketSignals } from '@/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers';

describe('resolveTicketSignals', () => {
  it('sets high priority and escalation for urgent negative complaint', () => {
    const result = resolveTicketSignals({
      text: 'Tengo un reclamo urgente, el pedido llego roto',
      entities: [],
      sentiment: 'negative',
    });

    expect(result.issueType).toBe('product_condition');
    expect(result.priority).toBe('high');
    expect(result.requiresHumanEscalation).toBe(true);
  });

  it('sets normal priority for non-urgent neutral delivery issue', () => {
    const result = resolveTicketSignals({
      text: 'No me llega el envio, queria consultar tracking',
      entities: [],
      sentiment: 'neutral',
    });

    expect(result.issueType).toBe('delivery');
    expect(result.priority).toBe('normal');
    expect(result.requiresHumanEscalation).toBe(false);
  });

  it('keeps escalation true when sentiment is negative even if priority is normal', () => {
    const result = resolveTicketSignals({
      text: 'Necesito ayuda con mi pedido',
      entities: [],
      sentiment: 'negative',
    });

    expect(result.issueType).toBe('order');
    expect(result.priority).toBe('normal');
    expect(result.requiresHumanEscalation).toBe(true);
  });
});
