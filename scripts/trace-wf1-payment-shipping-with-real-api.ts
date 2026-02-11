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

interface QueryTraceResult {
  query: string;
  queryType: string | null;
  paymentMethods: string[];
  promotions: string[];
  apiFallback: boolean | null;
  aiContextPreview: string | null;
  error: string | null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
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

  const baseUrl = (configService.get<string>('ENTELEQUIA_API_BASE_URL') ?? '').replace(/\/$/, '');

  const queries = [
    '¿Que medios de pago tienen?',
    '¿Cuanto sale el envio?',
    '¿Cuanto tarda en llegar?',
    '¿Puedo retirar sin cargo?',
    '¿Tienen cuotas con Mercado Pago?',
    'Me lo mandan al interior, ¿como funciona?',
  ];

  const results: QueryTraceResult[] = [];
  for (const query of queries) {
    try {
      const contextBlocks = await enrichContextByIntent.execute({
        intentResult: {
          intent: 'payment_shipping',
          confidence: 1,
          entities: [],
        },
        text: query,
      });

      const block = contextBlocks[0];
      const payload = (block?.contextPayload ?? {}) as Record<string, unknown>;
      const aiContext =
        typeof payload.aiContext === 'string' && payload.aiContext.trim().length > 0
          ? payload.aiContext
          : null;

      results.push({
        query,
        queryType: typeof payload.queryType === 'string' ? payload.queryType : null,
        paymentMethods: toStringArray(payload.paymentMethods),
        promotions: toStringArray(payload.promotions),
        apiFallback: typeof payload.apiFallback === 'boolean' ? payload.apiFallback : null,
        aiContextPreview: aiContext ? aiContext.slice(0, 400) : null,
        error: null,
      });
    } catch (error: unknown) {
      results.push({
        query,
        queryType: null,
        paymentMethods: [],
        promotions: [],
        apiFallback: null,
        aiContextPreview: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apiBaseUrl: baseUrl,
    results,
  };

  const outDir = 'docs/reports/local';
  const outPath = `${outDir}/payment-shipping-trace-summary.json`;
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
