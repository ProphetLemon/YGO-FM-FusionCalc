# Yu-Gi-Oh! Forbidden Memories — Calculadora de Fusiones

Versión: 0.9.0

Yu-Gi-Oh! Forbidden Memories tiene cientos de fusiones posibles entre sus más de 720 cartas. El juego no te dice cuáles son, y descubrirlas a mano sería interminable. Esta calculadora te ayuda a sacar el máximo partido a tu mano y planificar tus jugadas.

Basada en el proyecto original de [Solumin](https://github.com/Solumin/YGO-FM-FusionCalc), adaptada y extendida por Diego Vidal del Rosal.

---

## Funcionalidades

- **Buscador de fusiones** — busca todas las fusiones y equipos posibles para una carta concreta.
- **Calculadora de mano** — introduce tu mano completa y obtén todas las fusiones y equipos disponibles al instante.
- **Cadena óptima de fusiones** — encuentra la secuencia de fusiones que maximiza el ATK del resultado final.
- **Imágenes de carta** — artwork real de cada carta vía CDN de YGOProDeck.
- **i18n** — interfaz disponible en español e inglés.

---

## Ejecutar en local

Requisito: Node 24 (ver `.nvmrc`).

```sh
nvm use
npm install
npm run dev
```

La app estará disponible en http://localhost:3000.

`npm run dev` usa **nodemon** y reinicia el servidor automáticamente al modificar archivos del servidor, plantillas EJS o i18n. Para recompilar el cliente tras cambios en `src/client/`, ejecuta `npm run build:client`.

---

## Build y arranque (modo producción)

```sh
npm run build
npm start
```

---

## Tests

```sh
npm test          # Tests unitarios Vitest con cobertura
npm run test:e2e  # Tests end-to-end con Playwright
```

---

## Despliegue

Desplegado como Web Service en [Render](https://render.com) usando `render.yaml`.

URL: https://ygo-fm-fusion-calc.onrender.com/

---

## Arquitectura

App Express + EJS renderizada en servidor con cliente TypeScript compilado con Vite.

- `src/server/domain/` — lógica de dominio (fusiones, cálculo, cadenas)
- `src/server/data/store.ts` — carga de datos JSON en memoria al arrancar
- `src/client/` — cliente TypeScript; consume la API REST bajo `/api/`
- `src/shared/` — tipos e i18n compartidos entre cliente y servidor
- `.sdd/` — SPECs y PLANs del proceso de desarrollo dirigido por especificaciones

---

## Roadmap

- [x] Scaffolding Node + TypeScript y servidor Express mínimo
- [x] Páginas EJS con layouts y partials
- [x] Estilos Tailwind en todas las páginas
- [x] i18n español (por defecto) e inglés
- [x] Scripts de cliente en TypeScript; eliminados jQuery, Bootstrap y TaffyDB
- [x] Capa de dominio en servidor con cobertura de tests unitarios
- [x] API REST para cartas, fusiones, equipos, resultados y calculadora
- [x] Número dinámico de ranuras en la calculadora
- [x] Búsqueda de cadena de fusiones óptima
- [x] Imágenes reales de carta
- [x] Cuadrícula de cartas con artwork en la calculadora
- [ ] Filtros y ordenación por tipo, ATK/DEF y estrellas
- [ ] Constructor de mazo persistido en `localStorage`
- [ ] Vista de detalle de carta mejorada
- [ ] Búsqueda aproximada (fuzzy search)
- [ ] Exportar / importar manos
- [ ] PWA / soporte offline

---

## Agradecimientos

- [Solumin](https://github.com/Solumin) y colaboradores por el proyecto original.
- Steve Kalynuik, Dylan Birtolo y Miguel Balauag, autores del [Fusion FAQ](https://www.gamefaqs.com/ps/561010-yu-gi-oh-forbidden-memories/faqs/16613).
- [CathodeRaymond](https://github.com/CathodeRaymond) por el trabajo original con CSS.
- [duke1102](https://github.com/duke1102) por proporcionar `Cards.json`.
- marcos0000 por el logo de Forbidden Memories en HD ([DeviantArt](https://www.deviantart.com/marcos0000)) y Carlos123321 por el fondo VRAINS ([DeviantArt](https://www.deviantart.com/carlos123321)).
- Giver336 por el GIF.
