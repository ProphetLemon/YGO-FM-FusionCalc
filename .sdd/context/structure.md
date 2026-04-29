# Structure

Estado: BORRADOR
Última actualización: 2026-04-29

Descripción de la estructura de carpetas y dónde va cada cosa. Si un archivo nuevo no encaja en ninguna de las ubicaciones descritas aquí, hay que actualizar este documento antes de crearlo.

## Árbol completo

```
YGO-FM-FusionCalc/
├── .sdd/                       # Documentación SDD (no se distribuye)
│   ├── context/                # Archivos de contexto del proyecto
│   ├── specs/                  # SPECs por feature
│   └── plans/                  # PLANs por feature
│
├── data/                       # Fuente de verdad de los datos del juego
│   ├── Cards.json              # Cartas (input maestro, editado a mano)
│   ├── fusions.json            # Generado por scripts/build-data.ts
│   ├── equips.json             # Generado
│   └── results.json            # Generado
│
├── views/                      # Plantillas EJS (server-rendered)
│   ├── layouts/
│   │   └── main.ejs            # Layout base (header, footer, navbar, slot main)
│   ├── partials/
│   │   ├── navbar.ejs
│   │   ├── footer.ejs
│   │   └── language-switcher.ejs
│   ├── index.ejs               # Home
│   ├── search.ejs              # Fusion Search
│   ├── calculator.ejs          # Fusion Calculator
│   ├── about.ejs
│   └── error.ejs               # Página de error genérica
│
├── public/                     # Servido como estáticos por Express
│   ├── images/                 # Imágenes versionadas (logo, backgrounds, personajes)
│   │   └── cards/              # (futuro) imágenes por carta
│   ├── fonts/                  # (futuro) fuentes self-hosted si las añadimos
│   ├── dist/                   # Output de build — NO commitear
│   │   ├── *.js                # Bundles de cliente generados por Vite
│   │   └── styles.css          # Output de Tailwind
│   ├── favicon.ico
│   └── robots.txt
│
├── src/
│   ├── server/                 # Código del backend (Express)
│   │   ├── index.ts            # Entry point: arranque del servidor
│   │   ├── app.ts              # Composición de Express (sin listen)
│   │   ├── config.ts           # Lectura/validación de env vars
│   │   ├── data/
│   │   │   ├── store.ts        # Carga e índices in-memory
│   │   │   └── validators.ts   # Validación de los JSON de data/
│   │   ├── domain/             # Lógica pura (sin Express, sin FS)
│   │   │   ├── fusions.ts      # Búsqueda de fusiones inmediatas y encadenadas
│   │   │   ├── equips.ts
│   │   │   ├── search.ts       # Búsqueda por nombre, fuzzy
│   │   │   └── ranking.ts      # Ordenación por métrica
│   │   ├── http/
│   │   │   ├── routes/
│   │   │   │   ├── views.ts    # Rutas que renderizan EJS
│   │   │   │   └── api.ts      # Endpoints JSON
│   │   │   └── middleware/
│   │   │       ├── error.ts
│   │   │       ├── i18n.ts     # Resuelve idioma por cookie/Accept-Language
│   │   │       └── logger.ts   # pino-http
│   │   └── logger.ts           # Instancia pino exportada
│   │
│   ├── client/                 # Código del frontend (TypeScript)
│   │   ├── pages/              # Un archivo por página = entry de Vite
│   │   │   ├── home.ts
│   │   │   ├── search.ts
│   │   │   ├── calculator.ts
│   │   │   └── about.ts
│   │   ├── components/         # Componentes reutilizables (clases/funciones)
│   │   │   ├── autocomplete.ts # Wrapper sobre Awesomplete
│   │   │   ├── slot-list.ts    # Slots dinámicos del calculator
│   │   │   ├── card-display.ts
│   │   │   └── language-switcher.ts
│   │   ├── lib/                # Utilidades cliente (fetch, dom helpers, storage)
│   │   │   ├── api.ts          # Cliente tipado de la API
│   │   │   ├── dom.ts
│   │   │   └── storage.ts      # localStorage helpers tipados
│   │   └── styles/
│   │       └── tailwind.css    # Source de Tailwind (directivas @tailwind)
│   │
│   ├── shared/                 # Compartido cliente + servidor
│   │   ├── types.ts            # Card, Fusion, FusionChain, ResultEntry, etc.
│   │   └── i18n/
│   │       ├── es.json
│   │       ├── en.json
│   │       ├── index.ts        # Helper t(key, lang) puro
│   │       └── types.ts        # Lang, TranslationKey
│   │
│   └── scripts/                # Scripts de mantenimiento (ejecutados con tsx)
│       ├── build-data.ts       # Genera fusions/equips/results desde Cards.json
│       └── fix-cards-numbers.ts# Reemplazo del .rb existente
│
├── tests/
│   ├── unit/                   # Vitest, espejo de la estructura de src/
│   │   ├── server/
│   │   ├── client/
│   │   └── shared/
│   ├── e2e/                    # Playwright
│   │   ├── search.spec.ts
│   │   ├── calculator.spec.ts
│   │   └── i18n.spec.ts
│   └── fixtures/               # Datos de prueba reutilizables
│
├── dist/                       # Output de tsc para servidor — NO commitear
│   └── server/
│
├── .sdd/                       # (ya listado arriba)
├── .env.example                # Plantilla de variables de entorno
├── .gitignore
├── .nvmrc                      # 24
├── .prettierrc
├── package.json
├── package-lock.json
├── tsconfig.json               # Base
├── tsconfig.server.json        # Extiende base, target Node
├── tsconfig.client.json        # Extiende base, target navegador
├── vite.config.ts              # Config de Vite (multi-entry)
├── tailwind.config.ts
├── postcss.config.cjs          # Si Tailwind 4 lo requiere
├── playwright.config.ts
├── vitest.config.ts
├── render.yaml                 # Configuración de Render
└── README.md
```

## Reglas de ubicación

### Reglas duras

- Nuevas plantillas EJS → `views/` (página) o `views/partials/` (parcial reutilizado).
- Nueva ruta → `src/server/http/routes/` (vista o api según corresponda).
- Nueva lógica de juego → `src/server/domain/`.
- Tipos compartidos → `src/shared/types.ts` (no duplicar en cliente y servidor).
- Cadenas de traducción → `src/shared/i18n/{es,en}.json`. Ambas claves obligatorias.
- Nuevo script de cliente para una página existente → `src/client/pages/<page>.ts`.
- Nueva página visible → vista EJS + entry en `src/client/pages/` + ruta en `src/server/http/routes/views.ts`. Las tres cosas a la vez.
- Nuevos assets de imagen → `public/images/` (subcarpeta si forman un grupo: `cards/`, `characters/`, `backgrounds/`).
- Nuevos medios distintos a imagen → nueva carpeta hija de `public/` (`public/audio/`, `public/video/`, etc.). No mezclar en `images/`.
- Tests acompañan al código que prueban (mismo path bajo `tests/unit/`).
- Scripts de mantenimiento (no de runtime) → `src/scripts/`, ejecutados con `tsx`.

### Reglas blandas

- Si un componente cliente se usa en >1 página, vive en `src/client/components/`. Si solo lo usa una, puede vivir junto a su page en una subcarpeta `src/client/pages/<page>/`.
- Si un helper de servidor crece más de ~150 LOC, considerar dividirlo. No partir antes de tiempo.
- Lógica de dominio testeable nunca debe importar de `src/server/http/` ni de `express`.

## Qué NO va dentro de cada carpeta

- `views/` no contiene CSS ni JS. Solo EJS y parciales.
- `public/` no contiene código fuente. Solo binarios y output de build.
- `src/server/` no importa de `src/client/` (la dirección está prohibida).
- `src/client/` no importa de `src/server/` (no compartido a través de bundler).
- `src/shared/` no importa de `src/client/` ni de `src/server/`.
- `data/` no contiene código. Solo JSON.

## Qué se commitea y qué no

- Se commitean: `data/*.json`, todo `src/`, todo `views/`, `public/images/`, `public/favicon.ico`, `public/robots.txt`.
- NO se commitean: `public/dist/`, `dist/`, `node_modules/`, `.env`, `coverage/`, `.vite/`, `playwright-report/`, `test-results/`.
- `.gitignore` debe reflejar lo anterior. Cuando se añada una nueva carpeta de output, se actualiza.

## Convención de nombres en archivos

- TypeScript de servidor y cliente: `kebab-case.ts`.
- Plantillas EJS: `kebab-case.ejs`.
- Tests Vitest: espejo del archivo, con sufijo `.test.ts`.
- Tests Playwright: `<feature>.spec.ts`.
- SPECs y PLANs: `yyyymmdd-kebab-case.md`.

## Migración desde el estado actual

Para referencia futura: el repositorio actual tiene HTMLs en raíz, scripts en `public/javascripts/`, estilos en `public/styles/` y datos derivados commiteados en `data/`. La migración a esta estructura se hará bajo SPEC propia ("bootstrap del proyecto a Node + TS + EJS"), no de forma incremental.
