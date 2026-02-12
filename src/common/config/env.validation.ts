export interface AppEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  CHATBOT_DB_URL: string;
  ENTELEQUIA_BASE_URL: string;
  ENTELEQUIA_API_BASE_URL: string;
  ENTELEQUIA_WEB_BASE_URL: string;
  ENTELEQUIA_API_TIMEOUT_MS: number;
  BOT_ORDER_LOOKUP_HMAC_SECRET: string;
  BOT_ORDER_LOOKUP_TIMEOUT_MS: number;
  BOT_ORDER_LOOKUP_RETRY_MAX: number;
  BOT_ORDER_LOOKUP_RETRY_BACKOFF_MS: number;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL: string;
  OPENAI_TIMEOUT_MS: number;
  WF1_FINAL_REPLY_STRUCTURED_OUTPUT: boolean;
  WF1_FINAL_REPLY_ROLLOUT_PERCENT: number;
  WF1_EVAL_ENABLED: boolean;
  WF1_EVAL_MODEL: string;
  WF1_EVAL_DAILY_CAP: number;
  WF1_EVAL_TIMEOUT_MS: number;
  WF1_EVAL_SAMPLE_RANDOM_PERCENT: number;
  WF1_EVAL_LOW_SCORE_THRESHOLD: number;
  WF1_UI_CARDS_ENABLED: boolean;
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

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return fallback;
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
  const ENTELEQUIA_BASE_URL = String(config.ENTELEQUIA_BASE_URL ?? '').trim();
  const ENTELEQUIA_API_BASE_URL = String(config.ENTELEQUIA_API_BASE_URL ?? '').trim();
  const resolvedEntelequiaBaseUrl =
    ENTELEQUIA_BASE_URL.length > 0 ? ENTELEQUIA_BASE_URL : ENTELEQUIA_API_BASE_URL;
  const ENTELEQUIA_WEB_BASE_URL =
    String(config.ENTELEQUIA_WEB_BASE_URL ?? '').trim() || 'https://entelequia.com.ar';
  const BOT_ORDER_LOOKUP_HMAC_SECRET =
    String(config.BOT_ORDER_LOOKUP_HMAC_SECRET ?? '').trim();
  const TURNSTILE_SECRET_KEY =
    String(config.TURNSTILE_SECRET_KEY ?? '').trim() || undefined;

  if (CHATBOT_DB_URL.length === 0) {
    throw new Error('CHATBOT_DB_URL is required');
  }

  if (resolvedEntelequiaBaseUrl.length === 0) {
    throw new Error('ENTELEQUIA_BASE_URL (or ENTELEQUIA_API_BASE_URL) is required');
  }

  if (BOT_ORDER_LOOKUP_HMAC_SECRET.length === 0) {
    throw new Error('BOT_ORDER_LOOKUP_HMAC_SECRET is required');
  }

  // Production hardening for web channel: require Turnstile anti-bot verification.
  if (NODE_ENV === 'production' && !TURNSTILE_SECRET_KEY) {
    throw new Error('TURNSTILE_SECRET_KEY is required in production');
  }

  return {
    NODE_ENV,
    PORT: parseNumber(config.PORT, 3090),
    CHATBOT_DB_URL,
    ENTELEQUIA_BASE_URL: resolvedEntelequiaBaseUrl,
    ENTELEQUIA_API_BASE_URL:
      ENTELEQUIA_API_BASE_URL.length > 0 ? ENTELEQUIA_API_BASE_URL : resolvedEntelequiaBaseUrl,
    ENTELEQUIA_WEB_BASE_URL,
    ENTELEQUIA_API_TIMEOUT_MS: parseNumber(config.ENTELEQUIA_API_TIMEOUT_MS, 8000),
    BOT_ORDER_LOOKUP_HMAC_SECRET,
    BOT_ORDER_LOOKUP_TIMEOUT_MS: Math.max(
      1000,
      parseNumber(config.BOT_ORDER_LOOKUP_TIMEOUT_MS, 8000),
    ),
    BOT_ORDER_LOOKUP_RETRY_MAX: Math.max(0, parseNumber(config.BOT_ORDER_LOOKUP_RETRY_MAX, 1)),
    BOT_ORDER_LOOKUP_RETRY_BACKOFF_MS: Math.max(
      0,
      parseNumber(config.BOT_ORDER_LOOKUP_RETRY_BACKOFF_MS, 500),
    ),
    OPENAI_API_KEY: String(config.OPENAI_API_KEY ?? '').trim() || undefined,
    OPENAI_MODEL: String(config.OPENAI_MODEL ?? 'gpt-4.1-mini').trim(),
    OPENAI_TIMEOUT_MS: parseNumber(config.OPENAI_TIMEOUT_MS, 12000),
    WF1_FINAL_REPLY_STRUCTURED_OUTPUT: parseBoolean(
      config.WF1_FINAL_REPLY_STRUCTURED_OUTPUT,
      false,
    ),
    WF1_FINAL_REPLY_ROLLOUT_PERCENT: Math.min(
      100,
      Math.max(0, parseNumber(config.WF1_FINAL_REPLY_ROLLOUT_PERCENT, 0)),
    ),
    WF1_EVAL_ENABLED: parseBoolean(config.WF1_EVAL_ENABLED, false),
    WF1_EVAL_MODEL: String(config.WF1_EVAL_MODEL ?? 'gpt-4o-mini').trim(),
    WF1_EVAL_DAILY_CAP: Math.max(0, parseNumber(config.WF1_EVAL_DAILY_CAP, 200)),
    WF1_EVAL_TIMEOUT_MS: Math.max(1000, parseNumber(config.WF1_EVAL_TIMEOUT_MS, 10_000)),
    WF1_EVAL_SAMPLE_RANDOM_PERCENT: Math.min(
      100,
      Math.max(0, parseNumber(config.WF1_EVAL_SAMPLE_RANDOM_PERCENT, 5)),
    ),
    WF1_EVAL_LOW_SCORE_THRESHOLD: Math.min(
      1,
      Math.max(0, parseNumber(config.WF1_EVAL_LOW_SCORE_THRESHOLD, 0.6)),
    ),
    WF1_UI_CARDS_ENABLED: parseBoolean(config.WF1_UI_CARDS_ENABLED, false),
    TURNSTILE_SECRET_KEY,
    WHATSAPP_SECRET: String(config.WHATSAPP_SECRET ?? '').trim() || undefined,
    ALLOWED_ORIGINS: parseOrigins(config.ALLOWED_ORIGINS),
    LOG_LEVEL: parseLogLevel(config.LOG_LEVEL),
    CHAT_HISTORY_LIMIT: parseNumber(config.CHAT_HISTORY_LIMIT, 10),
  };
}
