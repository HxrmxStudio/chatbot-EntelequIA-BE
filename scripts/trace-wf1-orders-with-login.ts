import { mkdir, writeFile } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validateEnv } from '../src/common/config/env.validation';
import { EnrichContextByIntentUseCase } from '../src/modules/wf1/application/use-cases/enrich-context-by-intent';
import {
  ENTELEQUIA_CONTEXT_PORT,
  PROMPT_TEMPLATES_PORT,
} from '../src/modules/wf1/application/ports/tokens';
import { EntelequiaHttpAdapter } from '../src/modules/wf1/infrastructure/adapters/entelequia-http';
import { PromptTemplatesAdapter } from '../src/modules/wf1/infrastructure/adapters/prompt-templates';
import { loginToEntelequia } from './_helpers/entelequia-login';

function resolveRequiredEnvString(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function summarizeOrdersPayload(payload: unknown): {
  orderCount: number;
  orderIds: Array<string | number>;
  orderIdDigits: Array<number>;
} {
  const root = payload as Record<string, unknown> | null;
  const list = root?.data;
  if (!Array.isArray(list)) {
    return { orderCount: 0, orderIds: [], orderIdDigits: [] };
  }

  const orderIds = list
    .map((row) => (row && typeof row === 'object' ? (row as Record<string, unknown>).id : undefined))
    .filter((id): id is string | number => typeof id === 'string' || typeof id === 'number');

  const orderIdDigits = orderIds.map((id) => String(id).replace(/\D/g, '').length);

  return { orderCount: list.length, orderIds, orderIdDigits };
}

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        validate: validateEnv,
      }),
    ],
    providers: [
      EnrichContextByIntentUseCase,
      EntelequiaHttpAdapter,
      PromptTemplatesAdapter,
      {
        provide: ENTELEQUIA_CONTEXT_PORT,
        useExisting: EntelequiaHttpAdapter,
      },
      {
        provide: PROMPT_TEMPLATES_PORT,
        useExisting: PromptTemplatesAdapter,
      },
    ],
  }).compile();

  const configService = moduleRef.get(ConfigService);
  const enrichContextByIntent = moduleRef.get(EnrichContextByIntentUseCase);

  const email = resolveRequiredEnvString('ENTELEQUIA_TEST_EMAIL');
  const password = resolveRequiredEnvString('ENTELEQUIA_TEST_PASSWORD');
  const baseUrlRaw = configService.get<string>('ENTELEQUIA_API_BASE_URL') ?? '';
  const baseUrl = baseUrlRaw.replace(/\/$/, '');
  const timeoutMs = configService.get<number>('ENTELEQUIA_API_TIMEOUT_MS') ?? 8000;

  const { user, accessToken } = await loginToEntelequia({
    baseUrl,
    timeoutMs,
    email,
    password,
  });

  const ordersContext = await enrichContextByIntent.execute({
    intentResult: { intent: 'orders', confidence: 1, entities: [] },
    text: 'Quiero ver mis pedidos',
    accessToken,
  });

  const ordersBlock = ordersContext[0];
  const ordersSummary = summarizeOrdersPayload(ordersBlock?.contextPayload);
  const firstOrderId = ordersSummary.orderIds[0];

  const orderDetailContext =
    firstOrderId !== undefined
      ? await enrichContextByIntent.execute({
          intentResult: { intent: 'orders', confidence: 1, entities: [] },
          text: `pedido #${String(firstOrderId)}`,
          accessToken,
        })
      : null;

  const report = {
    generatedAt: new Date().toISOString(),
    entelequiaUser: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    orders: {
      orderCount: ordersSummary.orderCount,
      orderIds: ordersSummary.orderIds.slice(0, 10),
      orderIdDigits: ordersSummary.orderIdDigits,
    },
    orderDetailProbe: orderDetailContext
      ? {
          requestedOrderId: firstOrderId,
          returnedContextType: orderDetailContext[0]?.contextType ?? null,
        }
      : null,
  };

  const outDir = 'docs/reports/local';
  const outPath = `${outDir}/orders-trace-summary.json`;
  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  // eslint-disable-next-line no-console
  console.log(outPath);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
