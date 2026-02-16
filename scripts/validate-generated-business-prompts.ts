import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildGeneratedBusinessPromptFiles,
  loadCanonicalBusinessPrompts,
  normalizePromptContent,
} from './_helpers/entelequia-canonical-context';

type DriftIssue = {
  path: string;
  reason: 'missing_file' | 'content_mismatch';
};

type FactIssue = {
  reason: 'missing_business_fact';
  fact: string;
};

/**
 * Business facts validation rules - derived from canonical YAML structure.
 * After Step 6: These patterns validate that generated prompts contain critical business facts
 * from the canonical source. If patterns need updating, update the canonical YAML first.
 */
const REQUIRED_BUSINESS_FACTS: Array<{ fact: string; patterns: RegExp[] }> = [
  {
    fact: 'reservas 48h con sena 30%',
    patterns: [/reserv/i, /48\s*hs|48\s*horas/i, /30%/i],
  },
  {
    fact: 'importados 30-60 dias con sena 50%',
    patterns: [/importad|bajo pedido/i, /30\s*-\s*60|30\s+a\s+60/i, /50%/i],
  },
  {
    fact: 'editoriales ivrea panini mil suenos',
    patterns: [/ivrea/i, /panini/i, /mil\s+sue[ñn]os/i],
  },
  {
    fact: 'envios internacionales con dhl',
    patterns: [/env[ií]os?\s+internacionales?|todo el mundo/i, /dhl/i],
  },
  {
    fact: 'devoluciones 30 dias',
    patterns: [/devoluc|cambio/i, /30\s*d[ií]as/i],
  },
];

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const canonicalPrompts = await loadCanonicalBusinessPrompts(rootDir);
  const targets = buildGeneratedBusinessPromptFiles(canonicalPrompts);

  const driftIssues: DriftIssue[] = [];

  for (const target of targets) {
    const filePath = resolve(rootDir, target.path);
    let currentContent: string;

    try {
      currentContent = await readFile(filePath, 'utf8');
    } catch {
      driftIssues.push({
        path: target.path,
        reason: 'missing_file',
      });
      continue;
    }

    const expected = normalizePromptContent(target.content);
    const current = normalizePromptContent(currentContent);

    if (expected !== current) {
      driftIssues.push({
        path: target.path,
        reason: 'content_mismatch',
      });
    }
  }

  if (driftIssues.length > 0) {
    process.stderr.write(
      JSON.stringify(
        {
          ok: false,
          driftIssues,
          action: 'Run: npm run prompts:generate:entelequia',
        },
        null,
        2,
      ) + '\n',
    );
    process.exitCode = 1;
    return;
  }

  const generatedContent = targets
    .map((target) => normalizePromptContent(target.content))
    .join('\n');
  const factIssues: FactIssue[] = REQUIRED_BUSINESS_FACTS.filter((rule) =>
    rule.patterns.some((pattern) => !pattern.test(generatedContent)),
  ).map((rule) => ({
    reason: 'missing_business_fact' as const,
    fact: rule.fact,
  }));

  if (factIssues.length > 0) {
    process.stderr.write(
      JSON.stringify(
        {
          ok: false,
          factIssues,
          action:
            'Completá prompts/static/entelequia_business_context_canonical_v1.yaml y luego ejecuta: npm run prompts:generate:entelequia',
        },
        null,
        2,
      ) + '\n',
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        validatedFiles: targets.map((target) => target.path),
      },
      null,
      2,
    ) + '\n',
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown_error';
  process.stderr.write(
    JSON.stringify(
      {
        ok: false,
        error: message,
      },
      null,
      2,
    ) + '\n',
  );
  process.exitCode = 1;
});
