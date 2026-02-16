import type { MetricsPort } from '@/modules/wf1/application/ports/metrics.port';
import type { OrderLookupRateLimiterPort } from '@/modules/wf1/application/ports/order-lookup-rate-limiter.port';
import {
  handleGuestOrderLookupFlow,
  type GuestOrderLookupFlowDependencies,
} from '@/modules/wf1/application/use-cases/handle-incoming-message/flows/orders/guest-order-lookup.flow';
import { EntelequiaOrderLookupClient } from '@/modules/wf1/infrastructure/adapters/entelequia-http';

function buildDependencies(input?: {
  consume?: Awaited<ReturnType<OrderLookupRateLimiterPort['consume']>>;
  lookup?: Awaited<ReturnType<EntelequiaOrderLookupClient['lookupOrder']>>;
}) {
  const consumeMock = jest.fn().mockResolvedValue(
    input?.consume ?? {
      allowed: true,
      degraded: false,
    },
  );
  const lookupMock = jest.fn().mockResolvedValue(
    input?.lookup ?? {
      ok: true,
      order: {
        id: 12345,
        state: 'En preparación',
        total: { amount: 5100, currency: 'ARS' },
        shipMethod: 'Correo',
        paymentMethod: 'Mercado Pago',
      },
    },
  );

  const incrementOrderLookupRateLimitDegraded = jest.fn();
  const incrementOrderLookupRateLimited = jest.fn();
  const incrementOrderLookupVerificationFailed = jest.fn();

  const dependencies: GuestOrderLookupFlowDependencies = {
    orderLookupRateLimiter: {
      consume: consumeMock,
    } as unknown as OrderLookupRateLimiterPort,
    orderLookupClient: {
      lookupOrder: lookupMock,
    } as unknown as EntelequiaOrderLookupClient,
    metricsPort: {
      incrementOrderLookupRateLimitDegraded,
      incrementOrderLookupRateLimited,
      incrementOrderLookupVerificationFailed,
    } as unknown as MetricsPort,
    logger: {
      warn: jest.fn(),
    },
  };

  return {
    dependencies,
    consumeMock,
    lookupMock,
    incrementOrderLookupRateLimited,
  };
}

describe('handleGuestOrderLookupFlow', () => {
  it('asks for SI/NO confirmation when flow starts without lookup payload', async () => {
    const { dependencies } = buildDependencies();

    const result = await handleGuestOrderLookupFlow(
      {
        requestId: 'req-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        text: 'donde esta mi pedido?',
        entities: [],
        currentFlowState: null,
      },
      dependencies,
    );

    expect(result.nextFlowState).toBe('awaiting_has_data_answer');
    expect(result.response.ok).toBe(false);
    expect(result.response.message).toContain('Responde SI o NO');
    expect(result.lookupTelemetry).toEqual({
      ordersGuestLookupAttempted: false,
      ordersGuestLookupResultCode: null,
      ordersGuestLookupStatusCode: null,
    });
  });

  it('keeps awaiting lookup payload when order_id is present but identity factors are missing', async () => {
    const { dependencies } = buildDependencies();

    const result = await handleGuestOrderLookupFlow(
      {
        requestId: 'req-2',
        conversationId: 'conv-1',
        userId: 'user-1',
        text: 'pedido 12345, dni 12345678',
        entities: [],
        currentFlowState: 'awaiting_lookup_payload',
      },
      dependencies,
    );

    expect(result.nextFlowState).toBe('awaiting_lookup_payload');
    expect(result.response.ok).toBe(false);
    expect(result.response.message).toContain('Necesito 1 dato(s) mas');
    expect(result.lookupTelemetry.ordersGuestLookupAttempted).toBe(false);
  });

  it('returns requires-auth response when guest answers NO', async () => {
    const { dependencies } = buildDependencies();

    const result = await handleGuestOrderLookupFlow(
      {
        requestId: 'req-3',
        conversationId: 'conv-1',
        userId: 'user-1',
        text: 'no',
        entities: [],
        currentFlowState: 'awaiting_has_data_answer',
      },
      dependencies,
    );

    expect(result.nextFlowState).toBeNull();
    expect(result.response.ok).toBe(false);
    expect('requiresAuth' in result.response && result.response.requiresAuth).toBe(true);
    expect(result.lookupTelemetry.ordersGuestLookupAttempted).toBe(false);
  });

  it('executes secure lookup and closes flow when order_id plus 2 identity factors are present', async () => {
    const { dependencies, consumeMock, lookupMock } = buildDependencies();

    const result = await handleGuestOrderLookupFlow(
      {
        requestId: 'req-4',
        conversationId: 'conv-1',
        userId: 'user-1',
        text: 'pedido 12345, dni 12345678, telefono +54 11 4444 5555',
        entities: [],
        currentFlowState: 'awaiting_lookup_payload',
      },
      dependencies,
    );

    expect(result.nextFlowState).toBeNull();
    expect(result.response.ok).toBe(true);
    if (!result.response.ok) {
      throw new Error('Expected successful lookup response');
    }
    expect(result.response.intent).toBe('orders');
    expect(consumeMock).toHaveBeenCalledTimes(1);
    expect(lookupMock).toHaveBeenCalledTimes(1);
    expect(result.lookupTelemetry).toEqual({
      ordersGuestLookupAttempted: true,
      ordersGuestLookupResultCode: 'success',
      ordersGuestLookupStatusCode: 200,
    });
  });

  it('executes lookup for multiline payload with order_id and 2+ factors', async () => {
    const { dependencies, lookupMock } = buildDependencies();

    const result = await handleGuestOrderLookupFlow(
      {
        requestId: 'req-4b',
        conversationId: 'conv-1',
        userId: 'user-1',
        text: 'Pedido #78399\ndni:38321532\nEmiliano rozas',
        entities: [],
        currentFlowState: 'awaiting_lookup_payload',
      },
      dependencies,
    );

    expect(result.nextFlowState).toBeNull();
    expect(result.response.ok).toBe(true);
    expect(lookupMock).toHaveBeenCalledTimes(1);
    expect(result.lookupTelemetry.ordersGuestLookupAttempted).toBe(true);
  });

  it('returns mismatch telemetry when lookup reports not_found_or_mismatch', async () => {
    const { dependencies } = buildDependencies({
      lookup: {
        ok: false,
        code: 'not_found_or_mismatch',
        statusCode: 404,
      },
    });

    const result = await handleGuestOrderLookupFlow(
      {
        requestId: 'req-4c',
        conversationId: 'conv-1',
        userId: 'user-1',
        text: 'pedido 12345, dni 12345678, telefono +54 11 4444 5555',
        entities: [],
        currentFlowState: 'awaiting_lookup_payload',
      },
      dependencies,
    );

    expect(result.response.ok).toBe(false);
    expect(result.response.message).toContain('No pudimos validar los datos del pedido');
    expect(result.lookupTelemetry).toEqual({
      ordersGuestLookupAttempted: true,
      ordersGuestLookupResultCode: 'not_found_or_mismatch',
      ordersGuestLookupStatusCode: 404,
    });
  });

  it('returns throttled response and skips backend lookup when local limiter blocks request', async () => {
    const { dependencies, lookupMock, incrementOrderLookupRateLimited } = buildDependencies({
      consume: {
        allowed: false,
        degraded: false,
        blockedBy: 'order',
      },
    });

    const result = await handleGuestOrderLookupFlow(
      {
        requestId: 'req-5',
        conversationId: 'conv-1',
        userId: 'user-1',
        text: 'pedido 12345, dni 12345678, telefono +54 11 4444 5555',
        entities: [],
        currentFlowState: 'awaiting_lookup_payload',
      },
      dependencies,
    );

    expect(result.nextFlowState).toBe('awaiting_lookup_payload');
    expect(result.response.ok).toBe(false);
    expect(result.response.message).toContain('alta demanda');
    expect(lookupMock).not.toHaveBeenCalled();
    expect(incrementOrderLookupRateLimited).toHaveBeenCalledWith('order');
    expect(result.lookupTelemetry.ordersGuestLookupAttempted).toBe(false);
  });
});
