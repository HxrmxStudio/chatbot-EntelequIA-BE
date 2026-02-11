# Wf1HighFallbackRate

## Trigger
- Alerta: `Wf1HighFallbackRate`
- Condicion: fallback ratio `> 15%` durante `5m` con trafico `> 5 msg/5m`.

## Impacto
- El asistente cae en respuestas de fallback mas de lo esperado.
- Baja calidad percibida y menor resolucion en primer intento.

## Triage rapido (5-10 min)
1. Verificar estado de OpenAI y errores HTTP (`429`, `5xx`, timeouts).
2. Revisar ratio por `intent` y `llm_path` en logs/metrics.
3. Confirmar cambios recientes en prompts, adapters o despliegues.
4. Revisar latencia DB y errores en adapters externos (products/orders/payment-info).

## Mitigacion
1. Si hay degradacion externa (OpenAI/API terceros), mantener fallback activo y escalar incidente.
2. Si el problema es por prompt/context truncado, rollback de prompt version.
3. Si hay error de parser/schema, activar camino legacy por feature flag.

## Verificacion de cierre
1. `wf1_fallback_total / wf1_messages_total` vuelve a rango normal.
2. Sin errores nuevos en logs estructurados (`fallback_reason` estable).
3. Confirmar respuestas utiles en pruebas de humo por `products`, `orders`, `general`.
