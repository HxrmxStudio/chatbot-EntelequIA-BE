import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EntelequiaApiError,
  type EntelequiaContextPort,
} from '../../application/ports/entelequia-context.port';
import type { ContextBlock } from '../../domain/context-block';

@Injectable()
export class EntelequiaHttpAdapter implements EntelequiaContextPort {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    const configuredBaseUrl = this.configService.get<string>('ENTELEQUIA_API_BASE_URL');
    this.baseUrl = (configuredBaseUrl ?? '').replace(/\/$/, '');
    this.timeoutMs = this.configService.get<number>('ENTELEQUIA_API_TIMEOUT_MS') ?? 8000;
  }

  async getProducts(input: {
    query?: string;
    categorySlug?: string;
    currency?: 'ARS' | 'USD';
  }): Promise<ContextBlock> {
    const categoryPath = input.categorySlug ? `/${encodeURIComponent(input.categorySlug)}` : '';
    const params = new URLSearchParams({
      orderBy: 'recent',
      page: '1',
      currency: input.currency ?? 'ARS',
    });

    if (input.query && input.query.trim().length > 0) {
      params.set('q', input.query.trim());
    }

    const data = await this.fetchJson(`/products-list${categoryPath}?${params.toString()}`);

    return {
      contextType: 'products',
      contextPayload: data,
    };
  }

  async getProductDetail(input: {
    idOrSlug: string;
    currency?: 'ARS' | 'USD';
  }): Promise<ContextBlock> {
    const params = new URLSearchParams({
      currency: input.currency ?? 'ARS',
    });

    const data = await this.fetchJson(`/product/${encodeURIComponent(input.idOrSlug)}?${params.toString()}`);

    return {
      contextType: 'product_detail',
      contextPayload: data,
    };
  }

  async getRecommendations(input: { currency?: 'ARS' | 'USD' }): Promise<ContextBlock> {
    const params = new URLSearchParams({
      page: '1',
      currency: input.currency ?? 'ARS',
    });

    const data = await this.fetchJson(`/products/recommended?${params.toString()}`);

    return {
      contextType: 'recommendations',
      contextPayload: data,
    };
  }

  async getPaymentInfo(): Promise<ContextBlock> {
    const data = await this.fetchJson('/cart/payment-info');

    return {
      contextType: 'payment_info',
      contextPayload: data,
    };
  }

  async getOrders(input: { accessToken: string }): Promise<ContextBlock> {
    const data = await this.fetchJson('/account/orders', {
      Authorization: `Bearer ${input.accessToken}`,
    });

    return {
      contextType: 'orders',
      contextPayload: data,
    };
  }

  async getOrderDetail(input: { accessToken: string; orderId: string }): Promise<ContextBlock> {
    const data = await this.fetchJson(`/account/orders/${encodeURIComponent(input.orderId)}`, {
      Authorization: `Bearer ${input.accessToken}`,
    });

    return {
      contextType: 'order_detail',
      contextPayload: data,
    };
  }

  private async fetchJson(path: string, headers?: Record<string, string>): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(headers ?? {}),
        },
        signal: controller.signal,
      });

      const body = await parseJson(response);

      if (!response.ok) {
        throw new EntelequiaApiError(
          `Entelequia backend error ${response.status}`,
          response.status,
          'http',
          body,
        );
      }

      if (typeof body !== 'object' || body === null) {
        return { data: body };
      }

      return body as Record<string, unknown>;
    } catch (error: unknown) {
      if (error instanceof EntelequiaApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new EntelequiaApiError('Entelequia request timeout', 0, 'timeout');
      }

      throw new EntelequiaApiError('Entelequia network error', 0, 'network');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.trim() === '') {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}
