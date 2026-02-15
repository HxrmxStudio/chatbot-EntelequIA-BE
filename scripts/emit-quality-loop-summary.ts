import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const RESPONSE_QUALITY_EVAL_PREFIX = 'response-quality-eval-summary';
const HITL_ENQUEUE_PREFIX = 'hitl-enqueue-summary';
const ANALYTICS_PRUNE_PREFIX = 'analytics-prune-summary';
const CLOSE_STALE_PREFIX = 'close-stale-conversations';
const HITL_GOLDEN_INJECTION_PREFIX = 'hitl-golden-injection';
const HITL_REVIEWER_AGREEMENT_PREFIX = 'hitl-reviewer-agreement';
const WF1_BUILD_INTENT_EXEMPLARS_PREFIX = 'wf1-build-intent-exemplars';
const WF1_WEEKLY_QUALITY_REPORT_PREFIX = 'wf1-weekly-quality-report';

export function escapeMarkdownCell(val: string): string {
  if (typeof val !== 'string') return String(val);
  return val.replace(/\|/g, '\\|');
}

export type DailyReports = {
  eval?: {
    processed?: number;
    inserted?: number;
    failed?: number;
    queuedForBatch?: number;
    batchStatus?: string;
    cacheHits?: number;
  };
  hitl?: {
    inserted?: { fallback?: number; lowScore?: number; random?: number };
  };
  prune?: {
    deleted?: {
      messages?: number;
      responseEvaluations?: number;
      hitlReviewQueue?: number;
      hitlGoldenExamples?: number;
    };
  };
  closeStale?: {
    closedCount?: number;
    skipped?: boolean;
  };
};

export function renderDailySummary(reports: DailyReports): string {
  const lines: string[] = ['# WF1 Quality Loop — Diario', '', '## En pocas palabras', ''];

  const parts: string[] = [];

  if (reports.eval) {
    const p = reports.eval.processed ?? 0;
    const i = reports.eval.inserted ?? 0;
    if (p > 0 || i > 0) {
      parts.push(`Se evaluaron ${p} respuestas del asistente (${i} nuevas insertadas).`);
    } else if (reports.eval.queuedForBatch != null && reports.eval.queuedForBatch > 0) {
      parts.push(`Se enviaron ${reports.eval.queuedForBatch} muestras al batch de evaluación.`);
    } else {
      parts.push('Evaluación de calidad de respuestas ejecutada.');
    }
  }

  if (reports.hitl?.inserted) {
    const ins = reports.hitl.inserted;
    const total = (ins.fallback ?? 0) + (ins.lowScore ?? 0) + (ins.random ?? 0);
    if (total > 0) {
      parts.push(`Se añadieron ${total} muestras para revisión humana (fallback: ${ins.fallback ?? 0}, baja puntuación: ${ins.lowScore ?? 0}, aleatorias: ${ins.random ?? 0}).`);
    } else {
      parts.push('Enqueue HITL ejecutado.');
    }
  }

  if (reports.closeStale && !reports.closeStale.skipped) {
    const closed = reports.closeStale.closedCount ?? 0;
    parts.push(`Se cerraron ${closed} conversaciones inactivas.`);
  } else if (reports.closeStale?.skipped) {
    parts.push('Cierre de conversaciones omitido.');
  }

  if (reports.prune) {
    parts.push('Prune de analytics (retention check) ejecutado.');
  }

  if (parts.length === 0) {
    parts.push('No se encontraron reports para generar resumen.');
  }

  lines.push(parts.join(' '), '', '## Acciones realizadas', '');
  lines.push('- Evaluación de calidad de respuestas (LLM judge)');
  lines.push('- Validación del lote de evaluaciones');
  lines.push('- Enqueue de muestras HITL (fallback, baja puntuación, aleatorias)');
  lines.push('- Prune de analytics (retention check)');
  lines.push('- Cierre de conversaciones inactivas', '', '## Métricas', '');
  lines.push('| Paso | Métrica | Valor |');
  lines.push('| ----- | ------- | ----- |');

  if (reports.eval) {
    const proc = reports.eval.processed ?? 0;
    const queued = reports.eval.queuedForBatch ?? 0;
    const inserted = reports.eval.inserted ?? 0;
    const val = queued > 0 ? `${inserted} / ${queued} en batch` : `${proc} evaluadas`;
    lines.push(`| Eval | Evaluadas / En batch | ${escapeMarkdownCell(String(val))} |`);
  }
  if (reports.hitl?.inserted) {
    const ins = reports.hitl.inserted;
    const val = `${ins.fallback ?? 0} / ${ins.lowScore ?? 0} / ${ins.random ?? 0}`;
    lines.push(`| HITL | Insertadas (fallback/low/random) | ${escapeMarkdownCell(val)} |`);
  }
  if (reports.closeStale && !reports.closeStale.skipped) {
    lines.push(`| Stale | Conversaciones cerradas | ${reports.closeStale.closedCount ?? 0} |`);
  }

  return lines.join('\n');
}

export type WeeklyReports = {
  golden?: { insertedCount?: number };
  reviewerAgreement?: Record<string, unknown>;
  exemplars?: { clusters?: number; upserted?: number };
  weekly?: {
    current?: {
      fallbackRate?: number;
      semanticScore?: number;
      hallucinationRate?: number;
      downvoteRate?: number;
      feedbackTotal?: number;
      evalTotal?: number;
      hitlPending?: number;
    };
    deltas?: {
      fallbackRate?: number;
      semanticScore?: number;
      hallucinationRate?: number;
      downvoteRate?: number;
    };
  };
};

export function renderWeeklySummary(reports: WeeklyReports): string {
  const lines: string[] = ['# WF1 Quality Loop — Semanal', '', '## En pocas palabras', ''];

  const parts: string[] = [];
  const current = reports.weekly?.current;

  if (current) {
    const fr = ((current.fallbackRate ?? 0) * 100).toFixed(2);
    const sc = (current.semanticScore ?? 0).toFixed(3);
    parts.push(`KPIs: tasa de fallback ${fr}%, puntuación semántica ${sc}.`);
  }

  if (reports.exemplars) {
    const u = reports.exemplars.upserted ?? 0;
    parts.push(`${u} exemplars actualizados.`);
  }
  if (reports.golden) {
    const c = reports.golden.insertedCount ?? 0;
    parts.push(`${c} golden samples inyectados.`);
  }

  if (parts.length === 0) {
    parts.push('No se encontraron reports para generar resumen.');
  }

  lines.push(parts.join(' '), '', '## Acciones realizadas', '');
  lines.push('- Inyección de golden samples');
  lines.push('- Cálculo de acuerdo reviewer (si aplica)');
  lines.push('- Validación de learning seeds');
  lines.push('- Build de intent exemplars');
  lines.push('- Reporte semanal de KPIs', '', '## KPIs (últimos 7 días)', '');
  lines.push('| Métrica | Actual | Delta |');
  lines.push('| ------- | ------ | ----- |');

  if (current) {
    const fr = ((current.fallbackRate ?? 0) * 100).toFixed(2);
    const dFr = (((reports.weekly?.deltas?.fallbackRate ?? 0) * 100)).toFixed(2);
    const sign = (reports.weekly?.deltas?.fallbackRate ?? 0) >= 0 ? '+' : '';
    lines.push(`| Fallback rate | ${fr}% | ${sign}${dFr} pp |`);

    const sc = (current.semanticScore ?? 0).toFixed(3);
    const dSc = (reports.weekly?.deltas?.semanticScore ?? 0).toFixed(3);
    const signSc = (reports.weekly?.deltas?.semanticScore ?? 0) >= 0 ? '+' : '';
    lines.push(`| Semantic score | ${sc} | ${signSc}${dSc} |`);

    const hr = ((current.hallucinationRate ?? 0) * 100).toFixed(2);
    const dHr = (((reports.weekly?.deltas?.hallucinationRate ?? 0) * 100)).toFixed(2);
    const signHr = (reports.weekly?.deltas?.hallucinationRate ?? 0) >= 0 ? '+' : '';
    lines.push(`| Hallucination rate | ${hr}% | ${signHr}${dHr} pp |`);

    const dr = ((current.downvoteRate ?? 0) * 100).toFixed(2);
    const dDr = (((reports.weekly?.deltas?.downvoteRate ?? 0) * 100)).toFixed(2);
    const signDr = (reports.weekly?.deltas?.downvoteRate ?? 0) >= 0 ? '+' : '';
    lines.push(`| Downvote rate | ${dr}% | ${signDr}${dDr} pp |`);
  }

  return lines.join('\n');
}

function findLatestByPrefix(dir: string, prefix: string): string | null {
  let latest: { path: string; mtime: number } | null = null;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.startsWith(prefix) || !e.name.endsWith('.json')) continue;
      const path = resolve(dir, e.name);
      const stat = statSync(path);
      const mtime = stat.mtimeMs;
      if (!latest || mtime > latest.mtime) {
        latest = { path, mtime };
      }
    }
  } catch {
    return null;
  }
  return latest?.path ?? null;
}

function parseReport<T>(path: string): T | null {
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadDailyReports(dir: string): DailyReports {
  const reports: DailyReports = {};

  const evalPath = findLatestByPrefix(dir, RESPONSE_QUALITY_EVAL_PREFIX);
  if (evalPath) {
    const data = parseReport<{
      processed?: number;
      inserted?: number;
      failed?: number;
      queuedForBatch?: number;
      batchStatus?: string;
      cacheHits?: number;
    }>(evalPath);
    if (data) reports.eval = data;
  }

  const hitlPath = findLatestByPrefix(dir, HITL_ENQUEUE_PREFIX);
  if (hitlPath) {
    const data = parseReport<{ inserted?: { fallback?: number; lowScore?: number; random?: number } }>(hitlPath);
    if (data) reports.hitl = data;
  }

  const prunePath = findLatestByPrefix(dir, ANALYTICS_PRUNE_PREFIX);
  if (prunePath) {
    const data = parseReport<{
      deleted?: {
        messages?: number;
        responseEvaluations?: number;
        hitlReviewQueue?: number;
        hitlGoldenExamples?: number;
      };
    }>(prunePath);
    if (data) reports.prune = data;
  }

  const closePath = findLatestByPrefix(dir, CLOSE_STALE_PREFIX);
  if (closePath) {
    const data = parseReport<{ closedCount?: number; skipped?: boolean }>(closePath);
    if (data) reports.closeStale = data;
  }

  return reports;
}

function loadWeeklyReports(dir: string): WeeklyReports {
  const reports: WeeklyReports = {};

  const goldenPath = findLatestByPrefix(dir, HITL_GOLDEN_INJECTION_PREFIX);
  if (goldenPath) {
    const data = parseReport<{ insertedCount?: number }>(goldenPath);
    if (data) reports.golden = data;
  }

  const reviewerPath = findLatestByPrefix(dir, HITL_REVIEWER_AGREEMENT_PREFIX);
  if (reviewerPath) {
    const data = parseReport<Record<string, unknown>>(reviewerPath);
    if (data) reports.reviewerAgreement = data;
  }

  const exemplarsPath = findLatestByPrefix(dir, WF1_BUILD_INTENT_EXEMPLARS_PREFIX);
  if (exemplarsPath) {
    const data = parseReport<{ clusters?: number; upserted?: number }>(exemplarsPath);
    if (data) reports.exemplars = data;
  }

  const weeklyPath = findLatestByPrefix(dir, WF1_WEEKLY_QUALITY_REPORT_PREFIX);
  if (weeklyPath) {
    const data = parseReport<{
      current?: Record<string, unknown>;
      deltas?: Record<string, number>;
    }>(weeklyPath);
    if (data) reports.weekly = data as WeeklyReports['weekly'];
  }

  return reports;
}

function parseArgs(): { mode: 'daily' | 'weekly'; reportsDir: string } {
  const args = process.argv.slice(2);
  let mode: 'daily' | 'weekly' = 'daily';
  let reportsDir = resolve(process.cwd(), 'docs/reports/local');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === 'daily') mode = 'daily';
    else if (args[i] === 'weekly') mode = 'weekly';
    else if (args[i] === '--reports-dir' && args[i + 1]) {
      reportsDir = args[i + 1];
      i += 1;
    }
  }

  return { mode, reportsDir };
}

async function main(): Promise<void> {
  const { mode, reportsDir } = parseArgs();
  let output: string;

  if (mode === 'daily') {
    const reports = loadDailyReports(reportsDir);
    output = renderDailySummary(reports);
  } else {
    const reports = loadWeeklyReports(reportsDir);
    output = renderWeeklySummary(reports);
  }

  // eslint-disable-next-line no-console
  console.log(output);
}

void main();
