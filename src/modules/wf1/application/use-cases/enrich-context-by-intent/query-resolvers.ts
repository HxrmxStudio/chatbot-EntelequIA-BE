export function resolveProductsQuery(entities: string[], originalText: string): string {
  const cleanedEntities = entities
    .map((entity) => entity.trim())
    .filter((entity) => entity.length > 0);

  if (cleanedEntities.length === 0) {
    return originalText;
  }

  return cleanedEntities.join(' ');
}

export function resolveOrderId(entities: string[], originalText: string): string | undefined {
  const candidates = [...entities, originalText];

  for (const candidate of candidates) {
    const match = candidate.match(/(?:pedido|orden|order)?\s*#?\s*(\d{1,12})/i);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}
