---
name: Aplicar Clean Code y DRY a query-resolvers
overview: Analizar y mejorar query-resolvers.ts aplicando principios de Clean Code, DRY y mejores prácticas de NestJS, incluyendo organización de constantes, documentación JSDoc, y posible separación en módulos más pequeños.
todos:
  - id: add-jsdoc
    content: Agregar JSDoc completo a todas las funciones públicas y helpers importantes
    status: completed
  - id: decide-v2-usage
    content: Decidir si resolveProductsQueryV2 se usa, se elimina, o se marca como experimental
    status: completed
  - id: extract-patterns
    content: Extraer todas las constantes de patrones regex a archivo patterns.ts
    status: completed
  - id: eliminate-duplication
    content: Hacer que resolveProductsQuery use resolveProductsQueryV2 internamente para eliminar duplicación
    status: cancelled
  - id: extract-magic-numbers
    content: Extraer magic numbers (6-12 dígitos) a constantes con nombres descriptivos
    status: completed
  - id: improve-type-validation
    content: Mejorar validación de tipos en resolveOrderId
    status: completed
  - id: update-documentation
    content: Actualizar BEST_PRACTICES.md y refactored-architecture.mdc si se separa en módulos
    status: completed
isProject: false
---

# Aplicar Clean Code y DRY a query-resolvers

## Análisis de cambios

Los cambios introducen:

1. Nueva función `resolveProductsQueryV2` que retorna metadata completa
2. Nueva función `detectProductCategory` para detectar categorías
3. Nuevo tipo `DetectedProductCategory` e interface `ResolvedProductsQuery`
4. Refactorización de funciones helper extraídas
5. Muchas constantes de patrones regex (8 patrones + 1 Set grande)
6. Mejoras en `resolveOrderId` (validación de tipos, rango de dígitos)

## Problemas identificados

### 1. Función no utilizada (Dead Code)

**Problema**: `resolveProductsQueryV2` no se está usando en el código. Solo `resolveProductsQuery` se usa en `enrich-context-by-intent.use-case.ts`.

**Solución**:

- Si `resolveProductsQueryV2` es para uso futuro, documentar como `@deprecated` o `@experimental`
- Si debe reemplazar a `resolveProductsQuery`, migrar el use case
- Si no se necesita, eliminarla

### 2. Archivo muy grande (267 líneas)

**Problema**: El archivo tiene múltiples responsabilidades:

- Resolver queries de productos
- Detectar categorías
- Resolver order IDs
- Limpiar entidades
- Normalizar tokens
- Definir patrones regex

**Solución**: Separar en módulos siguiendo "folder per concept":

- `query-resolvers/` carpeta con:
  - `resolve-products.ts` - resolveProductsQuery, resolveProductsQueryV2
  - `resolve-order.ts` - resolveOrderId
  - `detect-category.ts` - detectProductCategory
  - `clean-entities.ts` - cleanProductsEntities, stripProductModifiers, etc.
  - `patterns.ts` - todas las constantes de patrones regex
  - `types.ts` - DetectedProductCategory, ResolvedProductsQuery
  - `index.ts` - public API

### 3. Falta de JSDoc

**Problema**: Funciones nuevas sin documentación:

- `detectProductCategory`
- `resolveProductsQueryV2`
- Funciones helper internas

**Solución**: Agregar JSDoc completo siguiendo el patrón del proyecto.

### 4. Constantes al final del archivo

**Problema**: 8 patrones regex y 1 Set grande están al final, dificultando lectura.

**Solución**: Mover a `patterns.ts` o `constants.ts` dentro de la carpeta `query-resolvers/`.

### 5. Duplicación de lógica

**Problema**: `resolveProductsQuery` y `resolveProductsQueryV2` comparten lógica similar.

**Solución**: `resolveProductsQuery` podría usar `resolveProductsQueryV2` internamente:

```typescript
export function resolveProductsQuery(entities: string[], originalText: string): string {
  return resolveProductsQueryV2(entities, originalText).productName;
}
```

### 6. Magic number en regex

**Problema**: `\d{6,12}` aparece duplicado en `resolveOrderId`.

**Solución**: Extraer a constante `ORDER_ID_DIGIT_RANGE`.

### 7. Validación de tipos mejorable

**Problema**: En `resolveOrderId`, se valida `typeof candidate !== 'string'` pero `entities` ya debería ser `string[]`.

**Solución**: Mejorar tipos o agregar type guards más explícitos.

### 8. Normalización duplicada

**Problema**: `normalizeForToken` se usa en múltiples lugares, pero también hay normalización inline en algunos patrones.

**Solución**: Asegurar que todos los lugares usen `normalizeForToken` consistentemente.

## Mejoras propuestas

### Prioridad Alta

1. **Agregar JSDoc**: Documentar todas las funciones públicas y helpers importantes
2. **Eliminar o usar resolveProductsQueryV2**: Decidir si se usa o se elimina
3. **Extraer constantes**: Mover patrones regex a archivo separado `patterns.ts`
4. **Eliminar duplicación**: Hacer que `resolveProductsQuery` use `resolveProductsQueryV2` internamente

### Prioridad Media

1. **Separar en módulos**: Crear estructura `query-resolvers/` con archivos separados
2. **Extraer magic numbers**: Crear constantes para rangos numéricos
3. **Mejorar validación**: Type guards más explícitos

### Prioridad Baja

1. **Revisar tests**: Asegurar cobertura completa de nuevas funciones
2. **Documentar decisiones**: Explicar por qué `resolveProductsQueryV2` existe si no se usa

## Archivos a modificar

1. `src/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers.ts` - Refactorizar o separar
2. `src/modules/wf1/application/use-cases/enrich-context-by-intent/enrich-context-by-intent.use-case.ts` - Posible migración a V2
3. `test/unit/wf1/application/query-resolvers.spec.ts` - Verificar cobertura
4. `docs/BEST_PRACTICES.md` - Documentar patrón si se separa en módulos
5. `.cursor/rules/refactored-architecture.mdc` - Actualizar estructura si se separa

## Consideraciones

- **Backward compatibility**: Si `resolveProductsQueryV2` reemplaza a `resolveProductsQuery`, mantener ambas durante transición
- **Tests**: Asegurar que todos los tests pasen después de refactorización
- **Performance**: Verificar que la separación en módulos no afecte performance

## Estructura propuesta (si se separa)

```
query-resolvers/
  types.ts          # DetectedProductCategory, ResolvedProductsQuery
  patterns.ts       # Todos los patrones regex y Sets
  normalize.ts      # normalizeForToken
  clean-entities.ts # cleanProductsEntities, stripProductModifiers, isGenericProductsToken
  resolve-products.ts # resolveProductsQuery, resolveProductsQueryV2
  detect-category.ts # detectProductCategory
  resolve-order.ts  # resolveOrderId
  index.ts          # Public API
```
