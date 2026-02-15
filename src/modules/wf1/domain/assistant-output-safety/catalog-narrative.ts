import type { UiPayloadV1 } from '@/modules/wf1/domain/ui-payload';

export interface CatalogNarrativeSanitizationResult {
  message: string;
  rewritten: boolean;
  reasons: string[];
}

const URL_PATTERN = /https?:\/\/\S+/i;
const BULLET_LINE_PATTERN = /^(?:\d+\.|[-*])\s+/;
const NEGATIVE_STOCK_PATTERN =
  /\b(no\s+tenemos|no\s+me\s+figura|no\s+encontre|no\s+encontr[eé]|no\s+hay)\b/i;

export function sanitizeCatalogNarrativeMessage(input: {
  message: string;
  uiPayload: UiPayloadV1 | undefined;
}): CatalogNarrativeSanitizationResult {
  if (!input.uiPayload || input.uiPayload.cards.length === 0) {
    return {
      message: input.message,
      rewritten: false,
      reasons: [],
    };
  }

  const normalized = input.message.trim();
  if (normalized.length === 0) {
    return {
      message: input.message,
      rewritten: false,
      reasons: [],
    };
  }

  const reasons: string[] = [];
  const hasUrl = URL_PATTERN.test(normalized);
  const hasBulletRows = normalized
    .split('\n')
    .map((line) => line.trim())
    .some((line) => BULLET_LINE_PATTERN.test(line));
  const hasNegativeContradiction = NEGATIVE_STOCK_PATTERN.test(normalized);

  if (hasNegativeContradiction) {
    reasons.push('catalog_contradiction_removed');
  }

  if (hasUrl || hasBulletRows) {
    reasons.push('catalog_list_compacted');
  }

  if (reasons.length === 0) {
    return {
      message: input.message,
      rewritten: false,
      reasons: [],
    };
  }

  return {
    message: buildCatalogSummaryMessage(input.uiPayload.cards.length),
    rewritten: true,
    reasons,
  };
}

function buildCatalogSummaryMessage(cardsCount: number): string {
  if (cardsCount === 1) {
    return 'Te muestro esta opcion en la tarjeta de abajo. Si queres, te la comparo con otras alternativas.';
  }

  return `Te muestro ${cardsCount} opciones en las tarjetas de abajo. Si queres, te las filtro por precio, tipo o franquicia.`;
}
