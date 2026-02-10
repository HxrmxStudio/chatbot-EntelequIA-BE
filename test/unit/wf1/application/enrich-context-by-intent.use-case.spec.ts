import { Test } from '@nestjs/testing';
import { MissingAuthForOrdersError } from '@/modules/wf1/domain/errors';
import { EnrichContextByIntentUseCase } from '@/modules/wf1/application/use-cases/enrich-context-by-intent';
import { ENTELEQUIA_CONTEXT_PORT } from '@/modules/wf1/application/ports/tokens';
import type { EntelequiaContextPort } from '@/modules/wf1/application/ports/entelequia-context.port';

describe('EnrichContextByIntentUseCase', () => {
  let useCase: EnrichContextByIntentUseCase;
  let entelequiaPort: jest.Mocked<EntelequiaContextPort>;

  beforeEach(async () => {
    entelequiaPort = {
      getProducts: jest.fn().mockResolvedValue({ contextType: 'products', contextPayload: {} }),
      getProductDetail: jest.fn(),
      getRecommendations: jest.fn().mockResolvedValue({ contextType: 'recommendations', contextPayload: {} }),
      getPaymentInfo: jest.fn().mockResolvedValue({ contextType: 'payment_info', contextPayload: {} }),
      getOrders: jest.fn().mockResolvedValue({ contextType: 'orders', contextPayload: {} }),
      getOrderDetail: jest.fn().mockResolvedValue({ contextType: 'order_detail', contextPayload: {} }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EnrichContextByIntentUseCase,
        { provide: ENTELEQUIA_CONTEXT_PORT, useValue: entelequiaPort },
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
      intentResult: { intent: 'orders', confidence: 0.9, entities: ['pedido 123'] },
      text: 'estado del pedido 123',
      accessToken: 'token',
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextType).toBe('order_detail');
    expect(entelequiaPort.getOrderDetail).toHaveBeenCalledWith({
      accessToken: 'token',
      orderId: '123',
    });
    expect(entelequiaPort.getOrders).not.toHaveBeenCalled();
  });
});
