---
name: Clean Code DRY analysis orders payment shipping
overview: Analyze uncommitted changes (orders-context, payment-shipping-context, parsers, prompt templates) for Clean Code, DRY, and best practices; extract duplicated error handling pattern; update documentation; run build and tests.
todos: []
isProject: false
---

# Clean Code, DRY and best practices analysis for uncommitted changes

## Scope (uncommitted changes)

- **New domain modules**: `orders-context/` and `payment-shipping-context/` with types, constants, format functions
- **New parsers**: `order-parsers.ts` and `payment-info-parsers.ts` for extracting data from API payloads
- **New query resolver**: `resolve-payment-shipping-query-type.ts` for payment/shipping query subtype detection
- **Enhanced use case**: `enrich-context-by-intent.use-case.ts` with orders and payment_shipping handling
- **Prompt templates**: Many new prompt files and adapter updates
- **Context block render**: Enhanced to handle new context types
- **Tests**: New unit tests for parsers, domain modules, and query resolver

---

## Analysis Results

### ✅ Good Practices Already Applied

1. **Domain separation**: Orders and payment-shipping contexts properly separated into domain modules
2. **Parser extraction**: Data extraction logic separated into dedicated parser modules
3. **Query resolvers**: Payment/shipping query type resolution extracted to dedicated module
4. **Prompt externalization**: All prompts externalized to files with versioning
5. **Constants**: Properly named constants in domain modules
6. **Type safety**: Strong typing throughout with proper interfaces
7. **Tests**: Comprehensive unit tests added

### 🔧 DRY Issue Found

**Duplicated error handling pattern** in `enrich-context-by-intent.use-case.ts`:

The pattern of checking `isUnauthenticatedOrdersPayload` and throwing `ExternalServiceError` is duplicated in two places:

- Lines 140-147: After `getOrderDetail`
- Lines 171-178: After `getOrders`

Both use identical error construction:

```typescript
if (isUnauthenticatedOrdersPayload(...)) {
  throw new ExternalServiceError(
    'Entelequia unauthorized response',
    401,
    'http',
    ...contextPayload,
  );
}
```

**Solution**: Extract to a helper function in `order-parsers.ts`:

- Add `throwIfUnauthenticatedOrdersPayload(payload: Record<string, unknown>): void`
- This function checks and throws if payload indicates unauthenticated state
- Use it in both places in the use case

---

## Implementation Plan

### 1. Extract Duplicated Error Handling (DRY)

**File**: `src/modules/wf1/application/use-cases/enrich-context-by-intent/order-parsers.ts`

- Add helper function:
  ```typescript
  export function throwIfUnauthenticatedOrdersPayload(payload: Record<string, unknown>): void {
    if (isUnauthenticatedOrdersPayload(payload)) {
      throw new ExternalServiceError("Entelequia unauthorized response", 401, "http", payload);
    }
  }
  ```
- Import `ExternalServiceError` from domain/errors
- Export the function

**File**: `src/modules/wf1/application/use-cases/enrich-context-by-intent/enrich-context-by-intent.use-case.ts`

- Import `throwIfUnauthenticatedOrdersPayload` from `./order-parsers`
- Replace the two duplicated blocks (lines 140-147 and 171-178) with calls to the helper:
  - `throwIfUnauthenticatedOrdersPayload(orderDetail.contextPayload);`
  - `throwIfUnauthenticatedOrdersPayload(orders.contextPayload);`
- Remove the now-unused `isUnauthenticatedOrdersPayload` import (or keep it if used elsewhere)

### 2. Update Documentation

**File**: `.cursor/rules/refactored-architecture.mdc`

- Update line 33 to include new parsers and query resolver:
  - Change: `enrich-context-by-intent/  # enrich-context-by-intent.use-case.ts, query-resolvers/ (types, patterns, normalize, clean-entities, detect-category, resolve-products, resolve-order, category-slugs, index); ResolvedProductsQuery includes categorySlug for Entelequia filtering; product-parsers.ts, index.ts`
  - To: `enrich-context-by-intent/  # enrich-context-by-intent.use-case.ts, query-resolvers/ (types, patterns, normalize, clean-entities, detect-category, resolve-products, resolve-order, resolve-payment-shipping-query-type, category-slugs, index); ResolvedProductsQuery includes categorySlug for Entelequia filtering; product-parsers.ts, order-parsers.ts, payment-info-parsers.ts, index.ts`
- Add domain modules to domain section:
  - Add `orders-context/` and `payment-shipping-context/` to the domain list

**File**: `docs/BEST_PRACTICES.md`

- Update section 9.2 example list to include new parsers:
  - Change: `enrich-context-by-intent/` — `enrich-context-by-intent.use-case.ts`, `query-resolvers/` (types, patterns, normalize, clean-entities, detect-category, resolve-products, resolve-order, category-slugs, index), `product-parsers.ts`, `index.ts`
  - To: `enrich-context-by-intent/` — `enrich-context-by-intent.use-case.ts`, `query-resolvers/` (types, patterns, normalize, clean-entities, detect-category, resolve-products, resolve-order, resolve-payment-shipping-query-type, category-slugs, index), `product-parsers.ts`, `order-parsers.ts`, `payment-info-parsers.ts`, `index.ts`
- Optionally add a note about parser modules: When extracting data from API payloads, use dedicated parser modules (e.g., `order-parsers.ts`, `payment-info-parsers.ts`) that provide pure functions for data extraction and validation.

### 3. Build and Tests

- Run `npm run build` to verify TypeScript compilation
- Run `npm test` to ensure all tests pass
- Update tests if needed (the new helper function should be covered by existing tests since it's just extracting duplicated logic)

---

## Order of Work

1. Extract duplicated error handling to `throwIfUnauthenticatedOrdersPayload` helper in `order-parsers.ts`
2. Update use case to use the new helper function
3. Update `.cursor/rules/refactored-architecture.mdc` with new parsers, query resolver, and domain modules
4. Update `docs/BEST_PRACTICES.md` with new parsers in example list
5. Run `npm run build`
6. Run `npm test`
7. Fix any issues if they arise

---

## Notes

- The code changes follow Clean Code principles well overall
- Domain modules are properly separated
- Parsers are well-extracted
- The only DRY issue is the duplicated error handling pattern, which is straightforward to fix
- Documentation updates are needed to reflect the new structure
