export type OrderLookupInvalidFactor = 'dni' | 'name' | 'lastName' | 'phone';

export interface ResolvedOrderLookupRequest {
  orderId?: number;
  identity: {
    dni?: string;
    name?: string;
    lastName?: string;
    phone?: string;
  };
  providedFactors: number;
  invalidFactors: OrderLookupInvalidFactor[];
}

const ORDER_ID_BY_KEY_PATTERN = /\b(?:order[_\s-]?id|pedido|orden|order)\s*[:=#-]?\s*(\d{1,12})\b/i;
const ORDER_ID_BY_HASH_PATTERN = /#\s*(\d{1,12})\b/;
const DNI_PATTERN = /\b(?:dni|documento)\s*[:=#-]?\s*([0-9.\-\s]{1,20})\b/i;
const PHONE_PATTERN =
  /\b(?:telefono|tel[eé]fono|celular|whatsapp|phone)\s*[:=#-]?\s*([+0-9()\-.\s]{1,30})\b/i;
const NAME_PATTERN = /\b(?:nombre|name)\s*[:=#-]?\s*([^,;\n]+)/i;
const LAST_NAME_PATTERN = /\b(?:apellido|last[_\s-]?name)\s*[:=#-]?\s*([^,;\n]+)/i;
const NAME_VALUE_PATTERN = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ'\-\s]{1,50}$/;
const PHONE_VALUE_PATTERN = /^\+?\d{8,20}$/;
const NAME_STOP_WORDS = new Set([
  'quiero',
  'saber',
  'estado',
  'pedido',
  'orden',
  'donde',
  'esta',
  'tenes',
  'tienes',
  'gracias',
  'ayuda',
  'consultar',
  'consulta',
  'favor',
  'dale',
  'nro',
  'numero',
  'tomo',
  'manga',
  'comic',
  'producto',
  'necesito',
  'estado',
  'mi',
]);

export function resolveOrderLookupRequest(input: {
  text: string;
  entities: string[];
}): ResolvedOrderLookupRequest {
  const orderId = resolveLookupOrderId(input);
  const dni = resolveDniValue(extractValue(input.text, DNI_PATTERN));
  const name = resolveNameValue(extractValue(input.text, NAME_PATTERN));
  const lastName = resolveNameValue(extractValue(input.text, LAST_NAME_PATTERN));
  const phone = resolvePhoneValue(extractValue(input.text, PHONE_PATTERN));
  const inferredIdentity = resolveUnlabeledIdentity({
    text: input.text,
    orderId,
    existing: {
      dni: dni.value,
      name: name.value,
      lastName: lastName.value,
      phone: phone.value,
    },
  });

  const resolvedDni = dni.value ?? inferredIdentity.dni;
  const resolvedName = name.value ?? inferredIdentity.name;
  const resolvedLastName = lastName.value ?? inferredIdentity.lastName;
  const resolvedPhone = phone.value ?? inferredIdentity.phone;

  const providedFactors = [resolvedDni, resolvedName, resolvedLastName, resolvedPhone].filter(
    (value) => Boolean(value),
  ).length;
  const invalidFactors: OrderLookupInvalidFactor[] = [];
  if (dni.invalid) {
    invalidFactors.push('dni');
  }
  if (name.invalid) {
    invalidFactors.push('name');
  }
  if (lastName.invalid) {
    invalidFactors.push('lastName');
  }
  if (phone.invalid) {
    invalidFactors.push('phone');
  }

  return {
    ...(orderId ? { orderId } : {}),
    identity: {
      ...(resolvedDni ? { dni: resolvedDni } : {}),
      ...(resolvedName ? { name: resolvedName } : {}),
      ...(resolvedLastName ? { lastName: resolvedLastName } : {}),
      ...(resolvedPhone ? { phone: resolvedPhone } : {}),
    },
    providedFactors,
    invalidFactors,
  };
}

function resolveLookupOrderId(input: { text: string; entities: string[] }): number | undefined {
  const byKeyMatch = input.text.match(ORDER_ID_BY_KEY_PATTERN);
  const parsedByKey = toPositiveInt(byKeyMatch?.[1], 12);
  if (parsedByKey) {
    return parsedByKey;
  }

  const byHashMatch = input.text.match(ORDER_ID_BY_HASH_PATTERN);
  const parsedByHash = toPositiveInt(byHashMatch?.[1], 12);
  if (parsedByHash) {
    return parsedByHash;
  }

  const trimmedText = input.text.trim();
  if (/^\d{1,12}$/.test(trimmedText)) {
    return toPositiveInt(trimmedText, 12);
  }

  const fromEntities = resolveOrderIdFromEntities(input.entities);
  if (fromEntities) {
    return fromEntities;
  }

  return undefined;
}

function resolveOrderIdFromEntities(entities: string[]): number | undefined {
  for (const entity of entities) {
    if (typeof entity !== 'string') {
      continue;
    }

    const byKeyMatch = entity.match(ORDER_ID_BY_KEY_PATTERN);
    const parsedByKey = toPositiveInt(byKeyMatch?.[1], 12);
    if (parsedByKey) {
      return parsedByKey;
    }

    const byHashMatch = entity.match(ORDER_ID_BY_HASH_PATTERN);
    const parsedByHash = toPositiveInt(byHashMatch?.[1], 12);
    if (parsedByHash) {
      return parsedByHash;
    }
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

function resolveDniValue(value?: string): { value?: string; invalid: boolean } {
  if (!value) {
    return { invalid: false };
  }

  const digits = value.replace(/\D+/g, '');
  if (/^\d{7,8}$/.test(digits)) {
    return { value: digits, invalid: false };
  }

  return { invalid: true };
}

function resolveNameValue(value?: string): { value?: string; invalid: boolean } {
  if (!value) {
    return { invalid: false };
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (NAME_VALUE_PATTERN.test(normalized)) {
    return { value: normalized, invalid: false };
  }

  return { invalid: true };
}

function resolvePhoneValue(value?: string): { value?: string; invalid: boolean } {
  if (!value) {
    return { invalid: false };
  }

  const normalized = normalizePhoneCandidate(value);
  if (PHONE_VALUE_PATTERN.test(normalized)) {
    return { value: normalized, invalid: false };
  }

  return { invalid: true };
}

function resolveUnlabeledIdentity(input: {
  text: string;
  orderId?: number;
  existing: {
    dni?: string;
    name?: string;
    lastName?: string;
    phone?: string;
  };
}): {
  dni?: string;
  name?: string;
  lastName?: string;
  phone?: string;
} {
  let dni = input.existing.dni;
  let name = input.existing.name;
  let lastName = input.existing.lastName;
  let phone = input.existing.phone;
  const orderIdValue = typeof input.orderId === 'number' ? String(input.orderId) : null;

  for (const segment of extractUnlabeledSegments(input.text)) {
    if (isLabeledSegment(segment)) {
      if (!name || !lastName) {
        const trailingNames = resolveNamePartsFromLabeledSegment(segment);
        if (!name && trailingNames.name) {
          name = trailingNames.name;
        }

        if (!lastName && trailingNames.lastName) {
          lastName = trailingNames.lastName;
        }
      }

      continue;
    }

    const digits = segment.replace(/\D+/g, '');
    if (digits.length > 0) {
      if (orderIdValue && digits === orderIdValue) {
        continue;
      }

      if (!dni && /^\d{7,8}$/.test(digits)) {
        dni = digits;
        continue;
      }

      if (!phone) {
        const phoneCandidate = normalizePhoneCandidate(segment);
        if (phoneCandidate.length > 0 && PHONE_VALUE_PATTERN.test(phoneCandidate)) {
          phone = phoneCandidate;
          continue;
        }
      }
    }

    if (!name || !lastName) {
      const names = resolveNamePartsFromSegment(segment);
      if (!name && names.name) {
        name = names.name;
      }

      if (!lastName && names.lastName) {
        lastName = names.lastName;
      }
    }
  }

  return {
    ...(dni ? { dni } : {}),
    ...(name ? { name } : {}),
    ...(lastName ? { lastName } : {}),
    ...(phone ? { phone } : {}),
  };
}

function extractUnlabeledSegments(text: string): string[] {
  const segments = text
    .split(/[,;\n]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length > 1) {
    return segments;
  }

  return [text.trim()].filter((segment) => segment.length > 0);
}

function isLabeledSegment(value: string): boolean {
  return /\b(?:order[_\s-]?id|pedido|orden|order|dni|documento|telefono|tel[eé]fono|celular|whatsapp|phone|nombre|name|apellido|last[_\s-]?name)\b/i.test(
    value,
  );
}

function resolveNamePartsFromSegment(value: string): {
  name?: string;
  lastName?: string;
} {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!NAME_VALUE_PATTERN.test(normalized)) {
    return {};
  }

  const words = normalized.split(' ').filter((word) => word.length > 0);
  if (words.length !== 2) {
    return {};
  }

  const [firstName, resolvedLastName] = words;
  if (NAME_STOP_WORDS.has(firstName.toLowerCase()) || NAME_STOP_WORDS.has(resolvedLastName.toLowerCase())) {
    return {};
  }
  const isFirstNameValid = NAME_VALUE_PATTERN.test(firstName);
  const isLastNameValid = NAME_VALUE_PATTERN.test(resolvedLastName);

  return {
    ...(isFirstNameValid ? { name: firstName } : {}),
    ...(isLastNameValid ? { lastName: resolvedLastName } : {}),
  };
}

function resolveNamePartsFromLabeledSegment(value: string): {
  name?: string;
  lastName?: string;
} {
  const stripped = value
    .replace(/\b(?:order[_\s-]?id|pedido|orden|order)\s*[:=#-]?\s*#?\s*\d{1,12}\b/gi, ' ')
    .replace(/\b(?:dni|documento)\s*[:=#-]?\s*[0-9.\-\s]{1,20}\b/gi, ' ')
    .replace(
      /\b(?:telefono|tel[eé]fono|celular|whatsapp|phone)\s*[:=#-]?\s*[+0-9()\-.\s]{1,30}\b/gi,
      ' ',
    )
    .replace(/\b(?:nombre|name|apellido|last[_\s-]?name)\s*[:=#-]?\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return resolveNamePartsFromSegment(stripped);
}

function normalizePhoneCandidate(value: string): string {
  return value.replace(/[().\-\s]/g, '').trim();
}

function toPositiveInt(value: unknown, maxDigits: number): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized) || normalized.length > maxDigits) {
    return undefined;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}
