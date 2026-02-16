import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  type OrderSummaryItem,
} from '@/modules/wf1/domain/orders-context';
import { buildPaymentShippingAiContext } from '@/modules/wf1/domain/payment-shipping-context';
import {
  buildEmptyRecommendationsAiContext,
  buildRecommendationsAiContext,
  detectRecommendationType,
  filterRecommendationsByType,
  WF1_RECOMMENDATIONS_CONTEXT_AI_MAX_ITEMS,
} from '@/modules/wf1/domain/recommendations-context';
import { buildTicketsAiContext } from '@/modules/wf1/domain/tickets-context';
import { buildStoreInfoAiContext } from '@/modules/wf1/domain/store-info-context';
import { buildGeneralAiContext } from '@/modules/wf1/domain/general-context';
import type { Sentiment } from '@/modules/wf1/domain/output-validation';
import { isRecord } from '@/common/utils/object.utils';
import type { PromptTemplatesPort } from '../../ports/prompt-templates.port';
import { ENTELEQUIA_CONTEXT_PORT, PROMPT_TEMPLATES_PORT } from '../../ports/tokens';
import type { EntelequiaContextPort } from '../../ports/entelequia-context.port';
import {
  buildDynamicFranchiseAliases,
  getDefaultCategorySlug,
  getRecommendationFranchiseTerms,
  resolveOrderId,
  resolvePaymentShippingQueryType,
  resolveRecommendationDisambiguation,
  resolveRecommendationEditorialMatch,
  resolveRecommendationFranchiseQuery,
  resolveRecommendationFranchiseKeywords,
  resolveRecommendationsPreferences,
  resolveStoreInfoQueryType,
  resolveTicketSignals,
  resolveProductsQuery,
  resolveStockDisclosure,
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
const WF1_LOW_STOCK_THRESHOLD = 3;
const RECOMMENDATIONS_DYNAMIC_FRANCHISE_MIN_EVIDENCE = 2;
const RECOMMENDATIONS_FALLBACK_THRESHOLD = 20;
const RECOMMENDATIONS_VOLUME_THRESHOLD = 10;

@Injectable()
export class EnrichContextByIntentUseCase {
  private readonly recommendationsDisambiguationEnabled: boolean;
  private readonly recommendationsFranchiseThreshold: number;
  private readonly recommendationsVolumeThreshold: number;

  constructor(
    @Inject(ENTELEQUIA_CONTEXT_PORT)
    private readonly entelequiaContextPort: EntelequiaContextPort,
    @Inject(PROMPT_TEMPLATES_PORT)
    private readonly promptTemplates: PromptTemplatesPort,
    @Optional()
    private readonly configService?: ConfigService,
  ) {
    this.recommendationsDisambiguationEnabled = resolveRecommendationsDisambiguationEnabled(
      this.configService?.get<string | boolean>(
        'WF1_RECOMMENDATIONS_DISAMBIGUATION_ENABLED',
      ),
    );
    this.recommendationsFranchiseThreshold = resolveRecommendationsThreshold(
      this.configService?.get<number>('WF1_RECOMMENDATIONS_FRANCHISE_THRESHOLD'),
      RECOMMENDATIONS_FALLBACK_THRESHOLD,
    );
    this.recommendationsVolumeThreshold = resolveRecommendationsThreshold(
      this.configService?.get<number>('WF1_RECOMMENDATIONS_VOLUME_THRESHOLD'),
      RECOMMENDATIONS_VOLUME_THRESHOLD,
    );
  }

  async execute(input: {
    intentResult: IntentResult;
    text: string;
    sentiment?: Sentiment;
    currency?: 'ARS' | 'USD';
    accessToken?: string;
    requestId?: string;
    conversationId?: string;
    orderIdOverride?: string;
  }): Promise<ContextBlock[]> {
    const { intentResult } = input;

    switch (intentResult.intent) {
      case 'products': {
        const discloseExactStock = resolveStockDisclosure({
          text: input.text,
          entities: intentResult.entities,
        });
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
          discloseExactStock,
          lowStockThreshold: WF1_LOW_STOCK_THRESHOLD,
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
            stockDisclosurePolicy: discloseExactStock ? 'exact' : 'banded',
            lowStockThreshold: WF1_LOW_STOCK_THRESHOLD,
            discloseExactStock,
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
            availabilityHint: buildProductAvailabilityHint(bestMatch, {
              discloseExactStock,
              lowStockThreshold: WF1_LOW_STOCK_THRESHOLD,
            }),
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

        const orderId = resolvePreferredOrderId(input.orderIdOverride, intentResult.entities, input.text);
        if (orderId) {
          const orderDetail = await this.entelequiaContextPort.getOrderDetail({
            accessToken: input.accessToken,
            orderId,
            ...(input.requestId ? { requestId: input.requestId } : {}),
            ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          });

          throwIfUnauthenticatedOrdersPayload(orderDetail.contextPayload);

          const ordersList = await this.entelequiaContextPort.getOrders({
            accessToken: input.accessToken,
            ...(input.requestId ? { requestId: input.requestId } : {}),
            ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          });
          throwIfUnauthenticatedOrdersPayload(ordersList.contextPayload);

          const parsedOrder = extractOrderDetail(orderDetail.contextPayload);
          const parsedOrders = extractOrdersList(ordersList.contextPayload);
          const matchedListOrder = findOrderSummaryById(parsedOrders, orderId);
          const ordersStateConflict = Boolean(
            parsedOrder &&
              matchedListOrder &&
              parsedOrder.stateCanonical !== matchedListOrder.stateCanonical,
          );
          const aiContext = buildOrderDetailAiContext({
            order: parsedOrder,
            templates: ordersTemplates,
          });

          const detailWithAiContext: ContextBlock = {
            ...orderDetail,
            contextPayload: {
              ...orderDetail.contextPayload,
              ...(parsedOrder ? { orderId: parsedOrder.id } : { orderId }),
              ...(parsedOrder ? { parsedOrder } : {}),
              ...(matchedListOrder ? { matchedListOrder } : {}),
              orderStateRaw: parsedOrder?.stateRaw ?? null,
              orderStateCanonical: parsedOrder?.stateCanonical ?? null,
              orderListStateRaw: matchedListOrder?.stateRaw ?? null,
              orderListStateCanonical: matchedListOrder?.stateCanonical ?? null,
              ordersStateConflict,
              aiContext: aiContext.contextText,
            },
          };

          return [detailWithAiContext];
        }

        const orders = await this.entelequiaContextPort.getOrders({
          accessToken: input.accessToken,
          ...(input.requestId ? { requestId: input.requestId } : {}),
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
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
            parsedOrders,
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
            returnsPolicy: this.promptTemplates.getTicketsReturnsPolicyContext(),
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
          const requestedFranchises = resolveRecommendationFranchiseKeywords({
            text: input.text,
            entities: intentResult.entities,
          });
          const hasExplicitFranchiseRequest = requestedFranchises.length > 0;
          const preferredCategorySlug = resolvePreferredRecommendationCategorySlug(
            preferences.type,
          );

          let contextSource: ContextBlock;
          let recommendationsSource: 'featured' | 'search' = 'featured';
          let recommendedItems: ReturnType<typeof extractRecommendedItems>;
          let totalRecommendations = 0;
          let dynamicFranchiseAliases = {};
          let selectedFranchise = requestedFranchises[0] ?? null;
          let editorialMatch = {
            matchedBrands: [] as string[],
            matchedAuthors: [] as string[],
            suggestedBrands: [] as string[],
            confidence: 0,
          };
          let taxonomyContext: ContextBlock | null = null;

          if (selectedFranchise) {
            const searchContext = await this.entelequiaContextPort.getProducts({
              query: resolveRecommendationFranchiseQuery(selectedFranchise),
              ...(preferredCategorySlug ? { categorySlug: preferredCategorySlug } : {}),
              currency: input.currency,
            });
            recommendationsSource = 'search';

            if (isProductsPayloadValidForRecommendations(searchContext.contextPayload)) {
              contextSource = searchContext;
              recommendedItems = mapProductsContextToRecommendationItems(
                searchContext.contextPayload,
              );
              totalRecommendations = resolveProductsRecommendationsTotal(
                searchContext.contextPayload,
                recommendedItems.length,
              );
            } else {
              contextSource = await this.entelequiaContextPort.getRecommendations({
                currency: input.currency,
              });
              recommendationsSource = 'featured';

              if (!isRecommendationsPayloadValid(contextSource.contextPayload)) {
                const catalogUnavailableContext =
                  buildCatalogUnavailableRecommendationsContext({
                    preferences,
                    templates: recommendationsTemplates,
                  });

                return [
                  {
                    ...catalogUnavailableContext,
                    contextPayload: {
                      ...catalogUnavailableContext.contextPayload,
                      matchedFranchises: requestedFranchises,
                      recommendationsSource,
                    },
                  },
                ];
              }

              recommendedItems = extractRecommendedItems(
                contextSource.contextPayload,
                ENTELEQUIA_DEFAULT_WEB_BASE_URL,
              );
              totalRecommendations = extractRecommendationsTotal(
                contextSource.contextPayload,
                recommendedItems.length,
              );
            }
          } else {
            contextSource = await this.entelequiaContextPort.getRecommendations({
              currency: input.currency,
            });

            if (!isRecommendationsPayloadValid(contextSource.contextPayload)) {
              const catalogUnavailableContext =
                buildCatalogUnavailableRecommendationsContext({
                  preferences,
                  templates: recommendationsTemplates,
                });

              return [catalogUnavailableContext];
            }

            recommendedItems = extractRecommendedItems(
              contextSource.contextPayload,
              ENTELEQUIA_DEFAULT_WEB_BASE_URL,
            );
            totalRecommendations = extractRecommendationsTotal(
              contextSource.contextPayload,
              recommendedItems.length,
            );
            dynamicFranchiseAliases = buildDynamicFranchiseAliases({
              items: recommendedItems,
              minEvidence: RECOMMENDATIONS_DYNAMIC_FRANCHISE_MIN_EVIDENCE,
            });

            const dynamicFranchises = resolveRecommendationFranchiseKeywords({
              text: input.text,
              entities: intentResult.entities,
              dynamicAliases: dynamicFranchiseAliases,
            });

            selectedFranchise = dynamicFranchises[0] ?? null;
            if (selectedFranchise) {
              const searchContext = await this.entelequiaContextPort.getProducts({
                query: resolveRecommendationFranchiseQuery(selectedFranchise),
                ...(preferredCategorySlug ? { categorySlug: preferredCategorySlug } : {}),
                currency: input.currency,
              });

              if (isProductsPayloadValidForRecommendations(searchContext.contextPayload)) {
                contextSource = searchContext;
                recommendationsSource = 'search';
                recommendedItems = mapProductsContextToRecommendationItems(
                  searchContext.contextPayload,
                );
                totalRecommendations = resolveProductsRecommendationsTotal(
                  searchContext.contextPayload,
                  recommendedItems.length,
                );
              }
            }
          }

          dynamicFranchiseAliases = buildDynamicFranchiseAliases({
            items: recommendedItems,
            minEvidence: RECOMMENDATIONS_DYNAMIC_FRANCHISE_MIN_EVIDENCE,
          });

          const matchedFranchises = selectedFranchise
            ? resolveMatchedFranchises({
                requestedFranchises: [selectedFranchise],
                items: recommendedItems,
                dynamicAliases: dynamicFranchiseAliases,
              })
            : resolveMatchedFranchises({
                requestedFranchises: requestedFranchises,
                items: recommendedItems,
                dynamicAliases: dynamicFranchiseAliases,
              });

          const stockFiltered = recommendedItems.filter((item) => item.stock > 0);
          const hasMatchedFranchise = matchedFranchises.length > 0;
          const franchiseFiltered = filterRecommendationsByFranchise({
            items: stockFiltered,
            franchises: matchedFranchises,
            dynamicAliases: dynamicFranchiseAliases,
          });
          const baseForTypeFilter =
            hasExplicitFranchiseRequest || hasMatchedFranchise
              ? franchiseFiltered
              : stockFiltered;
          const typeFiltered = filterRecommendationsByType(baseForTypeFilter, preferences.type);
          const finalFiltered = hasExplicitFranchiseRequest
            ? typeFiltered
            : hasMatchedFranchise && franchiseFiltered.length > 0 && typeFiltered.length === 0
              ? franchiseFiltered
              : typeFiltered;
          const suggestedTypes = resolveSuggestionTypesFromItems(
            hasExplicitFranchiseRequest ? stockFiltered : baseForTypeFilter,
          );

          if (!hasMatchedFranchise || finalFiltered.length === 0) {
            taxonomyContext = await fetchCatalogTaxonomyContext(
              this.entelequiaContextPort,
              input.text,
              intentResult.entities,
            );
            if (taxonomyContext) {
              editorialMatch = resolveRecommendationEditorialMatch({
                text: input.text,
                entities: intentResult.entities,
                brands: readCatalogEntries(taxonomyContext.contextPayload.brands),
                authors: readCatalogEntries(taxonomyContext.contextPayload.authors),
              });
            }
          }

          const disambiguation = this.recommendationsDisambiguationEnabled
            ? resolveRecommendationDisambiguation({
                text: input.text,
                franchise: matchedFranchises[0] ?? null,
                suggestedTypes,
                totalCandidates: baseForTypeFilter.length,
                preferredTypes: preferences.type,
                franchiseThreshold: this.recommendationsFranchiseThreshold,
                volumeThreshold: this.recommendationsVolumeThreshold,
              })
            : {
                needsDisambiguation: false,
                reason: null,
                franchise: matchedFranchises[0] ?? null,
                suggestedTypes,
                totalCandidates: baseForTypeFilter.length,
              };

          if (disambiguation.needsDisambiguation) {
            return [
              {
                contextType: 'recommendations',
                contextPayload: {
                  ...contextSource.contextPayload,
                  aiContext: buildRecommendationsDisambiguationAiContext(disambiguation),
                  products: finalFiltered.slice(0, WF1_RECOMMENDATIONS_CONTEXT_AI_MAX_ITEMS),
                  preferences,
                  recommendationsCount: finalFiltered.length,
                  totalRecommendations,
                  apiFallback: false,
                  fallbackReason: null,
                  afterStockFilter: stockFiltered.length,
                  afterFranchiseFilter: hasMatchedFranchise
                    ? franchiseFiltered.length
                    : stockFiltered.length,
                  afterTypeFilter: typeFiltered.length,
                  matchedFranchises,
                  recommendationsSource,
                  matchedBrands: editorialMatch.matchedBrands,
                  suggestedBrands: editorialMatch.suggestedBrands,
                  needsDisambiguation: true,
                  disambiguationReason: disambiguation.reason,
                  disambiguationFranchise: disambiguation.franchise,
                  disambiguationSuggestedTypes: disambiguation.suggestedTypes,
                  disambiguationTotalCandidates: disambiguation.totalCandidates,
                },
              },
            ];
          }

          if (finalFiltered.length === 0) {
            const emptyAiContext = buildEmptyRecommendationsAiContext({
              preferences,
              templates: recommendationsTemplates,
              apiFallback: false,
              fallbackReason: 'no_matches',
            });
            const emptyAiContextWithSuggestions = buildEditorialSuggestionContext({
              aiContext: emptyAiContext.contextText,
              suggestedBrands: editorialMatch.suggestedBrands,
              suggestedTypes,
            });

            return [
              {
                contextType: 'recommendations',
                contextPayload: {
                  ...contextSource.contextPayload,
                  aiContext: emptyAiContextWithSuggestions,
                  products: [],
                  preferences: emptyAiContext.preferences,
                  recommendationsCount: emptyAiContext.recommendationsCount,
                  totalRecommendations,
                  apiFallback: emptyAiContext.apiFallback,
                  fallbackReason: 'no_matches',
                  afterStockFilter: stockFiltered.length,
                  afterFranchiseFilter: hasMatchedFranchise
                    ? franchiseFiltered.length
                    : stockFiltered.length,
                  afterTypeFilter: typeFiltered.length,
                  matchedFranchises,
                  matchedBrands: editorialMatch.matchedBrands,
                  matchedAuthors: editorialMatch.matchedAuthors,
                  suggestedBrands: editorialMatch.suggestedBrands,
                  nextQuestion:
                    'Queres que te muestre mangas, figuras o merch de alguna editorial en particular?',
                  recommendationsSource,
                  needsDisambiguation: false,
                  disambiguationReason: null,
                  disambiguationFranchise: null,
                  disambiguationSuggestedTypes: [],
                  disambiguationTotalCandidates: baseForTypeFilter.length,
                },
              },
            ];
          }

          const aiContext = buildRecommendationsAiContext({
            items: finalFiltered,
            total: totalRecommendations,
            preferences,
            templates: recommendationsTemplates,
          });
          const shownProducts = finalFiltered.slice(
            0,
            WF1_RECOMMENDATIONS_CONTEXT_AI_MAX_ITEMS,
          );

          return [
            {
              contextType: 'recommendations',
              contextPayload: {
                ...contextSource.contextPayload,
                aiContext: aiContext.contextText,
                products: shownProducts,
                preferences: aiContext.preferences,
                recommendationsCount: aiContext.recommendationsCount,
                totalRecommendations: aiContext.totalRecommendations,
                apiFallback: aiContext.apiFallback,
                afterStockFilter: stockFiltered.length,
                afterFranchiseFilter: hasMatchedFranchise
                  ? franchiseFiltered.length
                  : stockFiltered.length,
                afterTypeFilter: typeFiltered.length,
                matchedFranchises,
                matchedBrands: editorialMatch.matchedBrands,
                matchedAuthors: editorialMatch.matchedAuthors,
                suggestedBrands: editorialMatch.suggestedBrands,
                recommendationsSource,
                needsDisambiguation: false,
                disambiguationReason: null,
                disambiguationFranchise: null,
                disambiguationSuggestedTypes: [],
                disambiguationTotalCandidates: baseForTypeFilter.length,
              },
            },
          ];
        } catch (error: unknown) {
          if (error instanceof ExternalServiceError) {
            const emptyAiContext = buildEmptyRecommendationsAiContext({
              preferences,
              templates: recommendationsTemplates,
              apiFallback: true,
              fallbackReason: 'api_error',
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
                  afterFranchiseFilter: 0,
                  afterTypeFilter: 0,
                  matchedFranchises: [],
                  recommendationsSource: 'featured',
                  needsDisambiguation: false,
                  disambiguationReason: null,
                  disambiguationFranchise: null,
                  disambiguationSuggestedTypes: [],
                  disambiguationTotalCandidates: 0,
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

function findOrderSummaryById(
  orders: OrderSummaryItem[],
  orderId: string,
): OrderSummaryItem | null {
  const normalizedOrderId = normalizeOrderId(orderId);
  if (normalizedOrderId.length === 0) {
    return null;
  }

  for (const order of orders) {
    if (normalizeOrderId(order.id) === normalizedOrderId) {
      return order;
    }
  }

  return null;
}

function resolvePreferredOrderId(
  orderIdOverride: string | undefined,
  entities: string[],
  text: string,
): string | undefined {
  const normalizedOverride = typeof orderIdOverride === 'string' ? orderIdOverride.trim() : '';
  return normalizedOverride.length > 0 ? normalizedOverride : resolveOrderId(entities, text);
}

function normalizeOrderId(value: string | number): string {
  return String(value).trim().toLowerCase();
}

function isRecommendationsPayloadValid(payload: Record<string, unknown> | unknown[]): boolean {
  if (Array.isArray(payload)) {
    return true;
  }

  return isRecord(payload) && Array.isArray(payload.data);
}

function isProductsPayloadValidForRecommendations(
  payload: Record<string, unknown> | unknown[],
): payload is Record<string, unknown> {
  return isRecord(payload) && Array.isArray(payload.items);
}

function buildCatalogUnavailableRecommendationsContext(input: {
  preferences: {
    franchiseKeywords: string[];
    genre: string[];
    type: string[];
    age: number | null;
  };
  templates: {
    header: string;
    whyThese: string;
    instructions: string;
    emptyMessage: string;
  };
}): ContextBlock {
  const emptyAiContext = buildEmptyRecommendationsAiContext({
    preferences: input.preferences,
    templates: input.templates,
    apiFallback: true,
    fallbackReason: 'catalog_unavailable',
  });

  return {
    contextType: 'recommendations',
    contextPayload: {
      aiContext: emptyAiContext.contextText,
      products: [],
      preferences: emptyAiContext.preferences,
      recommendationsCount: emptyAiContext.recommendationsCount,
      totalRecommendations: emptyAiContext.totalRecommendations,
      apiFallback: emptyAiContext.apiFallback,
      fallbackReason: 'catalog_unavailable',
      afterStockFilter: 0,
      afterFranchiseFilter: 0,
      afterTypeFilter: 0,
      matchedFranchises: [],
      recommendationsSource: 'featured',
      needsDisambiguation: false,
      disambiguationReason: null,
      disambiguationFranchise: null,
      disambiguationSuggestedTypes: [],
      disambiguationTotalCandidates: 0,
    },
  };
}

function filterRecommendationsByFranchise(input: {
  items: ReturnType<typeof extractRecommendedItems>;
  franchises: string[];
  dynamicAliases?: Record<string, readonly string[]>;
}): ReturnType<typeof extractRecommendedItems> {
  if (input.franchises.length === 0) {
    return [];
  }

  const terms = input.franchises.flatMap((franchise) =>
    getRecommendationFranchiseTerms(franchise, input.dynamicAliases),
  );

  if (terms.length === 0) {
    return [];
  }

  return input.items.filter((item) => {
    const normalizedTitle = normalizeTerm(item.title);
    const normalizedSlug = normalizeTerm(item.slug);
    const normalizedCategories = [...item.categoryNames, ...item.categorySlugs]
      .map((value) => normalizeTerm(value))
      .filter((value) => value.length > 0);

    return terms.some((term) =>
      containsTerm(normalizedTitle, term) ||
      containsTerm(normalizedSlug, term) ||
      normalizedCategories.some((category) => containsTerm(category, term)),
    );
  });
}

function resolveMatchedFranchises(input: {
  requestedFranchises: string[];
  items: ReturnType<typeof extractRecommendedItems>;
  dynamicAliases?: Record<string, readonly string[]>;
}): string[] {
  if (input.requestedFranchises.length === 0 || input.items.length === 0) {
    return [];
  }

  return input.requestedFranchises.filter((franchise) => {
    const franchiseTerms = getRecommendationFranchiseTerms(franchise, input.dynamicAliases);
    if (franchiseTerms.length === 0) {
      return false;
    }

    return input.items.some((item) => {
      const normalizedParts = [
        normalizeTerm(item.title),
        normalizeTerm(item.slug),
        ...item.categoryNames.map((value) => normalizeTerm(value)),
        ...item.categorySlugs.map((value) => normalizeTerm(value)),
      ];
      return franchiseTerms.some((term) =>
        normalizedParts.some((part) => containsTerm(part, term)),
      );
    });
  });
}

function mapProductsContextToRecommendationItems(
  payload: Record<string, unknown>,
): ReturnType<typeof extractRecommendedItems> {
  const items = payload.items;
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => {
      const categoryName =
        typeof entry.categoryName === 'string' ? entry.categoryName : undefined;
      const categorySlug =
        typeof entry.categorySlug === 'string' ? entry.categorySlug : undefined;
      const categoryNames = categoryName ? [categoryName] : [];
      const categorySlugs = categorySlug ? [categorySlug] : [];

      return {
        id:
          typeof entry.id === 'string' || typeof entry.id === 'number'
            ? entry.id
            : String(entry.slug ?? ''),
        slug: typeof entry.slug === 'string' ? entry.slug : '',
        title: typeof entry.title === 'string' ? entry.title : '',
        stock: typeof entry.stock === 'number' ? entry.stock : 0,
        categoryName,
        categorySlug,
        categoryNames,
        categorySlugs,
        price: isRecord(entry.price)
          ? {
              currency:
                typeof entry.price.currency === 'string' ? entry.price.currency : 'ARS',
              amount:
                typeof entry.price.amount === 'number' ? entry.price.amount : 0,
            }
          : undefined,
        priceWithDiscount: isRecord(entry.priceWithDiscount)
          ? {
              currency:
                typeof entry.priceWithDiscount.currency === 'string'
                  ? entry.priceWithDiscount.currency
                  : 'ARS',
              amount:
                typeof entry.priceWithDiscount.amount === 'number'
                  ? entry.priceWithDiscount.amount
                  : 0,
            }
          : undefined,
        discountPercent:
          typeof entry.discountPercent === 'number' ? entry.discountPercent : undefined,
        url: typeof entry.url === 'string' ? entry.url : undefined,
        imageUrl: typeof entry.imageUrl === 'string' ? entry.imageUrl : undefined,
      };
    })
    .filter((item) => item.slug.length > 0 && item.title.length > 0);
}

function resolveProductsRecommendationsTotal(
  payload: Record<string, unknown>,
  fallbackLength: number,
): number {
  const total = payload.total;
  if (typeof total === 'number' && Number.isFinite(total) && total > 0) {
    return total;
  }

  return fallbackLength;
}

async function fetchCatalogTaxonomyContext(
  entelequiaContextPort: EntelequiaContextPort,
  text: string,
  entities: string[],
): Promise<ContextBlock | null> {
  const authorSearch = [text, ...entities].join(' ').trim();
  const [brandsResult, authorsResult] = await Promise.allSettled([
    entelequiaContextPort.getProductBrands(),
    entelequiaContextPort.getProductAuthors(
      authorSearch.length > 0 ? { search: authorSearch } : undefined,
    ),
  ]);

  const brands =
    brandsResult.status === 'fulfilled'
      ? readCatalogEntries(brandsResult.value.contextPayload.brands)
      : [];
  const authors =
    authorsResult.status === 'fulfilled'
      ? readCatalogEntries(authorsResult.value.contextPayload.authors)
      : [];

  if (brands.length === 0 && authors.length === 0) {
    return null;
  }

  return {
    contextType: 'catalog_taxonomy',
    contextPayload: {
      brands,
      authors,
      aiContext: buildCatalogTaxonomyAiContext(brands, authors),
    },
  };
}

function readCatalogEntries(value: unknown): Array<{ id: string | number; name: string; slug: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      id:
        typeof entry.id === 'string' || typeof entry.id === 'number'
          ? entry.id
          : String(entry.slug ?? entry.name ?? ''),
      name: typeof entry.name === 'string' ? entry.name.trim() : '',
      slug: typeof entry.slug === 'string' ? entry.slug.trim() : '',
    }))
    .filter((entry) => entry.name.length > 0 && entry.slug.length > 0);
}

function buildCatalogTaxonomyAiContext(
  brands: Array<{ name: string }>,
  authors: Array<{ name: string }>,
): string {
  const topBrands = brands.slice(0, 8).map((entry) => entry.name);
  const topAuthors = authors.slice(0, 5).map((entry) => entry.name);

  return [
    'Taxonomia catalogo disponible para sugerencias:',
    topBrands.length > 0 ? `- Editoriales: ${topBrands.join(', ')}` : '- Editoriales: (sin datos)',
    topAuthors.length > 0 ? `- Autores: ${topAuthors.join(', ')}` : '- Autores: (sin datos)',
  ].join('\n');
}

function buildEditorialSuggestionContext(input: {
  aiContext: string;
  suggestedBrands: string[];
  suggestedTypes: string[];
}): string {
  if (input.suggestedBrands.length === 0) {
    return input.aiContext;
  }

  const brandLine = `Editoriales sugeridas: ${input.suggestedBrands.join(', ')}.`;
  const typesLine = input.suggestedTypes.length > 0
    ? `Sugerir que elija tipo de producto (${input.suggestedTypes.join(', ')}).`
    : 'Sugerir que elija tipo de producto (mangas, comics, figuras o merch).';

  return [input.aiContext, '', brandLine, typesLine].join('\n');
}

function resolvePreferredRecommendationCategorySlug(types: string[]): string | undefined {
  if (types.length === 0) {
    return undefined;
  }

  for (const type of types) {
    const slug = getDefaultCategorySlug(type);
    if (slug) {
      return slug;
    }
  }

  return undefined;
}

function resolveSuggestionTypesFromItems(
  items: ReturnType<typeof extractRecommendedItems>,
): string[] {
  const typeSet = new Set<string>();

  for (const item of items) {
    const candidates = [
      item.categoryName ?? '',
      item.categorySlug ?? '',
      ...item.categoryNames,
      ...item.categorySlugs,
    ];

    for (const candidate of candidates) {
      if (candidate.trim().length === 0) {
        continue;
      }

      const detected = detectRecommendationType(candidate);
      if (detected) {
        typeSet.add(detected);
      }
    }
  }

  return [...typeSet];
}

function buildRecommendationsDisambiguationAiContext(input: {
  reason: 'franchise_scope' | 'volume_scope' | null;
  franchise: string | null;
  suggestedTypes: string[];
  totalCandidates: number;
}): string {
  const franchise = input.franchise
    ? resolveRecommendationFranchiseQuery(input.franchise)
    : 'esta franquicia';
  const suggested = input.suggestedTypes.length > 0
    ? input.suggestedTypes.join(', ')
    : 'mangas, figuras, ropa/accesorios';

  if (input.reason === 'volume_scope') {
    return [
      `Hay varios resultados de ${franchise}.`,
      'Pedir al usuario si busca un tomo puntual, desde el inicio o ultimos lanzamientos.',
    ].join('\n');
  }

  return [
    `Hay ${input.totalCandidates} resultado(s) para ${franchise}.`,
    `Pedir que elija tipo de producto antes de recomendar (ej: ${suggested}).`,
  ].join('\n');
}

function resolveRecommendationsDisambiguationEnabled(
  value: string | boolean | undefined,
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function resolveRecommendationsThreshold(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function normalizeTerm(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s{2,}/g, ' ');
}

function containsTerm(normalizedValue: string, normalizedTerm: string): boolean {
  if (normalizedTerm.length === 0) {
    return false;
  }

  if (normalizedValue.includes(normalizedTerm)) {
    return true;
  }

  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(normalizedValue);
}
