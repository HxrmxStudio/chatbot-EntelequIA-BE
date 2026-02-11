import { mkdir, writeFile } from 'node:fs/promises';
import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { IntentExtractorAdapter } from '@/modules/wf1/infrastructure/adapters/intent-extractor';
import { OpenAiAdapter } from '@/modules/wf1/infrastructure/adapters/openai';
import { PgAuditRepository } from '@/modules/wf1/infrastructure/repositories/pg-audit.repository';
import { PgChatRepository } from '@/modules/wf1/infrastructure/repositories/pg-chat.repository';
import { PgIdempotencyRepository } from '@/modules/wf1/infrastructure/repositories/pg-idempotency.repository';
import { loginToEntelequia } from './_helpers/entelequia-login';

type ContextBlock = { contextType: string; contextPayload: unknown };

class InMemoryRepository {
  private readonly seen = new Set<string>();

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
    const now = new Date().toISOString();
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
    const now = new Date().toISOString();
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

  async getLastBotMessageByExternalEvent(input: { channel: 'web' | 'whatsapp'; externalEventId: string }): Promise<string | null> {
    const key = `${input.channel}:${input.externalEventId}`;
    return this.seen.has(key) ? 'Respuesta previa' : null;
  }

  async persistTurn(): Promise<void> {}

  async startProcessing(input: { source: 'web' | 'whatsapp'; externalEventId: string }): Promise<{ isDuplicate: boolean }> {
    const key = `${input.source}:${input.externalEventId}`;
    if (this.seen.has(key)) return { isDuplicate: true };
    this.seen.add(key);
    return { isDuplicate: false };
  }

  async markProcessed(): Promise<void> {}
  async markFailed(): Promise<void> {}
  async writeAudit(): Promise<void> {}
}

class ForcedOrdersIntent {
  async extractIntent(): Promise<{ intent: 'orders'; entities: string[]; confidence: number }> {
    return { intent: 'orders', entities: [], confidence: 0.9 };
  }
}

class TraceLlm {
  async buildAssistantReply(input: { contextBlocks: ContextBlock[] }): Promise<string> {
    const ordersBlock = input.contextBlocks.find((b) => b.contextType === 'orders');
    const data = (ordersBlock?.contextPayload as Record<string, unknown> | undefined)?.data;
    const count = Array.isArray(data) ? data.length : null;
    return `[trace] orders_count=${count ?? 'unknown'}`;
  }
}

function resolveRequiredEnvString(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  // Ensure the security guard does not require Turnstile for this local trace.
  process.env.TURNSTILE_SECRET_KEY = '';
  process.env.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? 'trace-secret';
  process.env.CHATBOT_DB_URL = process.env.CHATBOT_DB_URL ?? 'postgres://test:test@localhost:5432/chatbot';
  process.env.ENTELEQUIA_API_BASE_URL = process.env.ENTELEQUIA_API_BASE_URL ?? 'https://entelequia.com.ar/api/v1';
  process.env.ENTELEQUIA_WEB_BASE_URL = process.env.ENTELEQUIA_WEB_BASE_URL ?? 'https://entelequia.com.ar';

  const email = resolveRequiredEnvString('ENTELEQUIA_TEST_EMAIL');
  const password = resolveRequiredEnvString('ENTELEQUIA_TEST_PASSWORD');
  const baseUrl = resolveRequiredEnvString('ENTELEQUIA_API_BASE_URL');
  const timeoutMs = Number(process.env.ENTELEQUIA_API_TIMEOUT_MS ?? 8000);

  const login = await loginToEntelequia({ baseUrl, timeoutMs, email, password });

  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  const inMemory = new InMemoryRepository();
  moduleBuilder.overrideProvider(PgChatRepository).useValue(inMemory);
  moduleBuilder.overrideProvider(PgIdempotencyRepository).useValue(inMemory);
  moduleBuilder.overrideProvider(PgAuditRepository).useValue(inMemory);
  moduleBuilder.overrideProvider(IntentExtractorAdapter).useValue(new ForcedOrdersIntent());
  moduleBuilder.overrideProvider(OpenAiAdapter).useValue(new TraceLlm());

  const moduleRef = await moduleBuilder.compile();

  const app: INestApplication = moduleRef.createNestApplication();
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

  const httpApp = app.getHttpAdapter().getInstance();
  const externalEventId = `trace-orders-${Date.now()}`;
  const conversationId = `trace-conv-${Date.now()}`;
  const userId = login.user.email || `trace-user-${Date.now()}`;

  const response = await request(httpApp as Parameters<typeof request>[0])
    .post('/wf1/chat/message')
    .set('x-webhook-secret', process.env.WEBHOOK_SECRET)
    .set('x-external-event-id', externalEventId)
    .set('Authorization', `Bearer ${login.accessToken}`)
    .send({
      source: 'web',
      userId,
      conversationId,
      text: 'Quiero ver mis pedidos',
    })
    .expect(200);

  const report = {
    generatedAt: new Date().toISOString(),
    externalEventId,
    conversationId,
    entelequiaUser: {
      id: login.user.id,
      email: login.user.email,
      name: login.user.name,
    },
    chatbotResponse: response.body,
  };

  const outDir = 'docs/reports/local';
  const outPath = `${outDir}/orders-chat-trace-summary.json`;
  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  await app.close();

  // eslint-disable-next-line no-console
  console.log(outPath);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
