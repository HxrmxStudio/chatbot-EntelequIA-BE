import {
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
