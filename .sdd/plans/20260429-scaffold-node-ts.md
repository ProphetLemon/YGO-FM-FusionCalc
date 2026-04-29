# PLAN: scaffold-node-ts

SPEC: [.sdd/specs/20260429-scaffold-node-ts.md](../specs/20260429-scaffold-node-ts.md)
Estado: APROBADO (sustituido por v3)

## Archivos a modificar

Lista cerrada. Solo estos archivos preexistentes se tocan; cualquier otro queda intacto.

- [.gitignore](../../.gitignore) — añadir `node_modules/`, `dist/`, `public/dist/`, `.env`, `coverage/`, `playwright-report/`, `test-results/`, `.vite/`. No se elimina ninguna entrada existente.
- [README.md](../../README.md) — sustituir la sección "How to Use the Calculator" por instrucciones locales (`npm install`, `npm run dev`) y mencionar que el despliegue es Render. Conservar el resto (special thanks, project notes).

## Archivos nuevos

Verificado que ninguno existe ya en el repo. Cualquier ruta que ya exista se trata como "modificar" (ver bloque anterior).

### Configuración del entorno

- `package.json` — manifest npm. Define `engines.node = "24.x"`, dependencias, devDependencies, scripts y `type: "module"`.
- `package-lock.json` — generado por npm tras `npm install`. Se commitea.
- `.nvmrc` — contiene `24`.
- `.env.example` — plantilla con `PORT=3000`, `NODE_ENV=development`, `LOG_LEVEL=info`.

### TypeScript

- `tsconfig.json` — base. `strict`, `noUncheckedIndexedAccess`, `target: ES2022`, `moduleResolution: NodeNext`, `paths` para `@shared/*` y `@server/*` (preparado, aún sin uso).
- `tsconfig.server.json` — extiende base. `module: NodeNext`, `outDir: dist/server`, `rootDir: src/server`, `include: ["src/server/**/*", "src/shared/**/*"]`.
- `tsconfig.client.json` — extiende base. `module: ESNext`, `noEmit: true`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `include: ["src/client/**/*", "src/shared/**/*"]`.

### Bundling y estilos

- `vite.config.ts` — configuración base. `root: "src/client"`, `build.outDir: "../../public/dist"`, `build.emptyOutDir: false` (para no borrar `styles.css` de Tailwind), entries vacías de momento (Vite no se invoca aún en build:client).
- `tailwind.config.ts` — `content: ["./views/**/*.ejs", "./src/client/**/*.ts"]`. Sin theme custom todavía.
- `src/client/styles/tailwind.css` — fuente Tailwind con `@import "tailwindcss";` (sintaxis Tailwind 4).

### Servidor Express

- `src/server/index.ts` — entry. Importa `app` y arranca `app.listen(config.port)`. Loggea arranque.
- `src/server/app.ts` — composición Express. Registra `pino-http`, sirve `public/` con `express.static`, define cuatro rutas explícitas con `res.sendFile` para servir los HTML actuales desde la raíz, registra error handler.
- `src/server/config.ts` — lee y valida `process.env.PORT`, `NODE_ENV`, `LOG_LEVEL`. Exporta objeto `config` tipado. Aborta arranque con error claro si una variable obligatoria falla validación.
- `src/server/logger.ts` — instancia pino exportada. Nivel desde `config.logLevel`.

### Tests

- `vitest.config.ts` — `test.environment: "node"`, `test.include: ["tests/unit/**/*.test.ts"]`, coverage `provider: "v8"`, `thresholds.lines/functions/branches/statements: 80`. Threshold no se enforce en este paso (`--coverage` informa, no rompe; gate manual).
- `playwright.config.ts` — `webServer.command: "npm run start"`, `webServer.port: 3000`, `testDir: "tests/e2e"`, project Chromium en `last 2`.
- `tests/unit/server/config.test.ts` — verifica que `config` parsea env vars correctamente y aborta con `LOG_LEVEL` inválido.
- `tests/e2e/smoke.spec.ts` — abre `/`, verifica que `<title>` contiene `Yu-Gi-Oh`. Abre `/fusion-search.html`, `/fusion-calculator.html`, `/about.html` y verifica que devuelven 200 y contienen el navbar.

### Despliegue

- `render.yaml` — describe Web Service: `type: web`, `env: node`, `plan: free`, `buildCommand: npm ci && npm run build`, `startCommand: npm start`, `envVars` con `NODE_ENV=production` y `LOG_LEVEL=info`.

## Pasos de implementación

Cada paso es ejecutable de principio a fin. Tras cada paso se presenta el diff y se continúa salvo orden de detener.

### Paso 1 — Bootstrap de npm y TypeScript

1.1. Crear `package.json` con `name`, `version: "0.9.0"`, `private: true`, `type: "module"`, `engines.node: "24.x"`, scripts placeholder, dependencias y devDependencies.

- Dependencias runtime: `express@^5`, `ejs@^3` (instalado para no reinstalar en SPEC siguiente; no se usa aún), `pino@^9`, `pino-http@^10`, `dotenv@^16`.
- DevDependencies: `typescript@^5`, `tsx@^4`, `@types/node@^22`, `@types/express@^5`, `vite@^6`, `tailwindcss@^4`, `@tailwindcss/cli@^4`, `vitest@^3`, `@vitest/coverage-v8@^3`, `@playwright/test@^1.5`, `prettier@^3`.
  1.2. Crear `.nvmrc` con `24`.
  1.3. Crear `tsconfig.json`, `tsconfig.server.json`, `tsconfig.client.json`.
  1.4. Ejecutar `npm install`. Verificar que `package-lock.json` se genera.
  1.5. Ejecutar `npm run typecheck` (sin código todavía, debe pasar como no-op o con stubs).

### Paso 2 — Servidor Express mínimo

2.1. Crear `src/server/config.ts` con validación de env vars y export tipado.
2.2. Crear `src/server/logger.ts` con pino configurado.
2.3. Crear `src/server/app.ts`:

- Middleware `pino-http`.
- `express.static(path.join(__dirname, "../../public"))` mapeado a `/public`.
- Cuatro rutas explícitas: `app.get("/", res.sendFile("index.html"))` y equivalentes para los otros tres HTML.
- Error handler que loggea y devuelve 500 genérico.
  2.4. Crear `src/server/index.ts` que importa `app` y arranca con `app.listen`.
  2.5. Verificar `npm run typecheck` pasa.
  2.6. Ejecutar `npm run build:server` (compila a `dist/server/`).
  2.7. Ejecutar `node dist/server/index.js` y comprobar manualmente con `curl` que las cuatro rutas devuelven 200 con el HTML correcto.

### Paso 3 — Vite y Tailwind configurados

3.1. Crear `vite.config.ts` con root y outDir definidos. Sin entries.
3.2. Crear `tailwind.config.ts`.
3.3. Crear `src/client/styles/tailwind.css` con `@import "tailwindcss";`.
3.4. Añadir scripts npm:

- `build:css`: `tailwindcss -i src/client/styles/tailwind.css -o public/dist/styles.css`.
- `build:client`: en este paso, `node -e "console.log('no client entries yet, skipping')"`.
- `build:server`: `tsc -p tsconfig.server.json`.
- `build`: `npm run typecheck && npm run build:client && npm run build:css && npm run build:server`.
  3.5. Ejecutar `npm run build`. Verificar que `dist/server/` y `public/dist/styles.css` se generan.

### Paso 4 — Tests

4.1. Crear `vitest.config.ts`.
4.2. Crear `tests/unit/server/config.test.ts` con dos casos: parseo correcto y rechazo de `LOG_LEVEL` inválido.
4.3. Ejecutar `npm test`. Verificar que pasa con cobertura > 0.
4.4. Crear `playwright.config.ts`.
4.5. Crear `tests/e2e/smoke.spec.ts` con cuatro asserts (uno por página).
4.6. Ejecutar `npx playwright install chromium` (manual la primera vez).
4.7. Ejecutar `npm run test:e2e`. Verificar que pasa contra `npm start` levantado por `webServer`.

### Paso 5 — Configuración de despliegue

5.1. Crear `render.yaml` con la configuración del Web Service.
5.2. Crear `.env.example`.
5.3. Modificar `.gitignore` añadiendo las nuevas entradas listadas. No alterar las existentes.
5.4. Verificar que `git status` no muestra `node_modules/`, `dist/`, `public/dist/`, `.env`, `coverage/`, `playwright-report/`, `test-results/`, `.vite/` como cambios.

### Paso 6 — Scripts npm finales y formato

6.1. Completar la sección `scripts` de `package.json` con todos los scripts definidos en la SPEC:

- `dev`, `build`, `build:server`, `build:client`, `build:css`, `start`, `typecheck`, `test`, `test:watch`, `test:e2e`, `format`, `format:check`.
  6.2. Ejecutar `npm run format`. Asegurar que todos los archivos nuevos quedan formateados según `.prettierrc`.
  6.3. Ejecutar `npm run format:check`. Debe pasar.

### Paso 7 — README

7.1. Modificar [README.md](../../README.md) sustituyendo solo la sección "How to Use the Calculator" por bloque con:

- Requisitos: Node 24.
- Pasos: `nvm use`, `npm install`, `npm run dev`.
- Build y start: `npm run build && npm start`.
- Despliegue: mención breve a Render con `render.yaml`.
  7.2. Conservar el resto del README intacto (project notes, special thanks, etc.).

### Paso 8 — Validación local completa

8.1. Borrar `node_modules/`, `dist/`, `public/dist/`. Ejecutar `npm ci`. Debe terminar limpio.
8.2. Ejecutar `npm run typecheck`. Debe pasar.
8.3. Ejecutar `npm run build`. Debe pasar.
8.4. Ejecutar `npm test`. Debe pasar.
8.5. Ejecutar `npm run test:e2e`. Debe pasar.
8.6. Ejecutar `npm run format:check`. Debe pasar.
8.7. Ejecutar `npm start` y comparar visualmente las cuatro páginas con su versión actual en GitHub Pages. Capturas o revisión manual.

### Paso 9 — Despliegue a Render (validación de infraestructura)

9.1. El usuario crea el servicio en Render conectando el repo, o aplica el `render.yaml`.
9.2. Esperar primer build. Verificar que pasa `npm ci && npm run build`.
9.3. Verificar que `npm start` levanta el servicio y las cuatro rutas responden 200.
9.4. Verificar visualmente en la URL pública de Render que el sitio se ve igual que la versión actual.

## Validación

Mapeo criterio → cómo se comprueba.

1. **Instalación limpia** → `rm -rf node_modules && npm ci` en CI mental local; sin warnings de peer deps no resueltos.
2. **Typecheck** → `npm run typecheck` exit 0.
3. **Build completo** → `npm run build` exit 0; verificar existencia de `dist/server/index.js` y `public/dist/styles.css`.
4. **Arranque local** → `npm start` muestra log `server listening on :3000` y `npm run dev` recarga al editar `src/server/`.
5. **Páginas accesibles** → `curl -I http://localhost:3000/` y las otras tres rutas devuelven 200; `curl http://localhost:3000/` contiene `<title>Yu-Gi-Oh!`.
6. **Estáticos accesibles** → `curl -I` a `/public/images/logo.png`, `/public/styles/home.css`, `/public/javascripts/fusionCalc.js` devuelven 200.
7. **Render visual idéntico** → captura manual de cada página en local vs versión actual de GitHub Pages.
8. **Vitest verde** → `npm test` exit 0; reporte de cobertura impreso.
9. **Playwright verde** → `npm run test:e2e` exit 0.
10. **Format** → `npm run format:check` exit 0.
11. **`render.yaml` válido** → `npx js-yaml render.yaml` parsea sin error y revisión manual de campos.
12. **`.env.example` y `.gitignore`** → inspección manual.
13. **Sin regresión en datos** → `git diff --stat data/ public/` vacío.
14. **README** → revisión manual: alguien que clone debe poder arrancar en <30 s leyendo solo el README.

Validación adicional de infraestructura (criterios fuera de la lista numerada pero implicados por la SPEC):

- Despliegue Render exitoso: build verde + servicio activo + las cuatro páginas accesibles en la URL pública.

## Rollback

El cambio es aditivo en su mayor parte; el rollback es directo.

1. Si el PLAN se ejecuta en una rama (recomendado: `feat/scaffold-node-ts`), descartar la rama: `git branch -D feat/scaffold-node-ts`. La rama `master` queda intacta.
2. Si parte del PLAN se mergeó a `master` y hay que revertir:
    - `git revert <commit-merge>` o serie de reverts si hay varios commits.
    - Eliminar el servicio en Render desde el panel para evitar costes (aunque sea free tier, evita ruido en logs).
    - Restaurar despliegue de GitHub Pages activando Pages en Settings → Pages, branch `master`, root.
3. Verificar que el sitio público vuelve a funcionar en GitHub Pages tras unos minutos de propagación.
4. Si el rollback ocurre tras pasos 1-7 pero antes del 9 (despliegue Render), no hay nada que limpiar en Render.

No se ejecuta ningún cambio destructivo (delete de archivos existentes) en este PLAN. Los archivos preexistentes solo se modifican aditivamente o por sustitución parcial controlada (`.gitignore`, `README.md`).
