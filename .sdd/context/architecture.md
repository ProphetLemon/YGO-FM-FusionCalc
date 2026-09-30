# Architecture

Estado: BORRADOR
Última actualización: 2026-09-30

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
│  │  │  /          │   │  /api/cards  │   │ /public/dist/   │  │  │
│  │  │  /search    │   │  /api/fusions│   │ /public/images/ │  │  │
│  │  │  /calculator│   │  /api/...    │   │                 │  │  │
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

- **`store.ts`**: cargador. Lee `data/Cards.json`, `data/fusions.json`, `data/equips.json`, `data/results.json` al arranque, los valida con `validators.ts` y construye índices en memoria:
    - `cardsById: Map<number, Card>`
    - `cardsByNameLower: Map<string, Card>` (nombre en minúsculas)
    - `cardIndex`: lista `{ id, name, type }` ordenada por nombre (autocompletado)
    - `fusionsByCard: Map<number, FusionIndexEntry[]>`
    - `fusionResults: Map<number, Map<number, number>>` (resultado de un par en O(1); lo usa la búsqueda de cadenas)
    - `equipsByCard: Map<number, number[]>`
    - `resultsByCard: Map<number, ResultEntry[]>`
    - `ritualRecipes`: las recetas `Ritual` de `Cards.json`
- Carga única, sincrónica al arranque. Las request handlers leen del store sin I/O.
- El store es módulo singleton: una instancia exportada, no se reinicializa.

### 2. Capa de dominio (`src/server/domain/`)

Lógica pura, sin dependencias de Express ni de FS. Testeable de forma aislada.

- **`fusions.ts`**: fusiones y equips de una carta concreta.
- **`calculator.ts`**: fusiones, equips y rituales de una mano.
- **`chain-search.ts`**: cadenas de fusiones de una mano. Búsqueda en anchura sobre los estados de la mano (multiconjunto de cartas): una cadena por monstruo final, la de menos pasos, y devuelve las 5 mejores por ATK y luego por menos pasos. Se detiene al agotar `MAX_CHAIN_STATES` (respuesta `truncated`). Ver `.sdd/specs/20260501-chained-fusion-search.md`.
- **`rituals.ts`**: rituales completos presentes en una mano.
- **`equips.ts`**, **`results.ts`**: equips de una carta y pares que producen una carta.
- **`search.ts`**: búsqueda por nombre exacto y por prefijo.
- **`cards.ts`**: `toCardSummary` (incluye `imageCode`) e `isMonster`.

### 3. Capa HTTP (`src/server/http/`)

- **`routes/views.ts`**: rutas que renderizan EJS (`GET /`, `/search`, `/calculator`, `/about`).
- **`routes/api.ts`**: endpoints JSON.
    - `GET /api/cards/:id` — datos de una carta.
    - `GET /api/cards?name=...` — carta por nombre exacto.
    - `GET /api/cards-index` — `id`, nombre y tipo de todas las cartas (autocompletado).
    - `GET /api/fusions/:id` — fusiones y equips de una carta.
    - `GET /api/results/:id` — pares que producen una carta.
    - `GET /api/equips/:id` — equips relacionados.
    - `POST /api/calculator` — body `{ handIds }`; devuelve `{ fusions, equips, rituals }`.
    - `POST /api/chain-search` — body `{ handIds }`; devuelve `{ chains, truncated }`.
    - Los dos `POST` validan la mano igual: array de enteros positivos (`400 invalid-hand`) y como máximo `MAX_HAND_SIZE` = 12 (`400 hand-too-large`). Un JSON mal formado da `400 invalid-json` y un cuerpo de más de 32 kB, `413 payload-too-large`.
- **`routes/lang.ts`** y **`routes/legacy.ts`**: `POST /lang` (cookie de idioma) y redirecciones 301 de las URLs `.html` antiguas.
- **`middleware/i18n.ts`**: resuelve el idioma (cookie `lang`, luego `Accept-Language`, luego `es`).
- **`assets.ts`**: URLs de los bundles de Vite según su manifiesto.
- **`app.ts`**: composición — registra pino-http, cookies e i18n, sirve `public/` y `data/` como estáticos, monta los routers y el manejador de errores. **`index.ts`**: arranca en `PORT`.

### 4. Capa de presentación

- **Vistas EJS** (`views/`): plantillas con layouts y parciales. Cada página recibe del servidor el bundle de strings i18n correspondiente y los datos mínimos para el primer render.
- **Scripts cliente** (`src/client/`): TS compilado por Vite a `public/dist/`. Cada página tiene su entry. Se hidrata interactividad encima del HTML server-rendered.
- **Estilos**: Tailwind CSS compilado a `public/dist/styles.css`.

### 5. Capa compartida (`src/shared/`)

- **`types.ts`**: `Card`, `CardSummary`, `FusionExpanded`, `EquipExpanded`, `RitualExpanded`, `ChainResult`, etc. Importables por servidor y cliente.
- **`limits.ts`**: `MAX_HAND_SIZE`, el tope de la mano que comparten la API y el botón «Añadir carta».
- **`card-image-overrides.json`**: id de carta → contraseña real de su imagen (ver `.sdd/specs/20260501-card-images.md`).
- **`i18n/{es,en}.json`**: catálogos de traducciones.
- **`i18n/index.ts`**: helper `translate(key, lang, vars)` puro, sin dependencias de runtime, más `isLang` y `parseAcceptLanguage`. Solo lo importa el servidor: el cliente lee el catálogo ya resuelto del bloque `#i18n-bootstrap` con su propio `t()` (`src/client/lib/i18n.ts`).

## Flujos principales

### Carga de datos al arranque

1. `index.ts` crea la app con `createApp()`, que invoca `loadStore()` antes de `app.listen`.
2. `loadStore()` lee los JSON de `data/`, valida estructura mínima, construye índices.
3. Si la validación falla, `loadStore()` lanza una excepción que nadie captura y el proceso aborta con código distinto de 0 (Render reintenta).

### Render de página (ej. `/calculator`)

1. Express resuelve idioma (cookie `lang` → cabecera `Accept-Language` → fallback `es`).
2. Carga catálogo i18n correspondiente.
3. Renderiza `views/layouts/main.ejs`, que incluye `views/calculator.ejs`, con `lang`, `t`, `catalog` y las opciones de la página (`contentView`, `pageScripts`, etc.). El catálogo viaja al cliente en el bloque JSON `#i18n-bootstrap`.
4. El navegador descarga el bundle de la página (su URL sale del manifiesto de Vite) y `/public/dist/styles.css`.
5. El script de cliente hidrata: inicializa autocomplete, slots dinámicos, listeners.

### Búsqueda de fusiones encadenadas

1. Cliente envía `POST /api/chain-search` con `{ handIds: [id1, id2, ...] }` al pulsar «Calcular cadena».
2. Handler valida la mano (`invalid-hand`, `hand-too-large`) y delega a `domain/chain-search.findBestChains(...)`.
3. Algoritmo explora en anchura los estados de la mano (cada fusión de un par sustituye las dos cartas por su resultado), con memoización por estado y un presupuesto de estados (`MAX_CHAIN_STATES`).
4. Respuesta: `{ chains, truncated }`, con hasta 5 cadenas (una por monstruo final, la de menos pasos) ordenadas por ATK final y luego por menos pasos. `truncated` es `true` si se agotó el presupuesto.
5. Cliente renderiza cada paso con su artwork y el resultado final resaltado, y avisa si la búsqueda fue parcial.

### Cambio de idioma

1. Usuario pulsa selector en navbar (un formulario `POST /lang`).
2. El servidor guarda la cookie `lang` (un año) y redirige (303) a la página de origen.
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
shared    ← cliente, servidor (ambos importan tipos y constantes; solo el servidor importa el i18n)
servidor/data    ← servidor/domain
servidor/domain  ← servidor/http
servidor/http    ← app.ts ← index.ts
cliente          ← public/dist (output de Vite)
```

Regla: las dependencias fluyen hacia adentro. `domain` no importa de `http`. `data` no importa de `domain`. Si un import rompe esta dirección, es señal de mala factorización.

## Arranque y rendimiento (Render free)

- Cold start aceptable < 3 s. Carga de JSON in-memory medida y monitorizada.
- No se hacen operaciones bloqueantes después del `app.listen`.
- Objetivo aún sin implementar: los endpoints de API cuyos datos no dependen del usuario responderán con `Cache-Control: public, max-age=3600`.

## Observabilidad

- Logging estructurado con pino. Cada request tiene `reqId`, `method`, `url`, `statusCode`, `responseTime`.
- Sin APM externo por ahora. Logs de Render son suficientes mientras el tráfico sea bajo.

## Roadmap arquitectónico (no en alcance inmediato)

Funcionalidades que el diseño debe poder absorber sin reescritura mayor. Cada una requerirá su propia SPEC cuando se aborde:

- **Imágenes reales por carta** (hecho con el CDN de YGOProDeck, sin alojarlas): carga lazy en cliente con `src/client/lib/card-image.ts`; ver `.sdd/specs/20260501-card-images.md`. Alojarlas en `public/images/cards/` sigue pendiente.
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
