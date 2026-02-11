import type { Money } from '../money';

export interface OrderLineItem {
  title?: string;
  quantity: number;
  unitPrice?: Money;
  totalPrice?: Money;
}

export interface OrderPaymentInfo {
  paymentMethod?: string;
  status?: string;
}

export interface OrderSummaryItem {
  id: string | number;
  state: string;
  createdAt?: string;
  total?: Money;
  shipMethod?: string;
  shipTrackingCode?: string;
  orderItems: OrderLineItem[];
  payment?: OrderPaymentInfo;
}

export type OrderDetailItem = OrderSummaryItem;

export interface OrdersAiContext {
  contextText: string;
  ordersShown: number;
  totalOrders: number;
}

export interface OrderDetailAiContext {
  contextText: string;
  orderId?: string | number;
}

export interface OrdersContextTemplates {
  header: string;
  listInstructions: string;
  detailInstructions: string;
  emptyMessage: string;
}

export type CanonicalOrderState =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'unknown';
