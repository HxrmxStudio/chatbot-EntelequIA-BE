import type { Logger } from '@/common/utils/logger';
import type { MetricsPort } from '@/modules/wf1/application/ports/metrics.port';
import type { OrderLookupRateLimiterPort } from '@/modules/wf1/application/ports/order-lookup-rate-limiter.port';
import type { Wf1Response } from '@/modules/wf1/domain/wf1-response';
import { EntelequiaOrderLookupClient } from '@/modules/wf1/infrastructure/adapters/entelequia-http';
import {
  buildOrderLookupHasDataQuestionResponse,
  buildOrderLookupInvalidPayloadResponse,
  buildOrderLookupMissingIdentityFactorsResponse,
  buildOrderLookupMissingOrderIdResponse,
  buildOrderLookupProvideDataResponse,
  buildOrderLookupSuccessMessage,
  buildOrderLookupThrottledResponse,
  buildOrderLookupUnauthorizedResponse,
  buildOrderLookupUnknownHasDataAnswerResponse,
  buildOrderLookupVerificationFailedResponse,
} from '../../responses/orders/orders-order-lookup-response';
import { buildOrdersRequiresAuthResponse } from '../../responses/orders/orders-unauthenticated-response';
import {
  hasOrderLookupSignals,
  type GuestOrderFlowState,
  resolveHasOrderDataAnswer,
} from './resolve-order-lookup-flow-state';
import { resolveOrderLookupRequest } from './resolve-order-lookup-request';
import { BACKEND_ERROR_MESSAGE } from '../../support/error-mapper';

export interface GuestOrderLookupFlowInput {
  requestId: string;
  conversationId: string;
  userId: string;
  clientIp?: string;
  text: string;
  entities: string[];
  currentFlowState: GuestOrderFlowState;
}

export interface GuestOrderLookupFlowResult {
  response: Wf1Response;
  nextFlowState: GuestOrderFlowState;
  lookupTelemetry: {
    ordersGuestLookupAttempted: boolean;
    ordersGuestLookupResultCode:
      | 'success'
      | 'not_found_or_mismatch'
      | 'invalid_payload'
      | 'unauthorized'
      | 'throttled'
      | 'exception'
      | null;
    ordersGuestLookupStatusCode: number | null;
  };
}

export interface GuestOrderLookupFlowDependencies {
  orderLookupRateLimiter: OrderLookupRateLimiterPort;
  orderLookupClient: EntelequiaOrderLookupClient;
  metricsPort: MetricsPort;
  logger: Pick<Logger, 'warn'>;
}

export async function handleGuestOrderLookupFlow(
  input: GuestOrderLookupFlowInput,
  dependencies: GuestOrderLookupFlowDependencies,
): Promise<GuestOrderLookupFlowResult> {
  const resolved = resolveOrderLookupRequest({
    text: input.text,
    entities: input.entities,
  });

  const orderId = resolved.orderId;
  const hasCompleteLookupData = typeof orderId === 'number' && resolved.providedFactors >= 2;
  if (hasCompleteLookupData) {
    const rateLimitDecision = await dependencies.orderLookupRateLimiter.consume({
      requestId: input.requestId,
      userId: input.userId,
      conversationId: input.conversationId,
      orderId,
      clientIp: input.clientIp,
    });

    if (rateLimitDecision.degraded) {
      dependencies.metricsPort.incrementOrderLookupRateLimitDegraded();
    }

    if (!rateLimitDecision.allowed) {
      dependencies.metricsPort.incrementOrderLookupRateLimited(
        rateLimitDecision.blockedBy ?? 'order',
      );
      return {
        response: buildOrderLookupThrottledResponse(),
        nextFlowState: 'awaiting_lookup_payload',
        lookupTelemetry: buildNoAttemptLookupTelemetry(),
      };
    }

    const lookupResponse = await executeGuestOrderLookup(
      {
        requestId: input.requestId,
        conversationId: input.conversationId,
        orderId,
        identity: resolved.identity,
      },
      dependencies,
    );
    return {
      response: lookupResponse.response,
      nextFlowState: lookupResponse.response.ok ? null : 'awaiting_lookup_payload',
      lookupTelemetry: lookupResponse.lookupTelemetry,
    };
  }

  if (input.currentFlowState === null) {
    if (hasOrderLookupSignals(resolved)) {
      return {
        response: buildGuestOrderLookupMissingDataResponse(resolved),
        nextFlowState: 'awaiting_lookup_payload',
        lookupTelemetry: buildNoAttemptLookupTelemetry(),
      };
    }

    return {
      response: buildOrderLookupHasDataQuestionResponse(),
      nextFlowState: 'awaiting_has_data_answer',
      lookupTelemetry: buildNoAttemptLookupTelemetry(),
    };
  }

  const hasOrderDataAnswer = resolveHasOrderDataAnswer(input.text);

  if (hasOrderDataAnswer === 'no') {
    return {
      response: buildOrdersRequiresAuthResponse(),
      nextFlowState: null,
      lookupTelemetry: buildNoAttemptLookupTelemetry(),
    };
  }

  if (input.currentFlowState === 'awaiting_has_data_answer') {
    if (hasOrderDataAnswer === 'yes') {
      return {
        response: buildOrderLookupProvideDataResponse(),
        nextFlowState: 'awaiting_lookup_payload',
        lookupTelemetry: buildNoAttemptLookupTelemetry(),
      };
    }

    if (hasOrderLookupSignals(resolved)) {
      return {
        response: buildGuestOrderLookupMissingDataResponse(resolved),
        nextFlowState: 'awaiting_lookup_payload',
        lookupTelemetry: buildNoAttemptLookupTelemetry(),
      };
    }

    return {
      response: buildOrderLookupUnknownHasDataAnswerResponse(),
      nextFlowState: 'awaiting_has_data_answer',
      lookupTelemetry: buildNoAttemptLookupTelemetry(),
    };
  }

  if (hasOrderDataAnswer === 'yes' && !hasOrderLookupSignals(resolved)) {
    return {
      response: buildOrderLookupProvideDataResponse(),
      nextFlowState: 'awaiting_lookup_payload',
      lookupTelemetry: buildNoAttemptLookupTelemetry(),
    };
  }

  return {
    response: buildGuestOrderLookupMissingDataResponse(resolved),
    nextFlowState: 'awaiting_lookup_payload',
    lookupTelemetry: buildNoAttemptLookupTelemetry(),
  };
}

async function executeGuestOrderLookup(
  input: {
    requestId: string;
    conversationId: string;
    orderId: number;
    identity: {
      dni?: string;
      name?: string;
      lastName?: string;
      phone?: string;
    };
  },
  dependencies: GuestOrderLookupFlowDependencies,
): Promise<{
  response: Wf1Response;
  lookupTelemetry: GuestOrderLookupFlowResult['lookupTelemetry'];
}> {
  try {
    const lookup = await dependencies.orderLookupClient.lookupOrder({
      requestId: input.requestId,
      orderId: input.orderId,
      identity: input.identity,
    });

    if (lookup.ok) {
      return {
        response: {
          ok: true,
          conversationId: input.conversationId,
          intent: 'orders',
          message: buildOrderLookupSuccessMessage(lookup.order),
        },
        lookupTelemetry: {
          ordersGuestLookupAttempted: true,
          ordersGuestLookupResultCode: 'success',
          ordersGuestLookupStatusCode: 200,
        },
      };
    }

    if (lookup.code === 'not_found_or_mismatch') {
      dependencies.metricsPort.incrementOrderLookupVerificationFailed();
      return {
        response: buildOrderLookupVerificationFailedResponse(),
        lookupTelemetry: {
          ordersGuestLookupAttempted: true,
          ordersGuestLookupResultCode: 'not_found_or_mismatch',
          ordersGuestLookupStatusCode: 404,
        },
      };
    }

    if (lookup.code === 'invalid_payload') {
      return {
        response: buildOrderLookupInvalidPayloadResponse(),
        lookupTelemetry: {
          ordersGuestLookupAttempted: true,
          ordersGuestLookupResultCode: 'invalid_payload',
          ordersGuestLookupStatusCode: 422,
        },
      };
    }

    if (lookup.code === 'unauthorized') {
      return {
        response: buildOrderLookupUnauthorizedResponse(),
        lookupTelemetry: {
          ordersGuestLookupAttempted: true,
          ordersGuestLookupResultCode: 'unauthorized',
          ordersGuestLookupStatusCode: 401,
        },
      };
    }

    if (lookup.code === 'throttled') {
      dependencies.metricsPort.incrementOrderLookupRateLimited('backend');
      return {
        response: buildOrderLookupThrottledResponse(),
        lookupTelemetry: {
          ordersGuestLookupAttempted: true,
          ordersGuestLookupResultCode: 'throttled',
          ordersGuestLookupStatusCode: 429,
        },
      };
    }

    return {
      response: {
        ok: false,
        message: BACKEND_ERROR_MESSAGE,
      },
      lookupTelemetry: {
        ordersGuestLookupAttempted: true,
        ordersGuestLookupResultCode: 'exception',
        ordersGuestLookupStatusCode: null,
      },
    };
  } catch (error: unknown) {
    dependencies.logger.warn('guest_order_lookup_failed', {
      event: 'guest_order_lookup_failed',
      request_id: input.requestId,
      error_type: error instanceof Error ? error.name : 'UnknownError',
    });

    return {
      response: {
        ok: false,
        message: BACKEND_ERROR_MESSAGE,
      },
      lookupTelemetry: {
        ordersGuestLookupAttempted: true,
        ordersGuestLookupResultCode: 'exception',
        ordersGuestLookupStatusCode: null,
      },
    };
  }
}

function buildNoAttemptLookupTelemetry(): GuestOrderLookupFlowResult['lookupTelemetry'] {
  return {
    ordersGuestLookupAttempted: false,
    ordersGuestLookupResultCode: null,
    ordersGuestLookupStatusCode: null,
  };
}

export function buildGuestOrderLookupMissingDataResponse(input: {
  orderId?: number;
  providedFactors: number;
  invalidFactors: string[];
}): Wf1Response {
  if (!input.orderId) {
    return buildOrderLookupMissingOrderIdResponse();
  }

  if (input.invalidFactors.length > 0) {
    return buildOrderLookupInvalidPayloadResponse({
      invalidFactors: input.invalidFactors,
    });
  }

  if (input.providedFactors < 2) {
    return buildOrderLookupMissingIdentityFactorsResponse({
      providedFactors: input.providedFactors,
    });
  }

  return buildOrderLookupInvalidPayloadResponse();
}
