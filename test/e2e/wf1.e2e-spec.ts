import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, getStorageToken } from '@nestjs/throttler';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { json } from 'express';
import type { Request, Response } from 'express';

process.env.CHATBOT_DB_URL = 'postgres://test:test@localhost:5432/chatbot';
process.env.ENTELEQUIA_API_BASE_URL = 'http://127.0.0.1:8000/api/v1';
process.env.BOT_ORDER_LOOKUP_HMAC_SECRET = 'test-hmac-secret';
process.env.ORDER_LOOKUP_RATE_LIMIT_ENABLED = 'false';
process.env.TURNSTILE_SECRET_KEY = '';
process.env.WHATSAPP_SECRET = 'test-whatsapp-secret';

import { AppModule } from '@/app.module';
import {
  EntelequiaHttpAdapter,
  EntelequiaOrderLookupClient,
} from '@/modules/wf1/infrastructure/adapters/entelequia-http';
import { IntentExtractorAdapter } from '@/modules/wf1/infrastructure/adapters/intent-extractor';
import { OpenAiAdapter } from '@/modules/wf1/infrastructure/adapters/openai';
import { PgAuditRepository } from '@/modules/wf1/infrastructure/repositories/pg-audit.repository';
import { PgChatRepository } from '@/modules/wf1/infrastructure/repositories/pg-chat.repository';
import { PgChatFeedbackRepository } from '@/modules/wf1/infrastructure/repositories/pg-chat-feedback.repository';
import { PgIdempotencyRepository } from '@/modules/wf1/infrastructure/repositories/pg-idempotency.repository';
import type { PersistTurnInput } from '@/modules/wf1/application/ports/chat-persistence.port';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

class E2ERepository {
  private readonly seen = new Set<string>();
  private readonly botByEvent = new Map<
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
  public turns: Array<{
    source: 'web' | 'whatsapp';
    conversationId: string;
    externalEventId: string;
  }> = [];

  async onModuleInit(): Promise<void> {}

  async onModuleDestroy(): Promise<void> {}

  async upsertUser(userId: string): Promise<{
    id: string;
    email: string;
    phone: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }> {
    const now = '2026-02-10T00:00:00.000Z';
    return { id: userId, email: userId, phone: '', name: 'Customer', createdAt: now, updatedAt: now };
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
    this.turns.push({
      source: input.source,
      conversationId: input.conversationId,
      externalEventId: input.externalEventId,
    });
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

    const eventKey = `${input.source}:${input.externalEventId}`;
    this.botByEvent.set(eventKey, {
      message: input.botMessage,
      messageId: botRow.id,
      metadata: isRecord(input.metadata) ? input.metadata : null,
    });

    return { botMessageId: botRow.id };
  }

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

  async markProcessed(): Promise<void> {}

  async markFailed(): Promise<void> {}

  async writeAudit(): Promise<void> {}

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

class E2EIntent {
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
        confidence: 0.84,
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
        confidence: 0.83,
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
      entities: [],
      confidence: 0.8,
    };
  }
}

class E2EEntelequia {
  async getProducts(input?: {
    query?: string;
    categorySlug?: string;
  }): Promise<{ contextType: 'products'; contextPayload: Record<string, unknown> }> {
    const normalizedQuery = String(input?.query ?? '').toLowerCase();
    const isMangaCategory = input?.categorySlug === 'mangas';

    if (normalizedQuery.includes('one piece')) {
      if (isMangaCategory) {
        return {
          contextType: 'products',
          contextPayload: {
            total: 2,
            items: [
              {
                id: 'op-1',
                slug: 'one-piece-tomo-1',
                title: 'One Piece tomo 1',
                stock: 5,
                categoryName: 'Mangas',
                categorySlug: 'mangas',
              },
              {
                id: 'op-2',
                slug: 'one-piece-tomo-2',
                title: 'One Piece tomo 2',
                stock: 4,
                categoryName: 'Mangas',
                categorySlug: 'mangas',
              },
            ],
          },
        };
      }

      return {
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
      };
    }

    if (normalizedQuery.includes('naruto')) {
      return {
        contextType: 'products',
        contextPayload: {
          total: 6,
          items: buildRecommendationProductsFixture({
            franchiseLabel: 'Naruto',
            count: 6,
            categoryName: 'Mangas',
            categorySlug: 'mangas',
            slugPrefix: 'naruto',
          }),
        },
      };
    }

    if (normalizedQuery.includes('evangelion')) {
      return {
        contextType: 'products',
        contextPayload: {
          total: 6,
          items: buildRecommendationProductsFixture({
            franchiseLabel: 'Evangelion',
            count: 6,
            categoryName: 'Figuras',
            categorySlug: 'figuras',
            slugPrefix: 'evangelion',
          }),
        },
      };
    }

    return {
      contextType: 'products',
      contextPayload: { total: 0, items: [] },
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
    return {
      contextType: 'payment_info',
      contextPayload: {},
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

class E2EOrderLookupClient {
  async lookupOrder(): Promise<{
    ok: boolean;
    order?: {
      id: number;
      state: string;
      total: { currency: string; amount: number };
      paymentMethod: string;
      shipMethod: string;
      trackingCode: string;
    };
  }> {
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
}

class E2EFeedbackRepository {
  private readonly seen = new Set<string>();
  public feedbackEvents = 0;

  async persistFeedback(input: {
    source: 'web' | 'whatsapp';
    externalEventId: string;
  }): Promise<{ created: boolean }> {
    const key = `${input.source}:${input.externalEventId}`;
    if (this.seen.has(key)) {
      return { created: false };
    }

    this.seen.add(key);
    this.feedbackEvents += 1;
    return { created: true };
  }
}

class E2ELlm {
  async buildAssistantReply(input: {
    intent: string;
    userText: string;
  }): Promise<string> {
    if (input.intent === 'store_info') {
      const normalizedText = input.userText.toLowerCase();
      if (
        normalizedText.includes('horario') ||
        normalizedText.includes('abren') ||
        normalizedText.includes('feriado')
      ) {
        return 'Nuestros horarios son: Lunes a viernes 10:00 a 19:00 hs, Sabados 10:00 a 17:00 hs y Domingos cerrado. En feriados o fechas especiales el horario puede variar, valida en web/redes oficiales.';
      }
    }

    if (input.userText.toLowerCase().includes('forzar tecnico')) {
      return 'No tenemos ese dato en el contexto. La API devolvio JSON invalido por timeout.';
    }

    return 'Respuesta e2e';
  }
}

describe('WF1 API (e2e)', () => {
  let app: INestApplication;
  let httpApp: unknown;
  let e2eRepo: E2ERepository;
  let e2eFeedbackRepo: E2EFeedbackRepository;

  beforeAll(async () => {
    const moduleBuilder = Test.createTestingModule({
      imports: [AppModule],
    });

    e2eRepo = new E2ERepository();
    moduleBuilder.overrideProvider(PgChatRepository).useValue(e2eRepo);
    moduleBuilder.overrideProvider(PgIdempotencyRepository).useValue(e2eRepo);
    moduleBuilder.overrideProvider(PgAuditRepository).useValue(e2eRepo);
    e2eFeedbackRepo = new E2EFeedbackRepository();
    moduleBuilder.overrideProvider(PgChatFeedbackRepository).useValue(e2eFeedbackRepo);
    moduleBuilder.overrideProvider(IntentExtractorAdapter).useValue(new E2EIntent());
    moduleBuilder.overrideProvider(EntelequiaHttpAdapter).useValue(new E2EEntelequia());
    moduleBuilder.overrideProvider(EntelequiaOrderLookupClient).useValue(
      new E2EOrderLookupClient(),
    );
    moduleBuilder.overrideProvider(OpenAiAdapter).useValue(new E2ELlm());
    moduleBuilder.overrideProvider(ThrottlerGuard).useValue({
      canActivate: () => true,
    });

    const moduleRef = await moduleBuilder.compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    app.use(
      json({
        verify: (req: Request, _res: Response, buf: Buffer) => {
          (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
        },
      }),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: () => new BadRequestException('Payload invalido.'),
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.enableCors({
      origin: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-webhook-secret',
        'x-request-id',
        'x-turnstile-token',
        'x-user-id',
        'x-shadow-mode',
        'x-external-event-id',
        'x-idempotency-key',
        'x-hub-signature-256',
      ],
      exposedHeaders: ['x-request-id'],
      credentials: true,
    });
    await app.init();
    httpApp = app.getHttpAdapter().getInstance();
  });

  beforeEach(() => {
    const throttlerStorage = app.get<{ storage?: Map<string, unknown> }>(getStorageToken());
    throttlerStorage.storage?.clear();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects missing text with semantic validation message', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.ok).toBe(false);
        expect(body.message).toContain('Invalid message: text is required');
      });
  });

  it('returns health 200', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .get('/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
      });
  });

  it('exposes Prometheus metrics', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .get('/internal/metrics')
      .expect(200)
      .expect(({ text }) => {
        expect(text).toContain('wf1_messages_total');
        expect(text).toContain('wf1_response_latency_seconds');
      });
  });

  it('accepts chat feedback and supports idempotent replay', async () => {
    const payload = {
      source: 'web',
      conversationId: 'conv-feedback-1',
      responseId: '11111111-2222-4333-8444-555555555555',
      rating: 'up',
    };

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/feedback')
      .set('x-external-event-id', 'evt-feedback-1')
      .send(payload)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ ok: true });
      });

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/feedback')
      .set('x-external-event-id', 'evt-feedback-1')
      .send(payload)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ ok: true });
      });

    expect(e2eFeedbackRepo.feedbackEvents).toBe(1);
  });

  it('allows feedback preflight with x-user-id header', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .options('/wf1/chat/feedback')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'content-type,x-user-id,x-request-id,x-external-event-id',
      )
      .expect(204)
      .expect(({ headers }) => {
        const allowedHeaders = String(headers['access-control-allow-headers'] ?? '').toLowerCase();
        expect(allowedHeaders).toContain('x-user-id');
      });
  });

  it('accepts web requests without webhook secret header', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'hola, como va?',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.conversationId).toBe('conv-1');
        expect(typeof body.responseId).toBe('string');
      });
  });

  it('returns 401 with SECURITY prefix for unknown source', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .send({
        source: 'mobile',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'hola',
      })
      .expect(401)
      .expect(({ body }) => {
        expect(body.ok).toBe(false);
        expect(body.message).toContain(
          'SECURITY: Unknown source: "mobile". Must be \'web\' or \'whatsapp\'',
        );
      });
  });

  it('asks SI/NO when guest order intent lacks complete lookup payload', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-order-1')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'quiero saber mi pedido',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(false);
        expect(body.message).toContain('Responde SI o NO');
      });
  });

  it('returns requiresAuth when guest answers NO after order-data question', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-order-no-1')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-order-no-1',
        text: 'quiero saber mi pedido',
      })
      .expect(200);

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-order-no-2')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-order-no-1',
        text: 'no',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(false);
        expect(body.requiresAuth).toBe(true);
        expect(body.message).toContain('NECESITAS INICIAR SESION');
      });
  });

  it('continues lookup flow after SI and resolves with payload', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-order-yes-1')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-order-yes-1',
        text: 'quiero saber mi pedido',
      })
      .expect(200);

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-order-yes-2')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-order-yes-1',
        text: 'si',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(false);
        expect(body.message).toContain('enviame todo en un solo mensaje');
      });

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-order-yes-3')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-order-yes-1',
        text: 'pedido 12345, dni 12345678, telefono +54 11 4444 5555',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.conversationId).toBe('conv-order-yes-1');
        expect(body.intent).toBe('orders');
        expect(body.message).toContain('PEDIDO #12345');
      });
  });

  it('prevents guest order-flow hijack when weak ack is mixed with product query', async () => {
    const conversationId = 'conv-order-hijack-1';

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-order-hijack-1')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId,
        text: 'quiero saber mi pedido',
      })
      .expect(200);

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-order-hijack-2')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId,
        text: 'dale, tenes el nro 1 de evangelion?',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.message).not.toContain('consultar tu pedido sin iniciar sesion');
        expect(body.message).not.toContain('No pudimos procesar tu mensaje');
      });
  });

  it('returns deterministic lookup response for guest order with id + 2 factors', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-order-guest-lookup-1')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'pedido 12345, dni 12345678, telefono +54 11 4444 5555',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.conversationId).toBe('conv-1');
        expect(body.intent).toBe('orders');
        expect(body.message).toContain('PEDIDO #12345');
      });
  });

  it('returns success contract for authenticated order intent', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-order-auth-1')
      .set('Authorization', 'Bearer fake-access-token')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'quiero saber mi pedido',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.conversationId).toBe('conv-1');
        expect(typeof body.message).toBe('string');
        expect(body.message).toBe('Respuesta e2e');
      });
  });

  it('resolves access token from Authorization header', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-order-auth-header-1')
      .set('Authorization', 'Bearer fake-access-token-from-header')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'quiero saber mi pedido',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.conversationId).toBe('conv-1');
        expect(typeof body.message).toBe('string');
        expect(body.message).toBe('Respuesta e2e');
      });
  });

  it('rejects malformed Authorization header with 401', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('Authorization', 'Token malformed')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'quiero saber mi pedido',
      })
      .expect(401)
      .expect(({ body }) => {
        expect(body.ok).toBe(false);
        expect(body.message).toContain('Firma o credenciales invalidas.');
      });
  });

  it('rejects body accessToken for public intent with 400', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'quiero ver productos',
        accessToken: 'body-token',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.ok).toBe(false);
        expect(body.message).toContain(
          'Invalid accessToken: use Authorization header only',
        );
      });
  });

  it('rejects body accessToken for protected intent even when header is present', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('Authorization', 'Bearer header-token')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'quiero saber mi pedido',
        accessToken: 'body-token',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.ok).toBe(false);
        expect(body.message).toContain(
          'Invalid accessToken: use Authorization header only',
        );
      });
  });

  it('rejects text longer than 4096 characters with semantic validation message', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'a'.repeat(4097),
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.ok).toBe(false);
        expect(body.message).toContain(
          'Invalid message: message exceeds maximum length',
        );
      });
  });

  it('rejects non-string text with semantic validation message', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 1,
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.ok).toBe(false);
        expect(body.message).toContain('Invalid message: must be a string');
      });
  });

  it('returns 422 for invalid /api/v1/chat/intent payload', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/api/v1/chat/intent')
      .send({})
      .expect(422)
      .expect(({ body }) => {
        expect(body.ok).toBe(false);
        expect(body.message).toContain('Payload invalido');
      });
  });

  it('returns intent shape for /api/v1/chat/intent', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/api/v1/chat/intent')
      .send({
        text: 'quiero saber mi pedido',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.intent).toBe('orders');
        expect(body.confidence).toBeGreaterThan(0);
        expect(Array.isArray(body.entities)).toBe(true);
      });
  });

  it('returns success contract for product query', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-product-1')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'busco libros de ciencia',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.conversationId).toBe('conv-1');
        expect(typeof body.message).toBe('string');
      });
  });

  it('answers cheapest price deterministically from previous ui catalog snapshot', async () => {
    const conversationId = 'conv-price-followup-e2e-1';

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-price-followup-1')
      .send({
        source: 'web',
        userId: 'user-price',
        conversationId,
        text: 'mostrame evangelion',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.ui?.cards?.length).toBeGreaterThan(0);
      });

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-price-followup-2')
      .send({
        source: 'web',
        userId: 'user-price',
        conversationId,
        text: 'cual es el mas barato de los que sugeriste?',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.message).toContain('Evangelion tomo 1');
        expect(body.message).toContain('$5000 ARS');
        expect(body.message).not.toBe('Respuesta e2e');
      });
  });

  it('returns success for whatsapp source and persists turn with whatsapp channel', async () => {
    const payload = {
      source: 'whatsapp',
      userId: 'wa-user-1',
      conversationId: 'conv-wa-1',
      text: 'hola desde whatsapp',
    };
    const rawBody = JSON.stringify(payload);
    const whatsappSignature = `sha256=${createHmac(
      'sha256',
      process.env.WHATSAPP_SECRET ?? '',
    )
      .update(rawBody)
      .digest('hex')}`;

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-whatsapp-1')
      .set('x-hub-signature-256', whatsappSignature)
      .set('Content-Type', 'application/json')
      .send(rawBody)
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.conversationId).toBe('conv-wa-1');
        expect(typeof body.message).toBe('string');
      });

    expect(e2eRepo.turns).toContainEqual({
      source: 'whatsapp',
      conversationId: 'conv-wa-1',
      externalEventId: 'e2e-whatsapp-1',
    });
  });

  it('returns success contract for payment/shipping query', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-payment-shipping-1')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: '¿Cuanto tarda en llegar?',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.conversationId).toBe('conv-1');
        expect(typeof body.message).toBe('string');
      });
  });

  it('returns success contract for recommendations query', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-recommendations-1')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-recommendations-1',
        text: 'recomendame mangas',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(typeof body.ok).toBe('boolean');
        expect(typeof body.message).toBe('string');
        expect(body.message).not.toContain('No pudimos procesar tu mensaje');
      });
  });

  it('supports multi-turn recommendations disambiguation flow', async () => {
    const conversationId = 'conv-rec-flow-e2e-1';

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-rec-flow-1')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId,
        text: 'quiero one piece',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(false);
        expect(body.message).toContain('decime que tipo te interesa');
      });

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-rec-flow-2')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId,
        text: 'mangas',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(false);
        expect(body.message).toContain('tomo/numero especifico');
      });

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-rec-flow-3')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId,
        text: 'tomo 1',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.message).toBe('Respuesta e2e');
      });
  });

  it('keeps franchise recommendations resilient for evangelion and naruto', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-rec-evangelion-1')
      .send({
        source: 'web',
        userId: 'user-ev',
        conversationId: 'conv-rec-ev',
        text: 'quiero un regalo de envangelion',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.message).toBe('Respuesta e2e');
      });

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-rec-naruto-1')
      .send({
        source: 'web',
        userId: 'user-naruto',
        conversationId: 'conv-rec-naruto',
        text: 'algo de naruto tienen?',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.message).toBe('Respuesta e2e');
      });
  });

  it('sanitizes technical jargon before returning final user message', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-sanitize-1')
      .send({
        source: 'web',
        userId: 'user-sanitize',
        conversationId: 'conv-sanitize',
        text: 'forzar tecnico evangelion',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.message.toLowerCase()).not.toContain('contexto');
        expect(body.message.toLowerCase()).not.toContain('api');
        expect(body.message.toLowerCase()).not.toContain('json');
        expect(body.message.toLowerCase()).not.toContain('timeout');
      });
  });

  it('returns success contract for tickets query', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-tickets-1')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'tengo un reclamo porque llego roto',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.conversationId).toBe('conv-1');
        expect(typeof body.message).toBe('string');
      });
  });

  it('returns success contract for store_info query', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-store-info-1')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'donde queda el local?',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.conversationId).toBe('conv-1');
        expect(typeof body.message).toBe('string');
      });
  });

  it('returns exact weekly schedule for store_info hours query', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-store-info-hours-1')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'Que horario tienen? Abren feriados?',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.message).toContain('Lunes a viernes 10:00 a 19:00 hs');
        expect(body.message).toContain('Sabados 10:00 a 17:00 hs');
        expect(body.message).toContain('feriados');
      });
  });

  it('returns success contract for general query', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-external-event-id', 'e2e-general-1')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'hola, gracias',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.conversationId).toBe('conv-1');
        expect(typeof body.message).toBe('string');
      });
  });

  it('uses deterministic payload hash for duplicate detection when idempotency header is missing', async () => {
    const throttlerStorage = app.get<{ storage?: Map<string, unknown> }>(getStorageToken());
    throttlerStorage.storage?.clear();

    const payload = {
      source: 'web',
      userId: 'user-2',
      conversationId: 'conv-2',
      text: 'busco mangas',
    };

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-forwarded-for', '203.0.113.201')
      .send(payload)
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
      });

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-forwarded-for', '203.0.113.201')
      .send(payload)
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.message).toBe('Respuesta e2e');
      });
  });
});

const RECOMMENDATION_FRANCHISE_HINTS = ['one piece', 'naruto', 'evangelion', 'dragon ball'];

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
    const slug = `${input.slugPrefix}-tomo-${volume}`;
    return {
      id: `${input.slugPrefix}-${volume}`,
      slug,
      title: `${input.franchiseLabel} tomo ${volume}`,
      stock: 5,
      categoryName: input.categoryName,
      categorySlug: input.categorySlug,
      url: `https://entelequia.com.ar/producto/${slug}`,
      imageUrl: `https://entelequia.com.ar/images/${input.slugPrefix}-${volume}.jpg`,
      price: {
        amount: 4000 + volume * 1000,
        currency: 'ARS',
      },
    };
  });
}
