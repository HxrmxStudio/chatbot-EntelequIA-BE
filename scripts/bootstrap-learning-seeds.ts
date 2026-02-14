import { resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';
import {
  createAnalyticsPool,
  readBooleanEnv,
  readStringEnv,
  writeLocalReport,
} from './_helpers/analytics';
import {
  buildSeedCanonicalIssues,
  buildSeedPromptHint,
  type LearningSeedCase,
  loadLearningSeedCasesFile,
} from './_helpers/learning-seeds';

interface SeedInsertResult {
  seedId: string;
  userMessageId: string;
  botMessageId: string;
  goldenExampleId: string;
  goldenInserted: boolean;
  exemplarId: string;
  exemplarInserted: boolean;
}

interface SeedInsertFailure {
  seedId: string;
  reason: string;
}

const QA_SEED_USER_ID = 'wf1-learning-seed-user';
const QA_SEED_USER_NAME = 'WF1 Learning Seed';
const QA_SEED_SOURCE = 'qa_seed';

async function main(): Promise<void> {
  const learningEnabled = readBooleanEnv('WF1_RECURSIVE_LEARNING_ENABLED', true);
  if (!learningEnabled) {
    // eslint-disable-next-line no-console
    console.log('WF1_RECURSIVE_LEARNING_ENABLED=false, skipping.');
    return;
  }

  const seedFile = readStringEnv(
    'WF1_LEARNING_SEED_FILE',
    resolve(process.cwd(), 'docs/qa/learning-seed-cases.jsonl'),
  );
  const parsed = await loadLearningSeedCasesFile(seedFile);
  const pool = createAnalyticsPool();
  const startedAt = new Date().toISOString();
  let runId = '';

  try {
    await assertBootstrapSchemaReady(pool);

    runId = await insertRun(pool, {
      runType: 'bootstrap_seeds',
      status: 'started',
      summary: {
        startedAt,
        seedFile,
      },
    });

    const failures: SeedInsertFailure[] = [];
    const inserted: SeedInsertResult[] = [];

    for (const seed of parsed.seeds) {
      if (seed.reviewed === false) {
        failures.push({
          seedId: seed.id,
          reason: 'seed_not_reviewed',
        });
        continue;
      }

      try {
        const result = await upsertSeed(pool, seed);
        inserted.push(result);
      } catch (error: unknown) {
        failures.push({
          seedId: seed.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const summary = {
      startedAt,
      generatedAt: new Date().toISOString(),
      seedFile,
      totalSeeds: parsed.seeds.length + parsed.issues.length,
      validSeeds: parsed.seeds.length,
      invalidSeeds: parsed.issues.length,
      upsertedSeeds: inserted.length,
      failedSeeds: failures.length,
      goldenInserted: inserted.filter((row) => row.goldenInserted).length,
      exemplarInserted: inserted.filter((row) => row.exemplarInserted).length,
      parseIssues: parsed.issues,
      failures,
    };

    await completeRun(pool, {
      runId,
      status: failures.length > 0 ? 'failed' : 'completed',
      summary,
    });

    const reportPath = await writeLocalReport('wf1-bootstrap-learning-seeds', {
      ...summary,
      sample: inserted.slice(0, 10),
    });

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ...summary,
          reportPath,
        },
        null,
        2,
      ),
    );

    if (failures.length > 0) {
      process.exitCode = 1;
    }
  } catch (error: unknown) {
    if (runId) {
      await completeRun(pool, {
        runId,
        status: 'failed',
        summary: {
          startedAt,
          generatedAt: new Date().toISOString(),
          seedFile,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }

    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

async function upsertSeed(pool: Pool, seed: LearningSeedCase): Promise<SeedInsertResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const conversationId = `wf1-seed-conversation-${seed.id}`;
    const userEventId = `wf1-seed-${seed.id}-user-v1`;
    const botEventId = `wf1-seed-${seed.id}-bot-v1`;
    const promptHint = buildSeedPromptHint(seed);

    await upsertSeedUser(client);
    await upsertSeedConversation(client, conversationId);

    const userMessageId = await upsertSeedMessage(client, {
      conversationId,
      eventId: userEventId,
      sender: 'user',
      content: seed.userPrompt,
      metadata: {
        seedId: seed.id,
        seedSource: seed.source,
        seedRole: 'user_prompt',
        seedCategory: seed.category,
        seedFingerprint: seed.seedFingerprint,
      },
    });

    const botMessageId = await upsertSeedMessage(client, {
      conversationId,
      eventId: botEventId,
      sender: 'bot',
      content: buildExpectedBotMessage(seed),
      metadata: {
        seedId: seed.id,
        seedSource: seed.source,
        seedRole: 'expected_bot_answer',
        seedCategory: seed.category,
        seedFingerprint: seed.seedFingerprint,
        expectedBehavior: seed.expectedBehavior,
        nonTechnicalLanguageRequired: seed.nonTechnicalLanguageRequired,
        reviewed: seed.reviewed ?? true,
        ...(seed.difficulty ? { difficulty: seed.difficulty } : {}),
      },
    });

    const golden = await upsertGoldenExample(client, {
      messageId: botMessageId,
      seed,
    });

    const exemplar = await upsertIntentExemplar(client, {
      seed,
      promptHint,
    });

    await client.query('COMMIT');

    return {
      seedId: seed.id,
      userMessageId,
      botMessageId,
      goldenExampleId: golden.id,
      goldenInserted: golden.inserted,
      exemplarId: exemplar.id,
      exemplarInserted: exemplar.inserted,
    };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function upsertSeedUser(client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO users (id, name, created_at, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id)
     DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP`,
    [QA_SEED_USER_ID, QA_SEED_USER_NAME],
  );
}

async function upsertSeedConversation(
  client: PoolClient,
  conversationId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO conversations (id, user_id, channel, status, created_at, updated_at)
     VALUES ($1, $2, 'web', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id)
     DO UPDATE
       SET user_id = EXCLUDED.user_id,
           channel = EXCLUDED.channel,
           status = 'active',
           updated_at = CURRENT_TIMESTAMP`,
    [conversationId, QA_SEED_USER_ID],
  );
}

async function upsertSeedMessage(
  client: PoolClient,
  input: {
    conversationId: string;
    eventId: string;
    sender: 'user' | 'bot';
    content: string;
    metadata: Record<string, unknown>;
  },
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO messages (
       conversation_id,
       user_id,
       content,
       sender,
       type,
       channel,
       external_event_id,
       metadata
     )
     VALUES ($1, $2, $3, $4, 'text', 'web', $5, $6::jsonb)
     ON CONFLICT (channel, external_event_id, sender)
     WHERE external_event_id IS NOT NULL
     DO UPDATE
       SET content = EXCLUDED.content,
           metadata = EXCLUDED.metadata
     RETURNING id::text AS id`,
    [
      input.conversationId,
      QA_SEED_USER_ID,
      input.content,
      input.sender,
      input.eventId,
      JSON.stringify(input.metadata),
    ],
  );

  return result.rows[0]?.id ?? '';
}

async function upsertGoldenExample(
  client: PoolClient,
  input: {
    messageId: string;
    seed: LearningSeedCase;
  },
): Promise<{ id: string; inserted: boolean }> {
  const result = await client.query<{ id: string; inserted: boolean }>(
    `INSERT INTO hitl_golden_examples (
       message_id,
       canonical_quality,
       canonical_issues,
       notes,
       active,
       source
     )
     VALUES ($1::uuid, 'excellent', $2::text[], $3, TRUE, $4)
     ON CONFLICT (message_id)
     WHERE active = TRUE
     DO UPDATE
       SET canonical_quality = EXCLUDED.canonical_quality,
           canonical_issues = EXCLUDED.canonical_issues,
           notes = EXCLUDED.notes,
           source = EXCLUDED.source,
           active = TRUE
     RETURNING id::text AS id, (xmax = 0) AS inserted`,
    [
      input.messageId,
      buildSeedCanonicalIssues(input.seed),
      buildGoldenNotes(input.seed),
      QA_SEED_SOURCE,
    ],
  );

  const row = result.rows[0];
  return {
    id: row?.id ?? '',
    inserted: row?.inserted ?? false,
  };
}

async function upsertIntentExemplar(
  client: PoolClient,
  input: {
    seed: LearningSeedCase;
    promptHint: string;
  },
): Promise<{ id: string; inserted: boolean }> {
  const confidenceWeight = resolveConfidenceWeight(input.seed.severity);
  const evidence = {
    seedId: input.seed.id,
    seedFingerprint: input.seed.seedFingerprint,
    category: input.seed.category,
    severity: input.seed.severity,
    failureMode: input.seed.failureMode,
    expectedBehavior: input.seed.expectedBehavior,
    nonTechnicalLanguageRequired: input.seed.nonTechnicalLanguageRequired,
    source: input.seed.source,
    reviewed: input.seed.reviewed ?? true,
    ...(input.seed.difficulty ? { difficulty: input.seed.difficulty } : {}),
  };

  const result = await client.query<{ id: string; inserted: boolean }>(
    `INSERT INTO wf1_intent_exemplars (
       intent,
       prompt_hint,
       confidence_weight,
       source,
       evidence,
       enabled
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, FALSE)
     ON CONFLICT (intent, prompt_hint)
     DO UPDATE
       SET confidence_weight = GREATEST(
             wf1_intent_exemplars.confidence_weight,
             EXCLUDED.confidence_weight
           ),
           source = EXCLUDED.source,
           evidence = EXCLUDED.evidence,
           updated_at = CURRENT_TIMESTAMP
     RETURNING id::text AS id, (xmax = 0) AS inserted`,
    [
      input.seed.intent,
      input.promptHint,
      confidenceWeight,
      QA_SEED_SOURCE,
      JSON.stringify(evidence),
    ],
  );

  const row = result.rows[0];
  return {
    id: row?.id ?? '',
    inserted: row?.inserted ?? false,
  };
}

function resolveConfidenceWeight(severity: LearningSeedCase['severity']): number {
  switch (severity) {
    case 'P0':
      return 0.92;
    case 'P1':
      return 0.86;
    case 'P2':
      return 0.8;
  }
}

function buildExpectedBotMessage(seed: LearningSeedCase): string {
  const expectedExample = seed.expectedResponseExample
    ? ` Ejemplo de respuesta: ${seed.expectedResponseExample}`
    : '';
  return `${seed.expectedBehavior}${expectedExample}`;
}

function buildGoldenNotes(seed: LearningSeedCase): string {
  return [
    `seed_id=${seed.id}`,
    `seed_fingerprint=${seed.seedFingerprint}`,
    `intent=${seed.intent}`,
    `category=${seed.category}`,
    `failure_mode=${seed.failureMode}`,
    `reviewed=${seed.reviewed ?? true}`,
    `difficulty=${seed.difficulty ?? 'normal'}`,
  ].join(' | ');
}

async function assertBootstrapSchemaReady(pool: Pool): Promise<void> {
  const missing: string[] = [];

  if (!(await tableExists(pool, 'wf1_intent_exemplars'))) {
    missing.push('table:wf1_intent_exemplars');
  }
  if (!(await tableExists(pool, 'wf1_learning_runs'))) {
    missing.push('table:wf1_learning_runs');
  }
  if (!(await tableExists(pool, 'hitl_golden_examples'))) {
    missing.push('table:hitl_golden_examples');
  }
  if (!(await columnExists(pool, 'hitl_golden_examples', 'source'))) {
    missing.push('column:hitl_golden_examples.source');
  }
  if (!(await constraintContains(pool, 'wf1_intent_exemplars', 'qa_seed'))) {
    missing.push('constraint:wf1_intent_exemplars.source includes qa_seed');
  }
  if (!(await constraintContains(pool, 'wf1_learning_runs', 'bootstrap_seeds'))) {
    missing.push('constraint:wf1_learning_runs.run_type includes bootstrap_seeds');
  }

  if (missing.length > 0) {
    throw new Error(
      `Database is missing bootstrap learning seed prerequisites: ${missing.join(', ')}. ` +
        'Apply sql/12_learning_seed_support.sql before running bootstrap.',
    );
  }
}

async function insertRun(
  pool: Pool,
  input: {
    runType: string;
    status: 'started' | 'completed' | 'failed';
    summary: Record<string, unknown>;
  },
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO wf1_learning_runs (run_type, status, summary)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id::text`,
    [input.runType, input.status, JSON.stringify(input.summary)],
  );

  return result.rows[0]?.id ?? '';
}

async function completeRun(
  pool: Pool,
  input: {
    runId: string;
    status: 'completed' | 'failed';
    summary: Record<string, unknown>;
  },
): Promise<void> {
  if (!input.runId) {
    return;
  }

  await pool.query(
    `UPDATE wf1_learning_runs
     SET status = $2,
         summary = $3::jsonb,
         completed_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid`,
    [input.runId, input.status, JSON.stringify(input.summary)],
  );
}

async function tableExists(pool: Pool, tableName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = $1
     ) AS exists`,
    [tableName],
  );
  return result.rows[0]?.exists === true;
}

async function columnExists(
  pool: Pool,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
     ) AS exists`,
    [tableName, columnName],
  );
  return result.rows[0]?.exists === true;
}

async function constraintContains(
  pool: Pool,
  tableName: string,
  expectedFragment: string,
): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       WHERE ns.nspname = 'public'
         AND rel.relname = $1
         AND con.contype = 'c'
         AND pg_get_constraintdef(con.oid) ILIKE '%' || $2 || '%'
     ) AS exists`,
    [tableName, expectedFragment],
  );
  return result.rows[0]?.exists === true;
}

void main();
