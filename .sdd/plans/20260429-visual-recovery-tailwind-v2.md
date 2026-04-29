# PLAN: visual-recovery-tailwind (v2)

SPEC: [.sdd/specs/20260429-visual-recovery-tailwind-v2.md](../specs/20260429-visual-recovery-tailwind-v2.md)
Versión anterior: [20260429-visual-recovery-tailwind.md](20260429-visual-recovery-tailwind.md) (APROBADO, sustituida)
Estado: COMPLETADO

Commits: c08d1ea (implementación), c283cea (estado APROBADO).
Despliegue verificado: https://ygo-fm-fusion-calc.onrender.com/

## Motivo de la ampliación

El PLAN v1 asumía que Bootstrap podía coexistir con Tailwind cargándolo en una `@layer` de menor prioridad. El experimento durante la implementación demostró que las colisiones de nombres de clase con `!important` (Bootstrap 4 marca todas sus utilidades con `!important`) hacen imposible esta coexistencia. Esta v2 elimina Bootstrap y porta las strings HTML del JS legacy a clases Tailwind.

## Cambios respecto a v1

### Archivos a modificar (delta v1 → v2)

Se añaden dos archivos al alcance:

- [public/javascripts/fusionSearch.js](../../public/javascripts/fusionSearch.js) — sustituir las clases Bootstrap en las strings HTML inyectadas por equivalentes Tailwind. Sin tocar lógica.
- [public/javascripts/fusionCalc.js](../../public/javascripts/fusionCalc.js) — idem.

Se modifican adicionalmente (o de forma diferente a v1):

- [src/server/http/routes/views.ts](../../src/server/http/routes/views.ts) — eliminar `bootstrap.min.css` de `LEGACY_SEARCH_STYLES` y `LEGACY_CALCULATOR_STYLES`. Mantener `normalize.css`, `awesomplete.css` y `fusioncustom.css`.
- [views/partials/head.ejs](../../views/partials/head.ejs) — revertir el `<style>@import ... layer(legacy)</style>` que añadimos en la implementación v1. Volver a `<link rel="stylesheet">` simples para `pageStyles` (sin scoping de capas, ya no hay Bootstrap que escapar).
- [src/client/styles/tailwind.css](../../src/client/styles/tailwind.css) — eliminar la línea `@layer legacy, theme, base, components, utilities;` añadida en v1 (innecesaria sin Bootstrap).
- [tests/e2e/visual.spec.ts](../../tests/e2e/visual.spec.ts) — invertir el test "search page still loads Bootstrap CSS for legacy markup". Sustituir por dos tests:
    - "no page loads Bootstrap CSS" (asserta sobre las cuatro rutas).
    - "navbar computed styles match across pages" (asserta `expect(home).toEqual(calc)` sobre `maxWidth`, `padding`, `color`).

Se revisan (sin cambios estructurales):

- [public/styles/bootstrap.min.css](../../public/styles/bootstrap.min.css) — **no se elimina del repo**. Queda como artefacto histórico hasta paso 3, que limpiará todos los assets legacy de una vez.

### Mapeo de clases Bootstrap → Tailwind

Reemplazos exactos a aplicar en `fusionSearch.js` y `fusionCalc.js`. Cualquier clase que aparezca en strings HTML de los archivos pero no esté listada se conserva o se discute al implementar.

| Bootstrap      | Tailwind                                                          |
| -------------- | ----------------------------------------------------------------- |
| `card`         | `block rounded-lg border border-fm-primary/30 bg-white shadow-sm` |
| `card-body`    | `p-4`                                                             |
| `card-text`    | `mb-2 text-sm`                                                    |
| `border-dark`  | `border-black`                                                    |
| `mb-3`         | `mb-3` (Tailwind tiene equivalente exacto)                        |
| `ml-1`         | `ml-1` (idem)                                                     |
| `row`          | `flex flex-wrap`                                                  |
| `no-gutters`   | `gap-0`                                                           |
| `col`          | `flex-1`                                                          |
| `text-dark`    | `text-fm-primary`                                                 |
| `alert`        | `block rounded p-3`                                               |
| `alert-danger` | `bg-red-100 text-red-800 border border-red-300`                   |
| `text-center`  | `text-center` (idem)                                              |
| `my-4`         | `my-4` (idem)                                                     |
| `center`       | `text-center`                                                     |

## Pasos de implementación (delta v2)

Reemplazan los pasos 5 y siguientes del PLAN v1 (los 1-4 ya están hechos).

### Paso 5 — Drop Bootstrap CSS

5.1. Modificar `src/server/http/routes/views.ts`: eliminar `"/public/styles/bootstrap.min.css"` de `LEGACY_SEARCH_STYLES` y `LEGACY_CALCULATOR_STYLES`.
5.2. Revertir `views/partials/head.ejs` a la forma simple (`<link>` para cada `pageStyles`, sin `<style>` ni `@import-layer`).
5.3. Eliminar la línea `@layer legacy, theme, base, components, utilities;` de `src/client/styles/tailwind.css`.
5.4. Ejecutar `npm run build`. Verificar OK.
5.5. Ejecutar smoke con `curl` que `bootstrap.min.css` ya no aparece en el HTML de `/search` ni `/calculator`.

### Paso 6 — Port de strings HTML del JS legacy

6.1. En `public/javascripts/fusionSearch.js`, identificar las funciones que generan HTML (`createSideCard`, `fusesToHTML`, `createDangerMessage`). Sustituir cada clase Bootstrap por su equivalente Tailwind según la tabla de mapeo. Mantener IDs y la lógica intactos.
6.2. En `public/javascripts/fusionCalc.js`, sustituir clases Bootstrap en `fusesToHTML` (y cualquier otro generador de HTML). Mantener lógica.
6.3. Ejecutar `npm run build:css` (Tailwind no detecta clases dentro de strings JS — añadir `public/javascripts/fusion*.js` a `content` de Tailwind config si fuera necesario).
6.4. Si Tailwind no genera las clases utilizadas en los JS porque el escáner no los lee, ampliar `tailwind.config.ts` con `content: [..., "./public/javascripts/fusion*.js"]`.
6.5. Verificar manualmente abriendo `/search` y `/calculator` en navegador y haciendo una búsqueda real: tarjetas de resultados visibles y bien estilizadas.

### Paso 7 — Tests E2E

7.1. Eliminar el test "search page still loads Bootstrap CSS for legacy markup" en `tests/e2e/visual.spec.ts`.
7.2. Añadir test "no page loads Bootstrap CSS": iterar `[/, /search, /calculator, /about]` y verificar que el HTML no contiene `bootstrap.min.css`.
7.3. Añadir test "navbar computed styles match across pages": probe `maxWidth` y `color` del navbar y comparar con `expect(home).toEqual(...)` para las otras tres páginas.
7.4. Ejecutar `npm run test:e2e`. Todos verdes.

### Paso 8 — Validación local completa

8.1. `npm run build && npm test && npm run test:e2e && npm run format:check`. Todo verde.
8.2. `npm start` y validación manual del usuario en navegador.

### Paso 9 — Commit y push (combinado con `pages-to-ejs-i18n` y `visual-recovery-tailwind` v1+v2)

9.1. Tres commits a master sin push intermedio: - `feat(views)`: cambios de `pages-to-ejs-i18n` (paso 2 anterior, todos los archivos del paso 2). - `feat(ui)`: cambios de `visual-recovery-tailwind` (combinando v1 + v2 ya que la v1 nunca se commiteó). - `docs(sdd)`: marca SPECs y PLANs como APROBADO.
9.2. `git push origin master`. Render redespliega.

### Paso 10 — Despliegue Render y cierre

10.1. Tras Render verde, abrir https://ygo-fm-fusion-calc.onrender.com/ y confirmar identidad y funcionalidad.
10.2. Commit `docs(sdd)` que mueve las SPECs `pages-to-ejs-i18n` y `visual-recovery-tailwind` (v1 y v2) a `Estado: COMPLETADO` con commit hashes.

## Validación

Mapeo criterios SPEC v2 → comprobaciones:

1-10. Idénticos a v1 (build, typecheck, tests, fonts, backgrounds, paleta...). 11. **Sin Bootstrap en ninguna página** → test E2E "no page loads Bootstrap CSS".
11-bis. **Identidad uniforme** → test E2E que compara computed styles del navbar entre páginas. 12. **Funcionalidad legacy** → verificación manual del usuario. 13. **Tarjetas de resultados consistentes** → verificación manual. 14. **Render verde** → curl sobre la URL pública.

## Rollback

Igual que v1, plus:

- Si `fusionSearch.js`/`fusionCalc.js` rompen funcionalmente tras el port de clases, revert a la versión anterior del archivo. Las páginas `/search` y `/calculator` volverían a tener tarjetas sin estilo (Bootstrap fue eliminado), pero la funcionalidad debe seguir.
- Si la apariencia es inaceptable, revert completo de v1 + v2 nos deja con el estado tras `pages-to-ejs-i18n` (Tailwind solo en plantillas, sin identidad recuperada). Es un fallback funcional aunque feo.
