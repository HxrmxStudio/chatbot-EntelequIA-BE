import type { DailyReports, WeeklyReports } from '../../../scripts/emit-quality-loop-summary';
import {
  escapeMarkdownCell,
  renderDailySummary,
  renderWeeklySummary,
} from '../../../scripts/emit-quality-loop-summary';

describe('emit-quality-loop-summary', () => {
  describe('escapeMarkdownCell', () => {
    it('escapes pipe character to avoid breaking markdown tables', () => {
      expect(escapeMarkdownCell('foo|bar')).toBe('foo\\|bar');
      expect(escapeMarkdownCell('a|b|c')).toBe('a\\|b\\|c');
    });

    it('handles non-string input', () => {
      expect(escapeMarkdownCell(123 as unknown as string)).toBe('123');
    });

    it('returns string unchanged when no pipe', () => {
      expect(escapeMarkdownCell('plain text')).toBe('plain text');
    });
  });

  describe('renderDailySummary', () => {
    it('renders full daily summary with all reports', () => {
      const reports: DailyReports = {
        eval: { processed: 10, inserted: 8, queuedForBatch: 0, batchStatus: 'completed' },
        hitl: { inserted: { fallback: 3, lowScore: 2, random: 1 } },
        prune: { deleted: { messages: 0, responseEvaluations: 0, hitlReviewQueue: 0, hitlGoldenExamples: 0 } },
        closeStale: { closedCount: 42, skipped: false },
      };

      const output = renderDailySummary(reports);

      expect(output).toContain('# WF1 Quality Loop — Diario');
      expect(output).toContain('## En pocas palabras');
      expect(output).toContain('## Acciones realizadas');
      expect(output).toContain('## Métricas');
      expect(output).toContain('Se evaluaron 10 respuestas');
      expect(output).toContain('Se añadieron 6 muestras');
      expect(output).toContain('Se cerraron 42 conversaciones');
      expect(output).toContain('| Paso | Métrica | Valor |');
      expect(output).toContain('| Eval |');
      expect(output).toContain('| HITL |');
      expect(output).toContain('| Stale |');
    });

    it('renders minimal message when reports object is empty', () => {
      const reports: DailyReports = {};

      const output = renderDailySummary(reports);

      expect(output).toContain('# WF1 Quality Loop — Diario');
      expect(output).toContain('No se encontraron reports para generar resumen.');
      expect(output).toContain('## Métricas');
      expect(output).toContain('| Paso | Métrica | Valor |');
    });

    it('handles partial reports without throwing', () => {
      const reports: DailyReports = {
        hitl: { inserted: { fallback: 1, lowScore: 0, random: 0 } },
      };

      const output = renderDailySummary(reports);

      expect(output).toContain('# WF1 Quality Loop — Diario');
      expect(output).toContain('Se añadieron 1 muestras');
      expect(output).toContain('| HITL |');
    });

    it('handles closeStale skipped', () => {
      const reports: DailyReports = {
        closeStale: { closedCount: 0, skipped: true },
      };

      const output = renderDailySummary(reports);

      expect(output).toContain('Cierre de conversaciones omitido.');
    });

    it('renders well-formed markdown with headings and tables', () => {
      const reports: DailyReports = {
        eval: { processed: 5, inserted: 5 },
        hitl: { inserted: { fallback: 1, lowScore: 1, random: 0 } },
      };

      const output = renderDailySummary(reports);

      expect(output).toMatch(/^# WF1 Quality Loop/);
      expect(output).toMatch(/^## En pocas palabras/m);
      expect(output).toMatch(/^## Acciones realizadas/m);
      expect(output).toMatch(/^## Métricas/m);
      expect(output).toMatch(/\| ----- \| ------- \| ----- \|/);
    });
  });

  describe('renderWeeklySummary', () => {
    it('renders full weekly summary with all reports', () => {
      const reports: WeeklyReports = {
        golden: { insertedCount: 3 },
        exemplars: { clusters: 10, upserted: 8 },
        weekly: {
          current: {
            fallbackRate: 0.05,
            semanticScore: 0.87,
            hallucinationRate: 0.02,
            downvoteRate: 0.03,
            feedbackTotal: 50,
            evalTotal: 200,
            hitlPending: 12,
          },
          deltas: {
            fallbackRate: -0.01,
            semanticScore: 0.02,
            hallucinationRate: 0.005,
            downvoteRate: -0.01,
          },
        },
      };

      const output = renderWeeklySummary(reports);

      expect(output).toContain('# WF1 Quality Loop — Semanal');
      expect(output).toContain('## En pocas palabras');
      expect(output).toContain('## Acciones realizadas');
      expect(output).toContain('## KPIs (últimos 7 días)');
      expect(output).toContain('tasa de fallback 5.00%');
      expect(output).toContain('8 exemplars actualizados');
      expect(output).toContain('3 golden samples inyectados');
      expect(output).toContain('| Métrica | Actual | Delta |');
      expect(output).toContain('| Fallback rate |');
      expect(output).toContain('| Semantic score |');
      expect(output).toContain('| Hallucination rate |');
      expect(output).toContain('| Downvote rate |');
    });

    it('renders minimal message when reports object is empty', () => {
      const reports: WeeklyReports = {};

      const output = renderWeeklySummary(reports);

      expect(output).toContain('# WF1 Quality Loop — Semanal');
      expect(output).toContain('No se encontraron reports para generar resumen.');
      expect(output).toContain('## KPIs (últimos 7 días)');
    });

    it('handles weekly without reviewer agreement', () => {
      const reports: WeeklyReports = {
        exemplars: { clusters: 5, upserted: 5 },
        weekly: {
          current: { fallbackRate: 0.1, semanticScore: 0.8 },
          deltas: { fallbackRate: 0, semanticScore: 0 },
        },
      };

      const output = renderWeeklySummary(reports);

      expect(output).toContain('# WF1 Quality Loop — Semanal');
      expect(output).toContain('5 exemplars actualizados');
      expect(output).toContain('| Fallback rate | 10.00% |');
    });

    it('renders well-formed markdown', () => {
      const reports: WeeklyReports = {
        weekly: {
          current: { fallbackRate: 0.05, semanticScore: 0.9 },
          deltas: { fallbackRate: -0.01, semanticScore: 0.01 },
        },
      };

      const output = renderWeeklySummary(reports);

      expect(output).toMatch(/^# WF1 Quality Loop — Semanal/);
      expect(output).toMatch(/^## En pocas palabras/m);
      expect(output).toMatch(/^## KPIs \(últimos 7 días\)/m);
      expect(output).toMatch(/\| ------- \| ------ \| ----- \|/);
    });
  });
});
