import {
  renderContextBlocksForPrompt,
  type ContextBlock,
  type ContextType,
} from '@/modules/wf1/domain/context-block';
import {
  PROMPT_CONTEXT_MAX_CHARS,
  PROMPT_HISTORY_ITEM_MAX_CHARS,
  PROMPT_HISTORY_MAX_ITEMS,
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
      `Mensaje usuario: ${userText}`,
      `Historial reciente:\n${historySection}`,
      'Contexto negocio:',
      contextResult.context.length > 0 ? contextResult.context : CONTEXT_EMPTY,
    ].join('\n\n'),
    diagnostics: {
      contextBudget: PROMPT_CONTEXT_MAX_CHARS,
      contextCharsBefore: contextResult.contextCharsBefore,
      contextCharsAfter: contextResult.contextCharsAfter,
      contextTruncated: contextResult.contextTruncated,
      truncationStrategy: contextResult.truncationStrategy,
      historyItemsIncluded: compactedHistory.length,
      historyChars,
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
} {
  if (!Array.isArray(contextBlocks) || contextBlocks.length === 0 || budget <= 0) {
    return {
      context: '',
      contextCharsBefore: 0,
      contextCharsAfter: 0,
      contextTruncated: false,
      truncationStrategy: 'none',
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
      };
    })
    .filter((entry) => entry.rendered.length > 0);

  const before = joinEntries(entries).length;
  if (before <= budget) {
    return {
      context: joinEntries(entries),
      contextCharsBefore: before,
      contextCharsAfter: before,
      contextTruncated: false,
      truncationStrategy: 'none',
    };
  }

  let overflow = before - budget;
  let strategy: PromptTruncationStrategy = 'none';
  const mutable = entries.map((entry) => ({ ...entry }));

  overflow = trimEntriesInPriorityOrder(mutable, overflow, (entry) => entry.static, 'static_context_trimmed', (next) => {
    strategy = strategy === 'none' ? next : strategy;
  });
  overflow = trimEntriesInPriorityOrder(
    mutable,
    overflow,
    (entry) => !entry.active && !entry.static,
    'secondary_blocks_trimmed',
    (next) => {
      strategy = strategy === 'none' ? next : strategy;
    },
  );
  trimEntriesInPriorityOrder(
    mutable,
    overflow,
    (entry) => entry.active,
    'active_blocks_trimmed',
    (next) => {
      strategy = strategy === 'none' ? next : strategy;
    },
  );

  let context = joinEntries(mutable.filter((entry) => entry.rendered.length > 0));
  if (context.length > budget) {
    context = truncateWithEllipsis(context, budget);
    strategy = 'hard_cut';
  }

  return {
    context,
    contextCharsBefore: before,
    contextCharsAfter: context.length,
    contextTruncated: true,
    truncationStrategy: strategy === 'none' ? 'hard_cut' : strategy,
  };
}

function trimEntriesInPriorityOrder(
  entries: ContextEntry[],
  overflow: number,
  predicate: (entry: ContextEntry) => boolean,
  strategy: PromptTruncationStrategy,
  onTrim: (strategy: PromptTruncationStrategy) => void,
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
      onTrim(strategy);
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
      return contextType === 'orders' || contextType === 'order_detail';
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
