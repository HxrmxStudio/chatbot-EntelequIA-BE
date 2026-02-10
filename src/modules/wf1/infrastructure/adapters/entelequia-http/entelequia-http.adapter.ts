import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntelequiaContextPort } from '@/modules/wf1/application/ports/entelequia-context.port';
import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import {
  accountOrderDetailEndpoint,
  accountOrdersEndpoint,
  cartPaymentInfoEndpoint,
  productDetailEndpoint,
  productsListEndpoint,
  productsRecommendedEndpoint,
} from './endpoints';
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

  async getPaymentInfo(): Promise<ContextBlock> {
    const endpoint = cartPaymentInfoEndpoint();
    const data = await fetchEntelequiaJson(this.baseUrl, endpoint, this.timeoutMs);

    return {
      contextType: 'payment_info',
      contextPayload: data,
    };
  }

  async getOrders(input: { accessToken: string }): Promise<ContextBlock> {
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
  }

  async getOrderDetail(input: { accessToken: string; orderId: string }): Promise<ContextBlock> {
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
  }
}
