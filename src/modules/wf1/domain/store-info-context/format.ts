import {
  DEFAULT_STORE_INFO_GENERAL_CONTEXT,
  DEFAULT_STORE_INFO_HOURS_CONTEXT,
  DEFAULT_STORE_INFO_INSTRUCTIONS,
  DEFAULT_STORE_INFO_LOCATION_CONTEXT,
  DEFAULT_STORE_INFO_PARKING_CONTEXT,
  DEFAULT_STORE_INFO_TRANSPORT_CONTEXT,
} from './constants';
import type { StoreInfoAiContext, StoreInfoQueryType, StoreInfoTemplates } from './types';

/**
 * Builds an AI-ready context block for store_info intent.
 */
export function buildStoreInfoAiContext(input: {
  infoRequested: StoreInfoQueryType;
  templates?: Partial<StoreInfoTemplates>;
}): StoreInfoAiContext {
  const templates = resolveTemplates(input.templates);
  const section = resolveSection(input.infoRequested, templates);

  const lines: string[] = [section, '', templates.instructions];

  return {
    contextText: lines.join('\n'),
    infoRequested: input.infoRequested,
  };
}

function resolveTemplates(partial?: Partial<StoreInfoTemplates>): StoreInfoTemplates {
  return {
    locationContext: partial?.locationContext ?? DEFAULT_STORE_INFO_LOCATION_CONTEXT,
    hoursContext: partial?.hoursContext ?? DEFAULT_STORE_INFO_HOURS_CONTEXT,
    parkingContext: partial?.parkingContext ?? DEFAULT_STORE_INFO_PARKING_CONTEXT,
    transportContext:
      partial?.transportContext ?? DEFAULT_STORE_INFO_TRANSPORT_CONTEXT,
    generalContext: partial?.generalContext ?? DEFAULT_STORE_INFO_GENERAL_CONTEXT,
    instructions: partial?.instructions ?? DEFAULT_STORE_INFO_INSTRUCTIONS,
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
