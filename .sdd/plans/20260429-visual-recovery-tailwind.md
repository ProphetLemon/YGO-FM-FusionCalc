# PLAN: visual-recovery-tailwind

SPEC: [.sdd/specs/20260429-visual-recovery-tailwind.md](../specs/20260429-visual-recovery-tailwind.md)
Estado: APROBADO (sustituida por v2)

## Archivos a modificar

Lista cerrada.

- [src/client/styles/tailwind.css](../../src/client/styles/tailwind.css) — añadir bloque `@theme` con tokens de fuente y colores `fm-*`, declaraciones `@utility` para `bg-vrains`, `bg-polymerization`, `bg-lost-memories`, `cover-glow` y `animate-hero`, más `@keyframes` para la animación.
- [views/layouts/main.ejs](../../views/layouts/main.ejs) — aplicar `font-body` al `<body>`. Conservar el resto.
- [views/partials/navbar.ejs](../../views/partials/navbar.ejs) — repaletear con clases nuevas (`font-body`, `bg-white`, `text-fm-primary`, botón Thread con borde negro/fondo blanco/hover invertido). Logo a `h-8` en navbar.
- [views/partials/footer.ejs](../../views/partials/footer.ejs) — fondo negro, texto blanco, iconos pequeños (`h-4 w-4`), tipografía `font-body`.
- [views/partials/language-switcher.ejs](../../views/partials/language-switcher.ejs) — alinear con paleta del navbar.
- [views/index.ejs](../../views/index.ejs) — sección hero con `bg-vrains`, overlay oscuro implícito en utility, hero con `font-display animate-hero`. Sección Search con fondo gris-claro y enlace al estilo original. Sección Calculator con fondo `fm-calculator-bg` y texto `fm-calculator-fg`. Separador `bg-lost-memories` con altura fija. Sección About con fondo `fm-primary` y CTA con `bg-fm-about-cta`. Imagen de cover con clase `cover-glow`.
- [views/search.ejs](../../views/search.ejs) — fondo de página `bg-polymerization` aplicado al `<body>` vía `bodyClass`. Paneles internos con fondo claro (`bg-white/95`) y bordes redondeados.
- [views/calculator.ejs](../../views/calculator.ejs) — idem search.
- [views/about.ejs](../../views/about.ejs) — fondo `bg-fm-primary` aplicado vía `bodyClass`. Texto en blanco, secciones con padding generoso, títulos con `font-display uppercase tracking-wide`.
- [src/server/http/routes/views.ts](../../src/server/http/routes/views.ts) — actualizar `bodyClass` de `/search`, `/calculator` y `/about` con las clases de fondo nuevas. Quitar `bg-slate-900 text-slate-100` que pusimos como fallback en el paso 2.

## Archivos nuevos

- `tests/e2e/visual.spec.ts` — tests de identidad visual (computed styles).

Verificado que ninguno existe ya.

## Archivos a eliminar

Ninguno.

## Pasos de implementación

### Paso 1 — Tokens y utilities en Tailwind

1.1. Reescribir `src/client/styles/tailwind.css` con la estructura:

- `@import "tailwindcss";`
- `@theme { ... }` con tokens de fuente (`--font-body`, `--font-display`) y colores (`--color-fm-primary`, `--color-fm-search-bg`, `--color-fm-calculator-bg`, `--color-fm-calculator-fg`, `--color-fm-about-cta`).
- `@keyframes hero-slide` con la animación 0→100% translate.
- Declaraciones `@utility` para `bg-vrains`, `bg-polymerization`, `bg-lost-memories`, `animate-hero`, `cover-glow`.
  1.2. Ejecutar `npm run build:css`. Verificar que el CSS resultante es válido y contiene las nuevas reglas.
  1.3. Si Tailwind 4 no acepta `@utility` o `@theme`, replanificar (v2): pasar tokens a `tailwind.config.ts` con `theme.extend.fontFamily`, `theme.extend.colors`, `theme.extend.backgroundImage`, `theme.extend.keyframes` y `theme.extend.animation`. Ese plan v2 entraría como amendment.

### Paso 2 — Layout y partials

2.1. Modificar `views/layouts/main.ejs` para añadir `font-body` al `<body>`.
2.2. Reescribir `views/partials/navbar.ejs` aplicando paleta original (header con `bg-white border-b border-black/10`, enlaces con `font-body`, botón Thread `border-black bg-white text-black hover:bg-black hover:text-white`, logo con `h-8 md:h-10`).
2.3. Reescribir `views/partials/footer.ejs` con `bg-black text-white`, iconos `h-4 w-4`, texto `font-body text-sm`.
2.4. Ajustar `views/partials/language-switcher.ejs` para que los botones combinen con el navbar (`font-body`, contraste correcto sobre `bg-white`).

### Paso 3 — Vistas de página

3.1. Reescribir `views/index.ejs`:

- Sección hero con `bg-vrains text-white`, contenedor `bg-black/30`, hero `font-display animate-hero`, párrafos `font-body`, CTA con `bg-white text-black`, imagen de portada con `cover-glow`.
- Sección Fusion Search con `bg-fm-search-bg text-fm-primary border-t border-black`, título con `font-display`, CTA con fondo `bg-fm-primary text-white hover:bg-blue-900`.
- Separador entre secciones con `bg-lost-memories min-h-[400px]` mostrando un texto en blanco con sombra (mantener si el original lo tenía vacío).
- Sección Fusion Calculator con `bg-fm-calculator-bg text-fm-calculator-fg`, CTA con `bg-white text-fm-calculator-fg hover:bg-orange-200`.
- Sección About con `bg-fm-primary text-white`, CTA `bg-fm-about-cta text-fm-primary hover:bg-pink-200`.
  3.2. Reescribir `views/search.ejs` y `views/calculator.ejs`:
- Eliminar fondos de panel `bg-slate-50`; usar `bg-white/95 text-fm-primary` para los paneles centrales.
- Mantener la estructura de IDs (`cardname`, `output-area-left`, etc.) intacta.
- Botones con la paleta original (verde para Search, rojo para Reset, etc.).
  3.3. Reescribir `views/about.ejs`:
- Texto blanco, secciones bordeadas suavemente, títulos `font-display uppercase tracking-wide`.

### Paso 4 — Router

4.1. Modificar `src/server/http/routes/views.ts`:

- `/search` y `/calculator`: `bodyClass = "bg-polymerization text-fm-primary"`.
- `/about`: `bodyClass = "bg-fm-primary text-white"`.
- `/`: sin `bodyClass` específico (las secciones gestionan sus fondos internamente).

### Paso 5 — Tests visuales

5.1. Crear `tests/e2e/visual.spec.ts` con casos:

- Home: el contenedor del hero tiene `background-image` que contiene `background.png` y el `<body>` tiene `font-family` que contiene `Varela Round`.
- Search: el `<body>` tiene `background-image` que contiene `fusion_background.jpg`.
- Calculator: idem.
- About: el `<body>` tiene `background-color` resuelto al RGB de `fm-primary` (rgb(30, 35, 55)).
- Algún `<h1>` o `<h2>` tiene `font-family` que contiene `JetBrains Mono`.
  5.2. Ejecutar `npm run test:e2e`. Verificar verde.

### Paso 6 — Validación local completa

6.1. `npm run build && npm test && npm run test:e2e && npm run format:check`.
6.2. `npm start`. Verificación manual del usuario en navegador comparando con la versión antigua (capturas mentales o de la URL pública actual).

### Paso 7 — Commit y push (combinado con paso 2)

7.1. Commit de `pages-to-ejs-i18n` (cambios actuales en working tree).
7.2. Commit de `visual-recovery-tailwind` (cambios de esta SPEC).
7.3. Push a `master`. Render redespliega una vez con el resultado final.

### Paso 8 — Despliegue Render y cierre

8.1. Tras Render verde, abrir https://ygo-fm-fusion-calc.onrender.com/ y confirmar que la identidad visual está recuperada.
8.2. Commit `docs(sdd):` que mueve ambas SPECs (`pages-to-ejs-i18n` y `visual-recovery-tailwind`) a `Estado: COMPLETADO`.

## Validación

Mapeo criterio SPEC → cómo se comprueba.

1. **Build** → `npm run build` exit 0, `public/dist/styles.css` no vacío y contiene reglas para `bg-vrains`, etc.
2. **Typecheck** → `npm run typecheck` exit 0.
3. **Tests unitarios** → `npm test` exit 0, cobertura ≥ 80% (sin código nuevo de servidor, no debería bajar).
4. **Tests E2E** → `npm run test:e2e` exit 0, incluye `visual.spec.ts`.
5. **Home background** → assert en `visual.spec.ts`.
6. **Search/Calculator background** → asserts en `visual.spec.ts`.
7. **Body font-family** → assert en `visual.spec.ts`.
8. **Heading font-family** → assert en `visual.spec.ts`.
9. **Hero animation** → assert opcional sobre `getAnimations()` o computed `animation-name`.
10. **Paleta visual** → revisión manual del usuario.
11. **Sin Bootstrap en home/about** → verificación: el HTML servido en `/` y `/about` no incluye `bootstrap.min.css` en `<link>`.
12. **Render verde** → curl + visita manual a la URL pública.

## Rollback

- Cambios contenidos en CSS y plantillas. Sin migraciones de datos ni cambios de API.
- Si el resultado visual es peor que el actual, `git revert <commit>` deja el estado en el aspecto neutro tras `pages-to-ejs-i18n` (que ya es funcional).
- Si Tailwind 4 con `@theme`/`@utility` falla en el build, el plan v2 (config TypeScript clásico) es el rollback intermedio.
