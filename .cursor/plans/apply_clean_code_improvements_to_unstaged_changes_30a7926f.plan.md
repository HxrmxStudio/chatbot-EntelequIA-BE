---
name: Apply Clean Code improvements to unstaged changes
overview: Revisar y aplicar mejoras de Clean Code a los cambios no staged aplicados por otra IA, siguiendo nuestros principios establecidos (DRY, Single Responsibility, documentación, organización).
todos:
  - id: restore-json-helpers-docs
    content: Restaurar comentarios JSDoc en json-helpers.ts
    status: pending
  - id: extract-category-helper
    content: Extraer función extractCategoryInfo a product-helpers.ts
    status: pending
  - id: refactor-payload-normalizers
    content: Refactorizar payload-normalizers.ts para usar extractCategoryInfo
    status: pending
  - id: verify-format-docs
    content: Verificar y mejorar documentación en format.ts
    status: pending
  - id: verify-imports
    content: Verificar que todos los imports usen path aliases @/ correctamente
    status: pending
  - id: verify-build
    content: Ejecutar npm run build y verificar que no hay errores
    status: completed
  - id: add-web-url-helpers
    content: Agregar funciones productWebUrl y storageImageUrl a endpoints.ts
    status: pending
  - id: refactor-payload-normalizers-urls
    content: Refactorizar payload-normalizers.ts para usar productWebUrl de endpoints.ts
    status: pending
  - id: refactor-product-helpers-urls
    content: Refactorizar product-helpers.ts para usar storageImageUrl de endpoints.ts
    status: pending
  - id: create-products-context-template
    content: Crear archivo de template para productos AI context en prompts/
    status: pending
  - id: refactor-format-ts-prompts
    content: Refactorizar format.ts para cargar template desde archivo prompts/
    status: pending
  - id: review-hint-hardcoded
    content: Revisar y mover hint hardcodeado en enrich-context-by-intent.use-case.ts a prompts/
    status: pending
isProject: false
---

# Aplicar Clean Code a cambios no staged

## Análisis de cambios

### Cambios identificados:

1. `**json-helpers.ts**`: Se eliminaron comentarios JSDoc - **PROBLEMA**: Va contra Clean Code
2. `**payload-normalizers.ts**`: Extracción de categorías inline - **MEJORA**: Extraer a función helper
3. `**payload-normalizers.ts**`: URLs del web frontend hardcodeadas (líneas 59, 98) - **MEJORA**: Mover a endpoints.ts
4. `**product-helpers.ts**`: URL de storage hardcodeada (línea 62) - **MEJORA**: Mover a endpoints.ts
5. `**format.ts**`: Nuevo archivo para AI context - **REVISAR**: Verificar estructura y documentación
6. `**format.ts**`: Instrucciones y prompts hardcodeados (líneas 31-51) - **MEJORA**: Externalizar a prompts/
7. `**enrich-context-by-intent.use-case.ts**`: Hint hardcodeado (línea 158) - **MEJORA**: Externalizar a prompts/
8. `**constants.ts**`: Nuevas constantes bien documentadas - **OK**
9. `**types.ts**`: Nuevos campos opcionales - **OK**
10. `**match.ts**`: Mejoras en lógica de matching - **OK**
11. `**summary.ts**`: Uso de `priceWithDiscount` - **OK**

## Plan de mejoras

### 1. Restaurar documentación JSDoc en `json-helpers.ts`

**Archivo:** `src/modules/wf1/infrastructure/repositories/shared/json-helpers.ts`

**Problema:** Se eliminaron los comentarios JSDoc que explican el propósito de la función.

**Solución:** Restaurar la documentación completa siguiendo nuestro estándar.

### 2. Extraer helper para extracción de categorías en `payload-normalizers.ts`

**Archivo:** `src/modules/wf1/infrastructure/adapters/entelequia-http/payload-normalizers.ts`

**Problema:** La lógica de extracción de categorías está inline (líneas 41-47), violando Single Responsibility.

**Solución:** Crear función helper `extractCategoryInfo` en `product-helpers.ts` para reutilización y claridad.

### 3. Verificar y mejorar documentación en `format.ts`

**Archivo:** `src/modules/wf1/domain/products-context/format.ts`

**Revisar:**

- Comentarios JSDoc en funciones públicas
- Consistencia con otros archivos del dominio
- Nombres de funciones y variables claros

### 4. Centralizar URLs del web frontend en `endpoints.ts`

**Archivo:** `src/modules/wf1/infrastructure/adapters/entelequia-http/endpoints.ts`

**Problema:** URLs del frontend/web hardcodeadas en `payload-normalizers.ts` y `product-helpers.ts`:

- `${webBaseUrl}/producto/${encodeURIComponent(slug)}` (líneas 59, 98 en payload-normalizers.ts)
- `${webBaseUrl}/storage/${path}` (línea 62 en product-helpers.ts)

**Solución:** Agregar funciones helper en `endpoints.ts`:

- `productWebUrl(webBaseUrl: string, slug: string): string`
- `storageImageUrl(webBaseUrl: string, path: string): string`

### 5. Externalizar prompts/instrucciones a `prompts/`

**Archivos afectados:**

`**format.ts` (líneas 31-51):

- Header: "PRODUCTOS ENTELEQUIA"
- Sección "Informacion adicional:" con locales, retiro, envíos
- Sección "Instrucciones para tu respuesta:" con reglas específicas

**Solución:** Crear `prompts/entelequia_products_context_template_v1.txt` con template que incluya:

- Header estático
- Información adicional estática
- Instrucciones estáticas
- Placeholders para datos dinámicos (productos, counts, query)

`**enrich-context-by-intent.use-case.ts` (línea 158):

- `hint: 'Responder con claridad y pedir precision cuando falten datos.'`

**Solución:** Crear `prompts/entelequia_general_context_hint_v1.txt` o incluir en template general.

### 6. Verificar imports y path aliases

**Verificar:** Que todos los imports usen path aliases `@/` donde corresponda según nuestro estándar.

## Archivos a modificar

1. `src/modules/wf1/infrastructure/repositories/shared/json-helpers.ts` - Restaurar JSDoc
2. `src/modules/wf1/infrastructure/adapters/entelequia-http/product-helpers.ts` - Agregar `extractCategoryInfo` y usar `storageImageUrl`
3. `src/modules/wf1/infrastructure/adapters/entelequia-http/payload-normalizers.ts` - Usar `extractCategoryInfo` y `productWebUrl`
4. `src/modules/wf1/infrastructure/adapters/entelequia-http/endpoints.ts` - Agregar funciones `productWebUrl` y `storageImageUrl`
5. `src/modules/wf1/domain/products-context/format.ts` - Verificar/mejorar documentación y cargar template desde prompts/
6. `prompts/entelequia_products_context_template_v1.txt` (nuevo) - Template para productos AI context
7. `prompts/entelequia_general_context_hint_v1.txt` (nuevo) - Hint para contexto general
8. `src/modules/wf1/application/use-cases/enrich-context-by-intent/enrich-context-by-intent.use-case.ts` - Cargar hint desde prompts/

## Verificación

- Ejecutar `npm run build` para verificar que no hay errores
- Verificar que la documentación sea consistente
- Asegurar que el código siga principios DRY y Single Responsibility
- Verificar que todas las URLs estén centralizadas en endpoints.ts
- Verificar que todos los prompts/instrucciones estén en prompts/
