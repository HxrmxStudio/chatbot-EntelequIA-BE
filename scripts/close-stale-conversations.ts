import {
  createAnalyticsPool,
  readBooleanEnv,
  readNumberEnv,
  writeLocalReport,
} from './_helpers/analytics';

const DEFAULT_TTL_MINUTES = 1_440;
const DEFAULT_BATCH_SIZE = 1_000;
const MAX_BATCH_SIZE = 10_000;

async function main(): Promise<void> {
  const enabled = readBooleanEnv('WF1_CONVERSATION_CLOSER_ENABLED', true);
  const ttlMinutes = Math.max(
    1,
    Math.floor(readNumberEnv('WF1_CONVERSATION_ACTIVE_TTL_MINUTES', DEFAULT_TTL_MINUTES)),
  );
  const batchSize = Math.min(
    MAX_BATCH_SIZE,
    Math.max(
      1,
      Math.floor(readNumberEnv('WF1_CONVERSATION_CLOSER_BATCH_SIZE', DEFAULT_BATCH_SIZE)),
    ),
  );

  if (!enabled) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          enabled,
          ttlMinutes,
          batchSize,
          closedCount: 0,
          loops: 0,
          skipped: true,
        },
        null,
        2,
      ),
    );
    return;
  }

  const pool = createAnalyticsPool();
  let totalClosed = 0;
  let loops = 0;

  try {
    for (;;) {
      loops += 1;
      const result = await pool.query<{ id: string }>(
        `WITH stale AS (
           SELECT id
           FROM conversations
           WHERE status = 'active'
             AND updated_at < CURRENT_TIMESTAMP - make_interval(mins => $1::int)
           ORDER BY updated_at ASC
           LIMIT $2::int
         )
         UPDATE conversations target
         SET status = 'closed',
             updated_at = CURRENT_TIMESTAMP
         FROM stale
         WHERE target.id = stale.id
         RETURNING target.id::text AS id`,
        [ttlMinutes, batchSize],
      );

      const closed = result.rowCount ?? 0;
      totalClosed += closed;
      if (closed < batchSize) {
        break;
      }
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      enabled,
      ttlMinutes,
      batchSize,
      closedCount: totalClosed,
      loops,
      skipped: false,
    };

    await writeLocalReport('close-stale-conversations', payload);

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await pool.end();
  }
}

void main();
