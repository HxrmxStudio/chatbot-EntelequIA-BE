import { mkdir, writeFile } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../src/common/config/env.validation';
import { EnrichContextByIntentUseCase } from '../src/modules/wf1/application/use-cases/enrich-context-by-intent';
import {
  ENTELEQUIA_CONTEXT_PORT,
  PROMPT_TEMPLATES_PORT,
} from '../src/modules/wf1/application/ports/tokens';
import type { ContextType } from '../src/modules/wf1/domain/context-block';
import type { Sentiment } from '../src/modules/wf1/domain/output-validation';
import { EntelequiaHttpAdapter } from '../src/modules/wf1/infrastructure/adapters/entelequia-http';
import { PromptTemplatesAdapter } from '../src/modules/wf1/infrastructure/adapters/prompt-templates';

interface TraceInput {
  query: string;
  intent: 'tickets' | 'store_info' | 'general';
  entities: string[];
  sentiment?: Sentiment;
}

interface TraceResult {
  query: string;
  intent: ContextType;
  resolvedSubtype: string | null;
  priority: string | null;
  requiresHumanEscalation: boolean | null;
  aiContextPreview: string;
  error: string | null;
}

function previewText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (trimmed.length <= 260) {
    return trimmed;
  }
  return `${trimmed.slice(0, 260)}...`;
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

  const enrichContextByIntent = moduleRef.get(EnrichContextByIntentUseCase);

  const inputs: TraceInput[] = [
    {
      query: 'Tengo un reclamo urgente, el pedido llego roto',
      intent: 'tickets',
      entities: ['reclamo urgente'],
      sentiment: 'negative',
    },
    {
      query: 'Cual es la direccion del local de belgrano?',
      intent: 'store_info',
      entities: [],
    },
    {
      query: 'A que hora abren los sabados?',
      intent: 'store_info',
      entities: [],
    },
    {
      query: 'Hola, me ayudas?',
      intent: 'general',
      entities: [],
    },
  ];

  const results: TraceResult[] = [];

  for (const input of inputs) {
    try {
      const contextBlocks = await enrichContextByIntent.execute({
        intentResult: {
          intent: input.intent,
          confidence: 1,
          entities: input.entities,
        },
        text: input.query,
        sentiment: input.sentiment,
      });

      const block = contextBlocks[0];
      const payload = (block?.contextPayload ?? {}) as Record<string, unknown>;
      const resolvedSubtype =
        typeof payload.issueType === 'string'
          ? payload.issueType
          : typeof payload.infoRequested === 'string'
            ? payload.infoRequested
            : null;
      const priority = typeof payload.priority === 'string' ? payload.priority : null;
      const requiresHumanEscalation =
        typeof payload.requiresHumanEscalation === 'boolean'
          ? payload.requiresHumanEscalation
          : null;

      results.push({
        query: input.query,
        intent: block?.contextType ?? input.intent,
        resolvedSubtype,
        priority,
        requiresHumanEscalation,
        aiContextPreview: previewText(payload.aiContext),
        error: null,
      });
    } catch (error: unknown) {
      results.push({
        query: input.query,
        intent: input.intent,
        resolvedSubtype: null,
        priority: null,
        requiresHumanEscalation: null,
        aiContextPreview: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    results,
  };

  const outDir = 'docs/reports/local';
  const outPath = `${outDir}/ticket-store-general-trace-summary.json`;
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
