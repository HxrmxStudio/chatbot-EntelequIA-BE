import { resolve } from 'node:path';
import { INTENT_NAMES } from '@/modules/wf1/domain/intent';
import { readStringEnv } from './_helpers/analytics';
import {
  type LearningSeedCase,
  type LearningSeedParseIssue,
  loadLearningSeedCasesFile,
} from './_helpers/learning-seeds';

export interface SeedValidationIssue {
  code:
    | 'parse_issue'
    | 'unsupported_intent'
    | 'seed_not_reviewed'
    | 'duplicate_fingerprint'
    | 'fingerprint_collision';
  message: string;
  line?: number;
  seedId?: string;
  fingerprint?: string;
}

export interface SeedValidationReport {
  generatedAt: string;
  seedFile: string;
  validSeedCount: number;
  issueCount: number;
  issues: SeedValidationIssue[];
  byCode: Record<string, number>;
}

export function validateLearningSeeds(input: {
  seedFile: string;
  seeds: LearningSeedCase[];
  parseIssues: LearningSeedParseIssue[];
  supportedIntents?: readonly string[];
}): SeedValidationReport {
  const issues: SeedValidationIssue[] = [];
  const supportedIntents = new Set(input.supportedIntents ?? INTENT_NAMES);

  for (const parseIssue of input.parseIssues) {
    issues.push({
      code: 'parse_issue',
      message: parseIssue.reason,
      line: parseIssue.line,
    });
  }

  for (const seed of input.seeds) {
    if (!supportedIntents.has(seed.intent)) {
      issues.push({
        code: 'unsupported_intent',
        message: `Intent ${seed.intent} is not supported by runtime intent router`,
        seedId: seed.id,
      });
    }

    if (seed.reviewed === false) {
      issues.push({
        code: 'seed_not_reviewed',
        message: 'Seed marked with reviewed=false',
        seedId: seed.id,
      });
    }
  }

  const fingerprints = new Map<
    string,
    Array<{
      seedId: string;
      semanticSignature: string;
    }>
  >();

  for (const seed of input.seeds) {
    const semanticSignature = [seed.intent, seed.userPrompt, seed.expectedBehavior]
      .map(normalizeSemanticInput)
      .join('||');
    const bucket = fingerprints.get(seed.seedFingerprint) ?? [];
    bucket.push({
      seedId: seed.id,
      semanticSignature,
    });
    fingerprints.set(seed.seedFingerprint, bucket);
  }

  for (const [fingerprint, entries] of fingerprints.entries()) {
    if (entries.length < 2) {
      continue;
    }

    const signatures = new Set(entries.map((entry) => entry.semanticSignature));
    const issueCode = signatures.size > 1 ? 'fingerprint_collision' : 'duplicate_fingerprint';
    const seedIds = entries.map((entry) => entry.seedId).join(', ');

    issues.push({
      code: issueCode,
      message:
        issueCode === 'fingerprint_collision'
          ? `Fingerprint collision detected across different semantic content (${seedIds})`
          : `Duplicate semantic seed detected (${seedIds})`,
      fingerprint,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    seedFile: input.seedFile,
    validSeedCount: input.seeds.length,
    issueCount: issues.length,
    issues,
    byCode: issues.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.code] = (acc[issue.code] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

function normalizeSemanticInput(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

async function main(): Promise<void> {
  const seedFile = readStringEnv(
    'WF1_LEARNING_SEED_FILE',
    resolve(process.cwd(), 'docs/qa/learning-seed-cases.jsonl'),
  );
  const parsed = await loadLearningSeedCasesFile(seedFile);
  const report = validateLearningSeeds({
    seedFile,
    seeds: parsed.seeds,
    parseIssues: parsed.issues,
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));

  if (report.issueCount > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
