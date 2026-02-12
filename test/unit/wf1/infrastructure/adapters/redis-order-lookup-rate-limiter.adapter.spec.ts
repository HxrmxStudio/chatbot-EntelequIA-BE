import type { ConfigService } from '@nestjs/config';
import { RedisOrderLookupRateLimiterAdapter } from '@/modules/wf1/infrastructure/adapters/rate-limit';

describe('RedisOrderLookupRateLimiterAdapter', () => {
  it('allows lookup when redis script accepts request', async () => {
    const sendCommand = jest.fn().mockResolvedValue([1, 0]);
    const client = {
      isOpen: false,
      connect: jest.fn().mockResolvedValue(undefined),
      sendCommand,
    };

    const adapter = buildAdapter(
      {
        REDIS_URL: 'redis://127.0.0.1:6379',
      },
      () => client,
    );

    const result = await adapter.consume({
      requestId: 'req-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      orderId: 12345,
      clientIp: '1.1.1.1',
    });

    expect(result).toEqual({
      allowed: true,
      degraded: false,
    });
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(sendCommand).toHaveBeenCalledTimes(1);
  });

  it('returns blocked scope when redis script rejects request', async () => {
    const sendCommand = jest.fn().mockResolvedValue([0, 2]);
    const adapter = buildAdapter(
      {
        REDIS_URL: 'redis://127.0.0.1:6379',
      },
      () => ({
        isOpen: true,
        connect: jest.fn().mockResolvedValue(undefined),
        sendCommand,
      }),
    );

    const result = await adapter.consume({
      requestId: 'req-2',
      userId: 'user-1',
      conversationId: 'conv-1',
      orderId: 12345,
      clientIp: '1.1.1.1',
    });

    expect(result).toEqual({
      allowed: false,
      degraded: false,
      blockedBy: 'user',
    });
  });

  it('fails open in degraded mode when redis url is missing', async () => {
    const adapter = buildAdapter({});

    const result = await adapter.consume({
      requestId: 'req-3',
      userId: 'user-1',
      conversationId: 'conv-1',
      orderId: 12345,
      clientIp: '1.1.1.1',
    });

    expect(result).toEqual({
      allowed: true,
      degraded: true,
    });
  });

  it('fails open in degraded mode when redis command fails', async () => {
    const adapter = buildAdapter(
      {
        REDIS_URL: 'redis://127.0.0.1:6379',
      },
      () => ({
        isOpen: true,
        connect: jest.fn().mockResolvedValue(undefined),
        sendCommand: jest.fn().mockRejectedValue(new Error('redis unavailable')),
      }),
    );

    const result = await adapter.consume({
      requestId: 'req-4',
      userId: 'user-1',
      conversationId: 'conv-1',
      orderId: 12345,
      clientIp: '1.1.1.1',
    });

    expect(result).toEqual({
      allowed: true,
      degraded: true,
    });
  });

  it('skips redis when rate limit feature is disabled', async () => {
    const clientFactory = jest.fn();
    const adapter = buildAdapter(
      {
        REDIS_URL: 'redis://127.0.0.1:6379',
        ORDER_LOOKUP_RATE_LIMIT_ENABLED: false,
      },
      clientFactory,
    );

    const result = await adapter.consume({
      requestId: 'req-5',
      userId: 'user-1',
      conversationId: 'conv-1',
      orderId: 12345,
      clientIp: '1.1.1.1',
    });

    expect(result).toEqual({
      allowed: true,
      degraded: false,
    });
    expect(clientFactory).not.toHaveBeenCalled();
  });
});

function buildAdapter(
  values: Record<string, unknown>,
  clientFactory?: (url: string) => {
    isOpen: boolean;
    connect(): Promise<void>;
    sendCommand(args: string[]): Promise<unknown>;
  },
): RedisOrderLookupRateLimiterAdapter {
  const configService: Pick<ConfigService, 'get'> = {
    get: (key: string) => values[key as keyof typeof values] as never,
  };

  return new RedisOrderLookupRateLimiterAdapter(
    configService as ConfigService,
    clientFactory as ((url: string) => {
      isOpen: boolean;
      connect(): Promise<void>;
      sendCommand(args: string[]): Promise<unknown>;
    }) | undefined,
  );
}
