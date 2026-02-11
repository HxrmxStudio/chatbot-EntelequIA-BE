import { mkdir, writeFile } from 'node:fs/promises';
import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { PG_POOL } from '@/modules/wf1/application/ports/tokens';
import { IntentExtractorAdapter } from '@/modules/wf1/infrastructure/adapters/intent-extractor';
import { OpenAiAdapter } from '@/modules/wf1/infrastructure/adapters/openai';
import { loginToEntelequia } from './_helpers/entelequia-login';

type ContextBlock = { contextType: string; contextPayload: unknown };

class ForcedOrdersIntentExtractor {
  async extractIntent(): Promise<{ intent: 'orders'; entities: string[]; confidence: number }> {
    return { intent: 'orders', entities: [], confidence: 0.9 };
  }
}

class TraceOrdersLlm {
  async buildAssistantReply(input: { contextBlocks: ContextBlock[] }): Promise<string> {
    const ordersBlock = input.contextBlocks.find((b) => b.contextType === 'orders');
    const payload = ordersBlock?.contextPayload as Record<string, unknown> | undefined;
    const data = payload?.data;
    const count = Array.isArray(data) ? data.length : null;
    return `[trace] orders_count=${count ?? 'unknown'}`;
  }
}

function resolveRequiredEnvString(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) {
    return '<invalid-email>';
  }

  const prefix = user.slice(0, 2);
  return `${prefix}***@${domain}`;
}

async function fetchAccountProfile(input: {
  baseUrl: string;
  timeoutMs: number;
  accessToken: string;
}): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(`${input.baseUrl.replace(/\/$/, '')}/account/profile`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${input.accessToken}`,
      },
      signal: controller.signal,
    });

    const body = (await response.json()) as unknown;
    if (!response.ok) {
      return null;
    }

    if (typeof body !== 'object' || body === null) {
      return null;
    }

    return body as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function resolveUserIdFromProfile(
  profile: Record<string, unknown> | null,
  loginUserId: string,
): string {
  const profileId =
    profile && typeof profile.id !== 'undefined' && profile.id !== null
      ? String(profile.id).trim()
      : '';
  if (profileId.length > 0) {
    return profileId;
  }

  return loginUserId;
}

async function safeSelectOne<T extends Record<string, unknown>>(
  pool: Pool,
  query: string,
  params: unknown[],
): Promise<T | null> {
  const result = await pool.query(query, params);
  return (result.rows[0] as T | undefined) ?? null;
}

async function bootstrapApp(): Promise<INestApplication> {
  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  // Avoid OpenAI usage for this trace: force orders intent + stub LLM output.
  moduleBuilder.overrideProvider(IntentExtractorAdapter).useValue(new ForcedOrdersIntentExtractor());
  moduleBuilder.overrideProvider(OpenAiAdapter).useValue(new TraceOrdersLlm());

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

  return app;
}

async function main(): Promise<void> {
  // For local traces we disable Turnstile so the FE-like request passes signature validation.
  process.env.TURNSTILE_SECRET_KEY = '';

  // Defaults for running the script without a fully-populated .env.
  process.env.CHATBOT_DB_URL = process.env.CHATBOT_DB_URL ?? 'postgres://test:test@localhost:5432/chatbot';
  process.env.ENTELEQUIA_API_BASE_URL = process.env.ENTELEQUIA_API_BASE_URL ?? 'https://entelequia.com.ar/api/v1';
  process.env.ENTELEQUIA_WEB_BASE_URL = process.env.ENTELEQUIA_WEB_BASE_URL ?? 'https://entelequia.com.ar';

  const email = resolveRequiredEnvString('ENTELEQUIA_TEST_EMAIL');
  const password = resolveRequiredEnvString('ENTELEQUIA_TEST_PASSWORD');
  const baseUrl = resolveRequiredEnvString('ENTELEQUIA_API_BASE_URL');
  const timeoutMs = Number(process.env.ENTELEQUIA_API_TIMEOUT_MS ?? 8000);

  const login = await loginToEntelequia({ baseUrl, timeoutMs, email, password });
  const profile = await fetchAccountProfile({
    baseUrl,
    timeoutMs,
    accessToken: login.accessToken,
  });

  const app = await bootstrapApp();

  const pool = app.get(PG_POOL) as Pool;
  const httpApp = app.getHttpAdapter().getInstance();

  const traceId = Date.now();
  const externalEventId = `trace-orders-db-${traceId}`;
  const conversationId = `trace-conv-${traceId}`;
  const userId = resolveUserIdFromProfile(profile, login.user.id);
  const text = 'Quiero ver mis pedidos';

  const response = await request(httpApp as Parameters<typeof request>[0])
    .post('/wf1/chat/message')
    .set('x-external-event-id', externalEventId)
    .set('Authorization', `Bearer ${login.accessToken}`)
    .send({
      source: 'web',
      userId,
      conversationId,
      text,
    })
    .expect(200);

  const externalEventRow = await safeSelectOne<{
    source: string;
    external_event_id: string;
    status: string;
    received_at: string;
    processed_at: string | null;
    error: string | null;
  }>(
    pool,
    `SELECT source, external_event_id, status, received_at::text, processed_at::text, error
     FROM external_events
     WHERE source = $1 AND external_event_id = $2`,
    ['web', externalEventId],
  );

  const userRow = await safeSelectOne<{ id: string; email: string | null; name: string | null }>(
    pool,
    `SELECT id, email, name
     FROM users
     WHERE id = $1`,
    [userId],
  );

  const conversationRow = await safeSelectOne<{ id: string; user_id: string; channel: string }>(
    pool,
    `SELECT id, user_id, channel
     FROM conversations
     WHERE id = $1`,
    [conversationId],
  );

  const messageRows = await pool.query<{
    sender: string;
    content: string;
    external_event_id: string | null;
    created_at: string;
    metadata: unknown;
  }>(
    `SELECT sender, content, external_event_id, created_at::text, metadata
     FROM messages
     WHERE conversation_id = $1 AND external_event_id = $2
     ORDER BY created_at ASC`,
    [conversationId, externalEventId],
  );

  const auditRow = await safeSelectOne<{
    intent: string;
    status: string;
    message: string;
    http_status: number;
    latency_ms: number;
    created_at: string;
  }>(
    pool,
    `SELECT intent, status, message, http_status, latency_ms, created_at::text
     FROM audit_logs
     WHERE user_id = $1 AND conversation_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, conversationId],
  );

  const report = {
    generatedAt: new Date().toISOString(),
    entelequiaLogin: {
      ok: true,
      user: {
        id: login.user.id,
        emailMasked: maskEmail(login.user.email),
      },
      accessToken: {
        length: login.accessToken.length,
      },
    },
    entelequiaProfile: profile,
    chatbotRequest: {
      endpoint: '/wf1/chat/message',
      source: 'web' as const,
      userId,
      conversationId,
      externalEventId,
      text,
      authorizationHeader: true,
      bodyAccessToken: false,
    },
    chatbotResponse: response.body,
    db: {
      externalEventRow,
      userRow,
      conversationRow,
      messages: {
        rowCount: messageRows.rowCount,
        rows: messageRows.rows.map((row) => ({
          sender: row.sender,
          content: row.content,
          createdAt: row.created_at,
          externalEventId: row.external_event_id,
          metadata: row.metadata,
        })),
      },
      auditRow,
    },
  };

  const outDir = 'docs/reports/local';
  const outPath = `${outDir}/orders-auth-db-trace-${traceId}.json`;
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
