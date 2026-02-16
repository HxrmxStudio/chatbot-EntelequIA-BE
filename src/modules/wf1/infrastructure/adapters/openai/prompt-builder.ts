import {
  renderContextBlocksForPrompt,
  type ContextBlock,
  type ContextType,
} from '@/modules/wf1/domain/context-block';
import {
  PROMPT_CONTEXT_MAX_CHARS,
  PROMPT_HISTORY_ITEM_MAX_CHARS,
  PROMPT_HISTORY_MAX_ITEMS,
  PROMPT_POLICY_RESERVED_CHARS,
} from './constants';
import type { PromptBuildResult, PromptTruncationStrategy } from './types';

const CONTEXT_SEPARATOR = '\n\n---\n\n';
const HISTORY_EMPTY = '(Sin historial reciente)';
const CONTEXT_EMPTY = '(Sin contexto adicional)';
const ELLIPSIS = '...';

type ContextEntry = {
  contextType: ContextType;
  rendered: string;
  active: boolean;
  static: boolean;
  policyFacts: boolean;
  criticalPolicy: boolean;
};

export function buildPrompt(
  userText: string,
  intent: string,
  history: Array<{ sender: string; content: string; createdAt: string }>,
  contextBlocks: ContextBlock[],
): PromptBuildResult {
  const compactedHistory = compactHistoryItems(history);
  const historySection =
    compactedHistory.length > 0 ? compactedHistory.join('\n') : HISTORY_EMPTY;
  const historyChars = historySection.length;

  const contextResult = buildContextWithinBudget(intent, contextBlocks, PROMPT_CONTEXT_MAX_CHARS);

  return {
    userPrompt: [
      `Intent detectado: ${intent}`,
      'Contexto negocio:',
      contextResult.context.length > 0 ? contextResult.context : CONTEXT_EMPTY,
      `Historial reciente:\n${historySection}`,
      `Mensaje usuario: ${userText}`,
    ].join('\n\n'),
    diagnostics: {
      contextBudget: PROMPT_CONTEXT_MAX_CHARS,
      contextCharsBefore: contextResult.contextCharsBefore,
      contextCharsAfter: contextResult.contextCharsAfter,
      contextTruncated: contextResult.contextTruncated,
      truncationStrategy: contextResult.truncationStrategy,
      historyItemsIncluded: compactedHistory.length,
      historyChars,
      policyFactsIncluded: contextResult.policyFactsIncluded,
      criticalPolicyIncluded: contextResult.criticalPolicyIncluded,
      criticalPolicyTrimmed: contextResult.criticalPolicyTrimmed,
      sectionOrder: ['intent', 'business_context', 'history', 'user_message'],
    },
  };
}

function compactHistoryItems(
  history: Array<{ sender: string; content: string; createdAt: string }>,
): string[] {
  return history
    .slice(-PROMPT_HISTORY_MAX_ITEMS)
    .map((item) => `${item.sender}: ${truncateWithEllipsis(item.content, PROMPT_HISTORY_ITEM_MAX_CHARS)}`)
    .filter((line) => line.trim().length > 0);
}

function buildContextWithinBudget(
  intent: string,
  contextBlocks: ContextBlock[],
  budget: number,
): {
  context: string;
  contextCharsBefore: number;
  contextCharsAfter: number;
  contextTruncated: boolean;
  truncationStrategy: PromptTruncationStrategy;
  policyFactsIncluded: boolean;
  criticalPolicyIncluded: boolean;
  criticalPolicyTrimmed: boolean;
} {
  if (!Array.isArray(contextBlocks) || contextBlocks.length === 0 || budget <= 0) {
    return {
      context: '',
      contextCharsBefore: 0,
      contextCharsAfter: 0,
      contextTruncated: false,
      truncationStrategy: 'none',
      policyFactsIncluded: false,
      criticalPolicyIncluded: false,
      criticalPolicyTrimmed: false,
    };
  }

  const entries: ContextEntry[] = contextBlocks
    .map((block) => {
      const rendered = renderContextBlocksForPrompt([block]).trim();
      return {
        contextType: block.contextType,
        rendered,
        active: isActiveContextType(intent, block.contextType),
        static: block.contextType === 'static_context',
        policyFacts: block.contextType === 'policy_facts',
        criticalPolicy: block.contextType === 'critical_policy',
      };
    })
    .filter((entry) => entry.rendered.length > 0);

  const policyFactsIncluded = entries.some((entry) => entry.policyFacts);
  const criticalPolicyIncluded = entries.some((entry) => entry.criticalPolicy);
  const mandatoryEntries = entries.filter(
    (entry) => entry.policyFacts || entry.criticalPolicy,
  );
  const optionalEntries = entries.filter(
    (entry) => !entry.policyFacts && !entry.criticalPolicy,
  );

  const before = joinEntries(entries).length;
  const mandatoryChars = joinEntries(mandatoryEntries).length;
  const optionalChars = joinEntries(optionalEntries).length;
  const reservedForPolicy = mandatoryChars > 0 ? Math.min(PROMPT_POLICY_RESERVED_CHARS, budget) : 0;
  const optionalBudget = mandatoryChars > 0 ? Math.max(0, budget - reservedForPolicy) : budget;

  let overflow = Math.max(0, optionalChars - optionalBudget);
  let strategy: PromptTruncationStrategy = 'none';
  let criticalPolicyTrimmed = false;
  const mutable = entries.map((entry) => ({ ...entry }));

  overflow = trimEntriesInPriorityOrder(
    mutable,
    overflow,
    (entry) => entry.static && !entry.criticalPolicy && !entry.policyFacts,
    'static_context_trimmed',
    (entry, next) => {
      strategy = strategy === 'none' ? next : strategy;
      if (entry.criticalPolicy) {
        criticalPolicyTrimmed = true;
      }
    },
  );
  overflow = trimEntriesInPriorityOrder(
    mutable,
    overflow,
    (entry) => !entry.active && !entry.static && !entry.criticalPolicy && !entry.policyFacts,
    'secondary_blocks_trimmed',
    (entry, next) => {
      strategy = strategy === 'none' ? next : strategy;
      if (entry.criticalPolicy) {
        criticalPolicyTrimmed = true;
      }
    },
  );
  trimEntriesInPriorityOrder(
    mutable,
    overflow,
    (entry) => entry.active && !entry.static && !entry.criticalPolicy && !entry.policyFacts,
    'active_blocks_trimmed',
    (entry, next) => {
      strategy = strategy === 'none' ? next : strategy;
      if (entry.criticalPolicy) {
        criticalPolicyTrimmed = true;
      }
    },
  );

  let context = joinEntries(mutable.filter((entry) => entry.rendered.length > 0));
  let totalOverflow = Math.max(0, context.length - budget);
  if (totalOverflow > 0) {
    totalOverflow = trimEntriesInPriorityOrder(
      mutable,
      totalOverflow,
      (entry) => entry.static && !entry.criticalPolicy && !entry.policyFacts,
      'static_context_trimmed',
      (entry, next) => {
        strategy = strategy === 'none' ? next : strategy;
      },
    );
    totalOverflow = trimEntriesInPriorityOrder(
      mutable,
      totalOverflow,
      (entry) => !entry.active && !entry.static && !entry.criticalPolicy && !entry.policyFacts,
      'secondary_blocks_trimmed',
      (entry, next) => {
        strategy = strategy === 'none' ? next : strategy;
      },
    );
    trimEntriesInPriorityOrder(
      mutable,
      totalOverflow,
      (entry) => entry.active && !entry.static && !entry.criticalPolicy && !entry.policyFacts,
      'active_blocks_trimmed',
      (entry, next) => {
        strategy = strategy === 'none' ? next : strategy;
      },
    );
    context = joinEntries(mutable.filter((entry) => entry.rendered.length > 0));
  }

  if (context.length > budget) {
    context = truncateWithEllipsis(context, budget);
    strategy = 'hard_cut';
    criticalPolicyTrimmed = criticalPolicyIncluded;
  }

  const truncated = context.length < before || strategy !== 'none';
  if (!truncated) {
    return {
      context,
      contextCharsBefore: before,
      contextCharsAfter: context.length,
      contextTruncated: false,
      truncationStrategy: 'none',
      policyFactsIncluded,
      criticalPolicyIncluded,
      criticalPolicyTrimmed: false,
    };
  }

  return {
    context,
    contextCharsBefore: before,
    contextCharsAfter: context.length,
    contextTruncated: true,
    truncationStrategy: strategy === 'none' ? 'hard_cut' : strategy,
    policyFactsIncluded,
    criticalPolicyIncluded,
    criticalPolicyTrimmed,
  };
}

function trimEntriesInPriorityOrder(
  entries: ContextEntry[],
  overflow: number,
  predicate: (entry: ContextEntry) => boolean,
  strategy: PromptTruncationStrategy,
  onTrim: (entry: ContextEntry, strategy: PromptTruncationStrategy) => void,
): number {
  if (overflow <= 0) {
    return overflow;
  }

  for (let index = entries.length - 1; index >= 0 && overflow > 0; index -= 1) {
    const entry = entries[index];
    if (!predicate(entry) || entry.rendered.length === 0) {
      continue;
    }

    const { text, removed } = trimEntryForOverflow(entry.rendered, overflow);
    if (removed > 0) {
      entry.rendered = text;
      onTrim(entry, strategy);
      overflow = Math.max(0, overflow - removed);
    }
  }

  return overflow;
}

function joinEntries(entries: ContextEntry[]): string {
  return entries
    .filter((entry) => entry.rendered.length > 0)
    .map((entry) => entry.rendered)
    .join(CONTEXT_SEPARATOR);
}

function truncateWithEllipsis(value: string, maxChars: number): string {
  const safeLimit = Math.max(0, maxChars);
  if (value.length <= safeLimit) {
    return value;
  }

  if (safeLimit === 0) {
    return '';
  }

  if (safeLimit <= ELLIPSIS.length) {
    return value.slice(0, safeLimit);
  }

  return `${value.slice(0, safeLimit - ELLIPSIS.length)}${ELLIPSIS}`;
}

function trimEntryForOverflow(
  text: string,
  overflow: number,
): { text: string; removed: number } {
  if (overflow <= 0 || text.length === 0) {
    return { text, removed: 0 };
  }

  const targetLength = Math.max(0, text.length - overflow);
  const trimmed = truncateWithEllipsis(text, targetLength);
  return {
    text: trimmed,
    removed: Math.max(0, text.length - trimmed.length),
  };
}

function isActiveContextType(intent: string, contextType: ContextType): boolean {
  switch (intent) {
    case 'products':
      return contextType === 'products' || contextType === 'product_detail';
    case 'orders':
      return (
        contextType === 'orders' ||
        contextType === 'order_detail' ||
        contextType === 'order_lookup_error'
      );
    case 'payment_shipping':
      return contextType === 'payment_info';
    case 'tickets':
      return contextType === 'tickets';
    case 'recommendations':
      return contextType === 'recommendations';
    case 'store_info':
      return contextType === 'store_info';
    case 'general':
      return contextType === 'general';
    default:
      return false;
  }
}
