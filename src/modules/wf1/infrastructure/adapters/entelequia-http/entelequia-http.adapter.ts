import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntelequiaContextPort } from '../../../application/ports/entelequia-context.port';
import type { ContextBlock } from '../../../domain/context-block';
import { fetchEntelequiaJson } from './entelequia-client';
import {
  normalizeProductDetailPayload,
  normalizeProductsListPayload,
} from './payload-normalizers';

@Injectable()
export class EntelequiaHttpAdapter implements EntelequiaContextPort {
  private readonly baseUrl: string;
  private readonly webBaseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    const configuredBaseUrl = this.configService.get<string>('ENTELEQUIA_API_BASE_URL');
    this.baseUrl = (configuredBaseUrl ?? '').replace(/\/$/, '');
    const configuredWebBaseUrl = this.configService.get<string>('ENTELEQUIA_WEB_BASE_URL');
    this.webBaseUrl = (configuredWebBaseUrl ?? 'https://entelequia.com.ar').replace(/\/$/, '');
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

    const data = await fetchEntelequiaJson(
      this.baseUrl,
      `/products-list${categoryPath}?${params.toString()}`,
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

    const data = await fetchEntelequiaJson(
      this.baseUrl,
      `/product/${encodeURIComponent(input.idOrSlug)}?${params.toString()}`,
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

    const data = await fetchEntelequiaJson(
      this.baseUrl,
      `/products/recommended?${params.toString()}`,
      this.timeoutMs,
    );

    return {
      contextType: 'recommendations',
      contextPayload: data,
    };
  }

  async getPaymentInfo(): Promise<ContextBlock> {
    const data = await fetchEntelequiaJson(this.baseUrl, '/cart/payment-info', this.timeoutMs);

    return {
      contextType: 'payment_info',
      contextPayload: data,
    };
  }

  async getOrders(input: { accessToken: string }): Promise<ContextBlock> {
    const data = await fetchEntelequiaJson(
      this.baseUrl,
      '/account/orders',
      this.timeoutMs,
      {
        Authorization: `Bearer ${input.accessToken}`,
      },
    );

    return {
      contextType: 'orders',
      contextPayload: data,
    };
  }

  async getOrderDetail(input: { accessToken: string; orderId: string }): Promise<ContextBlock> {
    const data = await fetchEntelequiaJson(
      this.baseUrl,
      `/account/orders/${encodeURIComponent(input.orderId)}`,
      this.timeoutMs,
      {
        Authorization: `Bearer ${input.accessToken}`,
      },
    );

    return {
      contextType: 'order_detail',
      contextPayload: data,
    };
  }
}
