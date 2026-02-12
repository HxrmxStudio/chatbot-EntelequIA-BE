import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '@/common/utils/logger';
import { isRecord } from '@/common/utils/object.utils';
import { ExternalServiceError } from '@/modules/wf1/domain/errors';
import { parseMoney, type Money } from '@/modules/wf1/domain/money';
import { fetchWithTimeout } from '../shared';
import { parseJson } from './product-helpers';
import {
  BOT_ORDER_LOOKUP_CANONICAL_PATH,
  BOT_ORDER_LOOKUP_METHOD,
  BotHmacSigner,
} from './bot-hmac-signer';
import { resolveEntelequiaApiBaseUrl } from './base-url';

const ORDER_LOOKUP_REQUEST_PATH = '/bot/order-lookup';

export interface OrderLookupRequestPayload {
  order_id: number;
  dni?: string;
  name?: string;
  last_name?: string;
  phone?: string;
}

export interface OrderLookupIdentityInput {
  dni?: string;
  name?: string;
  lastName?: string;
  phone?: string;
}

export interface OrderLookupOrderSummary {
  id: string | number;
  state: string;
  createdAt?: string;
  updatedAt?: string;
  total?: Money;
  paymentMethod?: string;
  shipMethod?: string;
  trackingCode?: string;
}

export interface OrderLookupSuccessResult {
  ok: true;
  order: OrderLookupOrderSummary;
}

export interface OrderLookupFailureResult {
  ok: false;
  code: 'unauthorized' | 'invalid_payload' | 'not_found_or_mismatch' | 'throttled';
  statusCode: 401 | 404 | 422 | 429;
}

export type OrderLookupResult = OrderLookupSuccessResult | OrderLookupFailureResult;

@Injectable()
export class EntelequiaOrderLookupClient {
  private readonly logger = createLogger(EntelequiaOrderLookupClient.name);
  private readonly apiBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryMax: number;
  private readonly retryBackoffMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly signer: BotHmacSigner,
  ) {
    this.apiBaseUrl = resolveEntelequiaApiBaseUrl(this.configService);
    this.timeoutMs = this.configService.get<number>('BOT_ORDER_LOOKUP_TIMEOUT_MS') ?? 8000;
    this.retryMax = Math.max(0, this.configService.get<number>('BOT_ORDER_LOOKUP_RETRY_MAX') ?? 1);
    this.retryBackoffMs = Math.max(
      0,
      this.configService.get<number>('BOT_ORDER_LOOKUP_RETRY_BACKOFF_MS') ?? 500,
    );
  }

  async lookupOrder(input: {
    requestId: string;
    orderId: number;
    identity: OrderLookupIdentityInput;
  }): Promise<OrderLookupResult> {
    const payload = buildOrderLookupPayload({
      orderId: input.orderId,
      identity: input.identity,
    });
    const rawBody = JSON.stringify(payload);

    let unauthorizedRetries = 0;
    let throttledRetries = 0;

    while (true) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const nonce = randomUUID().toLowerCase();
      const signature = this.signer.signOrderLookupRequest({
        timestamp,
        nonce,
        rawBody,
      });

      try {
        const response = await fetchWithTimeout(
          `${this.apiBaseUrl}${ORDER_LOOKUP_REQUEST_PATH}`,
          {
            method: BOT_ORDER_LOOKUP_METHOD,
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'X-Bot-Timestamp': timestamp,
              'X-Bot-Nonce': nonce,
              'X-Bot-Signature': signature,
            },
            body: rawBody,
          },
          this.timeoutMs,
        );

        const body = await parseJson(response);

        if (response.status === 200) {
          return {
            ok: true,
            order: normalizeLookupOrder(body, input.orderId),
          };
        }

        if (response.status === 401) {
          if (unauthorizedRetries < 1) {
            unauthorizedRetries += 1;
            this.logger.warn('order_lookup_unauthorized_retry', {
              event: 'order_lookup_unauthorized_retry',
              request_id: input.requestId,
              retry_count: unauthorizedRetries,
              canonical_path: BOT_ORDER_LOOKUP_CANONICAL_PATH,
            });
            continue;
          }

          return {
            ok: false,
            code: 'unauthorized',
            statusCode: 401,
          };
        }

        if (response.status === 422) {
          return {
            ok: false,
            code: 'invalid_payload',
            statusCode: 422,
          };
        }

        if (response.status === 404) {
          return {
            ok: false,
            code: 'not_found_or_mismatch',
            statusCode: 404,
          };
        }

        if (response.status === 429) {
          if (throttledRetries < this.retryMax) {
            throttledRetries += 1;
            const backoffMs = computeBackoff(this.retryBackoffMs, throttledRetries);
            this.logger.warn('order_lookup_throttled_retry', {
              event: 'order_lookup_throttled_retry',
              request_id: input.requestId,
              retry_count: throttledRetries,
              backoff_ms: backoffMs,
            });
            await sleep(backoffMs);
            continue;
          }

          return {
            ok: false,
            code: 'throttled',
            statusCode: 429,
          };
        }

        throw new ExternalServiceError(
          `Entelequia order lookup backend error ${response.status}`,
          response.status,
          'http',
          body,
        );
      } catch (error: unknown) {
        if (error instanceof ExternalServiceError) {
          throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          throw new ExternalServiceError('Entelequia order lookup timeout', 0, 'timeout');
        }

        throw new ExternalServiceError('Entelequia order lookup network error', 0, 'network');
      }
    }
  }
}

function buildOrderLookupPayload(input: {
  orderId: number;
  identity: OrderLookupIdentityInput;
}): OrderLookupRequestPayload {
  const payload: OrderLookupRequestPayload = {
    order_id: input.orderId,
  };

  const dni = normalizeOptionalValue(input.identity.dni);
  const name = normalizeOptionalValue(input.identity.name);
  const lastName = normalizeOptionalValue(input.identity.lastName);
  const phone = normalizeOptionalValue(input.identity.phone);

  if (dni) {
    payload.dni = dni;
  }
  if (name) {
    payload.name = name;
  }
  if (lastName) {
    payload.last_name = lastName;
  }
  if (phone) {
    payload.phone = phone;
  }

  return payload;
}

function normalizeLookupOrder(body: unknown, fallbackOrderId: number): OrderLookupOrderSummary {
  const data = isRecord(body) ? body : {};
  const orderContainer = isRecord(data.order) ? data.order : data;
  const rawId = orderContainer.id;

  const normalizedId =
    typeof rawId === 'number' && Number.isFinite(rawId)
      ? rawId
      : typeof rawId === 'string' && rawId.trim().length > 0
        ? rawId.trim()
        : fallbackOrderId;

  const state = normalizeOptionalValue(orderContainer.state) ?? 'Sin estado';
  const createdAt = normalizeOptionalValue(orderContainer.created_at);
  const updatedAt = normalizeOptionalValue(orderContainer.updated_at);
  const paymentMethod = normalizeOptionalValue(orderContainer.payment_method);
  const shipMethod = normalizeOptionalValue(orderContainer.ship_method);
  const trackingCode = normalizeOptionalValue(orderContainer.tracking_code);
  const total = parseMoney(orderContainer.total);

  return {
    id: normalizedId,
    state,
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(total ? { total } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(shipMethod ? { shipMethod } : {}),
    ...(trackingCode ? { trackingCode } : {}),
  };
}

function normalizeOptionalValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function computeBackoff(baseMs: number, attempt: number): number {
  return Math.max(0, baseMs * 2 ** Math.max(0, attempt - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
