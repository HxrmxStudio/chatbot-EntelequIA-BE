import { Inject, Injectable } from '@nestjs/common';
import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import { ExternalServiceError, MissingAuthForOrdersError } from '@/modules/wf1/domain/errors';
import type { IntentResult } from '@/modules/wf1/domain/intent';
import {
  buildProductsAiContext,
  buildProductAvailabilityHint,
  selectBestProductMatch,
} from '@/modules/wf1/domain/products-context';
import type { PromptTemplatesPort } from '../../ports/prompt-templates.port';
import { ENTELEQUIA_CONTEXT_PORT, PROMPT_TEMPLATES_PORT } from '../../ports/tokens';
import type { EntelequiaContextPort } from '../../ports/entelequia-context.port';
import { resolveProductsQuery, resolveOrderId } from './query-resolvers';
import { extractProductItems } from './product-parsers';

@Injectable()
export class EnrichContextByIntentUseCase {
  constructor(
    @Inject(ENTELEQUIA_CONTEXT_PORT)
    private readonly entelequiaContextPort: EntelequiaContextPort,
    @Inject(PROMPT_TEMPLATES_PORT)
    private readonly promptTemplates: PromptTemplatesPort,
  ) {}

  async execute(input: {
    intentResult: IntentResult;
    text: string;
    currency?: 'ARS' | 'USD';
    accessToken?: string;
  }): Promise<ContextBlock[]> {
    const { intentResult } = input;

    switch (intentResult.intent) {
      case 'products': {
        const query = resolveProductsQuery(intentResult.entities, input.text);
        const products = await this.entelequiaContextPort.getProducts({
          query,
          currency: input.currency,
        });

        const items = extractProductItems(products.contextPayload);
        const total =
          typeof products.contextPayload.total === 'number'
            ? products.contextPayload.total
            : undefined;
        const aiContext = buildProductsAiContext({
          items,
          total,
          query,
          templates: {
            header: this.promptTemplates.getProductsContextHeader(),
            additionalInfo: this.promptTemplates.getProductsContextAdditionalInfo(),
            instructions: this.promptTemplates.getProductsContextInstructions(),
          },
        });
        const productsWithAi: ContextBlock = {
          ...products,
          contextPayload: {
            ...products.contextPayload,
            aiContext: aiContext.contextText,
            productCount: aiContext.productCount,
            totalCount: aiContext.totalCount,
            inStockCount: aiContext.inStockCount,
          },
        };
        const bestMatch = selectBestProductMatch({
          items,
          entities: intentResult.entities,
          text: input.text,
        });

        if (!bestMatch) {
          return [productsWithAi];
        }

        const productsWithBest: ContextBlock = {
          ...productsWithAi,
          contextPayload: {
            ...productsWithAi.contextPayload,
            bestMatch,
            availabilityHint: buildProductAvailabilityHint(bestMatch),
          },
        };

        try {
          const detail = await this.entelequiaContextPort.getProductDetail({
            idOrSlug: bestMatch.slug,
            currency: input.currency,
          });

          return [productsWithBest, detail];
        } catch (error: unknown) {
          // Product detail is an optional enrichment step. If it fails, keep going with the list context.
          if (error instanceof ExternalServiceError) {
            return [productsWithBest];
          }

          throw error;
        }
      }

      case 'orders': {
        if (!input.accessToken) {
          throw new MissingAuthForOrdersError();
        }

        const orderId = resolveOrderId(intentResult.entities, input.text);
        if (orderId) {
          const orderDetail = await this.entelequiaContextPort.getOrderDetail({
            accessToken: input.accessToken,
            orderId,
          });

          return [orderDetail];
        }

        const orders = await this.entelequiaContextPort.getOrders({
          accessToken: input.accessToken,
        });

        return [orders];
      }

      case 'payment_shipping': {
        const paymentInfo = await this.entelequiaContextPort.getPaymentInfo();
        return [paymentInfo];
      }

      case 'tickets':
        return [
          {
            contextType: 'tickets',
            contextPayload: {
              escalationHint:
                'Detectamos un caso de soporte/reclamo. Priorizar contencion, pedir datos clave y ofrecer derivacion humana.',
            },
          },
        ];

      case 'recommendations': {
        const recommendations = await this.entelequiaContextPort.getRecommendations({
          currency: input.currency,
        });

        return [recommendations];
      }

      case 'store_info': {
        return [
          {
            contextType: 'store_info',
            contextPayload: {
              info:
                'Atendemos consultas de catalogo, pedidos y medios de pago. Para casos complejos, derivamos a soporte humano.',
            },
          },
        ];
      }

      case 'general':
      default: {
        const hint = this.promptTemplates.getGeneralContextHint();
        return [
          {
            contextType: 'general',
            contextPayload: {
              hint,
            },
          },
        ];
      }
    }
  }
}
