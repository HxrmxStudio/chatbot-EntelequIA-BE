import { randomUUID } from 'node:crypto';
import { fetchWithTimeout } from '../src/modules/wf1/infrastructure/adapters/shared/http-client';
import {
  createAnalyticsPool,
  readStringEnv,
  writeLocalReport,
} from './_helpers/analytics';

type ChatResponse = {
  ok: boolean;
  message: string;
  conversationId?: string;
  intent?: string;
  requiresAuth?: boolean;
};

type MetricsSnapshot = {
  messagesTotal: number;
  fallbackTotal: number;
  stockExactDisclosureTotal: number;
};

const REQUEST_TIMEOUT_MS = 30_000;
const METRICS_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const baseUrl = readStringEnv('WF1_BASE_URL', 'http://localhost:3090').replace(/\/+$/, '');
  const turnstileToken = readOptionalEnv('WF1_SMOKE_TURNSTILE_TOKEN');
  const conversationId = `smoke-final-${Date.now()}`;
  const userId = `smoke-user-${Date.now()}`;

  ensureTurnstileCompatibility(turnstileToken);

  const metricsBefore = await fetchMetricsSnapshot(baseUrl);

  const question1 =
    'Hola, tienen manga Nro 1 de Attack on Titan? Si no, recomiendame la mejor alternativa.';
  const response1 = await sendWebMessage({
    baseUrl,
    requestId: `smoke-final-1-${randomUUID()}`,
    externalEventId: `smoke-final-evt-1-${Date.now()}`,
    turnstileToken,
    body: {
      source: 'web',
      userId,
      conversationId,
      text: question1,
    },
  });

  const question2 = 'Cuantas quedan exactamente del deluxe 01 de Attack on Titan?';
  const response2 = await sendWebMessage({
    baseUrl,
    requestId: `smoke-final-2-${randomUUID()}`,
    externalEventId: `smoke-final-evt-2-${Date.now()}`,
    turnstileToken,
    body: {
      source: 'web',
      userId,
      conversationId,
      text: question2,
    },
  });

  const metricsAfter = await fetchMetricsSnapshot(baseUrl);
  const dbSnapshot = await fetchDatabaseSnapshot(conversationId);

  const report = {
    generatedAt: new Date().toISOString(),
    environment: {
      baseUrl,
      usesWebhookSecretHeader: false,
      turnstileHeaderSent: Boolean(turnstileToken),
    },
    conversation: {
      conversationId,
      userId,
    },
    requests: [
      {
        step: 1,
        text: question1,
        response: response1,
      },
      {
        step: 2,
        text: question2,
        response: response2,
      },
    ],
    metrics: {
      before: metricsBefore,
      after: metricsAfter,
      delta: {
        messagesTotal: metricsAfter.messagesTotal - metricsBefore.messagesTotal,
        fallbackTotal: metricsAfter.fallbackTotal - metricsBefore.fallbackTotal,
        stockExactDisclosureTotal:
          metricsAfter.stockExactDisclosureTotal - metricsBefore.stockExactDisclosureTotal,
      },
    },
    database: dbSnapshot,
  };

  const reportPath = await writeLocalReport('smoke-wf1-final-stage', report);
  // eslint-disable-next-line no-console
  console.log(reportPath);
}

async function sendWebMessage(input: {
  baseUrl: string;
  requestId: string;
  externalEventId: string;
  turnstileToken?: string;
  body: {
    source: 'web';
    userId: string;
    conversationId: string;
    text: string;
  };
}): Promise<{
  status: number;
  json: ChatResponse | Record<string, unknown>;
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-request-id': input.requestId,
    'x-external-event-id': input.externalEventId,
  };

  if (input.turnstileToken) {
    headers['x-turnstile-token'] = input.turnstileToken;
  }

  const response = await fetchWithTimeout(
    `${input.baseUrl}/wf1/chat/message`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(input.body),
    },
    REQUEST_TIMEOUT_MS,
  );

  const payload = (await response.json().catch(() => ({}))) as
    | ChatResponse
    | Record<string, unknown>;

  return {
    status: response.status,
    json: payload,
  };
}

async function fetchMetricsSnapshot(baseUrl: string): Promise<MetricsSnapshot> {
  const response = await fetchWithTimeout(
    `${baseUrl}/internal/metrics`,
    { method: 'GET' },
    METRICS_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`Metrics endpoint failed with status ${response.status}`);
  }

  const text = await response.text();
  return {
    messagesTotal: sumMetric(text, 'wf1_messages_total'),
    fallbackTotal: sumMetric(text, 'wf1_fallback_total'),
    stockExactDisclosureTotal: sumMetric(text, 'wf1_stock_exact_disclosure_total'),
  };
}

function sumMetric(metricsText: string, metricName: string): number {
  let sum = 0;
  const lines = metricsText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.length === 0 ||
      trimmed.startsWith('#') ||
      !trimmed.startsWith(metricName)
    ) {
      continue;
    }

    const valueText = trimmed.split(' ').at(-1);
    const value = valueText ? Number(valueText) : Number.NaN;
    if (Number.isFinite(value)) {
      sum += value;
    }
  }

  return sum;
}

async function fetchDatabaseSnapshot(conversationId: string): Promise<{
  messagesBySender: { user: number; bot: number };
  outboxRowsForConversation: number;
  auditRowsForConversation: number;
  recentBotMetadata: Array<Record<string, unknown>>;
}> {
  const pool = createAnalyticsPool();

  try {
    const messagesBySenderResult = await pool.query<{
      sender: 'user' | 'bot';
      total: string;
    }>(
      `SELECT sender, COUNT(*)::text AS total
       FROM messages
       WHERE conversation_id = $1
       GROUP BY sender`,
      [conversationId],
    );

    const outboxResult = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM outbox_messages
       WHERE payload->>'conversationId' = $1`,
      [conversationId],
    );

    const auditResult = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM audit_logs
       WHERE conversation_id = $1`,
      [conversationId],
    );

    const metadataResult = await pool.query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata
       FROM messages
       WHERE conversation_id = $1
         AND sender = 'bot'
       ORDER BY created_at DESC
       LIMIT 2`,
      [conversationId],
    );

    const counters = {
      user: 0,
      bot: 0,
    };

    for (const row of messagesBySenderResult.rows) {
      counters[row.sender] = Number(row.total);
    }

    return {
      messagesBySender: counters,
      outboxRowsForConversation: Number(outboxResult.rows[0]?.total ?? 0),
      auditRowsForConversation: Number(auditResult.rows[0]?.total ?? 0),
      recentBotMetadata: metadataResult.rows
        .map((row) => row.metadata)
        .filter((value): value is Record<string, unknown> => value !== null),
    };
  } finally {
    await pool.end();
  }
}

function ensureTurnstileCompatibility(turnstileToken?: string): void {
  const turnstileSecret = readOptionalEnv('TURNSTILE_SECRET_KEY');
  if (!turnstileSecret) {
    return;
  }

  if (turnstileToken && turnstileToken.trim().length > 0) {
    return;
  }

  throw new Error(
    'TURNSTILE_SECRET_KEY is configured. Set WF1_SMOKE_TURNSTILE_TOKEN to run smoke without webhook secret.',
  );
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
