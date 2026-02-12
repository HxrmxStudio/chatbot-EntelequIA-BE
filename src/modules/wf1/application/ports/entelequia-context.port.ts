import type { ContextBlock } from '../../domain/context-block';

export interface AuthenticatedUserProfile {
  id?: string;
  email: string;
  phone: string;
  name: string;
}

export interface EntelequiaContextPort {
  getProducts(input: { query?: string; categorySlug?: string; currency?: 'ARS' | 'USD' }): Promise<ContextBlock>;
  getProductDetail(input: { idOrSlug: string; currency?: 'ARS' | 'USD' }): Promise<ContextBlock>;
  getRecommendations(input: { currency?: 'ARS' | 'USD' }): Promise<ContextBlock>;
  getProductBrands(): Promise<ContextBlock>;
  getProductAuthors(input?: { search?: string }): Promise<ContextBlock>;
  getPaymentInfo(): Promise<ContextBlock>;
  getAuthenticatedUserProfile(input: { accessToken: string }): Promise<AuthenticatedUserProfile>;
  getOrders(input: { accessToken: string }): Promise<ContextBlock>;
  getOrderDetail(input: { accessToken: string; orderId: string }): Promise<ContextBlock>;
}
