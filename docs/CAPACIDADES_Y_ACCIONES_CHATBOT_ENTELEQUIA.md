# Capacidades y acciones del chatbot Entelequia

Documento para quien entrena o prueba el chatbot actuando como un usuario: lista todo lo que el bot puede hacer por vos y todo lo que vos podés hacer en la conversación, sin detalles técnicos. Sirve como contexto para ejercitar todas las herramientas del bot y reportar falencias.

**Canales:** Podés usar el chat desde **web** o desde **WhatsApp**; las capacidades son las mismas.

---

## Índice

1. [Introducción y uso del documento](#1-introducción-y-uso-del-documento)
2. [Qué puede hacer el bot por vos (capacidades)](#2-qué-puede-hacer-el-bot-por-vos-capacidades)
3. [Qué podés hacer vos como usuario (acciones)](#3-qué-podés-hacer-vos-como-usuario-acciones)
4. [Flujos paso a paso (qué esperar)](#4-flujos-paso-a-paso-qué-esperar)
5. [Respuestas que podés recibir del bot](#5-respuestas-que-podés-recibir-del-bot)
6. [Lista de comprobación para la IA que entrena](#6-lista-de-comprobación-para-la-ia-que-entrena)

---

## 1. Introducción y uso del documento

**Para quién es:** Una IA (o persona) que simula ser un usuario y conversa con el chatbot para entrenarlo, encontrar fallos y hacer informes. La idea es que actúes como un humano que quiere usar todas las herramientas que el bot ofrece.

**Cómo usarlo:** Leé todas las capacidades y acciones posibles. En conversaciones reales con el bot, ejercitá cada una. Cuando el bot no responda como se describe acá (mensaje equivocado, flujo roto, opción que no aparece), reportalo indicando: qué capacidad o acción estabas probando, qué dijiste, qué esperabas según este documento y qué respondió el bot.

**Qué no está en este documento:** Detalles técnicos de integración (APIs, formatos de mensajes internos). Solo lenguaje natural y flujos desde la perspectiva del usuario.

---

## 2. Qué puede hacer el bot por vos (capacidades)

El bot puede hacer todo lo siguiente. Probá cada capacidad en conversaciones reales.

### Productos y catálogo

- Buscar productos por nombre, categoría, editorial, tomo, lanzamientos.
- Mostrarte precios y disponibilidad: puede indicar “hay stock”, “quedan pocas unidades” o “sin stock” (según política del negocio). Si pedís explícitamente la **cantidad exacta** de unidades, puede indicártela cuando esté disponible.
- Mostrarte el detalle de un producto cuando preguntás por uno concreto.
- Mostrarte **tarjetas de productos**: imagen, título, subtítulo, precio, link al producto, badges (cuando aplique). Si la interfaz lo soporta, verás una lista de tarjetas además del mensaje de texto.
- Si no hay coincidencias exactas para tu búsqueda o filtro, puede decirte que no tiene y ofrecerte alternativas (editoriales relacionadas, opciones por tipo: manga, comic, figura o merch).

### Pedidos (estando logueado)

- Consultar “mis pedidos” o el estado de un pedido concreto.
- Mostrarte estado del pedido, total, método de pago, método de envío y tracking (cuando exista).
- Si no tenés pedidos en tu cuenta, el bot puede indicártelo (ej. “No encontramos pedidos en tu cuenta por ahora. Si hiciste una compra recientemente, puede tardar unos minutos en aparecer.”).

### Pedidos (sin estar logueado)

- Consultar **un pedido concreto** si tenés el número de pedido y al menos dos datos de identidad (dni, nombre, apellido, teléfono). El bot te guía paso a paso: primero pregunta si tenés esos datos, luego te pide que los envíes en un solo mensaje y te da un ejemplo. Si algo falta o está mal, te pide que lo completes o corrijas.

### Recomendaciones

- Darte sugerencias cuando pedís “qué me recomendás”, “ayudame a elegir”, etc.
- Si hace falta, el bot puede preguntarte por **franquicia/saga** (ej. Evangelion, Naruto) o por **tipo** (mangas/comics, figuras, ropa/accesorios; a veces también juegos o libros) y por **tomo o volumen** (ej. “tomo 3”, “desde el inicio”, “últimos lanzamientos”). Después te responde con recomendaciones (texto y/o tarjetas).
- Si no tiene recomendaciones para ese filtro, puede decirte que en ese momento no tiene recomendaciones específicas y ofrecerte últimos lanzamientos u opciones similares (anime/manga, por personaje/producto).

### Tienda

- Decirte **horarios** de atención: Lunes a viernes 10:00 a 19:00 hs, sábados 10:00 a 17:00 hs, domingos cerrado (y que en feriados conviene validar en web/redes).
- Decirte **dirección** y **cómo llegar**: hay dos sucursales en CABA (Centro y Belgrano); puede sugerirte la web oficial o mapas para la dirección exacta.
- Decirte **estacionamiento** y **transporte**.

### Pagos y envíos

- Informarte sobre **medios de pago**, **costos de envío**, **tiempos de entrega** y **modalidades** (envío a domicilio, retiro en tienda, etc.).

### Reclamos y soporte (tickets)

- Orientarte en reclamos, devoluciones, problemas o errores. Puede indicarte opciones de contacto (por ejemplo WhatsApp o email) para que el área correspondiente te ayude. En casos que detecte como prioridad alta (por ejemplo daño o producto defectuoso), puede recomendarte contacto humano inmediato por canal oficial.

### Conversación general

- Responder **saludos** (hola, buenos días), **agradecimientos** (gracias), **despedidas** (chau, nos vemos) y **preguntas ambiguas** en tono conversacional.
- Si preguntás si es una IA o un bot, puede responderte que es el asistente virtual de Entelequia.

### Seguimiento sobre productos (después de un listado)

- Si el bot te mostró una **lista de productos** en esta conversación, podés decir **“el más barato”** o **“el más caro”** y el bot te indica ese producto y su precio (ej. “De los X productos que te mostré, el más barato es [título] por [precio]”). Si no hay listado reciente, te dice que no tiene una lista reciente y puede ofrecerte mostrar opciones.

### Escalación de pedido cancelado

- Si el bot te informa que un **pedido está cancelado**, puede ofrecerte: “¿Querés que lo escalemos?”. Si aceptás, te indica canales de soporte (WhatsApp, email) y qué datos incluir (número de pedido, nombre, teléfono). Si declinás, te confirma que no hace falta.

---

## 3. Qué podés hacer vos como usuario (acciones)

Todas las acciones que podés tomar en la conversación:

### Escribir mensajes

- Cualquier pregunta o frase en texto. Ejemplos: “Quiero ver mangas de Evangelion”, “¿Cuánto sale el envío?”, “Horarios de la tienda”, “Dónde está mi pedido”, “Qué me recomendás”, “Tengo un problema con mi compra”.

### Responder SI o NO cuando el bot pregunta

- **Flujo de pedidos sin login:** El bot puede preguntar: “Para ayudarte con tu pedido sin iniciar sesión, necesito confirmar si tenés estos datos: número de pedido y al menos 2 entre dni, nombre, apellido, teléfono. Responde SI o NO.” Podés responder **Sí** (o “sí”, “tengo”, “dale”, “ok”, etc.) o **No** (o “no”, “no tengo”, etc.). Si no entiende tu respuesta, te pide de nuevo: “No entendí tu respuesta. Por favor responde SI o NO.”
- **Escalación de pedido cancelado:** Si el bot ofrece escalar, podés decir **Sí** (ej. “dale”, “sí por favor”) o **No** (ej. “no gracias”, “no hace falta”). Si no entiende, te aclara: “Si querés que te pase los canales para revisarlo, responde SI. Si preferís seguir con otra consulta, responde NO.”

### Dar datos en un solo mensaje (flujo de pedido sin login)

- Cuando el bot te pide “enviame todo en un solo mensaje”, tenés que incluir:
  - **Número de pedido** (ej. “pedido 12345”).
  - **Al menos 2 datos de identidad** entre: DNI (7 u 8 dígitos), nombre (hasta 50 letras), apellido (hasta 50 letras), teléfono (entre 8 y 20 dígitos, puede incluir +).
- Ejemplo: “pedido 12345, dni 12345678, nombre Juan, apellido Perez”.

### Seguir el flujo de recomendaciones

- Cuando el bot pide aclarar **qué tipo te interesa** (mangas/comics, figuras, ropa/accesorios) o **tomo/volumen** (“tomo 3”, “desde el inicio”, “últimos lanzamientos”), respondé con una de esas opciones o con el nombre de la franquicia (ej. “Evangelion”, “tomo 1”, “el más nuevo”).

### Pedir “el más barato” o “el más caro”

- Después de que el bot mostró una lista de productos en la conversación, escribí “el más barato” o “el más caro” y el bot te responde con ese producto y su precio.

### Cambiar de tema

- En medio de cualquier flujo (por ejemplo, cuando el bot te está pidiendo datos del pedido sin login), podés escribir otra cosa (ej. “hola”, “quiero ver productos”). El bot puede salir del flujo anterior y atender el nuevo tema.

### Valorar una respuesta del bot

- Si la interfaz lo permite, podés indicar si la respuesta te sirvió (**positivo**) o **no** (**negativo**). Opcionalmente podés elegir una categoría: precisión (accuracy), relevancia (relevance), tono (tone), experiencia de uso (ux), u otro (other), y/o escribir un motivo breve (hasta 280 caracteres).

### Situaciones que podés provocar (para probar que el bot responde bien)

- **No tener los datos para consultar pedido sin login:** Responder **No** a “¿Tenés los datos?”. El bot te indica que para consultar tus pedidos necesitás iniciar sesión y te da opciones (iniciar sesión en la web, consultar por email/WhatsApp con número de pedido, no compartir credenciales en el chat).
- **Enviar datos incompletos o con formato inválido:** En el flujo de pedido sin login, enviar un mensaje sin número de pedido, con solo un dato de identidad, o con formatos incorrectos (ej. DNI con letras). El bot te pide que completes o corrijas y puede recordarte las reglas (dni 7 u 8 dígitos, nombre/apellido hasta 50 letras, teléfono 8–20 dígitos).
- **Preguntar por “mis pedidos” sin estar logueado y sin dar datos:** El bot puede pedirte iniciar sesión (o, si entrás al flujo guest, preguntarte si tenés los datos y que respondas SI o NO).

---

## 4. Flujos paso a paso (qué esperar)

### 4.1 Consultar un pedido sin estar logueado

1. **Vos:** Preguntás por un pedido. Ejemplos: “Dónde está mi pedido”, “Quiero saber el estado del pedido 12345”.
2. **Bot:** Te pregunta si tenés número de pedido y al menos 2 de: dni, nombre, apellido, teléfono. Pide responder **SI o NO**.
3. **Si respondés NO:** El bot te dice que necesitás iniciar sesión para consultar tus pedidos y te da opciones (iniciar sesión en la web, volver al chat, consultar por email; si tenés número de pedido también podés consultar por WhatsApp o email; no compartas credenciales en el chat).
4. **Si respondés SI:** El bot te dice “Perfecto” y te pide que envíes todo en un solo mensaje: número de pedido + 2 datos de identidad. Da un ejemplo: “pedido 12345, dni 12345678, nombre Juan, apellido Perez”.
5. **Vos:** Enviás un mensaje con pedido + datos.
6. **Bot** puede responder con uno de estos casos:
   - **No encontró el número de pedido:** “No encontré el número de pedido en tu mensaje.” (y repite las instrucciones).
   - **Faltan datos de identidad:** “Recibí X dato(s) de identidad. Necesito Y dato(s) más.” (y repite las instrucciones).
   - **Formato inválido:** “No pude validar el formato enviado.” Puede sumar: “Detecté X dato(s) con formato inválido” y las reglas (dni 7 u 8 dígitos, nombre/apellido hasta 50 letras, teléfono 8–20 dígitos).
   - **Alta demanda:** “Hay alta demanda para consultas de pedidos. Intenta nuevamente en 1 minuto.”
   - **No pudo validar:** “No pudimos validar los datos del pedido. Verifica el número de pedido y tus datos, e intenta nuevamente.”
   - **Problema momentáneo:** “No pude validar la consulta en este momento. Intenta nuevamente en unos segundos.”
   - **Éxito:** Te muestra el pedido con formato tipo: [PEDIDO #X], Estado, Total, Envío, Tracking, Pago.

### 4.2 Pedir recomendaciones

1. **Vos:** “Qué me recomendás”, “Ayudame a elegir”, etc.
2. **Bot:** Puede responder directo con sugerencias (texto y/o tarjetas) o puede preguntar para afinar:
   - **Por tipo:** “Encontré X producto(s) de [franquicia]. Para recomendarte mejor, decime qué tipo te interesa: mangas/comics, figuras y coleccionables, ropa/accesorios. Si ya sabés qué tomo/número buscás, decimelo en el mismo mensaje.”
   - **Por tomo/volumen:** “Perfecto, vamos con [categoría] de [franquicia]. Para afinar la recomendación, decime una opción: tomo/número específico (ej: tomo 3), desde el inicio, últimos lanzamientos.”
3. **Vos:** “Evangelion”, “tomo 1”, “el último”, “desde el inicio”, etc.
4. **Bot:** Responde con recomendaciones (texto y/o tarjetas de productos).

### 4.3 Pedido cancelado y escalación

1. Después de una respuesta del bot donde se menciona que un pedido está **cancelado**, el bot puede ofrecer: “¿Querés que lo escalemos?” (o similar).
2. **Vos:** Sí o No (o “dale”, “no gracias”, etc.).
3. **Bot:**
   - **Si aceptás:** Te indica que no tiene el motivo exacto de cancelación desde el chat y te pasa canales (WhatsApp, email) y qué incluir (número de pedido, nombre completo, teléfono).
   - **Si declinás:** “Perfecto. Si después querés que te pase los canales de soporte para revisarlo, avisame y te ayudo.”
   - **Si no entiende:** “Si querés que te pase los canales para revisarlo, responde SI. Si preferís seguir con otra consulta, responde NO.”

### 4.4 Precio en listado reciente

1. Después de que el bot te mostró una **lista de productos** en la conversación, **vos:** “el más barato” o “el más caro”.
2. **Bot:** Te dice cuál es ese producto y su precio. Ejemplo: “De los X productos que te mostré, el más barato es [título] por [precio].” Si no había listado reciente: “No tengo una lista reciente de productos en esta conversación. Si querés, te muestro opciones y te digo al toque cuál es el más barato.”

---

## 5. Respuestas que podés recibir del bot

- **Respuesta útil:** Mensaje de texto y, cuando corresponda, tarjetas de productos (imagen, título, precio, link, disponibilidad).
- **Pedir iniciar sesión:** Cuando preguntás por “tus pedidos” y no estás logueado (o respondés No a tener datos para consulta guest), el bot puede indicarte que necesitás iniciar sesión o que tu sesión expiró/inválida, con opciones (iniciar sesión en la web, consultar por email/WhatsApp con número de pedido, no compartir credenciales).
- **Mensajes de error o límite:**
  - “No tenés permisos para acceder a esa información.”
  - “No encontramos ese pedido en tu cuenta.”
  - “No encontramos la información solicitada.”
  - “Ahora mismo no puedo consultar el catálogo. Intentá nuevamente en unos minutos o si querés te muestro categorías disponibles.”
  - “Tuvimos un inconveniente momentáneo. Si querés, te ayudo con otra consulta o lo intentamos de nuevo en un momento.”
  - Para consultas de pedidos sin login con mucha demanda: “Hay alta demanda para consultas de pedidos. Intenta nuevamente en 1 minuto.”
- **Pedir aclaración:** En recomendaciones (tipo, franquicia, tomo) o en flujo de pedidos (SI/NO, datos en un mensaje con el formato correcto).
- **Mensaje duplicado:** Si se envía el mismo mensaje dos veces (según cómo la interfaz identifique duplicados), el bot puede responder con la misma respuesta anterior o con un mensaje tipo “Este mensaje ya fue procesado.”
- **Respuestas de respaldo (fallback):** Cuando el sistema no puede generar una respuesta completa (por ejemplo por un error momentáneo del modelo), puede mostrarte un mensaje corto según la intención, por ejemplo: “Puedo ayudarte con el estado de tu pedido. Si querés, compartime el número de pedido.”; “Te comparto la guía de pagos y envíos para que sigas con tu compra.”; “Siento el inconveniente. Contame el problema y te ayudo a escalarlo con soporte.”; “Te ayudo con información de locales, horarios y cómo llegar.”; “Te recomiendo estos productos destacados en este momento.”; “Encontré resultados relacionados. Si querés, te detallo los más relevantes.”; “Perfecto, te ayudo con eso. Contame un poco más para darte una respuesta precisa.”
- **Reescritura de mensaje:** A veces el bot reescribe frases técnicas o de error del sistema en un mensaje más amigable (ej. si apareciera “no pudimos procesar tu mensaje”, podés ver en su lugar algo como “Se complicó esta consulta. Si querés, la intento de nuevo o te ayudo por otro camino.”).
- **Validación:** Si el mensaje está vacío o es demasiado largo, la interfaz puede rechazarlo y mostrar un error (por ejemplo “Payload inválido” o similar).
- **Valoración (feedback):** Si valorás una respuesta con un responseId que no existe o que no corresponde a esa conversación, puede fallar con un mensaje tipo “responseId inválido para esa conversación.”

---

## 6. Lista de comprobación para la IA que entrena

Usá esta lista para no dejar ninguna interacción sin probar. En cada ítem, ejercitá la capacidad o acción y anotá si el bot respondió como se describe en este documento; si no, reportalo.

### Productos

- [ ] Buscar productos por nombre.
- [ ] Buscar por categoría o tipo (ej. mangas, figuras).
- [ ] Pedir detalle de un producto concreto.
- [ ] Después de un listado, pedir **“el más barato”**.
- [ ] Después de un listado, pedir **“el más caro”**.
- [ ] Pedir “el más barato” o “el más caro” **sin** listado reciente (el bot debe decir que no tiene lista reciente y puede ofrecer mostrar opciones).
- [ ] Verificar que cuando hay productos, el bot puede mostrar tarjetas (imagen, título, precio, link) además del texto.
- [ ] Buscar algo que **no tenga resultados** (ej. filtro muy raro) y ver que el bot responda acorde (diga que no hay coincidencias y/o ofrezca alternativas: editoriales, tipo manga/comic/figura/merch).

### Pedidos (logueado)

- [ ] Preguntar “mis pedidos” o “estado de mis pedidos”.
- [ ] Preguntar por un pedido concreto por número (ej. “estado del pedido 12345”).
- [ ] Si estás logueado pero **no tenés pedidos** (o la cuenta no tiene), ver que el bot indique que no encontró pedidos en tu cuenta (y puede mencionar que si compraste hace poco puede tardar en aparecer).

### Pedidos (sin login – flujo guest)

- [ ] Preguntar por un pedido sin estar logueado → el bot pregunta si tenés número de pedido y 2 datos de identidad; pedir SI o NO.
- [ ] Responder **NO** → el bot debe indicar que necesitás iniciar sesión y dar opciones.
- [ ] Responder **SI** → el bot pide enviar todo en un mensaje con ejemplo.
- [ ] Enviar mensaje **sin número de pedido** → el bot debe decir que no encontró el número de pedido.
- [ ] Enviar mensaje con **solo 1 dato de identidad** → el bot debe pedir X dato(s) más.
- [ ] Enviar mensaje con **formato inválido** (ej. DNI con letras) → el bot debe indicar que no pudo validar y dar reglas de formato.
- [ ] Enviar mensaje **correcto** (pedido + al menos 2 datos válidos) → el bot debe mostrar estado del pedido (o mensaje de no poder validar / alta demanda si aplica).
- [ ] Si el bot responde “No entendí tu respuesta” a SI/NO, verificar que vuelve a pedir SI o NO.

### Recomendaciones

- [ ] Pedir “qué me recomendás” o “ayudame a elegir”.
- [ ] Cuando el bot pida **tipo** (mangas, figuras, ropa), responder con una opción y ver que recomiende.
- [ ] Cuando el bot pida **tomo/volumen** (“tomo 3”, “desde el inicio”, “últimos lanzamientos”), responder y ver que recomiende.
- [ ] Mencionar una franquicia (ej. “Evangelion”) cuando el bot pide aclarar y ver que use eso en la recomendación.
- [ ] Pedir recomendaciones con un filtro que no tenga resultados y ver que el bot indique que no tiene recomendaciones específicas para ese filtro y/o ofrezca últimos lanzamientos u opciones similares.

### Tienda

- [ ] Preguntar **horarios** de atención (esperar Lunes a viernes 10–19, sábados 10–17, domingos cerrado).
- [ ] Preguntar **dirección** o **cómo llegar** (esperar mención de Centro y Belgrano, web o mapas).
- [ ] Preguntar por **estacionamiento**.
- [ ] Preguntar por **transporte** o cómo llegar.

### Pagos y envíos

- [ ] Preguntar **medios de pago**.
- [ ] Preguntar **costo de envío** o **envíos**.
- [ ] Preguntar **plazos de entrega** o **tiempos de entrega**.
- [ ] Preguntar por **retiro** o **modalidades** de envío.

### Tickets (reclamos y soporte)

- [ ] Preguntar por **reclamo**, **devolución** o **problema** con una compra.
- [ ] Verificar que el bot oriente y/o indique opciones de contacto (WhatsApp, email, etc.).

### Conversación general

- [ ] Decir **hola** o **buenos días**.
- [ ] Decir **gracias**.
- [ ] Decir **chau** o **nos vemos**.
- [ ] Hacer una **pregunta ambigua** (ej. “no sé qué comprar”) y ver que el bot responda en tono conversacional o oriente.
- [ ] Preguntar **“¿sos IA?”** o **“¿eres un bot?”** y ver que el bot se identifique como asistente virtual de Entelequia.

### Escalación de pedido cancelado

- [ ] Después de que el bot informe un **pedido cancelado**, ver si ofrece escalar.
- [ ] Si ofrece, responder **Sí** → el bot debe pasar canales (WhatsApp, email) y qué datos incluir.
- [ ] Si ofrece, responder **No** → el bot debe confirmar que no hace falta y que podés avisar si después querés los canales.
- [ ] Si respondés algo que no es claro SI/NO, el bot debe aclarar: “Si querés que te pase los canales… responde SI. Si preferís seguir con otra consulta, responde NO.”

### Cambio de tema

- [ ] En medio del **flujo de pedidos sin login** (después de que te preguntó SI/NO o después de que te pidió los datos), escribir **otra cosa** (ej. “hola”, “quiero ver productos”). El bot debe poder salir del flujo y atender el nuevo tema.

### Valoración de respuestas

- [ ] Si la interfaz lo permite, marcar una respuesta como **positiva** (up).
- [ ] Marcar una respuesta como **negativa** (down).
- [ ] Si aplica, elegir **categoría** (precisión, relevancia, tono, experiencia, otro) y/o escribir un **motivo breve**.
- [ ] Si valorás una respuesta con un **responseId inválido** o de otra conversación, puede aparecer un error tipo “responseId inválido para esa conversación.”

### Casos borde y errores

- [ ] Enviar un mensaje **vacío** o **demasiado largo** y ver que la interfaz rechace o muestre error (ej. “Payload inválido”).
- [ ] Si en algún momento el bot responde con un **mensaje de respaldo** (corto y genérico por intención), anotar el caso; puede indicar un fallback del sistema.

### Cómo reportar

En cada falla o incoherencia, indicar:

- **Capacidad o acción** que estabas probando (según esta lista o este documento).
- **Qué dijiste** (mensajes que enviaste).
- **Qué esperabas** del bot según este documento.
- **Qué respondió** el bot (texto o comportamiento).
- **Qué estuvo mal** (mensaje incorrecto, flujo roto, opción que no apareció, etc.).
