import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { AuditEntryInput, AuditPort } from '../../application/ports/audit.port';
import { PG_POOL } from '../../application/ports/tokens';

@Injectable()
export class PgAuditRepository implements AuditPort {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async writeAudit(input: AuditEntryInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs (
         request_id,
         user_id,
         conversation_id,
         source,
         intent,
         status,
         message,
         http_status,
         error_code,
         latency_ms,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        input.requestId,
        input.userId,
        input.conversationId,
        input.source,
        input.intent,
        input.status,
        input.message,
        input.httpStatus,
        input.errorCode ?? null,
        input.latencyMs,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }
}
