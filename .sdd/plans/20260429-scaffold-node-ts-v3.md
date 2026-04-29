# PLAN: scaffold-node-ts (v3)

SPEC: [.sdd/specs/20260429-scaffold-node-ts.md](../specs/20260429-scaffold-node-ts.md)
Versión anterior: [20260429-scaffold-node-ts-v2.md](20260429-scaffold-node-ts-v2.md) (APROBADO)
Estado: COMPLETADO

Commits: 60c1cee (implementación), 668eb5d (fix Render).
Despliegue verificado: https://ygo-fm-fusion-calc.onrender.com/

## Motivo de la ampliación

Durante el Paso 6 (`npm run format`), Prettier reformateó archivos fuera del alcance permitido por el PLAN. Concretamente, modificó:

- `data/*` (todos los `.json` y `.js` derivados) — viola el criterio 13 de la SPEC ("`data/` no se modifica").
- `index.html`, `about.html`, `fusion-search.html` — viola el criterio 5 ("HTML actual sin modificación").
- `public/javascripts/*.min.js` (jquery, bootstrap, awesomplete vendored) y `taffy.js`, `fusionCalc.js` — modificación de assets vendored y de scripts existentes que la SPEC explícitamente preserva accesibles.
- `public/styles/*` (incluido `bootstrap.min.css`).

Las modificaciones se han revertido con `git checkout`. Para que el Paso 6 pueda completarse sin volver a romper el alcance, se requiere añadir un `.prettierignore` que limite Prettier a los archivos que esta SPEC produce o autoriza modificar.

## Cambios respecto a v2

Solo se añade un archivo y se ajustan dos pasos. El resto del PLAN v2 se mantiene íntegro.

### Archivos nuevos (delta v2 → v3)

- `.prettierignore` — lista de exclusiones para Prettier. Contenido propuesto:
    - `node_modules/`
    - `dist/`
    - `public/dist/`
    - `coverage/`
    - `playwright-report/`
    - `test-results/`
    - `.vite/`
    - `data/` (datos del juego, criterio 13)
    - `public/javascripts/` (vendored libs y scripts existentes — se sustituirán en SPECs posteriores)
    - `public/styles/` (vendored CSS y existentes — se sustituirán en SPECs posteriores)
    - `*.min.js`
    - `*.min.css`
    - `package-lock.json` (gestionado por npm)
    - `index.html`, `about.html`, `fusion-search.html`, `fusion-calculator.html` (HTML actuales, criterio 5)

### Pasos de implementación (ajuste v3)

Se inserta un paso 5-bis y se modifica el Paso 6 existente.

#### Paso 5-bis — `.prettierignore`

5-bis.1. Crear `.prettierignore` en la raíz con el contenido descrito arriba.
5-bis.2. Verificación previa al formato: `npx prettier --list-different .` debe listar solo archivos creados/permitidos por esta SPEC (los nuevos `src/`, `tests/`, `vite.config.ts`, `playwright.config.ts`, `vitest.config.ts`, `tailwind.config.ts`, `package.json`, `tsconfig*.json`, `render.yaml`, `.env.example`, `.gitignore`, `README.md` cuando se modifique en Paso 7), nunca archivos existentes preservados.

#### Paso 6 (modificado)

6.1. Sin cambios respecto a v2 (los scripts ya estaban en `package.json` desde Paso 1).
6.2. Ejecutar `npm run format`. Tras la corrección de v3, debe modificar **únicamente** archivos creados por esta SPEC o autorizados (`.gitignore` y, en Paso 7, `README.md`). No debe tocar `data/`, `public/javascripts/`, `public/styles/`, ni los HTML existentes.
6.3. Ejecutar `npm run format:check`. Debe pasar.
6.4. Verificar con `git status` que no aparece ningún archivo preexistente modificado fuera de `.gitignore` y `README.md`.

## Validación adicional

Sin cambios en los criterios de aceptación de la SPEC. La validación adicional implícita en este v3 es: tras el Paso 6, `git diff` sobre los archivos preexistentes (excluyendo `.gitignore` y `README.md`) debe estar vacío.

## Rollback

Sin cambios respecto a v2. Eliminar `.prettierignore` no afecta a ningún otro archivo.
