import { formatMoney } from '@/modules/wf1/domain/money';
import type { CatalogSnapshotItem } from '@/modules/wf1/domain/ui-payload';

export function buildPriceComparisonMissingSnapshotMessage(): string {
  return 'No tengo una lista reciente de productos en esta conversacion. Si queres, te muestro opciones y te digo al toque cual es el mas barato.';
}

export function buildCheapestPriceMessage(input: {
  item: CatalogSnapshotItem;
  comparedCount: number;
}): string {
  const price = formatMoney({
    amount: input.item.amount,
    currency: input.item.currency,
  });

  return `De los ${input.comparedCount} productos que te mostre, el mas barato es "${input.item.title}" por ${price}.`;
}

export function buildMostExpensivePriceMessage(input: {
  item: CatalogSnapshotItem;
  comparedCount: number;
}): string {
  const price = formatMoney({
    amount: input.item.amount,
    currency: input.item.currency,
  });

  return `De los ${input.comparedCount} productos que te mostre, el mas caro es "${input.item.title}" por ${price}.`;
}
