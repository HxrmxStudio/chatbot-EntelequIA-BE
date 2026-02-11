# Wf1HighExactStockRequests

## Trigger
- Alerta: `Wf1HighExactStockRequests`
- Condicion: incremento `> 10` en `1h`, sostenido `10m`.

## Impacto
- Mayor demanda de stock exacto; puede indicar friccion en copy de disponibilidad.
- Riesgo de sobreexponer cantidad exacta sin valor UX.

## Triage rapido (15 min)
1. Revisar muestras recientes de conversaciones `products`.
2. Confirmar si los prompts vigentes siguen la politica de bandas.
3. Revisar si hubo cambio de catalogo con bajo inventario general.
4. Verificar que el detector de "pedido explicito" no este sobredetectando.

## Mitigacion
1. Ajustar copy para enfatizar "hay stock / pocas unidades / sin stock".
2. Endurecer patrones de disclosure exacto si hay falsos positivos.
3. Alinear prompt de sistema + products instructions y redeploy controlado.

## Verificacion de cierre
1. Caida sostenida de `wf1_stock_exact_disclosure_total` a rango esperado.
2. Sin caida de conversion o aumento de re-preguntas en `products`.
3. QA manual de 10 casos representativos posterior al ajuste.
