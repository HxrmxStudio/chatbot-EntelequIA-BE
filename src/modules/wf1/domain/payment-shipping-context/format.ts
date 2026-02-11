import {
  DEFAULT_API_FALLBACK_NOTE,
  DEFAULT_COST_CONTEXT,
  DEFAULT_GENERAL_CONTEXT,
  DEFAULT_INSTRUCTIONS,
  DEFAULT_PAYMENT_CONTEXT,
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_SHIPPING_CONTEXT,
  DEFAULT_TIME_CONTEXT,
} from './constants';
import type { PaymentShippingAiContext, PaymentShippingQueryType, PaymentShippingTemplates } from './types';

/**
 * Builds AI-ready context for payment/shipping queries using a query subtype and dynamic API data.
 * This context intentionally excludes static business data (stores/contact), which lives in static_context.
 */
export function buildPaymentShippingAiContext(input: {
  queryType: PaymentShippingQueryType;
  paymentMethods?: string[];
  promotions?: string[];
  apiFallback: boolean;
  templates?: Partial<PaymentShippingTemplates>;
}): PaymentShippingAiContext {
  const queryType = input.queryType;
  const paymentMethods = sanitizeLines(input.paymentMethods, DEFAULT_PAYMENT_METHODS);
  const promotions = sanitizeLines(input.promotions, []);
  const templates = resolveTemplates(input.templates);

  const section = resolveSectionByQueryType(queryType, templates);
  const lines: string[] = [section];

  if (shouldIncludePaymentMethods(queryType) && paymentMethods.length > 0) {
    lines.push('', 'Metodos disponibles:', ...paymentMethods.map((method) => `- ${method}`));
  }

  if (shouldIncludePromotions(queryType) && promotions.length > 0) {
    lines.push('', 'Promociones vigentes:', ...promotions.map((promotion) => `- ${promotion}`));
  }

  if (input.apiFallback) {
    lines.push('', DEFAULT_API_FALLBACK_NOTE);
  }

  lines.push('', templates.instructions);

  return {
    contextText: lines.join('\n'),
    queryType,
    paymentMethods,
    promotions,
    apiFallback: input.apiFallback,
  };
}

function resolveTemplates(
  partial?: Partial<PaymentShippingTemplates>,
): PaymentShippingTemplates {
  return {
    paymentContext: partial?.paymentContext ?? DEFAULT_PAYMENT_CONTEXT,
    shippingContext: partial?.shippingContext ?? DEFAULT_SHIPPING_CONTEXT,
    costContext: partial?.costContext ?? DEFAULT_COST_CONTEXT,
    timeContext: partial?.timeContext ?? DEFAULT_TIME_CONTEXT,
    generalContext: partial?.generalContext ?? DEFAULT_GENERAL_CONTEXT,
    instructions: partial?.instructions ?? DEFAULT_INSTRUCTIONS,
  };
}

function resolveSectionByQueryType(
  queryType: PaymentShippingQueryType,
  templates: PaymentShippingTemplates,
): string {
  switch (queryType) {
    case 'payment':
      return templates.paymentContext;
    case 'shipping':
      return templates.shippingContext;
    case 'cost':
      return templates.costContext;
    case 'time':
      return templates.timeContext;
    case 'general':
    default:
      return templates.generalContext;
  }
}

function sanitizeLines(values: string[] | undefined, fallback: string[]): string[] {
  const source = Array.isArray(values) && values.length > 0 ? values : fallback;
  const unique = new Set<string>();

  for (const value of source) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      continue;
    }

    unique.add(trimmed);
  }

  return Array.from(unique);
}

function shouldIncludePaymentMethods(queryType: PaymentShippingQueryType): boolean {
  return queryType === 'payment' || queryType === 'general';
}

function shouldIncludePromotions(queryType: PaymentShippingQueryType): boolean {
  return queryType === 'payment' || queryType === 'general' || queryType === 'cost';
}
