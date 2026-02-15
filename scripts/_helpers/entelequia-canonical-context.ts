import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const ENTELEQUIA_CANONICAL_CONTEXT_PATH =
  'prompts/static/entelequia_business_context_canonical_v1.yaml';

export interface CanonicalBusinessPrompts {
  staticContext: string;
  criticalPolicyContext: string;
  ticketsReturnsPolicyContext: string;
  paymentShippingGeneralContext: string;
}

export interface GeneratedBusinessPromptFile {
  path: string;
  content: string;
}

type CanonicalBlockKey =
  | 'static_context'
  | 'critical_policy_context'
  | 'tickets_returns_policy_context'
  | 'payment_shipping_general_context';

const REQUIRED_KEYS: CanonicalBlockKey[] = [
  'static_context',
  'critical_policy_context',
  'tickets_returns_policy_context',
  'payment_shipping_general_context',
];

export async function loadCanonicalBusinessPrompts(
  rootDir: string = process.cwd(),
): Promise<CanonicalBusinessPrompts> {
  const canonicalPath = resolve(rootDir, ENTELEQUIA_CANONICAL_CONTEXT_PATH);
  const raw = await readFile(canonicalPath, 'utf8');
  const blocks = parseTopLevelLiteralBlocks(raw);

  for (const key of REQUIRED_KEYS) {
    if (!blocks[key] || blocks[key].trim().length === 0) {
      throw new Error(
        `Missing or empty canonical block "${key}" in ${ENTELEQUIA_CANONICAL_CONTEXT_PATH}`,
      );
    }
  }

  return {
    staticContext: normalizeBlockValue(blocks.static_context as string),
    criticalPolicyContext: normalizeBlockValue(
      blocks.critical_policy_context as string,
    ),
    ticketsReturnsPolicyContext: normalizeBlockValue(
      blocks.tickets_returns_policy_context as string,
    ),
    paymentShippingGeneralContext: normalizeBlockValue(
      blocks.payment_shipping_general_context as string,
    ),
  };
}

export function buildGeneratedBusinessPromptFiles(
  prompts: CanonicalBusinessPrompts,
): GeneratedBusinessPromptFile[] {
  return [
    {
      path: 'prompts/static/entelequia_static_context_v1.txt',
      content: prompts.staticContext,
    },
    {
      path: 'prompts/static/entelequia_critical_policy_context_v1.txt',
      content: prompts.criticalPolicyContext,
    },
    {
      path: 'prompts/tickets/entelequia_tickets_returns_policy_context_v1.txt',
      content: prompts.ticketsReturnsPolicyContext,
    },
    {
      path: 'prompts/payment-shipping/entelequia_payment_shipping_general_context_v1.txt',
      content: prompts.paymentShippingGeneralContext,
    },
  ];
}

export function normalizePromptContent(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function normalizeBlockValue(value: string): string {
  return normalizePromptContent(value)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n');
}

function parseTopLevelLiteralBlocks(
  rawYaml: string,
): Partial<Record<CanonicalBlockKey, string>> {
  const lines = rawYaml.replace(/\r\n/g, '\n').split('\n');
  const result: Partial<Record<CanonicalBlockKey, string>> = {};

  let currentKey: CanonicalBlockKey | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const keyMatch = line.match(
      /^(static_context|critical_policy_context|tickets_returns_policy_context|payment_shipping_general_context):\s*\|$/,
    );
    if (keyMatch) {
      if (currentKey !== null) {
        result[currentKey] = currentLines.join('\n');
      }
      currentKey = keyMatch[1] as CanonicalBlockKey;
      currentLines = [];
      continue;
    }

    if (currentKey === null) {
      continue;
    }

    if (line.startsWith('  ')) {
      currentLines.push(line.slice(2));
      continue;
    }

    if (line.trim().length === 0) {
      currentLines.push('');
      continue;
    }

    result[currentKey] = currentLines.join('\n');
    currentKey = null;
    currentLines = [];
  }

  if (currentKey !== null) {
    result[currentKey] = currentLines.join('\n');
  }

  return result;
}
