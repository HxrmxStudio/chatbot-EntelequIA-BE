## 📋 PLAN COMPLETO: Solución Franchise Detection con Modelos Pre-entrenados

---

## 🎯 ARQUITECTURA PROPUESTA

```mermaid
graph TB
    User[👤 Usuario WhatsApp] --> n8n[⚙️ n8n Workflow]
    n8n --> Backend[🔵 Backend NestJS]

    Backend --> Layer1[📊 LAYER 1: Intent Detection]
    Layer1 --> IntentModel[🤖 BERT Zero-Shot<br/>facebook/bart-large-mnli<br/>Detecta: stock/precio/recomendación]

    Backend --> Layer2[🔍 LAYER 2: Franchise Detection]
    Layer2 --> SentenceT[🧠 Sentence Transformers<br/>paraphrase-multilingual-MiniLM<br/>Embeddings + cosine similarity]
    Layer2 --> pgvector[(🗄️ PostgreSQL + pgvector<br/>300 franquicias pre-indexadas)]

    Backend --> Layer3[📚 LAYER 3: Context Builder]
    Layer3 --> RAG[📖 LlamaIndex RAG<br/>Knowledge base rubro]
    RAG --> KnowledgeDB[(📁 /knowledge/<br/>franquicias.txt<br/>formatos.txt<br/>faq.txt)]

    Backend --> Layer4[🤖 LAYER 4: Response Generation]
    Layer4 --> LLM[🎨 OpenAI GPT-4o-mini<br/>+ Few-shot prompting]

    LLM --> ProductDB[(💾 PostgreSQL<br/>products table)]
    LLM --> Response[💬 Respuesta Final]
    Response --> n8n
    n8n --> User

    classDef model fill:#e3f2fd
    classDef db fill:#e8f5e9
    classDef llm fill:#fce4ec
    class IntentModel,SentenceT,RAG model
    class pgvector,KnowledgeDB,ProductDB db
    class LLM llm
```

---

## 🏗️ PLAN DE IMPLEMENTACIÓN (3 Semanas)

### **SEMANA 1: Foundation (Modelos Pre-entrenados)**

#### ✅ Día 1-2: Setup Infrastructure

```bash
# Dependencias
pip install sentence-transformers pgvector psycopg2-binary
pip install transformers torch
pip install llama-index langchain openai
```

**Tareas**:

- [ ] PostgreSQL con extensión pgvector
- [ ] Tabla `franchises` con columna `embedding vector(384)`
- [ ] Tabla `products` con FK a franchises
- [ ] Redis para cache (opcional pero recomendado)

#### ✅ Día 3-4: LAYER 1 - Intent Detection

**Modelo**: `facebook/bart-large-mnli` (Zero-shot classification)

```python
# services/intent-detector.service.ts (Python microservice)
from transformers import pipeline

class IntentDetectorService:
    def __init__(self):
        self.classifier = pipeline(
            "zero-shot-classification",
            model="facebook/bart-large-mnli",
            device=0  # GPU si disponible
        )
        self.intents = [
            "stock_check",        # "Tenés One Piece?"
            "price_inquiry",      # "Cuánto sale Dragon Ball?"
            "recommendation",     # "Qué manga me recomendás?"
            "product_search",     # "Busco figuras de Naruto"
            "order_status",       # "Dónde está mi pedido?"
            "general_info"        # "Horarios? Dirección?"
        ]

    def detect(self, user_message: str) -> dict:
        result = self.classifier(user_message, self.intents)
        return {
            "intent": result["labels"][0],
            "confidence": result["scores"][0]
        }
```

**Output esperado**:

```json
{
  "intent": "stock_check",
  "confidence": 0.89
}
```

---

#### ✅ Día 5-7: LAYER 2 - Franchise Detection

**Modelo**: `paraphrase-multilingual-MiniLM-L12-v2` (Sentence Transformers)

```python
# services/franchise-detector.service.ts (Python microservice)
from sentence_transformers import SentenceTransformer, util
import psycopg2

class FranchiseDetectorService:
    def __init__(self):
        # Modelo pre-entrenado multilingüe
        self.model = SentenceTransformer(
            'paraphrase-multilingual-MiniLM-L12-v2'
        )
        self.conn = psycopg2.connect("postgresql://localhost/entelequia")

    def detect_franchise(self, user_query: str) -> dict:
        # 1. Generar embedding del query
        query_embedding = self.model.encode(user_query)

        # 2. Búsqueda vectorial en PostgreSQL
        cur = self.conn.cursor()
        cur.execute("""
            SELECT
                name,
                aliases,
                tier,
                1 - (embedding <=> %s::vector) as similarity
            FROM franchises
            WHERE 1 - (embedding <=> %s::vector) > 0.7
            ORDER BY similarity DESC
            LIMIT 3
        """, (query_embedding.tolist(), query_embedding.tolist()))

        results = cur.fetchall()

        if not results:
            return {
                "detected": False,
                "franchise": None,
                "confidence": 0.0
            }

        # 3. Mejor match
        best = results[0]
        return {
            "detected": True,
            "franchise": {
                "name": best[0],
                "aliases": best[1],
                "tier": best[2]
            },
            "confidence": float(best[3]),
            "alternatives": [
                {"name": r[0], "score": float(r[3])}
                for r in results[1:]
            ]
        }
```

**Script one-time: Generar embeddings**:

```python
# scripts/generate_franchise_embeddings.py
from sentence_transformers import SentenceTransformer
import psycopg2

model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
conn = psycopg2.connect("postgresql://localhost/entelequia")
cur = conn.cursor()

# Obtener franquicias
cur.execute("SELECT id, name, aliases FROM franchises")
franchises = cur.fetchall()

for franchise_id, name, aliases in franchises:
    # Texto enriquecido: nombre + aliases
    text = f"{name} {' '.join(aliases)}"

    # Generar embedding
    embedding = model.encode(text).tolist()

    # Guardar en DB
    cur.execute(
        "UPDATE franchises SET embedding = %s WHERE id = %s",
        (embedding, franchise_id)
    )

conn.commit()
print(f"✅ {len(franchises)} franquicias indexadas")
```

**Output esperado**:

```json
{
  "detected": true,
  "franchise": {
    "name": "Dragon Ball",
    "aliases": ["db", "dbz", "goku"],
    "tier": 1
  },
  "confidence": 0.87,
  "alternatives": [{ "name": "Dragon Ball Super", "score": 0.72 }]
}
```

---

### **SEMANA 2: Context & Knowledge**

#### ✅ Día 8-10: LAYER 3 - RAG Knowledge Base

**Modelo**: `LlamaIndex` con embeddings locales

**Paso 1: Crear knowledge base**:

```bash
mkdir -p knowledge
```

**Archivo**: `knowledge/franquicias.txt`

```
Dragon Ball es una franquicia de manga creada por Akira Toriyama.
Incluye series: Dragon Ball, Dragon Ball Z, Dragon Ball Super.
Personajes principales: Goku (Kakarotto), Vegeta, Gohan, Piccolo.
Formatos disponibles: tomos individuales, box sets, edición deluxe.

Naruto es un manga shonen de Masashi Kishimoto.
Series: Naruto, Naruto Shippuden.
Personajes: Naruto Uzumaki, Sasuke Uchiha, Sakura Haruno.
Formatos: tomos 1-72, box sets por arcos.

One Piece es un manga de Eiichiro Oda.
Series: One Piece (1997-presente).
Personajes: Monkey D. Luffy, Roronoa Zoro, Nami.
Actualmente: 1100+ tomos publicados.
```

**Archivo**: `knowledge/formatos.txt`

```
FORMATOS DE MANGA:
- Tomo: Volumen individual (200 páginas aprox)
- Box Set: Colección completa o por arco (10-30 tomos)
- Edición Deluxe: Tapa dura, papel especial, contenido extra
- Edición Coloreada: Páginas a color (más caro)
- Tankōbon: Formato estándar japonés
- Kanzenban: Edición de lujo completa

FORMATOS DE FIGURAS:
- Funko Pop: Chibi 10cm (económico)
- Figuarts: Articulada 14-16cm (media gama)
- Nendoroid: Chibi articulada (coleccionable)
- Estatua: Premium, sin articulación (exhibición)
- Scale Figure: 1/8, 1/7, 1/4 (alta gama)
```

**Archivo**: `knowledge/stock_terms.txt`

```
ESTADOS DE STOCK:
- En stock: Disponible para envío inmediato
- Pocas unidades: Menos de 5 unidades disponibles
- Preventa / Pre-order: Producto no lanzado, se reserva
- Agotado: Sin stock, puede reponerse
- Descontinuado: No volverá a producirse
- Consultar disponibilidad: Stock incierto
```

**Código RAG**:

```python
# services/knowledge-base.service.py
from llama_index import VectorStoreIndex, SimpleDirectoryReader
from llama_index.embeddings import HuggingFaceEmbedding
from llama_index.llms import OpenAI

class KnowledgeBaseService:
    def __init__(self):
        # Embeddings locales (mismo modelo que franchise detection)
        embed_model = HuggingFaceEmbedding(
            model_name="paraphrase-multilingual-MiniLM-L12-v2"
        )

        # Cargar documentos
        documents = SimpleDirectoryReader('knowledge').load_data()

        # Crear índice vectorial
        self.index = VectorStoreIndex.from_documents(
            documents,
            embed_model=embed_model
        )

        self.query_engine = self.index.as_query_engine(
            similarity_top_k=3
        )

    def get_context(self, query: str) -> str:
        """Obtiene contexto relevante del knowledge base"""
        response = self.query_engine.query(query)
        return str(response)
```

---

#### ✅ Día 11-14: LAYER 4 - Response Generation

**Modelo**: `gpt-4o-mini` con few-shot prompting

```python
# services/response-generator.service.py
from langchain.chat_models import ChatOpenAI
from langchain.prompts import ChatPromptTemplate

class ResponseGeneratorService:
    def __init__(self):
        self.llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.3)

        self.system_prompt = """
Sos asistente virtual de Entelequia, tienda de comics, manga y cultura geek en Argentina.

PERSONALIDAD:
- Amigable, cercano, usás lenguaje argentino natural
- Conocés bien el rubro (manga, comics, figuras)
- Sos preciso con stock y precios
- Si no sabés algo, lo decís honestamente

EJEMPLOS DE RESPUESTAS:

User: "Tenés One Piece?"
Assistant: "¡Sí! Tenemos One Piece. Actualmente hay 150 tomos disponibles en español. ¿Buscás algún tomo en particular o querés empezar desde el principio?"

User: "Dragon Ball tomo 1 deluxe"
Assistant: "Dragon Ball Z tomo 1 edición Deluxe está $ 2.499 ARS. Es tapa dura con páginas a color. Tenemos stock. ¿Te lo agrego al carrito?"

User: "Cuánto sale una figura de Goku?"
Assistant: "Tenemos varias opciones de Goku:
- Funko Pop: $ 899 (10cm)
- Figuarts articulada: $ 3.499 (14cm, 25 puntos articulación)
- Estatua premium: $ 8.999 (20cm, resina)
¿Cuál te interesa?"

User: "Qué manga me recomendás si me gustó Attack on Titan?"
Assistant: "Si te gustó Attack on Titan, te recomiendo:
- Tokyo Ghoul (oscuro, acción)
- Demon Slayer (acción épica, arte increíble)
- Chainsaw Man (violento, original)
Todos tienen estilo seinen similar. ¿Querés que te cuente más de alguno?"

CONTEXTO DEL RUBRO:
{knowledge_context}

INFORMACIÓN DE FRANQUICIA DETECTADA:
{franchise_info}

PRODUCTOS DISPONIBLES:
{products_info}

CONSULTA DEL USUARIO:
{user_query}

Respondé de forma natural y útil.
"""

    def generate_response(
        self,
        user_query: str,
        intent: str,
        franchise_info: dict,
        products: list,
        knowledge_context: str
    ) -> str:
        # Formatear productos
        products_text = "\n".join([
            f"- {p['name']}: ${p['price_ars']} ARS ({p['stock']})"
            for p in products[:5]
        ])

        # Formatear franquicia
        franchise_text = ""
        if franchise_info and franchise_info.get("detected"):
            f = franchise_info["franchise"]
            franchise_text = f"Franquicia detectada: {f['name']} (tier {f['tier']}, confidence {franchise_info['confidence']:.2f})"

        # Generar prompt
        prompt = ChatPromptTemplate.from_template(self.system_prompt)

        messages = prompt.format_messages(
            knowledge_context=knowledge_context,
            franchise_info=franchise_text,
            products_info=products_text if products else "No hay productos disponibles",
            user_query=user_query
        )

        # Llamar LLM
        response = self.llm(messages)
        return response.content
```

---

### **SEMANA 3: Integration & Rollout**

#### ✅ Día 15-17: Orquestación en NestJS

```typescript
// src/modules/wf1/use-cases/handle-incoming-message.use-case.ts
import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class HandleIncomingMessageUseCase {
  private readonly pythonMicroserviceUrl = 'http://localhost:8000';

  async execute(userMessage: string, conversationId: string) {
    // 1. Intent Detection
    const intentResult = await axios.post(`${this.pythonMicroserviceUrl}/detect-intent`, {
      message: userMessage,
    });
    const intent = intentResult.data.intent;

    // 2. Franchise Detection
    const franchiseResult = await axios.post(`${this.pythonMicroserviceUrl}/detect-franchise`, {
      query: userMessage,
    });

    // 3. Get Knowledge Context
    const knowledgeResult = await axios.post(`${this.pythonMicroserviceUrl}/get-knowledge`, {
      query: userMessage,
    });

    // 4. Query Products (PostgreSQL)
    let products = [];
    if (franchiseResult.data.detected) {
      products = await this.productRepository.findByFranchise(franchiseResult.data.franchise.name);
    }

    // 5. Generate Response
    const responseResult = await axios.post(`${this.pythonMicroserviceUrl}/generate-response`, {
      user_query: userMessage,
      intent: intent,
      franchise_info: franchiseResult.data,
      products: products,
      knowledge_context: knowledgeResult.data.context,
    });

    return {
      reply: responseResult.data.response,
      intent: intent,
      franchise_detected: franchiseResult.data.detected,
      confidence: franchiseResult.data.confidence,
    };
  }
}
```

---

#### ✅ Día 18-19: Python Microservice (FastAPI)

```python
# microservice/main.py
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

# Inicializar servicios
intent_detector = IntentDetectorService()
franchise_detector = FranchiseDetectorService()
knowledge_base = KnowledgeBaseService()
response_generator = ResponseGeneratorService()

class MessageRequest(BaseModel):
    message: str

@app.post("/detect-intent")
async def detect_intent(request: MessageRequest):
    result = intent_detector.detect(request.message)
    return result

@app.post("/detect-franchise")
async def detect_franchise(request: MessageRequest):
    result = franchise_detector.detect_franchise(request.message)
    return result

@app.post("/get-knowledge")
async def get_knowledge(request: MessageRequest):
    context = knowledge_base.get_context(request.message)
    return {"context": context}

@app.post("/generate-response")
async def generate_response(request: dict):
    response = response_generator.generate_response(
        user_query=request["user_query"],
        intent=request["intent"],
        franchise_info=request["franchise_info"],
        products=request["products"],
        knowledge_context=request["knowledge_context"]
    )
    return {"response": response}
```

---

#### ✅ Día 20-21: Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Backend NestJS existente
  backend:
    build: ./backend
    ports:
      - '3000:3000'
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/entelequia
    depends_on:
      - postgres
      - python-ml

  # Microservicio Python ML
  python-ml:
    build: ./microservice
    ports:
      - '8000:8000'
    environment:
      - MODEL_CACHE_DIR=/models
    volumes:
      - ./models:/models
      - ./knowledge:/app/knowledge
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  # PostgreSQL con pgvector
  postgres:
    image: ankane/pgvector
    environment:
      - POSTGRES_DB=entelequia
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - '5432:5432'

  # Redis (cache)
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  postgres_data:
```

---

## 📊 RESUMEN DE MODELOS

| Layer         | Modelo                           | Función                               | Latencia | Costo           |
| ------------- | -------------------------------- | ------------------------------------- | -------- | --------------- |
| **Intent**    | `facebook/bart-large-mnli`       | Clasificar intent (stock/precio/reco) | 30ms     | $0              |
| **Franchise** | `paraphrase-multilingual-MiniLM` | Detectar franquicia por embeddings    | 20ms     | $0              |
| **Knowledge** | `LlamaIndex` + mismo embedding   | RAG con contexto del rubro            | 50ms     | $0              |
| **Response**  | `gpt-4o-mini`                    | Generar respuesta natural             | 800ms    | $0.15/1M tokens |

**Total latencia**: ~900ms (aceptable para chatbot)  
**Costo mensual** (10k msgs): ~USD 1.50

---

## 🎯 DELIVERABLES

### Semana 1

- [ ] PostgreSQL + pgvector setup
- [ ] Script embeddings 300 franquicias
- [ ] Intent detector funcionando
- [ ] Franchise detector funcionando

### Semana 2

- [ ] Knowledge base (5 archivos txt)
- [ ] LlamaIndex indexado
- [ ] Response generator con few-shot
- [ ] Unit tests básicos

### Semana 3

- [ ] Python microservice FastAPI
- [ ] NestJS integration
- [ ] Docker compose
- [ ] Deploy staging
- [ ] Testing E2E

---

## 💰 COSTOS ESTIMADOS

| Concepto              | Costo                    |
| --------------------- | ------------------------ |
| Modelos Hugging Face  | $0 (open-source)         |
| OpenAI gpt-4o-mini    | ~USD 1.50/mes (10k msgs) |
| PostgreSQL + pgvector | $0 (self-hosted)         |
| GPU (opcional)        | $0 (CPU suficiente)      |
| **TOTAL**             | **~USD 2/mes**           |

---

## ✅ VENTAJAS DE ESTE PLAN

1. ✅ **Zero entrenamiento** (todos los modelos pre-entrenados)
2. ✅ **Multilingüe nativo** (español/inglés)
3. ✅ **Escalable** (pgvector indexa millones)
4. ✅ **Actualizaciones fáciles** (agregar docs a /knowledge)
5. ✅ **Costo bajo** (~USD 2/mes)
6. ✅ **Latencia aceptable** (~900ms)

---

Ah perfecto, disculpá. Ya tenés todo funcionando, solo querés **modelos de Hugging Face que te faciliten el trabajo**.

## 🤖 MODELOS HUGGING FACE RECOMENDADOS (Plug & Play)

---

### 1️⃣ **Para Detección de Franquicias**

```python
from sentence_transformers import SentenceTransformer

# Mejor modelo multilingüe español/inglés
model = SentenceTransformer('sentence-transformers/paraphrase-multilingual-mpnet-base-v2')

# O más rápido:
model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
```

**Link**: https://huggingface.co/sentence-transformers/paraphrase-multilingual-mpnet-base-v2

---

### 2️⃣ **Para Intent Detection (clasificar qué quiere el usuario)**

```python
from transformers import pipeline

# Zero-shot classification
classifier = pipeline(
    "zero-shot-classification",
    model="facebook/bart-large-mnli"
)

# O en español nativo:
classifier = pipeline(
    "zero-shot-classification",
    model="joeddav/xlm-roberta-large-xnli"
)
```

**Links**:

- https://huggingface.co/facebook/bart-large-mnli
- https://huggingface.co/joeddav/xlm-roberta-large-xnli

---

### 3️⃣ **Para NER (extraer nombres, números de orden, emails)**

```python
from transformers import pipeline

# Español
ner = pipeline("ner", model="mrm8488/bert-spanish-cased-finetuned-ner")

# Multilingüe
ner = pipeline("ner", model="xlm-roberta-large-finetuned-conll03-english")
```

**Links**:

- https://huggingface.co/mrm8488/bert-spanish-cased-finetuned-ner
- https://huggingface.co/xlm-roberta-large-finetuned-conll03-english

---

### 4️⃣ **Para Reranking de Productos (ordenar resultados de búsqueda)**

```python
from transformers import AutoModelForSequenceClassification, AutoTokenizer

# Cross-encoder para relevancia
model = AutoModelForSequenceClassification.from_pretrained(
    'cross-encoder/ms-marco-MiniLM-L-6-v2'
)
tokenizer = AutoTokenizer.from_pretrained('cross-encoder/ms-marco-MiniLM-L-6-v2')
```

**Link**: https://huggingface.co/cross-encoder/ms-marco-MiniLM-L-6-v2

---

### 5️⃣ **Para Embeddings de Productos (alternativa a Sentence Transformers)**

```python
from transformers import AutoModel, AutoTokenizer

# E5 embeddings (estado del arte 2025)
model = AutoModel.from_pretrained('intfloat/multilingual-e5-large')
tokenizer = AutoTokenizer.from_pretrained('intfloat/multilingual-e5-large')
```

**Link**: https://huggingface.co/intfloat/multilingual-e5-large

---

### 6️⃣ **Para Q&A sobre documentos/FAQs**

```python
from transformers import pipeline

# Question Answering en español
qa = pipeline("question-answering", model="mrm8488/bert-base-spanish-wwm-cased-finetuned-squad2-es")
```

**Link**: https://huggingface.co/mrm8488/bert-base-spanish-wwm-cased-finetuned-squad2-es

---

### 7️⃣ **Para Sentiment Analysis (detectar quejas/problemas)**

```python
from transformers import pipeline

# Español
sentiment = pipeline("sentiment-analysis", model="finiteautomata/beto-sentiment-analysis")
```

**Link**: https://huggingface.co/finiteautomata/beto-sentiment-analysis

---

### 8️⃣ **Para Text Generation (respuestas automáticas) - ALTERNATIVA A OPENAI**

```python
from transformers import pipeline

# Modelo español generativo
generator = pipeline("text-generation", model="PlanTL-GOB-ES/gpt2-base-bne")

# O mejor aún (más grande):
# model="bigscience/bloom-560m"  # Multilingüe
```

**Links**:

- https://huggingface.co/PlanTL-GOB-ES/gpt2-base-bne (español)
- https://huggingface.co/bigscience/bloom-560m (multilingüe)

---

## 🎯 RECOMENDACIÓN TOP 3 PARA TU CASO

### **Para empezar mañana:**

1. **Franquicias**: `sentence-transformers/paraphrase-multilingual-mpnet-base-v2`
2. **Intents**: `joeddav/xlm-roberta-large-xnli`
3. **NER (extraer datos)**: `mrm8488/bert-spanish-cased-finetuned-ner`

---

## 📦 INSTALACIÓN RÁPIDA

```bash
pip install sentence-transformers transformers torch
```

```python
# Test rápido
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('paraphrase-multilingual-mpnet-base-v2')
embedding = model.encode("One Piece manga tomo 1")
print(embedding.shape)  # (768,)
```

---

**¿Necesitás algo más específico o con estos 8 modelos ya estás?** 🚀

Fuentes
