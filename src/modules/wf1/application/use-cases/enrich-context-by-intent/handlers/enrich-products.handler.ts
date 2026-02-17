import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import { ExternalServiceError } from '@/modules/wf1/domain/errors';
import {
  buildProductsAiContext,
  buildProductAvailabilityHint,
  selectBestProductMatch,
} from '@/modules/wf1/domain/products-context';
import { resolveProductsQuery, resolveStockDisclosure } from '../query-resolvers';
import { extractProductItems } from '../product-parsers';
import type { EnrichInput, EnrichDeps } from '../types';

const WF1_LOW_STOCK_THRESHOLD = 3;

export async function enrichProducts(
  input: EnrichInput,
  deps: EnrichDeps,
): Promise<ContextBlock[]> {
  const { entelequiaContextPort, promptTemplates } = deps;
  const { intentResult } = input;

  const discloseExactStock = resolveStockDisclosure({
    text: input.text,
    entities: intentResult.entities,
  });
  const resolvedQuery = resolveProductsQuery(intentResult.entities, input.text);

  if (resolvedQuery.hasMultipleQueries && resolvedQuery.productNames.length > 1) {
    const searchResults = await Promise.allSettled(
      resolvedQuery.productNames.map((query) =>
        entelequiaContextPort.getProducts({
          query,
          ...(resolvedQuery.categorySlug ? { categorySlug: resolvedQuery.categorySlug } : {}),
          currency: input.currency,
        }),
      ),
    );

    const allItems = searchResults.flatMap((r) =>
      r.status === 'fulfilled' ? extractProductItems(r.value.contextPayload) : [],
    );
    const allTotal = searchResults.reduce(
      (sum, r) =>
        r.status === 'fulfilled'
          ? sum +
            (typeof r.value.contextPayload.total === 'number'
              ? r.value.contextPayload.total
              : extractProductItems(r.value.contextPayload).length)
          : sum,
      0,
    );

    const queriesWithoutResults = resolvedQuery.productNames.filter((_, i) => {
      const r = searchResults[i];
      if (r.status !== 'fulfilled') return true;
      return extractProductItems(r.value.contextPayload).length === 0;
    });

    if (allItems.length === 0) {
      return [];
    }

    const aiContext = buildProductsAiContext({
      items: allItems,
      total: allTotal,
      query: resolvedQuery.productNames.join(', '),
      queriesWithoutResults,
      discloseExactStock,
      lowStockThreshold: WF1_LOW_STOCK_THRESHOLD,
      templates: {
        header: promptTemplates.getProductsContextHeader(),
        additionalInfo: promptTemplates.getProductsContextAdditionalInfo(),
        instructions: promptTemplates.getProductsContextInstructions(),
      },
    });

    const productsWithAi: ContextBlock = {
      contextType: 'products',
      contextPayload: {
        items: allItems,
        total: allTotal,
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

    return [productsWithAi];
  }

  const query = resolvedQuery.productNames[0];
  const products = await entelequiaContextPort.getProducts({
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
      header: promptTemplates.getProductsContextHeader(),
      additionalInfo: promptTemplates.getProductsContextAdditionalInfo(),
      instructions: promptTemplates.getProductsContextInstructions(),
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
    const detail = await entelequiaContextPort.getProductDetail({
      idOrSlug: bestMatch.slug,
      currency: input.currency,
    });

    return [productsWithBest, detail];
  } catch (error: unknown) {
    if (error instanceof ExternalServiceError) {
      return [productsWithBest];
    }

    throw error;
  }
}
