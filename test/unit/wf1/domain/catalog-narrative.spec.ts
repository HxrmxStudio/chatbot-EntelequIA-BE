import { sanitizeCatalogNarrativeMessage } from '@/modules/wf1/domain/assistant-output-safety/catalog-narrative';
import type { UiPayloadV1 } from '@/modules/wf1/domain/ui-payload';

describe('catalog narrative sanitization', () => {
  const uiPayload: UiPayloadV1 = {
    version: '1',
    kind: 'catalog',
    layout: 'list',
    cards: [
      {
        id: 'ev-1',
        title: 'Evangelion 01',
        productUrl: 'https://entelequia.com.ar/producto/evangelion-01',
        thumbnailUrl: 'https://entelequia.com.ar/images/ev-1.jpg',
        thumbnailAlt: 'Evangelion 01',
      },
      {
        id: 'ev-2',
        title: 'Evangelion 02',
        productUrl: 'https://entelequia.com.ar/producto/evangelion-02',
        thumbnailUrl: 'https://entelequia.com.ar/images/ev-2.jpg',
        thumbnailAlt: 'Evangelion 02',
      },
    ],
  };

  it('compacts duplicated product list narrative when cards are already present', () => {
    const result = sanitizeCatalogNarrativeMessage({
      message:
        '1. Evangelion 01 - https://entelequia.com.ar/producto/evangelion-01\n2. Evangelion 02 - https://entelequia.com.ar/producto/evangelion-02',
      uiPayload,
    });

    expect(result.rewritten).toBe(true);
    expect(result.reasons).toContain('catalog_list_compacted');
    expect(result.message.toLowerCase()).toContain('te muestro 2 opciones');
  });

  it('rewrites contradictory no-stock text when cards exist', () => {
    const result = sanitizeCatalogNarrativeMessage({
      message: 'No tenemos productos de Evangelion ahora mismo.',
      uiPayload,
    });

    expect(result.rewritten).toBe(true);
    expect(result.reasons).toContain('catalog_contradiction_removed');
    expect(result.message.toLowerCase()).toContain('te muestro');
  });
});
