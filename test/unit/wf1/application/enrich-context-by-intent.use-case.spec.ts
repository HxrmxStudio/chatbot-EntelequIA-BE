import { Test } from '@nestjs/testing';
import { MissingAuthForOrdersError } from '@/modules/wf1/domain/errors';
import { EnrichContextByIntentUseCase } from '@/modules/wf1/application/use-cases/enrich-context-by-intent';
import { ENTELEQUIA_CONTEXT_PORT, PROMPT_TEMPLATES_PORT } from '@/modules/wf1/application/ports/tokens';
import type { EntelequiaContextPort } from '@/modules/wf1/application/ports/entelequia-context.port';
import type { PromptTemplatesPort } from '@/modules/wf1/application/ports/prompt-templates.port';

describe('EnrichContextByIntentUseCase', () => {
  let useCase: EnrichContextByIntentUseCase;
  let entelequiaPort: jest.Mocked<EntelequiaContextPort>;
  let promptTemplates: PromptTemplatesPort;

  beforeEach(async () => {
    entelequiaPort = {
      getProducts: jest.fn().mockResolvedValue({ contextType: 'products', contextPayload: {} }),
      getProductDetail: jest.fn(),
      getRecommendations: jest.fn().mockResolvedValue({ contextType: 'recommendations', contextPayload: {} }),
      getPaymentInfo: jest.fn().mockResolvedValue({ contextType: 'payment_info', contextPayload: {} }),
      getAuthenticatedUserProfile: jest.fn().mockResolvedValue({
        email: 'user@example.com',
        phone: '',
        name: 'Customer',
      }),
      getOrders: jest.fn().mockResolvedValue({ contextType: 'orders', contextPayload: {} }),
      getOrderDetail: jest.fn().mockResolvedValue({ contextType: 'order_detail', contextPayload: {} }),
    };

    promptTemplates = {
      getProductsContextHeader: () => 'PRODUCTOS ENTELEQUIA',
      getProductsContextAdditionalInfo: () => 'Info adicional',
      getProductsContextInstructions: () => 'Instrucciones',
      getGeneralContextHint: () => 'Hint general',
      getStaticContext: () => 'Contexto estatico',
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EnrichContextByIntentUseCase,
        { provide: ENTELEQUIA_CONTEXT_PORT, useValue: entelequiaPort },
        { provide: PROMPT_TEMPLATES_PORT, useValue: promptTemplates },
      ],
    }).compile();

    useCase = moduleRef.get(EnrichContextByIntentUseCase);
  });

  it('throws MissingAuthForOrdersError when orders intent without accessToken', async () => {
    await expect(
      useCase.execute({
        intentResult: { intent: 'orders', confidence: 0.9, entities: [] },
        text: 'donde esta mi pedido',
      }),
    ).rejects.toThrow(MissingAuthForOrdersError);

    expect(entelequiaPort.getOrders).not.toHaveBeenCalled();
  });

  it('returns products context for products intent', async () => {
    const result = await useCase.execute({
      intentResult: { intent: 'products', confidence: 0.9, entities: ['One Piece'] },
      text: 'busco One Piece',
      currency: 'ARS',
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextType).toBe('products');
    expect(entelequiaPort.getProducts).toHaveBeenCalledWith({
      query: 'One Piece',
      currency: 'ARS',
    });
  });

  it('strips volume hints and generic tokens from products query entities', async () => {
    await useCase.execute({
      intentResult: { intent: 'products', confidence: 0.9, entities: ['manga', 'Attack on Titan', 'Nro 1'] },
      text: 'Hola, tienen manga Nro 1 de Attack on Titan?',
      currency: 'ARS',
    });

    expect(entelequiaPort.getProducts).toHaveBeenCalledWith({
      query: 'Attack on Titan',
      categorySlug: 'mangas',
      currency: 'ARS',
    });
  });

  it('adds bestMatch, availabilityHint and aiContext when matching products are available', async () => {
    entelequiaPort.getProducts.mockResolvedValueOnce({
      contextType: 'products',
      contextPayload: {
        query: 'Attack on Titan',
        total: 136,
        items: [
          {
            id: 61716,
            slug: 'attack-on-titan-edicion-deluxe-04_61716',
            title: 'ATTACK ON TITAN EDICIÓN DELUXE 04',
            stock: 8,
            categorySlug: 'mangas-seinen',
            categoryName: 'Seinen',
            price: { currency: 'ARS', amount: 24999 },
            url: 'https://entelequia.com.ar/producto/attack-on-titan-edicion-deluxe-04_61716',
          },
          {
            id: 54297,
            slug: 'attack-on-titan-edicion-deluxe-01_54297',
            title: 'ATTACK ON TITAN EDICIÓN DELUXE 01',
            stock: 6,
            categorySlug: 'mangas-seinen',
            categoryName: 'Seinen',
            price: { currency: 'ARS', amount: 24999 },
            url: 'https://entelequia.com.ar/producto/attack-on-titan-edicion-deluxe-01_54297',
          },
          {
            id: 57231,
            slug: 'attack-on-titan-edicion-deluxe-02_57231',
            title: 'ATTACK ON TITAN EDICIÓN DELUXE 02',
            stock: 18,
            categorySlug: 'mangas-seinen',
            categoryName: 'Seinen',
            price: { currency: 'ARS', amount: 24999 },
            url: 'https://entelequia.com.ar/producto/attack-on-titan-edicion-deluxe-02_57231',
          },
        ],
        summary: '...',
      },
    });

    entelequiaPort.getProductDetail.mockResolvedValueOnce({
      contextType: 'product_detail',
      contextPayload: { product: { slug: 'attack-on-titan-edicion-deluxe-01_54297' } },
    });

    const result = await useCase.execute({
      intentResult: { intent: 'products', confidence: 0.97, entities: ['manga', 'Attack on Titan', 'Nro 1'] },
      text: 'Hola, tienen manga Nro 1 de Attack on Titan?',
      currency: 'ARS',
    });

    expect(result).toHaveLength(2);
    expect(result[0].contextType).toBe('products');
    expect(result[1].contextType).toBe('product_detail');

    const payload = result[0].contextPayload;
    expect(payload).toHaveProperty('aiContext');
    expect(payload).toHaveProperty('bestMatch');
    expect(payload).toHaveProperty('availabilityHint');
    expect(payload).toHaveProperty('productCount');
    expect(payload).toHaveProperty('inStockCount');

    expect((payload.bestMatch as { slug?: string }).slug).toBe('attack-on-titan-edicion-deluxe-01_54297');
    expect(typeof payload.availabilityHint).toBe('string');
    expect(String(payload.availabilityHint)).toContain('DELUXE 01');

    expect(entelequiaPort.getProductDetail).toHaveBeenCalledWith({
      idOrSlug: 'attack-on-titan-edicion-deluxe-01_54297',
      currency: 'ARS',
    });
  });

  it('returns store_info static context', async () => {
    const result = await useCase.execute({
      intentResult: { intent: 'store_info', confidence: 0.95, entities: [] },
      text: 'donde estan',
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextType).toBe('store_info');
    expect(result[0].contextPayload).toHaveProperty('info');
    expect(entelequiaPort.getProducts).not.toHaveBeenCalled();
  });

  it('returns general context for general intent', async () => {
    const result = await useCase.execute({
      intentResult: { intent: 'general', confidence: 0.6, entities: [] },
      text: 'hola',
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextType).toBe('general');
  });

  it('calls getOrderDetail when orderId is extracted from entities', async () => {
    const result = await useCase.execute({
      intentResult: { intent: 'orders', confidence: 0.9, entities: ['pedido 123456'] },
      text: 'estado del pedido 123456',
      accessToken: 'token',
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextType).toBe('order_detail');
    expect(entelequiaPort.getOrderDetail).toHaveBeenCalledWith({
      accessToken: 'token',
      orderId: '123456',
    });
    expect(entelequiaPort.getOrders).not.toHaveBeenCalled();
  });
});
