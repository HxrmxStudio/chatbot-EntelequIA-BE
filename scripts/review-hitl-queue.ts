import type { Pool } from 'pg';
import { createAnalyticsPool } from './_helpers/analytics';

const QUALITY_VALUES = ['excellent', 'good', 'acceptable', 'poor', 'failed'] as const;

type PendingRow = {
  id: string;
  priority: string;
  sampled_at: string;
  message_id: string;
  user_query: string | null;
  bot_response: string | null;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pool = createAnalyticsPool();

  try {
    if (!args.id) {
      const pending = await listPending(pool, args.limit);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(pending, null, 2));
      return;
    }

    if (!args.reviewer || !args.quality) {
      throw new Error(
        'Usage for review: --id <queue_id> --reviewer <name> --quality <excellent|good|acceptable|poor|failed> [--issues a,b] [--corrected "..."]',
      );
    }

    if (!QUALITY_VALUES.includes(args.quality)) {
      throw new Error(`Invalid --quality value: ${args.quality}`);
    }

    const result = await submitReview(pool, {
      id: args.id,
      reviewer: args.reviewer,
      quality: args.quality,
      issues: args.issues,
      corrected: args.corrected,
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

async function listPending(pool: Pool, limit: number): Promise<PendingRow[]> {
  const result = await pool.query<PendingRow>(
    `SELECT
       queue.id::text AS id,
       queue.priority,
       queue.sampled_at::text AS sampled_at,
       queue.message_id::text AS message_id,
       user_turn.content AS user_query,
       bot_turn.content AS bot_response
     FROM hitl_review_queue queue
     JOIN messages bot_turn ON bot_turn.id = queue.message_id
     LEFT JOIN LATERAL (
       SELECT content
       FROM messages usr
       WHERE usr.conversation_id = bot_turn.conversation_id
         AND usr.external_event_id = bot_turn.external_event_id
         AND usr.sender = 'user'
       ORDER BY usr.created_at DESC
       LIMIT 1
     ) user_turn ON TRUE
     WHERE queue.reviewed_at IS NULL
     ORDER BY queue.priority DESC, queue.sampled_at ASC
     LIMIT $1`,
    [limit],
  );

  return result.rows;
}

async function submitReview(
  pool: Pool,
  input: {
    id: string;
    reviewer: string;
    quality: (typeof QUALITY_VALUES)[number];
    issues: string[];
    corrected: string | null;
  },
): Promise<{ reviewed: boolean; id: string }> {
  const result = await pool.query<{ id: string }>(
    `UPDATE hitl_review_queue
     SET reviewed_by = $2,
         quality_label = $3,
         issues = $4::text[],
         corrected_response = $5,
         reviewed_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid
       AND reviewed_at IS NULL
     RETURNING id::text AS id`,
    [input.id, input.reviewer, input.quality, input.issues, input.corrected],
  );

  return {
    reviewed: (result.rowCount ?? 0) > 0,
    id: input.id,
  };
}

function parseArgs(argv: string[]): {
  id: string | null;
  reviewer: string | null;
  quality: string | null;
  issues: string[];
  corrected: string | null;
  limit: number;
} {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith('--')
      ? argv[index + 1]
      : '';
    flags.set(key, value);
  }

  const rawIssues = flags.get('issues') ?? '';
  const issues = rawIssues
    .split(',')
    .map((issue) => issue.trim())
    .filter((issue) => issue.length > 0);
  const limit = Number(flags.get('limit') ?? '10');

  return {
    id: normalize(flags.get('id')),
    reviewer: normalize(flags.get('reviewer')),
    quality: normalize(flags.get('quality')),
    issues,
    corrected: normalize(flags.get('corrected')),
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10,
  };
}

function normalize(value: string | undefined): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }
  return value.trim();
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});

