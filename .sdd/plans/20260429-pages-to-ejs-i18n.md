# PLAN: pages-to-ejs-i18n

SPEC: [.sdd/specs/20260429-pages-to-ejs-i18n.md](../specs/20260429-pages-to-ejs-i18n.md)
Estado: COMPLETADO

Commits: c08d1ea (implementación), c283cea (estado APROBADO).
Despliegue verificado: https://ygo-fm-fusion-calc.onrender.com/

## Archivos a modificar

Lista cerrada. Solo estos archivos preexistentes se tocan; cualquier otro queda intacto.

- [src/server/app.ts](../../src/server/app.ts) — reescribir composición: añadir `cookie-parser`, middleware i18n, registrar routers (views, lang, legacy), `app.set("views", ...)` + `app.set("view engine", "ejs")`, conservar `express.static` para `public/` y `data/`. Eliminar el bloque `LEGACY_PAGES` con `res.sendFile`.
- [src/server/config.ts](../../src/server/config.ts) — añadir `SUPPORTED_LANGS = ["es", "en"] as const` y tipo `Lang` exportado, más `DEFAULT_LANG = "es"`.
- [src/shared/types.ts](../../src/shared/types.ts) — sustituir `export {};` por re-exports desde `i18n/types.ts` (o dejar como `export {};` si prefiere mantener limpio; concretar al implementar).
- [vite.config.ts](../../vite.config.ts) — definir entries reales en `rollupOptions.input` (`home`, `search`, `calculator`, `about`). Ya tiene `manifest: true` y `emptyOutDir: false`.
- [tailwind.config.ts](../../tailwind.config.ts) — sin cambios de configuración (el `content` ya cubre `views/**/*.ejs` y `src/client/**/*.ts`). Verificar tras crear las plantillas que las clases que usemos están detectadas.
- [package.json](../../package.json) — añadir `cookie-parser@^1.4.7` y `@types/cookie-parser@^1.4.7`. Cambiar `build:client` a `vite build` (deja de ser no-op).
- [vitest.config.ts](../../vitest.config.ts) — activar `coverage.thresholds` al 80% en statements/branches/functions/lines. Añadir `coverage.exclude` con `src/server/index.ts`, `src/server/logger.ts`, `src/client/**/*.ts`.
- [.prettierignore](../../.prettierignore) — eliminar las cuatro líneas de HTML en raíz (`index.html`, `about.html`, `fusion-search.html`, `fusion-calculator.html`) tras borrar los archivos.
- [README.md](../../README.md) — actualizar la sección "Roadmap" marcando el ítem de EJS y i18n como hecho. Mencionar las nuevas URLs (`/search`, `/calculator`, `/about`).

## Archivos a eliminar

- `index.html`
- `about.html`
- `fusion-search.html`
- `fusion-calculator.html`

Verificado que ninguno tiene contenido ya migrado. Tras la eliminación, el repo deja de tener HTML en raíz.

## Archivos nuevos

Verificado que ninguno existe ya en el repo.

### Plantillas EJS (`views/`)

- `views/layouts/main.ejs` — layout principal. Recibe `title`, `lang`, `t`, `pageStyles`, `pageScripts`, `bodyClass`. Compone `partials/head`, `partials/navbar`, `<%- body %>`, `partials/footer`, `partials/scripts`.
- `views/partials/head.ejs` — `<head>` con meta, title, fuentes, link a `public/dist/styles.css`, link condicional a `public/styles/bootstrap.min.css` y `public/styles/awesomplete.css` y `public/styles/normalize.css` cuando `pageStyles` lo incluya, y `pageStyles` extras.
- `views/partials/navbar.ejs` — navbar Tailwind con logo, enlaces (Home, Search, Calculator, About, Thread externo), incluye `partials/language-switcher`. Toggler móvil que dispara la lógica de `src/client/components/navbar.ts` mediante `data-` attributes y `aria-expanded`.
- `views/partials/footer.ejs` — footer Tailwind con créditos y enlace al repo en GitHub.
- `views/partials/language-switcher.ejs` — `<form method="post" action="/lang">` con dos `<button name="lang" value="es|en">`. El botón del idioma activo lleva `aria-current="true"` y `disabled`.
- `views/partials/scripts.ejs` — renderiza `pageScripts` como `<script type="module" src="...">`.
- `views/index.ejs` — equivalente a `index.html`. Hero, secciones (Fusion Search, Fusion Calculator, About) con CTAs.
- `views/search.ejs` — equivalente a `fusion-search.html`. Estructura con input de nombre, botones, contenedores `outputcard`, `output-area-left`, `output-area-right`, `search-msg`, `reset-btn`. Carga estilos `awesomplete.css`, `normalize.css`, **`bootstrap.min.css` (transitional)** y los scripts legacy en `pageScripts` (jquery, awesomplete, taffy, data/\*.js, fusionSearch.js).
- `views/calculator.ejs` — equivalente a `fusion-calculator.html`. Mismo planteamiento (carga `bootstrap.min.css` y los scripts legacy correspondientes).
- `views/about.ejs` — equivalente a `about.html`.

### Servidor (`src/server/http/`)

- `src/server/http/middleware/i18n.ts` — middleware que resuelve `lang` con prioridad cookie → `Accept-Language` → `DEFAULT_LANG`. Setea `res.locals.lang` y `res.locals.t = (key, vars) => translate(key, lang, vars)`.
- `src/server/http/assets.ts` — helper `assetUrl(entry: string): string`. Lee `public/dist/.vite/manifest.json` una sola vez al primer uso (cache en módulo). En `NODE_ENV=development` puede recargar (no obligatorio en este paso).
- `src/server/http/routes/views.ts` — Router con `GET /`, `/search`, `/calculator`, `/about`. Cada handler hace `res.render("<view>", { title: t("page.<x>.title"), pageScripts: [...], pageStyles: [...] })`.
- `src/server/http/routes/lang.ts` — Router con `POST /lang`. Body parser sobre `application/x-www-form-urlencoded`. Valida `lang ∈ SUPPORTED_LANGS`, escribe cookie `lang` (Max-Age 1 año, `SameSite=Lax`, `Secure` si `NODE_ENV=production`), responde 303 al `Referer` o `/`.
- `src/server/http/routes/legacy.ts` — Router con redirects 301: `/index.html → /`, `/fusion-search.html → /search`, `/fusion-calculator.html → /calculator`, `/about.html → /about`.

### Compartido (`src/shared/i18n/`)

- `src/shared/i18n/types.ts` — `Lang = "es" | "en"`, `Translations = Record<TranslationKey, string>`. `TranslationKey` se define como `keyof typeof esCatalog` (importado dinámicamente para inferencia) o como union literal mantenida a mano. Decisión a confirmar al implementar; preferimos inferencia desde el catálogo `es`.
- `src/shared/i18n/index.ts` — funciones `translate(key, lang, vars?)` con interpolación `{{var}}`, `getCatalog(lang)`, helper `parseAcceptLanguage(header)`. Exporta también `SUPPORTED_LANGS` y `DEFAULT_LANG` reexportados desde `config.ts` o duplicados aquí (la duplicación se justifica por el package boundary cliente/servidor).
- `src/shared/i18n/es.json` — catálogo español. Claves namespaced (`nav.home`, `nav.search`, `home.hero-title`, `home.hero-subtitle`, `home.intro`, `home.fusion-search.title`, `home.calculator.title`, `home.about.title`, `home.cta.get-started`, `home.cta.fusion-search`, `home.cta.fusion-calculator`, `home.cta.about`, `search.title`, `search.input.placeholder`, `search.btn.by-name`, `search.btn.by-result`, `search.btn.reset`, `search.results.fusions`, `search.results.equips`, `search.error.empty`, `search.error.not-found`, `calculator.title`, `calculator.btn.reset`, `calculator.results.fusions`, `calculator.results.equips`, `about.title`, `about.body`, `lang.es`, `lang.en`, `footer.copyright`, `footer.repo`, `nav.thread`).
- `src/shared/i18n/en.json` — catálogo inglés con las mismas claves.

### Cliente (`src/client/`)

- `src/client/components/navbar.ts` — toggler de menú móvil. Selecciona `[data-navbar-toggle]` y `[data-navbar-collapse]`, alterna `hidden` en el panel, actualiza `aria-expanded`.
- `src/client/components/language-switcher.ts` — opcional. Si el form ya hace POST nativo, no se necesita JS. Solo añadir si se requiere mejorar UX (no se añade en este paso por defecto).
- `src/client/pages/home.ts` — entry. Importa y monta `navbar`.
- `src/client/pages/search.ts` — entry. Importa y monta `navbar`. Los scripts legacy de búsqueda se cargan aparte vía `<script src="/public/javascripts/...">` desde la plantilla.
- `src/client/pages/calculator.ts` — idem.
- `src/client/pages/about.ts` — idem.

### Tests

- `tests/unit/shared/i18n.test.ts` — `translate` con clave existente, missing key (modo dev lanza, modo prod devuelve `[key]`), interpolación, `parseAcceptLanguage` (preferencia, fallback).
- `tests/unit/shared/i18n-parity.test.ts` — verifica que `Object.keys(es)` === `Object.keys(en)`. Falla con diff visible si difieren.
- `tests/unit/server/http/middleware-i18n.test.ts` — tres casos: solo cookie, solo Accept-Language, fallback. `res.locals.lang` y `res.locals.t` correctos.
- `tests/unit/server/http/lang-route.test.ts` — supertest. POST con `lang=en` → 303 + `Set-Cookie: lang=en; ...`. POST con `lang=fr` → 400. Sin body → 400.
- `tests/unit/server/http/legacy-route.test.ts` — supertest. Cada una de las cuatro rutas viejas devuelve 301 con la `Location` correcta.
- `tests/unit/server/http/views-route.test.ts` — supertest. Las cuatro rutas nuevas devuelven 200 con HTML que contiene un marcador (e.g., el título traducido) y `<html lang="es">` por defecto.
- `tests/unit/server/http/assets.test.ts` — `assetUrl` con manifest mock. Lanza si la entry no existe.
- `tests/e2e/navigation.spec.ts` — sustituye a `tests/e2e/smoke.spec.ts` (el viejo se elimina). Cubre:
    - Las cuatro páginas cargan (200, navbar visible).
    - Navegación entre páginas vía clicks en navbar.
    - Cambio es → en por POST `/lang` y verificación de strings.
    - Persistencia tras recarga.
    - Redirects 301 desde URLs viejas.
    - Toggler móvil abre y cierra el navbar (viewport 375 px).

Tests que se eliminan: `tests/e2e/smoke.spec.ts` queda obsoleto y se reemplaza por `navigation.spec.ts`.

## Pasos de implementación

### Paso 1 — Catálogos i18n y helper compartido

1.1. Crear `src/shared/i18n/types.ts`, `src/shared/i18n/index.ts`, `src/shared/i18n/es.json`, `src/shared/i18n/en.json` con todas las claves namespaced listadas arriba. El catálogo `en.json` incluye los textos actuales del repo; `es.json` los traduce.
1.2. Crear `tests/unit/shared/i18n.test.ts` y `tests/unit/shared/i18n-parity.test.ts`.
1.3. Ejecutar `npm test`. Tests verdes.

### Paso 2 — Configuración del servidor

2.1. Modificar `src/server/config.ts` añadiendo `SUPPORTED_LANGS`, `Lang`, `DEFAULT_LANG`. Ejecutar `npm run typecheck`.
2.2. Instalar `cookie-parser` y sus tipos: `npm install cookie-parser && npm install -D @types/cookie-parser`.
2.3. Crear `src/server/http/middleware/i18n.ts`, `src/server/http/assets.ts` y los routers en `src/server/http/routes/`.
2.4. Reescribir `src/server/app.ts`: registrar `cookie-parser`, `express.urlencoded`, configurar `view engine` EJS y carpeta `views/`, montar middleware i18n y los routers en orden (legacy redirects → views → lang). Eliminar `LEGACY_PAGES` y rutas explícitas a HTML.
2.5. Crear los tests unitarios server-side: `middleware-i18n.test.ts`, `lang-route.test.ts`, `legacy-route.test.ts`, `assets.test.ts`. Ejecutar `npm test`.

### Paso 3 — Plantillas EJS

3.1. Crear `views/layouts/main.ejs` y todos los partials.
3.2. Crear `views/index.ejs`, `views/search.ejs`, `views/calculator.ejs`, `views/about.ejs`. Las cuatro renderizan a través de `<% layout("layouts/main") %>` (usando `express-ejs-layouts` solo si es necesario; si no, hacer que cada vista invoque al layout vía `<%- include("layouts/main", { body: "..." }) %>`). Decisión a tomar al implementar; preferimos no añadir `express-ejs-layouts` si las vistas pueden incluir el layout vía partials (helper `render(view, locals)` propio).
3.3. Aplicar Tailwind a la maquetación. `search.ejs` y `calculator.ejs` declaran en `pageStyles` los CSS legacy (`bootstrap.min.css`, `awesomplete.css`, `normalize.css`) y en `pageScripts` los JS legacy.
3.4. Ejecutar `npm run build:css` y verificar que las clases nuevas se compilan.
3.5. Crear `tests/unit/server/http/views-route.test.ts` con supertest y ejecutar.

### Paso 4 — Cliente TypeScript y Vite multi-entry

4.1. Crear `src/client/components/navbar.ts`. Implementación: `function mountNavbar() { ... }` que busca toggler y panel y registra el listener.
4.2. Crear `src/client/pages/{home,search,calculator,about}.ts`, cada uno importa `mountNavbar` y lo invoca en `DOMContentLoaded`.
4.3. Modificar `vite.config.ts`: definir `rollupOptions.input` con cuatro entries absolutos (`src/client/pages/home.ts`, etc.).
4.4. Cambiar `build:client` en `package.json` de no-op a `vite build`.
4.5. Ejecutar `npm run build:client`. Verificar que `public/dist/.vite/manifest.json` y los `assets/*.js` con hash existen.

### Paso 5 — Wiring de assets en EJS

5.1. Implementar `assetUrl(entry)` en `src/server/http/assets.ts` leyendo el manifest. Cache en módulo.
5.2. En las cuatro vistas, sustituir las rutas estáticas a los nuevos bundles por `<%= assetUrl("src/client/pages/<page>.ts") %>`.
5.3. Ejecutar `npm run build && npm start`. Smoke manual con `curl` para cada ruta.

### Paso 6 — Eliminación de archivos antiguos y limpieza

6.1. `git rm index.html about.html fusion-search.html fusion-calculator.html`.
6.2. Editar `.prettierignore` retirando las cuatro líneas correspondientes.
6.3. Editar `README.md` actualizando la sección Roadmap (marcar EJS/Tailwind/i18n como hechos) y mencionando las nuevas URLs.

### Paso 7 — Activación del gate de cobertura

7.1. Modificar `vitest.config.ts` añadiendo `coverage.thresholds = { lines: 80, branches: 80, functions: 80, statements: 80 }` y `coverage.exclude = ["src/**/*.d.ts", "src/server/index.ts", "src/server/logger.ts", "src/client/**/*.ts", "src/shared/types.ts"]`.
7.2. Ejecutar `npm test`. Si la cobertura baja del 80%, añadir tests hasta cumplir el umbral. No bajar el umbral.

### Paso 8 — Validación local completa

8.1. `rm -rf node_modules dist public/dist coverage playwright-report test-results && npm ci`.
8.2. `npm run typecheck`.
8.3. `npm run build`.
8.4. `npm test` con cobertura ≥ 80%.
8.5. `npm run test:e2e` (suite `navigation.spec.ts` actualizada).
8.6. `npm run format:check`.
8.7. `npm start` y verificación manual: - Home en `/` con strings en `es`. - `POST /lang` con form → cookie `lang=en` → recarga → strings en `en`. - `/search` y `/calculator` siguen funcionando: autocompletado, búsqueda, fusiones (manualmente). - Redirects 301 desde URLs viejas (con `curl -I`). - Navbar móvil (responsive en DevTools).

### Paso 9 — Despliegue a Render

9.1. Commit y push a `master`.
9.2. Esperar build verde en Render. Render lee `render.yaml` actualizado (mismo build command) y reconstruye.
9.3. Verificar las cuatro nuevas rutas en https://ygo-fm-fusion-calc.onrender.com/, los redirects, y los flujos de calculator y search en producción.
9.4. Tras verificación, hacer commit `docs(sdd):` que mueve la SPEC y este PLAN a `Estado: COMPLETADO`.

## Validación

Mapeo criterio SPEC → cómo se comprueba.

1. **Build**: `npm run build` exit 0 + verificación de `public/dist/.vite/manifest.json` y `dist/server/`.
2. **Typecheck**: `npm run typecheck` exit 0.
3. **Tests unitarios + cobertura**: `npm test` exit 0; reporte muestra ≥80% en cada métrica.
4. **Tests E2E**: `npm run test:e2e` exit 0.
5. **Rutas nuevas**: `curl -i` cada ruta → 200 + `<title>` traducido.
6. **Redirecciones legacy**: `curl -I /index.html` etc. → 301 + `Location` correcta.
7. **Idioma por defecto**: `curl http://localhost:3000/` sin headers → HTML contiene `<html lang="es">` y strings en español.
8. **Detección Accept-Language**: `curl -H "Accept-Language: en-US,en;q=0.9"` → strings en inglés.
9. **Persistencia cookie**: `curl -c jar -X POST -d "lang=en" /lang` después `curl -b jar /` → strings en inglés.
10. **Paridad i18n**: test específico verde.
11. **Selector visible**: inspección manual del HTML (presencia del `<form action="/lang">`).
12. **Funcionalidad legacy**: prueba manual en `/search` y `/calculator` (autocompletar carta, ver resultados).
13. **Navbar móvil**: test E2E con viewport 375px.
14. **Cleanup**: `git ls-files | grep -E "^(index|about|fusion-search|fusion-calculator)\.html$"` vacío.
15. **Despliegue Render verde**: verificación manual en URL pública post-despliegue.

## Rollback

Cambio amplio pero contenido en una rama / un set de commits. Estrategia recomendada: rama `feat/pages-to-ejs-i18n` y commits individuales por paso. Si algo falla en producción:

1. `git revert <merge-commit>` (o `git revert <commit-range>` si no hubo merge commit). Render redespliega con el estado anterior.
2. Las URLs viejas (`/index.html` etc.) volverán a funcionar porque vuelven los archivos físicos y las rutas explícitas.
3. La cookie `lang` queda en navegadores de usuarios que probaron el cambio de idioma; es inocua si las URLs viejas vuelven a servirse en inglés (no leen la cookie).

Si solo falla parte (e.g., E2E mobile), considerar revert quirúrgico de los archivos afectados antes de revertir todo.

No se borran datos. No hay irreversibles.
