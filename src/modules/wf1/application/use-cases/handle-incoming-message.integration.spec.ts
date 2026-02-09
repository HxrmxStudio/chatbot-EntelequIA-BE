import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  AUDIT_PORT,
  CHAT_PERSISTENCE_PORT,
  ENTELEQUIA_CONTEXT_PORT,
  IDEMPOTENCY_PORT,
  INTENT_EXTRACTOR_PORT,
  LLM_PORT,
} from '../ports/tokens';
import { EntelequiaApiError } from '../ports/entelequia-context.port';
import type { AuditEntryInput } from '../ports/audit.port';
import type { PersistTurnInput } from '../ports/chat-persistence.port';
import { TextSanitizer } from '../../infrastructure/security/text-sanitizer';
import { EnrichContextByIntentUseCase } from './enrich-context-by-intent.use-case';
import { HandleIncomingMessageUseCase } from './handle-incoming-message.use-case';

class InMemoryPersistence {
  public turns: PersistTurnInput[] = [];
  private botByEvent = new Map<string, string>();

  async upsertUser(): Promise<void> {}

  async upsertConversation(): Promise<void> {}

  async getConversationHistory(): Promise<Array<{ sender: 'user'; content: string; createdAt: string }>> {
    return [];
  }

  async getLastBotMessageByExternalEvent(input: {
    channel: 'web' | 'whatsapp';
    externalEventId: string;
    conversationId: string;
  }): Promise<string | null> {
    const key = `${input.channel}:${input.externalEventId}:${input.conversationId}`;
    return this.botByEvent.get(key) ?? null;
  }

  async persistTurn(input: PersistTurnInput): Promise<void> {
    this.turns.push(input);
    const key = `${input.source}:${input.externalEventId}:${input.conversationId}`;
    this.botByEvent.set(key, input.botMessage);
  }
}

class InMemoryIdempotency {
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

  async markProcessed(): Promise<void> {}

  async markFailed(): Promise<void> {}
}

class InMemoryAudit {
  public entries: AuditEntryInput[] = [];

  async writeAudit(input: AuditEntryInput): Promise<void> {
    this.entries.push(input);
  }
}

class StubIntentExtractor {
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
      entities: [input.text],
      confidence: 0.8,
    };
  }
}

class StubLlm {
  async buildAssistantReply(): Promise<string> {
    return 'Respuesta de prueba';
  }
}

class StubEntelequia {
  public mode: 'ok' | 'order-not-owned' = 'ok';

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
      contextPayload: { payment_methods: [] },
    };
  }

  async getOrders(): Promise<{ contextType: 'orders'; contextPayload: Record<string, unknown> }> {
    if (this.mode === 'order-not-owned') {
      throw new EntelequiaApiError('Order mismatch', 442, 'http');
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

describe('HandleIncomingMessageUseCase (integration)', () => {
  let useCase: HandleIncomingMessageUseCase;
  let persistence: InMemoryPersistence;
  let idempotency: InMemoryIdempotency;
  let audit: InMemoryAudit;
  let entelequia: StubEntelequia;

  beforeEach(async () => {
    persistence = new InMemoryPersistence();
    idempotency = new InMemoryIdempotency();
    audit = new InMemoryAudit();
    entelequia = new StubEntelequia();

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
        { provide: LLM_PORT, useClass: StubLlm },
        { provide: CHAT_PERSISTENCE_PORT, useValue: persistence },
        { provide: IDEMPOTENCY_PORT, useValue: idempotency },
        { provide: AUDIT_PORT, useValue: audit },
        { provide: ENTELEQUIA_CONTEXT_PORT, useValue: entelequia },
      ],
    }).compile();

    useCase = moduleRef.get(HandleIncomingMessageUseCase);
  });

  it('returns requiresAuth when guest asks for orders', async () => {
    const response = await useCase.execute({
      requestId: 'req-1',
      externalEventId: 'event-1',
      payload: {
        source: 'web',
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'donde esta mi pedido?',
      },
    });

    expect(response.ok).toBe(false);
    expect('requiresAuth' in response && response.requiresAuth).toBe(true);
    expect(persistence.turns).toHaveLength(1);
    expect(audit.entries).toHaveLength(1);
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
    });

    expect(response.ok).toBe(false);
    expect(response.message).toContain('No encontramos ese pedido en tu cuenta');
  });
});
