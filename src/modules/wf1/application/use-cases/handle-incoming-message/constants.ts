/** Policy version for store-info context; used in turn metadata when storeInfoSubtype is set. */
export const STORE_INFO_POLICY_VERSION = 'v2-exact-weekly-hours';

/** Response policy version written to persist and audit metadata. */
export const RESPONSE_POLICY_VERSION = 'v2-banded-stock';

/** LLM path value when no structured path is available (fallback). */
export const LLM_PATH_FALLBACK_DEFAULT = 'fallback_default';

/** Low-stock threshold exposed in turn metadata for analytics. */
export const LOW_STOCK_THRESHOLD = 3;
