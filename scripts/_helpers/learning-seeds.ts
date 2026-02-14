import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const VALID_SEVERITIES = ['P0', 'P1', 'P2'] as const;
const VALID_SOURCES = ['qa_seed'] as const;
const VALID_DIFFICULTIES = ['normal', 'adversarial', 'control'] as const;

export const SEED_INTENT_CATEGORIES = [
  'orders_accuracy',
  'price_consistency',
  'shipping_policy',
  'recommendations_recovery',
] as const;

export type SeedIntentCategory = (typeof SEED_INTENT_CATEGORIES)[number];
export type LearningSeedSeverity = (typeof VALID_SEVERITIES)[number];
export type LearningSeedSource = (typeof VALID_SOURCES)[number];
export type LearningSeedDifficulty = (typeof VALID_DIFFICULTIES)[number];

export interface LearningSeedCase {
  id: string;
  intent: string;
  category: SeedIntentCategory;
  severity: LearningSeedSeverity;
  seedFingerprint: string;
  userPrompt: string;
  expectedBehavior: string;
  failureMode: string;
  nonTechnicalLanguageRequired: boolean;
  source: LearningSeedSource;
  reviewed?: boolean;
  difficulty?: LearningSeedDifficulty;
  promptHint?: string;
  expectedResponseExample?: string;
}

export interface LearningSeedParseIssue {
  line: number;
  reason: string;
}

export interface ParsedLearningSeedCases {
  seeds: LearningSeedCase[];
  issues: LearningSeedParseIssue[];
}

export async function loadLearningSeedCasesFile(
  filePath: string,
): Promise<ParsedLearningSeedCases> {
  const raw = await readFile(filePath, 'utf8');
  return parseLearningSeedCasesJsonl(raw);
}

export function parseLearningSeedCasesJsonl(raw: string): ParsedLearningSeedCases {
  const seeds: LearningSeedCase[] = [];
  const issues: LearningSeedParseIssue[] = [];
  const seenIds = new Set<string>();

  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index]?.trim() ?? '';
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      issues.push({
        line: lineNumber,
        reason: 'invalid_json',
      });
      continue;
    }

    const normalized = normalizeSeedCandidate(parsed);
    if (!normalized.ok) {
      issues.push({
        line: lineNumber,
        reason: normalized.reason,
      });
      continue;
    }

    if (seenIds.has(normalized.value.id)) {
      issues.push({
        line: lineNumber,
        reason: `duplicate_id:${normalized.value.id}`,
      });
      continue;
    }

    seenIds.add(normalized.value.id);
    seeds.push(normalized.value);
  }

  return { seeds, issues };
}

export function buildSeedPromptHint(seed: LearningSeedCase): string {
  if (seed.promptHint && seed.promptHint.trim().length > 0) {
    return trimToMaxLength(seed.promptHint.trim(), 280);
  }

  const nonTechnicalClause = seed.nonTechnicalLanguageRequired
    ? 'No uses terminos tecnicos internos al responder.'
    : '';
  const hint = [
    `Intent ${seed.intent}.`,
    seed.expectedBehavior,
    `Evita: ${seed.failureMode}.`,
    nonTechnicalClause,
  ]
    .filter((part) => part.length > 0)
    .join(' ');

  return trimToMaxLength(hint, 280);
}

export function buildSeedCanonicalIssues(seed: LearningSeedCase): string[] {
  return [`seed:${seed.category}`, `failure:${seed.failureMode}`];
}

export function buildSeedFingerprint(input: {
  intent: string;
  userPrompt: string;
  expectedBehavior: string;
}): string {
  const canonical = [
    normalizeFingerprintInput(input.intent),
    normalizeFingerprintInput(input.userPrompt),
    normalizeFingerprintInput(input.expectedBehavior),
  ].join('||');

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function normalizeSeedCandidate(
  value: unknown,
): { ok: true; value: LearningSeedCase } | { ok: false; reason: string } {
  if (!isRecord(value)) {
    return { ok: false, reason: 'not_an_object' };
  }

  const id = normalizeString(value['id']);
  if (!id || !/^[a-z0-9][a-z0-9-]{2,119}$/.test(id)) {
    return { ok: false, reason: 'invalid_id' };
  }

  const intent = normalizeString(value['intent']);
  if (!intent || !/^[a-z_]{2,64}$/.test(intent)) {
    return { ok: false, reason: 'invalid_intent' };
  }

  const category = normalizeString(value['category']);
  if (!category || !isSeedIntentCategory(category)) {
    return { ok: false, reason: 'invalid_category' };
  }

  const severity = normalizeString(value['severity']);
  if (!severity || !isSeedSeverity(severity)) {
    return { ok: false, reason: 'invalid_severity' };
  }

  const source = normalizeString(value['source']) ?? 'qa_seed';
  if (!isSeedSource(source)) {
    return { ok: false, reason: 'invalid_source' };
  }

  const userPrompt = normalizeString(value['user_prompt']);
  if (!userPrompt || userPrompt.length < 4 || userPrompt.length > 600) {
    return { ok: false, reason: 'invalid_user_prompt' };
  }

  const expectedBehavior = normalizeString(value['expected_behavior']);
  if (!expectedBehavior || expectedBehavior.length < 8 || expectedBehavior.length > 800) {
    return { ok: false, reason: 'invalid_expected_behavior' };
  }

  const failureMode = normalizeString(value['failure_mode']);
  if (!failureMode || failureMode.length < 3 || failureMode.length > 160) {
    return { ok: false, reason: 'invalid_failure_mode' };
  }

  const nonTechnicalLanguageRequired = value['non_technical_language_required'];
  if (typeof nonTechnicalLanguageRequired !== 'boolean') {
    return { ok: false, reason: 'invalid_non_technical_language_required' };
  }

  const reviewedValue = value['reviewed'];
  if (typeof reviewedValue !== 'undefined' && typeof reviewedValue !== 'boolean') {
    return { ok: false, reason: 'invalid_reviewed' };
  }

  const difficultyCandidate = normalizeOptionalString(value['difficulty']);
  let difficulty: LearningSeedDifficulty | undefined;
  if (difficultyCandidate) {
    if (!isSeedDifficulty(difficultyCandidate)) {
      return { ok: false, reason: 'invalid_difficulty' };
    }
    difficulty = difficultyCandidate;
  }

  const promptHint = normalizeOptionalString(value['prompt_hint']);
  const expectedResponseExample = normalizeOptionalString(value['expected_response_example']);
  const seedFingerprint = buildSeedFingerprint({
    intent,
    userPrompt,
    expectedBehavior,
  });

  return {
    ok: true,
    value: {
      id,
      intent,
      category,
      severity,
      seedFingerprint,
      userPrompt,
      expectedBehavior,
      failureMode,
      nonTechnicalLanguageRequired,
      source,
      ...(typeof reviewedValue === 'boolean' ? { reviewed: reviewedValue } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(promptHint ? { promptHint } : {}),
      ...(expectedResponseExample ? { expectedResponseExample } : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = normalizeString(value);
  return normalized ?? undefined;
}

function isSeedIntentCategory(value: string): value is SeedIntentCategory {
  return SEED_INTENT_CATEGORIES.includes(value as SeedIntentCategory);
}

function isSeedSeverity(value: string): value is LearningSeedSeverity {
  return VALID_SEVERITIES.includes(value as LearningSeedSeverity);
}

function isSeedSource(value: string): value is LearningSeedSource {
  return VALID_SOURCES.includes(value as LearningSeedSource);
}

function isSeedDifficulty(value: string): value is LearningSeedDifficulty {
  return VALID_DIFFICULTIES.includes(value as LearningSeedDifficulty);
}

function trimToMaxLength(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeFingerprintInput(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
