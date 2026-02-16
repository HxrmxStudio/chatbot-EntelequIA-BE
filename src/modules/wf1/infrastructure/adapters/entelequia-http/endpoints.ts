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

export function productsBrandsEndpoint(): string {
  return '/products/brands';
}

export function productsAuthorsEndpoint(search?: string): string {
  if (!search || search.trim().length === 0) {
    return '/products/authors';
  }

  const params = new URLSearchParams({
    search: search.trim(),
  });

  return `/products/authors?${params.toString()}`;
}

export function cartPaymentInfoEndpoint(): string {
  return '/cart/payment-info';
}

export function accountProfileEndpoint(): string {
  return '/account/profile';
}

export function accountOrdersEndpoint(): string {
  return '/account/orders';
}

export function accountOrderDetailEndpoint(orderId: string): string {
  return `/account/orders/${encodeURIComponent(orderId)}`;
}
