import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function runEmitSummaryScript(mode: 'daily' | 'weekly', reportsDir: string): string {
  const result = execFileSync(
    'npx',
    [
      'ts-node',
      '--files',
      '-r',
      'tsconfig-paths/register',
      '--project',
      'tsconfig.json',
      'scripts/emit-quality-loop-summary.ts',
      mode,
      '--reports-dir',
      reportsDir,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: 'pipe',
      encoding: 'utf8',
    },
  );
  return result as string;
}

describe('emit-quality-loop-summary script (integration)', () => {
  let tmpDir = '';

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `emit-quality-loop-summary-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('outputs valid markdown for daily mode with fixtures', async () => {
    await writeFile(
      join(tmpDir, 'response-quality-eval-summary-1.json'),
      JSON.stringify({
        processed: 5,
        inserted: 5,
        queuedForBatch: 0,
        batchStatus: 'completed',
      }),
      'utf8',
    );
    await writeFile(
      join(tmpDir, 'hitl-enqueue-summary-1.json'),
      JSON.stringify({
        inserted: { fallback: 2, lowScore: 1, random: 0 },
      }),
      'utf8',
    );
    await writeFile(
      join(tmpDir, 'analytics-prune-summary-1.json'),
      JSON.stringify({
        deleted: { messages: 0, responseEvaluations: 0, hitlReviewQueue: 0, hitlGoldenExamples: 0 },
      }),
      'utf8',
    );
    await writeFile(
      join(tmpDir, 'close-stale-conversations-1.json'),
      JSON.stringify({ closedCount: 10, skipped: false }),
      'utf8',
    );

    const stdout = runEmitSummaryScript('daily', tmpDir);

    expect(stdout).toContain('# WF1 Quality Loop — Diario');
    expect(stdout).toContain('## En pocas palabras');
    expect(stdout).toContain('## Métricas');
    expect(stdout).toContain('| Paso | Métrica | Valor |');
    expect(stdout).toContain('Se evaluaron 5 respuestas');
    expect(stdout).toContain('Se añadieron 3 muestras');
    expect(stdout).toContain('Se cerraron 10 conversaciones');
  });

  it('outputs valid markdown for weekly mode with fixtures', async () => {
    await writeFile(
      join(tmpDir, 'hitl-golden-injection-1.json'),
      JSON.stringify({ insertedCount: 2 }),
      'utf8',
    );
    await writeFile(
      join(tmpDir, 'wf1-build-intent-exemplars-1.json'),
      JSON.stringify({ clusters: 5, upserted: 4 }),
      'utf8',
    );
    await writeFile(
      join(tmpDir, 'wf1-weekly-quality-report-1.json'),
      JSON.stringify({
        current: {
          fallbackRate: 0.06,
          semanticScore: 0.85,
          hallucinationRate: 0.02,
          downvoteRate: 0.04,
          feedbackTotal: 30,
          evalTotal: 100,
          hitlPending: 8,
        },
        deltas: {
          fallbackRate: -0.01,
          semanticScore: 0.02,
          hallucinationRate: 0.005,
          downvoteRate: -0.01,
        },
      }),
      'utf8',
    );

    const stdout = runEmitSummaryScript('weekly', tmpDir);

    expect(stdout).toContain('# WF1 Quality Loop — Semanal');
    expect(stdout).toContain('## En pocas palabras');
    expect(stdout).toContain('## KPIs (últimos 7 días)');
    expect(stdout).toContain('| Métrica | Actual | Delta |');
    expect(stdout).toContain('tasa de fallback 6.00%');
    expect(stdout).toContain('4 exemplars actualizados');
    expect(stdout).toContain('2 golden samples inyectados');
  });

  it('daily output differs from weekly output', async () => {
    const dailyOut = runEmitSummaryScript('daily', tmpDir);
    const weeklyOut = runEmitSummaryScript('weekly', tmpDir);

    expect(dailyOut).toContain('— Diario');
    expect(weeklyOut).toContain('— Semanal');
    expect(dailyOut).not.toContain('— Semanal');
    expect(weeklyOut).not.toContain('— Diario');
    expect(dailyOut).toContain('Evaluación de calidad');
    expect(weeklyOut).toContain('Build de intent exemplars');
  });

  it('handles empty reports dir with minimal output', async () => {
    const emptyDir = join(tmpdir(), `emit-quality-empty-${Date.now()}`);
    await mkdir(emptyDir, { recursive: true });
    try {
      const stdout = runEmitSummaryScript('daily', emptyDir);
      expect(stdout).toContain('# WF1 Quality Loop — Diario');
      expect(stdout).toContain('No se encontraron reports para generar resumen.');
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});
