import type { ConfigService } from '@nestjs/config';

const API_PREFIX = '/api/v1';

export function resolveEntelequiaApiBaseUrl(
  configService: Pick<ConfigService, 'get'>,
): string {
  const preferred = String(configService.get<string>('ENTELEQUIA_BASE_URL') ?? '').trim();
  const legacy = String(configService.get<string>('ENTELEQUIA_API_BASE_URL') ?? '').trim();
  const rawBase = preferred.length > 0 ? preferred : legacy;
  const normalizedBase = rawBase.replace(/\/$/, '');

  if (normalizedBase.length === 0) {
    return '';
  }

  if (normalizedBase.endsWith(API_PREFIX)) {
    return normalizedBase;
  }

  return `${normalizedBase}${API_PREFIX}`;
}
