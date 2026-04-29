# SPEC: pages-to-ejs-i18n

Fecha: 2026-04-29
Estado: COMPLETADO

Commits: c08d1ea (implementación), c283cea (estado APROBADO).
Despliegue verificado: https://ygo-fm-fusion-calc.onrender.com/

## Objetivo

Migrar las cuatro páginas estáticas existentes (`index.html`, `fusion-search.html`, `fusion-calculator.html`, `about.html`) a plantillas EJS server-rendered, sustituir Bootstrap por Tailwind como sistema de estilos, normalizar las URLs (`/search`, `/calculator`, `/about`) e introducir i18n español/inglés con cambio manual de idioma. El comportamiento dinámico del calculator y del search se preserva sin cambios (jQuery + TaffyDB + Awesomplete + `fusionCalc.js` / `fusionSearch.js` siguen cargándose desde `/public/javascripts/`); su port a TypeScript modular es objeto del paso 3 de la migración.

Este es el paso 2 de la migración Opción B aprobada en [.sdd/context/architecture.md](../context/architecture.md).

## Contexto

- Estado actual: scaffold de Node + TS + Express completado en SPEC [20260429-scaffold-node-ts](20260429-scaffold-node-ts.md). El servidor sirve las cuatro páginas estáticas tal cual, vendored libs y `data/*.js` legacy incluidos. Despliegue verde en https://ygo-fm-fusion-calc.onrender.com/.
- Tailwind 4 ya está instalado y compila a `public/dist/styles.css`, pero las páginas no lo usan todavía.
- jQuery 3.5, Bootstrap 5 (CSS + JS), TaffyDB, Awesomplete y los scripts `fusionCalc.js`/`fusionSearch.js` están cargados en cada página y son responsables de toda la interactividad. La reescritura de estos a TS modular es el paso 3, fuera de alcance aquí.
- Convenciones aplicables: [.sdd/context/conventions.md](../context/conventions.md). Estructura objetivo: [.sdd/context/structure.md](../context/structure.md).

## Alcance

### 1. Plantillas EJS

- `views/layouts/main.ejs`: layout único con `<!doctype>`, `<html lang>`, head, body, navbar, slot principal, footer, scripts. Acepta variables: `title`, `lang`, `t`, `pageStyles` (array de hrefs), `pageScripts` (array de srcs), `bodyClass`.
- Parciales en `views/partials/`:
    - `head.ejs`: meta tags, `<title>`, fuentes, link a `/public/dist/styles.css` (Tailwind), link a Bootstrap CSS legacy (transitional, ver más abajo), `pageStyles`.
    - `navbar.ejs`: navbar maquetado con Tailwind. Logo, enlaces a Home / Search / Calculator / About / Thread externo. Selector de idioma. Toggler para móvil.
    - `footer.ejs`: footer con créditos, enlace al repo en GitHub.
    - `language-switcher.ejs`: form `POST /lang` con dos botones (`es`, `en`). El botón del idioma activo aparece como `aria-current="true"` y deshabilitado.
    - `scripts.ejs`: bloque que renderiza `pageScripts` con `<script type="module">` para los entries de Vite.
- Vistas:
    - `views/index.ejs` (home): equivalente a `index.html`.
    - `views/search.ejs`: equivalente a `fusion-search.html`.
    - `views/calculator.ejs`: equivalente a `fusion-calculator.html`.
    - `views/about.ejs`: equivalente a `about.html`.
- Todas las strings visibles pasan por `t(key)` invocado dentro de las plantillas.

### 2. Tailwind aplicado a las plantillas

- Las plantillas EJS usan exclusivamente clases Tailwind 4 para layout, tipografía, colores, espaciado, responsive y estados.
- Bootstrap CSS se elimina del `<head>` para las plantillas EJS, **excepto** la hoja `bootstrap.min.css` que sigue cargándose en las páginas que muestran resultados generados por los scripts legacy (`/search`, `/calculator`). Razón: `fusionSearch.js` y `fusionCalc.js` inyectan HTML con clases Bootstrap (`card`, `mb-3`, `border-dark`, `alert`); si Bootstrap se retira ahora se vería roto. La eliminación definitiva ocurre en el paso 3 cuando esos scripts se reescriban.
- `bootstrap.bundle.min.js` (necesario para el toggler del navbar de Bootstrap original) no se carga: el toggler del navbar se reimplementa en TypeScript en `src/client/components/navbar.ts`.

### 3. Rutas y middleware

- Nuevas rutas server-rendered:
    - `GET /` → `views/index.ejs`
    - `GET /search` → `views/search.ejs`
    - `GET /calculator` → `views/calculator.ejs`
    - `GET /about` → `views/about.ejs`
- Middleware de i18n resuelve idioma con prioridad: cookie `lang` → header `Accept-Language` → fallback `es`. Expone `res.locals.lang` y `res.locals.t`.
- Endpoint `POST /lang` con body `{ lang: "es"|"en" }`, escribe cookie `lang` (HttpOnly=false, SameSite=Lax, Max-Age=1 año), responde con `redirect 303` al `Referer` (o a `/` si no hay).
- Redirecciones legacy 301:
    - `/index.html` → `/`
    - `/fusion-search.html` → `/search`
    - `/fusion-calculator.html` → `/calculator`
    - `/about.html` → `/about`

### 4. i18n

- Catálogos en `src/shared/i18n/es.json` y `src/shared/i18n/en.json`.
- Idioma por defecto: `es`. Idiomas soportados: `["es", "en"]`.
- Helper `t(key, lang)` en `src/shared/i18n/index.ts`, puro, devuelve la cadena del catálogo correspondiente. Si la clave falta, lanza error en `NODE_ENV=development` y devuelve la clave entre brackets en producción.
- Soporte de interpolación `{{variable}}`. Sin pluralización en este paso (no la necesitamos para estas páginas).
- Tipo `Lang = "es" | "en"` y `TranslationKey` (union de todas las claves) en `src/shared/i18n/types.ts`. Build falla si las dos catálogos divergen (test específico).
- Claves con namespace por feature (`home.hero-title`, `calculator.add-slot`, `nav.search`, etc.).

### 5. Selector de idioma

- Renderizado en el navbar (parcial `language-switcher.ejs`).
- Form `<form method="post" action="/lang">` con dos `<button name="lang" value="es|en">`.
- El botón del idioma actual se muestra activo (clase Tailwind) y `disabled`.
- Tras `POST /lang`, redirección a la página de origen en el nuevo idioma. La cookie persiste en visitas posteriores.

### 6. Scripts cliente (Vite multi-entry)

- Vite ahora compila entries reales. Cada página carga su entry desde `/public/dist/<entry>.js`.
- Entries TS:
    - `src/client/pages/home.ts`: solo navbar.
    - `src/client/pages/search.ts`: navbar.
    - `src/client/pages/calculator.ts`: navbar.
    - `src/client/pages/about.ts`: navbar.
- Componente `src/client/components/navbar.ts`: toggler de navbar móvil (clic → toggla `hidden` en el panel desplegable).
- Los scripts legacy (`jquery`, `awesomplete`, `taffy`, `fusionCalc`, `fusionSearch` y los `data/*.js`) **siguen cargándose desde `/public/javascripts/` y `/data/` igual que ahora**, pero solo en las páginas que los usan (search y calculator). El layout no los carga por defecto.
- El bundle del cliente queda en `public/dist/<entry>-<hash>.js` y se referencia desde EJS leyendo el manifest de Vite (`public/dist/.vite/manifest.json`).

### 7. Eliminación de archivos antiguos

- Los HTML actuales (`index.html`, `fusion-search.html`, `fusion-calculator.html`, `about.html`) se eliminan del repositorio.
- Las rutas explícitas a esos archivos en `src/server/app.ts` se eliminan, sustituidas por las nuevas rutas EJS y los redirects 301.
- `.prettierignore` se actualiza para retirar las entradas correspondientes a los HTML eliminados.

### 8. Tests

- Vitest unitario: catálogos i18n (paridad de claves), helper `t()`, middleware i18n, `POST /lang`, redirects legacy. Cobertura activada al 80% (statements, branches, functions, lines) sobre `src/**/*.ts` excluyendo `src/server/index.ts` y `src/server/logger.ts`.
- Vitest tests usan supertest contra la app para los handlers HTTP.
- Playwright E2E: navegación entre las cuatro páginas nuevas, cambio de idioma `es ↔ en` y verificación de strings traducidos, redirects 301 verificados (status + Location), navbar móvil (toggler abre y cierra).

## Fuera de alcance

- Reescritura de `fusionCalc.js`, `fusionSearch.js` a TypeScript modular: paso 3.
- Eliminación de jQuery, TaffyDB, Awesomplete, Bootstrap CSS: paso 3.
- Endpoints API (`/api/cards`, `/api/fusions`, etc.): paso 3.
- Capa `src/server/domain/` y `src/server/data/store.ts`: paso 3 o posterior.
- Reescritura de scripts Ruby a TS: SPEC propia más adelante.
- Imágenes reales por carta, deck builder, fusiones encadenadas, slots dinámicos, fuzzy search, PWA, deck export/import: SPECs posteriores.
- Cambios visuales más allá del cambio de framework CSS (no se rediseñan layouts).

## Criterios de aceptación

1. **Build**: `npm run build` termina con código 0. `public/dist/styles.css` y los entries de cliente bundled aparecen.
2. **Typecheck**: `npm run typecheck` exit 0.
3. **Tests unitarios**: `npm test` exit 0 con cobertura ≥ 80% en cada métrica (statements, branches, functions, lines) sobre los archivos incluidos.
4. **Tests E2E**: `npm run test:e2e` exit 0 cubriendo navegación, idiomas y redirects.
5. **Rutas nuevas**: `GET /`, `GET /search`, `GET /calculator`, `GET /about` devuelven 200 con HTML server-rendered desde EJS.
6. **Redirecciones legacy**: `GET /index.html`, `/fusion-search.html`, `/fusion-calculator.html`, `/about.html` devuelven 301 con `Location` apuntando a la ruta normalizada.
7. **Idioma por defecto**: petición sin cookie ni `Accept-Language` reconocido recibe la versión `es`. `<html lang="es">`.
8. **Detección por `Accept-Language`**: petición con `Accept-Language: en-US,en;q=0.9` y sin cookie recibe la versión `en`.
9. **Persistencia de cookie**: `POST /lang` con `lang=en` setea cookie `lang=en` y redirige (303). Petición posterior recibe la versión `en` aunque `Accept-Language` sea `es`.
10. **Paridad i18n**: existe un test que verifica que `es.json` y `en.json` tienen exactamente el mismo conjunto de claves; falla si difieren.
11. **Selector visible**: el navbar contiene el selector de idioma con dos botones; el del idioma activo está deshabilitado.
12. **Funcionalidad legacy preservada**: en `/search` y `/calculator`, el autocompletado, la búsqueda y el cálculo de fusiones siguen funcionando exactamente como en la versión actual. Verificación manual.
13. **Navbar móvil**: en viewport <768 px, el toggler abre y cierra el menú. Verificable en Playwright.
14. **Cleanup**: los cuatro `.html` en raíz no existen en el repo. `git ls-files` no los lista.
15. **Despliegue Render verde**: tras `git push`, Render reconstruye y las cuatro rutas funcionan en https://ygo-fm-fusion-calc.onrender.com/, con las redirecciones 301 también verificables en producción.

## Impacto en contratos

- **API**: ninguno (no hay endpoints API en este paso).
- **Modelo de datos**: ninguno. `data/*` intacto.
- **Frontend-backend**:
    - Cambia el conjunto de URLs públicas. Las viejas redirigen 301 a las nuevas, así que enlaces externos no se rompen.
    - Aparece `POST /lang`. Solo lo usa el selector de idioma propio.
    - Aparece la cookie `lang` (no httponly, no secure flag necesario en local; en Render con HTTPS sí marcamos secure).
- **Hosting**: ninguno. Sigue Render single deployment.

## Riesgos y supuestos

**Riesgos**

1. **Coexistencia Tailwind + Bootstrap CSS** en `/search` y `/calculator`: dos sistemas de estilos cargados simultáneamente. Riesgo de conflictos de reset CSS o utilities con prefijos solapados. Mitigación: cargar Bootstrap CSS después de Tailwind para que sus reglas no overrideen las nuestras donde no toca; verificar visualmente. Eliminación definitiva en paso 3.
2. **Reimplementación del toggler de navbar** en TS sustituyendo a `bootstrap.bundle.min.js`: introduce una pequeña pieza nueva de cliente. Riesgo bajo pero hay que probarla en mobile real.
3. **Cobertura 80% activada por primera vez**: si algún archivo nuevo se queda sin tests, el build de tests rompe. Mitigación: excluir `src/server/index.ts` y `src/server/logger.ts` del cómputo, y testear `app.ts` y rutas con supertest.
4. **Lectura del manifest de Vite desde EJS**: requiere lógica que parsea `public/dist/.vite/manifest.json` para resolver el nombre con hash de cada bundle. Si Vite no genera manifest por configuración, los `<script>` apuntarían a archivos inexistentes. Mitigación: verificar que `build.manifest: true` está activo y producir un helper `assetUrl(entry)` que se pasa a las vistas.
5. **Usuarios con bookmarks a `.html`**: cubierto por los redirects 301; pero la primera petición tras desplegar se hará a la ruta vieja, no la nueva.
6. **Arranque más lento**: cargar plantillas EJS y compilar Tailwind con `content` real puede subir el tamaño del CSS de ~11 KB actual a quizás 15-25 KB. Aceptable.

**Supuestos**

- Vite genera manifest correctamente con la configuración actual; basta con ajustar `rollupOptions.input` para añadir las entries reales.
- `cookie-parser` (o equivalente) puede instalarse sin objeciones; si prefieres parseo manual, es una decisión a confirmar en el PLAN.
- La paleta visual final tras la migración a Tailwind no replica píxel a píxel la estética de Bootstrap, pero conserva: navbar con logo + enlaces, hero con imagen, secciones con texto + CTA, footer con créditos. Cualquier diferencia visual mayor a lo razonable se trata en validación antes de mergear.
- En Render, `secure: true` se aplica a la cookie `lang` automáticamente cuando `process.env.NODE_ENV === "production"`.
- Las traducciones al español las redacto yo a partir del inglés actual; tú revisas en validación y propones cambios concretos.
