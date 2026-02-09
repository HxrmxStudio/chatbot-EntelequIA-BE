# Cursor Rules Playbook (chatbot-EntelequIA-BE)

Fecha de actualización: 2026-02-09

Este playbook resume cómo implementar y mantener Cursor Rules de forma efectiva para este backend, basado en documentación oficial de Cursor y aplicado a la estructura real del proyecto.

## 1) Principios de diseño de rules

1. Cada rule debe tener un objetivo único y explícito.
2. Mantener rules concisas (Cursor recomienda evitar rules largas y complejas; referencia de buenas prácticas: <= 500 líneas).
3. Separar reglas por dominios de decisión (contrato API, seguridad, persistencia, testing, arquitectura).
4. Incluir instrucciones verificables y accionables (evitar frases vagas).
5. Evitar contradicciones entre rules (una sola fuente de verdad por política crítica).
6. Evitar guías genéricas extensas dentro de una sola rule; dividir en módulos pequeños.
7. Evitar repetir la misma instrucción en múltiples rules.

## 2) Cuándo usar cada tipo de contexto

1. Rules: para políticas estables y recurrentes.
2. AGENTS.md: para instrucciones generales globales del repo cuando convenga una capa base simple.
3. Skills: para workflows dinámicos/procedurales y multi-step (no reemplazan rules estáticas).

## 3) Estrategia recomendada para este repo

1. Reglas globales (`alwaysApply: true`) solo para lo realmente no negociable:
   - `core.mdc`
2. Reglas por contexto de archivo (`globs` + `alwaysApply: false`) para reducir ruido:
   - arquitectura, contrato, seguridad, persistencia y testing.
3. Rules de operación ocasional (por ejemplo commits) mantenerlas no-globales.

## 3.1) Matriz actual de tipos de rule (aplicada)

1. `core.mdc`: baseline global (`alwaysApply: true`).
2. `architecture-and-dependencies.mdc`: auto-attach por globs arquitectónicos.
3. `wf1-api-contract.mdc`: auto-attach en controller/dto/use-cases/adapters WF1.
4. `security-and-secrets.mdc`: auto-attach en áreas de seguridad y bordes de entrada.
5. `persistence-and-idempotency.mdc`: auto-attach en repository/sql.
6. `testing-and-validation.mdc`: auto-attach en cambios de código WF1/tests/sql.
7. `clean-code-robert-martin.mdc`: agent-requested (sin globs).
8. `stack-best-practices.mdc`: agent-requested (sin globs).
9. `git-commits.mdc`: manual/commit context.

## 4) Buenas prácticas de contenido en .mdc

1. `description` claro y específico para mejorar activación por intención del agente.
2. `globs` precisos y acotados al área real.
3. Secciones cortas con:
   - Reglas obligatorias
   - Anti-patrones prohibidos
   - Checklists mínimos de validación
4. Preferir ejemplos concretos del propio stack/proyecto.
5. Revisar rules periódicamente para eliminar drift con el código real.

## 5) Higiene de contexto y seguridad

1. Mantener `.cursorignore` para excluir secretos y artefactos irrelevantes.
2. No asumir que `.cursorignore` reemplaza controles de seguridad del sistema:
   - Según docs oficiales, terminal/MCP tool calls pueden acceder a archivos fuera del contexto bloqueado por Cursor ignore.
3. Mantener `.env.example` como plantilla y nunca versionar secretos reales.

## 6) Operación y mejora continua

1. Cuando una instrucción se repite en chats, convertirla en rule.
2. Al detectar rule conflictiva:
   - identificar solapamiento
   - consolidar en una sola rule canónica
   - eliminar duplicados
3. Añadir revisión de rules en PR checklist técnico del equipo.
4. Revisar trimestralmente:
   - rules no usadas
   - rules redundantes
   - rules que contradicen implementación real del código

## 7) Checklist rápido para nuevas rules

1. ¿Tiene objetivo único?
2. ¿Tiene `description` útil?
3. ¿Tiene `globs` mínimos y correctos?
4. ¿Evita contradicciones con rules existentes?
5. ¿Incluye criterios verificables (tests, contratos, invariantes)?
6. ¿Está alineada con arquitectura y stack actual del repo?

## Referencias oficiales usadas

1. https://docs.cursor.com/context/rules
2. https://docs.cursor.com/en/context/rules
3. https://docs.cursor.com/en/context/ignore-files
4. https://docs.cursor.com/en/context
5. https://cursor.com/changelog/0-49
6. https://cursor.com/changelog/2-4
7. https://cursor.com/changelog/chat
8. https://cursor.com/blog/agent-best-practices
