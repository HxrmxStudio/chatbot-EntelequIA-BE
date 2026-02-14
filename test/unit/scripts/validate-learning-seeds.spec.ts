import type { LearningSeedCase } from '../../../scripts/_helpers/learning-seeds';
import { buildSeedFingerprint } from '../../../scripts/_helpers/learning-seeds';
import { validateLearningSeeds } from '../../../scripts/validate-learning-seeds';

describe('validateLearningSeeds', () => {
  function buildSeed(overrides?: Partial<LearningSeedCase>): LearningSeedCase {
    const base = {
      id: 'seed-1',
      intent: 'orders',
      category: 'orders_accuracy' as const,
      severity: 'P1' as const,
      userPrompt: 'pedido 12345, dni 12345678',
      expectedBehavior: 'Responder el estado del pedido.',
      failureMode: 'orders_lookup_failed',
      nonTechnicalLanguageRequired: true,
      source: 'qa_seed' as const,
    };
    const value: LearningSeedCase = {
      ...base,
      seedFingerprint: buildSeedFingerprint({
        intent: overrides?.intent ?? base.intent,
        userPrompt: overrides?.userPrompt ?? base.userPrompt,
        expectedBehavior: overrides?.expectedBehavior ?? base.expectedBehavior,
      }),
      ...overrides,
    };

    return value;
  }

  it('flags unsupported intents and reviewed=false seeds', () => {
    const reviewedFalse = buildSeed({
      id: 'seed-reviewed-false',
      intent: 'orders',
      reviewed: false,
    });
    const unsupportedIntent = buildSeed({
      id: 'seed-unsupported-intent',
      intent: 'authentication',
    });

    const report = validateLearningSeeds({
      seedFile: 'docs/qa/learning-seed-cases.jsonl',
      seeds: [reviewedFalse, unsupportedIntent],
      parseIssues: [],
      supportedIntents: ['orders', 'products'],
    });

    expect(report.issueCount).toBe(2);
    expect(report.byCode['seed_not_reviewed']).toBe(1);
    expect(report.byCode['unsupported_intent']).toBe(1);
  });

  it('flags duplicate semantic seeds by fingerprint', () => {
    const first = buildSeed({ id: 'dup-a' });
    const second = buildSeed({ id: 'dup-b' });

    const report = validateLearningSeeds({
      seedFile: 'docs/qa/learning-seed-cases.jsonl',
      seeds: [first, second],
      parseIssues: [],
      supportedIntents: ['orders'],
    });

    expect(report.byCode['duplicate_fingerprint']).toBe(1);
  });

  it('flags fingerprint collisions when semantic content differs', () => {
    const first = buildSeed({
      id: 'collision-a',
      seedFingerprint: 'f'.repeat(64),
      userPrompt: 'pedido 1000, dni 11111111',
    });
    const second = buildSeed({
      id: 'collision-b',
      seedFingerprint: 'f'.repeat(64),
      userPrompt: 'pedido 2000, dni 22222222',
    });

    const report = validateLearningSeeds({
      seedFile: 'docs/qa/learning-seed-cases.jsonl',
      seeds: [first, second],
      parseIssues: [],
      supportedIntents: ['orders'],
    });

    expect(report.byCode['fingerprint_collision']).toBe(1);
  });

  it('includes parse issues in final report', () => {
    const report = validateLearningSeeds({
      seedFile: 'docs/qa/learning-seed-cases.jsonl',
      seeds: [buildSeed()],
      parseIssues: [{ line: 3, reason: 'invalid_json' }],
      supportedIntents: ['orders'],
    });

    expect(report.issueCount).toBe(1);
    expect(report.issues[0]).toMatchObject({ code: 'parse_issue', line: 3, message: 'invalid_json' });
  });
});
