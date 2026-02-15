import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '@/common/utils/logger';
import type { EntelequiaContextPort } from '@/modules/wf1/application/ports/entelequia-context.port';
import type { MetricsPort } from '@/modules/wf1/application/ports/metrics.port';
import { METRICS_PORT } from '@/modules/wf1/application/ports/tokens';
import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import { ExternalServiceError } from '@/modules/wf1/domain/errors';
import {
  accountProfileEndpoint,
  accountOrderDetailEndpoint,
  accountOrdersEndpoint,
  cartPaymentInfoEndpoint,
  productDetailEndpoint,
  productsAuthorsEndpoint,
  productsBrandsEndpoint,
  productsListEndpoint,
  productsRecommendedEndpoint,
} from './endpoints';
import { fetchEntelequiaJson } from './entelequia-client';
import {
  normalizeProductDetailPayload,
  normalizeProductsListPayload,
} from './payload-normalizers';
import { resolveEntelequiaApiBaseUrl } from './base-url';
import {
  normalizeAuthorsPayload,
  normalizeBrandsPayload,
} from './taxonomy-normalizers';

@Injectable()
export class EntelequiaHttpAdapter implements EntelequiaContextPort {
  private readonly logger = createLogger(EntelequiaHttpAdapter.name);
  private readonly baseUrl: string;
  private readonly webBaseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(METRICS_PORT)
    private readonly metricsPort?: MetricsPort,
  ) {
    this.baseUrl = resolveEntelequiaApiBaseUrl(this.configService);
    const configuredWebBaseUrl = this.configService.get<string>('ENTELEQUIA_WEB_BASE_URL');
    this.webBaseUrl = (configuredWebBaseUrl ?? 'https://entelequia.com.ar').replace(/\/$/, '');
    this.timeoutMs = this.configService.get<number>('ENTELEQUIA_API_TIMEOUT_MS') ?? 8000;
  }

  async getProducts(input: {
    query?: string;
    categorySlug?: string;
    currency?: 'ARS' | 'USD';
  }): Promise<ContextBlock> {
    const params = new URLSearchParams({
      orderBy: 'recent',
      page: '1',
      currency: input.currency ?? 'ARS',
    });

    if (input.query && input.query.trim().length > 0) {
      params.set('q', input.query.trim());
    }

    const endpoint = productsListEndpoint(input.categorySlug);
    const data = await fetchEntelequiaJson(
      this.baseUrl,
      `${endpoint}?${params.toString()}`,
      this.timeoutMs,
    );
    const normalized = normalizeProductsListPayload(data, input.query, this.webBaseUrl);

    return {
      contextType: 'products',
      contextPayload: normalized,
    };
  }

  async getProductDetail(input: {
    idOrSlug: string;
    currency?: 'ARS' | 'USD';
  }): Promise<ContextBlock> {
    const params = new URLSearchParams({
      currency: input.currency ?? 'ARS',
    });

    const endpoint = productDetailEndpoint(input.idOrSlug);
    const data = await fetchEntelequiaJson(
      this.baseUrl,
      `${endpoint}?${params.toString()}`,
      this.timeoutMs,
    );
    const normalized = normalizeProductDetailPayload(data, this.webBaseUrl);

    return {
      contextType: 'product_detail',
      contextPayload: normalized,
    };
  }

  async getRecommendations(input: { currency?: 'ARS' | 'USD' }): Promise<ContextBlock> {
    const params = new URLSearchParams({
      page: '1',
      currency: input.currency ?? 'ARS',
    });

    const endpoint = productsRecommendedEndpoint();
    const data = await fetchEntelequiaJson(
      this.baseUrl,
      `${endpoint}?${params.toString()}`,
      this.timeoutMs,
    );

    return {
      contextType: 'recommendations',
      contextPayload: data,
    };
  }

  async getProductBrands(): Promise<ContextBlock> {
    const endpoint = productsBrandsEndpoint();
    const data = await fetchEntelequiaJson(this.baseUrl, endpoint, this.timeoutMs);
    const normalized = normalizeBrandsPayload(data);

    return {
      contextType: 'catalog_taxonomy',
      contextPayload: normalized,
    };
  }

  async getProductAuthors(input?: { search?: string }): Promise<ContextBlock> {
    const endpoint = productsAuthorsEndpoint(input?.search);
    const data = await fetchEntelequiaJson(this.baseUrl, endpoint, this.timeoutMs);
    const normalized = normalizeAuthorsPayload(data);

    return {
      contextType: 'catalog_taxonomy',
      contextPayload: normalized,
    };
  }

  async getPaymentInfo(): Promise<ContextBlock> {
    const endpoint = cartPaymentInfoEndpoint();
    const data = await fetchEntelequiaJson(this.baseUrl, endpoint, this.timeoutMs);

    return {
      contextType: 'payment_info',
      contextPayload: data,
    };
  }

  async getAuthenticatedUserProfile(input: { accessToken: string }): Promise<{
    id?: string;
    email: string;
    phone: string;
    name: string;
  }> {
    const endpoint = accountProfileEndpoint();
    const data = await fetchEntelequiaJson(
      this.baseUrl,
      endpoint,
      this.timeoutMs,
      {
        Authorization: `Bearer ${input.accessToken}`,
      },
    );

    return normalizeAuthenticatedUserProfile(data);
  }

  async getOrders(input: {
    accessToken: string;
    requestId?: string;
    conversationId?: string;
  }): Promise<ContextBlock> {
    return this.withOrdersBackendObservability({
      endpoint: '/account/orders',
      requestId: input.requestId,
      conversationId: input.conversationId,
      execute: async () => {
        const endpoint = accountOrdersEndpoint();
        const data = await fetchEntelequiaJson(
          this.baseUrl,
          endpoint,
          this.timeoutMs,
          {
            Authorization: `Bearer ${input.accessToken}`,
          },
        );

        return {
          contextType: 'orders',
          contextPayload: data,
        };
      },
    });
  }

  async getOrderDetail(input: {
    accessToken: string;
    orderId: string;
    requestId?: string;
    conversationId?: string;
  }): Promise<ContextBlock> {
    return this.withOrdersBackendObservability({
      endpoint: '/account/orders/{id}',
      requestId: input.requestId,
      conversationId: input.conversationId,
      orderId: input.orderId,
      execute: async () => {
        const endpoint = accountOrderDetailEndpoint(input.orderId);
        const data = await fetchEntelequiaJson(
          this.baseUrl,
          endpoint,
          this.timeoutMs,
          {
            Authorization: `Bearer ${input.accessToken}`,
          },
        );

        return {
          contextType: 'order_detail',
          contextPayload: data,
        };
      },
    });
  }

  private async withOrdersBackendObservability<T>(input: {
    endpoint: '/account/orders' | '/account/orders/{id}';
    requestId?: string;
    conversationId?: string;
    orderId?: string;
    execute: () => Promise<T>;
  }): Promise<T> {
    const startedAt = Date.now();

    this.logger.chat('orders_backend_call_started', {
      event: 'orders_backend_call_started',
      request_id: input.requestId ?? null,
      conversation_id: input.conversationId ?? null,
      endpoint: input.endpoint,
      status_code: null,
      latency_ms: null,
      order_id: input.orderId ?? null,
    });

    try {
      const result = await input.execute();
      const latencyMs = Date.now() - startedAt;
      this.metricsPort?.incrementOrdersBackendCall?.({
        endpoint: input.endpoint,
        outcome: 'succeeded',
        statusCode: 200,
      });
      this.metricsPort?.observeOrdersBackendLatency?.({
        endpoint: input.endpoint,
        seconds: latencyMs / 1000,
      });
      this.logger.chat('orders_backend_call_succeeded', {
        event: 'orders_backend_call_succeeded',
        request_id: input.requestId ?? null,
        conversation_id: input.conversationId ?? null,
        endpoint: input.endpoint,
        status_code: 200,
        latency_ms: latencyMs,
        order_id: input.orderId ?? null,
      });
      return result;
    } catch (error: unknown) {
      const latencyMs = Date.now() - startedAt;
      const statusCode = error instanceof ExternalServiceError ? error.statusCode : 0;
      this.metricsPort?.incrementOrdersBackendCall?.({
        endpoint: input.endpoint,
        outcome: 'failed',
        statusCode,
      });
      this.metricsPort?.observeOrdersBackendLatency?.({
        endpoint: input.endpoint,
        seconds: latencyMs / 1000,
      });
      this.logger.warn('orders_backend_call_failed', {
        event: 'orders_backend_call_failed',
        request_id: input.requestId ?? null,
        conversation_id: input.conversationId ?? null,
        endpoint: input.endpoint,
        status_code: statusCode,
        latency_ms: latencyMs,
        order_id: input.orderId ?? null,
      });
      throw error;
    }
  }
}

function normalizeAuthenticatedUserProfile(
  payload: Record<string, unknown>,
): {
  id?: string;
  email: string;
  phone: string;
  name: string;
} {
  const profile =
    toObject(payload.profile) ??
    payload;

  const shipAddress = toObject(profile.ship_address);
  const billAddress = toObject(profile.bill_address);

  const email =
    toOptionalNonEmptyString(profile.email) ??
    toOptionalNonEmptyString(shipAddress?.email) ??
    toOptionalNonEmptyString(billAddress?.email);

  if (!email) {
    throw new Error('Invalid profile payload: missing email');
  }

  const firstName =
    toOptionalNonEmptyString(profile.name) ??
    toOptionalNonEmptyString(profile.first_name) ??
    toOptionalNonEmptyString(shipAddress?.name) ??
    toOptionalNonEmptyString(billAddress?.name);

  const surname =
    toOptionalNonEmptyString(profile.surname) ??
    toOptionalNonEmptyString(profile.last_name) ??
    toOptionalNonEmptyString(shipAddress?.last_name) ??
    toOptionalNonEmptyString(billAddress?.last_name);

  const name = [firstName, surname]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .trim();

  const phone =
    toOptionalNonEmptyString(profile.phone) ??
    toOptionalNonEmptyString(shipAddress?.phone) ??
    toOptionalNonEmptyString(billAddress?.phone) ??
    '';

  const id = toOptionalNonEmptyString(profile.id);

  return {
    ...(id ? { id } : {}),
    email,
    phone,
    name: name.length > 0 ? name : 'Customer',
  };
}

function toObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function toOptionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    if (typeof value === 'number') {
      return String(value);
    }
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
