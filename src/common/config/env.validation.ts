export interface AppEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  CHATBOT_DB_URL: string;
  ENTELEQUIA_API_BASE_URL: string;
  ENTELEQUIA_WEB_BASE_URL: string;
  ENTELEQUIA_API_TIMEOUT_MS: number;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL: string;
  OPENAI_TIMEOUT_MS: number;
  WEBHOOK_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  WHATSAPP_SECRET?: string;
  ALLOWED_ORIGINS: string[];
  LOG_LEVEL: 'debug' | 'log' | 'info' | 'warn' | 'error';
  CHAT_HISTORY_LIMIT: number;
}

function parseNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number value: ${String(value)}`);
  }

  return parsed;
}

function parseOrigins(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function parseNodeEnv(value: unknown): AppEnv['NODE_ENV'] {
  if (value === 'production' || value === 'test') {
    return value;
  }

  return 'development';
}

function parseLogLevel(value: unknown): AppEnv['LOG_LEVEL'] {
  if (value === 'debug' || value === 'warn' || value === 'error') {
    return value;
  }
  if (value === 'info' || value === 'log') {
    return value as 'info' | 'log';
  }

  return 'log';
}

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const NODE_ENV = parseNodeEnv(config.NODE_ENV);
  const CHATBOT_DB_URL = String(config.CHATBOT_DB_URL ?? '').trim();
  const ENTELEQUIA_API_BASE_URL = String(config.ENTELEQUIA_API_BASE_URL ?? '').trim();
  const ENTELEQUIA_WEB_BASE_URL =
    String(config.ENTELEQUIA_WEB_BASE_URL ?? '').trim() || 'https://entelequia.com.ar';
  const WEBHOOK_SECRET = String(config.WEBHOOK_SECRET ?? '').trim() || undefined;
  const TURNSTILE_SECRET_KEY =
    String(config.TURNSTILE_SECRET_KEY ?? '').trim() || undefined;

  if (CHATBOT_DB_URL.length === 0) {
    throw new Error('CHATBOT_DB_URL is required');
  }

  if (ENTELEQUIA_API_BASE_URL.length === 0) {
    throw new Error('ENTELEQUIA_API_BASE_URL is required');
  }

  // Production hardening: require at least one web anti-abuse mechanism.
  // Turnstile is recommended; WEBHOOK_SECRET is supported for backward compatibility.
  if (NODE_ENV === 'production' && !TURNSTILE_SECRET_KEY && !WEBHOOK_SECRET) {
    throw new Error(
      'TURNSTILE_SECRET_KEY (recommended) or WEBHOOK_SECRET is required in production',
    );
  }

  return {
    NODE_ENV,
    PORT: parseNumber(config.PORT, 3090),
    CHATBOT_DB_URL,
    ENTELEQUIA_API_BASE_URL,
    ENTELEQUIA_WEB_BASE_URL,
    ENTELEQUIA_API_TIMEOUT_MS: parseNumber(config.ENTELEQUIA_API_TIMEOUT_MS, 8000),
    OPENAI_API_KEY: String(config.OPENAI_API_KEY ?? '').trim() || undefined,
    OPENAI_MODEL: String(config.OPENAI_MODEL ?? 'gpt-4.1-mini').trim(),
    OPENAI_TIMEOUT_MS: parseNumber(config.OPENAI_TIMEOUT_MS, 12000),
    WEBHOOK_SECRET,
    TURNSTILE_SECRET_KEY,
    WHATSAPP_SECRET: String(config.WHATSAPP_SECRET ?? '').trim() || undefined,
    ALLOWED_ORIGINS: parseOrigins(config.ALLOWED_ORIGINS),
    LOG_LEVEL: parseLogLevel(config.LOG_LEVEL),
    CHAT_HISTORY_LIMIT: parseNumber(config.CHAT_HISTORY_LIMIT, 10),
  };
}
