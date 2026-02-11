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
import {
  buildEmptyRecommendationsAiContext,
  buildRecommendationsAiContext,
  filterRecommendationsByType,
  WF1_RECOMMENDATIONS_CONTEXT_AI_MAX_ITEMS,
} from '@/modules/wf1/domain/recommendations-context';
import { buildTicketsAiContext } from '@/modules/wf1/domain/tickets-context';
import { buildStoreInfoAiContext } from '@/modules/wf1/domain/store-info-context';
import { buildGeneralAiContext } from '@/modules/wf1/domain/general-context';
import type { Sentiment } from '@/modules/wf1/domain/output-validation';
import type { PromptTemplatesPort } from '../../ports/prompt-templates.port';
import { ENTELEQUIA_CONTEXT_PORT, PROMPT_TEMPLATES_PORT } from '../../ports/tokens';
import type { EntelequiaContextPort } from '../../ports/entelequia-context.port';
import {
  resolveOrderId,
  resolvePaymentShippingQueryType,
  resolveRecommendationsPreferences,
  resolveStoreInfoQueryType,
  resolveTicketSignals,
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
import {
  extractRecommendedItems,
  extractRecommendationsTotal,
} from './recommendation-parsers';

const ENTELEQUIA_DEFAULT_WEB_BASE_URL = 'https://entelequia.com.ar';

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
    sentiment?: Sentiment;
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

      case 'tickets': {
        const ticketSignals = resolveTicketSignals({
          text: input.text,
          entities: intentResult.entities,
          sentiment: input.sentiment ?? 'neutral',
        });
        const aiContext = buildTicketsAiContext({
          signals: ticketSignals,
          templates: {
            header: this.promptTemplates.getTicketsContextHeader(),
            contactOptions: this.promptTemplates.getTicketsContactOptions(),
            highPriorityNote: this.promptTemplates.getTicketsHighPriorityNote(),
            instructions: this.promptTemplates.getTicketsContextInstructions(),
          },
        });

        return [
          {
            contextType: 'tickets',
            contextPayload: {
              issueType: aiContext.issueType,
              priority: aiContext.priority,
              sentiment: aiContext.sentiment,
              requiresHumanEscalation: aiContext.requiresHumanEscalation,
              aiContext: aiContext.contextText,
            },
          },
        ];
      }

      case 'recommendations': {
        const preferences = resolveRecommendationsPreferences({
          text: input.text,
          entities: intentResult.entities,
        });
        const recommendationsTemplates = {
          header: this.promptTemplates.getRecommendationsContextHeader(),
          whyThese: this.promptTemplates.getRecommendationsContextWhyThese(),
          instructions: this.promptTemplates.getRecommendationsContextInstructions(),
          emptyMessage: this.promptTemplates.getRecommendationsEmptyContextMessage(),
        };

        try {
          const recommendations = await this.entelequiaContextPort.getRecommendations({
            currency: input.currency,
          });

          const recommendedItems = extractRecommendedItems(
            recommendations.contextPayload,
            ENTELEQUIA_DEFAULT_WEB_BASE_URL,
          );
          const totalRecommendations = extractRecommendationsTotal(
            recommendations.contextPayload,
            recommendedItems.length,
          );
          const stockFiltered = recommendedItems.filter((item) => item.stock > 0);
          const typeFiltered = filterRecommendationsByType(
            stockFiltered,
            preferences.type,
          );

          if (typeFiltered.length === 0) {
            const emptyAiContext = buildEmptyRecommendationsAiContext({
              preferences,
              templates: recommendationsTemplates,
              apiFallback: false,
            });

            return [
              {
                ...recommendations,
                contextPayload: {
                  ...recommendations.contextPayload,
                  aiContext: emptyAiContext.contextText,
                  products: [],
                  preferences: emptyAiContext.preferences,
                  recommendationsCount: emptyAiContext.recommendationsCount,
                  totalRecommendations,
                  apiFallback: emptyAiContext.apiFallback,
                  fallbackReason: 'no_matches',
                  afterStockFilter: stockFiltered.length,
                  afterTypeFilter: typeFiltered.length,
                },
              },
            ];
          }

          const aiContext = buildRecommendationsAiContext({
            items: typeFiltered,
            total: totalRecommendations,
            preferences,
            templates: recommendationsTemplates,
          });
          const shownProducts = typeFiltered.slice(
            0,
            WF1_RECOMMENDATIONS_CONTEXT_AI_MAX_ITEMS,
          );

          return [
            {
              ...recommendations,
              contextPayload: {
                ...recommendations.contextPayload,
                aiContext: aiContext.contextText,
                products: shownProducts,
                preferences: aiContext.preferences,
                recommendationsCount: aiContext.recommendationsCount,
                totalRecommendations: aiContext.totalRecommendations,
                apiFallback: aiContext.apiFallback,
                afterStockFilter: stockFiltered.length,
                afterTypeFilter: typeFiltered.length,
              },
            },
          ];
        } catch (error: unknown) {
          if (error instanceof ExternalServiceError) {
            const emptyAiContext = buildEmptyRecommendationsAiContext({
              preferences,
              templates: recommendationsTemplates,
              apiFallback: true,
            });

            return [
              {
                contextType: 'recommendations',
                contextPayload: {
                  aiContext: emptyAiContext.contextText,
                  products: [],
                  preferences: emptyAiContext.preferences,
                  recommendationsCount: emptyAiContext.recommendationsCount,
                  totalRecommendations: emptyAiContext.totalRecommendations,
                  apiFallback: emptyAiContext.apiFallback,
                  fallbackReason: 'api_error',
                  afterStockFilter: 0,
                  afterTypeFilter: 0,
                },
              },
            ];
          }

          throw error;
        }
      }

      case 'store_info': {
        const infoRequested = resolveStoreInfoQueryType({
          text: input.text,
          entities: intentResult.entities,
        });
        const aiContext = buildStoreInfoAiContext({
          infoRequested,
          templates: {
            locationContext: this.promptTemplates.getStoreInfoLocationContext(),
            hoursContext: this.promptTemplates.getStoreInfoHoursContext(),
            parkingContext: this.promptTemplates.getStoreInfoParkingContext(),
            transportContext: this.promptTemplates.getStoreInfoTransportContext(),
            generalContext: this.promptTemplates.getStoreInfoGeneralContext(),
            instructions: this.promptTemplates.getStoreInfoContextInstructions(),
          },
        });

        return [
          {
            contextType: 'store_info',
            contextPayload: {
              infoRequested: aiContext.infoRequested,
              aiContext: aiContext.contextText,
            },
          },
        ];
      }

      case 'general':
      default: {
        const hint = this.promptTemplates.getGeneralContextHint();
        const aiContext = buildGeneralAiContext({
          templates: {
            hint,
            instructions: this.promptTemplates.getGeneralContextInstructions(),
          },
        });
        return [
          {
            contextType: 'general',
            contextPayload: {
              hint,
              aiContext: aiContext.contextText,
            },
          },
        ];
      }
    }
  }
}
