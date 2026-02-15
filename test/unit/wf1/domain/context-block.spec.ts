import {
  appendCriticalPolicyContextBlock,
  appendPolicyFactsContextBlock,
  appendPriceChallengeHintContextBlock,
  appendStaticContextBlock,
  renderContextBlocksForPrompt,
  type ContextBlock,
} from '@/modules/wf1/domain/context-block';

describe('Context Block', () => {
  describe('appendStaticContextBlock', () => {
    it('returns empty array when staticContext is empty string', () => {
      const result = appendStaticContextBlock([], '');
      expect(result).toEqual([]);
    });

    it('returns empty array when staticContext is whitespace only', () => {
      const result = appendStaticContextBlock([], '   ');
      expect(result).toEqual([]);
    });

    it('returns empty array when staticContext is not a string', () => {
      const result = appendStaticContextBlock([], null);
      expect(result).toEqual([]);
    });

    it('returns array with static context when contextBlocks is empty and staticContext is valid', () => {
      const staticContext = 'Test static context';
      const result = appendStaticContextBlock([], staticContext);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        contextType: 'static_context',
        contextPayload: { context: staticContext },
      });
    });

    it('trims whitespace from staticContext', () => {
      const result = appendStaticContextBlock([], '  Test context  ');

      expect(result[0].contextPayload.context).toBe('Test context');
    });

    it('appends static context to existing blocks', () => {
      const existingBlocks: ContextBlock[] = [
        {
          contextType: 'products',
          contextPayload: { summary: 'Product summary' },
        },
      ];
      const result = appendStaticContextBlock(existingBlocks, 'Static context');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(existingBlocks[0]);
      expect(result[1]).toEqual({
        contextType: 'static_context',
        contextPayload: { context: 'Static context' },
      });
    });

    it('replaces existing static_context block', () => {
      const existingBlocks: ContextBlock[] = [
        {
          contextType: 'products',
          contextPayload: { summary: 'Product summary' },
        },
        {
          contextType: 'static_context',
          contextPayload: { context: 'Old static context' },
        },
      ];
      const result = appendStaticContextBlock(existingBlocks, 'New static context');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(existingBlocks[0]);
      expect(result[1]).toEqual({
        contextType: 'static_context',
        contextPayload: { context: 'New static context' },
      });
    });

    it('replaces multiple static_context blocks with single one', () => {
      const existingBlocks: ContextBlock[] = [
        {
          contextType: 'static_context',
          contextPayload: { context: 'First static' },
        },
        {
          contextType: 'products',
          contextPayload: { summary: 'Product summary' },
        },
        {
          contextType: 'static_context',
          contextPayload: { context: 'Second static' },
        },
      ];
      const result = appendStaticContextBlock(existingBlocks, 'New static context');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(existingBlocks[1]);
      expect(result[1]).toEqual({
        contextType: 'static_context',
        contextPayload: { context: 'New static context' },
      });
    });

    it('returns original array when staticContext is invalid and contextBlocks has items', () => {
      const existingBlocks: ContextBlock[] = [
        {
          contextType: 'products',
          contextPayload: { summary: 'Product summary' },
        },
      ];
      const result = appendStaticContextBlock(existingBlocks, '');

      expect(result).toEqual(existingBlocks);
    });

    it('handles non-array contextBlocks gracefully', () => {
      const result = appendStaticContextBlock(null as unknown as ContextBlock[], 'Valid context');
      expect(result).toEqual([
        {
          contextType: 'static_context',
          contextPayload: { context: 'Valid context' },
        },
      ]);
    });
  });

  describe('appendCriticalPolicyContextBlock', () => {
    it('returns empty array when critical policy context is empty string', () => {
      const result = appendCriticalPolicyContextBlock([], '');
      expect(result).toEqual([]);
    });

    it('appends critical policy block to existing context', () => {
      const existingBlocks: ContextBlock[] = [
        {
          contextType: 'products',
          contextPayload: { summary: 'Product summary' },
        },
      ];

      const result = appendCriticalPolicyContextBlock(
        existingBlocks,
        'Politica critica',
      );

      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({
        contextType: 'critical_policy',
        contextPayload: { context: 'Politica critica' },
      });
    });

    it('replaces existing critical_policy block', () => {
      const existingBlocks: ContextBlock[] = [
        {
          contextType: 'critical_policy',
          contextPayload: { context: 'Politica vieja' },
        },
      ];

      const result = appendCriticalPolicyContextBlock(
        existingBlocks,
        'Politica nueva',
      );

      expect(result).toEqual([
        {
          contextType: 'critical_policy',
          contextPayload: { context: 'Politica nueva' },
        },
      ]);
    });
  });

  describe('appendPolicyFactsContextBlock', () => {
    it('returns empty array when policy facts context is empty string', () => {
      const result = appendPolicyFactsContextBlock([], '');
      expect(result).toEqual([]);
    });

    it('appends policy facts block to existing context', () => {
      const existingBlocks: ContextBlock[] = [
        {
          contextType: 'products',
          contextPayload: { summary: 'Product summary' },
        },
      ];

      const result = appendPolicyFactsContextBlock(existingBlocks, 'Hechos clave');

      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({
        contextType: 'policy_facts',
        contextPayload: { context: 'Hechos clave' },
      });
    });

    it('replaces existing policy_facts block', () => {
      const existingBlocks: ContextBlock[] = [
        {
          contextType: 'policy_facts',
          contextPayload: { context: 'Hechos viejos' },
        },
      ];

      const result = appendPolicyFactsContextBlock(existingBlocks, 'Hechos nuevos');

      expect(result).toEqual([
        {
          contextType: 'policy_facts',
          contextPayload: { context: 'Hechos nuevos' },
        },
      ]);
    });
  });

  describe('appendPriceChallengeHintContextBlock', () => {
    it('appends instruction_hint block with price challenge hint', () => {
      const result = appendPriceChallengeHintContextBlock([]);

      expect(result).toHaveLength(1);
      expect(result[0].contextType).toBe('instruction_hint');
      expect(result[0].contextPayload.hint).toContain('cuestionando');
      expect(result[0].contextPayload.hint).toContain('precio');
    });

    it('replaces existing instruction_hint block', () => {
      const existing: ContextBlock[] = [
        { contextType: 'instruction_hint', contextPayload: { hint: 'old' } },
      ];
      const result = appendPriceChallengeHintContextBlock(existing);

      expect(result).toHaveLength(1);
      expect(result[0].contextPayload.hint).toContain('cuestionando');
    });
  });

  describe('renderContextBlocksForPrompt', () => {
    it('returns empty string when contextBlocks is empty', () => {
      expect(renderContextBlocksForPrompt([])).toBe('');
    });

    it('returns empty string when contextBlocks is not an array', () => {
      expect(renderContextBlocksForPrompt(null as unknown as ContextBlock[])).toBe('');
    });

    it('renders products block with aiContext', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'products',
          contextPayload: { aiContext: 'Product AI context' },
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toBe('Product AI context');
    });

    it('renders products block with summary when aiContext is missing', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'products',
          contextPayload: { summary: 'Product summary' },
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toBe('Product summary');
    });

    it('renders products block as JSON when neither aiContext nor summary exist', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'products',
          contextPayload: { items: [{ id: 1 }] },
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toContain('Productos:');
      expect(result).toContain('{"items":[{"id":1}]}');
    });

    it('renders orders block with aiContext', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'orders',
          contextPayload: { aiContext: 'Orders AI context' },
        },
      ];

      const result = renderContextBlocksForPrompt(blocks);
      expect(result).toBe('Orders AI context');
    });

    it('renders order_detail block as JSON when aiContext is missing', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'order_detail',
          contextPayload: { order: { id: 1 } },
        },
      ];

      const result = renderContextBlocksForPrompt(blocks);
      expect(result).toContain('Detalle de orden:');
      expect(result).toContain('{"order":{"id":1}}');
    });

    it('renders payment_info block with aiContext', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'payment_info',
          contextPayload: { aiContext: 'Contexto de pagos y envios' },
        },
      ];

      const result = renderContextBlocksForPrompt(blocks);
      expect(result).toBe('Contexto de pagos y envios');
    });

    it('renders recommendations block with aiContext', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'recommendations',
          contextPayload: { aiContext: 'Contexto de recomendaciones' },
        },
      ];

      const result = renderContextBlocksForPrompt(blocks);
      expect(result).toBe('Contexto de recomendaciones');
    });

    it('renders tickets block with aiContext', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'tickets',
          contextPayload: { aiContext: 'Contexto de soporte' },
        },
      ];

      const result = renderContextBlocksForPrompt(blocks);
      expect(result).toBe('Contexto de soporte');
    });

    it('renders store_info block with aiContext', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'store_info',
          contextPayload: { aiContext: 'Contexto de locales' },
        },
      ];

      const result = renderContextBlocksForPrompt(blocks);
      expect(result).toBe('Contexto de locales');
    });

    it('renders static_context block with context string', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'static_context',
          contextPayload: { context: 'Static business context' },
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toBe('Static business context');
    });

    it('renders static_context block as JSON when context is missing', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'static_context',
          contextPayload: { other: 'data' },
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toContain('Contexto estatico:');
      expect(result).toContain('{"other":"data"}');
    });

    it('renders critical_policy block with context string', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'critical_policy',
          contextPayload: { context: 'Politica de devoluciones' },
        },
      ];

      const result = renderContextBlocksForPrompt(blocks);
      expect(result).toBe('Politica de devoluciones');
    });

    it('renders policy_facts block with context string', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'policy_facts',
          contextPayload: { context: 'Hechos operativos clave' },
        },
      ];

      const result = renderContextBlocksForPrompt(blocks);
      expect(result).toBe('Hechos operativos clave');
    });

    it('renders instruction_hint block with hint', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'instruction_hint',
          contextPayload: { hint: 'Valida el precio indicado.' },
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toContain('Instruccion importante:');
      expect(result).toContain('Valida el precio indicado.');
    });

    it('renders general block with hint', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'general',
          contextPayload: { hint: 'General hint text' },
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toBe('Contexto general:\nGeneral hint text');
    });

    it('renders general block with aiContext before hint', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'general',
          contextPayload: {
            aiContext: 'General ai context',
            hint: 'General hint text',
          },
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toBe('General ai context');
    });

    it('renders general block as JSON when hint is missing', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'general',
          contextPayload: { other: 'data' },
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toContain('Contexto general:');
      expect(result).toContain('{"other":"data"}');
    });

    it('renders multiple blocks separated by separator', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'products',
          contextPayload: { aiContext: 'Product context' },
        },
        {
          contextType: 'static_context',
          contextPayload: { context: 'Static context' },
        },
        {
          contextType: 'general',
          contextPayload: { hint: 'General hint' },
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toBe(
        'Product context\n\n---\n\nStatic context\n\n---\n\nContexto general:\nGeneral hint',
      );
    });

    it('renders blocks with empty string values as JSON fallback', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'products',
          contextPayload: { aiContext: 'Valid context' },
        },
        {
          contextType: 'static_context',
          contextPayload: { context: '' },
        },
        {
          contextType: 'general',
          contextPayload: { hint: '   ' },
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toContain('Valid context');
      expect(result).toContain('Contexto estatico:');
      expect(result).toContain('{"context":""}');
      expect(result).toContain('Contexto general:');
      expect(result).toContain('{"hint":"   "}');
    });

    it('trims whitespace from rendered blocks', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'static_context',
          contextPayload: { context: '  Context with spaces  ' },
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toBe('Context with spaces');
    });

    it('handles unknown context types by rendering as JSON', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'unknown_type' as ContextBlock['contextType'],
          contextPayload: { data: 'value' },
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toContain('unknown_type:');
      expect(result).toContain('{"data":"value"}');
    });

    it('handles non-serializable payload gracefully', () => {
      const circular: Record<string, unknown> = { data: 'value' };
      circular.self = circular; // Create circular reference

      const blocks: ContextBlock[] = [
        {
          contextType: 'products',
          contextPayload: circular,
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toContain('Productos:');
      expect(result).toContain('(payload no serializable)');
    });

    it('prioritizes aiContext over summary in products block', () => {
      const blocks: ContextBlock[] = [
        {
          contextType: 'products',
          contextPayload: {
            aiContext: 'AI context',
            summary: 'Summary',
          },
        },
      ];
      const result = renderContextBlocksForPrompt(blocks);

      expect(result).toBe('AI context');
      expect(result).not.toContain('Summary');
    });
  });
});
