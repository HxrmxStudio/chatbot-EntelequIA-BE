import type { ContextBlock } from '../../domain/context-block';

export interface EntelequiaContextPort {
  getProducts(input: { query?: string; categorySlug?: string; currency?: 'ARS' | 'USD' }): Promise<ContextBlock>;
  getProductDetail(input: { idOrSlug: string; currency?: 'ARS' | 'USD' }): Promise<ContextBlock>;
  getRecommendations(input: { currency?: 'ARS' | 'USD' }): Promise<ContextBlock>;
  getPaymentInfo(): Promise<ContextBlock>;
  getOrders(input: { accessToken: string }): Promise<ContextBlock>;
  getOrderDetail(input: { accessToken: string; orderId: string }): Promise<ContextBlock>;
}
