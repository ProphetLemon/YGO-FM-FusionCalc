# SPEC: scaffold-node-ts

Fecha: 2026-04-29
Estado: COMPLETADO

Commits: 60c1cee (implementación), eab22f9 (estado APROBADO), 668eb5d (fix Render).
Despliegue verificado: https://ygo-fm-fusion-calc.onrender.com/

## Objetivo

Introducir el toolchain Node + TypeScript en el repositorio y levantar un servidor Express mínimo que sirva los HTML/CSS/JS actuales tal cual, sin modificarlos. El resultado debe ser una aplicación desplegable en Render Web Service (free tier) que se vea exactamente igual que el sitio estático actual, dejando el terreno preparado para las dos SPECs siguientes (port a EJS y port del cliente a TS modular).

Este es el paso 1 de la migración aprobada bajo Opción B.

## Contexto

- Estado actual del repo: sitio estático servido en GitHub Pages. Cuatro páginas HTML en raíz, scripts en [public/javascripts/](public/javascripts/), estilos en [public/styles/](public/styles/), datos en [data/](data/), scripts Ruby en [scripts/](scripts/).
- Stack acordado: ver [.sdd/context/stack.md](.sdd/context/stack.md). Resumen: Node 24, TS 5.x, Express 5, EJS, Tailwind 4, Vite 6, Vitest, Playwright, pino, dotenv, npm.
- Estructura objetivo: ver [.sdd/context/structure.md](.sdd/context/structure.md).
- Convenciones: ver [.sdd/context/conventions.md](.sdd/context/conventions.md).
- El cambio de hosting de GitHub Pages a Render Web Service ocurre en este paso. No se conservan ambos despliegues.

## Alcance

1. Configuración de Node y npm:
    - `package.json` con `engines.node = "24.x"`, scripts y dependencias.
    - `package-lock.json` generado al instalar.
    - `.nvmrc` con `24`.

2. TypeScript:
    - `tsconfig.json` base (strict, noUncheckedIndexedAccess, paths).
    - `tsconfig.server.json` extiende base, target Node, `outDir: dist/server`.
    - `tsconfig.client.json` extiende base, target navegador, sin emisión (Vite emite).

3. Bundling y estilos (configurados, no aplicados todavía a las páginas):
    - `vite.config.ts` con multi-entry vacío inicial (`src/client/pages/*` aún no existe; el config queda preparado).
    - `tailwind.config.ts` con `content` apuntando a `views/` y `src/client/`. Genera `public/dist/styles.css` vacío o con base + utilities. No se inyecta en los HTML actuales.

4. Servidor Express mínimo (`src/server/`):
    - `src/server/index.ts`: arranque, `app.listen` en `process.env.PORT || 3000`.
    - `src/server/app.ts`: Express con `express.static('public')`, `express.static('.')` filtrado a los `.html` actuales, middleware `pino-http`, error handler básico.
    - `src/server/config.ts`: lee y valida `PORT`, `NODE_ENV`, `LOG_LEVEL`.
    - `src/server/logger.ts`: instancia pino exportada.
    - El servidor debe servir las cuatro páginas en sus rutas actuales: `/` (index.html), `/fusion-search.html`, `/fusion-calculator.html`, `/about.html`. Sin reescritura de URLs en este paso.

5. Tests (configurados con un único caso trivial cada uno):
    - `vitest.config.ts` con cobertura `@vitest/coverage-v8` configurada al 80% (sin enforcement aún, gate manual).
    - `tests/unit/server/config.test.ts` que verifica el lector de env vars.
    - `playwright.config.ts` con `webServer` que levanta el server.
    - `tests/e2e/smoke.spec.ts` que abre `/` y comprueba que el `<title>` contiene "Yu-Gi-Oh".

6. Despliegue:
    - `render.yaml` describiendo un Web Service: `buildCommand: npm ci && npm run build`, `startCommand: npm start`, plan free, env Node.
    - `.env.example` con `PORT`, `NODE_ENV`, `LOG_LEVEL`.
    - `.gitignore` actualizado: `node_modules/`, `dist/`, `public/dist/`, `.env`, `coverage/`, `playwright-report/`, `test-results/`, `.vite/`.

7. Scripts npm (en `package.json`):
    - `dev`: arranca Express con `tsx watch` y Vite en modo dev (concurrente).
    - `build`: `npm run typecheck && npm run build:client && npm run build:server && npm run build:css`.
    - `build:server`, `build:client`, `build:css` separados.
    - `start`: ejecuta `node dist/server/index.js`.
    - `typecheck`: `tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.client.json --noEmit`.
    - `test`: `vitest run --coverage`.
    - `test:watch`: `vitest`.
    - `test:e2e`: `playwright test`.
    - `format`: `prettier --write .`.
    - `format:check`: `prettier --check .`.

8. README mínimo actualizado con: requisitos (Node 24), `npm install`, `npm run dev`, `npm test`, despliegue.

## Fuera de alcance

Lo siguiente NO entra en esta SPEC y se aborda en SPECs posteriores:

- Conversión de los HTML actuales a plantillas EJS.
- Layouts y parciales EJS.
- Port de [public/javascripts/fusionCalc.js](public/javascripts/fusionCalc.js) y [public/javascripts/fusionSearch.js](public/javascripts/fusionSearch.js) a TS modular.
- Eliminación de jQuery, Bootstrap, TaffyDB.
- Capa `domain/` (lógica de fusiones, equips, búsqueda).
- Capa `data/` (store in-memory, índices, validadores).
- Endpoints API.
- i18n (catálogos `es.json`/`en.json`, helper `t`, middleware).
- Reescritura de los scripts Ruby a TS.
- Aplicación de Tailwind a las páginas (las páginas siguen usando Bootstrap del repo actual).
- Normalización de URLs (`/search`, `/calculator`, `/about` sin `.html`).
- Movimiento de los HTML actuales a `views/`.
- Movimiento de scripts/styles del cliente a `src/client/`.
- Imágenes por carta, deck builder, fusiones encadenadas, slots dinámicos.
- Eliminación de la mención a GitHub Pages en el [README.md](README.md) más allá de actualizar la sección "How to Use".

## Criterios de aceptación

Cada criterio es verificable mediante el comando o acción indicada:

1. **Instalación limpia**: tras `npm ci` desde clon limpio, no hay errores. `node_modules/` se crea.
2. **Typecheck**: `npm run typecheck` termina con código 0.
3. **Build completo**: `npm run build` termina con código 0 y produce `dist/server/index.js`, `public/dist/styles.css` y, si existieran entries, los bundles correspondientes (en este paso `public/dist/` puede contener solo `styles.css`).
4. **Arranque local**: `npm start` (tras `npm run build`) levanta Express en el puerto configurado. `npm run dev` arranca en modo desarrollo.
5. **Páginas actuales accesibles**: en local, los siguientes paths devuelven 200 con el HTML actual sin modificación:
    - `GET /` → contenido de [index.html](index.html)
    - `GET /fusion-search.html` → contenido de [fusion-search.html](fusion-search.html)
    - `GET /fusion-calculator.html` → contenido de [fusion-calculator.html](fusion-calculator.html)
    - `GET /about.html` → contenido de [about.html](about.html)
6. **Estáticos accesibles**: `GET /public/images/logo.png`, `GET /public/styles/home.css`, `GET /public/javascripts/fusionCalc.js` devuelven 200 con el contenido binario/textual correcto.
7. **Render del sitio idéntico**: visualmente, el sitio servido por Express es indistinguible del servido por GitHub Pages actual. Verificación manual por captura/comparación de las cuatro páginas.
8. **Vitest verde**: `npm test` pasa el test trivial de `config.test.ts` y emite reporte de cobertura.
9. **Playwright verde**: `npm run test:e2e` pasa el test smoke contra el server local.
10. **Formato**: `npm run format:check` pasa sin diferencias en los archivos nuevos.
11. **Render config válido**: `render.yaml` parsea como YAML y contiene los campos requeridos (`services[].type=web`, `env=node`, `buildCommand`, `startCommand`, `plan=free`).
12. **`.env.example` y `.gitignore`** reflejan las variables y outputs descritos en alcance.
13. **Sin regresión en datos**: `data/` no se modifica. Los archivos `.js` y `.json` siguen accesibles desde `public/` o desde su ubicación actual sin cambios.
14. **README** describe cómo arrancar el proyecto en menos de 30 segundos para alguien que clone el repo.

## Impacto en contratos

- **API**: ninguno. No se introducen endpoints en este paso.
- **Modelo de datos**: ninguno. `Cards.json` y derivados intactos.
- **Frontend-backend**: cambia el origen del servido (de Pages a Express), pero las rutas externas y el HTML entregado son idénticos. Sin cambio de contrato visible.
- **Hosting**: cambio de GitHub Pages a Render Web Service. Es un cambio de infraestructura, no de contrato hacia el navegador. La URL pública cambia (a la asignada por Render), lo cual debe reflejarse en el README.

## Riesgos y supuestos

**Riesgos**

- Render free tier sufre cold starts (~30-60 s tras inactividad). No bloquea esta SPEC, pero degrada UX. Aceptado por el usuario en `stack.md`.
- Tailwind 4 ha cambiado significativamente respecto a v3 (configuración, importación). Si el setup mínimo da problemas, puede requerirse un paso adicional. Mitigación: dejar `styles.css` vacío o con `@import "tailwindcss"` minimal en este paso, y dejar el styling real para SPECs posteriores.
- Servir los `.html` desde la raíz vía `express.static('.')` puede exponer archivos no deseados (`.git/`, `package.json`, etc.). Mitigación: usar rutas explícitas con `res.sendFile` para cada uno de los cuatro HTML, no `express.static` sobre la raíz.
- Mezcla de `tsx watch` y Vite dev concurrentes puede dar problemas de puertos en local. Mitigación: documentar puertos por defecto en README y permitir override por env.

**Supuestos**

- El usuario puede crear el servicio en Render manualmente y conectar el repo (no se automatiza la creación; `render.yaml` es declarativo y Render lo lee).
- No hay CI; los gates (typecheck, tests, format) se ejecutan localmente antes de cada commit.
- El despliegue se prueba al menos una vez en Render como parte de la VALIDACIÓN, no se asume que funciona solo porque corre en local.
- La eliminación efectiva del despliegue en GitHub Pages la hace el usuario en GitHub Settings; esta SPEC no automatiza esa acción.
