import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import { ExternalServiceError } from '@/modules/wf1/domain/errors';
import { buildPaymentShippingAiContext } from '@/modules/wf1/domain/payment-shipping-context';
import { resolvePaymentShippingQueryType } from '../query-resolvers';
import { extractPaymentMethods, extractPromotions } from '../payment-info-parsers';
import type { EnrichInput, EnrichDeps } from '../types';

export async function enrichPaymentShipping(
  input: EnrichInput,
  deps: EnrichDeps,
): Promise<ContextBlock[]> {
  const { entelequiaContextPort, promptTemplates } = deps;

  const queryType = resolvePaymentShippingQueryType(input.text);
  const paymentTemplates = {
    paymentContext: promptTemplates.getPaymentShippingPaymentContext(),
    shippingContext: promptTemplates.getPaymentShippingShippingContext(),
    costContext: promptTemplates.getPaymentShippingCostContext(),
    timeContext: promptTemplates.getPaymentShippingTimeContext(),
    generalContext: promptTemplates.getPaymentShippingGeneralContext(),
    instructions: promptTemplates.getPaymentShippingInstructions(),
  };

  try {
    const paymentInfo = await entelequiaContextPort.getPaymentInfo();
    const paymentMethods = extractPaymentMethods(paymentInfo.contextPayload);
    const promotions = extractPromotions(paymentInfo.contextPayload);

    const aiContext = buildPaymentShippingAiContext({
      queryType,
      paymentMethods,
      promotions,
      apiFallback: false,
      templates: paymentTemplates,
    });

    const paymentInfoWithAiContext: ContextBlock = {
      ...paymentInfo,
      contextPayload: {
        ...paymentInfo.contextPayload,
        aiContext: aiContext.contextText,
        queryType: aiContext.queryType,
        paymentMethods: aiContext.paymentMethods,
        promotions: aiContext.promotions,
        apiFallback: aiContext.apiFallback,
      },
    };

    return [paymentInfoWithAiContext];
  } catch (error: unknown) {
    if (error instanceof ExternalServiceError) {
      const aiContext = buildPaymentShippingAiContext({
        queryType,
        paymentMethods: [],
        promotions: [],
        apiFallback: true,
        templates: paymentTemplates,
      });

      return [
        {
          contextType: 'payment_info',
          contextPayload: {
            aiContext: aiContext.contextText,
            queryType: aiContext.queryType,
            paymentMethods: aiContext.paymentMethods,
            promotions: aiContext.promotions,
            apiFallback: aiContext.apiFallback,
          },
        },
      ];
    }

    throw error;
  }
}
