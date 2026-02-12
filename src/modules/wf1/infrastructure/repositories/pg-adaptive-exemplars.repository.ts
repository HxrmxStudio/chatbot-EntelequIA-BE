import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type {
  AdaptiveExemplar,
  AdaptiveExemplarsPort,
} from '../../application/ports/adaptive-exemplars.port';
import type { IntentName } from '../../domain/intent';
import { PG_POOL } from '../../application/ports/tokens';

@Injectable()
export class PgAdaptiveExemplarsRepository implements AdaptiveExemplarsPort {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getActiveExemplarsByIntent(input: {
    intent: IntentName;
    limit: number;
  }): Promise<AdaptiveExemplar[]> {
    const limit = Math.max(0, Math.min(input.limit, 5));
    if (limit === 0) {
      return [];
    }

    try {
      const result = await this.pool.query<{
        intent: IntentName;
        prompt_hint: string;
        confidence_weight: number;
      }>(
        `SELECT intent, prompt_hint, confidence_weight
         FROM wf1_intent_exemplars
         WHERE enabled = TRUE
           AND intent = $1
         ORDER BY confidence_weight DESC, updated_at DESC
         LIMIT $2`,
        [input.intent, limit],
      );

      return result.rows.map((row) => ({
        intent: row.intent,
        promptHint: row.prompt_hint,
        confidenceWeight: Number(row.confidence_weight) || 0,
      }));
    } catch {
      return [];
    }
  }
}
