export interface PromptTemplatesPort {
  getProductsContextHeader(): string;
  getProductsContextAdditionalInfo(): string;
  getProductsContextInstructions(): string;
  getOrdersListContextHeader(): string;
  getOrdersListContextInstructions(): string;
  getOrderDetailContextInstructions(): string;
  getOrdersEmptyContextMessage(): string;
  getPaymentShippingPaymentContext(): string;
  getPaymentShippingShippingContext(): string;
  getPaymentShippingCostContext(): string;
  getPaymentShippingTimeContext(): string;
  getPaymentShippingGeneralContext(): string;
  getPaymentShippingInstructions(): string;
  getGeneralContextHint(): string;
  getStaticContext(): string;
}
