# Conventions

Estado: BORRADOR
Última actualización: 2026-04-29

Reglas de estilo, nombrado, patrones y prácticas que el código del proyecto debe respetar. Las violaciones a este documento son motivo para rechazar un PLAN o un PR sin debate.

## Idioma

- **Documentos SDD** (`.sdd/`): español de España.
- **Commits y nombres de ramas**: inglés.
- **Código fuente** (identificadores, comentarios, logs, tests): inglés.
- **UI visible al usuario**: depende del idioma activo (i18n). Las claves siempre están en inglés.
- **README y docs públicos**: inglés.

## Formato

- **Prettier** es la única autoridad sobre formato. Configuración en `.prettierrc`.
- No se discute formato en revisiones. Si Prettier lo acepta, está bien.
- `npm run format` formatea todo el repo. `npm run format:check` falla si hay archivos sin formatear.
- No se introduce ESLint.

## TypeScript

- `strict: true` en todos los `tsconfig`. Esto incluye `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`.
- Prohibido `any`. Si es inevitable, usar `unknown` y estrechar con type guards.
- Prohibido `@ts-ignore`. Usar `@ts-expect-error` con comentario justificando, o solucionar el tipo.
- Tipos públicos exportados llevan nombre explícito (interface o type alias). No exportar tipos inferidos.
- `import type` para imports usados solo en posiciones de tipo.
- `enum` evitado salvo para constantes con etiqueta legible. Preferir uniones de string literals.
- Errores tipados como subclase de `Error`, nunca como objeto plano ni `string`.

## Nombrado

- **Variables, funciones, métodos**: `camelCase`.
- **Tipos, interfaces, clases**: `PascalCase`.
- **Constantes module-level inmutables**: `SCREAMING_SNAKE_CASE` solo si representan un valor canónico (`DEFAULT_LANG`, `MAX_HAND_SIZE`). Las demás `camelCase`.
- **Archivos `.ts`, `.ejs`**: `kebab-case`.
- **Carpetas**: `kebab-case`.
- **Tests**: nombre del archivo bajo prueba + `.test.ts` o `.spec.ts` (Vitest unit / Playwright E2E).
- **Campos de datos JSON existentes** (`Cards.json` etc.): se conserva `PascalCase` (`Name`, `Type`, `Attack`) por compatibilidad con la fuente. El resto del código usa `camelCase` y mapea en la frontera.
- **Booleanos**: prefijo `is`, `has`, `can`, `should` (`isMonster`, `hasFusion`).

## Estructura de funciones y módulos

- Una función pública por export por archivo es ideal. Si son varias, deben ser cohesionadas y compartir dominio.
- Funciones puras siempre que sea posible. La capa `domain/` es íntegramente pura.
- Argumentos: si una función toma >3 parámetros, refactorizar a un objeto de opciones tipado.
- Nada de "default exports" salvo cuando el framework lo exige (ej. `vite.config.ts`). Preferir named exports.

## Comentarios

- Por defecto, no comentar.
- Comentar solo el **porqué** no obvio: una restricción oculta, una decisión que sorprendería a un lector futuro, un workaround. Nunca explicar lo que el código ya dice.
- Sin TODOs sin issue/SPEC asociado. Si dejas un TODO, enlaza a la SPEC que lo justifica (`// TODO(spec:20260501-foo): ...`).
- Sin docstrings multi-párrafo. Una línea es suficiente.

## Manejo de errores

- En servidor: errores en handlers HTTP suben hasta el middleware de error, que decide código y body. Los handlers no atrapan para devolver 500 manualmente.
- En cliente: errores de red se transforman en mensajes traducidos visibles al usuario. Nunca se silencian.
- `try/catch` solo donde se puede recuperar de forma significativa. No para "mantener el flujo".
- Validación de payloads de API: en el handler, antes de pasar a `domain/`. Si el payload es inválido, responder `400` con detalle.

## Logging

- Usar `pino` (servidor). Nunca `console.log`/`console.error` en código de producción.
- Niveles:
    - `fatal`: el proceso no puede continuar.
    - `error`: operación falló pero el proceso sigue.
    - `warn`: condición inesperada pero recuperable.
    - `info`: arranque, parada, eventos relevantes.
    - `debug`: detalles de desarrollo.
- Logs estructurados (objeto + mensaje), nunca string concatenado.
- No loggear datos sensibles. Para este proyecto significa: no loggear cuerpos completos de POSTs grandes (manos del usuario son ok, pero limitar a IDs).

## HTTP / API

- Endpoints REST bajo `/api/`.
- Verbos: `GET` para lectura, `POST` para operaciones que requieren body (cálculo de cadenas), `PUT/PATCH/DELETE` reservados para futuro estado de usuario.
- Respuestas siempre JSON con `Content-Type: application/json`.
- Errores con shape consistente: `{ error: { code: string, message: string, details?: unknown } }`.
- Códigos HTTP correctos: 200/201/204 para éxito, 400 validación, 404 no encontrado, 500 error servidor. Sin 200 con `error: true` en el body.
- IDs en path (`/api/cards/:id`), filtros y paginación en query string.
- Versionado: por ahora ninguno. Si rompemos la API públicamente, prefijar `/api/v2/`.

## Datos y modelos

- Los datos del juego (`Cards.json`, derivados) son **inmutables en runtime**. Cargar al arranque, nunca mutar.
- Acceso siempre por los índices del store (`cardsById`, etc.), no recorriendo arrays.
- Validar la integridad de los JSON al arrancar. Si falla, el servidor no arranca.

## Internacionalización

- Toda string visible al usuario pasa por el helper `t(key, lang)`.
- Claves en `kebab-case` con namespace por feature: `calculator.add-slot`, `search.no-results`.
- Las dos catálogos (`es`, `en`) deben tener exactamente el mismo conjunto de claves. Falta de paridad rompe el build (test específico).
- Interpolación: `{{ variable }}`. Prohibido concatenar strings traducidas.

## Tests

- **Vitest** para unitarios. Cobertura mínima 80%.
- **Playwright** para E2E. Cubre flujos críticos sin pretender cobertura.
- Cada función de `domain/` tiene test unitario. Se asume que sin tests un PR no se mergea.
- Tests con AAA: arrange / act / assert. No tests con múltiples asserts no relacionados.
- Mocks: solo en frontera (FS, red). Las funciones puras se prueban directamente.
- Fixtures pequeñas, repetibles, en `tests/fixtures/`.
- E2E corre contra el servidor real levantado por la propia suite (Playwright `webServer`).

## Commits

- **Conventional Commits**. Tipos permitidos: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `style`, `perf`, `build`, `ci`.
- Scope opcional pero recomendado: `feat(calculator): add dynamic slots`.
- Asunto en imperativo presente, sin punto final, ≤72 caracteres.
- Cuerpo opcional explica el porqué. Mensajes triviales no necesitan cuerpo.
- Un commit = un cambio coherente. No mezclar refactor con feature.
- Sin co-author de Claude/IA salvo que se pida explícitamente.

## Ramas y PRs

- Rama base: `master`.
- Nombres: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`. El slug coincide con el de la SPEC cuando aplica.
- PR enlaza la SPEC y el PLAN aprobados.
- PR no se mergea si:
    - Tests fallan localmente (no hay CI por ahora; verificar manualmente).
    - Cobertura unitaria cae por debajo del 80%.
    - Hay archivos modificados fuera del PLAN.
    - Faltan claves i18n en alguno de los idiomas.

## Render y entorno

- `.env.example` se mantiene actualizado con todas las variables que el código lee.
- El código nunca asume valores hardcoded para `PORT`, `NODE_ENV` o `LOG_LEVEL` fuera de `config.ts`.
- `config.ts` valida y tipa las env vars al arrancar. Falta de variable obligatoria → arranque falla con mensaje claro.

## Flujo SDD vinculante

- No se inicia código de producción sin SPEC y PLAN aprobados.
- Cada feature tiene su SPEC en `.sdd/specs/yyyymmdd-slug.md` y su PLAN en `.sdd/plans/yyyymmdd-slug.md`.
- Cuando un PR se mergea, los archivos SPEC y PLAN pasan a `Estado: COMPLETADO` y enlazan al commit/PR.
- Excepciones (sin SPEC/PLAN): typos en strings/docs, formateo automático, renombrado local sin impacto, tests aislados, configuración de entorno de desarrollo. Cualquier otra cosa requiere flujo completo.

## Performance

- Premature optimization fuera. Medir antes de optimizar.
- Cargar de FS solo al arranque. Endpoints de API leen del store.
- Bundles cliente: cada página carga solo su entry. No bundle global.
- Imágenes: `loading="lazy"` por defecto excepto las above-the-fold.

## Accesibilidad y semántica

- HTML semántico (`<header>`, `<main>`, `<nav>`, `<section>`, `<article>`, `<footer>`).
- Inputs con `<label>` asociado. Botones con texto legible o `aria-label`.
- Color contrast mínimo AA. Tailwind con clases utilitarias respetando paleta accesible.
- Atributos `lang` en `<html>` reflejan el idioma activo.

## Dependencias

- Antes de añadir una dependencia npm: justificar en el PLAN. ¿Cuánto pesa, está mantenida, hay alternativa nativa?
- Sin dependencias en sólo-`devDependencies` que se importen desde código de runtime.
- Actualizar dependencias en PR separado dedicado, no mezclado con features.

## Anti-patrones explícitamente prohibidos

- Reintroducir jQuery, Bootstrap, TaffyDB o scripts Ruby.
- Globales `window.<algo>` para compartir estado entre módulos cliente. Usar imports.
- `var`. Solo `const` y, excepcionalmente, `let`.
- Mutar parámetros de función.
- Strings concatenadas para HTML (XSS). Usar plantillas EJS o nodos DOM.
- `innerHTML` con datos no sanitizados.
- Capturar errores y devolver `null` silenciosamente.
- "Magic numbers" sin nombre. Si aparece `5` para "max hand", debe ser `MAX_HAND_SIZE`.
