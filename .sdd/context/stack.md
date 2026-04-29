# Stack

Estado: BORRADOR
Última actualización: 2026-04-29

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
- **Awesomplete** se conserva como dependencia npm (autocompletado del input de cartas) salvo que durante implementación encontremos un sustituto trivial.
- **jQuery se elimina**. Toda manipulación de DOM en cliente usa APIs nativas.
- **TaffyDB se elimina**. Las consultas in-memory pasan a estructuras nativas (`Map<id, Card>`, índices propios).

## Build y bundling

- **Vite 6.x** para empaquetar los scripts de cliente a `public/dist/`.
- **Tailwind CLI** genera `public/dist/styles.css` desde `src/client/styles/tailwind.css`.
- **tsx** para ejecutar scripts TS de mantenimiento (regeneración de datos, etc.) sin compilación previa.
- **tsc** compila el código del servidor a `dist/server/`.
- En producción (Render), `npm run build` ejecuta: typecheck + bundle cliente + Tailwind + compilación servidor.

## Datos

- Fuente de verdad: `data/Cards.json`.
- Derivados (`fusions.json`, `equips.json`, `results.json`) generados por script Node TS en `src/scripts/`.
- Los scripts Ruby existentes (`scripts/*.rb`) se reescriben a TS y se eliminan.

## Tipos compartidos

- Tipos comunes (`Card`, `Fusion`, `Equip`, `Result`) viven en `src/shared/types.ts`.
- Importados tanto por servidor (`src/server/`) como por cliente (`src/client/`).

## Testing

- **Vitest 3.x** para tests unitarios (servidor, cliente y `shared`).
- **Playwright 1.5x** para tests E2E contra el servidor levantado en local.
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
- Detección automática vía `navigator.language` con fallback a `es`. Selector manual visible que sobrescribe la detección y persiste en `localStorage`.

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
- Scripts Ruby

## Versionado del proyecto

- Versión en `package.json`. Bump manual siguiendo SemVer.
- Sin changelog automatizado por ahora.
