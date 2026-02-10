/**
 * Generates docs/reports/query-resolver-report.md from test fixtures.
 * Run from repo root (e.g. npx ts-node scripts/generate-query-resolver-report.ts).
 * Uses relative paths; does not use the @/ alias.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolveProductsQuery } from '../src/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers';
import { QUERY_RESOLVER_SCENARIOS } from '../test/fixtures/wf1/query-resolver-scenarios';

type ReportRow = {
  id: string;
  originalText: string;
  entities: string[];
  productName: string;
  category: string;
  categorySlug: string;
  flags: string;
  expectedCategorySlug: string;
  expectedCategory: string;
  match: string;
  notes: string;
};

function escapeMd(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatEntities(entities: string[]): string {
  if (entities.length === 0) return '[]';
  return `[${entities.map((e) => JSON.stringify(e)).join(', ')}]`;
}

function boolFlag(value: boolean, label: string): string {
  return value ? label : '';
}

function buildFlags(input: {
  hasVolumeHint: boolean;
  hasFormatHint: boolean;
  hasLanguageHint: boolean;
  hasOfferHint: boolean;
}): string {
  const tokens = [
    boolFlag(input.hasVolumeHint, 'vol'),
    boolFlag(input.hasFormatHint, 'fmt'),
    boolFlag(input.hasLanguageHint, 'lang'),
    boolFlag(input.hasOfferHint, 'offer'),
  ].filter((t) => t.length > 0);

  return tokens.length > 0 ? tokens.join(',') : '-';
}

function toRow(): ReportRow[] {
  return QUERY_RESOLVER_SCENARIOS.map((scenario) => {
    const result = resolveProductsQuery(scenario.entities, scenario.originalText);
    const expectedCategorySlug =
      typeof scenario.expected?.categorySlug === 'string' ? scenario.expected.categorySlug : '';
    const expectedCategory =
      typeof scenario.expected?.category === 'string'
        ? scenario.expected.category
        : scenario.expected?.category === null
          ? 'null'
          : '';

    const actualCategorySlug = result.categorySlug ?? '';
    const actualCategory = result.category ?? null;

    const match =
      expectedCategorySlug.length > 0 || expectedCategory.length > 0
        ? String(
            (expectedCategorySlug.length === 0 || expectedCategorySlug === actualCategorySlug) &&
              (expectedCategory.length === 0 ||
                expectedCategory === (actualCategory === null ? 'null' : actualCategory)),
          )
        : '';

    return {
      id: scenario.id,
      originalText: scenario.originalText,
      entities: scenario.entities,
      productName: result.productName,
      category: result.category ?? 'null',
      categorySlug: result.categorySlug ?? '',
      flags: buildFlags(result),
      expectedCategorySlug,
      expectedCategory,
      match,
      notes: scenario.notes ?? '',
    };
  });
}

function buildMarkdown(rows: ReportRow[]): string {
  const withExpectations = rows.filter(
    (row) => row.expectedCategorySlug.length > 0 || row.expectedCategory.length > 0,
  );
  const matchCount = withExpectations.filter((row) => row.match === 'true').length;

  const lines: string[] = [];
  lines.push('# Query Resolver Report (WF1)');
  lines.push('');
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Scenarios: ${rows.length}`);
  lines.push(
    withExpectations.length > 0
      ? `Expectation matches: ${matchCount}/${withExpectations.length}`
      : 'Expectation matches: (no expectations configured)',
  );
  lines.push('');

  lines.push(
    '| id | originalText | entities | productName | category | categorySlug | flags | expectedCategory | expectedCategorySlug | match | notes |',
  );
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');

  for (const row of rows) {
    lines.push(
      `| ${escapeMd(row.id)} | ${escapeMd(row.originalText)} | ${escapeMd(
        formatEntities(row.entities),
      )} | ${escapeMd(row.productName)} | ${escapeMd(row.category)} | ${escapeMd(
        row.categorySlug || '-',
      )} | ${escapeMd(row.flags)} | ${escapeMd(row.expectedCategory || '-')} | ${escapeMd(
        row.expectedCategorySlug || '-',
      )} | ${escapeMd(row.match || '-')} | ${escapeMd(row.notes || '-')} |`,
    );
  }

  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push(
    '- `flags`: `vol` = volume hint, `fmt` = format hint, `lang` = language hint, `offer` = offer hint.',
  );
  lines.push(
    '- `categorySlug`: path slug used for `GET /api/v1/products-list/{categorySlug}` when present.',
  );

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const rows = toRow();
  const markdown = buildMarkdown(rows);

  const outDir = 'docs/reports';
  const outPath = `${outDir}/query-resolver-report.md`;
  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, markdown, 'utf8');

  // Keep stdout minimal and script-friendly.
  // eslint-disable-next-line no-console
  console.log(outPath);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
