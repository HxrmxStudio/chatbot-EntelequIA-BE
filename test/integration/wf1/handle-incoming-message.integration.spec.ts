import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  AUDIT_PORT,
  CHAT_PERSISTENCE_PORT,
  ENTELEQUIA_CONTEXT_PORT,
  IDEMPOTENCY_PORT,
  INTENT_EXTRACTOR_PORT,
  LLM_PORT,
  METRICS_PORT,
  PROMPT_TEMPLATES_PORT,
} from '@/modules/wf1/application/ports/tokens';
import type { LlmPort } from '@/modules/wf1/application/ports/llm.port';
import { ExternalServiceError } from '@/modules/wf1/domain/errors';
import type { AuditEntryInput } from '@/modules/wf1/application/ports/audit.port';
import type { PersistTurnInput } from '@/modules/wf1/application/ports/chat-persistence.port';
import { TextSanitizer } from '@/modules/wf1/infrastructure/security/services/text-sanitizer';
import { EnrichContextByIntentUseCase } from '@/modules/wf1/application/use-cases/enrich-context-by-intent';
import { HandleIncomingMessageUseCase } from '@/modules/wf1/application/use-cases/handle-incoming-message';
import { EntelequiaOrderLookupClient } from '@/modules/wf1/infrastructure/adapters/entelequia-http';

class InMemoryPersistence {
  constructor(private readonly onEvent?: (event: string) => void) {}

  public turns: PersistTurnInput[] = [];
  public authenticatedProfiles: Array<{
    id: string;
    email: string;
    phone: string;
    name: string;
  }> = [];
  private botByEvent = new Map<string, string>();

  async upsertUser(userId: string): Promise<{
    id: string;
    email: string;
    phone: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }> {
    const now = '2026-02-10T00:00:00.000Z';
    return {
      id: userId,
      email: userId,
      phone: '',
      name: 'Customer',
      createdAt: now,
      updatedAt: now,
    };
  }

  async upsertAuthenticatedUserProfile(input: {
    id: string;
    email: string;
    phone: string;
    name: string;
  }): Promise<{
    id: string;
    email: string;
    phone: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }> {
    this.authenticatedProfiles.push(input);
    const now = '2026-02-10T00:00:00.000Z';
    return {
      id: input.id,
      email: input.email,
      phone: input.phone,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    };
  }

  async upsertConversation(): Promise<void> {}

  async getConversationHistory(): Promise<Array<{ sender: 'user'; content: string; createdAt: string }>> {
    return [];
  }

  async getConversationHistoryRows(): Promise<
    Array<{
      id: string;
      content: string | null;
      sender: string | null;
      type: string | null;
      channel: string | null;
      metadata: unknown;
      created_at: string | null;
    }>
  > {
    return [];
  }

  async getLastBotMessageByExternalEvent(input: {
    channel: 'web' | 'whatsapp';
    externalEventId: string;
    conversationId?: string;
  }): Promise<string | null> {
    const key = `${input.channel}:${input.externalEventId}`;
    return this.botByEvent.get(key) ?? null;
  }

  async persistTurn(input: PersistTurnInput): Promise<void> {
    this.onEvent?.('persist_turn');
    this.turns.push(input);
    const key = `${input.source}:${input.externalEventId}`;
    this.botByEvent.set(key, input.botMessage);
  }
}

class InMemoryIdempotency {
  constructor(private readonly onEvent?: (event: string) => void) {}

  private readonly seen = new Set<string>();

  async startProcessing(input: {
    source: 'web' | 'whatsapp';
    externalEventId: string;
  }): Promise<{ isDuplicate: boolean }> {
    const key = `${input.source}:${input.externalEventId}`;
    if (this.seen.has(key)) {
      return { isDuplicate: true };
    }

    this.seen.add(key);
    return { isDuplicate: false };
  }

  async markProcessed(): Promise<void> {
    this.onEvent?.('mark_processed');
  }

  async markFailed(): Promise<void> {}
}

class InMemoryAudit {
  constructor(private readonly onEvent?: (event: string) => void) {}

  public entries: AuditEntryInput[] = [];

  async writeAudit(input: AuditEntryInput): Promise<void> {
    this.onEvent?.('write_audit');
    this.entries.push(input);
  }
}

class InMemoryMetrics {
  incrementMessage(): void {}
  observeResponseLatency(): void {}
  incrementFallback(): void {}
  incrementStockExactDisclosure(): void {}
}

class StubIntentExtractor {
  async extractIntent(input: { text: string }): Promise<{
    intent:
      | 'products'
      | 'orders'
      | 'payment_shipping'
      | 'recommendations'
      | 'tickets'
      | 'store_info'
      | 'general';
    entities: string[];
    confidence: number;
  }> {
    const normalized = input.text.toLowerCase();

    if (normalized.includes('pedido')) {
      return {
        intent: 'orders',
        entities: [],
        confidence: 0.9,
      };
    }

    if (normalized.includes('pago') || normalized.includes('envio') || normalized.includes('envío')) {
      return {
        intent: 'payment_shipping',
        entities: [],
        confidence: 0.88,
      };
    }

    if (normalized.includes('recomend') || normalized.includes('suger')) {
      return {
        intent: 'recommendations',
        entities: [],
        confidence: 0.86,
      };
    }

    if (
      normalized.includes('reclamo') ||
      normalized.includes('problema') ||
      normalized.includes('soporte')
    ) {
      return {
        intent: 'tickets',
        entities: [],
        confidence: 0.87,
      };
    }

    if (
      normalized.includes('local') ||
      normalized.includes('sucursal') ||
      normalized.includes('horario') ||
      normalized.includes('direccion')
    ) {
      return {
        intent: 'store_info',
        entities: [],
        confidence: 0.84,
      };
    }

    if (normalized.includes('hola') || normalized.includes('gracias')) {
      return {
        intent: 'general',
        entities: [],
        confidence: 0.8,
      };
    }

    return {
      intent: 'products',
      entities: [input.text],
      confidence: 0.8,
    };
  }
}

class StubLlm implements LlmPort {
  public lastInput?: Parameters<LlmPort['buildAssistantReply']>[0];

  async buildAssistantReply(
    input: Parameters<LlmPort['buildAssistantReply']>[0],
  ): Promise<string> {
    this.lastInput = input;

    if (input.intent === 'store_info') {
      const normalizedText = input.userText.toLowerCase();
      if (
        normalizedText.includes('horario') ||
        normalizedText.includes('abren') ||
        normalizedText.includes('feriado')
      ) {
        return 'Nuestros horarios son: Lunes a viernes 10:00 a 19:00 hs, Sabados 11:00 a 18:00 hs y Domingos cerrado. En feriados o fechas especiales el horario puede variar, valida en web/redes oficiales.';
      }
    }

    return 'Respuesta de prueba';
  }
}

class StubEntelequia {
  public mode: 'ok' | 'order-not-owned' = 'ok';
  public paymentInfoCalls = 0;

  async getProducts(): Promise<{ contextType: 'products'; contextPayload: Record<string, unknown> }> {
    return {
      contextType: 'products',
      contextPayload: { products: { data: [] } },
    };
  }

  async getProductDetail(): Promise<{ contextType: 'product_detail'; contextPayload: Record<string, unknown> }> {
    return {
      contextType: 'product_detail',
      contextPayload: { product: {} },
    };
  }

  async getRecommendations(): Promise<{
    contextType: 'recommendations';
    contextPayload: Record<string, unknown>;
  }> {
    return {
      contextType: 'recommendations',
      contextPayload: { data: [] },
    };
  }

  async getPaymentInfo(): Promise<{ contextType: 'payment_info'; contextPayload: Record<string, unknown> }> {
    this.paymentInfoCalls += 1;
    return {
      contextType: 'payment_info',
      contextPayload: {
        payment_methods: ['Mercado Pago', 'Tarjetas de credito'],
        promotions: ['Hasta 6 cuotas sin interes'],
      },
    };
  }

  async getAuthenticatedUserProfile(): Promise<{
    email: string;
    phone: string;
    name: string;
  }> {
    return {
      email: 'user-1@example.com',
      phone: '',
      name: 'Customer',
    };
  }

  async getOrders(): Promise<{ contextType: 'orders'; contextPayload: Record<string, unknown> }> {
    if (this.mode === 'order-not-owned') {
      throw new ExternalServiceError('Order mismatch', 442, 'http');
    }

    return {
      contextType: 'orders',
      contextPayload: { data: [] },
    };
  }

  async getOrderDetail(): Promise<{ contextType: 'order_detail'; contextPayload: Record<string, unknown> }> {
    return {
      contextType: 'order_detail',
      contextPayload: { order: {} },
    };
  }
}

class StubOrderLookupClient {
  public mode: 'matched' | 'not-found' | 'invalid' | 'unauthorized' | 'throttled' = 'matched';

  async lookupOrder(): Promise<{
    ok: boolean;
    order?: {
      id: string | number;
      state: string;
      total?: { currency: string; amount: number };
      paymentMethod?: string;
      shipMethod?: string;
      trackingCode?: string;
    };
    code?: 'not_found_or_mismatch' | 'invalid_payload' | 'unauthorized' | 'throttled';
  }> {
    if (this.mode === 'matched') {
      return {
        ok: true,
        order: {
          id: 12345,
          state: 'En preparación',
          total: { currency: 'ARS', amount: 5100 },
          paymentMethod: 'Mercado Pago',
          shipMethod: 'Envío - Correo',
          trackingCode: 'ABC123',
        },
      };
    }

    if (this.mode === 'not-found') {
      return {
        ok: false,
        code: 'not_found_or_mismatch',
      };
    }

    if (this.mode === 'invalid') {
      return {
        ok: false,
        code: 'invalid_payload',
      };
    }

    if (this.mode === 'unauthorized') {
      return {
        ok: false,
        code: 'unauthorized',
      };
    }

    return {
      ok: false,
      code: 'throttled',
    };
  }
}

class StubPromptTemplates {
  getProductsContextHeader(): string {
    return 'PRODUCTOS ENTELEQUIA';
  }

  getProductsContextAdditionalInfo(): string {
    return 'Info adicional';
  }

  getProductsContextInstructions(): string {
    return 'Instrucciones';
  }

  getOrdersListContextHeader(): string {
    return 'TUS ULTIMOS PEDIDOS';
  }

  getOrdersListContextInstructions(): string {
    return 'Instrucciones de ordenes';
  }

  getOrderDetailContextInstructions(): string {
    return 'Instrucciones detalle orden';
  }

  getOrdersEmptyContextMessage(): string {
    return 'No encontramos pedidos.';
  }

  getPaymentShippingPaymentContext(): string {
    return 'MEDIOS DE PAGO';
  }

  getPaymentShippingShippingContext(): string {
    return 'ENVIOS';
  }

  getPaymentShippingCostContext(): string {
    return 'COSTOS DE ENVIO';
  }

  getPaymentShippingTimeContext(): string {
    return 'TIEMPOS DE ENTREGA';
  }

  getPaymentShippingGeneralContext(): string {
    return 'PAGOS Y ENVIOS';
  }

  getPaymentShippingInstructions(): string {
    return 'Instrucciones para payment_shipping';
  }

  getRecommendationsContextHeader(): string {
    return 'RECOMENDACIONES PERSONALIZADAS';
  }

  getRecommendationsContextWhyThese(): string {
    return 'Por que estos productos';
  }

  getRecommendationsContextInstructions(): string {
    return 'Instrucciones de recomendaciones';
  }

  getRecommendationsEmptyContextMessage(): string {
    return 'No tengo recomendaciones especificas.';
  }

  getTicketsContextHeader(): string {
    return 'SOPORTE TÉCNICO ENTELEQUIA';
  }

  getTicketsContactOptions(): string {
    return 'Opciones de contacto';
  }

  getTicketsHighPriorityNote(): string {
    return 'Nota de prioridad alta';
  }

  getTicketsContextInstructions(): string {
    return 'Instrucciones de tickets';
  }

  getStoreInfoLocationContext(): string {
    return 'Info de ubicacion';
  }

  getStoreInfoHoursContext(): string {
    return [
      'HORARIOS DE ATENCION',
      '- Lunes a viernes: 10:00 a 19:00 hs.',
      '- Sabados: 11:00 a 18:00 hs.',
      '- Domingos: cerrado.',
      '- Feriados y fechas especiales: validar horario actualizado en canales oficiales.',
    ].join('\n');
  }

  getStoreInfoParkingContext(): string {
    return 'Info de estacionamiento';
  }

  getStoreInfoTransportContext(): string {
    return 'Info de transporte';
  }

  getStoreInfoGeneralContext(): string {
    return 'Info general de locales';
  }

  getStoreInfoContextInstructions(): string {
    return [
      'Instrucciones para tu respuesta:',
      '- Primero responder el dato solicitado.',
      '- Luego agregar disclaimer de feriados si aplica.',
    ].join('\n');
  }

  getGeneralContextHint(): string {
    return 'Hint general';
  }

  getGeneralContextInstructions(): string {
    return 'Instrucciones de general';
  }

  getStaticContext(): string {
    return 'Contexto estatico';
  }
}

describe('HandleIncomingMessageUseCase (integration)', () => {
  let useCase: HandleIncomingMessageUseCase;
  let persistence: InMemoryPersistence;
  let idempotency: InMemoryIdempotency;
  let audit: InMemoryAudit;
  let entelequia: StubEntelequia;
  let orderLookupClient: StubOrderLookupClient;
  let llm: StubLlm;
  let metrics: InMemoryMetrics;
  let finalStageEvents: string[];

  beforeEach(async () => {
    finalStageEvents = [];
    const onEvent = (event: string): void => {
      finalStageEvents.push(event);
    };
    persistence = new InMemoryPersistence(onEvent);
    idempotency = new InMemoryIdempotency(onEvent);
    audit = new InMemoryAudit(onEvent);
    entelequia = new StubEntelequia();
    orderLookupClient = new StubOrderLookupClient();
    llm = new StubLlm();
    metrics = new InMemoryMetrics();

    const moduleRef = await Test.createTestingModule({
      providers: [
        HandleIncomingMessageUseCase,
        EnrichContextByIntentUseCase,
        TextSanitizer,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'CHAT_HISTORY_LIMIT') {
                return 10;
              }
              if (key === 'WF1_UI_CARDS_ENABLED') {
                return true;
              }
              return undefined;
            },
          },
        },
        { provide: INTENT_EXTRACTOR_PORT, useClass: StubIntentExtractor },
        { provide: LLM_PORT, useValue: llm },
        { provide: CHAT_PERSISTENCE_PORT, useValue: persistence },
        { provide: IDEMPOTENCY_PORT, useValue: idempotency },
        { provide: AUDIT_PORT, useValue: audit },
        { provide: ENTELEQUIA_CONTEXT_PORT, useValue: entelequia },
        { provide: EntelequiaOrderLookupClient, useValue: orderLookupClient },
        { provide: PROMPT_TEMPLATES_PORT, useClass: StubPromptTemplates },
        { provide: METRICS_PORT, useValue: metrics },
      ],
    }).compile();

    useCase = moduleRef.get(HandleIncomingMessageUseCase);
  });

  it('asks for order id when guest asks for orders without order number', async () => {
    const response = await useCase.execute({
      requestId: 'req-1',
      externalEventId: 'event-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'donde esta mi pedido?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'donde esta mi pedido?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(false);
    expect(response.message).toContain('No encontre el numero de pedido');
    expect(persistence.turns).toHaveLength(1);
    expect(audit.entries).toHaveLength(1);
  });

  it('returns deterministic order summary when guest sends order_id + 2 factors', async () => {
    const response = await useCase.execute({
      requestId: 'req-lookup-1',
      externalEventId: 'event-lookup-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'pedido 12345, dni 12345678, telefono +54 11 4444 5555',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'pedido 12345, dni 12345678, telefono +54 11 4444 5555',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect('intent' in response && response.intent).toBe('orders');
    expect(response.message).toContain('PEDIDO #12345');
    expect(response.message).toContain('Estado: En preparación');
    expect(response.message).toContain('Tracking: ABC123');
    expect(llm.lastInput?.intent).not.toBe('orders');
  });

  it('returns verification failed message when identity does not match', async () => {
    orderLookupClient.mode = 'not-found';

    const response = await useCase.execute({
      requestId: 'req-lookup-2',
      externalEventId: 'event-lookup-2',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'pedido 12345, dni 12345678, telefono +54 11 4444 5555',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'pedido 12345, dni 12345678, telefono +54 11 4444 5555',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(false);
    expect(response.message).toContain('No pudimos validar los datos del pedido');
  });

  it('asks for more identity factors when guest sends less than 2', async () => {
    const response = await useCase.execute({
      requestId: 'req-lookup-3',
      externalEventId: 'event-lookup-3',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'pedido 12345, dni 12345678',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'pedido 12345, dni 12345678',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(false);
    expect(response.message).toContain('Necesito 1 dato(s) mas');
  });

  it('returns high-demand message when secure order lookup is throttled', async () => {
    orderLookupClient.mode = 'throttled';

    const response = await useCase.execute({
      requestId: 'req-lookup-4',
      externalEventId: 'event-lookup-4',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'pedido 12345, dni 12345678, telefono +54 11 4444 5555',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'pedido 12345, dni 12345678, telefono +54 11 4444 5555',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(false);
    expect(response.message).toContain('alta demanda');
  });

  it('handles duplicate event without duplicating writes', async () => {
    const first = await useCase.execute({
      requestId: 'req-2',
      externalEventId: 'event-dup',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'busco un libro',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'busco un libro',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    const second = await useCase.execute({
      requestId: 'req-3',
      externalEventId: 'event-dup',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'busco un libro',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'busco un libro',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(persistence.turns).toHaveLength(1);
  });

  it('maps 442 backend error to safe message', async () => {
    entelequia.mode = 'order-not-owned';

    const response = await useCase.execute({
      requestId: 'req-4',
      externalEventId: 'event-442',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'pedido pendiente',
        accessToken: 'token',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'pedido pendiente',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(false);
    expect(response.message).toContain('No encontramos ese pedido en tu cuenta');
  });

  it('persists real user profile when request is authenticated', async () => {
    const response = await useCase.execute({
      requestId: 'req-5',
      externalEventId: 'event-auth-profile',
      payload: {
        source: 'web',
        userId: '1962',
        conversationId: 'conv-1',
        text: 'busco un manga',
        accessToken: 'valid-token',
      },
      idempotencyPayload: {
        source: 'web',
        userId: '1962',
        conversationId: 'conv-1',
        text: 'busco un manga',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(persistence.authenticatedProfiles).toHaveLength(1);
    expect(persistence.authenticatedProfiles[0]).toMatchObject({
      id: '1962',
      email: 'user-1@example.com',
      name: 'Customer',
    });
  });

  it('enriches payment_shipping context and keeps success response', async () => {
    const response = await useCase.execute({
      requestId: 'req-6',
      externalEventId: 'event-payment-shipping',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: '¿Cuanto sale el envio?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: '¿Cuanto sale el envio?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.message).toBe('Respuesta de prueba');
    expect(entelequia.paymentInfoCalls).toBe(1);
  });

  it('enriches recommendations context with aiContext (without raw JSON fallback)', async () => {
    const response = await useCase.execute({
      requestId: 'req-7',
      externalEventId: 'event-recommendations',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'recomendame mangas de accion',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'recomendame mangas de accion',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.message).toBe('Respuesta de prueba');
    expect(llm.lastInput).toBeDefined();
    expect(llm.lastInput?.requestId).toBe('req-7');
    expect(llm.lastInput?.conversationId).toBe('conv-1');
    expect(llm.lastInput?.externalEventId).toBe('event-recommendations');
    const recommendationsBlock = llm.lastInput?.contextBlocks.find(
      (block) => block.contextType === 'recommendations',
    );
    expect(recommendationsBlock).toBeDefined();
    expect(recommendationsBlock?.contextPayload).toHaveProperty('aiContext');
  });

  it('attaches optional ui payload for catalog intents and persists ui metadata', async () => {
    jest.spyOn(entelequia, 'getProducts').mockResolvedValueOnce({
      contextType: 'products',
      contextPayload: {
        items: [
          {
            id: 'ev-1',
            slug: 'evangelion-01',
            title: 'Evangelion 01',
            categoryName: 'Mangas',
            stock: 2,
            url: 'https://entelequia.com.ar/producto/evangelion-01',
            imageUrl: 'https://entelequia.com.ar/images/ev-1.jpg',
            price: { amount: 12000, currency: 'ARS' },
          },
        ],
      },
    });

    const response = await useCase.execute({
      requestId: 'req-ui-1',
      externalEventId: 'event-ui-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'tienen evangelion?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'tienen evangelion?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error('Expected success response');
    }

    expect(response.ui).toBeDefined();
    expect(response.ui?.version).toBe('1');
    expect(response.ui?.cards).toHaveLength(1);
    expect(response.ui?.cards[0]).toMatchObject({
      id: 'ev-1',
      title: 'Evangelion 01',
      availabilityLabel: 'quedan pocas unidades',
      productUrl: 'https://entelequia.com.ar/producto/evangelion-01',
    });

    const persistedTurn = persistence.turns[persistence.turns.length - 1];
    const metadata = (persistedTurn.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.uiPayloadVersion).toBe('1');
    expect(metadata.uiKind).toBe('catalog');
    expect(metadata.uiCardsCount).toBe(1);
    expect(metadata.uiCardsWithImageCount).toBe(1);
  });

  it('handles tickets intent with aiContext and escalation metadata', async () => {
    const response = await useCase.execute({
      requestId: 'req-8',
      externalEventId: 'event-tickets',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'Tengo un reclamo urgente, el producto llego roto',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'Tengo un reclamo urgente, el producto llego roto',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.message).toBe('Respuesta de prueba');
    const ticketsBlock = llm.lastInput?.contextBlocks.find(
      (block) => block.contextType === 'tickets',
    );
    expect(ticketsBlock?.contextPayload).toHaveProperty('aiContext');
    expect(ticketsBlock?.contextPayload).toHaveProperty('priority', 'high');
    expect(ticketsBlock?.contextPayload).toHaveProperty(
      'requiresHumanEscalation',
      true,
    );
  });

  it('handles store_info intent with resolved subtype and aiContext', async () => {
    const response = await useCase.execute({
      requestId: 'req-9',
      externalEventId: 'event-store-info',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'Cual es la direccion del local?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'Cual es la direccion del local?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    const storeBlock = llm.lastInput?.contextBlocks.find(
      (block) => block.contextType === 'store_info',
    );
    expect(storeBlock?.contextPayload).toHaveProperty('aiContext');
    expect(storeBlock?.contextPayload).toHaveProperty('infoRequested', 'location');
  });

  it('returns exact weekly schedule and holiday guidance for store_info hours', async () => {
    const response = await useCase.execute({
      requestId: 'req-9b',
      externalEventId: 'event-store-info-hours',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'Que horario tienen? Abren feriados?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'Que horario tienen? Abren feriados?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.message).toContain('Lunes a viernes 10:00 a 19:00 hs');
    expect(response.message).toContain('Sabados 11:00 a 18:00 hs');
    expect(response.message).toContain('feriados');

    const persistedTurn = persistence.turns[persistence.turns.length - 1];
    const persistedMetadata = (persistedTurn.metadata ?? {}) as Record<string, unknown>;
    expect(persistedMetadata.storeInfoSubtype).toBe('hours');
    expect(persistedMetadata.storeInfoPolicyVersion).toBe(
      'v2-exact-weekly-hours',
    );

    const lastAudit = audit.entries[audit.entries.length - 1];
    const auditMetadata = (lastAudit.metadata ?? {}) as Record<string, unknown>;
    expect(auditMetadata.storeInfoSubtype).toBe('hours');
    expect(auditMetadata.storeInfoPolicyVersion).toBe(
      'v2-exact-weekly-hours',
    );
    expect(auditMetadata.llmPath).toBe('fallback_default');
    expect(auditMetadata.fallbackReason).toBeNull();
  });

  it('handles general intent with minimal ai context', async () => {
    const response = await useCase.execute({
      requestId: 'req-10',
      externalEventId: 'event-general',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'hola',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'hola',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.message).toBe('Respuesta de prueba');
    const generalBlock = llm.lastInput?.contextBlocks.find(
      (block) => block.contextType === 'general',
    );
    expect(generalBlock?.contextPayload).toHaveProperty('aiContext');
  });

  it('keeps append-order semantics for products flow (products -> product_detail -> static_context)', async () => {
    jest.spyOn(entelequia, 'getProducts').mockResolvedValueOnce({
      contextType: 'products',
      contextPayload: {
        items: [
          {
            id: 1,
            slug: 'attack-on-titan-01_1',
            title: 'ATTACK ON TITAN 01',
            stock: 3,
            categoryName: 'Mangas',
            categorySlug: 'mangas',
          },
        ],
      },
    });

    const response = await useCase.execute({
      requestId: 'req-11',
      externalEventId: 'event-products-merge-append',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'attack on titan tomo 1',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'attack on titan tomo 1',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    const contextTypes =
      llm.lastInput?.contextBlocks.map((block) => block.contextType) ?? [];
    expect(contextTypes).toEqual([
      'products',
      'product_detail',
      'static_context',
    ]);
  });

  it('keeps append-order semantics for store_info flow (store_info -> static_context)', async () => {
    const response = await useCase.execute({
      requestId: 'req-12',
      externalEventId: 'event-store-merge-append',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'horario del local',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'horario del local',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    const contextTypes =
      llm.lastInput?.contextBlocks.map((block) => block.contextType) ?? [];
    expect(contextTypes).toEqual(['store_info', 'static_context']);
  });

  it('executes final stage in order (persist -> mark_processed -> audit)', async () => {
    const response = await useCase.execute({
      requestId: 'req-13',
      externalEventId: 'event-final-stage-order',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'hola',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'hola',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    const persistIndex = finalStageEvents.indexOf('persist_turn');
    const markProcessedIndex = finalStageEvents.indexOf('mark_processed');
    const auditIndex = finalStageEvents.indexOf('write_audit');

    expect(persistIndex).toBeGreaterThan(-1);
    expect(markProcessedIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBeGreaterThan(-1);
    expect(persistIndex).toBeLessThan(markProcessedIndex);
    expect(markProcessedIndex).toBeLessThan(auditIndex);
  });
});
