import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import { ExternalServiceError } from '@/modules/wf1/domain/errors';
import {
  buildEmptyRecommendationsAiContext,
  buildRecommendationsAiContext,
  filterRecommendationsByType,
  WF1_RECOMMENDATIONS_CONTEXT_AI_MAX_ITEMS,
} from '@/modules/wf1/domain/recommendations-context';
import { isRecord } from '@/common/utils/object.utils';
import { containsTerm, normalizeTerm } from '@/common/utils/text.utils';
import {
  buildDynamicFranchiseAliases,
  getDefaultCategorySlug,
  getRecommendationFranchiseTerms,
  resolveRecommendationDisambiguation,
  resolveRecommendationEditorialMatch,
  resolveRecommendationFranchiseQuery,
  resolveRecommendationFranchiseKeywords,
  resolveRecommendationsPreferences,
} from '../query-resolvers';
import { detectRecommendationType } from '@/modules/wf1/domain/recommendations-context';
import { extractRecommendedItems, extractRecommendationsTotal } from '../recommendation-parsers';
import type { EntelequiaContextPort } from '../../../ports/entelequia-context.port';
import type { EnrichInput, EnrichDeps, RecommendationsConfig } from '../types';

const ENTELEQUIA_DEFAULT_WEB_BASE_URL = 'https://entelequia.com.ar';
const RECOMMENDATIONS_DYNAMIC_FRANCHISE_MIN_EVIDENCE = 2;

export async function enrichRecommendations(
  input: EnrichInput,
  deps: EnrichDeps,
  config: RecommendationsConfig,
): Promise<ContextBlock[]> {
  const { entelequiaContextPort, promptTemplates } = deps;
  const { intentResult } = input;

  const preferences = resolveRecommendationsPreferences({
    text: input.text,
    entities: intentResult.entities,
  });
  const recommendationsTemplates = {
    header: promptTemplates.getRecommendationsContextHeader(),
    whyThese: promptTemplates.getRecommendationsContextWhyThese(),
    instructions: promptTemplates.getRecommendationsContextInstructions(),
    emptyMessage: promptTemplates.getRecommendationsEmptyContextMessage(),
  };

  try {
    const requestedFranchises = resolveRecommendationFranchiseKeywords({
      text: input.text,
      entities: intentResult.entities,
    });
    const hasExplicitFranchiseRequest = requestedFranchises.length > 0;
    const preferredCategorySlug = resolvePreferredRecommendationCategorySlug(preferences.type);

    let contextSource: ContextBlock;
    let recommendationsSource: 'featured' | 'search' = 'featured';
    let recommendedItems: ReturnType<typeof extractRecommendedItems>;
    let totalRecommendations = 0;
    let dynamicFranchiseAliases: Record<string, readonly string[]> = {};
    let selectedFranchise = requestedFranchises[0] ?? null;
    let editorialMatch = {
      matchedBrands: [] as string[],
      matchedAuthors: [] as string[],
      suggestedBrands: [] as string[],
      confidence: 0,
    };

    if (selectedFranchise) {
      const searchContext = await entelequiaContextPort.getProducts({
        query: resolveRecommendationFranchiseQuery(selectedFranchise),
        ...(preferredCategorySlug ? { categorySlug: preferredCategorySlug } : {}),
        currency: input.currency,
      });
      recommendationsSource = 'search';

      if (isProductsPayloadValidForRecommendations(searchContext.contextPayload)) {
        contextSource = searchContext;
        recommendedItems = mapProductsContextToRecommendationItems(searchContext.contextPayload);
        totalRecommendations = resolveProductsRecommendationsTotal(
          searchContext.contextPayload,
          recommendedItems.length,
        );
      } else {
        contextSource = await entelequiaContextPort.getRecommendations({
          currency: input.currency,
        });
        recommendationsSource = 'featured';

        if (!isRecommendationsPayloadValid(contextSource.contextPayload)) {
          const catalogUnavailableContext = buildCatalogUnavailableRecommendationsContext({
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
      contextSource = await entelequiaContextPort.getRecommendations({
        currency: input.currency,
      });

      if (!isRecommendationsPayloadValid(contextSource.contextPayload)) {
        const catalogUnavailableContext = buildCatalogUnavailableRecommendationsContext({
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
        const searchContext = await entelequiaContextPort.getProducts({
          query: resolveRecommendationFranchiseQuery(selectedFranchise),
          ...(preferredCategorySlug ? { categorySlug: preferredCategorySlug } : {}),
          currency: input.currency,
        });

        if (isProductsPayloadValidForRecommendations(searchContext.contextPayload)) {
          contextSource = searchContext;
          recommendationsSource = 'search';
          recommendedItems = mapProductsContextToRecommendationItems(searchContext.contextPayload);
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
      hasExplicitFranchiseRequest || hasMatchedFranchise ? franchiseFiltered : stockFiltered;
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
      const taxonomyContext = await fetchCatalogTaxonomyContext(
        entelequiaContextPort,
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

    const disambiguation = config.disambiguationEnabled
      ? resolveRecommendationDisambiguation({
          text: input.text,
          franchise: matchedFranchises[0] ?? null,
          suggestedTypes,
          totalCandidates: baseForTypeFilter.length,
          preferredTypes: preferences.type,
          franchiseThreshold: config.franchiseThreshold,
          volumeThreshold: config.volumeThreshold,
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
          contextPayload: buildRecommendationsContextPayload(
            contextSource.contextPayload,
            {
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
          ),
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
          contextPayload: buildRecommendationsContextPayload(
            contextSource.contextPayload,
            {
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
          ),
        },
      ];
    }

    const aiContext = buildRecommendationsAiContext({
      items: finalFiltered,
      total: totalRecommendations,
      preferences,
      templates: recommendationsTemplates,
    });
    const shownProducts = finalFiltered.slice(0, WF1_RECOMMENDATIONS_CONTEXT_AI_MAX_ITEMS);

    return [
      {
        contextType: 'recommendations',
        contextPayload: buildRecommendationsContextPayload(
          contextSource.contextPayload,
          {
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
        ),
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
          contextPayload: buildRecommendationsContextPayload(undefined, {
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
          }),
        },
      ];
    }

    throw error;
  }
}

function buildRecommendationsContextPayload(
  base: Record<string, unknown> | undefined,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(base ?? {}), ...overrides };
}

function isRecommendationsPayloadValid(
  payload: Record<string, unknown> | unknown[],
): boolean {
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

    return terms.some(
      (term) =>
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
      const categoryName = typeof entry.categoryName === 'string' ? entry.categoryName : undefined;
      const categorySlug = typeof entry.categorySlug === 'string' ? entry.categorySlug : undefined;
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
              currency: typeof entry.price.currency === 'string' ? entry.price.currency : 'ARS',
              amount: typeof entry.price.amount === 'number' ? entry.price.amount : 0,
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

function readCatalogEntries(
  value: unknown,
): Array<{ id: string | number; name: string; slug: string }> {
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
  const typesLine =
    input.suggestedTypes.length > 0
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
  const suggested =
    input.suggestedTypes.length > 0
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
