export function resolveProductsQuery(entities: string[], originalText: string): string {
  const cleanedEntities = entities
    .map((entity) => (typeof entity === 'string' ? entity.trim() : ''))
    .filter((entity) => entity.length > 0)
    .map((entity) => stripVolumeHints(entity).trim())
    .filter((entity) => entity.length > 0)
    .filter((entity) => !isGenericProductsToken(entity));

  if (cleanedEntities.length === 0) {
    return stripVolumeHints(originalText).trim();
  }

  // Prefer the "most specific" entity (usually the series/title) over concatenating everything.
  return cleanedEntities.reduce((best, candidate) => (candidate.length > best.length ? candidate : best));
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

function stripVolumeHints(value: string): string {
  return value.replace(
    /(?:tomo|vol(?:umen)?|nro|n|no|numero|#)\s*0*\d{1,3}\b/gi,
    '',
  );
}

function isGenericProductsToken(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  // Keep this list small and explicit to avoid discarding relevant series tokens.
  return (
    normalized === 'manga' ||
    normalized === 'mangas' ||
    normalized === 'comic' ||
    normalized === 'comics' ||
    normalized === 'libro' ||
    normalized === 'libros' ||
    normalized === 'producto' ||
    normalized === 'productos'
  );
}
