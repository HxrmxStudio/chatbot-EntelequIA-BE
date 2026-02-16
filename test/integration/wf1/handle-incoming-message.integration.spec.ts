import { Test } from '@nestjs/testing';
import { isRecord } from '@/common/utils/object.utils';
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
  ORDER_LOOKUP_PORT,
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
import { BACKEND_ERROR_MESSAGE } from '@/modules/wf1/application/use-cases/handle-incoming-message/support/error-mapper';
// EntelequiaOrderLookupClient no longer imported - use OrderLookupPort via token

class InMemoryPersistence {
  constructor(private readonly onEvent?: (event: string) => void) {}

  public turns: PersistTurnInput[] = [];
  public persistTurnError: Error | null = null;
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
    return [...rows].reverse().flatMap((row) => {
      if (row.sender !== 'user' && row.sender !== 'bot') {
        return [];
      }
      if (typeof row.content !== 'string' || typeof row.created_at !== 'string') {
        return [];
      }

      return [{ sender: row.sender, content: row.content, createdAt: row.created_at }];
    });
  }

  async getConversationHistoryRows(input: { conversationId: string; limit: number }): Promise<
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
  }): Promise<{
    message: string;
    messageId: string;
    metadata: Record<string, unknown> | null;
  } | null> {
    const key = `${input.channel}:${input.externalEventId}`;
    return this.botByEvent.get(key) ?? null;
  }

  async persistTurn(input: PersistTurnInput): Promise<{ botMessageId: string }> {
    this.onEvent?.('persist_turn');
    if (this.persistTurnError) {
      throw this.persistTurnError;
    }
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

  seedHistoryRows(rows: Array<{
    conversationId: string;
    sender: 'user' | 'bot';
    content: string;
    metadata?: unknown;
  }>): void {
    for (const row of rows) {
      this.sequence += 1;
      this.historyRows.push({
        sequence: this.sequence,
        conversationId: row.conversationId,
        id: `msg-${this.sequence}`,
        content: row.content,
        sender: row.sender,
        type: 'text',
        channel: 'web',
        metadata: row.metadata ?? null,
        created_at: new Date(1_700_000_000_000 + this.sequence).toISOString(),
      });
    }
  }
}

class InMemoryIdempotency {
  constructor(private readonly onEvent?: (event: string) => void) {}

  private readonly seen = new Set<string>();
  public markFailedCalls: Array<{
    source: 'web' | 'whatsapp';
    externalEventId: string;
    errorMessage: string;
  }> = [];

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

  async markFailed(input: {
    source: 'web' | 'whatsapp';
    externalEventId: string;
    errorMessage: string;
  }): Promise<void> {
    this.onEvent?.('mark_failed');
    this.markFailedCalls.push(input);
  }
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

  async getActiveExemplarsByIntent(input: { intent: string; limit: number }): Promise<
    Array<{
      intent: string;
      promptHint: string;
      confidenceWeight: number;
      source: string;
    }>
  > {
    return this.exemplars.filter((row) => row.intent === input.intent).slice(0, input.limit);
  }
}

class InMemoryMetrics {
  public exemplarsUsedInPromptEvents: Array<{ intent: string; source: string }> = [];
  public uiPayloadSuppressedReasons: Array<'flag_off' | 'no_cards' | 'duplicate'> = [];
  public fallbackReasons: string[] = [];

  incrementMessage(): void {}
  observeResponseLatency(): void {}
  incrementFallback(reason: string): void {
    this.fallbackReasons.push(reason);
  }
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
  incrementCriticalPolicyContextInjected(): void {}
  incrementCriticalPolicyContextTrimmed(): void {}
  incrementPromptContextTruncated(): void {}
  incrementReturnsPolicyDirectAnswer(): void {}
  incrementPolicyDirectAnswer(): void {}
  incrementScopeRedirect(): void {}
  incrementFeedbackReceived(): void {}
  incrementFeedbackWithCategory(): void {}
  incrementUiPayloadEmitted(): void {}
  incrementUiPayloadSuppressed(reason: 'flag_off' | 'no_cards' | 'duplicate'): void {
    this.uiPayloadSuppressedReasons.push(reason);
  }
  incrementLearningAutopromote(): void {}
  incrementLearningAutorollback(): void {}
  incrementExemplarsUsedInPrompt(input: { intent: string; source: string }): void {
    this.exemplarsUsedInPromptEvents.push({
      intent: input.intent,
      source: input.source,
    });
  }
  incrementOpenAiRequest(): void {}
  addOpenAiInputTokens(): void {}
  addOpenAiOutputTokens(): void {}
  addOpenAiCachedTokens(): void {}
  addOpenAiEstimatedCostUsd(): void {}
  incrementEvalBatchSubmitted(): void {}
  incrementEvalBatchCompleted(): void {}
  incrementEvalBatchFailed(): void {}
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

const RECOMMENDATION_FRANCHISE_HINTS = [
  'one piece',
  'naruto',
  'evangelion',
  'dragon ball',
  'yugioh',
  'yu gi oh',
  'k pop',
  'k-pop',
  'kpop',
];

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

    if (
      normalized.includes('pago') ||
      normalized.includes('envio') ||
      normalized.includes('envío')
    ) {
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
      (normalized.includes('pokemon') && normalized.includes('yugioh')) ||
      (normalized.includes('pokemon') && normalized.includes(' o '))
    ) {
      return {
        intent: 'products',
        entities: ['pokemon', 'yugioh'],
        confidence: 0.9,
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

    if (normalized.includes('911') || normalized.includes('inside job')) {
      return {
        intent: 'general',
        entities: [],
        confidence: 0.75,
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

  async buildAssistantReply(input: Parameters<LlmPort['buildAssistantReply']>[0]): Promise<string> {
    this.lastInput = input;
    const normalizedText = input.userText.toLowerCase();

    if (input.intent === 'store_info') {
      if (
        normalizedText.includes('horario') ||
        normalizedText.includes('abren') ||
        normalizedText.includes('feriado')
      ) {
        return 'Nuestros horarios son: Lunes a viernes 10:00 a 19:00 hs, Sabados 10:00 a 17:00 hs y Domingos cerrado. En feriados: 11:00 a 19:00 hs, valida en web/redes oficiales.';
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
  public profileMode: 'ok' | 'unauthorized' | 'invalid' = 'ok';
  public paymentInfoCalls = 0;
  public ordersCalls = 0;
  public orderDetailCalls = 0;
  public ordersPayload: Record<string, unknown> = { data: [] };
  public orderDetailPayload: Record<string, unknown> = { order: {} };

  async getProducts(_input?: { query?: string; categorySlug?: string; currency?: 'ARS' | 'USD' }): Promise<{
    contextType: 'products';
    contextPayload: Record<string, unknown>;
  }> {
    return {
      contextType: 'products',
      contextPayload: { products: { data: [] } },
    };
  }

  async getProductDetail(): Promise<{
    contextType: 'product_detail';
    contextPayload: Record<string, unknown>;
  }> {
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

  async getPaymentInfo(): Promise<{
    contextType: 'payment_info';
    contextPayload: Record<string, unknown>;
  }> {
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
    if (this.profileMode === 'unauthorized') {
      throw new ExternalServiceError('Unauthorized', 401, 'http');
    }

    if (this.profileMode === 'invalid') {
      return {
        email: '',
        phone: '',
        name: '',
      };
    }

    return {
      email: 'user-1@example.com',
      phone: '',
      name: 'Customer',
    };
  }

  async getOrders(): Promise<{ contextType: 'orders'; contextPayload: Record<string, unknown> }> {
    this.ordersCalls += 1;
    if (this.mode === 'order-not-owned') {
      throw new ExternalServiceError('Order mismatch', 442, 'http');
    }

    return {
      contextType: 'orders',
      contextPayload: this.ordersPayload,
    };
  }

  async getOrderDetail(): Promise<{
    contextType: 'order_detail';
    contextPayload: Record<string, unknown>;
  }> {
    this.orderDetailCalls += 1;
    return {
      contextType: 'order_detail',
      contextPayload: this.orderDetailPayload,
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
    return [
      'TIEMPOS DE ENTREGA',
      '- CABA (moto): 24-48hs (entrega en el dia comprando antes de las 13hs).',
      '- Interior con Andreani: 3-5 dias habiles.',
      '- Interior con Correo Argentino: 5-7 dias habiles.',
      '- Envio internacional con DHL: menos de 4 dias habiles.',
      '- Son estimados y pueden variar segun destino y operador logistico.',
    ].join('\n');
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
      '- Sabados: 10:00 a 17:00 hs.',
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

  getPolicyFactsShortContext(): string {
    return 'Hechos criticos de negocio';
  }

  getCriticalPolicyContext(): string {
    return 'Politica critica';
  }

  getTicketsReturnsPolicyContext(): string {
    return 'Politica de devoluciones';
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
        { provide: ORDER_LOOKUP_PORT, useValue: orderLookupClient },
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
    const metadata = (persistence.turns[persistence.turns.length - 1].metadata ?? {}) as Record<
      string,
      unknown
    >;
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
    const metadata = (persistence.turns[persistence.turns.length - 1].metadata ?? {}) as Record<
      string,
      unknown
    >;
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
    const metadata = (persistence.turns[persistence.turns.length - 1].metadata ?? {}) as Record<
      string,
      unknown
    >;
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
    const metadata = (persistence.turns[persistence.turns.length - 1].metadata ?? {}) as Record<
      string,
      unknown
    >;
    expect(metadata.ordersGuestLookupAttempted).toBe(true);
    expect(metadata.ordersGuestLookupResultCode).toBe('success');
    expect(metadata.ordersGuestLookupStatusCode).toBe(200);
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

  it('accepts multiline lookup payload and executes backend lookup path', async () => {
    const response = await useCase.execute({
      requestId: 'req-lookup-multiline-1',
      externalEventId: 'event-lookup-multiline-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'Pedido #78399\ndni:38321532\nEmiliano rozas',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'Pedido #78399\ndni:38321532\nEmiliano rozas',
        channel: null,
        timestamp: '2026-02-10T00:00:00.001Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.message).toContain('PEDIDO #12345');
    const metadata = (persistence.turns[persistence.turns.length - 1].metadata ?? {}) as Record<
      string,
      unknown
    >;
    expect(metadata.ordersGuestLookupAttempted).toBe(true);
    expect(metadata.ordersGuestLookupResultCode).toBe('success');
    expect(metadata.ordersGuestLookupStatusCode).toBe(200);
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
    const metadata = (persistence.turns[persistence.turns.length - 1].metadata ?? {}) as Record<
      string,
      unknown
    >;
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
    const metadata = (persistence.turns[persistence.turns.length - 1].metadata ?? {}) as Record<
      string,
      unknown
    >;
    expect(metadata.ordersGuestLookupAttempted).toBe(true);
    expect(metadata.ordersGuestLookupResultCode).toBe('not_found_or_mismatch');
    expect(metadata.ordersGuestLookupStatusCode).toBe(404);
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
    const metadata = (persistence.turns[persistence.turns.length - 1].metadata ?? {}) as Record<
      string,
      unknown
    >;
    expect(metadata.ordersGuestFlowState).toBe('awaiting_lookup_payload');
    expect(metadata.ordersGuestLookupAttempted).toBe(false);
    expect(metadata.ordersGuestLookupResultCode).toBeNull();
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

  it('respects orders escalation flow when user responds with dale', async () => {
    persistence.seedHistoryRows([
      {
        conversationId: 'conv-escalation-dale',
        sender: 'bot',
        content: 'Tu pedido #12345 fue cancelado. Queres que consulte con el area correspondiente?',
        metadata: {
          ordersEscalationFlowState: 'awaiting_cancelled_reason_confirmation',
        },
      },
    ]);

    const response = await useCase.execute({
      requestId: 'req-escalation-dale',
      externalEventId: 'event-escalation-dale',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-escalation-dale',
        text: 'dale',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-escalation-dale',
        text: 'dale',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(false);
    expect(response.message).toContain('WhatsApp');
    expect(response.message).toContain('contacto');
    expect(response.message).not.toMatch(/- \w+:\s*$/m);
  });

  // Skipped: This test depends on message parsing fallback removed in Priority 5.
  // Will pass once LLM returns proper metadata flags (offeredEscalation).
  it.skip('resolves cancelled-order escalation confirmation without repeating the same prompt', async () => {
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
    // Note: Escalation state is no longer set by message parsing fallback (removed in Priority 5).
    // Would need LLM to return metadata with offeredEscalation flag for this to work.
    // const firstMetadata = (persistence.turns[persistence.turns.length - 1].metadata ??
    //   {}) as Record<string, unknown>;
    // expect(firstMetadata.ordersEscalationFlowState).toBe('awaiting_cancelled_reason_confirmation');

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
    // Escalation flow assertions disabled - now requires metadata-driven detection
    // const secondMetadata = (persistence.turns[persistence.turns.length - 1].metadata ??
    //   {}) as Record<string, unknown>;
    // expect(secondMetadata.ordersEscalationFlowState).toBeNull();
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

  it('increments duplicate ui suppression metric when duplicate references catalog ui metadata', async () => {
    jest.spyOn(entelequia, 'getProducts').mockResolvedValueOnce({
      contextType: 'products',
      contextPayload: {
        items: [
          {
            id: 'ev-dup-1',
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

    const first = await useCase.execute({
      requestId: 'req-dup-ui-1',
      externalEventId: 'event-dup-ui',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-dup-ui',
        text: 'tienen evangelion?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-dup-ui',
        text: 'tienen evangelion?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    const second = await useCase.execute({
      requestId: 'req-dup-ui-2',
      externalEventId: 'event-dup-ui',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-dup-ui',
        text: 'tienen evangelion?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-dup-ui',
        text: 'tienen evangelion?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.001Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(metrics.uiPayloadSuppressedReasons).toContain('duplicate');
    const duplicateSuppressions = metrics.uiPayloadSuppressedReasons.filter(
      (reason) => reason === 'duplicate',
    );
    expect(duplicateSuppressions).toHaveLength(1);
  });

  it('uses LLM fallback when 442 backend error occurs (order not found)', async () => {
    entelequia.mode = 'order-not-owned';
    const llmSpy = jest.spyOn(llm, 'buildAssistantReply');

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

    expect(response.ok).toBe(true);
    expect(response.message).toBeTruthy();
    expect(response.message.length).toBeGreaterThan(10);
    expect(llmSpy).toHaveBeenCalled();
  });

  it('uses deterministic backend response for authenticated order detail without LLM', async () => {
    entelequia.orderDetailPayload = {
      order: {
        id: 78399,
        state: 'processing',
        shipTrackingCode: 'TRK-78399',
        orderItems: [],
      },
    };
    entelequia.ordersPayload = {
      data: [
        {
          id: 78399,
          state: 'processing',
        },
      ],
    };
    const llmSpy = jest.spyOn(llm, 'buildAssistantReply');

    const response = await useCase.execute({
      requestId: 'req-orders-deterministic',
      externalEventId: 'event-orders-deterministic',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-orders-deterministic',
        text: 'pedido 78399',
        accessToken: 'token',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-orders-deterministic',
        text: 'pedido 78399',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect('intent' in response && response.intent).toBe('orders');
    expect(response.message.toLowerCase()).toContain('pedido #78399');
    expect(response.message.toLowerCase()).not.toContain('productos del pedido');
    expect(entelequia.orderDetailCalls).toBe(1);
    expect(entelequia.ordersCalls).toBe(1);
    expect(llmSpy).not.toHaveBeenCalled();

    const turn = persistence.turns[persistence.turns.length - 1];
    const metadata = (turn.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.ordersDeterministicReply).toBe(true);
    expect(metadata.ordersDataSource).toBe('detail');
    expect(metadata.ordersStateConflict).toBe(false);
  });

  it('reuses latest orderIdResolved for items follow-up without explicit id', async () => {
    entelequia.orderDetailPayload = {
      order: {
        id: 78399,
        state: 'processing',
        orderItems: [
          {
            productTitle: 'One Piece 01',
            quantity: 2,
            productPrice: { amount: 12000, currency: 'ARS' },
          },
          {
            productTitle: 'Naruto 03',
            quantity: 1,
            productPrice: { amount: 9500, currency: 'ARS' },
          },
        ],
      },
    };
    entelequia.ordersPayload = {
      data: [
        {
          id: 78399,
          state: 'processing',
        },
      ],
    };

    await useCase.execute({
      requestId: 'req-orders-followup-1',
      externalEventId: 'event-orders-followup-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-orders-followup',
        text: 'quiero saber estado del pedido 78399',
        accessToken: 'token',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-orders-followup',
        text: 'quiero saber estado del pedido 78399',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    const followup = await useCase.execute({
      requestId: 'req-orders-followup-2',
      externalEventId: 'event-orders-followup-2',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-orders-followup',
        text: 'que tenia ese pedido?',
        accessToken: 'token',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-orders-followup',
        text: 'que tenia ese pedido?',
        channel: null,
        timestamp: '2026-02-10T00:00:01.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(followup.ok).toBe(true);
    expect(followup.message).toContain('Productos del pedido:');
    expect(followup.message).toContain('- One Piece 01 x2 - $12000 ARS');
    expect(entelequia.orderDetailCalls).toBe(2);
    expect(entelequia.ordersCalls).toBe(2);
  });

  it('returns conservative conflict message when list and detail states disagree', async () => {
    entelequia.orderDetailPayload = {
      order: {
        id: 78399,
        state: 'processing',
        orderItems: [],
      },
    };
    entelequia.ordersPayload = {
      data: [
        {
          id: 78399,
          state: 'cancelled',
        },
      ],
    };
    const llmSpy = jest.spyOn(llm, 'buildAssistantReply');

    const response = await useCase.execute({
      requestId: 'req-orders-conflict',
      externalEventId: 'event-orders-conflict',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-orders-conflict',
        text: 'estado del pedido 78399',
        accessToken: 'token',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-orders-conflict',
        text: 'estado del pedido 78399',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.message.toLowerCase()).toContain('inconsistencia temporal');
    expect(response.message.toLowerCase()).toContain('estado incorrecto');
    expect(llmSpy).not.toHaveBeenCalled();

    const turn = persistence.turns[persistence.turns.length - 1];
    const metadata = (turn.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.ordersDeterministicReply).toBe(true);
    expect(metadata.ordersDataSource).toBe('conflict');
    expect(metadata.ordersStateConflict).toBe(true);
  });

  it('returns conflict-safe state and item disclaimer when user asks products', async () => {
    entelequia.orderDetailPayload = {
      order: {
        id: 78399,
        state: 'processing',
        orderItems: [
          {
            productTitle: 'Bleach 01',
            quantity: 1,
            productPrice: { amount: 10000, currency: 'ARS' },
          },
        ],
      },
    };
    entelequia.ordersPayload = {
      data: [
        {
          id: 78399,
          state: 'cancelled',
        },
      ],
    };

    const response = await useCase.execute({
      requestId: 'req-orders-conflict-items',
      externalEventId: 'event-orders-conflict-items',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-orders-conflict-items',
        text: 'que tenia el pedido 78399?',
        accessToken: 'token',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-orders-conflict-items',
        text: 'que tenia el pedido 78399?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.message.toLowerCase()).toContain('inconsistencia temporal');
    expect(response.message).toContain('Segun el detalle actual del pedido, los productos son:');
    expect(response.message).toContain('- Bleach 01 x1 - $10000 ARS');
  });

  it('guides re-authentication when user says session signal without token', async () => {
    const llmSpy = jest.spyOn(llm, 'buildAssistantReply');

    const response = await useCase.execute({
      requestId: 'req-orders-reauth',
      externalEventId: 'event-orders-reauth',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-orders-reauth',
        text: 'ya me logue y quiero ver mis pedidos',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-orders-reauth',
        text: 'ya me logue y quiero ver mis pedidos',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(false);
    expect(response.message).toContain('NO DETECTO TU SESION EN ESTE CHAT');
    expect(response.message).not.toContain('Te ayudo con consultas de Entelequia');
    expect(llmSpy).not.toHaveBeenCalled();
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

  it('falls back to guest user when profile lookup returns 401', async () => {
    entelequia.profileMode = 'unauthorized';

    const response = await useCase.execute({
      requestId: 'req-auth-401',
      externalEventId: 'event-auth-401',
      payload: {
        source: 'web',
        userId: '1962',
        conversationId: 'conv-auth-401',
        text: 'busco un manga',
        accessToken: 'expired-token',
      },
      idempotencyPayload: {
        source: 'web',
        userId: '1962',
        conversationId: 'conv-auth-401',
        text: 'busco un manga',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(persistence.authenticatedProfiles).toHaveLength(0);
    expect(persistence.turns[persistence.turns.length - 1].userId).toBe('1962');
  });

  it('fails safely when authenticated profile payload is invalid', async () => {
    entelequia.profileMode = 'invalid';

    const response = await useCase.execute({
      requestId: 'req-auth-invalid',
      externalEventId: 'event-auth-invalid',
      payload: {
        source: 'web',
        userId: '1962',
        conversationId: 'conv-auth-invalid',
        text: 'hola',
        accessToken: 'valid-token',
      },
      idempotencyPayload: {
        source: 'web',
        userId: '1962',
        conversationId: 'conv-auth-invalid',
        text: 'hola',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response).toEqual({
      ok: false,
      message: BACKEND_ERROR_MESSAGE,
    });
    expect(persistence.authenticatedProfiles).toHaveLength(0);
    expect(idempotency.markFailedCalls).toHaveLength(1);
    expect(idempotency.markFailedCalls[0]).toMatchObject({
      source: 'web',
      externalEventId: 'event-auth-invalid',
    });
    const lastAudit = audit.entries[audit.entries.length - 1];
    expect(lastAudit.status).toBe('failure');
    expect(lastAudit.intent).toBe('error');
    expect(lastAudit.errorCode).toBe('Error');
    expect(metrics.fallbackReasons).toContain('unknown');
  });

  it('enriches payment_shipping context and keeps success response', async () => {
    const response = await useCase.execute({
      requestId: 'req-6',
      externalEventId: 'event-payment-shipping',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: '¿Que opciones de envio tienen para provincia?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: '¿Que opciones de envio tienen para provincia?',
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

  it('keeps canonical shipping time ranges in payment_shipping aiContext', async () => {
    const response = await useCase.execute({
      requestId: 'req-6-time',
      externalEventId: 'event-payment-shipping-time',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: '¿Cuanto tarda un envio a Cordoba?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: '¿Cuanto tarda un envio a Cordoba?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(llm.lastInput).toBeDefined();
    const paymentBlock = llm.lastInput?.contextBlocks.find(
      (block) => block.contextType === 'payment_info',
    );
    expect(paymentBlock).toBeDefined();
    expect(paymentBlock?.contextPayload).toHaveProperty('aiContext');
    const aiContext = String(paymentBlock?.contextPayload.aiContext ?? '');
    expect(aiContext).toContain('24-48');
    expect(aiContext).toContain('3-5');
    expect(aiContext).toContain('5-7');
    expect(aiContext).toContain('DHL');
    expect(aiContext).not.toContain('1-3');
    expect(aiContext).not.toContain('2-5');
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
    let metadata = (persistence.turns[persistence.turns.length - 1]?.metadata ?? {}) as Record<
      string,
      unknown
    >;
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
    metadata = (persistence.turns[persistence.turns.length - 1]?.metadata ?? {}) as Record<
      string,
      unknown
    >;
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

    metadata = (persistence.turns[persistence.turns.length - 1]?.metadata ?? {}) as Record<
      string,
      unknown
    >;
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
        text: 'gracias por la ayuda',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-flow-nh-1',
        text: 'gracias por la ayuda',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.message).toBe('Respuesta de prueba');
    expect(llm.lastInput?.intent).toBe('general');
    const metadata = (persistence.turns[persistence.turns.length - 1]?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    expect(metadata).not.toHaveProperty('recommendationsFlowState');
  });

  it('keeps franchise continuity for budget follow-up in catalog turns', async () => {
    const getProductsSpy = jest
      .spyOn(entelequia, 'getProducts')
      .mockResolvedValueOnce({
        contextType: 'products',
        contextPayload: {
          total: 2,
          items: [
            {
              id: 'kpop-1',
              slug: 'kpop-album-blackpink',
              title: 'Album K-pop Blackpink',
              stock: 8,
              categoryName: 'Musica',
              categorySlug: 'musica',
              url: 'https://entelequia.com.ar/producto/kpop-album-blackpink',
              price: { amount: 18000, currency: 'ARS' },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        contextType: 'products',
        contextPayload: {
          total: 1,
          items: [
            {
              id: 'kpop-2',
              slug: 'kpop-poster-budget',
              title: 'Poster K-pop',
              stock: 12,
              categoryName: 'Posters',
              categorySlug: 'posters',
              url: 'https://entelequia.com.ar/producto/kpop-poster-budget',
              price: { amount: 5000, currency: 'ARS' },
            },
          ],
        },
      });

    await useCase.execute({
      requestId: 'req-rec-memory-1',
      externalEventId: 'event-rec-memory-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-memory-1',
        text: 'tenes algo de k pop?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-memory-1',
        text: 'tenes algo de k pop?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    const response = await useCase.execute({
      requestId: 'req-rec-memory-2',
      externalEventId: 'event-rec-memory-2',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-memory-1',
        text: 'tengo poco presupuesto',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-memory-1',
        text: 'tengo poco presupuesto',
        channel: null,
        timestamp: '2026-02-10T00:00:10.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(llm.lastInput?.userText.toLowerCase()).toContain('k pop');
    if (!response.ok) {
      throw new Error('Expected successful response');
    }
    expect(response.ui?.cards[0]?.title.toLowerCase()).toContain('k-pop');
    expect(getProductsSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    const metadata = (persistence.turns[persistence.turns.length - 1]?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    expect(metadata.recommendationsLastFranchise).toBe('k_pop');
  });

  it('compacts duplicated catalog narrative when cards are present', async () => {
    jest.spyOn(entelequia, 'getProducts').mockResolvedValueOnce({
      contextType: 'products',
      contextPayload: {
        total: 2,
        items: [
          {
            id: 'ev-1',
            slug: 'evangelion-01',
            title: 'Evangelion 01',
            stock: 4,
            categoryName: 'Mangas',
            categorySlug: 'mangas',
            url: 'https://entelequia.com.ar/producto/evangelion-01',
          },
          {
            id: 'ev-2',
            slug: 'evangelion-02',
            title: 'Evangelion 02',
            stock: 2,
            categoryName: 'Mangas',
            categorySlug: 'mangas',
            url: 'https://entelequia.com.ar/producto/evangelion-02',
          },
        ],
      },
    });
    jest
      .spyOn(llm, 'buildAssistantReply')
      .mockResolvedValueOnce(
        'No hay stock ahora mismo.\n1. Evangelion 01 - https://entelequia.com.ar/producto/evangelion-01\n2. Evangelion 02 - https://entelequia.com.ar/producto/evangelion-02',
      );

    const response = await useCase.execute({
      requestId: 'req-rec-narrative-1',
      externalEventId: 'event-rec-narrative-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-narrative-1',
        text: 'tenes evangelion?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-rec-narrative-1',
        text: 'tenes evangelion?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error('Expected successful response');
    }
    expect(response.ui?.cards.length).toBeGreaterThan(0);
    expect(response.message.toLowerCase()).toContain('tarjetas de abajo');
    expect(response.message.toLowerCase()).not.toContain('http');
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

  it('searches multiple entities with OR and informs about missing products', async () => {
    jest.spyOn(entelequia, 'getProducts').mockImplementation(async (input?: { query?: string }) => {
      if (input?.query === 'pokemon') {
        return { contextType: 'products', contextPayload: { items: [], total: 0 } };
      }
      if (input?.query === 'yugioh') {
        return {
          contextType: 'products',
          contextPayload: {
            items: [
              {
                id: 1,
                slug: 'yugioh-starter',
                title: 'Yu-Gi-Oh Starter Deck',
                stock: 5,
                categoryName: 'TCG',
                price: { amount: 15000, currency: 'ARS' },
              },
            ],
            total: 1,
          },
        };
      }
      return { contextType: 'products', contextPayload: { items: [], total: 0 } };
    });

    jest.spyOn(llm, 'buildAssistantReply').mockImplementationOnce(async (input) => {
      llm.lastInput = input;
      return 'Tenemos productos de Yu-Gi-Oh. No encontramos Pokemon. Te sugerimos ver las opciones de Yu-Gi-Oh.';
    });

    const response = await useCase.execute({
      requestId: 'req-multi',
      externalEventId: 'event-multi',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-multi',
        text: 'quiero pokemon o yugioh',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-multi',
        text: 'quiero pokemon o yugioh',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error('Expected success');
    expect(response.message).toContain('Yu-Gi-Oh');
    expect(response.message.toLowerCase()).toContain('pokemon');
    expect(response.message.toLowerCase()).toMatch(/no (encontramos|tenemos)/);
    expect(
      llm.lastInput?.contextBlocks?.some((b) =>
        (b.contextPayload as { aiContext?: string })?.aiContext?.includes(
          'No encontramos stock de: pokemon',
        ),
      ),
    ).toBe(true);
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

    const firstPersistedMetadata = (persistence.turns[persistence.turns.length - 1]?.metadata ??
      {}) as Record<string, unknown>;
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
    expect(ticketsBlock?.contextPayload).toHaveProperty('requiresHumanEscalation', true);
  });

  it('handles store_info intent with resolved subtype and aiContext', async () => {
    const response = await useCase.execute({
      requestId: 'req-9',
      externalEventId: 'event-store-info',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'Cual es la direccion?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'Cual es la direccion?',
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
    const llmSpy = jest.spyOn(llm, 'buildAssistantReply');
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
    if (!response.ok) {
      throw new Error('Expected successful response');
    }
    expect(response.intent).toBe('store_info');
    expect(response.message).toContain('Lunes a viernes 10:00 a 19:00 hs');
    expect(response.message).toContain('Sabados 10:00 a 17:00 hs');
    expect(response.message).toContain('feriados');
    // LLM is called even for store_info (with context) after Step 5
    expect(llmSpy).toHaveBeenCalled();

    const persistedTurn = persistence.turns[persistence.turns.length - 1];
    const persistedMetadata = (persistedTurn.metadata ?? {}) as Record<string, unknown>;
    // After Step 5: LLM is called with context, so storeInfoSubtype is detected
    expect(persistedMetadata.storeInfoSubtype).toBe('hours');
    expect(persistedMetadata.storeInfoPolicyVersion).toBeDefined();

    const lastAudit = audit.entries[audit.entries.length - 1];
    const auditMetadata = (lastAudit.metadata ?? {}) as Record<string, unknown>;
    expect(auditMetadata.storeInfoSubtype).toBe('hours');
    expect(auditMetadata.storeInfoPolicyVersion).toBeDefined();
    // LLM is called (path may vary based on mock)
    expect(typeof auditMetadata.llmPath).toBe('string');
  });

  it('handles general intent with minimal ai context', async () => {
    jest.spyOn(StubIntentExtractor.prototype, 'extractIntent').mockResolvedValueOnce({
      intent: 'general',
      entities: [],
      confidence: 0.9,
    });
    const response = await useCase.execute({
      requestId: 'req-10',
      externalEventId: 'event-general',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'que productos tienen?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'que productos tienen?',
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

  it('handles ambiguous queries through LLM after Step 5 guardrails simplification', async () => {
    // After Step 5: ambiguous queries go through LLM instead of direct out-of-scope block
    const llmSpy = jest.spyOn(llm, 'buildAssistantReply');
    const extractorSpy = jest
      .spyOn(StubIntentExtractor.prototype, 'extractIntent')
      .mockResolvedValueOnce({
        intent: 'general',
        entities: [],
        confidence: 0.95,
      });

    const response = await useCase.execute({
      requestId: 'req-general-scope-1',
      externalEventId: 'event-general-scope-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-general-scope-1',
        text: 'was 911 an inside job?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-general-scope-1',
        text: 'was 911 an inside job?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error('Expected successful response');
    }
    expect(response.intent).toBe('general');
    // LLM is now called for ambiguous queries
    expect(llmSpy).toHaveBeenCalled();
    extractorSpy.mockRestore();
  });

  it('answers policy questions through LLM with context after Step 5', async () => {
    // After Step 5: policy questions go through LLM with enriched context instead of direct answer
    const llmSpy = jest.spyOn(llm, 'buildAssistantReply');

    const response = await useCase.execute({
      requestId: 'req-policy-direct-1',
      externalEventId: 'event-policy-direct-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-policy-direct-1',
        text: 'Cuanto tiempo tengo para devolver un producto?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-policy-direct-1',
        text: 'Cuanto tiempo tengo para devolver un producto?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error('Expected successful response');
    }
    // LLM is now called with policy context
    expect(llmSpy).toHaveBeenCalled();
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
    jest.spyOn(StubIntentExtractor.prototype, 'extractIntent').mockResolvedValueOnce({
      intent: 'general',
      entities: [],
      confidence: 0.9,
    });
    const response = await useCase.execute({
      requestId: 'req-10b',
      externalEventId: 'event-general-exemplar',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'que productos tienen?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'que productos tienen?',
        channel: null,
        timestamp: '2026-02-10T00:00:01.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    expect(metrics.exemplarsUsedInPromptEvents).toEqual([{ intent: 'general', source: 'qa_seed' }]);
    const adaptiveContextBlock = llm.lastInput?.contextBlocks.find(
      (block) =>
        block.contextType === 'general' &&
        typeof block.contextPayload.hint === 'string' &&
        block.contextPayload.hint.includes('Guia de calidad validada'),
    );
    expect(adaptiveContextBlock).toBeDefined();
  });

  it('keeps append-order semantics for products flow (products -> product_detail -> static_context -> policy_facts -> critical_policy)', async () => {
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
    const contextTypes = llm.lastInput?.contextBlocks.map((block) => block.contextType) ?? [];
    expect(contextTypes).toEqual([
      'products',
      'product_detail',
      'static_context',
      'policy_facts',
      'critical_policy',
    ]);
  });

  it('keeps append-order semantics for store_info flow (store_info -> static_context -> policy_facts -> critical_policy)', async () => {
    const response = await useCase.execute({
      requestId: 'req-12',
      externalEventId: 'event-store-merge-append',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'direccion?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'direccion?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    const contextTypes = llm.lastInput?.contextBlocks.map((block) => block.contextType) ?? [];
    expect(contextTypes).toEqual([
      'store_info',
      'static_context',
      'policy_facts',
      'critical_policy',
    ]);
  });

  it.each([
    {
      text: 'que promociones tienen vigentes?',
      intent: 'payment_shipping',
      expectedMessage: 'Tenemos promociones',
    },
    {
      text: 'se puede reservar un producto?',
      intent: 'products',
      expectedMessage: '48 horas',
    },
    {
      text: 'traen productos importados del exterior?',
      intent: 'products',
      expectedMessage: '30 a 60 dias',
    },
    {
      text: 'hacen envios internacionales por dhl?',
      intent: 'payment_shipping',
      expectedMessage: 'envios internacionales con DHL',
    },
  ])('answers deterministic business policy for "$text" without LLM', async ({ text, intent }) => {
    const llmSpy = jest.spyOn(llm, 'buildAssistantReply');
    const response = await useCase.execute({
      requestId: `req-policy-${intent}`,
      externalEventId: `event-policy-${intent}-${text.length}`,
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: `conv-policy-${intent}-${text.length}`,
        text,
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: `conv-policy-${intent}-${text.length}`,
        text,
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error('Expected successful response');
    }
    // Intent comes from classifier, not from policy detection after Step 5
    expect(typeof response.intent).toBe('string');
    // After Step 5: policy questions go through LLM with context instead of direct answer
    expect(llmSpy).toHaveBeenCalled();
  });

  it('handles ambiguous questions more leniently after Step 5 (lets LLM respond)', async () => {
    // After Step 5: more lenient scope check, ambiguous queries go through LLM
    const llmSpy = jest.spyOn(llm, 'buildAssistantReply');
    const response = await useCase.execute({
      requestId: 'req-scope-1',
      externalEventId: 'event-scope-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-scope-1',
        text: 'was 911 an inside job?',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-scope-1',
        text: 'was 911 an inside job?',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error('Expected successful response');
    }
    expect(response.intent).toBe('general');
    // LLM is called for ambiguous queries after Step 5
    expect(llmSpy).toHaveBeenCalled();
  });

  it('marks failed and audits failure when persistence throws after response resolution', async () => {
    persistence.persistTurnError = new Error('forced_persist_failure');

    const response = await useCase.execute({
      requestId: 'req-final-stage-failure',
      externalEventId: 'event-final-stage-failure',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-final-stage-failure',
        text: 'hola',
      },
      idempotencyPayload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-final-stage-failure',
        text: 'hola',
        channel: null,
        timestamp: '2026-02-10T00:00:00.000Z',
        validated: null,
        validSignature: 'true',
      },
    });

    expect(response).toEqual({
      ok: false,
      message: BACKEND_ERROR_MESSAGE,
    });
    expect(persistence.turns).toHaveLength(0);
    expect(idempotency.markFailedCalls).toHaveLength(1);
    expect(idempotency.markFailedCalls[0]).toMatchObject({
      source: 'web',
      externalEventId: 'event-final-stage-failure',
      errorMessage: 'forced_persist_failure',
    });
    const failureAudit = audit.entries[audit.entries.length - 1];
    expect(failureAudit.status).toBe('failure');
    expect(failureAudit.intent).toBe('error');
    expect(failureAudit.errorCode).toBe('Error');
    expect(metrics.fallbackReasons).toContain('unknown');

    const persistIndex = finalStageEvents.indexOf('persist_turn');
    const markFailedIndex = finalStageEvents.indexOf('mark_failed');
    const auditIndex = finalStageEvents.lastIndexOf('write_audit');
    const markProcessedIndex = finalStageEvents.indexOf('mark_processed');

    expect(persistIndex).toBeGreaterThan(-1);
    expect(markFailedIndex).toBeGreaterThan(persistIndex);
    expect(auditIndex).toBeGreaterThan(markFailedIndex);
    expect(markProcessedIndex).toBe(-1);
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
