# SPEC: card-images

Estado: COMPLETADO
Fecha: 2026-05-01
Slug: `card-images`

**Enmienda 2026-09-30:** `password` deja de ser el identificador de imagen. `CardSummary` gana `imageCode` (nombre del fichero en el CDN), que sale de una lista de excepciones por id de carta o de la contraseña sin ceros a la izquierda, y es `null` si la contraseña no sirve (solo ceros) y la carta no tiene excepción. Una carta sin `imageCode` no pide ninguna imagen y muestra un marcador con su nombre (una caja lisa en las miniaturas); si el CDN no sirve el fichero de un `imageCode`, el marcador aparece tras la petición fallida. Ver «Fuente de imágenes», «Marcador», «Medición del CDN» y «Limitaciones conocidas».

---

## Contexto y motivación

Los componentes de carta (`renderCardSummary`, `renderPair`) muestran solo texto. Añadir la imagen de la carta mejora significativamente la legibilidad y el reconocimiento visual, especialmente en los resultados de búsqueda y calculadora donde aparecen hasta 10-20 cartas a la vez.

El campo `password` de `CardSummary` (= `CardCode` del JSON, ej. `"89631139"`) es el número de carta Konami tal como lo guarda el juego, y la página de búsqueda lo muestra como «Contraseña». **No** siempre es el nombre del fichero en el CDN público de YGOProDeck, que no necesita API key:

```
https://images.ygoprodeck.com/images/cards/{imageCode}.jpg
```

Dos casos separan la contraseña del fichero del CDN:

- El juego rellena la contraseña con ceros a la izquierda hasta 8 dígitos (`"04931562"`) y el CDN nombra el fichero sin ellos (`4931562.jpg`).
- Algunas cartas exclusivas de FM tienen una contraseña de solo ceros (`"00000000"`) o una que el CDN no conoce.

---

## Objetivo

Mostrar la imagen de la carta (artwork) en los dos componentes de renderizado existentes:

1. **`renderCardSummary`** — vista detalle de carta en la página de búsqueda.
2. **`renderPair`** — cada tarjeta compacta de par (fusiones, equips, resultados).

---

## Alcance

### Incluye

- Nuevo helper `src/client/lib/card-image.ts` con `createCardImg`, `hasArtwork` y `cardImageUrl`.
- Modificar `src/client/components/card-display.ts` — añadir imagen grande en `renderCardSummary`.
- Modificar `src/client/components/fusion-card.ts` — añadir thumbnail en `renderPair`.
- Enmienda: campo `imageCode` en `CardSummary` (`src/shared/types.ts`), calculado por `toCardSummary` (`src/server/domain/cards.ts`) con la lista `src/shared/card-image-overrides.json`. La API lo devuelve en cada `CardSummary`.
- Sin cambios en EJS ni i18n (el `alt` y el nombre del marcador usan `card.name`, que ya existe).

### Excluye

- Caché local de imágenes.
- Cambiar el CDN ni alojar imágenes propias (ver «Limitaciones conocidas»).

---

## Fuente de imágenes

**CDN**: `https://images.ygoprodeck.com/images/cards/{imageCode}.jpg`

- Gratuito, sin autenticación, accesible públicamente.
- Imágenes de 177×254 px (relación de aspecto de carta TCG).

### Cómo se calcula `imageCode`

`toCardSummary` aplica estas reglas en orden:

| #   | Regla                                                            | `imageCode`                       | Ejemplo                                             |
| --- | ---------------------------------------------------------------- | --------------------------------- | --------------------------------------------------- |
| 1   | El id de la carta está en `src/shared/card-image-overrides.json` | la contraseña real de esa lista   | Gate Guardian (id 374, `"00000000"`) → `"25833572"` |
| 2   | La contraseña es numérica y no es solo ceros                     | la contraseña sin ceros a la izq. | `"04931562"` → `"4931562"`; `"89631139"` no cambia  |
| 3   | La contraseña es de solo ceros o no es numérica                  | `null`                            | Meteor B. Dragon (id 713, `"00000000"`) → `null`    |

`password` no cambia: sigue siendo `CardCode` tal como está en los datos (`"04931562"`, `"00000000"`).

### Lista de excepciones

`src/shared/card-image-overrides.json` asocia el id de una carta con su contraseña real, escrita sin ceros a la izquierda. Tiene 21 entradas: 20 son cartas sin contraseña (todo ceros) y una es Puppet Ritual (id 695), cuya contraseña `"05783166"` no tiene fichero en el CDN.

Cómo se obtuvo (enmienda 2026-09-30): para cada carta cuya imagen fallaba (24 con contraseña de ceros y 14 cuya contraseña no funciona ni sin ceros) se consultó la API de YGOProDeck, `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=<nombre exacto>`. Solo se aceptó la entrada si se cumplían las dos condiciones:

1. El nombre coincide exactamente (sin distinguir mayúsculas).
2. `https://images.ygoprodeck.com/images/cards/<id>.jpg` responde 200.

Se aceptaron 21 y se rechazaron 17. Nunca se inventa una contraseña.

`tests/unit/shared/card-image-overrides.test.ts` comprueba la forma de la lista (ids de cartas del juego, códigos numéricos sin ceros, sin códigos repetidos). Que cada entrada sea la carta correcta solo se puede comprobar contra la API, así que ningún test lo hace.

### Seguimiento

Meteor B. Dragon (id 713) tiene un candidato verificado, `"90660762"` (en la API se llama «Meteor Black Dragon», con las mismas ATK/DEF 3500/2000, y su imagen responde 200), pero no se añadió: dos tests lo usan como ejemplo de carta sin artwork (`tests/e2e/card-images.spec.ts` y `NO_ARTWORK_IDS` en `tests/unit/server/domain/cards.test.ts`). Para añadirlo hay que poner `"713": "90660762"` en la lista y mover esos tests a otra carta sin artwork (Psycho-Puppet) o a un 404 simulado.

---

## Helper `src/client/lib/card-image.ts`

| Función                                                  | Qué hace                                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `hasArtwork(imageCode)`                                  | `true` si `imageCode` es un texto que no está vacío ni es solo ceros                                |
| `cardImageUrl(imageCode)`                                | Devuelve la URL del CDN para ese código                                                             |
| `createCardImg(name, imageCode, className, { compact })` | Devuelve un contenedor `div` con `className` que lleva la `<img>` y el marcador, o solo el marcador |

### Qué muestra y cuándo pide la imagen

| Situación                                                        | Resultado                                                                           | Petición al CDN |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------- |
| `imageCode` con fichero en el CDN                                | `<img>` con `loading="lazy"` y `alt` = nombre de la carta; el marcador queda oculto | una             |
| `imageCode` `null`, vacío o solo ceros (`hasArtwork` es `false`) | solo el marcador                                                                    | ninguna         |
| `imageCode` cuyo fichero el CDN no sirve (404 o fallo de red)    | el evento `error` oculta la `<img>` y muestra el marcador                           | una, fallida    |

### Marcador

- Lleva `role="img"` y `aria-label` = nombre de la carta.
- **Grande** (por defecto: ranura de la calculadora y `renderCardSummary`): caja con el nombre de la carta, hasta 5 líneas, con las palabras largas partidas para que quepa en una ranura de móvil.
- **Miniatura** (`compact: true`, la de las líneas de carta de `renderPair`): caja lisa, porque el texto de al lado ya nombra la carta.

---

## Cambios en `renderCardSummary`

Layout resultante: imagen a la izquierda (160×224 px, proporciones de carta), stats a la derecha.

```
┌─────────────────────────────────────────┐
│  [imagen]   Nombre de la carta           │
│  160×224    Descripción del efecto       │
│             ATK / DEF: 3000 / 2500       │
│             Tipo: Dragon                 │
│             Estrellas: 999999            │
│             Contraseña: 89631139         │
└─────────────────────────────────────────┘
```

Clase del contenedor de imagen: `w-40 h-56 flex-shrink-0` (160×224 px). La contraseña que se muestra es `password`, no `imageCode`.

---

## Cambios en `renderPair`

Cada línea de carta (card1, card2, result) lleva un thumbnail de 40×56 px a la izquierda del texto.

```
┌──────────────────────────────────┐
│ [thumb] Input: Mystical Elf      │
│ [thumb] Input: Mushroom Man      │
│ [thumb] Result: Dark Sage (2800) │
└──────────────────────────────────┘
```

Clase del thumbnail: `w-10 h-14 flex-shrink-0`.

La misma línea de carta (`makeCardLine`) la usan `renderEquip`, `renderRitual` y `renderChain`, así que los equips, los rituales y los pasos de la cadena óptima también llevan miniatura.

---

## Medición del CDN (2026-09-30)

Peticiones HEAD a `images.ygoprodeck.com` hechas para esta enmienda: 774, de las que 686 respondieron 200 y 88 respondieron 404. Los números dependen del CDN y ningún test los comprueba, así que pueden cambiar.

| Grupo de cartas                                   | Cartas  |
| ------------------------------------------------- | ------- |
| El CDN sirve la imagen con la contraseña tal cual | 615     |
| Solo la sirve sin los ceros a la izquierda        | 69      |
| Contraseña de solo ceros                          | 24      |
| Sin imagen de ninguna de las dos formas           | 14      |
| **Total**                                         | **722** |

- Quitar los ceros no empeora ninguna carta: ninguna de las 615 dejó de funcionar.
- Con las 21 excepciones tienen artwork **705 de 722** cartas.
- Quedan **17** sin artwork: 4 sin `imageCode` (Meteor B. Dragon, Psycho-Puppet, Mask of Shine & Dark y Dark Magic Ritual) y 13 con un `imageCode` que el CDN no sirve.

---

## Limitaciones conocidas

- **Enlace directo al CDN (hotlinking).** La app carga cada imagen directamente de `images.ygoprodeck.com`. La [guía de la API de YGOProDeck](https://ygoprodeck.com/api-guide/) (consultada el 2026-09-30) dice: «Do not continually hotlink images directly from this site. Please download and re-host the images yourself. Failure to do so will result in an IP blacklist.» El diseño original ya funcionaba así (excluye alojar imágenes propias), de modo que no es una regresión. Alojar las imágenes en el proyecto es una tarea aparte que esta enmienda no hace.
- **Cartas con `imageCode` sin fichero.** Las 13 cartas indicadas en la medición piden una imagen que el CDN no tiene: cada render cuesta una petición 404 y después muestra el marcador. Se acepta por ahora.

---

## Accesibilidad

- `alt` = nombre de la carta (siempre disponible en `CardSummary.name`).
- `loading="lazy"` en todas las imágenes de carta.
- El marcador no es decorativo: lleva `role="img"` y `aria-label` con el nombre, porque en la ranura de la calculadora puede ser lo único que identifique a la carta.

---

## Tests

- `tests/unit/server/domain/cards.test.ts` — reglas de `imageCode`, aplicación de cada excepción y que solo las cartas 713, 715, 720 y 721 se queden sin `imageCode`.
- `tests/unit/shared/card-image-overrides.test.ts` — forma de la lista de excepciones.
- `tests/unit/client/card-image.test.ts` — `hasArtwork` y `cardImageUrl`.
- `tests/unit/server/http/api-cards.test.ts` — `imageCode` y `password` en la respuesta de la API.
- `tests/e2e/card-images.spec.ts` — artwork, marcador grande y de miniatura, y que no se pida nada al CDN sin `imageCode`.

Los componentes de renderizado DOM no se testean en Vitest (entorno `node`); su comportamiento lo cubre el e2e.

---

## Criterios de aceptación

1. Al buscar una carta conocida (ej. «Blue-eyes White Dragon»), la vista detalle muestra su imagen junto a los stats.
2. En los resultados de fusión/equip de la búsqueda, cada tarjeta compacta muestra el thumbnail de las dos cartas de entrada y del resultado.
3. En la calculadora, los resultados de fusiones, equips y rituales, y los pasos de la cadena óptima, muestran los thumbnails.
4. Una carta sin `imageCode` muestra el marcador (con su nombre si es grande, liso si es miniatura) y no pide ninguna imagen. Una carta con `imageCode` que el CDN no sirve muestra el mismo marcador sin lanzar excepciones de JavaScript.
5. `password` sigue siendo `CardCode` sin cambios, e `imageCode` sigue las reglas de «Cómo se calcula `imageCode`».
6. `npm run build` pasa sin errores TypeScript.
7. Los tests existentes (unit + E2E) no se rompen.
