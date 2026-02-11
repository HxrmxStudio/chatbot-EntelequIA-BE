import type { StoreInfoQueryType } from '@/modules/wf1/domain/store-info-context';
import { normalizeForToken } from './normalize';
import {
  STORE_INFO_HOURS_PATTERN,
  STORE_INFO_LOCATION_PATTERN,
  STORE_INFO_PARKING_PATTERN,
  STORE_INFO_TRANSPORT_PATTERN,
} from './patterns';

/**
 * Resolves store_info query subtype with deterministic rioplatense-first heuristics.
 */
export function resolveStoreInfoQueryType(input: {
  text: string;
  entities: string[];
}): StoreInfoQueryType {
  const normalized = [input.text, ...input.entities]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => normalizeForToken(value))
    .filter((value) => value.length > 0)
    .join(' ');

  if (normalized.length === 0) {
    return 'general';
  }

  if (STORE_INFO_TRANSPORT_PATTERN.test(normalized)) {
    return 'transport';
  }

  if (STORE_INFO_PARKING_PATTERN.test(normalized)) {
    return 'parking';
  }

  if (STORE_INFO_HOURS_PATTERN.test(normalized)) {
    return 'hours';
  }

  if (STORE_INFO_LOCATION_PATTERN.test(normalized)) {
    return 'location';
  }

  return 'general';
}
