import { detectComplexSignals, routeModel } from '@/modules/wf1/domain/model-router';

describe('model-router', () => {
  it('routes simple intents to economical model', () => {
    const decision = routeModel({
      intent: 'orders',
      messageLength: 32,
      hasMultiTurnContext: false,
      containsComplexSignals: false,
    });

    expect(decision.selectedModel).toBe('gpt-4.1-nano');
    expect(decision.reason).toBe('simple_default');
  });

  it('routes recommendation intent to primary model', () => {
    const decision = routeModel({
      intent: 'recommendations',
      messageLength: 40,
      hasMultiTurnContext: false,
      containsComplexSignals: false,
    });

    expect(decision.selectedModel).toBe('gpt-4.1-mini');
    expect(decision.reason).toBe('complex_intent');
  });

  it('detects complex signals from text', () => {
    expect(detectComplexSignals('me recomendas algo para comparar?')).toBe(true);
    expect(detectComplexSignals('hola, necesito el estado de mi pedido')).toBe(false);
  });
});

