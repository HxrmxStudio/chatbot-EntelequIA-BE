import { isRecord } from './object.utils';

const HARD_REDACT_KEYS = new Set([
  'access_token',
  'accesstoken',
  'api_key',
  'apikey',
  'authorization',
  'password',
  'secret',
  'signature',
  'token',
]);

const PARTIAL_MASK_LAST4_KEYS = new Set([
  'dni',
  'documento',
  'phone',
  'telefono',
  'celular',
  'whatsapp',
]);

const NAME_KEYS = new Set([
  'name',
  'first_name',
  'firstname',
  'last_name',
  'lastname',
  'nombre',
  'apellido',
]);

const REDACTED_LITERAL = '[REDACTED]';

export function redactSensitiveData(value: unknown): unknown {
  const visited = new WeakSet<object>();
  return redactRecursive(value, undefined, visited);
}

function redactRecursive(
  value: unknown,
  key: string | undefined,
  visited: WeakSet<object>,
): unknown {
  const normalizedKey = key ? normalizeKey(key) : '';

  if (shouldHardRedact(normalizedKey)) {
    return REDACTED_LITERAL;
  }

  if (shouldMaskLastFour(normalizedKey)) {
    return maskWithLastFour(value);
  }

  if (shouldRedactName(normalizedKey)) {
    return redactNameValue(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactRecursive(item, key, visited));
  }

  if (isRecord(value)) {
    if (visited.has(value)) {
      return '[CIRCULAR]';
    }

    visited.add(value);
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      output[childKey] = redactRecursive(childValue, childKey, visited);
    }
    return output;
  }

  if (typeof value === 'string') {
    return redactBearerToken(value);
  }

  return value;
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function shouldHardRedact(normalizedKey: string): boolean {
  if (normalizedKey.length === 0) {
    return false;
  }

  if (HARD_REDACT_KEYS.has(normalizedKey)) {
    return true;
  }

  return normalizedKey.includes('secret') || normalizedKey.includes('signature');
}

function shouldMaskLastFour(normalizedKey: string): boolean {
  if (normalizedKey.length === 0) {
    return false;
  }

  if (PARTIAL_MASK_LAST4_KEYS.has(normalizedKey)) {
    return true;
  }

  return normalizedKey.includes('dni') || normalizedKey.includes('phone');
}

function shouldRedactName(normalizedKey: string): boolean {
  return normalizedKey.length > 0 && NAME_KEYS.has(normalizedKey);
}

function maskWithLastFour(value: unknown): string {
  const raw = stringifyValue(value);
  if (raw.length === 0) {
    return REDACTED_LITERAL;
  }

  const digits = raw.replace(/\D+/g, '');
  if (digits.length === 0) {
    return REDACTED_LITERAL;
  }

  const suffix = digits.slice(-4);
  return `***${suffix}`;
}

function redactNameValue(value: unknown): string {
  if (typeof value !== 'string') {
    return REDACTED_LITERAL;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return REDACTED_LITERAL;
  }

  return `${trimmed[0]}***`;
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

function redactBearerToken(value: string): string {
  return value.replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
}
