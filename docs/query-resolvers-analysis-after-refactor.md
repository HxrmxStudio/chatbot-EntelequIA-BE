# Análisis query-resolvers tras refactor (Clean Code y DRY)

**Fecha**: 2025-02-10  
**Alcance**: `src/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers/`

## Cambios aplicados

1. **Código no utilizado eliminado**  
   - Eliminada la función antigua que devolvía solo `string`. La función que devuelve `ResolvedProductsQuery` se mantuvo y se nombró `resolveProductsQuery`.  
   - Mantenidos: `resolveProductsQuery`, `detectProductCategory`, `ResolvedProductsQuery`, `DetectedProductCategory`.

2. **Estructura en carpeta (folder per concept)**  
   - `types.ts` — `DetectedProductCategory`, `ResolvedProductsQuery`.  
   - `patterns.ts` — constantes regex, `GENERIC_PRODUCTS_TOKENS`, `ORDER_ID_DIGIT_MIN/MAX`, `ORDER_ID_*_PATTERN`.  
   - `normalize.ts` — `normalizeForToken`.  
   - `clean-entities.ts` — `stripVolumeHints`, `stripProductModifiers`, `isGenericProductsToken`, `pickMostSpecificEntity`, `cleanProductsEntities`.  
   - `detect-category.ts` — `detectProductCategory`.  
   - `resolve-products.ts` — `resolveProductsQuery`.  
   - `resolve-order.ts` — `resolveOrderId`.  
   - `index.ts` — API pública (tipos + detectProductCategory, resolveProductsQuery, resolveOrderId).

3. **JSDoc**  
   - Añadido en tipos (`types.ts`), `detectProductCategory`, `resolveProductsQuery`, `resolveOrderId` y en helpers exportados de `clean-entities` y `normalize`.

4. **Constantes y magic numbers**  
   - Rangos 6–12 dígitos para order ID: `ORDER_ID_DIGIT_MIN`, `ORDER_ID_DIGIT_MAX` en `patterns.ts`.  
   - `ORDER_ID_PREFIX_PATTERN` y `ORDER_ID_PURE_PATTERN` construidos con esas constantes.  
   - Resto de regex y el `Set` de tokens genéricos centralizados en `patterns.ts`.

5. **Validación de tipos en resolveOrderId**  
   - Se mantiene `typeof candidate !== 'string'` (defensa ante entradas mixtas).  
   - Candidatos construidos de forma explícita: `[...entities, originalText]`.

6. **Tests**  
   - Eliminados los tests de `resolveProductsQuery`.  
   - Añadidos casos en `resolveProductsQuery` que cubren el mismo comportamiento (productName, fallbacks, limpieza).  
   - Conservados: `detectProductCategory`, `resolveProductsQuery`, `resolveOrderId`.

7. **Documentación**  
   - Actualizados `docs/BEST_PRACTICES.md` y `.cursor/rules/refactored-architecture.mdc` con la nueva estructura de `query-resolvers/`.

## Estado frente al plan original

| Punto del plan                         | Estado |
|----------------------------------------|--------|
| Eliminar / decidir uso de V2           | ✅ Una sola función: `resolveProductsQuery` (retorna `ResolvedProductsQuery`) |
| JSDoc en funciones públicas/helpers    | ✅ Hecho |
| Patrones regex en archivo separado     | ✅ `patterns.ts` |
| Duplicación resolveProductsQuery / V2  | ✅ N/A (una sola función) |
| Magic numbers (6–12 dígitos)           | ✅ `ORDER_ID_DIGIT_MIN/MAX` |
| Validación de tipos resolveOrderId     | ✅ Explícita y coherente |
| Separación en módulos                  | ✅ Carpeta `query-resolvers/` con 8 archivos |
| Actualizar docs y reglas               | ✅ BEST_PRACTICES, refactored-architecture |
| Tests alineados con API actual         | ✅ Sin tests de código eliminado |

## Métricas post-refactor

- **Archivos**: 8 en `query-resolvers/` (antes 1 archivo monolítico de ~267 líneas).  
- **Responsabilidades**: una por archivo (tipos, patrones, normalización, limpieza de entidades, categoría, productos, pedidos, API).  
- **API pública**: 3 funciones + 2 tipos exportados desde `index.ts`.  
- **Build y tests**: ✅ `npm run build` y tests de query-resolvers y enrich-context pasando.

## Posibles mejoras futuras (prioridad baja)

- Revisar si `clean-entities.ts` debe exportar menos (solo lo que usen `resolve-products` y tests).  
- Considerar tests unitarios de `cleanProductsEntities` / `stripVolumeHints` si se quiere cobertura más granular.
