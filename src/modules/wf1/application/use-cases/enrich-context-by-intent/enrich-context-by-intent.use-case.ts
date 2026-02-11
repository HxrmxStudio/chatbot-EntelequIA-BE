import { Inject, Injectable } from '@nestjs/common';
import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import { ExternalServiceError, MissingAuthForOrdersError } from '@/modules/wf1/domain/errors';
import type { IntentResult } from '@/modules/wf1/domain/intent';
import {
  buildProductsAiContext,
  buildProductAvailabilityHint,
  selectBestProductMatch,
} from '@/modules/wf1/domain/products-context';
import {
  buildOrderDetailAiContext,
  buildOrdersListAiContext,
} from '@/modules/wf1/domain/orders-context';
import { buildPaymentShippingAiContext } from '@/modules/wf1/domain/payment-shipping-context';
import type { PromptTemplatesPort } from '../../ports/prompt-templates.port';
import { ENTELEQUIA_CONTEXT_PORT, PROMPT_TEMPLATES_PORT } from '../../ports/tokens';
import type { EntelequiaContextPort } from '../../ports/entelequia-context.port';
import {
  resolveOrderId,
  resolvePaymentShippingQueryType,
  resolveProductsQuery,
} from './query-resolvers';
import { extractProductItems } from './product-parsers';
import {
  extractOrderDetail,
  extractOrdersList,
  extractOrdersTotal,
  throwIfUnauthenticatedOrdersPayload,
} from './order-parsers';
import { extractPaymentMethods, extractPromotions } from './payment-info-parsers';

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
        const resolvedQuery = resolveProductsQuery(intentResult.entities, input.text);
        const query = resolvedQuery.productName;
        const products = await this.entelequiaContextPort.getProducts({
          query,
          ...(resolvedQuery.categorySlug ? { categorySlug: resolvedQuery.categorySlug } : {}),
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
            resolvedQuery,
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

        const ordersTemplates = {
          header: this.promptTemplates.getOrdersListContextHeader(),
          listInstructions: this.promptTemplates.getOrdersListContextInstructions(),
          detailInstructions: this.promptTemplates.getOrderDetailContextInstructions(),
          emptyMessage: this.promptTemplates.getOrdersEmptyContextMessage(),
        };

        const orderId = resolveOrderId(intentResult.entities, input.text);
        if (orderId) {
          const orderDetail = await this.entelequiaContextPort.getOrderDetail({
            accessToken: input.accessToken,
            orderId,
          });

          throwIfUnauthenticatedOrdersPayload(orderDetail.contextPayload);

          const parsedOrder = extractOrderDetail(orderDetail.contextPayload);
          const aiContext = buildOrderDetailAiContext({
            order: parsedOrder,
            templates: ordersTemplates,
          });

          const detailWithAiContext: ContextBlock = {
            ...orderDetail,
            contextPayload: {
              ...orderDetail.contextPayload,
              ...(parsedOrder ? { orderId: parsedOrder.id } : { orderId }),
              aiContext: aiContext.contextText,
            },
          };

          return [detailWithAiContext];
        }

        const orders = await this.entelequiaContextPort.getOrders({
          accessToken: input.accessToken,
        });

        throwIfUnauthenticatedOrdersPayload(orders.contextPayload);

        const parsedOrders = extractOrdersList(orders.contextPayload);
        const totalOrders = extractOrdersTotal(orders.contextPayload, parsedOrders.length);
        const aiContext = buildOrdersListAiContext({
          orders: parsedOrders,
          total: totalOrders,
          templates: ordersTemplates,
        });

        const ordersWithAiContext: ContextBlock = {
          ...orders,
          contextPayload: {
            ...orders.contextPayload,
            aiContext: aiContext.contextText,
            ordersShown: aiContext.ordersShown,
            totalOrders: aiContext.totalOrders,
          },
        };

        return [ordersWithAiContext];
      }

      case 'payment_shipping': {
        const queryType = resolvePaymentShippingQueryType(input.text);
        const paymentTemplates = {
          paymentContext: this.promptTemplates.getPaymentShippingPaymentContext(),
          shippingContext: this.promptTemplates.getPaymentShippingShippingContext(),
          costContext: this.promptTemplates.getPaymentShippingCostContext(),
          timeContext: this.promptTemplates.getPaymentShippingTimeContext(),
          generalContext: this.promptTemplates.getPaymentShippingGeneralContext(),
          instructions: this.promptTemplates.getPaymentShippingInstructions(),
        };

        try {
          const paymentInfo = await this.entelequiaContextPort.getPaymentInfo();
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
