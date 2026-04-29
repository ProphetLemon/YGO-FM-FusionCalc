# SPEC: visual-recovery-tailwind

Fecha: 2026-04-29
Estado: APROBADO (sustituida por v2)

## Objetivo

Recuperar la identidad visual del sitio antiguo usando Tailwind 4 como único sistema de estilos para las plantillas EJS. Tras la migración del paso 2, las páginas se ven funcionalmente correctas pero con un aspecto neutro de utilidades sin paleta ni fondos. Esta SPEC restaura tipografías, colores por sección, fondos con imagen, animación del hero y los detalles distintivos sin reintroducir Bootstrap como capa de estilos para las plantillas y sin reusar `public/styles/home.css`.

Esta SPEC depende de [20260429-pages-to-ejs-i18n](20260429-pages-to-ejs-i18n.md) y se considera el cierre visual del paso 2 antes de pasar al paso 3 (port del cliente a TypeScript modular).

## Contexto

- Estado actual: las plantillas EJS usan Tailwind para layout y tipografía base, pero no replican la identidad del sitio anterior. Faltan: fuentes (`Varela Round`, `JetBrains Mono`), fondos por sección (`background.png` para home, `fusion_background.jpg` para search/calculator, `lost_memories.jpg` como separador), paleta por sección (azul-noche en home, gris-claro en search section, naranja-rojo en calculator section, azul-noche en about), animación del hero y glow en hover de la portada.
- La fuente original con todos los estilos visuales está en [public/styles/home.css](public/styles/home.css). No la reutilizamos: la SPEC traduce su identidad a Tailwind 4 vía `@theme` y `@utility` directivas.
- Tailwind 4 admite configuración CSS-first; preferimos esa vía sobre extender `tailwind.config.ts`.
- Bootstrap CSS sigue cargado en `/search` y `/calculator` para el HTML inyectado por los scripts legacy. Esta SPEC no lo elimina; coexiste con la nueva identidad visual en esas páginas.

## Alcance

### 1. Configuración de Tailwind via CSS

- Modificar `src/client/styles/tailwind.css` para añadir:
    - Bloque `@theme` con tokens para:
        - Fuentes: `--font-body: "Varela Round", sans-serif;` y `--font-display: "JetBrains Mono", monospace;`.
        - Colores con prefijo `fm-` para no chocar con la paleta por defecto: `fm-primary` (rgb 30 35 55), `fm-search-bg`, `fm-calculator-bg`, `fm-calculator-fg`, `fm-about-cta`, `fm-thread-bg`.
    - `@utility` para cada fondo de imagen reutilizable: `bg-vrains`, `bg-polymerization`, `bg-lost-memories`. Cada utility incluye `linear-gradient` + URL + `background-size: cover` + posicionamiento adecuado.
    - Animación `hero-slide` y utility `animate-hero` que la aplica.
    - Utility `cover-glow` para el `:hover` con box-shadow cyan de la portada.
- No modificar `tailwind.config.ts` salvo para mantener `content` apuntando a las rutas correctas (ya OK).

### 2. Plantillas EJS rediseñadas

Cada vista pasa a usar las utilities nuevas de Tailwind para reproducir la estética original:

- `views/layouts/main.ejs`: aplica `font-body` a `<body>`. Define la estructura responsive sin cambios de markup.
- `views/partials/head.ejs`: ya carga las fuentes; sin cambios.
- `views/partials/navbar.ejs`: estilizado con la paleta original (fondo claro, enlaces en `font-body`, botón Thread invertido). Logo redimensionado (~2em).
- `views/partials/footer.ejs`: fondo negro, texto blanco, iconos pequeños (millennium pendant 1rem, GitHub 1rem). Posicionado al final con flex.
- `views/index.ejs`: hero con `bg-vrains`, overlay oscuro, hero-title con animación `animate-hero`. Sección Search con fondo gris-claro (fm-search-bg). Sección Calculator con fondo naranja (fm-calculator-bg) y texto rojo oscuro. Sección About con fondo azul-noche (fm-primary) y texto blanco. Botón About con `fm-about-cta`. Imagen de cover con `cover-glow`. Separador con `bg-lost-memories`.
- `views/search.ejs`: fondo `bg-polymerization`, paneles internos con fondo claro (rounded). Inputs y botones según paleta original.
- `views/calculator.ejs`: fondo `bg-polymerization`, paneles internos claros, inputs estilizados.
- `views/about.ejs`: fondo `bg-fm-primary`, texto blanco, secciones con padding generoso.

### 3. Tipografía

- Body: `Varela Round` (`font-body`).
- Titulares (h1, h2, h3, h4): `JetBrains Mono` (`font-display`) en mayúsculas (`uppercase tracking-wide`) cuando aplique al diseño original.
- Mantener fallback en cada utility por si Google Fonts falla (ya lo hace via stack en `@theme`).

### 4. Imágenes

- Reutilizar [public/images/background.png](public/images/background.png), [public/images/fusion_background.jpg](public/images/fusion_background.jpg), [public/images/lost_memories.jpg](public/images/lost_memories.jpg), [public/images/cover_playstation.webp](public/images/cover_playstation.webp), [public/images/atem.png](public/images/atem.png), [public/images/kaiba.png](public/images/kaiba.png), [public/images/fusion.gif](public/images/fusion.gif), [public/images/logo.png](public/images/logo.png), [public/images/item.png](public/images/item.png).
- No se añaden imágenes nuevas.

### 5. Tests

- Los tests E2E existentes deben seguir verdes (no se cambian assertions de comportamiento).
- Añadir un test E2E que verifique que la home tiene fondo con imagen (computed style `background-image` no-`none` en el contenedor con `bg-vrains`).
- Añadir un test E2E que verifique la fuente aplicada al body (computed style `font-family` contiene `Varela Round`).
- La cobertura unitaria sigue al 80%; sin código nuevo de servidor en esta SPEC, los thresholds se mantienen sin cambios.

### 6. Validación visual

- Comparación lado-a-lado contra capturas de la versión antigua (que el usuario hace localmente en su navegador). No se commitean capturas.

## Fuera de alcance

- Eliminar Bootstrap CSS de `/search` y `/calculator`: paso 3.
- Eliminar `public/styles/home.css` del repo: paso 3 (junto con el resto de assets legacy).
- Nuevos diseños o cambios visuales más allá de recuperar la identidad original. Si el usuario quiere modernizar, abrirá una SPEC propia.
- Cambios en assets de imagen (recortes, optimización, sustitución).
- Cambios en estructura HTML o jerarquía de secciones de las plantillas.
- Cambios en el contenido textual o las claves i18n.
- Cualquier cambio en el servidor, dominio, datos, rutas o middleware.

## Criterios de aceptación

1. **Build**: `npm run build` exit 0. `public/dist/styles.css` incluye las utilities nuevas.
2. **Typecheck**: `npm run typecheck` exit 0.
3. **Tests unitarios**: `npm test` exit 0 con cobertura ≥ 80% (sin regresión).
4. **Tests E2E**: `npm run test:e2e` exit 0, incluidos los dos tests visuales nuevos.
5. **Home**: el `<body>` (o un contenedor en home) tiene `background-image` resuelto (no `none`), apuntando a `background.png` o equivalente.
6. **Search / Calculator**: el `<body>` (o contenedor principal) tiene fondo `polymerization` (computed `background-image` resuelto a `fusion_background.jpg`).
7. **Tipografía body**: computed `font-family` del `<body>` contiene `Varela Round`.
8. **Tipografía titulares**: computed `font-family` de `h2.font-display` (o equivalente) contiene `JetBrains Mono`.
9. **Animación hero**: el `<h1>` de la home tiene `animation-name: hero-slide` (o equivalente) durante el primer render.
10. **Paleta por sección**: visualmente el sitio reproduce los colores característicos del original (verificación manual con capturas).
11. **Sin Bootstrap en home/about**: las páginas `/` y `/about` no cargan `bootstrap.min.css`. Las páginas `/search` y `/calculator` siguen cargándolo (alcance fuera).
12. **Render deployment**: tras push, Render reconstruye y la URL pública muestra la identidad recuperada.

## Impacto en contratos

- **API**: ninguno.
- **Modelo de datos**: ninguno.
- **Frontend-backend**: ninguno (solo cambia CSS y markup interno).
- **i18n**: las claves no cambian. Si una utility de Tailwind requiere una nueva clave (ej. `aria-label` para algo), se añade a ambos catálogos manteniendo paridad.

## Riesgos y supuestos

**Riesgos**

1. **Tailwind 4 directiva `@utility` y `@theme`**: la sintaxis es relativamente nueva. Si el CLI no la procesa correctamente, hay que retroceder a `tailwind.config.ts` con `theme.extend.fontFamily` y backgrounds via `theme.extend.backgroundImage`. Mitigación: validar con build temprano; si falla, ajustar al estilo `tailwind.config.ts` y avisar.
2. **Conflictos con Bootstrap en search/calculator**: las nuevas utilities pueden chocar con clases Bootstrap aplicadas dinámicamente por `fusionSearch.js`/`fusionCalc.js`. Mitigación: cargar Bootstrap antes de Tailwind (ya lo hacemos) para que la cascada favorezca lo nuevo donde aplica; verificar visualmente.
3. **Tamaño de CSS final**: añadir `@theme` y `@utility` no debería incrementar mucho el output (Tailwind purgea lo no usado). Si el CSS pasa de 50 KB, revisar.
4. **Animación en SSR**: la animación de entrada del hero arranca al cargar el DOM. No afecta funcionalidad pero puede ser invasiva si se repite navegando. Aceptamos el comportamiento original (una vez por carga).

**Supuestos**

- Las imágenes existentes en `/public/images/` siguen siendo accesibles vía `/public/images/...` (lo son, ruta estática registrada en Express).
- El usuario validará visualmente comparando con la versión antigua (puede comparar con su memoria del sitio en GitHub Pages o con capturas locales).
- Esta SPEC se commitea y pushea junto con `pages-to-ejs-i18n` para que Render solo redespliegue una vez con el resultado final.
