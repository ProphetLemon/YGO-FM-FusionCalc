# Structure

Estado: BORRADOR
Última actualización: 2026-09-30

Descripción de la estructura de carpetas y dónde va cada cosa. Si un archivo nuevo no encaja en ninguna de las ubicaciones descritas aquí, hay que actualizar este documento antes de crearlo.

Los árboles reflejan el repositorio real. Para regenerar el detalle de una carpeta: `eza --tree src tests views data scripts`.

## Vista general

```
YGO-FM-FusionCalc/
├── .sdd/     # Documentación SDD (no se distribuye)
├── data/     # Datos del juego (JSON estático)
├── views/    # Plantillas EJS (server-rendered)
├── public/   # Estáticos servidos por Express bajo `/public`
├── src/      # Código fuente: servidor, cliente y compartido
├── scripts/  # Mantenimiento de datos (Ruby, heredados)
├── tests/    # Unit (Vitest), e2e (Playwright) y fixtures
└── dist/     # Salida de `tsc` del servidor (`dist/server/index.js`): NO commitear
```

## Árbol completo

### Documentación, datos, vistas y scripts

```
.sdd/                    # Documentación SDD (no se distribuye)
├── context/             # Contexto del proyecto
│   ├── architecture.md  # Capas, flujos y decisiones de arquitectura
│   ├── conventions.md   # Estilo, patrones y prácticas obligatorias
│   ├── stack.md         # Tecnologías y versiones
│   └── structure.md     # Este documento
├── specs/               # SPECs por feature (`yyyymmdd-slug.md`)
└── plans/               # PLANs por feature (`yyyymmdd-slug.md`)

data/             # Datos del juego (JSON estático)
├── Cards.json    # Cartas y recetas de ritual (input maestro)
├── equips.json   # Generado por `make_databases.rb`: equips de cada carta
├── fusions.json  # Generado por `make_databases.rb`: fusiones de cada carta
└── results.json  # Generado por `make_databases.rb`: pares que producen cada carta

views/                         # Plantillas EJS (server-rendered)
├── layouts/
│   └── main.ejs               # Layout base: `head`, navbar, `main`, pie y scripts
├── partials/
│   ├── footer.ejs
│   ├── head.ejs               # `<head>`: metadatos, fuentes y hoja de estilos
│   ├── i18n-bootstrap.ejs     # Catálogo de textos del idioma activo como JSON, para el cliente
│   ├── language-switcher.ejs  # Formulario `POST /lang`
│   ├── navbar.ejs
│   └── scripts.ejs            # Bundle de la página
├── about.ejs
├── calculator.ejs             # Calculadora de fusiones
├── index.ejs                  # Inicio
└── search.ejs                 # Buscador de fusiones

public/      # Estáticos servidos por Express bajo `/public`
├── images/  # Imágenes versionadas (logo, fondos, personajes, `yugioh.ico`)
└── dist/    # Salida de Vite y Tailwind: NO commitear

scripts/                  # Mantenimiento de datos (Ruby, heredados)
├── fix_cards_numbers.rb  # Corrige a base 1 los ids de `Equip` y `Ritual` en `Cards.json`
└── make_databases.rb     # Genera `fusions.json`, `equips.json` y `results.json`
```

### `src/server/`

```
src/server/              # Backend (Express)
├── data/                # Store en memoria y validación de los JSON
│   ├── store.ts         # Carga los JSON de `data/` y construye los índices en memoria
│   └── validators.ts    # Validación de los JSON al arrancar
├── domain/              # Lógica de juego, sin Express ni FS
│   ├── calculator.ts    # Fusiones, equips y rituales de una mano
│   ├── cards.ts         # `toCardSummary` (calcula `imageCode`) e `isMonster`
│   ├── chain-search.ts  # Cadenas de fusiones: BFS, top 5, presupuesto `MAX_CHAIN_STATES`
│   ├── equips.ts        # Equips de una carta
│   ├── fusions.ts       # Fusiones y equips de una carta
│   ├── results.ts       # Pares que producen una carta
│   ├── rituals.ts       # Rituales completos presentes en una mano
│   └── search.ts        # Búsqueda por nombre exacto y por prefijo
├── http/                # Capa HTTP: rutas, middleware y assets
│   ├── middleware/
│   │   └── i18n.ts      # Idioma: cookie `lang`, `Accept-Language`, `es`
│   ├── routes/
│   │   ├── api.ts       # Endpoints JSON bajo `/api` y validación de la mano
│   │   ├── lang.ts      # `POST /lang`: guarda la cookie de idioma y redirige
│   │   ├── legacy.ts    # Redirecciones 301 de las URLs `.html` antiguas
│   │   └── views.ts     # Rutas que renderizan EJS
│   └── assets.ts        # URLs de los bundles según el manifiesto de Vite
├── app.ts               # Composición de Express (sin `listen`) y manejador de errores
├── config.ts            # Lectura y validación de las variables de entorno
├── index.ts             # Entry point: arranca el servidor y lo cierra con SIGINT/SIGTERM
└── logger.ts            # Instancia de pino
```

### `src/client/`

```
src/client/              # Frontend (TypeScript, un bundle por página)
├── components/          # Componentes reutilizables
│   ├── autocomplete.ts  # Lista de sugerencias sobre un input (teclado y ratón)
│   ├── card-display.ts  # `renderCardSummary`: detalle de una carta
│   ├── fusion-card.ts   # `renderPair`, `renderEquip`, `renderRitual` y `renderChain`
│   └── navbar.ts        # Menú móvil
├── lib/                 # Utilidades de cliente
│   ├── api.ts           # Cliente tipado de la API, `ApiError` y copia del índice en `sessionStorage`
│   ├── card-image.ts    # `createCardImg`: artwork o marcador, sin petición sin `imageCode`
│   ├── dom.ts           # `qs`, `qsa` y `clear`
│   ├── hand-storage.ts  # Guarda y recupera la mano en `localStorage`
│   ├── i18n.ts          # `t()` en cliente, con los textos de `#i18n-bootstrap`
│   ├── latest.ts        # `createLatest`: solo la última petición toca la página
│   ├── name-search.ts   # `rankNameMatches`: orden y límite de las sugerencias
│   ├── slots.ts         # Límites de ranuras e ids de las ranuras
│   └── storage.ts       # Lectura y escritura de Web Storage que no lanzan
├── pages/               # Un archivo por página = entry de Vite
│   ├── about.ts         # Solo monta el menú
│   ├── calculator.ts    # Ranuras, resultados, rituales, cadena y mano guardada
│   ├── home.ts          # Solo monta el menú
│   └── search.ts        # Búsqueda por nombre y por resultado
└── styles/
    └── tailwind.css     # Source de Tailwind
```

### `src/shared/`

```
src/shared/                    # Compartido cliente + servidor
├── i18n/
│   ├── en.json                # Textos en inglés
│   ├── es.json                # Textos en español (mismas claves que `en.json`)
│   └── index.ts               # `translate`, `isLang`, `parseAcceptLanguage` y catálogos
├── card-image-overrides.json  # Id de carta → contraseña real, si la suya no tiene imagen
├── limits.ts                  # `MAX_HAND_SIZE`: tope de la mano en cliente y servidor
├── types-and-stars.json       # Nombres de los tipos de carta y de las estrellas
└── types.ts                   # Tipos compartidos (`Card`, `CardSummary`, respuestas de la API)
```

### `tests/`

```
tests/                                       # Unit (Vitest), e2e (Playwright) y fixtures
├── e2e/                                     # Playwright, contra la app compilada
│   ├── autocomplete.spec.ts                 # Sugerencias: orden, límite de 8, teclado, ratón y foco
│   ├── calculator-async.spec.ts             # Peticiones solapadas, errores de red, nombres desconocidos y salida de la cadena
│   ├── calculator-functional.spec.ts        # Flujo básico: ranuras, fusión, reinicio y cadena
│   ├── calculator-persistence.spec.ts       # Mano en `localStorage`: guardar, restaurar y fallos
│   ├── calculator-rituals.spec.ts           # Bloque de rituales
│   ├── calculator-states.spec.ts            # Pista, carga, columnas vacías, equips, cadena y tope de 12
│   ├── card-images.spec.ts                  # Artwork, marcadores y peticiones al CDN
│   ├── navigation.spec.ts                   # Navegación, redirecciones, idioma y menú móvil
│   ├── search-equips.spec.ts                # Etiquetas de los equips en el buscador
│   ├── search-functional.spec.ts            # Búsqueda por nombre
│   └── visual.spec.ts                       # Identidad visual: fuentes, fondos y sin Bootstrap
├── fixtures/
│   └── sample-cards.json                    # Sin uso: los tests cargan `data/` con `loadStore()`
└── unit/                                    # Vitest, espejo de `src/`
    ├── client/
    │   ├── api.test.ts
    │   ├── card-image.test.ts
    │   ├── hand-storage.test.ts
    │   ├── latest.test.ts
    │   ├── name-search.test.ts
    │   └── slots.test.ts
    ├── server/
    │   ├── data/
    │   │   ├── store.test.ts
    │   │   └── validators.test.ts
    │   ├── domain/
    │   │   ├── calculator.test.ts
    │   │   ├── cards.test.ts                # Incluye las reglas de `imageCode`
    │   │   ├── chain-search.test.ts
    │   │   ├── equips.test.ts
    │   │   ├── fusions.test.ts
    │   │   ├── results.test.ts
    │   │   ├── rituals.test.ts
    │   │   └── search.test.ts
    │   ├── http/
    │   │   ├── api-calculator.test.ts
    │   │   ├── api-cards-index.test.ts
    │   │   ├── api-cards.test.ts
    │   │   ├── api-chain-search.test.ts
    │   │   ├── api-fusions.test.ts          # También `/api/results` y `/api/equips`
    │   │   ├── api-hand-validation.test.ts  # Validación de la mano en los dos `POST`
    │   │   ├── assets.test.ts
    │   │   ├── lang-route.test.ts
    │   │   ├── legacy-route.test.ts
    │   │   ├── middleware-i18n.test.ts
    │   │   └── views-route.test.ts
    │   ├── app.test.ts                      # Manejador de errores
    │   └── config.test.ts
    └── shared/
        ├── card-image-overrides.test.ts     # Forma de la lista de excepciones
        ├── i18n-parity.test.ts              # `es` y `en` con las mismas claves
        └── i18n.test.ts
```

### Archivos de la raíz

```
YGO-FM-FusionCalc/
├── .env.example          # Plantilla de variables de entorno
├── .gitattributes
├── .gitignore
├── .nvmrc                # Node 24
├── .prettierignore
├── .prettierrc           # `printWidth` 109, 4 espacios
├── nodemon.json          # Reinicio en desarrollo (`npm run dev`, ejecuta `tsx`)
├── package.json
├── package-lock.json
├── playwright.config.ts  # E2E: arranca `npm run start` en el puerto 3000
├── README.md
├── render.yaml           # Configuración de Render
├── tailwind.config.ts    # Archivos que escanea Tailwind
├── tsconfig.json         # Base
├── tsconfig.server.json  # Extiende la base: servidor, salida a `dist/`
├── tsconfig.client.json  # Extiende la base: navegador, sin emitir
├── vite.config.ts        # Bundles del cliente: una entrada por página
└── vitest.config.ts      # Tests unitarios y umbrales de cobertura
```

## Reglas de ubicación

### Reglas duras

- Nuevas plantillas EJS → `views/` (página) o `views/partials/` (parcial reutilizado).
- Nueva ruta → `src/server/http/routes/` (vista o api según corresponda).
- Nueva lógica de juego → `src/server/domain/`.
- Tipos compartidos → `src/shared/types.ts` (no duplicar en cliente y servidor). Las constantes que comparten cliente y servidor (como `MAX_HAND_SIZE`) → `src/shared/`.
- Cadenas de traducción → `src/shared/i18n/{es,en}.json`. Ambas claves obligatorias.
- Nuevo script de cliente para una página existente → `src/client/pages/<page>.ts`.
- Nueva página visible → vista EJS + entry en `src/client/pages/` + ruta en `src/server/http/routes/views.ts`. Las tres cosas a la vez, y darla de alta en `rollupOptions.input` de `vite.config.ts`.
- Nuevos assets de imagen → `public/images/` (subcarpeta si forman un grupo: `characters/`, `backgrounds/`). Las imágenes de carta no viven en el repositorio: se cargan del CDN de YGOProDeck (ver `.sdd/specs/20260501-card-images.md`).
- Nuevos medios distintos a imagen → nueva carpeta hija de `public/` (`public/audio/`, `public/video/`, etc.). No mezclar en `images/`.
- Tests acompañan al código que prueban (mismo path bajo `tests/unit/`).
- Scripts de mantenimiento (no de runtime) nuevos → `src/scripts/`, en TypeScript y ejecutados con `tsx`. Los Ruby de `scripts/` son heredados y se reescribirán ahí.

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

- Se commitean: `data/*.json`, todo `src/`, todo `views/`, `public/images/`.
- NO se commitean: `public/dist/`, `dist/`, `node_modules/`, `.env`, `coverage/`, `.vite/`, `playwright-report/`, `test-results/`.
- `.gitignore` debe reflejar lo anterior. Cuando se añada una nueva carpeta de output, se actualiza.

## Convención de nombres en archivos

- TypeScript de servidor y cliente: `kebab-case.ts`.
- Plantillas EJS: `kebab-case.ejs`.
- Tests Vitest: espejo del archivo, con sufijo `.test.ts`.
- Tests Playwright: `<feature>.spec.ts`.
- SPECs y PLANs: `yyyymmdd-kebab-case.md`.

## Historial

Esta estructura sustituyó a la del repositorio original (HTMLs en la raíz y scripts y estilos estáticos en `public/`) con las SPECs `20260429-scaffold-node-ts`, `20260429-pages-to-ejs-i18n` y `20260429-client-port-domain-api`, todas COMPLETADO. Los datos derivados siguen commiteados en `data/`.
