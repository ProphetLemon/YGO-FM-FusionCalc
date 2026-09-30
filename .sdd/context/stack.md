# Stack

Estado: BORRADOR
Última actualización: 2026-09-30

## Runtime y lenguajes

- **Node.js**: 24.x (LTS activa en abril 2026). Fijar versión en `.nvmrc` y en `engines` de `package.json`.
- **TypeScript**: 5.x. `strict: true`. Target `ES2022`, módulos `NodeNext` para servidor; `ES2022` con bundler para cliente.
- **npm**: gestor de paquetes. No se usan workspaces (monorepo de directorio único).

## Servidor

- **Express 5.x** como framework HTTP.
- **EJS 3.x** como motor de plantillas. Vistas en `views/` (raíz).
- **pino 9.x** + **pino-http 10.x** para logging estructurado.
- **dotenv 16.x** para cargar variables de entorno desde `.env`.
- Sin BBDD por ahora. Datos servidos desde JSON estático en disco (`data/`), cargados en memoria al arrancar el servidor.

## Cliente

- **EJS** renderizado en servidor (no SPA). Cada vista es una página independiente.
- **TypeScript** transpilado a JS para los scripts de cliente.
- **Tailwind CSS 4.x** vía CLI oficial. Reemplaza completamente a Bootstrap. Sin coexistencia: la migración es total.
- **Autocompletado propio** (`src/client/components/autocomplete.ts`, con el ranking de `src/client/lib/name-search.ts`): Awesomplete se descartó y no es dependencia.
- **jQuery se elimina**. Toda manipulación de DOM en cliente usa APIs nativas.
- **TaffyDB se elimina**. Las consultas in-memory pasan a estructuras nativas (`Map<id, Card>`, índices propios).

## Build y bundling

- **Vite 6.x** para empaquetar los scripts de cliente a `public/dist/`.
- **Tailwind CLI** genera `public/dist/styles.css` desde `src/client/styles/tailwind.css`.
- **tsx** ejecuta el servidor en desarrollo sin compilar (`npm run dev`, vía `nodemon.json`). Está previsto usarlo también para los scripts TS de mantenimiento (ver «Datos»).
- **tsc** compila el código del servidor a `dist/server/`.
- En producción (Render), `npm run build` ejecuta: typecheck + bundle cliente + Tailwind + compilación servidor.

## Datos

- Fuente de verdad: `data/Cards.json`.
- Derivados (`fusions.json`, `equips.json`, `results.json`) generados por `scripts/make_databases.rb` (Ruby).
- Pendiente: reescribir los scripts Ruby (`scripts/*.rb`) a TS en `src/scripts/` y eliminarlos.

## Tipos compartidos

- Tipos comunes (`Card`, `Fusion`, `Equip`, `Result`) viven en `src/shared/types.ts`.
- Importados tanto por servidor (`src/server/`) como por cliente (`src/client/`).

## Testing

- **Vitest 3.x** para tests unitarios (servidor, cliente y `shared`).
- **Playwright 1.5x** para tests E2E contra la app compilada, levantada en local con `npm run start` (hay que ejecutar `npm run build` antes).
- Umbral mínimo de cobertura: **80%** statements/branches/functions/lines, medido con `@vitest/coverage-v8`.
- E2E no cuenta para el porcentaje; cubre los flujos críticos (búsqueda, calculadora, cambio de idioma).

## Calidad de código

- **Prettier** ya configurado en `.prettierrc`. Se conserva.
- **No se introduce ESLint** (decisión explícita del usuario).
- Convención de commits: **Conventional Commits** (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`).

## i18n

- Idioma por defecto: **español**.
- Idiomas soportados inicialmente: `es`, `en`.
- Mecanismo: solución casera basada en JSON (`src/shared/i18n/{es,en}.json`), sin librería externa.
- Detección en servidor: cookie `lang`, luego cabecera `Accept-Language`, con fallback a `es`. Selector manual visible (formulario `POST /lang`) que fija la cookie `lang`.

## Despliegue

- **Render** como único entorno productivo, plan **free**.
- **Single deployment**: un Web Service de Render sirve API y estáticos.
- Implicación del free tier: cold start tras inactividad (~15 min). El arranque debe ser rápido (carga de JSON in-memory bajo el segundo).
- Configuración de despliegue en `render.yaml` versionado.
- Sin CI/CD por ahora (decisión explícita del usuario).

## Variables de entorno

- `PORT` — puerto del servidor (Render lo inyecta).
- `NODE_ENV` — `development` | `production`.
- `LOG_LEVEL` — nivel de pino (`info` por defecto, `debug` en local).
- No hay secretos previstos en este momento.

## Navegadores objetivo

- Últimas 2 versiones de Chrome, Firefox, Edge y Safari evergreen.
- Sin polyfills para legacy.

## Dependencias que se eliminan respecto al estado actual

- jQuery
- Bootstrap (CSS y JS)
- TaffyDB
- Scripts Ruby (pendiente: siguen en `scripts/`)

## Versionado del proyecto

- Versión en `package.json`. Bump manual siguiendo SemVer.
- Sin changelog automatizado por ahora.
