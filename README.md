# Yu-Gi-Oh! Forbidden Memories — Calculadora de Fusiones

Versión: 0.9.0

Yu-Gi-Oh! Forbidden Memories tiene cientos de fusiones posibles entre sus más de 720 cartas. El juego no te dice cuáles son, y descubrirlas a mano sería interminable. Esta calculadora te ayuda a sacar el máximo partido a tu mano y planificar tus jugadas.

Basada en el proyecto original de [Solumin](https://github.com/Solumin/YGO-FM-FusionCalc), adaptada y extendida por Diego Vidal del Rosal.

---

## Funcionalidades

- **Buscador de fusiones** — busca todas las fusiones y equipos posibles para una carta concreta; los equipos indican qué carta es el Equip y cuál el monstruo.
- **Calculadora de mano** — introduce tu mano y obtén al instante todas las fusiones, equipos y rituales disponibles. Empieza con 5 ranuras y admite hasta 12, con un contador y un medidor que indican cuántas hay de las 12 posibles. Cada carta de la mano se muestra como una ficha con su imagen, su ATK/DEF o su tipo y un marco de color según su clase (monstruo, fusión, equipo o magia), con una leyenda debajo. La mano se guarda en el navegador y sobrevive a las recargas y al cambio de idioma. Muestra una pista hasta tener 2 cartas, un indicador de carga, mensajes cuando no hay resultados y un aviso con reintento si falla la lista de cartas.
- **Dos columnas** — en pantallas anchas la mano queda a la izquierda y la respuesta a la derecha. En el móvil, en cuanto la mano tiene 2 cartas, la respuesta pasa por encima de la mano.
- **Resultados por tipo** — las fusiones se muestran en una tabla con la carta que se obtiene, su ATK/DEF y las dos cartas que la forman. Las que dan un monstruo van primero y la primera lleva la etiqueta «Mejor fusión simple»; las que dan otro tipo de carta van en un apartado de la misma tabla, «Resultados que no son monstruos», con «Sin ATK». Los equipos van en su propio panel (equipo → monstruo) y los rituales en otro, que indica cuándo no hay ninguno.
- **Aplicar una fusión a la mano** — al elegir una fila de la tabla de fusiones (con el ratón, o con el teclado e Intro), sus dos cartas salen de la mano: el resultado ocupa la ranura de la primera y la de la segunda queda vacía. Los resultados y las cadenas se recalculan, así que se puede seguir fusionando paso a paso, y la mano nueva se guarda.
- **Rituales** — un ritual aparece cuando la mano contiene la carta de ritual y sus tres materiales (se cuentan las copias).
- **Cadena óptima de fusiones** — con 2 cartas o más, la calculadora busca sola, sin pulsar ningún botón, las secuencias de fusiones que maximizan el ATK del resultado final: hasta 5 cadenas, una por monstruo final y por su ruta más corta, ordenadas por ATK y, a igualdad, por menos pasos. La mejor jugada va primero: una frase dice qué carta se obtiene y en cuántos pasos, la carta final aparece grande con su ATK y, si supera a la mejor fusión simple de la mano, se indica cuánto ATK gana. Cada cadena tiene su pestaña, con la mejor primero. Los pasos se muestran como «carta + carta = resultado», y la carta que sale de un paso anterior lleva la nota «Resultado del paso N». Si la búsqueda falla, un botón permite reintentarla.
- **Mejor mazo** — la página `/deck` lee en el navegador una partida de Forbidden Memories (el archivo no se sube; al servidor solo viajan los números de las cartas del mazo y de repuesto), muestra tu mazo y tus cartas disponibles y calcula qué cartas cambiar para que el mazo de 40 cartas juegue mejor. Si el archivo trae varias partidas, se elige una. El resultado compara el mazo actual con el recomendado (ataque medio de la mejor jugada, manos de 1500 o más y de 2000 o más, y manos sin jugada), lista los cambios «sale → entra» con sus cartas, enseña las 40 cartas con las nuevas marcadas y las fusiones en las que se apoya. Antes de calcular, las 40 cartas del mazo aparecen como fichas que se pueden bloquear (botones con candado, que también se activan con el teclado): una carta bloqueada se queda en el mazo. Por defecto están bloqueadas la magia, los equipos y los campos, y no los monstruos; se puede cambiar carta a carta, y el resultado marca las cartas bloqueadas. Las cartas de repuesto salen en una lista plegable, con los monstruos primero por ATK. Los nombres, tipos y ATK salen del catálogo de cartas (`GET /api/cards-index`, una sola petición), no de una petición por carta. El texto del resultado dice solo lo que la respuesta garantiza: «el mejor mazo posible» (o «que conserva las cartas bloqueadas»), «ningún cambio de una carta lo mejora» o «el mejor encontrado en el tiempo disponible».
- **Autocompletado** — hasta 8 sugerencias por prefijo, inicio de palabra o subcadena, sin distinguir mayúsculas, acentos, guiones ni signos de puntuación.
- **Imágenes de carta** — artwork real de cada carta vía CDN de YGOProDeck; si una carta no tiene, se muestra un marcador con su nombre.
- **i18n** — interfaz disponible en español e inglés.
- **Estilo Workbench** — todas las páginas usan paneles en relieve con cabecera de color sobre un fondo gris, con las fuentes Chakra Petch y Hanken Grotesk.

---

## Límites y limitaciones conocidas

### Límites

| Tema         | Comportamiento                                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mano         | 5 ranuras al empezar, máximo 12 (`MAX_HAND_SIZE` en `src/shared/limits.ts`). «Añadir carta» se desactiva al llegar al máximo.                                                                                                                                                                                                                                                      |
| Cadenas      | Hasta 5 por búsqueda. Si se agota `MAX_CHAIN_STATES` (50 000 estados), la API responde `truncated: true` y la página avisa de que el resultado puede ser parcial.                                                                                                                                                                                                                  |
| Rituales     | Solo recetas completas (carta de ritual y sus 3 materiales en la mano). No hay avance parcial ni se integran en las cadenas.                                                                                                                                                                                                                                                       |
| Mejor mazo   | El mazo tiene 40 cartas y cada carta entra como mucho 3 veces (`DECK_SIZE` y `MAX_COPIES_PER_CARD` en `src/shared/limits.ts`). Un cálculo tarda hasta unos 5 s y solo se hace uno a la vez: si llega otro, la API responde `503`. El archivo de partida puede pesar hasta 1 MB. Las cartas bloqueadas (`locked`) nunca salen del mazo y las prohibidas (`forbidden`) nunca entran. |
| Persistencia | La mano se guarda en `localStorage` (clave `ygo-fm-fusioncalc:hand:v1`). Si el navegador bloquea el almacenamiento, la página funciona igual pero no recuerda la mano.                                                                                                                                                                                                             |

Los dos `POST` de la API (`/api/calculator` y `/api/chain-search`) reciben `{ "handIds": [...] }` y ignoran los ids que no corresponden a ninguna carta. Errores de validación:

| Respuesta | Código              | Cuándo                                        |
| --------- | ------------------- | --------------------------------------------- |
| `400`     | `invalid-hand`      | `handIds` no es un array de enteros positivos |
| `400`     | `hand-too-large`    | hay más de 12 ids                             |
| `400`     | `invalid-json`      | el cuerpo no es JSON válido                   |
| `413`     | `payload-too-large` | el cuerpo supera 32 kB                        |

`POST /api/deck/optimize` recibe `{ "deck": [40 ids], "trunk": [{ "id", "count" }], "keepNonMonsters": true, "locked": [{ "id", "count" }], "forbidden": [ids] }` (`keepNonMonsters`, `locked` y `forbidden` van en el nivel superior y son opcionales; `keepNonMonsters` vale `true` si se omite). `locked` exige cartas: el mazo recomendado tiene al menos `count` copias de cada `id`, estén hoy en el mazo o entre las cartas sobrantes, y `count` llega hasta las copias que el mazo puede tener (las que posees, hasta 3); se suman a los no monstruos que conserva `keepNonMonsters`. `forbidden` es una lista de ids distintos de cartas que posees que el mazo recomendado no puede tener, y gana a `keepNonMonsters`; no puede repetir un id de `locked`. Con reglas que el mazo actual incumple, la respuesta es el mejor mazo que las cumple, aunque tenga un promedio menor que `current`. `certified` significa que es el mejor entre los mazos que cumplen las reglas. Responde con las estadísticas actuales y recomendadas, los cambios, el mazo recomendado y `certified`, `method` y `truncated`. Errores:

| Respuesta | Código              | Cuándo                                                                                                                                                                              |
| --------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`     | `invalid-deck`      | `deck` no son exactamente 40 enteros positivos                                                                                                                                      |
| `400`     | `invalid-trunk`     | `trunk` mal formado, con ids repetidos o con un `count` fuera de 0–255                                                                                                              |
| `400`     | `invalid-options`   | `keepNonMonsters` no es un booleano                                                                                                                                                 |
| `400`     | `invalid-locks`     | `locked` mal formado: más de 40 entradas, ids repetidos o desconocidos, o un `count` menor que 1 o mayor que las copias que el mazo puede tener                                     |
| `400`     | `invalid-forbidden` | `forbidden` mal formado: no es un array, tiene más entradas que cartas distintas posees, ids repetidos o desconocidos, una carta que no posees o un id que también está en `locked` |
| `400`     | `impossible-deck`   | las reglas no dejan ningún mazo de 40 cartas: las copias exigidas pasan de 40 o las permitidas no llegan a 40 (`error.details` trae `required`, `allowed` y `size`)                 |
| `400`     | `unknown-card`      | algún id no corresponde a ninguna carta                                                                                                                                             |
| `400`     | `invalid-json`      | el cuerpo no es JSON válido                                                                                                                                                         |
| `413`     | `payload-too-large` | el cuerpo supera 32 kB                                                                                                                                                              |
| `503`     | `busy`              | ya hay un cálculo en marcha; la cabecera `Retry-After` indica cuánto esperar                                                                                                        |
| `500`     | `internal-error`    | fallo del servidor                                                                                                                                                                  |

### Limitaciones conocidas

- **Nombres de carta solo en inglés.** La interfaz está en español e inglés, pero no hay una fuente de datos con los nombres en español.
- **Modelo de cadenas sin verificar en el juego real.** Se puede fusionar cualquier par de cartas de la mano de trabajo, incluidos dos resultados intermedios entre sí. No está comprobado que el juego lo permita, así que alguna cadena podría no ser ejecutable. Ver «Preguntas abiertas» en [`.sdd/specs/20260501-chained-fusion-search.md`](.sdd/specs/20260501-chained-fusion-search.md). Un test fija ese comportamiento (`can fuse two intermediate results with each other` en `tests/unit/server/domain/chain-search.test.ts`): es el que hay que cambiar si el juego no lo permite.
- **Imágenes enlazadas directamente desde YGOProDeck.** La [guía de su API](https://ygoprodeck.com/api-guide/) pide descargarlas y alojarlas uno mismo: «Do not continually hotlink images directly from this site. Please download and re-host the images yourself. Failure to do so will result in an IP blacklist.» Es una limitación anterior a los últimos cambios; alojar las imágenes en el propio proyecto queda como tarea aparte.
- **La búsqueda de cadenas se lanza en cada cambio de mano.** El navegador cancela la petición anterior, pero el servidor termina de calcularla igualmente (hasta `MAX_CHAIN_STATES` estados), y la API no limita el número de peticiones.
- **Mejor mazo: las mejoras de equipos y campos no se puntúan.** El juego no trae sus cifras, así que la magia, los equipos y los campos valen 0 al comparar mazos. Por eso la opción «Mantener la magia, los equipos y los campos» está activa por defecto.
- **Mejor mazo: el límite de 3 copias es una suposición.** Ninguna fuente ha confirmado la regla del juego; vive en una sola constante (`MAX_COPIES_PER_CARD`) para cambiarla fácilmente.
- **Mejor mazo: sin límite por IP.** Solo se calcula un mazo a la vez (el resto recibe `503`), pero la API no limita cuántas peticiones puede hacer una misma IP.
- **Mejor mazo: con colecciones de final de partida el resultado suele ser `truncated`.** Con muchas cartas la búsqueda agota su tiempo (unos 5 s) y la página dice que es el mejor mazo encontrado, no que sea el mejor posible. Solo con colecciones pequeñas se prueban todos los mazos y se puede afirmar que es el mejor posible.
- **Mejor mazo: formatos de partida.** El archivo se reconoce por su contenido, no por la extensión: un bloque de partida de 8 KB (`.sav`), `.mcs`, tarjeta de memoria en bruto (`.mcr`, `.mcd`, `.srm`, `.mc`), `.gme` y `.SAVERAM`. Se ha comprobado con una partida real de un solo bloque; el resto de formatos solo se ha probado con partidas sintéticas. No se admite la edición japonesa (disposición desconocida) ni se escribe ninguna partida.
- **17 de las 722 cartas no tienen artwork** (medición del 2026-09-30) y muestran un marcador con su nombre. Detalle y método en [`.sdd/specs/20260501-card-images.md`](.sdd/specs/20260501-card-images.md).

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
npm test          # Tests unitarios Vitest con cobertura (umbral del 80 % en servidor y `shared`)
npm run build     # Necesario antes de los e2e
npm run test:e2e  # Tests end-to-end con Playwright (Chromium)
```

Los e2e usan la app **compilada**: Playwright arranca `npm run start` (`node dist/server/index.js`), así que sin un `npm run build` previo prueban una versión anterior o no arrancan. Además:

- Chromium debe estar instalado para Playwright: `npx playwright install chromium`.
- El puerto 3000 debe estar libre: fuera de CI, Playwright reutiliza el servidor que ya haya en él.

---

## Despliegue

Desplegado como Web Service en [Render](https://render.com) usando `render.yaml`.

URL: https://ygo-fm-fusion-calc.onrender.com/

---

## Arquitectura

App Express + EJS renderizada en servidor con cliente TypeScript compilado con Vite.

- `src/server/domain/` — lógica de dominio (fusiones, cálculo, cadenas, rituales)
- `src/server/data/store.ts` — carga de datos JSON en memoria al arrancar
- `src/server/http/routes/api.ts` — endpoints de la API REST y validación de la mano
- `src/client/` — cliente TypeScript; consume la API REST bajo `/api/`. La lógica que no toca el DOM vive en `src/client/lib/` con tests unitarios (`name-search.ts`, `hand-storage.ts`, `latest.ts`, `slots.ts`, `fm-save.ts`, `deck-view.ts`)
- `src/shared/` — tipos, i18n y constantes compartidas entre cliente y servidor (`limits.ts` con `MAX_HAND_SIZE`, `card-image-overrides.json`)
- `.sdd/` — SPECs y PLANs del proceso de desarrollo dirigido por especificaciones; [`.sdd/context/structure.md`](.sdd/context/structure.md) tiene el mapa completo de archivos

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
- [x] Rituales en la calculadora
- [x] Mano de la calculadora persistida en `localStorage`
- [x] Autocompletado por subcadena
- [x] Estados de la calculadora: pista, carga, sin resultados y errores con reintento
- [x] Rediseño de la calculadora: mejor jugada primero, resultados por tipo y dos columnas
- [x] Estilo Workbench en todo el sitio: pestañas de cadenas, tabla de fusiones y paneles de equipos y rituales
- [x] Aplicar una fusión de la tabla a la mano
- [x] Mejor mazo a partir de una partida guardada (`/deck`)
- [ ] Filtros y ordenación por tipo, ATK/DEF y estrellas
- [ ] Constructor de mazo persistido en `localStorage`
- [ ] Vista de detalle de carta mejorada
- [ ] Búsqueda aproximada (fuzzy search): la búsqueda por subcadena ya existe; falta tolerar erratas
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
