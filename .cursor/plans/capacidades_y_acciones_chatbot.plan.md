---
name: Capacidades y acciones del chatbot
overview: Crear un documento centrado en el usuario que liste todas las capacidades del bot y todas las acciones que un humano puede realizar al interactuar con él, para dar contexto a una IA que lo entrene actuando como usuario y reporte falencias.
todos: []
isProject: false
---

# Plan: Documento de capacidades y acciones del chatbot (perspectiva usuario)

## Objetivo del documento

Un único documento **centrado en el usuario** (sin endpoints ni detalles técnicos de API) que describa:

- **Todas las capacidades del bot**: qué puede hacer el chatbot por el usuario (consultar productos, pedidos, recomendaciones, etc.)
- **Todas las acciones que el usuario puede tomar**: qué puede decir o hacer en cada situación (preguntar, responder SI/NO, dar datos, valorar una respuesta, etc.)

La IA que entrene al bot **actuará como un humano** que quiere usar todas las herramientas que el bot ofrece. El documento debe servirle de contexto para saber qué puede pedirle al bot y qué respuestas o flujos esperar, y así detectar falencias y reportarlas.

**No incluir**: endpoints HTTP, request/response JSON, headers, códigos de estado. Solo lenguaje natural y flujos de conversación desde la perspectiva del usuario.

---

## Estructura propuesta del documento

El documento se creará en **Markdown** en `docs/` (por ejemplo `docs/CAPACIDADES_Y_ACCIONES_CHATBOT_ENTELEQUIA.md`), con las siguientes secciones.

### 1. Introducción y uso del documento

- Para quién es: una IA (o persona) que simula ser un usuario y conversa con el chatbot para entrenarlo y encontrar fallos
- Cómo usarlo: conocer todas las capacidades y acciones posibles para ejercitarlas en conversaciones reales y reportar cuando el bot no cumpla lo esperado

### 2. Qué puede hacer el bot por vos (capacidades)

Lista exhaustiva en lenguaje de usuario:

- **Productos y catálogo**: buscar productos por nombre, categoría, editorial, tomo; ver precios, stock (o indicación de "hay stock" / "quedan pocas" / "sin stock"); ver detalle de un producto. Puede mostrar tarjetas de productos (foto, título, precio, link).
- **Pedidos (estando logueado)**: consultar "mis pedidos", ver estado de un pedido, tracking, total, método de pago y envío.
- **Pedidos (sin estar logueado)**: consultar un pedido concreto si tenés número de pedido y al menos dos datos de identidad (dni, nombre, apellido, teléfono); el bot te guía paso a paso.
- **Recomendaciones**: pedir sugerencias ("qué me recomendás", "ayudame a elegir"); el bot puede preguntar por franquicia o tomo si hace falta y luego recomendar.
- **Tienda**: horarios, dirección, cómo llegar, estacionamiento, transporte.
- **Pagos y envíos**: medios de pago, costos de envío, plazos de entrega, modalidades (envío/retiro).
- **Reclamos y soporte (tickets)**: consultas sobre reclamos, devoluciones, problemas; el bot orienta y puede indicar opciones de contacto.
- **Conversación general**: saludos, agradecimientos, despedidas, preguntas ambiguas; el bot responde en tono conversacional.

Incluir también:

- **Seguimiento sobre productos**: después de que el bot mostró un listado, podés decir "el más barato" o "el más caro" y el bot te indica ese producto y su precio.
- **Escalación de pedido cancelado**: si el bot te informa que un pedido está cancelado, puede ofrecer escalar el tema; vos podés aceptar (sí) o no.

### 3. Qué podés hacer vos como usuario (acciones)

Lista exhaustiva de acciones que el humano puede tomar en la conversación:

- **Escribir mensajes**: preguntas o frases en texto (ej. "Quiero ver mangas de Evangelion", "¿Cuánto sale el envío?", "Horarios de la tienda", "Dónde está mi pedido").
- **Responder SI o NO** cuando el bot pregunta:
  - En flujo de pedidos sin login: "¿Tenés número de pedido y al menos dos de: dni, nombre, apellido, teléfono?" → podés decir Sí o No.
  - En escalación de pedido cancelado: "¿Querés que lo escalemos?" → podés decir Sí o No.
- **Dar datos en un solo mensaje** (flujo de pedido sin login): número de pedido + al menos 2 de: DNI (7 u 8 dígitos), nombre, apellido, teléfono (8–20 dígitos). Ejemplo: "pedido 12345, dni 12345678, nombre Juan, apellido Pérez".
- **Seguir un flujo de recomendaciones**: cuando el bot pide aclarar (franquicia, tomo, "el último", "desde el primero"), responder por ejemplo "Evangelion", "tomo 1", "el más nuevo", etc.
- **Pedir "el más barato" o "el más caro"** después de que el bot mostró una lista de productos.
- **Cambiar de tema** en medio de un flujo (ej. en medio del flujo de pedidos sin login decir "hola" o preguntar por productos); el bot puede salir del flujo y atender el nuevo tema.
- **Valorar una respuesta del bot** (si la interfaz lo permite): indicar si la respuesta te sirvió (positivo) o no (negativo), y opcionalmente elegir categoría (precisión, relevancia, tono, experiencia, otro) y/o escribir un motivo breve.

Incluir también situaciones que el usuario puede provocar sin querer:

- **No tener los datos** para consultar pedido sin login → responder No a "¿Tenés los datos?"; el bot indicará que para ver tus pedidos necesitás iniciar sesión.
- **Enviar datos incompletos o con formato inválido** en el flujo de pedido sin login → el bot pedirá completar o corregir (número de pedido, 2 datos de identidad, formatos válidos).
- **Preguntar por pedidos sin estar logueado y sin querer dar datos** → el bot puede pedirte iniciar sesión para ver "tus pedidos".

### 4. Flujos paso a paso (qué esperar)

Descripción en prosa, desde la perspectiva del usuario, de cada flujo importante:

**4.1 Consultar un pedido sin estar logueado**

1. Vos: preguntás por un pedido (ej. "Dónde está mi pedido", "Quiero saber el estado del pedido 12345").
2. Bot: pregunta si tenés número de pedido y al menos 2 de: dni, nombre, apellido, teléfono. Pide responder SI o NO.
3. Si respondés **NO**: el bot te dice que para consultar tus pedidos necesitás iniciar sesión.
4. Si respondés **SI**: el bot te pide que envíes todo en un solo mensaje (número de pedido + 2 datos de identidad) y da un ejemplo.
5. Vos: enviás un mensaje con pedido + datos (ej. "pedido 12345, dni 12345678, nombre Juan, apellido Pérez").
6. Bot puede: decir que no encontró el número de pedido; pedir más datos de identidad; indicar formato inválido y dar reglas; decir que hay alta demanda e intentar en 1 minuto; decir que no pudo validar los datos; o dar el estado del pedido (total, envío, tracking, método de pago).

**4.2 Pedir recomendaciones**

1. Vos: "Qué me recomendás", "Ayudame a elegir", etc.
2. Bot puede responder directo con sugerencias o preguntar por franquicia/saga o por tomo (ej. "¿Qué franquicia te interesa?", "¿Buscás desde el tomo 1 o el más reciente?").
3. Vos: "Evangelion", "tomo 1", "el último", etc.
4. Bot: responde con recomendaciones (texto y/o tarjetas de productos).

**4.3 Pedido cancelado y escalación**

1. Tras una respuesta del bot donde se menciona que un pedido está cancelado, el bot puede ofrecer: "¿Querés que lo escalemos?"
2. Vos: Sí o No (o equivalentes: "dale", "no gracias", etc.).
3. Bot: confirma que va a escalar o que no hace falta.

**4.4 Precio en listado reciente**

1. Después de que el bot te mostró una lista de productos, vos: "el más barato" o "el más caro".
2. Bot: te dice cuál es ese producto y su precio. Si no había listado reciente, puede decir que no tiene un listado reciente de productos.

### 5. Respuestas que podés recibir del bot (resumen)

- **Respuesta útil**: mensaje de texto (y a veces tarjetas de productos con imagen, título, precio, link, stock).
- **Pedir iniciar sesión**: cuando preguntás por "tus pedidos" y no estás logueado (o no tenés los datos para consulta guest), el bot puede indicarte que necesitás iniciar sesión o que tu sesión expiró.
- **Mensajes de error o límite**: que no pudo procesar, que no tiene permisos, que no encontró el pedido o la información, que hay un inconveniente momentáneo o que el catálogo no está disponible; o que hay alta demanda y que intentes en 1 minuto (consultas de pedidos).
- **Pedir aclaración**: en recomendaciones (franquicia, tomo) o en flujo de pedidos (SI/NO, datos en un mensaje).

### 6. Lista de comprobación para la IA que entrena (qué ejercitar)

Lista cerrada para que no se escape nada:

- Productos: buscar por nombre, por categoría; ver detalle; después de un listado, pedir "el más barato" y "el más caro".
- Pedidos logueado: "mis pedidos", "estado del pedido X".
- Pedidos sin login: iniciar flujo → responder Sí y dar datos completos; responder Sí y dar datos incompletos o mal formato; responder No (esperar mensaje de iniciar sesión).
- Recomendaciones: pedir recomendaciones; cuando el bot pida aclarar, responder con franquicia o tomo y ver que recomiende.
- Tienda: horarios, dirección, cómo llegar, estacionamiento.
- Pagos y envíos: medios de pago, costos, plazos.
- Tickets: reclamo, devolución, problema; ver opciones de contacto.
- General: hola, gracias, chau, pregunta ambigua.
- Escalación: después de pedido cancelado, aceptar y rechazar escalación.
- Cambio de tema: en medio del flujo de pedidos sin login, preguntar otra cosa.
- Valoración: marcar respuesta positiva y negativa (y si aplica, categoría y motivo).

En los informes, indicar: qué capacidad o acción se estaba probando, qué se dijo, qué se esperaba del bot según este documento, qué respondió el bot, y si hubo error o incoherencia.

---

## Fuentes en el código (para redactar el documento)

- Capacidades por intent: prompts/system/entelequia_intent_system_prompt_v1.txt, enrich-context-by-intent.use-case.ts
- Flujo guest pedidos: orders-order-lookup-response.ts, resolve-order-lookup-flow-state.ts
- Recomendaciones y desambiguación: resolve-recommendations-flow-state.ts, recommendations-disambiguation-response.ts
- Escalación pedido cancelado: resolve-orders-escalation-flow-state.ts, orders-escalation-response.ts
- Precio "más barato/caro": resolve-price-comparison-followup.ts, price-comparison-response.ts
- Mensajes literales al usuario: orders-unauthenticated-response.ts, error-mapper.ts
- Feedback (valoración): ChatFeedbackRequestDto — categorías y rating para describir la acción "valorar respuesta"
- UI (tarjetas): domain/ui-payload/types.ts — para redactar "el bot puede mostrar tarjetas con…"

---

## Formato y ubicación

- **Ubicación**: `docs/CAPACIDADES_Y_ACCIONES_CHATBOT_ENTELEQUIA.md`
- **Formato**: Markdown, lenguaje claro y en segunda persona ("podés", "el bot te…"). Sin jerga técnica de API. Opcional: un diagrama mermaid de flujo de conversación (ej. flujo guest) si ayuda a la IA
- **Tono**: usuario final / humano que usa el chat; la IA que entrena debe sentirse como "yo soy el usuario y esto es lo que puedo hacer y lo que el bot puede hacer por mí"

---

## Tareas de implementación (tras aprobación)

1. Crear el archivo en docs/ con la estructura de secciones 1–6
2. Rellenar cada sección extrayendo del código las capacidades, acciones, mensajes literales y flujos (sin mencionar endpoints ni JSON)
3. Incluir la lista de comprobación completa para que la IA que entrena no omita ninguna interacción
4. Revisar que no falte ninguna capacidad ni acción documentada en el código (incluir feedback/valoración y todos los mensajes de error que ve el usuario)
