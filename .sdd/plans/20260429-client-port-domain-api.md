# PLAN: client-port-domain-api

SPEC: [.sdd/specs/20260429-client-port-domain-api.md](../specs/20260429-client-port-domain-api.md)
Estado: APROBADO

## Archivos a modificar

Lista cerrada.

- [src/server/app.ts](../../src/server/app.ts) — invocar `store.load()` antes de exponer rutas; registrar `apiRouter()` después del middleware i18n y antes de los routers de vistas.
- [src/server/http/routes/views.ts](../../src/server/http/routes/views.ts) — eliminar `LEGACY_SEARCH_STYLES`, `LEGACY_SEARCH_SCRIPTS`, `LEGACY_CALCULATOR_STYLES`, `LEGACY_CALCULATOR_SCRIPTS`. Las rutas `/search` y `/calculator` solo declaran su entry de Vite.
- [src/shared/types.ts](../../src/shared/types.ts) — sustituir el `export {};` por las definiciones de `Card`, `FusionEntry`, `ResultEntry`, `CardSummary`, `FusionExpanded`, `ResultExpanded`, `EquipExpanded`, `CalculatorResponse`.
- [src/shared/i18n/es.json](../../src/shared/i18n/es.json) y [src/shared/i18n/en.json](../../src/shared/i18n/en.json) — añadir claves `card.label.atk-def`, `card.label.type`, `card.label.stars`, `card.label.password`, `card.label.input`, `card.label.result`, `card.label.description`. Paridad asegurada por test.
- [src/client/pages/search.ts](../../src/client/pages/search.ts) — reescribir: monta navbar, autocomplete y la lógica de búsqueda contra la API.
- [src/client/pages/calculator.ts](../../src/client/pages/calculator.ts) — reescribir: monta navbar, 5 autocompletes, llama a `/api/calculator` al cambiar inputs.
- [tailwind.config.ts](../../tailwind.config.ts) — quitar `"./public/javascripts/fusion*.js"` del array `content`.
- [.prettierignore](../../.prettierignore) — quitar `public/javascripts/` y `public/styles/` (las carpetas dejan de existir).
- [README.md](../../README.md) — marcar el ítem "Port client scripts to TypeScript modules" como hecho. Eliminar la sección "Project Notes (transitional state)".
- [views/partials/head.ejs](../../views/partials/head.ejs) — incluir el partial `i18n-bootstrap` (script JSON con el catálogo activo) antes del `<script type="module">` que carga el bundle de página.
- [views/layouts/main.ejs](../../views/layouts/main.ejs) — pasar `lang` y `t` al partial de scripts si fuera necesario (el render ya tiene `lang` y `t` en `locals`; basta con asegurar que el partial nuevo los recibe).

## Archivos a eliminar

- [public/javascripts/jquery-3.5.1.min.js](../../public/javascripts/jquery-3.5.1.min.js)
- [public/javascripts/awesomplete.min.js](../../public/javascripts/awesomplete.min.js)
- [public/javascripts/taffy.js](../../public/javascripts/taffy.js)
- [public/javascripts/bootstrap.bundle.min.js](../../public/javascripts/bootstrap.bundle.min.js)
- [public/javascripts/fusionCalc.js](../../public/javascripts/fusionCalc.js)
- [public/javascripts/fusionSearch.js](../../public/javascripts/fusionSearch.js)
- [public/javascripts/test.js](../../public/javascripts/test.js)
- [public/styles/awesomplete.css](../../public/styles/awesomplete.css)
- [public/styles/bootstrap.min.css](../../public/styles/bootstrap.min.css)
- [public/styles/normalize.css](../../public/styles/normalize.css)
- [public/styles/home.css](../../public/styles/home.css)
- [public/styles/fusioncustom.css](../../public/styles/fusioncustom.css)
- [data/cards.js](../../data/cards.js)
- [data/fusions.js](../../data/fusions.js)
- [data/equips.js](../../data/equips.js)
- [data/results.js](../../data/results.js)
- [data/types_and_stars.js](../../data/types_and_stars.js)

Las carpetas `public/javascripts/` y `public/styles/` quedarán vacías y se eliminan también.

## Archivos nuevos

Verificado que ninguno existe ya.

### Datos compartidos

- `src/shared/types-and-stars.json` — extracto de los strings de tipos y estrellas portados desde `data/types_and_stars.js`.

### Servidor (`src/server/`)

- `src/server/data/store.ts` — cargador singleton. Carga `Cards.json`, `fusions.json`, `equips.json`, `results.json`, `src/shared/types-and-stars.json`. Construye e indexa.
- `src/server/data/validators.ts` — `validateCardsJson`, `validateFusionsJson`, `validateEquipsJson`, `validateResultsJson`. Lanzan en formato inválido.
- `src/server/domain/cards.ts` — `isMonster(card)`, `toCardSummary(card)`.
- `src/server/domain/search.ts` — `findCardByExactName(name)`, `findCardsByPrefix(prefix, limit)`.
- `src/server/domain/fusions.ts` — `getFusionsFor(id)`, retorna `{ fusions: FusionExpanded[]; equips: EquipExpanded[] }` resolviendo IDs a `CardSummary`.
- `src/server/domain/equips.ts` — `getEquipsFor(id)` (lista de `CardSummary`).
- `src/server/domain/results.ts` — `getResultsFor(id)`, retorna `ResultExpanded[]`.
- `src/server/domain/calculator.ts` — `findCombinations(handIds)`, retorna `CalculatorResponse` con fusiones ordenadas por `result.attack` descendente.
- `src/server/http/routes/api.ts` — Router con los 6 endpoints definidos en la SPEC. Validación de parámetros, error handling consistente.

### Cliente (`src/client/`)

- `src/client/lib/api.ts` — wrappers tipados sobre `fetch`. Funciones `getCardsIndex`, `getCard`, `getCardByName`, `getFusions`, `getResults`, `calculate`. `getCardsIndex` lee/escribe `sessionStorage["cards-index"]`.
- `src/client/lib/dom.ts` — `qs<T>(sel, root?)`, `qsa<T>(sel, root?)`, `setText(el, value)`, `clear(el)`.
- `src/client/lib/storage.ts` — `readJson<T>(storage, key, fallback)`, `writeJson<T>(storage, key, value)`.
- `src/client/lib/i18n.ts` — lee `<script id="i18n">` del DOM, expone `t(key, vars)` con la misma sintaxis que el helper del servidor (interpolación `{{var}}`).
- `src/client/components/autocomplete.ts` — clase `Autocomplete` (input HTMLInputElement, options { fetchList, onSelect }). Implementa filtrado `startsWith` con normalización lowercase, navegación por teclado, click selection, ARIA básico.
- `src/client/components/card-display.ts` — `renderCardSummary(card, t): HTMLElement`.
- `src/client/components/fusion-card.ts` — `renderFusion(entry, t): HTMLElement` (acepta `FusionExpanded` o `EquipExpanded`).
- `src/client/components/equip-card.ts` — `renderEquip(entry, t): HTMLElement`. (Si comparte 90% con fusion-card, lo unificamos en uno con un parámetro `withResult: boolean`.)

### Vistas

- `views/partials/i18n-bootstrap.ejs` — `<script type="application/json" id="i18n">{ "lang": ..., "messages": { ... } }</script>` inyectado por el layout.

### Tests

- `tests/fixtures/sample-cards.json` — subset pequeño (5-10 cartas con fusiones conocidas) para unit tests deterministas.
- `tests/fixtures/sample-fusions.json`, `sample-equips.json`, `sample-results.json`.
- `tests/unit/server/data/store.test.ts`
- `tests/unit/server/domain/cards.test.ts`
- `tests/unit/server/domain/search.test.ts`
- `tests/unit/server/domain/fusions.test.ts`
- `tests/unit/server/domain/equips.test.ts`
- `tests/unit/server/domain/calculator.test.ts`
- `tests/unit/server/domain/results.test.ts`
- `tests/unit/server/http/api-cards.test.ts`
- `tests/unit/server/http/api-cards-index.test.ts`
- `tests/unit/server/http/api-fusions.test.ts`
- `tests/unit/server/http/api-results.test.ts`
- `tests/unit/server/http/api-calculator.test.ts`
- `tests/e2e/search-functional.spec.ts`
- `tests/e2e/calculator-functional.spec.ts`

## Pasos de implementación

### Paso 1 — Tipos compartidos y datos auxiliares

1.1. Reemplazar el contenido de `src/shared/types.ts` con todas las definiciones (`Card`, `FusionEntry`, `ResultEntry`, `CardSummary`, `FusionExpanded`, `ResultExpanded`, `EquipExpanded`, `CalculatorResponse`).
1.2. Crear `src/shared/types-and-stars.json` con los arrays portados de `data/types_and_stars.js`.
1.3. Ejecutar `npm run typecheck`. Verde.

### Paso 2 — Store y validadores

2.1. Crear `src/server/data/validators.ts` con validaciones mínimas de cada JSON.
2.2. Crear `src/server/data/store.ts` con `load()` síncrono y getters por índice. Singleton exportado.
2.3. Modificar `src/server/app.ts` para llamar a `store.load()` antes de devolver el `app`. Si lanza, propaga (Render reintenta).
2.4. Crear `tests/fixtures/*.json` y `tests/unit/server/data/store.test.ts`. Ejecutar `npm test`. Verde.

### Paso 3 — Capa de dominio

3.1. Crear `src/server/domain/cards.ts`.
3.2. Crear `src/server/domain/search.ts`.
3.3. Crear `src/server/domain/fusions.ts`.
3.4. Crear `src/server/domain/equips.ts`.
3.5. Crear `src/server/domain/results.ts`.
3.6. Crear `src/server/domain/calculator.ts`.
3.7. Crear los tests unitarios correspondientes en `tests/unit/server/domain/`. Ejecutar `npm test`. Verde con cobertura ≥ 80%.

### Paso 4 — API REST

4.1. Crear `src/server/http/routes/api.ts` con los 6 endpoints. Cada handler delega al dominio y formatea la respuesta.
4.2. Registrar `apiRouter()` en `src/server/app.ts` después del middleware i18n.
4.3. Crear los tests `tests/unit/server/http/api-*.test.ts` con supertest contra `createApp()`. Verificar 200/404/400. Ejecutar `npm test`. Verde.

### Paso 5 — i18n bootstrap en cliente

5.1. Añadir las claves nuevas a `src/shared/i18n/es.json` y `en.json`.
5.2. Crear `views/partials/i18n-bootstrap.ejs` que renderiza `<script type="application/json" id="i18n">` con `{ lang, messages }`. `messages` se construye iterando todas las claves del catálogo activo.
5.3. Modificar `views/partials/head.ejs` (o `layouts/main.ejs`) para incluir el partial antes de los scripts de página.
5.4. Crear `src/client/lib/i18n.ts` que lee el JSON, expone `t(key, vars)`.
5.5. Verificar manualmente con `curl` que el `<script id="i18n">` aparece en la respuesta.

### Paso 6 — Cliente: lib y componentes

6.1. Crear `src/client/lib/dom.ts`, `src/client/lib/storage.ts`, `src/client/lib/api.ts`.
6.2. Crear `src/client/components/autocomplete.ts`.
6.3. Crear `src/client/components/card-display.ts`, `src/client/components/fusion-card.ts`, `src/client/components/equip-card.ts`.
6.4. Verificar `npm run typecheck` (cliente). Verde.

### Paso 7 — Cliente: páginas

7.1. Reescribir `src/client/pages/search.ts`. Reusa la estructura DOM existente (`#cardname`, `#outputcard`, etc.). Conecta autocomplete + listeners + render.
7.2. Reescribir `src/client/pages/calculator.ts`. Cinco autocompletes sobre `#hand1..#hand5`. Botón reset.
7.3. Ejecutar `npm run build:client`. Verificar manifest y bundles generados.

### Paso 8 — Vistas y rutas: limpieza de legacy

8.1. Modificar `src/server/http/routes/views.ts`: eliminar `LEGACY_*_STYLES`, `LEGACY_*_SCRIPTS`. Cada ruta solo registra su `pages/<page>.ts` bundle.
8.2. Verificar con `curl` que `/search` y `/calculator` no incluyen referencias a archivos legacy.

### Paso 9 — Eliminación de archivos legacy

9.1. `git rm public/javascripts/{jquery-3.5.1.min.js,awesomplete.min.js,taffy.js,bootstrap.bundle.min.js,fusionCalc.js,fusionSearch.js,test.js}`.
9.2. `git rm public/styles/{awesomplete.css,bootstrap.min.css,normalize.css,home.css,fusioncustom.css}`.
9.3. `git rm data/{cards.js,fusions.js,equips.js,results.js,types_and_stars.js}`.
9.4. Verificar carpetas `public/javascripts/` y `public/styles/` vacías; eliminar.

### Paso 10 — Configuración

10.1. Modificar `tailwind.config.ts`: eliminar `"./public/javascripts/fusion*.js"` del array `content`.
10.2. Modificar `.prettierignore`: eliminar `public/javascripts/` y `public/styles/`. Mantener `data/`, `*.min.js`, `*.min.css` (genéricos por si reaparecen).
10.3. Modificar `README.md`: marcar el roadmap. Eliminar "Project Notes (transitional state)".

### Paso 11 — Tests E2E funcionales

11.1. Crear `tests/e2e/search-functional.spec.ts`: navega a `/search`, escribe nombre conocido (e.g. "Blue-Eyes White Dragon"), selecciona, verifica que la ficha aparece con stats y que al menos una fusión se renderiza.
11.2. Crear `tests/e2e/calculator-functional.spec.ts`: navega a `/calculator`, llena `hand1` y `hand2` con cartas que se fusionan conocidas (de los datos reales), verifica que aparece una fusión renderizada en `#outputarealeft`.
11.3. Ejecutar `npm run test:e2e`. Toda la suite verde.

### Paso 12 — Validación local completa

12.1. `rm -rf node_modules dist public/dist coverage playwright-report test-results`.
12.2. `npm ci`.
12.3. `npm run typecheck`.
12.4. `npm run build`.
12.5. `npm test` con cobertura ≥ 80%.
12.6. `npm run test:e2e`.
12.7. `npm run format:check`.
12.8. `npm start` y validación manual del usuario en navegador.

### Paso 13 — Commit y push

13.1. Tres commits a `master`:

- `feat(domain,api,client): introduce server domain, REST api and tailored client modules`.
- `chore: remove legacy jquery, taffydb, awesomplete and bootstrap assets`.
- `docs(sdd): add client-port-domain-api spec and plan as APROBADO`.
  13.2. `git push origin master`. Render redespliega.

### Paso 14 — Despliegue Render y cierre

14.1. Verificar Render verde en https://ygo-fm-fusion-calc.onrender.com/. `/search` y `/calculator` totalmente funcionales sin errores en consola.
14.2. Commit `docs(sdd)` que mueve la SPEC y el PLAN a `Estado: COMPLETADO` con commits referenciados.

## Validación

Mapeo criterio SPEC → cómo se comprueba.

1. **Build** → `npm run build` exit 0.
2. **Typecheck** → `npm run typecheck` exit 0.
3. **Cobertura ≥ 80%** → reporte de Vitest tras `npm test`.
4. **E2E verdes** → `npm run test:e2e`.
5. **Sin assets legacy** → `git ls-files public/javascripts public/styles data/cards.js data/fusions.js data/equips.js data/results.js data/types_and_stars.js` vacío.
6. **HTML servido limpio** → `curl http://localhost:3000/search` no contiene `jquery`, `taffy`, `awesomplete`, `bootstrap`, `fusionSearch.js`. `curl http://localhost:3000/calculator` lo mismo.
7. **`/search` funcional** → tests E2E + verificación manual.
8. **`/calculator` funcional** → tests E2E + verificación manual.
9. **API correcta** → tests unitarios con supertest.
10. **i18n paridad** → test específico verde.
11. **Render verde** → curl + visita manual a la URL pública.

## Rollback

- Cambios contenidos en commits ordenados. Si Render falla o algún flujo crítico se rompe, `git revert <commit>` deja el estado tras `pages-to-ejs-i18n` + `visual-recovery-tailwind v2` (i.e., el legacy todavía cargado y operativo).
- La eliminación de archivos no es destructiva en el sentido git: revertir el commit de eliminación restaura los archivos.
- Si solo falla la API (no el cliente), revert quirúrgico del commit del API; las vistas EJS y bundles cliente se conservan pero `/search` y `/calculator` se quedan sin datos. Aceptable como rollback intermedio.
