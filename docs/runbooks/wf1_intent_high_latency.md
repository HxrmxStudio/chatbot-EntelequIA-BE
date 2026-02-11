# Wf1IntentHighLatency

## Trigger
- Alerta: `Wf1IntentHighLatency`
- Condicion: p95 `> 5s` para intents no `general`, sostenido `3m`.

## Impacto
- Respuestas lentas por intent especifico.
- Mayor abandono y peor UX en consultas transaccionales.

## Triage rapido (5-10 min)
1. Identificar intent afectado desde label `intent`.
2. Revisar latencia por etapa: DB, HTTP adapters, OpenAI.
3. Revisar tamano de contexto/prompt y truncacion aplicada.
4. Confirmar si hubo cambios en queries SQL o endpoints externos.

## Mitigacion
1. Reducir carga de contexto (historial/context blocks) temporalmente.
2. Aplicar timeout mas estricto a adapters lentos.
3. Si aplica, activar fallback de intent para priorizar tiempo de respuesta.
4. Escalar al owner del servicio externo si el cuello es upstream.

## Verificacion de cierre
1. `wf1_response_latency_seconds` p95 vuelve bajo el umbral.
2. Sin aumento de `fallback_ratio` post-mitigacion.
3. Smoke test exitoso para intent afectado.
