import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

process.env.CHATBOT_DB_URL = 'postgres://test:test@localhost:5432/chatbot';
process.env.ENTELEQUIA_API_BASE_URL = 'http://127.0.0.1:8000/api/v1';
process.env.WEBHOOK_SECRET = 'test-secret';

import { AppModule } from '../src/app.module';
import { EntelequiaHttpAdapter } from '../src/modules/wf1/infrastructure/adapters/entelequia-http.adapter';
import { IntentExtractorAdapter } from '../src/modules/wf1/infrastructure/adapters/intent-extractor.adapter';
import { OpenAiAdapter } from '../src/modules/wf1/infrastructure/adapters/openai.adapter';
import { PgAuditRepository } from '../src/modules/wf1/infrastructure/repositories/pg-audit.repository';
import { PgChatRepository } from '../src/modules/wf1/infrastructure/repositories/pg-chat.repository';
import { PgIdempotencyRepository } from '../src/modules/wf1/infrastructure/repositories/pg-idempotency.repository';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

class E2ERepository {
  private readonly seen = new Set<string>();

  async onModuleInit(): Promise<void> {}

  async onModuleDestroy(): Promise<void> {}

  async upsertUser(): Promise<{ id: string; email: string; phone: string; name: string; createdAt: string; updatedAt: string }> {
    return { id: '', email: '', phone: '', name: 'Customer', createdAt: '', updatedAt: '' };
  }

  async upsertConversation(): Promise<void> {}

  async getConversationHistory(): Promise<Array<{ sender: 'user'; content: string; createdAt: string }>> {
    return [];
  }

  async getLastBotMessageByExternalEvent(input: {
    channel: 'web' | 'whatsapp';
    externalEventId: string;
    conversationId?: string;
  }): Promise<string | null> {
    const key = `${input.channel}:${input.externalEventId}`;
    if (this.seen.has(key)) {
      return 'Respuesta e2e';
    }
    return null;
  }

  async persistTurn(): Promise<void> {}

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
}

class E2EIntent {
  async extractIntent(input: { text: string }): Promise<{
    intent: 'products' | 'orders';
    entities: string[];
    confidence: number;
  }> {
    if (input.text.toLowerCase().includes('pedido')) {
      return {
        intent: 'orders',
        entities: [],
        confidence: 0.9,
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
    return {
      contextType: 'payment_info',
      contextPayload: {},
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

class E2ELlm {
  async buildAssistantReply(): Promise<string> {
    return 'Respuesta e2e';
  }
}

describe('WF1 API (e2e)', () => {
  let app: INestApplication;
  let httpApp: unknown;

  beforeAll(async () => {
    const moduleBuilder = Test.createTestingModule({
      imports: [AppModule],
    });

    const e2eRepo = new E2ERepository();
    moduleBuilder.overrideProvider(PgChatRepository).useValue(e2eRepo);
    moduleBuilder.overrideProvider(PgIdempotencyRepository).useValue(e2eRepo);
    moduleBuilder.overrideProvider(PgAuditRepository).useValue(e2eRepo);
    moduleBuilder.overrideProvider(IntentExtractorAdapter).useValue(new E2EIntent());
    moduleBuilder.overrideProvider(EntelequiaHttpAdapter).useValue(new E2EEntelequia());
    moduleBuilder.overrideProvider(OpenAiAdapter).useValue(new E2ELlm());

    const moduleRef = await moduleBuilder.compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: () => new BadRequestException('Payload invalido.'),
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    httpApp = app.getHttpAdapter().getInstance();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects missing text with semantic validation message', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-webhook-secret', 'test-secret')
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

  it('returns 401 with SECURITY prefix when web secret is missing', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .send({
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'hola',
      })
      .expect(401)
      .expect(({ body }) => {
        expect(body.ok).toBe(false);
        expect(body.message).toContain(
          'SECURITY: Missing web webhook secret header (x-webhook-secret)',
        );
      });
  });

  it('returns 401 with SECURITY prefix for unknown source', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-webhook-secret', 'test-secret')
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

  it('returns requiresAuth for guest order intent', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-webhook-secret', 'test-secret')
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
        expect(body.requiresAuth).toBe(true);
      });
  });

  it('rejects text longer than 4096 characters with semantic validation message', async () => {
    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-webhook-secret', 'test-secret')
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
      .set('x-webhook-secret', 'test-secret')
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
      .set('x-webhook-secret', 'test-secret')
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

  it('uses deterministic payload hash for duplicate detection when idempotency header is missing', async () => {
    const payload = {
      source: 'web',
      userId: 'user-2',
      conversationId: 'conv-2',
      text: 'busco mangas',
    };

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-webhook-secret', 'test-secret')
      .send(payload)
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
      });

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .set('x-webhook-secret', 'test-secret')
      .send(payload)
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.message).toBe('Respuesta e2e');
      });
  });
});
