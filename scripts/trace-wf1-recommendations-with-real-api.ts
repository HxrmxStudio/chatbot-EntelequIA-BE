import { mkdir, writeFile } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validateEnv } from '../src/common/config/env.validation';
import { EnrichContextByIntentUseCase } from '../src/modules/wf1/application/use-cases/enrich-context-by-intent';
import {
  ENTELEQUIA_CONTEXT_PORT,
  PROMPT_TEMPLATES_PORT,
} from '../src/modules/wf1/application/ports/tokens';
import { getDefaultCategorySlug } from '../src/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers';
import { EntelequiaHttpAdapter } from '../src/modules/wf1/infrastructure/adapters/entelequia-http';
import { PromptTemplatesAdapter } from '../src/modules/wf1/infrastructure/adapters/prompt-templates';

interface PreferencesReport {
  genre: string[];
  type: string[];
  age: number | null;
}

interface QueryTraceResult {
  query: string;
  preferencesResolved: PreferencesReport;
  detectedRecommendationTypes: string[];
  resolvedCategorySlugs: string[];
  totalFromApi: number | null;
  afterStockFilter: number | null;
  afterTypeFilter: number | null;
  shown: number | null;
  apiFallback: boolean | null;
  fallbackReason: string | null;
  titlesPreview: string[];
  error: string | null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function toPreferences(value: unknown): PreferencesReport {
  if (typeof value !== 'object' || value === null) {
    return { genre: [], type: [], age: null };
  }

  const record = value as Record<string, unknown>;
  const age =
    typeof record.age === 'number' && Number.isFinite(record.age) ? record.age : null;

  return {
    genre: toStringArray(record.genre),
    type: toStringArray(record.type),
    age,
  };
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
    'Recomendame mangas de accion',
    'Quiero sugerencias de juegos de rol',
    'Busco algo de terror para 15 anos',
    'Tenes recomendaciones de remeras de anime?',
    'Sugerime algo para arrancar',
  ];

  const results: QueryTraceResult[] = [];

  for (const query of queries) {
    try {
      const contextBlocks = await enrichContextByIntent.execute({
        intentResult: {
          intent: 'recommendations',
          confidence: 1,
          entities: [],
        },
        text: query,
      });

      const block = contextBlocks[0];
      const payload = (block?.contextPayload ?? {}) as Record<string, unknown>;
      const products = Array.isArray(payload.products)
        ? payload.products
        : [];
      const detectedRecommendationTypes = toStringArray(
        toPreferences(payload.preferences).type,
      );
      const resolvedCategorySlugs = [
        ...new Set(
          detectedRecommendationTypes
            .map((type) => getDefaultCategorySlug(type))
            .filter((slug): slug is string => Boolean(slug)),
        ),
      ];
      const titlesPreview = products
        .map((item) => (typeof item === 'object' && item !== null ? item : {}))
        .map((item) => (item as Record<string, unknown>).title)
        .filter((title): title is string => typeof title === 'string')
        .slice(0, 5);

      results.push({
        query,
        preferencesResolved: toPreferences(payload.preferences),
        detectedRecommendationTypes,
        resolvedCategorySlugs,
        totalFromApi: readNumber(payload.totalRecommendations),
        afterStockFilter: readNumber(payload.afterStockFilter),
        afterTypeFilter: readNumber(payload.afterTypeFilter),
        shown: readNumber(payload.recommendationsCount),
        apiFallback:
          typeof payload.apiFallback === 'boolean' ? payload.apiFallback : null,
        fallbackReason:
          typeof payload.fallbackReason === 'string' ? payload.fallbackReason : null,
        titlesPreview,
        error: null,
      });
    } catch (error: unknown) {
      results.push({
        query,
        preferencesResolved: { genre: [], type: [], age: null },
        detectedRecommendationTypes: [],
        resolvedCategorySlugs: [],
        totalFromApi: null,
        afterStockFilter: null,
        afterTypeFilter: null,
        shown: null,
        apiFallback: null,
        fallbackReason: null,
        titlesPreview: [],
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
  const outPath = `${outDir}/recommendations-trace-summary.json`;
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
