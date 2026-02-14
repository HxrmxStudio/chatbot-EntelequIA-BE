import type { AppEnv } from '@/common/config/env.validation';
import { createLogger } from '@/common/utils/logger';

type CorsOriginCallback = (error: Error | null, allow?: boolean) => void;

export type CorsOriginHandler = (
  origin: string | undefined,
  callback: CorsOriginCallback,
) => void;

const corsLogger = createLogger('CorsPolicy');

export function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase();
  }
}

export function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  return allowedOrigins.some(
    (candidate) => normalizeOrigin(candidate) === normalizedOrigin,
  );
}

export function resolveCorsMode(env: Pick<AppEnv, 'NODE_ENV'>): 'development_permissive' | 'production_strict' {
  if (env.NODE_ENV === 'production') {
    return 'production_strict';
  }

  return 'development_permissive';
}

export function buildCorsOriginHandler(
  env: Pick<AppEnv, 'NODE_ENV' | 'ALLOWED_ORIGINS'>,
): CorsOriginHandler {
  const corsMode = resolveCorsMode(env);
  const normalizedAllowedOrigins = env.ALLOWED_ORIGINS.map((origin) =>
    normalizeOrigin(origin),
  );

  return (origin, callback) => {
    if (corsMode === 'development_permissive') {
      callback(null, true);
      return;
    }

    if (!origin) {
      callback(null, true);
      return;
    }

    const allowed = normalizedAllowedOrigins.includes(normalizeOrigin(origin));
    if (allowed) {
      callback(null, true);
      return;
    }

    corsLogger.warn('cors_origin_rejected', {
      event: 'cors_origin_rejected',
      origin,
      allowedOriginsCount: normalizedAllowedOrigins.length,
    });
    callback(new Error('Origin not allowed by CORS'));
  };
}
