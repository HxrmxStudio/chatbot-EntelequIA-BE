import type { Pool } from 'pg';
import { createAnalyticsPool, writeLocalReport } from './_helpers/analytics';

const QUALITY_VALUES = ['excellent', 'good', 'acceptable', 'poor', 'failed'] as const;
type QualityLabel = (typeof QUALITY_VALUES)[number];

type AgreementRow = {
  reviewer_quality: string;
  reviewer_issues: string[] | null;
  canonical_quality: string;
  canonical_issues: string[] | null;
  reviewed_at: string;
};

async function main(): Promise<void> {
  const reviewer = readRequiredArg('reviewer');
  const days = readNumericArg('days', 30);
  const pool = createAnalyticsPool();

  try {
    const rows = await loadAgreementRows(pool, reviewer, days);
    const report = buildAgreementReport(rows, reviewer, days);
    const reportPath = await writeLocalReport('hitl-reviewer-agreement', report);
    // eslint-disable-next-line no-console
    console.log(reportPath);
  } finally {
    await pool.end();
  }
}

async function loadAgreementRows(
  pool: Pool,
  reviewer: string,
  days: number,
): Promise<AgreementRow[]> {
  const result = await pool.query<AgreementRow>(
    `SELECT
       queue.quality_label AS reviewer_quality,
       queue.issues AS reviewer_issues,
       golden.canonical_quality,
       golden.canonical_issues,
       queue.reviewed_at::text AS reviewed_at
     FROM hitl_review_queue queue
     JOIN hitl_golden_examples golden
       ON golden.message_id = queue.message_id
      AND golden.active = true
     WHERE queue.priority = 'golden_sample'
       AND queue.reviewed_by = $1
       AND queue.reviewed_at IS NOT NULL
       AND queue.reviewed_at >= now() - make_interval(days => $2::int)
       AND queue.quality_label IS NOT NULL`,
    [reviewer, days],
  );

  return result.rows;
}

function buildAgreementReport(
  rows: AgreementRow[],
  reviewer: string,
  days: number,
): Record<string, unknown> {
  const filtered = rows.filter(
    (row): row is AgreementRow & { reviewer_quality: QualityLabel; canonical_quality: QualityLabel } =>
      isQualityLabel(row.reviewer_quality) && isQualityLabel(row.canonical_quality),
  );

  const matrix = createConfusionMatrix();
  for (const row of filtered) {
    matrix[row.canonical_quality][row.reviewer_quality] += 1;
  }

  const total = filtered.length;
  const kappa = total > 0 ? cohenKappa(matrix, total) : null;
  const issueOverlap = total > 0 ? averageIssueOverlap(filtered) : null;

  return {
    generatedAt: new Date().toISOString(),
    reviewer,
    windowDays: days,
    totalReviewedGolden: total,
    cohenKappa: kappa,
    issueOverlapJaccard: issueOverlap,
    targetKappa: 0.7,
    needsRecalibration: typeof kappa === 'number' && kappa < 0.6,
    confusionMatrix: matrix,
  };
}

function createConfusionMatrix(): Record<QualityLabel, Record<QualityLabel, number>> {
  const matrix = {} as Record<QualityLabel, Record<QualityLabel, number>>;
  for (const canonical of QUALITY_VALUES) {
    matrix[canonical] = {} as Record<QualityLabel, number>;
    for (const reviewer of QUALITY_VALUES) {
      matrix[canonical][reviewer] = 0;
    }
  }
  return matrix;
}

function cohenKappa(
  matrix: Record<QualityLabel, Record<QualityLabel, number>>,
  total: number,
): number {
  let observed = 0;
  for (const label of QUALITY_VALUES) {
    observed += matrix[label][label];
  }
  const pObserved = observed / total;

  let pExpected = 0;
  for (const label of QUALITY_VALUES) {
    const rowSum = QUALITY_VALUES.reduce((acc, column) => acc + matrix[label][column], 0);
    const colSum = QUALITY_VALUES.reduce((acc, row) => acc + matrix[row][label], 0);
    pExpected += (rowSum / total) * (colSum / total);
  }

  const denominator = 1 - pExpected;
  if (denominator <= 0) {
    return 0;
  }

  return Number(((pObserved - pExpected) / denominator).toFixed(4));
}

function averageIssueOverlap(
  rows: Array<AgreementRow & { reviewer_quality: QualityLabel; canonical_quality: QualityLabel }>,
): number {
  const scores = rows.map((row) => {
    const reviewer = new Set((row.reviewer_issues ?? []).map((item) => item.toLowerCase()));
    const canonical = new Set((row.canonical_issues ?? []).map((item) => item.toLowerCase()));
    if (reviewer.size === 0 && canonical.size === 0) {
      return 1;
    }

    const intersection = [...reviewer].filter((item) => canonical.has(item)).length;
    const union = new Set([...reviewer, ...canonical]).size;
    return union === 0 ? 1 : intersection / union;
  });

  const total = scores.reduce((acc, value) => acc + value, 0);
  return Number((total / scores.length).toFixed(4));
}

function isQualityLabel(value: string): value is QualityLabel {
  return QUALITY_VALUES.includes(value as QualityLabel);
}

function readRequiredArg(name: string): string {
  const prefixed = `--${name}`;
  const index = process.argv.findIndex((arg) => arg === prefixed);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required argument: ${prefixed}`);
  }
  return value.trim();
}

function readNumericArg(name: string, fallback: number): number {
  const prefixed = `--${name}`;
  const index = process.argv.findIndex((arg) => arg === prefixed);
  const raw = index >= 0 ? process.argv[index + 1] : undefined;
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric argument for ${prefixed}: ${raw}`);
  }

  return Math.max(1, Math.floor(parsed));
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});

