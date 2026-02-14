import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type EvalSummaryReport = {
  batchStatus?: 'submitted' | 'pending' | 'completed' | 'failed_parse_or_persist';
  processed?: number;
  failed?: number;
};

async function main(): Promise<void> {
  const reportsDir = resolve(process.cwd(), 'docs/reports/local');
  const entries = await readdir(reportsDir).catch(() => []);
  const candidateFiles = entries
    .filter((entry) => /^response-quality-eval-summary-\d+\.json$/.test(entry))
    .sort((a, b) => b.localeCompare(a));

  if (candidateFiles.length === 0) {
    throw new Error('eval_batch_report_missing');
  }

  const latest = await findLatestBatchAwareReport(reportsDir, candidateFiles);
  if (!latest) {
    throw new Error('eval_batch_report_missing_batch_status');
  }

  const latestPath = latest.path;
  const report = latest.report;

  const status = report.batchStatus;
  if (status === 'submitted' || status === 'pending') {
    // eslint-disable-next-line no-console
    console.log(`eval_batch_check_ok status=${status} report=${latestPath}`);
    return;
  }

  if (status === 'completed') {
    const processed = typeof report.processed === 'number' ? report.processed : 0;
    const failed = typeof report.failed === 'number' ? report.failed : 0;
    if (processed > 0 && failed === 0) {
      // eslint-disable-next-line no-console
      console.log(`eval_batch_check_ok status=completed report=${latestPath}`);
      return;
    }

    throw new Error(
      `eval_batch_completed_without_usable_result processed=${processed} failed=${failed} report=${latestPath}`,
    );
  }

  throw new Error(`eval_batch_failed status=${status ?? 'unknown'} report=${latestPath}`);
}

async function findLatestBatchAwareReport(
  reportsDir: string,
  candidateFiles: string[],
): Promise<{ path: string; report: EvalSummaryReport } | null> {
  for (const fileName of candidateFiles) {
    const path = resolve(reportsDir, fileName);
    const report = JSON.parse(await readFile(path, 'utf8')) as EvalSummaryReport;
    if (typeof report.batchStatus === 'string') {
      return { path, report };
    }
  }

  return null;
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
