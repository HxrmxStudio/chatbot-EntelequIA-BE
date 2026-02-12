import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { createLogger } from '@/common/utils/logger';
import type {
  OrderLookupRateLimitDecision,
  OrderLookupRateLimitScope,
  OrderLookupRateLimiterPort,
} from '@/modules/wf1/application/ports/order-lookup-rate-limiter.port';

const DEFAULT_WINDOW_MS = 900_000;
const DEFAULT_IP_MAX = 8;
const DEFAULT_USER_MAX = 6;
const DEFAULT_ORDER_MAX = 4;

const RATE_LIMIT_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local member = ARGV[3]
local keysCount = #KEYS

for i = 1, keysCount do
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now - window)
  local count = redis.call('ZCARD', KEYS[i])
  local limit = tonumber(ARGV[3 + i])
  if count >= limit then
    redis.call('PEXPIRE', KEYS[i], window)
    return {0, i}
  end
end

for i = 1, keysCount do
  redis.call('ZADD', KEYS[i], now, member)
  redis.call('PEXPIRE', KEYS[i], window)
end

return {1, 0}
`.trim();

interface RedisCommandClient {
  isOpen: boolean;
  connect(): Promise<void>;
  sendCommand(args: string[]): Promise<unknown>;
}

type RedisClientFactory = (url: string) => RedisCommandClient;

interface RateLimitDimension {
  scope: OrderLookupRateLimitScope;
  key: string;
  limit: number;
}

@Injectable()
export class RedisOrderLookupRateLimiterAdapter implements OrderLookupRateLimiterPort {
  private readonly logger = createLogger(RedisOrderLookupRateLimiterAdapter.name);
  private readonly enabled: boolean;
  private readonly redisUrl: string;
  private readonly windowMs: number;
  private readonly ipMax: number;
  private readonly userMax: number;
  private readonly orderMax: number;
  private clientPromise?: Promise<RedisCommandClient | null>;
  private hasLoggedMissingRedisConfig = false;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    private readonly clientFactory: RedisClientFactory = defaultRedisClientFactory,
  ) {
    this.enabled = resolveBoolean(
      this.configService.get<string | boolean>('ORDER_LOOKUP_RATE_LIMIT_ENABLED'),
      true,
    );
    this.redisUrl = String(this.configService.get<string>('REDIS_URL') ?? '').trim();
    this.windowMs = Math.max(
      1_000,
      this.configService.get<number>('ORDER_LOOKUP_RATE_LIMIT_WINDOW_MS') ?? DEFAULT_WINDOW_MS,
    );
    this.ipMax = Math.max(
      1,
      this.configService.get<number>('ORDER_LOOKUP_RATE_LIMIT_IP_MAX') ?? DEFAULT_IP_MAX,
    );
    this.userMax = Math.max(
      1,
      this.configService.get<number>('ORDER_LOOKUP_RATE_LIMIT_USER_MAX') ?? DEFAULT_USER_MAX,
    );
    this.orderMax = Math.max(
      1,
      this.configService.get<number>('ORDER_LOOKUP_RATE_LIMIT_ORDER_MAX') ?? DEFAULT_ORDER_MAX,
    );
  }

  async consume(input: {
    requestId: string;
    userId?: string;
    conversationId: string;
    orderId: number;
    clientIp?: string;
  }): Promise<OrderLookupRateLimitDecision> {
    if (!this.enabled) {
      return { allowed: true, degraded: false };
    }

    const dimensions = this.buildDimensions(input);
    if (dimensions.length === 0) {
      return { allowed: true, degraded: false };
    }

    const client = await this.resolveClient(input.requestId);
    if (!client) {
      return { allowed: true, degraded: true };
    }

    const nowMs = Date.now();
    const member = `${nowMs}:${input.requestId}:${randomUUID().slice(0, 8)}`;
    const keys = dimensions.map((dimension) => dimension.key);
    const argumentsList = [
      String(nowMs),
      String(this.windowMs),
      member,
      ...dimensions.map((dimension) => String(dimension.limit)),
    ];

    try {
      const result = await client.sendCommand([
        'EVAL',
        RATE_LIMIT_SCRIPT,
        String(keys.length),
        ...keys,
        ...argumentsList,
      ]);
      const parsed = parseScriptResult(result);

      if (parsed.allowed) {
        return { allowed: true, degraded: false };
      }

      const blockedBy = dimensions[parsed.blockedIndex - 1]?.scope;
      return blockedBy
        ? { allowed: false, degraded: false, blockedBy }
        : { allowed: false, degraded: false };
    } catch (error: unknown) {
      this.clientPromise = undefined;
      this.logger.warn('order_lookup_rate_limit_degraded', {
        event: 'order_lookup_rate_limit_degraded',
        request_id: input.requestId,
        error_type: error instanceof Error ? error.name : 'UnknownError',
      });
      return { allowed: true, degraded: true };
    }
  }

  private buildDimensions(input: {
    userId?: string;
    orderId: number;
    clientIp?: string;
  }): RateLimitDimension[] {
    const dimensions: RateLimitDimension[] = [];
    const normalizedIp = normalizeClientIp(input.clientIp);
    if (normalizedIp) {
      dimensions.push({
        scope: 'ip',
        key: buildRateLimitKey('ip', normalizedIp),
        limit: this.ipMax,
      });
    }

    const normalizedUserId = normalizeOptionalValue(input.userId);
    if (normalizedUserId) {
      dimensions.push({
        scope: 'user',
        key: buildRateLimitKey('user', normalizedUserId),
        limit: this.userMax,
      });
    }

    dimensions.push({
      scope: 'order',
      key: buildRateLimitKey('order', String(input.orderId)),
      limit: this.orderMax,
    });

    return dimensions;
  }

  private async resolveClient(requestId: string): Promise<RedisCommandClient | null> {
    if (this.redisUrl.length === 0) {
      this.logMissingRedisConfig(requestId);
      return null;
    }

    if (!this.clientPromise) {
      this.clientPromise = this.connectClient(requestId);
    }

    return this.clientPromise;
  }

  private async connectClient(requestId: string): Promise<RedisCommandClient | null> {
    try {
      const client = this.clientFactory(this.redisUrl);
      if (!client.isOpen) {
        await client.connect();
      }
      return client;
    } catch (error: unknown) {
      this.clientPromise = undefined;
      this.logger.warn('order_lookup_rate_limit_degraded', {
        event: 'order_lookup_rate_limit_degraded',
        request_id: requestId,
        error_type: error instanceof Error ? error.name : 'UnknownError',
      });
      return null;
    }
  }

  private logMissingRedisConfig(requestId: string): void {
    if (this.hasLoggedMissingRedisConfig) {
      return;
    }

    this.hasLoggedMissingRedisConfig = true;
    this.logger.warn('order_lookup_rate_limit_degraded', {
      event: 'order_lookup_rate_limit_degraded',
      request_id: requestId,
      reason: 'missing_redis_url',
    });
  }
}

function defaultRedisClientFactory(url: string): RedisCommandClient {
  return createClient({ url }) as unknown as RedisCommandClient;
}

function buildRateLimitKey(scope: OrderLookupRateLimitScope, value: string): string {
  const hash = createHash('sha256').update(value).digest('hex');
  return `wf1:order_lookup:${scope}:${hash}`;
}

function normalizeOptionalValue(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeClientIp(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const first = value.split(',')[0]?.trim().toLowerCase();
  if (!first) {
    return null;
  }

  if (first.startsWith('::ffff:')) {
    return first.slice(7);
  }

  return first;
}

function parseScriptResult(value: unknown): { allowed: boolean; blockedIndex: number } {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error('Invalid Redis script response');
  }

  const allowedFlag = parseRedisInteger(value[0]);
  const blockedIndex = parseRedisInteger(value[1]);

  return {
    allowed: allowedFlag === 1,
    blockedIndex: Math.max(0, blockedIndex),
  };
}

function parseRedisInteger(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value, 10);
  }

  if (Buffer.isBuffer(value)) {
    const decoded = value.toString('utf8').trim();
    if (/^-?\d+$/.test(decoded)) {
      return Number.parseInt(decoded, 10);
    }
  }

  throw new Error('Redis script returned a non-integer value');
}

function resolveBoolean(value: string | boolean | undefined, fallback: boolean): boolean {
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
