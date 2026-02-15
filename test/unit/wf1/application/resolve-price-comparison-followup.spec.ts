import type { ConversationHistoryRow } from '@/modules/wf1/domain/conversation-history';
import {
  resolveLatestCatalogSnapshotFromHistory,
  resolvePriceComparisonItem,
  resolvePriceComparisonRequestIntent,
} from '@/modules/wf1/application/use-cases/handle-incoming-message/flows/pricing/resolve-price-comparison-followup';

describe('resolve-price-comparison-followup', () => {
  it('detects cheapest intents in rioplatense phrasing', () => {
    expect(
      resolvePriceComparisonRequestIntent(
        'cual es el mas barato de los que sugeriste?',
      ),
    ).toBe('cheapest');
    expect(resolvePriceComparisonRequestIntent('cual sale menos?')).toBe('cheapest');
  });

  it('detects most expensive intent', () => {
    expect(resolvePriceComparisonRequestIntent('cual es el mas caro?')).toBe(
      'most_expensive',
    );
  });

  it('returns none for unrelated text', () => {
    expect(resolvePriceComparisonRequestIntent('hola, como va?')).toBe('none');
  });

  it('extracts latest valid catalog snapshot from bot history metadata', () => {
    const historyRows: ConversationHistoryRow[] = [
      {
        id: '1',
        sender: 'bot',
        content: 'respuesta',
        type: 'text',
        channel: 'web',
        created_at: '2026-02-13T00:00:00.000Z',
        metadata: {
          catalogSnapshot: [
            {
              id: 'p1',
              title: 'Producto 1',
              productUrl: 'https://entelequia.com.ar/producto/p1',
              thumbnailUrl: 'https://entelequia.com.ar/images/p1.jpg',
              currency: 'ARS',
              amount: 5000,
            },
            {
              id: 'p2',
              title: 'Producto 2',
              productUrl: 'https://entelequia.com.ar/producto/p2',
              thumbnailUrl: 'https://entelequia.com.ar/images/p2.jpg',
              currency: 'ARS',
              amount: 10000,
            },
          ],
        },
      },
      {
        id: '2',
        sender: 'bot',
        content: 'vieja',
        type: 'text',
        channel: 'web',
        created_at: '2026-02-12T00:00:00.000Z',
        metadata: {
          catalogSnapshot: [],
        },
      },
    ];

    const snapshot = resolveLatestCatalogSnapshotFromHistory(historyRows);

    expect(snapshot).toHaveLength(2);
    expect(snapshot[0]?.amount).toBe(5000);
  });

  it('resolves cheapest and most expensive items deterministically', () => {
    const items = [
      {
        id: 'p1',
        title: 'A',
        productUrl: 'https://entelequia.com.ar/producto/a',
        thumbnailUrl: 'https://entelequia.com.ar/images/a.jpg',
        currency: 'ARS',
        amount: 10000,
      },
      {
        id: 'p2',
        title: 'B',
        productUrl: 'https://entelequia.com.ar/producto/b',
        thumbnailUrl: 'https://entelequia.com.ar/images/b.jpg',
        currency: 'ARS',
        amount: 5000,
      },
    ];

    expect(
      resolvePriceComparisonItem({
        intent: 'cheapest',
        items,
      })?.id,
    ).toBe('p2');

    expect(
      resolvePriceComparisonItem({
        intent: 'most_expensive',
        items,
      })?.id,
    ).toBe('p1');
  });
});
