// We keep enough items to allow best-match selection (e.g. volume requests) even when the API is sorted by recency.
export const WF1_PRODUCTS_CONTEXT_MAX_ITEMS = 20;

// Summaries should stay short even if we keep a larger items list for matching.
export const WF1_PRODUCTS_CONTEXT_SUMMARY_MAX_ITEMS = 8;

// AI context can include a few more items than the summary, but should remain reasonably small.
export const WF1_PRODUCTS_CONTEXT_AI_MAX_ITEMS = 12;
