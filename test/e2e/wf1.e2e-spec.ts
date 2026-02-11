import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { json } from 'express';
import type { Request, Response } from 'express';

process.env.CHATBOT_DB_URL = 'postgres://test:test@localhost:5432/chatbot';
process.env.ENTELEQUIA_API_BASE_URL = 'http://127.0.0.1:8000/api/v1';
process.env.TURNSTILE_SECRET_KEY = '';
process.env.WHATSAPP_SECRET = 'test-whatsapp-secret';

import { AppModule } from '@/app.module';
import { EntelequiaHttpAdapter } from '@/modules/wf1/infrastructure/adapters/entelequia-http';
import { IntentExtractorAdapter } from '@/modules/wf1/infrastructure/adapters/intent-extractor';
import { OpenAiAdapter } from '@/modules/wf1/infrastructure/adapters/openai';
import { PgAuditRepository } from '@/modules/wf1/infrastructure/repositories/pg-audit.repository';
import { PgChatRepository } from '@/modules/wf1/infrastructure/repositories/pg-chat.repository';
import { PgIdempotencyRepository } from '@/modules/wf1/infrastructure/repositories/pg-idempotency.repository';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

class E2ERepository {
  private readonly seen = new Set<string>();
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
    if (this.seen.has(key)) {
      return 'Respuesta e2e';
    }
    return null;
  }

  async persistTurn(input: {
    source: 'web' | 'whatsapp';
    conversationId: string;
    externalEventId: string;
  }): Promise<void> {
    this.turns.push({
      source: input.source,
      conversationId: input.conversationId,
      externalEventId: input.externalEventId,
    });
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

class E2ELlm {
  async buildAssistantReply(): Promise<string> {
    return 'Respuesta e2e';
  }
}

describe('WF1 API (e2e)', () => {
  let app: INestApplication;
  let httpApp: unknown;
  let e2eRepo: E2ERepository;

  beforeAll(async () => {
    const moduleBuilder = Test.createTestingModule({
      imports: [AppModule],
    });

    e2eRepo = new E2ERepository();
    moduleBuilder.overrideProvider(PgChatRepository).useValue(e2eRepo);
    moduleBuilder.overrideProvider(PgIdempotencyRepository).useValue(e2eRepo);
    moduleBuilder.overrideProvider(PgAuditRepository).useValue(e2eRepo);
    moduleBuilder.overrideProvider(IntentExtractorAdapter).useValue(new E2EIntent());
    moduleBuilder.overrideProvider(EntelequiaHttpAdapter).useValue(new E2EEntelequia());
    moduleBuilder.overrideProvider(OpenAiAdapter).useValue(new E2ELlm());

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

  it('returns requiresAuth for guest order intent', async () => {
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
        expect(body.requiresAuth).toBe(true);
        expect(body.message).toContain('NECESITAS INICIAR SESION');
        expect(body.message).toContain('Inicia sesion en entelequia.com.ar');
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
        conversationId: 'conv-1',
        text: 'recomendame mangas',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.conversationId).toBe('conv-1');
        expect(typeof body.message).toBe('string');
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
    const payload = {
      source: 'web',
      userId: 'user-2',
      conversationId: 'conv-2',
      text: 'busco mangas',
    };

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .send(payload)
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
      });

    await request(httpApp as Parameters<typeof request>[0])
      .post('/wf1/chat/message')
      .send(payload)
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.message).toBe('Respuesta e2e');
      });
  });
});
