import { Injectable } from '@nestjs/common';
import type { PromptTemplatesPort } from '../../../application/ports/prompt-templates.port';
import { loadPromptFile } from '../shared';
import {
  DEFAULT_GENERAL_CONTEXT_INSTRUCTIONS,
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
  DEFAULT_STORE_INFO_CONTEXT_INSTRUCTIONS,
  DEFAULT_STORE_INFO_GENERAL_CONTEXT,
  DEFAULT_STORE_INFO_HOURS_CONTEXT,
  DEFAULT_STORE_INFO_LOCATION_CONTEXT,
  DEFAULT_STORE_INFO_PARKING_CONTEXT,
  DEFAULT_STORE_INFO_TRANSPORT_CONTEXT,
  DEFAULT_TICKETS_CONTACT_OPTIONS,
  DEFAULT_TICKETS_CONTEXT_HEADER,
  DEFAULT_TICKETS_CONTEXT_INSTRUCTIONS,
  DEFAULT_TICKETS_HIGH_PRIORITY_NOTE,
  DEFAULT_TICKETS_RETURNS_POLICY_CONTEXT,
  DEFAULT_GENERAL_CONTEXT_HINT,
  DEFAULT_PRODUCTS_CONTEXT_ADDITIONAL_INFO,
  DEFAULT_PRODUCTS_CONTEXT_HEADER,
  DEFAULT_PRODUCTS_CONTEXT_INSTRUCTIONS,
  DEFAULT_POLICY_FACTS_SHORT_CONTEXT,
  DEFAULT_STATIC_CONTEXT,
  DEFAULT_CRITICAL_POLICY_CONTEXT,
  GENERAL_CONTEXT_INSTRUCTIONS_PATH,
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
  STORE_INFO_CONTEXT_INSTRUCTIONS_PATH,
  STORE_INFO_GENERAL_CONTEXT_PATH,
  STORE_INFO_HOURS_CONTEXT_PATH,
  STORE_INFO_LOCATION_CONTEXT_PATH,
  STORE_INFO_PARKING_CONTEXT_PATH,
  STORE_INFO_TRANSPORT_CONTEXT_PATH,
  TICKETS_CONTACT_OPTIONS_PATH,
  TICKETS_CONTEXT_HEADER_PATH,
  TICKETS_CONTEXT_INSTRUCTIONS_PATH,
  TICKETS_HIGH_PRIORITY_NOTE_PATH,
  TICKETS_RETURNS_POLICY_CONTEXT_PATH,
  PRODUCTS_CONTEXT_ADDITIONAL_INFO_PATH,
  PRODUCTS_CONTEXT_HEADER_PATH,
  PRODUCTS_CONTEXT_INSTRUCTIONS_PATH,
  STATIC_CONTEXT_PATH,
  CRITICAL_POLICY_CONTEXT_PATH,
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
  private readonly ticketsContextHeader: string;
  private readonly ticketsContactOptions: string;
  private readonly ticketsHighPriorityNote: string;
  private readonly ticketsReturnsPolicyContext: string;
  private readonly ticketsContextInstructions: string;
  private readonly storeInfoLocationContext: string;
  private readonly storeInfoHoursContext: string;
  private readonly storeInfoParkingContext: string;
  private readonly storeInfoTransportContext: string;
  private readonly storeInfoGeneralContext: string;
  private readonly storeInfoContextInstructions: string;
  private readonly generalHint: string;
  private readonly generalInstructions: string;
  private readonly policyFactsShortContext: string;
  private readonly staticContext: string;
  private readonly criticalPolicyContext: string;

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
    this.ticketsContextHeader = loadPromptFile(
      TICKETS_CONTEXT_HEADER_PATH,
      DEFAULT_TICKETS_CONTEXT_HEADER,
    );
    this.ticketsContactOptions = loadPromptFile(
      TICKETS_CONTACT_OPTIONS_PATH,
      DEFAULT_TICKETS_CONTACT_OPTIONS,
    );
    this.ticketsHighPriorityNote = loadPromptFile(
      TICKETS_HIGH_PRIORITY_NOTE_PATH,
      DEFAULT_TICKETS_HIGH_PRIORITY_NOTE,
    );
    this.ticketsReturnsPolicyContext = loadPromptFile(
      TICKETS_RETURNS_POLICY_CONTEXT_PATH,
      DEFAULT_TICKETS_RETURNS_POLICY_CONTEXT,
    );
    this.ticketsContextInstructions = loadPromptFile(
      TICKETS_CONTEXT_INSTRUCTIONS_PATH,
      DEFAULT_TICKETS_CONTEXT_INSTRUCTIONS,
    );
    this.storeInfoLocationContext = loadPromptFile(
      STORE_INFO_LOCATION_CONTEXT_PATH,
      DEFAULT_STORE_INFO_LOCATION_CONTEXT,
    );
    this.storeInfoHoursContext = loadPromptFile(
      STORE_INFO_HOURS_CONTEXT_PATH,
      DEFAULT_STORE_INFO_HOURS_CONTEXT,
    );
    this.storeInfoParkingContext = loadPromptFile(
      STORE_INFO_PARKING_CONTEXT_PATH,
      DEFAULT_STORE_INFO_PARKING_CONTEXT,
    );
    this.storeInfoTransportContext = loadPromptFile(
      STORE_INFO_TRANSPORT_CONTEXT_PATH,
      DEFAULT_STORE_INFO_TRANSPORT_CONTEXT,
    );
    this.storeInfoGeneralContext = loadPromptFile(
      STORE_INFO_GENERAL_CONTEXT_PATH,
      DEFAULT_STORE_INFO_GENERAL_CONTEXT,
    );
    this.storeInfoContextInstructions = loadPromptFile(
      STORE_INFO_CONTEXT_INSTRUCTIONS_PATH,
      DEFAULT_STORE_INFO_CONTEXT_INSTRUCTIONS,
    );
    this.generalHint = loadPromptFile(GENERAL_CONTEXT_HINT_PATH, DEFAULT_GENERAL_CONTEXT_HINT);
    this.generalInstructions = loadPromptFile(
      GENERAL_CONTEXT_INSTRUCTIONS_PATH,
      DEFAULT_GENERAL_CONTEXT_INSTRUCTIONS,
    );
    this.staticContext = loadPromptFile(STATIC_CONTEXT_PATH, DEFAULT_STATIC_CONTEXT);
    this.criticalPolicyContext = loadPromptFile(
      CRITICAL_POLICY_CONTEXT_PATH,
      DEFAULT_CRITICAL_POLICY_CONTEXT,
    );
    this.policyFactsShortContext = buildPolicyFactsShortContext({
      staticContext: this.staticContext,
      criticalPolicyContext: this.criticalPolicyContext,
      paymentShippingGeneralContext: this.paymentShippingGeneralContext,
      fallback: DEFAULT_POLICY_FACTS_SHORT_CONTEXT,
    });
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

  getTicketsContextHeader(): string {
    return this.ticketsContextHeader;
  }

  getTicketsContactOptions(): string {
    return this.ticketsContactOptions;
  }

  getTicketsHighPriorityNote(): string {
    return this.ticketsHighPriorityNote;
  }

  getTicketsReturnsPolicyContext(): string {
    return this.ticketsReturnsPolicyContext;
  }

  getTicketsContextInstructions(): string {
    return this.ticketsContextInstructions;
  }

  getStoreInfoLocationContext(): string {
    return this.storeInfoLocationContext;
  }

  getStoreInfoHoursContext(): string {
    return this.storeInfoHoursContext;
  }

  getStoreInfoParkingContext(): string {
    return this.storeInfoParkingContext;
  }

  getStoreInfoTransportContext(): string {
    return this.storeInfoTransportContext;
  }

  getStoreInfoGeneralContext(): string {
    return this.storeInfoGeneralContext;
  }

  getStoreInfoContextInstructions(): string {
    return this.storeInfoContextInstructions;
  }

  getGeneralContextHint(): string {
    return this.generalHint;
  }

  getGeneralContextInstructions(): string {
    return this.generalInstructions;
  }

  getPolicyFactsShortContext(): string {
    return this.policyFactsShortContext;
  }

  getStaticContext(): string {
    return this.staticContext;
  }

  getCriticalPolicyContext(): string {
    return this.criticalPolicyContext;
  }
}

function buildPolicyFactsShortContext(input: {
  staticContext: string;
  criticalPolicyContext: string;
  paymentShippingGeneralContext: string;
  fallback: string;
}): string {
  const sections: string[] = [];

  const returnsLine = findFirstMatchingLine(
    input.criticalPolicyContext,
    /30\s*d[ií]as|devoluciones|cambios/i,
  );
  if (returnsLine) {
    sections.push(`- ${returnsLine}`);
  }

  const reservationLine = findFirstMatchingLine(
    input.staticContext,
    /reserv(a|ar|as)|48hs|30%/i,
  );
  if (reservationLine) {
    sections.push(`- ${reservationLine}`);
  }

  const importedLine = findFirstMatchingLine(
    input.staticContext,
    /importad|bajo pedido|30-60|30 a 60|50%/i,
  );
  if (importedLine) {
    sections.push(`- ${importedLine}`);
  }

  const editorialLines = findMatchingLines(
    input.staticContext,
    /(ivrea|panini|mil sue[ñn]os|editoriales?)/i,
  ).slice(0, 2);
  if (editorialLines.length > 0) {
    sections.push(`- ${editorialLines.join(' ')}`);
  }

  const internationalShippingLine = findFirstMatchingLine(
    `${input.paymentShippingGeneralContext}\n${input.criticalPolicyContext}\n${input.staticContext}`,
    /(env[ií]os?\s+internacionales?|dhl)/i,
  );
  if (internationalShippingLine) {
    sections.push(`- ${internationalShippingLine}`);
  }

  const promotionsLine = findFirstMatchingLine(
    `${input.paymentShippingGeneralContext}\n${input.staticContext}`,
    /(promoci[oó]n|promociones|descuentos?)/i,
  );
  if (promotionsLine) {
    sections.push(`- ${promotionsLine}`);
  }

  if (sections.length === 0) {
    return input.fallback;
  }

  return ['# Hechos criticos de negocio', ...sections].join('\n');
}

function findMatchingLines(content: string, pattern: RegExp): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => pattern.test(line))
    .map((line) => line.replace(/^[-*]\s*/, '').trim());
}

function findFirstMatchingLine(content: string, pattern: RegExp): string | null {
  const line = findMatchingLines(content, pattern)[0];
  return line ?? null;
}
