import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntelequiaContextPort } from '@/modules/wf1/application/ports/entelequia-context.port';
import type { ContextBlock } from '@/modules/wf1/domain/context-block';
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
  private readonly baseUrl: string;
  private readonly webBaseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
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
