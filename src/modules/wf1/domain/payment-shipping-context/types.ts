export type PaymentShippingQueryType = 'payment' | 'shipping' | 'cost' | 'time' | 'general';

export interface PaymentShippingTemplates {
  paymentContext: string;
  shippingContext: string;
  costContext: string;
  timeContext: string;
  generalContext: string;
  instructions: string;
}

export interface PaymentShippingAiContext {
  contextText: string;
  queryType: PaymentShippingQueryType;
  paymentMethods: string[];
  promotions: string[];
  apiFallback: boolean;
}
