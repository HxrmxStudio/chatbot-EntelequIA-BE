import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { toJsonb } from './shared';
import type {
  IdempotencyPort,
  IdempotencyStartResult,
} from '../../application/ports/idempotency.port';
import type { ChannelSource } from '../../domain/source';
import { PG_POOL } from '../../application/ports/tokens';

@Injectable()
export class PgIdempotencyRepository implements IdempotencyPort {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async startProcessing(input: {
    source: ChannelSource;
    externalEventId: string;
    payload: Record<string, unknown>;
    requestId: string;
  }): Promise<IdempotencyStartResult> {
    const result = await this.pool.query(
      `INSERT INTO external_events (
         source,
         external_event_id,
         payload,
         status,
         received_at,
         created_at
       )
       VALUES (
         $1::message_channel,
         $2,
         $3::jsonb,
         'received'::external_event_status,
         CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP
       )
       ON CONFLICT (source, external_event_id)
       DO NOTHING`,
      [input.source, input.externalEventId, toJsonb(input.payload)],
    );

    return {
      isDuplicate: result.rowCount === 0,
    };
  }

  async markProcessed(input: { source: ChannelSource; externalEventId: string }): Promise<void> {
    await this.pool.query(
      `UPDATE external_events
       SET status = 'processed', processed_at = now(), error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE source = $1 AND external_event_id = $2`,
      [input.source, input.externalEventId],
    );
  }

  async markFailed(input: {
    source: ChannelSource;
    externalEventId: string;
    errorMessage: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE external_events
       SET status = 'failed', error = $3, updated_at = CURRENT_TIMESTAMP
       WHERE source = $1 AND external_event_id = $2`,
      [input.source, input.externalEventId, input.errorMessage.slice(0, 1000)],
    );
  }
}
