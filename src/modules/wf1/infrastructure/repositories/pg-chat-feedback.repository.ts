import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { toJsonb } from './shared';
import type {
  ChatFeedbackPort,
  PersistChatFeedbackInput,
  PersistChatFeedbackResult,
} from '../../application/ports/chat-feedback.port';
import { PG_POOL } from '../../application/ports/tokens';

@Injectable()
export class PgChatFeedbackRepository implements ChatFeedbackPort {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async persistFeedback(
    input: PersistChatFeedbackInput,
  ): Promise<PersistChatFeedbackResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const targetMessage = await client.query<{
        id: string;
        conversation_id: string;
        user_id: string;
      }>(
        `SELECT id::text, conversation_id, user_id
         FROM messages
         WHERE id = $1::uuid
           AND sender = 'bot'
         LIMIT 1`,
        [input.responseId],
      );

      const messageRow = targetMessage.rows[0];
      if (!messageRow) {
        throw new Error('FEEDBACK_TARGET_NOT_FOUND');
      }

      if (messageRow.conversation_id !== input.conversationId) {
        throw new Error('FEEDBACK_CONVERSATION_MISMATCH');
      }

      const result = await client.query<{ id: string }>(
        `INSERT INTO message_feedback (
           message_id,
           conversation_id,
           user_id,
           source,
           rating,
           reason,
           category,
           external_event_id,
           request_id,
           metadata
         )
         VALUES ($1::uuid, $2, $3, $4::message_channel, $5, $6, $7, $8, $9, $10::jsonb)
         ON CONFLICT (source, external_event_id)
         DO NOTHING
         RETURNING id::text`,
        [
          input.responseId,
          input.conversationId,
          input.userId ?? messageRow.user_id,
          input.source,
          input.rating,
          input.reason ?? null,
          input.category ?? null,
          input.externalEventId,
          input.requestId,
          toJsonb(input.metadata ?? {}),
        ],
      );

      const created = (result.rowCount ?? 0) > 0;
      if (created && input.rating === 'down') {
        await client.query(
          `INSERT INTO hitl_review_queue (message_id, priority, metadata)
           SELECT $1::uuid, 'user_flagged', $2::jsonb
           WHERE NOT EXISTS (
             SELECT 1
             FROM hitl_review_queue queue
             WHERE queue.message_id = $1::uuid
               AND queue.priority = 'user_flagged'
               AND queue.reviewed_at IS NULL
           )`,
          [
            input.responseId,
            toJsonb({
              source: 'chat_feedback',
              requestId: input.requestId,
              externalEventId: input.externalEventId,
              category: input.category ?? null,
            }),
          ],
        );
      }

      await client.query('COMMIT');
      return { created };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
