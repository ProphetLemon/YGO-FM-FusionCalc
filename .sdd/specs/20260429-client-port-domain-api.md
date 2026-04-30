# SPEC: client-port-domain-api

Fecha: 2026-04-29
Estado: COMPLETADO

Commits: d8a5bab (implementación), 2d574a7 (limpieza config/README), 7bb49b9 (estado APROBADO).
Despliegue verificado: https://ygo-fm-fusion-calc.onrender.com/

## Objetivo

Portar el cliente de [public/javascripts/fusionSearch.js](../../public/javascripts/fusionSearch.js) y [public/javascripts/fusionCalc.js](../../public/javascripts/fusionCalc.js) a TypeScript modular bajo `src/client/`, eliminar las dependencias legacy del navegador (jQuery, TaffyDB, Awesomplete, Bootstrap CSS/JS) y los datos derivados servidos como globales (`data/*.js`). Introducir las capas `src/server/domain/` y `src/server/data/` en el servidor, exponiendo endpoints REST mínimos (`/api/cards`, `/api/cards/:id`, `/api/fusions/:id`, `/api/results/:id`, `POST /api/calculator`) que el cliente consume vía `fetch`. Mantener paridad estricta de comportamiento con la versión actual; los cambios funcionales (slots dinámicos, fusiones encadenadas, imágenes por carta, etc.) se reservan para SPECs propias posteriores.

Este es el paso 3 de la migración acordada bajo Opción B en [.sdd/context/architecture.md](../context/architecture.md).

## Contexto

- Estado actual: tras [pages-to-ejs-i18n](20260429-pages-to-ejs-i18n.md) y [visual-recovery-tailwind-v2](20260429-visual-recovery-tailwind-v2.md), las páginas se renderizan con EJS + Tailwind, navegación e i18n funcionan, y `/search` y `/calculator` siguen apoyándose en el código legacy (`<script src="public/javascripts/...">` + `<script src="data/*.js">`). El servidor no tiene lógica de dominio ni endpoints API.
- Convenciones aplicables: [.sdd/context/conventions.md](../context/conventions.md). Estructura objetivo: [.sdd/context/structure.md](../context/structure.md).
- El despliegue de Render sigue siendo single web service en https://ygo-fm-fusion-calc.onrender.com/.

## Alcance

### 1. Capa de datos (`src/server/data/`)

- `src/server/data/store.ts`: módulo singleton que carga al arranque `data/Cards.json`, `data/fusions.json`, `data/equips.json`, `data/results.json` y los datos de tipos/estrellas. Construye índices en memoria:
    - `cardsById: Map<number, Card>`
    - `cardsByNameLower: Map<string, Card>`
    - `allCards: readonly Card[]`
    - `fusionsByCard: Map<number, FusionEntry[]>`
    - `equipsByCard: Map<number, number[]>`
    - `resultsByCard: Map<number, ResultEntry[]>`
    - `cardTypes: readonly string[]`
    - `cardStars: readonly string[]`
- `src/server/data/validators.ts`: validación mínima de los JSON al arranque (estructura, tipos, no vacíos). Si falla, el proceso aborta antes de `app.listen` con un error `pino` en `fatal`.
- `src/shared/types-and-stars.json`: extracto de los strings de `data/types_and_stars.js` portados a JSON. Importable desde server.

### 2. Capa de dominio (`src/server/domain/`)

Lógica pura, sin Express ni FS. Toda función testeable de forma aislada con fixtures.

- `src/server/domain/cards.ts`: helpers `isMonster(card)`, `toCardSummary(card)`.
- `src/server/domain/search.ts`: `findCardByExactName(name)`, `findCardsByPrefix(prefix, limit)`.
- `src/server/domain/fusions.ts`: `getFusionsFor(id)`, `getResultsFor(id)`. Devuelven entries expandidos (con tarjetas resueltas a `CardSummary`).
- `src/server/domain/equips.ts`: `getEquipsFor(id)` devuelve lista de `CardSummary`.
- `src/server/domain/calculator.ts`: `findCombinations(handIds)` devuelve `{ fusions, equips }` con todas las combinaciones inmediatas entre las cartas de la mano. Sin profundidad encadenada (esa entra en SPEC futura).

### 3. Tipos compartidos (`src/shared/types.ts`)

- `Card`: espeja la forma de `Cards.json` (PascalCase, mantenido por compatibilidad de la fuente): `Id`, `Name`, `Description`, `Type`, `Attack`, `Defense`, `Stars`, `CardCode`, `Fusions`, `Equip`.
- `FusionEntry`: `{ card: number; result: number }`.
- `ResultEntry`: `{ card1: number; card2: number }`.
- `CardSummary`: forma camelCase usada por API y cliente — `{ id, name, description, type, attack, defense, stars, password, isMonster }`. Sin `Fusions` ni `Equip` para mantener payload pequeño.
- `FusionExpanded`: `{ card1: CardSummary; card2: CardSummary; result: CardSummary }`.
- `ResultExpanded`: `{ card1: CardSummary; card2: CardSummary }`.
- `EquipExpanded`: `{ card1: CardSummary; card2: CardSummary }`.
- `CalculatorResponse`: `{ fusions: FusionExpanded[]; equips: EquipExpanded[] }`.

### 4. Endpoints REST (`src/server/http/routes/api.ts`)

Todos JSON, prefijo `/api`. Errores con shape `{ error: { code, message } }`.

- `GET /api/cards-index` → `{ cards: Array<{ id, name, type }> }` para autocomplete cliente. Cacheable.
- `GET /api/cards/:id` → `CardSummary` o 404.
- `GET /api/cards?name=...` → `CardSummary` o 404 (búsqueda exacta case-insensitive). Una sola carta.
- `GET /api/fusions/:id` → `{ fusions: FusionExpanded[]; equips: EquipExpanded[] }` o 404.
- `GET /api/results/:id` → `{ results: ResultExpanded[] }` (vacío si no hay).
- `POST /api/calculator` body `{ handIds: number[] }` → `CalculatorResponse`. Valida que los IDs existan; si alguno no existe responde 400 con detalle.

### 5. Cliente TypeScript (`src/client/`)

- `src/client/lib/api.ts`: cliente tipado con `fetch`. Funciones: `getCardsIndex()`, `getCard(id)`, `getCardByName(name)`, `getFusions(id)`, `getResults(id)`, `calculate(handIds)`. `getCardsIndex` cachea en `sessionStorage`.
- `src/client/lib/dom.ts`: helpers `qs<T>(sel)`, `qsa<T>(sel)`, `setHTML(el, html)` con sanitización mínima (no hace falta si controlamos los strings).
- `src/client/lib/storage.ts`: helpers tipados sobre `sessionStorage` y `localStorage`.
- `src/client/components/autocomplete.ts`: clase `Autocomplete` que recibe `(input, options)` con `options.list: () => Promise<string[]>`, `options.onSelect(value)`. Renderiza dropdown con filtrado `startsWith` (case-insensitive). Soporta teclado (ArrowDown, ArrowUp, Enter, Escape, Tab) y atributos ARIA (`role="combobox"`, `aria-controls`, `aria-activedescendant`). Estilable con Tailwind.
- `src/client/components/card-display.ts`: render de `CardSummary` como tarjeta visual (sustituye `createSideCard` legacy).
- `src/client/components/fusion-card.ts`: render de `FusionExpanded` (sustituye `fusesToHTML`).
- `src/client/components/equip-card.ts`: render de `EquipExpanded`.
- `src/client/pages/search.ts`: monta navbar + autocomplete sobre `#cardname`. Listeners para `#search-name-btn`, `#search-results-btn`, `#reset-btn`. Renderiza resultados a `#outputcard`, `#output-area-left`, `#output-area-right`, mensajes a `#search-msg`. Usa `api.getCardByName` y `api.getFusions/getResults`.
- `src/client/pages/calculator.ts`: monta navbar + 5 instancias de Autocomplete sobre `#hand1..#hand5`. Al cambiar cualquier input, recopila los IDs válidos y llama a `api.calculate(handIds)`. Renderiza fusiones y equipos a `#outputarealeft` y `#outputarearight`. Listener para `#resetBtn`.

### 6. i18n para los strings dinámicos del cliente

- Añadir claves a `src/shared/i18n/{es,en}.json`:
    - `search.error.empty` (ya existe — reusar).
    - `search.error.not-found` (ya existe — reusar; toma `{{name}}`).
    - `search.results.fusions` (ya existe).
    - `search.results.equips` (ya existe).
    - `calculator.results.fusions` (ya existe).
    - `calculator.results.equips` (ya existe).
    - `card.label.atk-def`, `card.label.type`, `card.label.stars`, `card.label.password`, `card.label.input`, `card.label.result`, `card.label.description` — etiquetas dentro de las tarjetas. Nuevas.
- Las plantillas EJS exportan a cliente el catálogo del idioma actual via `<script type="application/json" id="i18n">`. El cliente lee y construye un helper `t(key, vars)` local.

### 7. Eliminación de assets legacy

Se eliminan del repositorio:

- `public/javascripts/jquery-3.5.1.min.js`
- `public/javascripts/awesomplete.min.js`
- `public/javascripts/taffy.js`
- `public/javascripts/bootstrap.bundle.min.js`
- `public/javascripts/fusionCalc.js`
- `public/javascripts/fusionSearch.js`
- `public/javascripts/test.js`
- `public/styles/awesomplete.css`
- `public/styles/bootstrap.min.css`
- `public/styles/normalize.css`
- `public/styles/home.css`
- `public/styles/fusioncustom.css`
- `data/cards.js`
- `data/fusions.js`
- `data/equips.js`
- `data/results.js`
- `data/types_and_stars.js`

Las carpetas `public/javascripts/` y `public/styles/` quedan vacías o se eliminan. Los `.json` en `data/` permanecen (siguen siendo la fuente de verdad).

### 8. Configuración y rutas

- `src/server/http/routes/views.ts`: eliminar `LEGACY_SEARCH_STYLES`, `LEGACY_SEARCH_SCRIPTS`, `LEGACY_CALCULATOR_STYLES`, `LEGACY_CALCULATOR_SCRIPTS`. Las rutas `/search` y `/calculator` ya no inyectan ningún estilo o script legacy.
- `src/server/app.ts`: registrar el router de `/api/`. Inicializar `store` antes de `app.listen`.
- `tailwind.config.ts`: eliminar `"./public/javascripts/fusion*.js"` del `content` (esos archivos desaparecen).
- `.prettierignore`: eliminar entradas `public/javascripts/` y `public/styles/` (carpetas vacías o eliminadas).
- Reescribir scripts Ruby a TS: **fuera de alcance** (SPEC propia futura). Los `.rb` siguen presentes pero no se invocan.

### 9. Tests

- **Unitarios** (Vitest, supertest):
    - `tests/unit/server/data/store.test.ts`: carga e índices.
    - `tests/unit/server/domain/cards.test.ts`, `search.test.ts`, `fusions.test.ts`, `equips.test.ts`, `calculator.test.ts`.
    - `tests/unit/server/http/api-cards.test.ts`, `api-fusions.test.ts`, `api-results.test.ts`, `api-calculator.test.ts`, `api-cards-index.test.ts`.
    - Cobertura ≥ 80% en `src/server/**` y `src/shared/**`.
- **E2E** (Playwright):
    - `tests/e2e/search-functional.spec.ts`: cargar `/search`, escribir `Blue-Eyes White Dragon`, seleccionar, ver tarjeta + lista de fusiones (al menos una) + lista de equipos.
    - `tests/e2e/calculator-functional.spec.ts`: cargar `/calculator`, llenar dos inputs con cartas que se fusionan conocidas, ver una fusión renderizada.
    - Las suites existentes (`navigation.spec.ts`, `visual.spec.ts`) siguen verdes sin cambios.

### 10. README

- Marcar el ítem "Port client scripts to TypeScript modules; remove jQuery, Bootstrap and TaffyDB" como hecho en el roadmap.
- Eliminar la nota "Project Notes (transitional state)" sobre los assets legacy (ya no aplica).

## Fuera de alcance

- Slots dinámicos (>5) en calculator: SPEC propia.
- Fusiones encadenadas (profundidad ilimitada con backtracking): SPEC propia.
- Imágenes reales por carta.
- Filtros y orden por tipo / ATK / estrella.
- Deck builder con `localStorage`.
- Vista detallada por carta (`/card/:id`).
- Búsqueda fuzzy.
- Export / import de manos.
- PWA / offline.
- Reescritura de scripts Ruby a TS.
- Cualquier mejora de UX no presente en la versión actual (paridad estricta).

## Criterios de aceptación

1. **Build**: `npm run build` exit 0.
2. **Typecheck**: `npm run typecheck` exit 0.
3. **Tests unitarios**: `npm test` exit 0 con cobertura ≥ 80% en cada métrica sobre `src/server/**` y `src/shared/**`.
4. **Tests E2E**: `npm run test:e2e` exit 0, incluyendo los dos nuevos funcionales.
5. **Sin assets legacy**: `git ls-files public/javascripts public/styles data/cards.js data/fusions.js data/equips.js data/results.js data/types_and_stars.js` devuelve cadena vacía.
6. **HTML servido limpio**: ninguna ruta carga `/public/javascripts/*.js` ni `/public/styles/*.css` que no sea `/public/dist/styles.css`.
7. **`/search` funcional**: autocomplete sugiere cartas mientras se escribe, seleccionar muestra ficha de carta, fusiones y equipos. Búsqueda por resultado muestra las parejas que producen la carta. Mensajes de error i18n.
8. **`/calculator` funcional**: cinco inputs con autocomplete; al cambiar inputs aparece la lista de fusiones (ordenadas por ATK descendente como el legacy) y equipos. Reset limpia inputs y resultados.
9. **Endpoints API**: cada endpoint responde con shape esperado, 200/404/400 correctos, JSON tipado.
10. **i18n preservada**: claves nuevas en `es.json` y `en.json` con paridad. Test específico verde.
11. **Render verde**: tras push, Render reconstruye y `/search`, `/calculator` funcionan en la URL pública. Sin 404 en assets, sin errores en consola del navegador.

## Impacto en contratos

- **API**: aparecen 6 endpoints nuevos bajo `/api/`. Sin versión previa, no hay breaking change.
- **Modelo de datos**: los JSON de `data/` no se modifican. Se eliminan los `.js` derivados.
- **Frontend-backend**: el cliente deja de leer datos vía globals JS y pasa a `fetch` contra la API. URLs públicas (`/`, `/search`, `/calculator`, `/about`, `POST /lang`) no cambian. Cookie `lang` sin cambios.
- **Hosting**: Render sigue siendo single deployment.

## Riesgos y supuestos

**Riesgos**

1. **Paridad estricta de orden**: el legacy `fusionCalc.js` ordenaba fusiones por ATK descendente. Cualquier discrepancia visual será visible. Mitigación: test específico que verifica el orden contra fixtures conocidas.
2. **Autocomplete propio sin librería**: existencia de bugs sutiles en navegación por teclado o en cierre del dropdown al perder foco. Mitigación: test E2E que ejerce keyboard nav y comportamiento básico.
3. **Tamaño de `cards-index`**: ~720 cartas × ~50 bytes = ~35 KB. Aceptable, cacheable en sessionStorage.
4. **Cold start de Render** crece ligeramente al cargar JSON e índices. Sub-3 s sigue siendo aceptable.
5. **Eliminación de assets**: si algún navegador antiguo conserva HTML cacheado del paso 2 que referencie las URLs viejas, recibirá 404. Render servirá 404 limpios en lugar de los archivos. Aceptable: la cookie/cache se invalida con un refresh.

**Supuestos**

- `data/Cards.json`, `data/fusions.json`, `data/equips.json`, `data/results.json` están bien formados y completos. Si no, el arranque falla — comportamiento aceptable.
- Las claves i18n añadidas no rompen plantillas EJS existentes.
- No hay otros consumidores externos de los `data/*.js` ni de los archivos en `public/javascripts/`. Eliminarlos no rompe integraciones de terceros (el repo es un fork público; nadie depende de URLs internas).
- La estructura de `Card` (PascalCase) basta para todos los usos y no hace falta un mapping a camelCase global; usamos `CardSummary` solo en la frontera API ↔ cliente.
