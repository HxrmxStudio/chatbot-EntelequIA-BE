/**
 * Entelequia API endpoints.
 * Centralized endpoint definitions for better maintainability.
 */

export function productsListEndpoint(categorySlug?: string): string {
  const categoryPath = categorySlug ? `/${encodeURIComponent(categorySlug)}` : '';
  return `/products-list${categoryPath}`;
}

export function productDetailEndpoint(idOrSlug: string): string {
  return `/product/${encodeURIComponent(idOrSlug)}`;
}

export function productsRecommendedEndpoint(): string {
  return '/products/recommended';
}

export function cartPaymentInfoEndpoint(): string {
  return '/cart/payment-info';
}

export function accountOrdersEndpoint(): string {
  return '/account/orders';
}

export function accountOrderDetailEndpoint(orderId: string): string {
  return `/account/orders/${encodeURIComponent(orderId)}`;
}

/**
 * Frontend/web URLs for Entelequia.
 * These are public-facing URLs, not API endpoints.
 */

export function productWebUrl(webBaseUrl: string, slug: string): string {
  return `${webBaseUrl}/producto/${encodeURIComponent(slug)}`;
}

export function storageImageUrl(webBaseUrl: string, path: string): string {
  const normalizedPath = path.trim().replace(/^\//, '');
  return `${webBaseUrl}/storage/${normalizedPath}`;
}
