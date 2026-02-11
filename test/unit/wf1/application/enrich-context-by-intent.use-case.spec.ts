import { Test } from '@nestjs/testing';
import { ExternalServiceError, MissingAuthForOrdersError } from '@/modules/wf1/domain/errors';
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
      getOrdersListContextHeader: () => 'TUS ULTIMOS PEDIDOS',
      getOrdersListContextInstructions: () => 'Instrucciones de ordenes',
      getOrderDetailContextInstructions: () => 'Instrucciones detalle orden',
      getOrdersEmptyContextMessage: () => 'No encontramos pedidos.',
      getPaymentShippingPaymentContext: () => 'MEDIOS DE PAGO',
      getPaymentShippingShippingContext: () => 'ENVIOS',
      getPaymentShippingCostContext: () => 'COSTOS',
      getPaymentShippingTimeContext: () => 'TIEMPOS',
      getPaymentShippingGeneralContext: () => 'PAGOS Y ENVIOS',
      getPaymentShippingInstructions: () => 'Instrucciones de pago y envio',
      getRecommendationsContextHeader: () => 'RECOMENDACIONES PERSONALIZADAS',
      getRecommendationsContextWhyThese: () => 'Por que estos productos',
      getRecommendationsContextInstructions: () => 'Instrucciones de recomendaciones',
      getRecommendationsEmptyContextMessage: () => 'No tengo recomendaciones especificas.',
      getTicketsContextHeader: () => 'SOPORTE TÉCNICO ENTELEQUIA',
      getTicketsContactOptions: () => 'Opciones de contacto',
      getTicketsHighPriorityNote: () => 'Nota de prioridad alta',
      getTicketsContextInstructions: () => 'Instrucciones de tickets',
      getStoreInfoLocationContext: () => 'Info de ubicacion',
      getStoreInfoHoursContext: () => 'Info de horarios',
      getStoreInfoParkingContext: () => 'Info de estacionamiento',
      getStoreInfoTransportContext: () => 'Info de transporte',
      getStoreInfoGeneralContext: () => 'Info general de locales',
      getStoreInfoContextInstructions: () => 'Instrucciones de store_info',
      getGeneralContextHint: () => 'Hint general',
      getGeneralContextInstructions: () => 'Instrucciones de general',
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
    expect(result[0].contextPayload).toHaveProperty('stockDisclosurePolicy', 'banded');
    expect(result[0].contextPayload).toHaveProperty('lowStockThreshold', 3);
    expect(result[0].contextPayload).toHaveProperty('discloseExactStock', false);
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

  it('enables exact stock disclosure when user asks for exact quantity', async () => {
    const result = await useCase.execute({
      intentResult: { intent: 'products', confidence: 0.9, entities: ['Attack on Titan'] },
      text: 'Cuantas unidades tienen de Attack on Titan?',
      currency: 'ARS',
    });

    expect(result[0].contextType).toBe('products');
    expect(result[0].contextPayload).toHaveProperty('discloseExactStock', true);
    expect(result[0].contextPayload).toHaveProperty('stockDisclosurePolicy', 'exact');
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
    expect(payload).toHaveProperty('stockDisclosurePolicy', 'banded');
    expect(payload).toHaveProperty('discloseExactStock', false);

    expect((payload.bestMatch as { slug?: string }).slug).toBe('attack-on-titan-edicion-deluxe-01_54297');
    expect(typeof payload.availabilityHint).toBe('string');
    expect(String(payload.availabilityHint)).toContain('DELUXE 01');
    expect(String(payload.availabilityHint)).toContain('Stock: Hay stock');

    expect(entelequiaPort.getProductDetail).toHaveBeenCalledWith({
      idOrSlug: 'attack-on-titan-edicion-deluxe-01_54297',
      currency: 'ARS',
    });
  });

  it('returns store_info ai context with resolved subtype', async () => {
    const result = await useCase.execute({
      intentResult: { intent: 'store_info', confidence: 0.95, entities: [] },
      text: 'donde estan',
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextType).toBe('store_info');
    expect(result[0].contextPayload).toHaveProperty('aiContext');
    expect(result[0].contextPayload).toHaveProperty('infoRequested', 'location');
    expect(entelequiaPort.getProducts).not.toHaveBeenCalled();
  });

  it('returns general context for general intent', async () => {
    const result = await useCase.execute({
      intentResult: { intent: 'general', confidence: 0.6, entities: [] },
      text: 'hola',
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextType).toBe('general');
    expect(result[0].contextPayload).toHaveProperty('aiContext');
    expect(result[0].contextPayload).toHaveProperty('hint', 'Hint general');
  });

  it('returns tickets context with escalation metadata', async () => {
    const result = await useCase.execute({
      intentResult: { intent: 'tickets', confidence: 0.9, entities: ['reclamo urgente'] },
      text: 'Estoy indignado, necesito ayuda urgente con mi pedido',
      sentiment: 'negative',
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextType).toBe('tickets');
    expect(result[0].contextPayload).toHaveProperty('aiContext');
    expect(result[0].contextPayload).toHaveProperty('priority', 'high');
    expect(result[0].contextPayload).toHaveProperty('requiresHumanEscalation', true);
  });

  it('calls getOrderDetail when orderId is extracted from entities', async () => {
    entelequiaPort.getOrderDetail.mockResolvedValueOnce({
      contextType: 'order_detail',
      contextPayload: {
        order: {
          id: 123456,
          state: 'processing',
          created_at: '2026-02-10T10:00:00Z',
          total: { currency: 'ARS', amount: 1000 },
          shipMethod: 'Correo',
          shipTrackingCode: 'ABC123',
          payment: { payment_method: 'Mercado Pago', status: 'approved' },
          orderItems: [{ quantity: 1, productTitle: 'Item', productPrice: { currency: 'ARS', amount: 1000 } }],
        },
      },
    });

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
    expect(result[0].contextPayload).toHaveProperty('aiContext');
    expect(result[0].contextPayload).toHaveProperty('orderId', 123456);
  });

  it('adds aiContext and counters for orders list', async () => {
    entelequiaPort.getOrders.mockResolvedValueOnce({
      contextType: 'orders',
      contextPayload: {
        data: [
          {
            id: 501,
            state: 'pending',
            created_at: '2026-02-10T10:00:00Z',
            total: { currency: 'ARS', amount: 1000 },
          },
          {
            id: 502,
            state: 'processing',
            created_at: '2026-02-09T10:00:00Z',
            total: { currency: 'ARS', amount: 2000 },
          },
        ],
        pagination: { total: 2 },
      },
    });

    const result = await useCase.execute({
      intentResult: { intent: 'orders', confidence: 0.9, entities: [] },
      text: 'mostrar mis pedidos',
      accessToken: 'token',
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextType).toBe('orders');
    expect(result[0].contextPayload).toHaveProperty('aiContext');
    expect(result[0].contextPayload).toHaveProperty('ordersShown', 2);
    expect(result[0].contextPayload).toHaveProperty('totalOrders', 2);
  });

  it('maps legacy unauthenticated payload in orders list to ExternalServiceError 401', async () => {
    entelequiaPort.getOrders.mockResolvedValueOnce({
      contextType: 'orders',
      contextPayload: {
        message: 'Unauthenticated.',
      },
    });

    await expect(
      useCase.execute({
        intentResult: { intent: 'orders', confidence: 0.9, entities: [] },
        text: 'mostrar mis pedidos',
        accessToken: 'token',
      }),
    ).rejects.toThrow('Entelequia unauthorized response');
  });

  it('enriches payment_shipping context with queryType and aiContext from API payload', async () => {
    entelequiaPort.getPaymentInfo.mockResolvedValueOnce({
      contextType: 'payment_info',
      contextPayload: {
        payment_methods: [
          'Mercado Pago',
          { name: 'Tarjetas de credito' },
        ],
        promotions: [{ label: 'Hasta 6 cuotas sin interes' }],
      },
    });

    const result = await useCase.execute({
      intentResult: { intent: 'payment_shipping', confidence: 0.9, entities: [] },
      text: '¿Que medios de pago tienen?',
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextType).toBe('payment_info');
    expect(result[0].contextPayload).toHaveProperty('aiContext');
    expect(result[0].contextPayload).toHaveProperty('queryType', 'payment');
    expect(result[0].contextPayload).toHaveProperty('apiFallback', false);
    expect(result[0].contextPayload).toHaveProperty('paymentMethods');
    expect(result[0].contextPayload).toHaveProperty('promotions');
  });

  it('falls back to local payment_shipping context when payment-info API fails', async () => {
    entelequiaPort.getPaymentInfo.mockRejectedValueOnce(
      new ExternalServiceError('timeout', 0, 'timeout'),
    );

    const result = await useCase.execute({
      intentResult: { intent: 'payment_shipping', confidence: 0.9, entities: [] },
      text: '¿Cuanto tarda en llegar?',
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextType).toBe('payment_info');
    expect(result[0].contextPayload).toHaveProperty('aiContext');
    expect(result[0].contextPayload).toHaveProperty('queryType', 'time');
    expect(result[0].contextPayload).toHaveProperty('apiFallback', true);
    expect(result[0].contextPayload).toHaveProperty('paymentMethods');
    expect(result[0].contextPayload).toHaveProperty('promotions');
  });

  it('enriches recommendations context with aiContext and filtered products', async () => {
    entelequiaPort.getRecommendations.mockResolvedValueOnce({
      contextType: 'recommendations',
      contextPayload: {
        data: [
          {
            id: 1,
            slug: 'one-piece-1',
            title: 'One Piece 1',
            stock: '3',
            categories: [{ name: 'Mangas', slug: 'mangas' }],
            price: { currency: 'ARS', amount: 10000 },
          },
          {
            id: 2,
            slug: 'batman-1',
            title: 'Batman 1',
            stock: '2',
            categories: [{ name: 'Comics', slug: 'comics' }],
            price: { currency: 'ARS', amount: 12000 },
          },
          {
            id: 3,
            slug: 'naruto-2',
            title: 'Naruto 2',
            stock: '0',
            categories: [{ name: 'Mangas', slug: 'mangas' }],
            price: { currency: 'ARS', amount: 13000 },
          },
        ],
        pagination: { total: 3 },
      },
    });

    const result = await useCase.execute({
      intentResult: { intent: 'recommendations', confidence: 0.9, entities: [] },
      text: 'Recomendame mangas de accion',
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextType).toBe('recommendations');
    expect(result[0].contextPayload).toHaveProperty('aiContext');
    expect(result[0].contextPayload).toHaveProperty('apiFallback', false);
    expect(result[0].contextPayload).toHaveProperty('recommendationsCount', 1);
    expect(result[0].contextPayload).toHaveProperty('totalRecommendations', 3);
    expect(result[0].contextPayload).toHaveProperty('afterStockFilter', 2);
    expect(result[0].contextPayload).toHaveProperty('afterTypeFilter', 1);

    const products = result[0].contextPayload.products as Array<{ slug: string }>;
    expect(products).toHaveLength(1);
    expect(products[0].slug).toBe('one-piece-1');
  });

  it.each([
    {
      text: 'Recomendame cartas de Magic',
      expectedSlug: 'mtg-booster',
      expectedAfterTypeFilter: 1,
    },
    {
      text: 'Tenes remeras de One Piece?',
      expectedSlug: 'remera-one-piece',
      expectedAfterTypeFilter: 1,
    },
    {
      text: 'Busco un funko de Naruto',
      expectedSlug: 'funko-naruto',
      expectedAfterTypeFilter: 1,
    },
  ])(
    'applies granular recommendation filters ($text)',
    async ({ text, expectedSlug, expectedAfterTypeFilter }) => {
      entelequiaPort.getRecommendations.mockResolvedValueOnce({
        contextType: 'recommendations',
        contextPayload: {
          data: [
            {
              id: 1,
              slug: 'mtg-booster',
              title: 'MTG Booster',
              stock: '4',
              categories: [
                {
                  name: 'Magic',
                  slug: 'juegos-de-cartas-coleccionables-magic',
                },
              ],
            },
            {
              id: 2,
              slug: 'remera-one-piece',
              title: 'Remera One Piece',
              stock: '3',
              categories: [{ name: 'Ropa Remeras', slug: 'ropa-remeras' }],
            },
            {
              id: 3,
              slug: 'funko-naruto',
              title: 'Funko Naruto',
              stock: '5',
              categories: [{ name: 'Funko Pops', slug: 'funko-pops' }],
            },
          ],
          pagination: { total: 3 },
        },
      });

      const result = await useCase.execute({
        intentResult: { intent: 'recommendations', confidence: 0.9, entities: [] },
        text,
      });

      expect(result).toHaveLength(1);
      expect(result[0].contextType).toBe('recommendations');
      expect(result[0].contextPayload).toHaveProperty(
        'afterTypeFilter',
        expectedAfterTypeFilter,
      );
      const products = result[0].contextPayload.products as Array<{ slug: string }>;
      expect(products).toHaveLength(1);
      expect(products[0].slug).toBe(expectedSlug);
    },
  );

  it('returns no_matches fallback when recommendations are empty after filtering', async () => {
    entelequiaPort.getRecommendations.mockResolvedValueOnce({
      contextType: 'recommendations',
      contextPayload: {
        data: [
          {
            id: 10,
            slug: 'batman-1',
            title: 'Batman 1',
            stock: '2',
            categories: [{ name: 'Comics', slug: 'comics' }],
          },
        ],
        pagination: { total: 1 },
      },
    });

    const result = await useCase.execute({
      intentResult: { intent: 'recommendations', confidence: 0.9, entities: [] },
      text: 'Recomendame mangas',
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextType).toBe('recommendations');
    expect(result[0].contextPayload).toHaveProperty('apiFallback', false);
    expect(result[0].contextPayload).toHaveProperty('fallbackReason', 'no_matches');
    expect(result[0].contextPayload).toHaveProperty('recommendationsCount', 0);
    expect(result[0].contextPayload).toHaveProperty('products');
  });

  it('returns api_error fallback when recommendations API fails', async () => {
    entelequiaPort.getRecommendations.mockRejectedValueOnce(
      new ExternalServiceError('timeout', 0, 'timeout'),
    );

    const result = await useCase.execute({
      intentResult: { intent: 'recommendations', confidence: 0.9, entities: [] },
      text: 'Recomendame algo de fantasia',
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextType).toBe('recommendations');
    expect(result[0].contextPayload).toHaveProperty('apiFallback', true);
    expect(result[0].contextPayload).toHaveProperty('fallbackReason', 'api_error');
    expect(result[0].contextPayload).toHaveProperty('recommendationsCount', 0);
  });
});
