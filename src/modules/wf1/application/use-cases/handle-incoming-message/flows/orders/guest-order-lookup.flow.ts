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
      response: lookupResponse,
      nextFlowState: lookupResponse.ok ? null : 'awaiting_lookup_payload',
    };
  }

  if (input.currentFlowState === null) {
    if (hasOrderLookupSignals(resolved)) {
      return {
        response: buildGuestOrderLookupMissingDataResponse(resolved),
        nextFlowState: 'awaiting_lookup_payload',
      };
    }

    return {
      response: buildOrderLookupHasDataQuestionResponse(),
      nextFlowState: 'awaiting_has_data_answer',
    };
  }

  const hasOrderDataAnswer = resolveHasOrderDataAnswer(input.text);

  if (hasOrderDataAnswer === 'no') {
    return {
      response: buildOrdersRequiresAuthResponse(),
      nextFlowState: null,
    };
  }

  if (input.currentFlowState === 'awaiting_has_data_answer') {
    if (hasOrderDataAnswer === 'yes') {
      return {
        response: buildOrderLookupProvideDataResponse(),
        nextFlowState: 'awaiting_lookup_payload',
      };
    }

    if (hasOrderLookupSignals(resolved)) {
      return {
        response: buildGuestOrderLookupMissingDataResponse(resolved),
        nextFlowState: 'awaiting_lookup_payload',
      };
    }

    return {
      response: buildOrderLookupUnknownHasDataAnswerResponse(),
      nextFlowState: 'awaiting_has_data_answer',
    };
  }

  if (hasOrderDataAnswer === 'yes' && !hasOrderLookupSignals(resolved)) {
    return {
      response: buildOrderLookupProvideDataResponse(),
      nextFlowState: 'awaiting_lookup_payload',
    };
  }

  return {
    response: buildGuestOrderLookupMissingDataResponse(resolved),
    nextFlowState: 'awaiting_lookup_payload',
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
): Promise<Wf1Response> {
  try {
    const lookup = await dependencies.orderLookupClient.lookupOrder({
      requestId: input.requestId,
      orderId: input.orderId,
      identity: input.identity,
    });

    if (lookup.ok) {
      return {
        ok: true,
        conversationId: input.conversationId,
        intent: 'orders',
        message: buildOrderLookupSuccessMessage(lookup.order),
      };
    }

    if (lookup.code === 'not_found_or_mismatch') {
      dependencies.metricsPort.incrementOrderLookupVerificationFailed();
      return buildOrderLookupVerificationFailedResponse();
    }

    if (lookup.code === 'invalid_payload') {
      return buildOrderLookupInvalidPayloadResponse();
    }

    if (lookup.code === 'unauthorized') {
      return buildOrderLookupUnauthorizedResponse();
    }

    if (lookup.code === 'throttled') {
      dependencies.metricsPort.incrementOrderLookupRateLimited('backend');
      return buildOrderLookupThrottledResponse();
    }

    return {
      ok: false,
      message: BACKEND_ERROR_MESSAGE,
    };
  } catch (error: unknown) {
    dependencies.logger.warn('guest_order_lookup_failed', {
      event: 'guest_order_lookup_failed',
      request_id: input.requestId,
      error_type: error instanceof Error ? error.name : 'UnknownError',
    });

    return {
      ok: false,
      message: BACKEND_ERROR_MESSAGE,
    };
  }
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
