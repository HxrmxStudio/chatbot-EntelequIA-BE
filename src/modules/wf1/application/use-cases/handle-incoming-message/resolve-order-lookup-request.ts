import { resolveOrderId } from '../enrich-context-by-intent/query-resolvers';

export interface ResolvedOrderLookupRequest {
  orderId?: number;
  identity: {
    dni?: string;
    name?: string;
    lastName?: string;
    phone?: string;
  };
  providedFactors: number;
}

const ORDER_ID_BY_KEY_PATTERN = /\b(?:order[_\s-]?id|pedido|orden|order)\s*[:=#-]?\s*(\d{1,12})\b/i;
const DNI_PATTERN = /\b(?:dni|documento)\s*[:=#-]?\s*([0-9.\-\s]{6,20})\b/i;
const PHONE_PATTERN =
  /\b(?:telefono|tel[eé]fono|celular|whatsapp|phone)\s*[:=#-]?\s*([+0-9()\-.\s]{6,30})\b/i;
const NAME_PATTERN = /\b(?:nombre|name)\s*[:=#-]?\s*([^,;\n]+)/i;
const LAST_NAME_PATTERN = /\b(?:apellido|last[_\s-]?name)\s*[:=#-]?\s*([^,;\n]+)/i;

export function resolveOrderLookupRequest(input: {
  text: string;
  entities: string[];
}): ResolvedOrderLookupRequest {
  const orderId = resolveLookupOrderId(input);
  const dni = normalizeDigits(extractValue(input.text, DNI_PATTERN));
  const name = normalizeTextValue(extractValue(input.text, NAME_PATTERN));
  const lastName = normalizeTextValue(extractValue(input.text, LAST_NAME_PATTERN));
  const phone = normalizePhoneValue(extractValue(input.text, PHONE_PATTERN));

  const providedFactors = [dni, name, lastName, phone].filter((value) => Boolean(value)).length;

  return {
    ...(orderId ? { orderId } : {}),
    identity: {
      ...(dni ? { dni } : {}),
      ...(name ? { name } : {}),
      ...(lastName ? { lastName } : {}),
      ...(phone ? { phone } : {}),
    },
    providedFactors,
  };
}

function resolveLookupOrderId(input: { text: string; entities: string[] }): number | undefined {
  const fromResolver = resolveOrderId(input.entities, input.text);
  const parsedFromResolver = toPositiveInt(fromResolver);
  if (parsedFromResolver) {
    return parsedFromResolver;
  }

  const byKeyMatch = input.text.match(ORDER_ID_BY_KEY_PATTERN);
  const parsedByKey = toPositiveInt(byKeyMatch?.[1]);
  if (parsedByKey) {
    return parsedByKey;
  }

  const trimmedText = input.text.trim();
  if (/^\d{1,12}$/.test(trimmedText)) {
    return toPositiveInt(trimmedText);
  }

  return undefined;
}

function extractValue(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);
  if (!match?.[1]) {
    return undefined;
  }

  const trimmed = match[1].trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeDigits(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const digits = value.replace(/\D+/g, '');
  return digits.length > 0 ? digits : undefined;
}

function normalizeTextValue(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizePhoneValue(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}
