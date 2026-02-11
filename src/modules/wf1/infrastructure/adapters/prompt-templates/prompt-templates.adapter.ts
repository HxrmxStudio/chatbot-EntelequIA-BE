import { Injectable } from '@nestjs/common';
import type { PromptTemplatesPort } from '../../../application/ports/prompt-templates.port';
import { loadPromptFile } from '../shared';
import {
  DEFAULT_ORDER_DETAIL_CONTEXT_INSTRUCTIONS,
  DEFAULT_ORDERS_CONTEXT_HEADER,
  DEFAULT_ORDERS_CONTEXT_INSTRUCTIONS,
  DEFAULT_ORDERS_EMPTY_CONTEXT_MESSAGE,
  DEFAULT_PAYMENT_SHIPPING_COST_CONTEXT,
  DEFAULT_PAYMENT_SHIPPING_GENERAL_CONTEXT,
  DEFAULT_PAYMENT_SHIPPING_INSTRUCTIONS,
  DEFAULT_PAYMENT_SHIPPING_PAYMENT_CONTEXT,
  DEFAULT_PAYMENT_SHIPPING_SHIPPING_CONTEXT,
  DEFAULT_PAYMENT_SHIPPING_TIME_CONTEXT,
  DEFAULT_RECOMMENDATIONS_CONTEXT_HEADER,
  DEFAULT_RECOMMENDATIONS_CONTEXT_INSTRUCTIONS,
  DEFAULT_RECOMMENDATIONS_CONTEXT_WHY_THESE,
  DEFAULT_RECOMMENDATIONS_EMPTY_CONTEXT_MESSAGE,
  DEFAULT_GENERAL_CONTEXT_HINT,
  DEFAULT_PRODUCTS_CONTEXT_ADDITIONAL_INFO,
  DEFAULT_PRODUCTS_CONTEXT_HEADER,
  DEFAULT_PRODUCTS_CONTEXT_INSTRUCTIONS,
  DEFAULT_STATIC_CONTEXT,
  GENERAL_CONTEXT_HINT_PATH,
  ORDER_DETAIL_CONTEXT_INSTRUCTIONS_PATH,
  ORDERS_CONTEXT_HEADER_PATH,
  ORDERS_CONTEXT_INSTRUCTIONS_PATH,
  ORDERS_EMPTY_CONTEXT_MESSAGE_PATH,
  PAYMENT_SHIPPING_COST_CONTEXT_PATH,
  PAYMENT_SHIPPING_GENERAL_CONTEXT_PATH,
  PAYMENT_SHIPPING_INSTRUCTIONS_PATH,
  PAYMENT_SHIPPING_PAYMENT_CONTEXT_PATH,
  PAYMENT_SHIPPING_SHIPPING_CONTEXT_PATH,
  PAYMENT_SHIPPING_TIME_CONTEXT_PATH,
  RECOMMENDATIONS_CONTEXT_HEADER_PATH,
  RECOMMENDATIONS_CONTEXT_INSTRUCTIONS_PATH,
  RECOMMENDATIONS_CONTEXT_WHY_THESE_PATH,
  RECOMMENDATIONS_EMPTY_CONTEXT_MESSAGE_PATH,
  PRODUCTS_CONTEXT_ADDITIONAL_INFO_PATH,
  PRODUCTS_CONTEXT_HEADER_PATH,
  PRODUCTS_CONTEXT_INSTRUCTIONS_PATH,
  STATIC_CONTEXT_PATH,
} from './constants';

/**
 * Adapter that loads and provides prompt templates from filesystem.
 * Loads all prompts synchronously in constructor for simplicity.
 * Uses fallback defaults if files cannot be loaded.
 *
 * Implements PromptTemplatesPort to provide centralized prompt access.
 */
@Injectable()
export class PromptTemplatesAdapter implements PromptTemplatesPort {
  private readonly productsHeader: string;
  private readonly productsAdditionalInfo: string;
  private readonly productsInstructions: string;
  private readonly ordersHeader: string;
  private readonly ordersInstructions: string;
  private readonly orderDetailInstructions: string;
  private readonly ordersEmptyMessage: string;
  private readonly paymentShippingPaymentContext: string;
  private readonly paymentShippingShippingContext: string;
  private readonly paymentShippingCostContext: string;
  private readonly paymentShippingTimeContext: string;
  private readonly paymentShippingGeneralContext: string;
  private readonly paymentShippingInstructions: string;
  private readonly recommendationsContextHeader: string;
  private readonly recommendationsContextWhyThese: string;
  private readonly recommendationsContextInstructions: string;
  private readonly recommendationsEmptyContextMessage: string;
  private readonly generalHint: string;
  private readonly staticContext: string;

  constructor() {
    // Load all prompts at construction time (synchronous, acceptable for static prompts)
    this.productsHeader = loadPromptFile(PRODUCTS_CONTEXT_HEADER_PATH, DEFAULT_PRODUCTS_CONTEXT_HEADER);
    this.productsAdditionalInfo = loadPromptFile(
      PRODUCTS_CONTEXT_ADDITIONAL_INFO_PATH,
      DEFAULT_PRODUCTS_CONTEXT_ADDITIONAL_INFO,
    );
    this.productsInstructions = loadPromptFile(
      PRODUCTS_CONTEXT_INSTRUCTIONS_PATH,
      DEFAULT_PRODUCTS_CONTEXT_INSTRUCTIONS,
    );
    this.ordersHeader = loadPromptFile(ORDERS_CONTEXT_HEADER_PATH, DEFAULT_ORDERS_CONTEXT_HEADER);
    this.ordersInstructions = loadPromptFile(
      ORDERS_CONTEXT_INSTRUCTIONS_PATH,
      DEFAULT_ORDERS_CONTEXT_INSTRUCTIONS,
    );
    this.orderDetailInstructions = loadPromptFile(
      ORDER_DETAIL_CONTEXT_INSTRUCTIONS_PATH,
      DEFAULT_ORDER_DETAIL_CONTEXT_INSTRUCTIONS,
    );
    this.ordersEmptyMessage = loadPromptFile(
      ORDERS_EMPTY_CONTEXT_MESSAGE_PATH,
      DEFAULT_ORDERS_EMPTY_CONTEXT_MESSAGE,
    );
    this.paymentShippingPaymentContext = loadPromptFile(
      PAYMENT_SHIPPING_PAYMENT_CONTEXT_PATH,
      DEFAULT_PAYMENT_SHIPPING_PAYMENT_CONTEXT,
    );
    this.paymentShippingShippingContext = loadPromptFile(
      PAYMENT_SHIPPING_SHIPPING_CONTEXT_PATH,
      DEFAULT_PAYMENT_SHIPPING_SHIPPING_CONTEXT,
    );
    this.paymentShippingCostContext = loadPromptFile(
      PAYMENT_SHIPPING_COST_CONTEXT_PATH,
      DEFAULT_PAYMENT_SHIPPING_COST_CONTEXT,
    );
    this.paymentShippingTimeContext = loadPromptFile(
      PAYMENT_SHIPPING_TIME_CONTEXT_PATH,
      DEFAULT_PAYMENT_SHIPPING_TIME_CONTEXT,
    );
    this.paymentShippingGeneralContext = loadPromptFile(
      PAYMENT_SHIPPING_GENERAL_CONTEXT_PATH,
      DEFAULT_PAYMENT_SHIPPING_GENERAL_CONTEXT,
    );
    this.paymentShippingInstructions = loadPromptFile(
      PAYMENT_SHIPPING_INSTRUCTIONS_PATH,
      DEFAULT_PAYMENT_SHIPPING_INSTRUCTIONS,
    );
    this.recommendationsContextHeader = loadPromptFile(
      RECOMMENDATIONS_CONTEXT_HEADER_PATH,
      DEFAULT_RECOMMENDATIONS_CONTEXT_HEADER,
    );
    this.recommendationsContextWhyThese = loadPromptFile(
      RECOMMENDATIONS_CONTEXT_WHY_THESE_PATH,
      DEFAULT_RECOMMENDATIONS_CONTEXT_WHY_THESE,
    );
    this.recommendationsContextInstructions = loadPromptFile(
      RECOMMENDATIONS_CONTEXT_INSTRUCTIONS_PATH,
      DEFAULT_RECOMMENDATIONS_CONTEXT_INSTRUCTIONS,
    );
    this.recommendationsEmptyContextMessage = loadPromptFile(
      RECOMMENDATIONS_EMPTY_CONTEXT_MESSAGE_PATH,
      DEFAULT_RECOMMENDATIONS_EMPTY_CONTEXT_MESSAGE,
    );
    this.generalHint = loadPromptFile(GENERAL_CONTEXT_HINT_PATH, DEFAULT_GENERAL_CONTEXT_HINT);
    this.staticContext = loadPromptFile(STATIC_CONTEXT_PATH, DEFAULT_STATIC_CONTEXT);
  }

  getProductsContextHeader(): string {
    return this.productsHeader;
  }

  getProductsContextAdditionalInfo(): string {
    return this.productsAdditionalInfo;
  }

  getProductsContextInstructions(): string {
    return this.productsInstructions;
  }

  getOrdersListContextHeader(): string {
    return this.ordersHeader;
  }

  getOrdersListContextInstructions(): string {
    return this.ordersInstructions;
  }

  getOrderDetailContextInstructions(): string {
    return this.orderDetailInstructions;
  }

  getOrdersEmptyContextMessage(): string {
    return this.ordersEmptyMessage;
  }

  getPaymentShippingPaymentContext(): string {
    return this.paymentShippingPaymentContext;
  }

  getPaymentShippingShippingContext(): string {
    return this.paymentShippingShippingContext;
  }

  getPaymentShippingCostContext(): string {
    return this.paymentShippingCostContext;
  }

  getPaymentShippingTimeContext(): string {
    return this.paymentShippingTimeContext;
  }

  getPaymentShippingGeneralContext(): string {
    return this.paymentShippingGeneralContext;
  }

  getPaymentShippingInstructions(): string {
    return this.paymentShippingInstructions;
  }

  getRecommendationsContextHeader(): string {
    return this.recommendationsContextHeader;
  }

  getRecommendationsContextWhyThese(): string {
    return this.recommendationsContextWhyThese;
  }

  getRecommendationsContextInstructions(): string {
    return this.recommendationsContextInstructions;
  }

  getRecommendationsEmptyContextMessage(): string {
    return this.recommendationsEmptyContextMessage;
  }

  getGeneralContextHint(): string {
    return this.generalHint;
  }

  getStaticContext(): string {
    return this.staticContext;
  }
}
