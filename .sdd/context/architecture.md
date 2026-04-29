# Architecture

Estado: BORRADOR
Última actualización: 2026-04-29

## Visión general

Aplicación web server-rendered con Express + EJS y scripts TypeScript en el cliente para interactividad. Single deployment en Render: un único Web Service Node sirve plantillas, assets estáticos compilados y endpoints API. Sin BBDD: los datos del juego viven en JSON estático y se cargan en memoria al arrancar.

```
┌──────────────────────────────────────────────────────────────────┐
│                       Render Web Service                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    Express 5 (TypeScript)                   │  │
│  │                                                             │  │
│  │  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐  │  │
│  │  │  EJS views  │   │  REST API    │   │ Static (public) │  │  │
│  │  │  /          │   │  /api/cards  │   │ /dist/*.js      │  │  │
│  │  │  /search    │   │  /api/fusions│   │ /dist/styles.css│  │  │
│  │  │  /calc      │   │  /api/chains │   │ /images/*       │  │  │
│  │  │  /about     │   │              │   │                 │  │  │
│  │  └─────────────┘   └──────────────┘   └─────────────────┘  │  │
│  │           ▲                ▲                                │  │
│  │           └────────┬───────┘                                │  │
│  │                    ▼                                         │  │
│  │              In-memory store                                 │  │
│  │       (Map<id, Card>, índices fusions/equips/results)        │  │
│  │                    ▲                                         │  │
│  │                    │ load on boot                            │  │
│  │              data/*.json (FS)                                │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS
                              │
                          Browser
                  (Tailwind CSS + TS bundles)
```

## Capas

### 1. Capa de datos (`src/server/data/`)

- **`store.ts`**: cargador. Lee `data/Cards.json`, `data/fusions.json`, `data/equips.json`, `data/results.json` al arranque y construye índices en memoria:
    - `cardsById: Map<number, Card>`
    - `cardsByName: Map<string, Card>` (lowercased)
    - `fusionsByCard: Map<number, FusionEntry[]>`
    - `equipsByCard: Map<number, number[]>`
    - `resultsByCard: Map<number, ResultEntry[]>`
- Carga única, sincrónica al arranque. Las request handlers leen del store sin I/O.
- El store es módulo singleton: una instancia exportada, no se reinicializa.

### 2. Capa de dominio (`src/server/domain/`)

Lógica pura, sin dependencias de Express ni de FS. Testeable de forma aislada.

- **`fusions.ts`**: dado un conjunto de cartas, encuentra fusiones inmediatas y **encadenadas** (profundidad ilimitada, optimizando por mayor ATK final). Algoritmo BFS/DFS con memoización por subconjunto consumido.
- **`equips.ts`**: emparejamiento de equips entre cartas de una mano.
- **`search.ts`**: búsqueda por nombre, por resultado, fuzzy.
- **`ranking.ts`**: ordenación de fusiones por métrica configurable (por defecto, mayor ATK final).

### 3. Capa HTTP (`src/server/http/`)

- **`routes/views.ts`**: rutas que renderizan EJS (`GET /`, `/search`, `/calculator`, `/about`).
- **`routes/api.ts`**: endpoints JSON.
    - `GET /api/cards/:id` — datos de una carta.
    - `GET /api/cards?name=...` — búsqueda por nombre.
    - `GET /api/fusions/:id` — fusiones inmediatas y resultados de una carta.
    - `POST /api/chains` — body con array de IDs y opciones; devuelve cadenas de fusión.
    - `GET /api/equips/:id` — equips relacionados.
- **`middleware/`**: pino-http, error handler, i18n resolver (lee cookie/`Accept-Language`).
- **`server.ts`**: composición — registra middlewares, monta routers, sirve `public/dist/` como estáticos, arranca en `process.env.PORT`.

### 4. Capa de presentación

- **Vistas EJS** (`views/`): plantillas con layouts y parciales. Cada página recibe del servidor el bundle de strings i18n correspondiente y los datos mínimos para el primer render.
- **Scripts cliente** (`src/client/`): TS compilado por Vite a `public/dist/`. Cada página tiene su entry. Se hidrata interactividad encima del HTML server-rendered.
- **Estilos**: Tailwind CSS compilado a `public/dist/styles.css`.

### 5. Capa compartida (`src/shared/`)

- **`types.ts`**: `Card`, `Fusion`, `Equip`, `ResultEntry`, `FusionChain`, etc. Importables por servidor y cliente.
- **`i18n/{es,en}.json`**: catálogos de traducciones.
- **`i18n/index.ts`**: helper `t(key, lang)` puro, sin dependencias de runtime, usable en ambos lados.

## Flujos principales

### Carga de datos al arranque

1. `server.ts` invoca `store.load()` antes de `app.listen`.
2. `store.load()` lee los JSON de `data/`, valida estructura mínima, construye índices.
3. Si la validación falla, el proceso aborta con código distinto de 0 (Render reintenta).

### Render de página (ej. `/calculator`)

1. Express resuelve idioma (cookie → `navigator.language` → fallback `es`).
2. Carga catálogo i18n correspondiente.
3. Renderiza `views/calculator.ejs` con `{ lang, t, csrfToken?, initialData }`.
4. El navegador descarga `public/dist/calculator.js` y `styles.css`.
5. El script de cliente hidrata: inicializa autocomplete, slots dinámicos, listeners.

### Búsqueda de fusiones encadenadas

1. Cliente envía `POST /api/chains` con `{ cards: [id1, id2, ...], options: { metric: "maxAtk" } }`.
2. Handler valida payload, delega a `domain/fusions.findChains(...)`.
3. Algoritmo explora combinaciones en profundidad ilimitada con memoización.
4. Respuesta: árbol/lista de cadenas ordenadas por la métrica seleccionada.
5. Cliente renderiza resultados.

### Cambio de idioma

1. Usuario pulsa selector en navbar.
2. Cliente escribe `lang` en `localStorage` y cookie, recarga la página.
3. Servidor lee cookie y devuelve la versión traducida.

## Decisiones arquitectónicas clave

- **Lógica de fusiones en servidor (4c)**: ahorra trabajar con datasets grandes (~720 cartas, ~miles de fusiones) en navegadores antiguos y centraliza la lógica en TS testeable. El cliente solo orquesta UI.
- **Lógica también disponible en cliente cuando es trivial**: búsqueda por nombre y emparejamiento simple pueden hacerse en cliente para feedback instantáneo. Las cadenas profundas siempre van al servidor.
- **No hay BBDD**: los datos del juego son inmutables. Reintroducir BBDD sería sobreingeniería mientras no haya estado de usuario persistido en servidor.
- **Persistencia futura (deck builder, favoritos)**: planificada en `localStorage` cliente. Solo si aparece sincronización entre dispositivos se reevaluará BBDD.
- **Sin SSR de datos pesados**: las páginas envían el HTML estructural pero los listados de cartas/fusiones se cargan vía API. Esto reduce tamaño del HTML y aprovecha cache HTTP.
- **No autenticación, no sesiones**.

## Dependencias entre capas

```
shared    ← cliente, servidor (ambos importan tipos e i18n)
servidor/data    ← servidor/domain
servidor/domain  ← servidor/http
servidor/http    ← server.ts
cliente          ← public/dist (output de Vite)
```

Regla: las dependencias fluyen hacia adentro. `domain` no importa de `http`. `data` no importa de `domain`. Si un import rompe esta dirección, es señal de mala factorización.

## Arranque y rendimiento (Render free)

- Cold start aceptable < 3 s. Carga de JSON in-memory medida y monitorizada.
- No se hacen operaciones bloqueantes después del `app.listen`.
- Endpoints de API responden con `Cache-Control: public, max-age=3600` cuando los datos no dependen del usuario.

## Observabilidad

- Logging estructurado con pino. Cada request tiene `reqId`, `method`, `url`, `statusCode`, `responseTime`.
- Sin APM externo por ahora. Logs de Render son suficientes mientras el tráfico sea bajo.

## Roadmap arquitectónico (no en alcance inmediato)

Funcionalidades que el diseño debe poder absorber sin reescritura mayor. Cada una requerirá su propia SPEC cuando se aborde:

- **Imágenes reales por carta**: nueva carpeta de assets en `public/images/cards/`. Carga lazy en cliente.
- **Filtros y orden por tipo/ATK/estrella**: añadir parámetros a `/api/cards`. Sin cambios estructurales.
- **Deck builder con localStorage**: módulo cliente nuevo, sin tocar servidor.
- **Vista detallada de carta**: nueva ruta `/card/:id` con su EJS y entry de Vite.
- **Búsqueda fuzzy**: librería ligera (`fuse.js`) en cliente o en servidor según volumen de queries.
- **Export/import de manos**: serializar/deserializar a string corto (base64 + IDs).
- **PWA offline**: añadir manifest + service worker. Los datos JSON se pueden cachear completos.

## Restricciones que vinculan futuras SPECs

- Toda nueva ruta de página debe seguir el patrón vista EJS + entry Vite + i18n.
- Toda nueva lógica del juego va en `src/server/domain/` con su test Vitest.
- Toda nueva clave de traducción debe existir en `es` y `en` antes de mergear.
- No se reintroduce jQuery, Bootstrap, TaffyDB ni Ruby.
