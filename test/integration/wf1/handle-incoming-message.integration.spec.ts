import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ADAPTIVE_EXEMPLARS_PORT,
  AUDIT_PORT,
  CHAT_PERSISTENCE_PORT,
  ENTELEQUIA_CONTEXT_PORT,
  IDEMPOTENCY_PORT,
  INTENT_EXTRACTOR_PORT,
  LLM_PORT,
  METRICS_PORT,
  ORDER_LOOKUP_RATE_LIMITER_PORT,
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
  private botByEvent = new Map<
    string,
    { message: string; messageId: string; metadata: Record<string, unknown> | null }
  >();
  private sequence = 0;
  private historyRows: Array<{
    sequence: number;
    conversationId: string;
    id: string;
    content: string | null;
    sender: string | null;
    type: string | null;
    channel: string | null;
    metadata: unknown;
    created_at: string | null;
  }> = [];

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

  async getConversationHistory(input: {
    conversationId: string;
    limit: number;
  }): Promise<Array<{ sender: 'user' | 'bot'; content: string; createdAt: string }>> {
    const rows = await this.getConversationHistoryRows(input);
    return [...rows]
      .reverse()
      .flatMap((row) => {
        if (row.sender !== 'user' && row.sender !== 'bot') {
          return [];
        }
        if (typeof row.content !== 'string' || typeof row.created_at !== 'string') {
          return [];
        }

        return [{ sender: row.sender, content: row.content, createdAt: row.created_at }];
      });
  }

  async getConversationHistoryRows(input: {
    conversationId: string;
    limit: number;
  }): Promise<
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
    return this.historyRows
      .filter((row) => row.conversationId === input.conversationId)
      .sort((a, b) => b.sequence - a.sequence)
      .slice(0, input.limit)
      .map((row) => ({
        id: row.id,
        content: row.content,
        sender: row.sender,
        type: row.type,
        channel: row.channel,
        metadata: row.metadata,
        created_at: row.created_at,
      }));
  }

  async getLastBotMessageByExternalEvent(input: {
    channel: 'web' | 'whatsapp';
    externalEventId: string;
    conversationId?: string;
  }): Promise<string | null> {
    const key = `${input.channel}:${input.externalEventId}`;
    return this.botByEvent.get(key)?.message ?? null;
  }

  async getLastBotTurnByExternalEvent(input: {
    channel: 'web' | 'whatsapp';
    externalEventId: string;
    conversationId?: string;
  }): Promise<{ message: string; messageId: string; metadata: Record<string, unknown> | null } | null> {
    const key = `${input.channel}:${input.externalEventId}`;
    return this.botByEvent.get(key) ?? null;
  }

  async persistTurn(input: PersistTurnInput): Promise<{ botMessageId: string }> {
    this.onEvent?.('persist_turn');
    this.turns.push(input);

    const userRow = this.buildHistoryRow({
      conversationId: input.conversationId,
      sender: 'user',
      content: input.userMessage,
      channel: input.source,
      metadata: input.metadata ?? null,
    });
    const botRow = this.buildHistoryRow({
      conversationId: input.conversationId,
      sender: 'bot',
      content: input.botMessage,
      channel: input.source,
      metadata: input.metadata ?? null,
    });

    this.historyRows.push(userRow);
    this.historyRows.push(botRow);

    const key = `${input.source}:${input.externalEventId}`;
    this.botByEvent.set(key, {
      message: input.botMessage,
      messageId: botRow.id,
      metadata: isRecord(input.metadata) ? input.metadata : null,
    });

    return { botMessageId: botRow.id };
  }

  private buildHistoryRow(input: {
    conversationId: string;
    sender: 'user' | 'bot';
    content: string;
    channel: 'web' | 'whatsapp';
    metadata: unknown;
  }): {
    sequence: number;
    conversationId: string;
    id: string;
    content: string | null;
    sender: string | null;
    type: string | null;
    channel: string | null;
    metadata: unknown;
    created_at: string | null;
  } {
    this.sequence += 1;
    return {
      sequence: this.sequence,
      conversationId: input.conversationId,
      id: `msg-${this.sequence}`,
      content: input.content,
      sender: input.sender,
      type: 'text',
      channel: input.channel,
      metadata: input.metadata,
      created_at: new Date(1_700_000_000_000 + this.sequence).toISOString(),
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

class InMemoryAdaptiveExemplars {
  public exemplars: Array<{
    intent: string;
    promptHint: string;
    confidenceWeight: number;
    source: string;
  }> = [];

  async getActiveExemplarsByIntent(input: {
    intent: string;
    limit: number;
  }): Promise<Array<{
    intent: string;
    promptHint: string;
    confidenceWeight: number;
    source: string;
  }>> {
    return this.exemplars.filter((row) => row.intent === input.intent).slice(0, input.limit);
  }
}

class InMemoryMetrics {
  public exemplarsUsedInPromptEvents: Array<{ intent: string; source: string }> = [];

  incrementMessage(): void {}
  observeResponseLatency(): void {}
  incrementFallback(): void {}
  incrementStockExactDisclosure(): void {}
  incrementOrderLookupRateLimited(): void {}
  incrementOrderLookupRateLimitDegraded(): void {}
  incrementOrderLookupVerificationFailed(): void {}
  incrementRecommendationsFranchiseMatch(): void {}
  incrementRecommendationsCatalogDegraded(): void {}
  incrementRecommendationsNoMatch(): void {}
  incrementRecommendationsDisambiguationTriggered(): void {}
  incrementRecommendationsDisambiguationResolved(): void {}
  incrementRecommendationsEditorialMatch(): void {}
  incrementRecommendationsEditorialSuggested(): void {}
  incrementOrderFlowAmbiguousAck(): void {}
  incrementOrderFlowHijackPrevented(): void {}
  incrementOutputTechnicalTermsSanitized(): void {}
  incrementFeedbackReceived(): void {}
  incrementUiPayloadEmitted(): void {}
  incrementUiPayloadSuppressed(): void {}
  incrementLearningAutopromote(): void {}
  incrementLearningAutorollback(): void {}
  incrementExemplarsUsedInPrompt(input: { intent: string; source: string }): void {
    this.exemplarsUsedInPromptEvents.push({
      intent: input.intent,
      source: input.source,
    });
  }
}

class InMemoryOrderLookupRateLimiter {
  public mode: 'allow' | 'throttle' | 'degraded' = 'allow';

  async consume(): Promise<{
    allowed: boolean;
    degraded: boolean;
    blockedBy?: 'ip' | 'user' | 'order';
  }> {
    if (this.mode === 'throttle') {
      return {
        allowed: false,
        degraded: false,
        blockedBy: 'order',
      };
    }

    if (this.mode === 'degraded') {
      return {
        allowed: true,
        degraded: true,
      };
    }

    return {
      allowed: true,
      degraded: false,
    };
  }
}

const RECOMMENDATION_FRANCHISE_HINTS = ['one piece', 'naruto', 'evangelion', 'dragon ball'];

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

    if (shouldRouteToRecommendationsByFranchise(normalized)) {
      return {
        intent: 'recommendations',
        entities: [],
        confidence: 0.83,
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
    const normalizedText = input.userText.toLowerCase();

    if (input.intent === 'store_info') {
      if (
        normalizedText.includes('horario') ||
        normalizedText.includes('abren') ||
        normalizedText.includes('feriado')
      ) {
        return 'Nuestros horarios son: Lunes a viernes 10:00 a 19:00 hs, Sabados 11:00 a 18:00 hs y Domingos cerrado. En feriados o fechas especiales el horario puede variar, valida en web/redes oficiales.';
      }
    }

    if (
      normalizedText.includes('porque fue cancelado') ||
      normalizedText.includes('por que fue cancelado')
    ) {
      return 'Por ahora no me figura el motivo de la cancelacion del pedido #78399. Queres que consulte con el area correspondiente o preferis que te ayude con otra cosa?';
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

  async getProductBrands(): Promise<{
    contextType: 'catalog_taxonomy';
    contextPayload: Record<string, unknown>;
  }> {
    return {
      contextType: 'catalog_taxonomy',
      contextPayload: { brands: [] },
    };
  }

  async getProductAuthors(): Promise<{
    contextType: 'catalog_taxonomy';
    contextPayload: Record<string, unknown>;
  }> {
    return {
      contextType: 'catalog_taxonomy',
      contextPayload: { authors: [] },
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
  public calls = 0;

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
    this.calls += 1;

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
  let orderLookupRateLimiter: InMemoryOrderLookupRateLimiter;
  let adaptiveExemplars: InMemoryAdaptiveExemplars;
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
    orderLookupRateLimiter = new InMemoryOrderLookupRateLimiter();
    adaptiveExemplars = new InMemoryAdaptiveExemplars();

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
        { provide: ORDER_LOOKUP_RATE_LIMITER_PORT, useValue: orderLookupRateLimiter },
        { provide: ADAPTIVE_EXEMPLARS_PORT, useValue: adaptiveExemplars },
      ],
    }).compile();

    useCase = moduleRef.get(HandleIncomingMessageUseCase);
  });

  it('asks if guest has order data when order intent starts without lookup payload', async () => {
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
    expect(response.message).toContain('Responde SI o NO');
    expect(persistence.turns).toHaveLength(1);
    expect(audit.entries).toHaveLength(1);
    const metadata = (persistence.turns[0].metadata ?? {}) as Record<string, unknown>;
    expect(metadata.ordersGuestFlowState).toBe('awaiting_has_data_answer');
  });

  it('returns requiresAuth when guest answers NO to order data question', async () => {
    await useCase.execute({
      requestId: 'req-1a',
      externalEventId: 'event-1a',
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

    const response = await useCase.execute({
      requestId: 'req-1b',
      externalEventId: 'event-1b',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'no',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'no',
        channel: null,
        timestamp: '2026-02-10T00:00:01.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(false);
    expect('requiresAuth' in response ? response.requiresAuth : false).toBe(true);
    expect(response.message).toContain('NECESITAS INICIAR SESION');
    const metadata = (persistence.turns[persistence.turns.length - 1].metadata ??
      {}) as Record<string, unknown>;
    expect(metadata.ordersGuestFlowState).toBeNull();
  });

  it('asks for lookup payload when guest answers SI without order details yet', async () => {
    await useCase.execute({
      requestId: 'req-1c',
      externalEventId: 'event-1c',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'necesito el estado de mi pedido',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'necesito el estado de mi pedido',
        channel: null,
        timestamp: '2026-02-10T00:00:02.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    const response = await useCase.execute({
      requestId: 'req-1d',
      externalEventId: 'event-1d',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'si',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'si',
        channel: null,
        timestamp: '2026-02-10T00:00:03.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(false);
    expect(response.message).toContain('enviame todo en un solo mensaje');
    const metadata = (persistence.turns[persistence.turns.length - 1].metadata ??
      {}) as Record<string, unknown>;
    expect(metadata.ordersGuestFlowState).toBe('awaiting_lookup_payload');
  });

  it('does not hijack guest order flow when weak yes is mixed with a non-order query', async () => {
    await useCase.execute({
      requestId: 'req-1e',
      externalEventId: 'event-1e',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'necesito el estado de mi pedido',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'necesito el estado de mi pedido',
        channel: null,
        timestamp: '2026-02-10T00:00:02.500Z',
        validated: null,
        validSignature: 'true',
      },
    });

    const response = await useCase.execute({
      requestId: 'req-1f',
      externalEventId: 'event-1f',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'dale, tenes el nro 1 de evangelion?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'dale, tenes el nro 1 de evangelion?',
        channel: null,
        timestamp: '2026-02-10T00:00:03.500Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.message.length).toBeGreaterThan(0);
    expect(response.message).not.toContain('consultar tu pedido sin iniciar sesion');
    const metadata = (persistence.turns[persistence.turns.length - 1].metadata ??
      {}) as Record<string, unknown>;
    expect(metadata.ordersGuestFlowState).toBeNull();
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

  it('accepts compact unlabeled order payload without forcing SI/NO again', async () => {
    const response = await useCase.execute({
      requestId: 'req-lookup-compact-1',
      externalEventId: 'event-lookup-compact-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: '#12345, 12345678, juan perez',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: '#12345, 12345678, juan perez',
        channel: null,
        timestamp: '2026-02-10T00:00:00.001Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.message).toContain('PEDIDO #12345');
  });

  it('returns deterministic order summary after SI confirmation and lookup payload', async () => {
    await useCase.execute({
      requestId: 'req-lookup-flow-1',
      externalEventId: 'event-lookup-flow-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'quiero saber mi pedido',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'quiero saber mi pedido',
        channel: null,
        timestamp: '2026-02-10T00:00:04.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    await useCase.execute({
      requestId: 'req-lookup-flow-2',
      externalEventId: 'event-lookup-flow-2',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'si',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'si',
        channel: null,
        timestamp: '2026-02-10T00:00:05.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    const response = await useCase.execute({
      requestId: 'req-lookup-flow-3',
      externalEventId: 'event-lookup-flow-3',
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
        timestamp: '2026-02-10T00:00:06.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect('intent' in response && response.intent).toBe('orders');
    expect(response.message).toContain('PEDIDO #12345');
    const metadata = (persistence.turns[persistence.turns.length - 1].metadata ??
      {}) as Record<string, unknown>;
    expect(metadata.ordersGuestFlowState).toBeNull();
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

  it('asks for missing identity factors while awaiting lookup payload', async () => {
    await useCase.execute({
      requestId: 'req-lookup-3a',
      externalEventId: 'event-lookup-3a',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'quiero ver mi pedido',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'quiero ver mi pedido',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    await useCase.execute({
      requestId: 'req-lookup-3b',
      externalEventId: 'event-lookup-3b',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'si',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'si',
        channel: null,
        timestamp: '2026-02-10T00:00:00.500Z',
        validated: null,
        validSignature: 'true',
      },
    });

    const response = await useCase.execute({
      requestId: 'req-lookup-3c',
      externalEventId: 'event-lookup-3c',
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
        timestamp: '2026-02-10T00:00:01.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(false);
    expect(response.message).toContain('Necesito 1 dato(s) mas');
    const metadata = (persistence.turns[persistence.turns.length - 1].metadata ??
      {}) as Record<string, unknown>;
    expect(metadata.ordersGuestFlowState).toBe('awaiting_lookup_payload');
  });

  it('does not hijack conversation when pending state receives irrelevant text', async () => {
    await useCase.execute({
      requestId: 'req-lookup-3d',
      externalEventId: 'event-lookup-3d',
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
        timestamp: '2026-02-10T00:00:02.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    const response = await useCase.execute({
      requestId: 'req-lookup-3e',
      externalEventId: 'event-lookup-3e',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'gracias por la ayuda',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'gracias por la ayuda',
        channel: null,
        timestamp: '2026-02-10T00:00:03.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.message).toBe('Respuesta de prueba');
  });

  it('resolves cancelled-order escalation confirmation without repeating the same prompt', async () => {
    const firstResponse = await useCase.execute({
      requestId: 'req-cancel-1',
      externalEventId: 'event-cancel-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-cancel',
        text: 'por que fue cancelado?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-cancel',
        text: 'por que fue cancelado?',
        channel: null,
        timestamp: '2026-02-10T00:00:07.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(firstResponse.ok).toBe(true);
    expect(firstResponse.message).toContain('Queres que consulte con el area correspondiente');
    const firstMetadata = (persistence.turns[persistence.turns.length - 1].metadata ??
      {}) as Record<string, unknown>;
    expect(firstMetadata.ordersEscalationFlowState).toBe('awaiting_cancelled_reason_confirmation');

    const secondResponse = await useCase.execute({
      requestId: 'req-cancel-2',
      externalEventId: 'event-cancel-2',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-cancel',
        text: 'si por favor',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-cancel',
        text: 'si por favor',
        channel: null,
        timestamp: '2026-02-10T00:00:08.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(secondResponse.ok).toBe(false);
    expect(secondResponse.message).toContain('No tengo el motivo exacto de cancelacion');
    expect(secondResponse.message).not.toContain('Queres que consulte con el area correspondiente');
    const secondMetadata = (persistence.turns[persistence.turns.length - 1].metadata ??
      {}) as Record<string, unknown>;
    expect(secondMetadata.ordersEscalationFlowState).toBeNull();
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

  it('returns high-demand message when local rate limit blocks anonymous lookup', async () => {
    orderLookupRateLimiter.mode = 'throttle';

    const response = await useCase.execute({
      requestId: 'req-lookup-4b',
      externalEventId: 'event-lookup-4b',
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
        timestamp: '2026-02-10T00:00:00.100Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(false);
    expect(response.message).toContain('alta demanda');
    expect(orderLookupClient.calls).toBe(0);
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

  it('keeps recommendations flow resilient when catalog payload is invalid', async () => {
    jest.spyOn(entelequia, 'getRecommendations').mockResolvedValueOnce({
      contextType: 'recommendations',
      contextPayload: { raw: '<html>upstream error</html>' },
    });

    const response = await useCase.execute({
      requestId: 'req-7b',
      externalEventId: 'event-recommendations-invalid-payload',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'recomendame algo de evangelion',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'recomendame algo de evangelion',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.message).toBe('Respuesta de prueba');
    const recommendationsBlock = llm.lastInput?.contextBlocks.find(
      (block) => block.contextType === 'recommendations',
    );
    expect(recommendationsBlock?.contextPayload).toHaveProperty(
      'fallbackReason',
      'catalog_unavailable',
    );
  });

  it('sanitizes technical jargon from llm output before persisting user response', async () => {
    jest
      .spyOn(llm, 'buildAssistantReply')
      .mockResolvedValueOnce(
        'No tenemos el numero 1 en el contexto. La API devolvio JSON invalido por timeout.',
      );

    const response = await useCase.execute({
      requestId: 'req-7b-sanitize',
      externalEventId: 'event-recommendations-sanitize',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'tienen el numero 1 de evangelion?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'tienen el numero 1 de evangelion?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.100Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.message.toLowerCase()).not.toContain('contexto');
    expect(response.message.toLowerCase()).not.toContain('api');
    expect(response.message.toLowerCase()).not.toContain('json');
    expect(response.message.toLowerCase()).not.toContain('timeout');
  });

  it('prioritizes franchise matching for recommendations queries', async () => {
    jest.spyOn(entelequia, 'getRecommendations').mockResolvedValueOnce({
      contextType: 'recommendations',
      contextPayload: {
        data: [
          {
            id: 1,
            slug: 'remera-evangelion',
            title: 'Remera EVA Unit 01',
            stock: '3',
            categories: [{ name: 'Ropa Remeras', slug: 'ropa-remeras' }],
          },
          {
            id: 2,
            slug: 'remera-naruto',
            title: 'Remera Naruto',
            stock: '2',
            categories: [{ name: 'Ropa Remeras', slug: 'ropa-remeras' }],
          },
        ],
        pagination: { total: 2 },
      },
    });

    const response = await useCase.execute({
      requestId: 'req-7c',
      externalEventId: 'event-recommendations-franchise',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'recomendame un regalo de envangelion',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'recomendame un regalo de envangelion',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    const recommendationsBlock = llm.lastInput?.contextBlocks.find(
      (block) => block.contextType === 'recommendations',
    );
    expect(recommendationsBlock?.contextPayload).toHaveProperty('matchedFranchises', [
      'evangelion',
    ]);
    const products = recommendationsBlock?.contextPayload.products as Array<{ slug: string }>;
    expect(products).toHaveLength(1);
    expect(products[0]?.slug).toBe('remera-evangelion');
  });

  it('handles multi-turn recommendations disambiguation (franchise -> type -> volume)', async () => {
    jest
      .spyOn(entelequia, 'getProducts')
      .mockResolvedValueOnce({
        contextType: 'products',
        contextPayload: {
          total: 24,
          items: buildRecommendationProductsFixture({
            franchiseLabel: 'One Piece',
            count: 24,
            categoryName: 'Mangas',
            categorySlug: 'mangas',
            slugPrefix: 'one-piece',
          }),
        },
      })
      .mockResolvedValueOnce({
        contextType: 'products',
        contextPayload: {
          total: 1,
          items: [
            {
              id: 'op-1',
              slug: 'one-piece-tomo-1',
              title: 'One Piece tomo 1',
              stock: 5,
              categoryName: 'Mangas',
              categorySlug: 'mangas',
            },
          ],
        },
      });

    const firstTurn = await useCase.execute({
      requestId: 'req-rec-flow-1',
      externalEventId: 'event-rec-flow-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-flow-1',
        text: 'quiero one piece',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-flow-1',
        text: 'quiero one piece',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(firstTurn.ok).toBe(false);
    expect(firstTurn.message).toContain('decime que tipo te interesa');
    let metadata = (persistence.turns[persistence.turns.length - 1]?.metadata ??
      {}) as Record<string, unknown>;
    expect(metadata.recommendationsFlowState).toBe('awaiting_category_or_volume');
    expect(metadata.recommendationsFlowFranchise).toBe('one_piece');

    const secondTurn = await useCase.execute({
      requestId: 'req-rec-flow-2',
      externalEventId: 'event-rec-flow-2',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-flow-1',
        text: 'mangas',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-flow-1',
        text: 'mangas',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(secondTurn.ok).toBe(false);
    expect(secondTurn.message).toContain('tomo/numero especifico');
    metadata = (persistence.turns[persistence.turns.length - 1]?.metadata ??
      {}) as Record<string, unknown>;
    expect(metadata.recommendationsFlowState).toBe('awaiting_volume_detail');
    expect(metadata.recommendationsFlowFranchise).toBe('one_piece');
    expect(metadata.recommendationsFlowCategoryHint).toBe('mangas');

    const thirdTurn = await useCase.execute({
      requestId: 'req-rec-flow-3',
      externalEventId: 'event-rec-flow-3',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-flow-1',
        text: 'tomo 1',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-flow-1',
        text: 'tomo 1',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(thirdTurn.ok).toBe(true);
    expect(thirdTurn.message).toBe('Respuesta de prueba');
    expect(llm.lastInput?.intent).toBe('recommendations');
    expect(llm.lastInput?.userText).toContain('tomo 1');
    const recommendationsBlock = llm.lastInput?.contextBlocks.find(
      (block) => block.contextType === 'recommendations',
    );
    const products = recommendationsBlock?.contextPayload.products as Array<{ slug: string }>;
    expect(products).toHaveLength(1);
    expect(products[0]?.slug).toBe('one-piece-tomo-1');

    metadata = (persistence.turns[persistence.turns.length - 1]?.metadata ??
      {}) as Record<string, unknown>;
    expect(metadata.recommendationsFlowState).toBeNull();
    expect(metadata.recommendationsFlowFranchise).toBeNull();
    expect(metadata.recommendationsFlowCategoryHint).toBeNull();
  });

  it('does not hijack unrelated messages when recommendations disambiguation is pending', async () => {
    jest.spyOn(entelequia, 'getProducts').mockResolvedValueOnce({
      contextType: 'products',
      contextPayload: {
        total: 22,
        items: buildRecommendationProductsFixture({
          franchiseLabel: 'Naruto',
          count: 22,
          categoryName: 'Mangas',
          categorySlug: 'mangas',
          slugPrefix: 'naruto',
        }),
      },
    });

    await useCase.execute({
      requestId: 'req-rec-flow-nh-1',
      externalEventId: 'event-rec-flow-nh-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-flow-nh-1',
        text: 'quiero naruto',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-flow-nh-1',
        text: 'quiero naruto',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    const response = await useCase.execute({
      requestId: 'req-rec-flow-nh-2',
      externalEventId: 'event-rec-flow-nh-2',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-flow-nh-1',
        text: 'gracias',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-flow-nh-1',
        text: 'gracias',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.message).toBe('Respuesta de prueba');
    expect(llm.lastInput?.intent).toBe('general');
    const metadata = (persistence.turns[persistence.turns.length - 1]?.metadata ??
      {}) as Record<string, unknown>;
    expect(metadata).not.toHaveProperty('recommendationsFlowState');
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

  it('answers cheapest price from the latest catalog snapshot without invoking llm again', async () => {
    const llmSpy = jest.spyOn(llm, 'buildAssistantReply');
    jest.spyOn(entelequia, 'getProducts').mockResolvedValueOnce({
      contextType: 'products',
      contextPayload: {
        items: [
          {
            id: 'ev-1',
            slug: 'evangelion-01',
            title: 'Evangelion 01',
            categoryName: 'Mangas',
            stock: 4,
            url: 'https://entelequia.com.ar/producto/evangelion-01',
            imageUrl: 'https://entelequia.com.ar/images/ev-1.jpg',
            price: { amount: '5.000', currency: 'ARS' },
          },
          {
            id: 'ev-2',
            slug: 'evangelion-02',
            title: 'Evangelion 02',
            categoryName: 'Mangas',
            stock: 5,
            url: 'https://entelequia.com.ar/producto/evangelion-02',
            imageUrl: 'https://entelequia.com.ar/images/ev-2.jpg',
            price: { amount: 10000, currency: 'ARS' },
          },
        ],
      },
    });

    const firstResponse = await useCase.execute({
      requestId: 'req-price-1',
      externalEventId: 'event-price-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-price-1',
        text: 'mostrame opciones de evangelion',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-price-1',
        text: 'mostrame opciones de evangelion',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(firstResponse.ok).toBe(true);
    expect(firstResponse).toHaveProperty('ui');
    expect(llmSpy).toHaveBeenCalledTimes(1);

    const firstPersistedMetadata = (persistence.turns[persistence.turns.length - 1]
      ?.metadata ?? {}) as Record<string, unknown>;
    expect(Array.isArray(firstPersistedMetadata.catalogSnapshot)).toBe(true);

    const secondResponse = await useCase.execute({
      requestId: 'req-price-2',
      externalEventId: 'event-price-2',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-price-1',
        text: 'cual es el mas barato de los que sugeriste?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-price-1',
        text: 'cual es el mas barato de los que sugeriste?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(secondResponse.ok).toBe(true);
    expect(secondResponse.message).toContain('Evangelion 01');
    expect(secondResponse.message).toContain('$5000 ARS');
    expect(llmSpy).toHaveBeenCalledTimes(1);
  });

  it('returns a clarification when asking cheapest price without previous catalog snapshot', async () => {
    const llmSpy = jest.spyOn(llm, 'buildAssistantReply');

    const response = await useCase.execute({
      requestId: 'req-price-empty-1',
      externalEventId: 'event-price-empty-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-price-empty-1',
        text: 'cual es el mas barato de los que sugeriste?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-price-empty-1',
        text: 'cual es el mas barato de los que sugeriste?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.message).toContain('No tengo una lista reciente de productos');
    expect(llmSpy).not.toHaveBeenCalled();
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

  it('increments exemplars-used metric when adaptive hints are appended', async () => {
    adaptiveExemplars.exemplars = [
      {
        intent: 'general',
        promptHint: 'Responder con claridad y proponer siguiente paso concreto.',
        confidenceWeight: 0.91,
        source: 'qa_seed',
      },
    ];

    const response = await useCase.execute({
      requestId: 'req-10b',
      externalEventId: 'event-general-exemplar',
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
        timestamp: '2026-02-10T00:00:01.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(metrics.exemplarsUsedInPromptEvents).toEqual([
      { intent: 'general', source: 'qa_seed' },
    ]);
    const adaptiveContextBlock = llm.lastInput?.contextBlocks.find(
      (block) =>
        block.contextType === 'general' &&
        typeof block.contextPayload.hint === 'string' &&
        block.contextPayload.hint.includes('Guia de calidad validada'),
    );
    expect(adaptiveContextBlock).toBeDefined();
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

function shouldRouteToRecommendationsByFranchise(normalizedText: string): boolean {
  const hasFranchiseHint = RECOMMENDATION_FRANCHISE_HINTS.some((hint) =>
    normalizedText.includes(hint),
  );
  if (!hasFranchiseHint) {
    return false;
  }

  return (
    normalizedText.startsWith('quiero') ||
    normalizedText.includes('regalo') ||
    normalizedText.includes('algo de') ||
    normalizedText.includes('busco') ||
    normalizedText.includes('tenes') ||
    normalizedText.includes('tienen')
  );
}

function buildRecommendationProductsFixture(input: {
  franchiseLabel: string;
  count: number;
  categoryName: string;
  categorySlug: string;
  slugPrefix: string;
}): Array<Record<string, unknown>> {
  return Array.from({ length: input.count }, (_, index) => {
    const volume = index + 1;
    return {
      id: `${input.slugPrefix}-${volume}`,
      slug: `${input.slugPrefix}-tomo-${volume}`,
      title: `${input.franchiseLabel} tomo ${volume}`,
      stock: 5,
      categoryName: input.categoryName,
      categorySlug: input.categorySlug,
    };
  });
}
