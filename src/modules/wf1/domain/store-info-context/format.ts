import type { StoreInfoAiContext, StoreInfoQueryType, StoreInfoTemplates } from './types';

/**
 * Builds an AI-ready context block for store_info intent.
 * 
 * @param input.templates - REQUIRED. Templates must be provided by the adapter (no fallbacks).
 */
export function buildStoreInfoAiContext(input: {
  infoRequested: StoreInfoQueryType;
  templates: StoreInfoTemplates;
}): StoreInfoAiContext {
  const section = resolveSection(input.infoRequested, input.templates);

  const lines: string[] = [section, '', input.templates.instructions];

  return {
    contextText: lines.join('\n'),
    infoRequested: input.infoRequested,
  };
}

function resolveSection(
  infoRequested: StoreInfoQueryType,
  templates: StoreInfoTemplates,
): string {
  switch (infoRequested) {
    case 'location':
      return templates.locationContext;
    case 'hours':
      return templates.hoursContext;
    case 'parking':
      return templates.parkingContext;
    case 'transport':
      return templates.transportContext;
    case 'general':
    default:
      return templates.generalContext;
  }
}
