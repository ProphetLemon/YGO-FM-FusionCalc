# SPEC: chained-fusion-search

Estado: COMPLETADO
Fecha: 2026-05-01
Slug: `chained-fusion-search`

**Enmienda 2026-09-29:** la búsqueda deja de recoger solo estados terminales (DFS) y pasa a una búsqueda en anchura (BFS) que registra un candidato en cada fusión. El monstruo final de una cadena es el resultado de su último paso, se devuelve la ruta más corta a cada carta final y la respuesta incluye `truncated`. Ver «Algoritmo», «API» y «Preguntas abiertas».

---

## Contexto y motivación

La calculadora actual muestra todas las fusiones de **un solo paso** posibles con la mano (par A+B → C). Sin embargo, en YGO:FM las fusiones se pueden encadenar: el resultado de una fusión puede participar en otra. Por ejemplo, con la mano [A, B, C]:

```
A + B → X   (paso 1)
X + C → Y   (paso 2, Y tiene mayor ATK que X)
```

El usuario quiere saber cuál es la secuencia óptima de fusiones que maximiza el ATK del monstruo final obtenido a partir de su mano.

---

## Objetivo

Añadir, en la misma página `/calculator`, una sección «Cadena óptima» que calcule bajo demanda la mejor secuencia de fusiones de la mano actual, ordenada por ATK final descendente.

---

## Alcance

### Incluye

- **Datos**: función `getFusionResult(card1, card2)` en `src/server/data/store.ts`, respaldada por un `Map` anidado construido al cargar el store, para obtener el resultado de un par en O(1).
- **Dominio**: nueva función `findBestChains` en `src/server/domain/chain-search.ts`.
- **Tipos compartidos**: nuevas interfaces `FusionStep`, `ChainResult`, `ChainSearchResponse` en `src/shared/types.ts`.
- **API**: nuevo endpoint `POST /api/chain-search` en `src/server/http/routes/api.ts`.
- **Cliente**: nueva función `chainSearch(handIds)` en `src/client/lib/api.ts`.
- **Vista**: nueva sección «Cadena óptima» en `views/calculator.ejs`.
- **Página**: lógica de la nueva sección en `src/client/pages/calculator.ts`.
- **i18n**: claves nuevas en `es.json` y `en.json`.
- **Tests unitarios** (Vitest): cubrir `findBestChains` y `getFusionResult` con los datos reales del store.
- **Tests E2E** (Playwright): flujo básico cadena encontrada + mano sin fusiones posibles.

### Excluye

- Cambios en las páginas de búsqueda, inicio o acerca de.
- Mostrar equips dentro de la cadena (la cadena solo considera fusiones de monstruos).
- Permitir configurar el criterio de optimización (siempre es ATK máximo final).
- Persistir la cadena entre recargas.

---

## Comportamiento esperado

### Sección «Cadena óptima» en la calculadora

- Aparece siempre debajo de la sección de resultados simples.
- Contiene un botón **«Calcular cadena»** (`#chainBtn`).
- El botón se activa manualmente; **no** se recalcula automáticamente al cambiar la mano (el cálculo es costoso).
- Al pulsar el botón: llama a `POST /api/chain-search` con los IDs válidos de la mano actual.
- Mientras espera: muestra un indicador de carga (`#chain-loading`).
- Con resultado: muestra las top-5 cadenas en `#chain-output`, cada una con sus pasos y ATK final.
- Sin resultado (mano vacía, <2 cartas válidas, o sin fusiones posibles): muestra mensaje informativo.

### Formato de una cadena en la UI

Cada cadena muestra:
1. Los pasos en orden: «[carta1] + [carta2] → [resultado]» con ATK del resultado.
2. Una línea de resumen: «ATK final: {{atk}}» con el ATK del monstruo final de esa cadena, que es el resultado de su último paso (nunca una carta que solo permanezca en la mano).

Las cadenas se ordenan por ATK final descendente. Si hay empate en ATK final, va antes la cadena con menos pasos (más sencilla de ejecutar); si también empatan, la de menor ID de carta final.

---

## Algoritmo (descripción funcional)

La función `findBestChains(handIds, maxStates = MAX_CHAIN_STATES)` realiza una búsqueda en anchura (BFS) sobre el espacio de estados de la mano y devuelve `{ chains, truncated }`:

- **Entrada**: se descartan los IDs que no corresponden a ninguna carta.
- **Estado**: multiconjunto de IDs de carta actualmente en mano. Su clave es la lista de IDs ordenada numéricamente y unida con comas, de modo que el mismo multiconjunto alcanzado por distinto camino se reconoce como el mismo estado.
- **Mano de trabajo**: array en el que el resultado de cada fusión se añade al final; las cartas sin tocar conservan el orden de sus ranuras.
- **Transición**: elegir un par (i, j), con i < j según el orden de la mano de trabajo, que pueda fusionarse (`getFusionResult`) → quitar ambas cartas y añadir el resultado al final. Se puede fusionar cualquier par de la mano de trabajo, incluidos dos resultados intermedios (ver «Preguntas abiertas»).
- **Exploración**: por niveles (número de pasos). Un estado destino solo se expande si es nuevo, de modo que cada estado se expande una vez y con el menor número de pasos posible. Las cartas se representan por ID y cada estado guarda un puntero a su paso anterior; los `CardSummary` de los pasos solo se construyen para las cadenas devueltas.
- **Candidatos**: cada transición (no solo el primer descubrimiento de un estado) genera un candidato: la carta final es el resultado de esa transición y la ruta es la del estado de origen más ese paso. La mano inicial nunca es una cadena: no se devuelven cadenas de cero pasos.
- **Carta final**: es siempre el resultado del último paso (`finalCard` es igual a `steps.at(-1).result`), no la mejor carta que quede en la mano.
- **Solo monstruos**: solo compiten los candidatos cuya carta final es un monstruo (`isMonster`). Los pasos intermedios pueden producir cualquier tipo de carta.
- **Deduplicación**: se conserva un candidato por carta final. Como el BFS procesa los estados por profundidad no decreciente, el primero que aparece para cada carta final es el de menos pasos; ante un empate en pasos se conserva el primero en el orden de iteración (pares según el orden de la mano de trabajo, estados según el orden de descubrimiento), que es determinista.
- **Salida**: los top-`N` candidatos, con `N = 5`, ordenados por ATK final descendente, luego por menos pasos y luego por ID de carta final ascendente.

### Guarda de rendimiento

- Si `handIds.length > MAX_CHAIN_HAND` (constante: 12), el endpoint responde `400` con código `hand-too-large`.
- Presupuesto de estados: `MAX_CHAIN_STATES` (constante: 50 000). Si descubrir un estado nuevo hiciera superar el presupuesto, la búsqueda se detiene y devuelve las cadenas encontradas hasta ese momento con `truncated: true`; en cualquier otro caso `truncated` es `false`.
- Al truncar, las cadenas devueltas siguen siendo ejecutables desde la mano, pero pueden faltar otras mejores (más ATK o menos pasos) que no se llegaron a explorar.
- Calibración (Intel i5-12400F, Node 26, datos reales): en más de 900 manos aleatorias de 12 cartas el espacio completo no supera unos 7 500 estados (menos de 25 ms) y nunca se trunca. En manos de 12 cartas muy fusionables el espacio llega a cientos de miles de estados (hasta unos 450 000; el DFS anterior tardaba unos 5 s en la peor mano medida) y con el presupuesto el peor caso medido queda entre 0,2 y 0,3 s. En una muestra de 80 manos densas de 12 cartas (47 truncadas con este presupuesto) el top-5 truncado coincidió siempre con el exhaustivo, aunque esto no está garantizado.

---

## Tipos nuevos en `src/shared/types.ts`

```ts
export interface FusionStep {
    card1: CardSummary;
    card2: CardSummary;
    result: CardSummary;
}

export interface ChainResult {
    steps: FusionStep[];
    finalCard: CardSummary;
}

export interface ChainSearchResponse {
    chains: ChainResult[];
    truncated: boolean;
}
```

---

## API

### `POST /api/chain-search`

**Body:**
```json
{ "handIds": [2, 8, 15] }
```

**Validación:**
- `handIds` debe ser array de números enteros positivos.
- Si `handIds.length > 12`: `400` con código `hand-too-large`.
- Si `handIds` es inválido: `400` con código `invalid-hand`.

**Respuesta 200:**
```json
{
    "chains": [
        {
            "steps": [
                { "card1": { ... }, "card2": { ... }, "result": { ... } }
            ],
            "finalCard": { ... }
        }
    ],
    "truncated": false
}
```

`finalCard` es el resultado del último paso de `steps`. `truncated` es `true` solo cuando la búsqueda se detuvo al agotar `MAX_CHAIN_STATES`: las cadenas devueltas son válidas, pero pueden no ser las mejores.

**Respuesta vacía legítima:** `{ "chains": [], "truncated": false }` cuando no hay ninguna fusión posible con esa mano.

---

## i18n

Claves nuevas (paridad obligatoria):

| Clave | es | en |
|---|---|---|
| `calculator.chain.title` | «Cadena óptima de fusiones» | «Optimal fusion chain» |
| `calculator.chain.btn` | «Calcular cadena» | «Calculate chain» |
| `calculator.chain.loading` | «Calculando…» | «Calculating…» |
| `calculator.chain.no-result` | «No se encontró ninguna cadena posible con esta mano.» | «No fusion chain found for this hand.» |
| `calculator.chain.step` | «Paso {{n}}» | «Step {{n}}» |
| `calculator.chain.final-atk` | «ATK final: {{atk}}» | «Final ATK: {{atk}}» |
| `calculator.chain.hand-too-large` | «La mano es demasiado grande para el cálculo de cadenas (máximo {{max}} cartas).» | «Hand is too large for chain calculation (max {{max}} cards).» |

---

## Tests

### Vitest (unitarios) — `tests/unit/server/domain/chain-search.test.ts`

Usando los datos reales del store (`loadStore()`):

- Mano `[2, 8]` (Mystical Elf + Mushroom Man → Queen of Autumn Leaves, ID 638): devuelve una cadena de 1 paso con `finalCard.id = 638`.
- Mano `[1]` (solo Blue-Eyes, sin fusión), mano `[1, 1]` y mano `[]`: devuelven `{ chains: [], truncated: false }`.
- IDs desconocidos: se ignoran (`[2, 8, 999999]` equivale a `[2, 8]`).
- Mano `[13, 15, 325]` (Tyhone + Flame Swordsman + Machine Conversion Factory): una única cadena de 1 paso que termina en Crimson Sunbird (ATK 2300); nunca termina en Harpie's Feather Duster.
- Mano `[8, 9, 1]` (Mushroom Man + Shadow Specter + Blue-Eyes): una única cadena de 1 paso que termina en Wood Remains (ATK 1000); Blue-Eyes nunca es carta final.
- `finalCard` es el resultado del último paso; cada cadena es ejecutable desde la mano (se reproducen los pasos consumiendo cartas de la mano de trabajo) y termina en un monstruo.
- Cartas finales únicas; se conserva la ruta más corta a cada carta final; un par que se fusiona consigo mismo (`[15, 15]`) produce una cadena.
- Orden: ATK final descendente, luego menos pasos, luego ID de carta final ascendente; como máximo 5 cadenas; resultado determinista.
- Presupuesto: con un `maxStates` pequeño devuelve `truncated: true` con cadenas válidas; si el espacio de estados cabe en el presupuesto devuelve `truncated: false`; una mano densa de 12 cartas se trunca con `MAX_CHAIN_STATES`.
- Mano con 13 elementos: el handler devuelve 400 (se prueba en el test de API).

### Vitest (store) — `tests/unit/server/data/store.test.ts`

- `getFusionResult(13, 15)` devuelve 467 con los argumentos en cualquier orden; una carta consigo misma (`getFusionResult(15, 15)`) devuelve 473.
- Un par sin fusión o con IDs desconocidos devuelve `undefined`.
- Para cada pareja del índice por carta, el resultado coincide con la primera entrada que ese índice lista.

### Vitest (API) — `tests/unit/server/http/api-chain-search.test.ts`

- `POST /api/chain-search` con `{ handIds: [2, 8] }` → 200, `chains` es array y `truncated` es `false`.
- `POST /api/chain-search` con `{ handIds: [13, 15, 325] }` → 200, una cadena de 1 paso que termina en Crimson Sunbird; el cuerpo solo contiene `chains` y `truncated`.
- `POST /api/chain-search` con una mano densa de 12 cartas → 200 con `truncated: true` y entre 1 y 5 cadenas.
- `POST /api/chain-search` con `{ handIds: "nope" }` → 400.
- `POST /api/chain-search` con mano de 13 IDs → 400 con código `hand-too-large`.
- `POST /api/chain-search` con `{ handIds: [] }` → 200 con `{ chains: [], truncated: false }`.

### Playwright (E2E) — `tests/e2e/calculator-functional.spec.ts`

Añadir casos:
- Rellenar 2 ranuras con un par que funde (Mystical Elf + Mushroom Man), pulsar «Calcular cadena» → `#chain-output` contiene el nombre del resultado.
- Rellenar 2 ranuras con nombres inválidos, pulsar «Calcular cadena» → aparece mensaje de sin resultado.

---

## Criterios de aceptación

1. El botón «Calcular cadena» aparece en `/calculator` y solo se activa al pulsarlo.
2. Con una mano de 2 cartas que pueden fusionarse, devuelve al menos 1 cadena con 1 paso.
3. Con una mano vacía o sin fusiones posibles, muestra el mensaje `calculator.chain.no-result`.
4. Las cadenas se ordenan por ATK final descendente; a igual ATK, primero las de menos pasos y después la de menor ID de carta final.
5. `POST /api/chain-search` con `handIds` de más de 12 elementos responde 400.
6. Paridad i18n: test pasa.
7. `npm test` pasa (unit) sin regresiones.
8. `npm run build` pasa sin errores TypeScript.
9. La carta final de cada cadena es el resultado de su último paso y es un monstruo: con la mano Tyhone + Flame Swordsman + Machine Conversion Factory la mejor cadena tiene 1 paso y termina en Crimson Sunbird (ATK 2300), sin forzar fusiones adicionales.
10. Ninguna cadena repite carta final y para cada carta final se devuelve la ruta con menos pasos.
11. La respuesta incluye `truncated`, que es `true` solo si se agotó el presupuesto `MAX_CHAIN_STATES`.

---

## Preguntas abiertas

### Fusión entre resultados intermedios

El modelo permite fusionar dos cartas cualesquiera de la mano de trabajo, incluidos dos resultados intermedios (por ejemplo, A + B → X, C + D → Y y después X + Y → Z). Esto **no se ha verificado** contra el juego real: las fuentes consultadas describen el encadenado como «resultado + siguiente carta», es decir, el resultado de una fusión se combina con otra carta de la mano, y no confirman que dos resultados intermedios puedan fusionarse entre sí. Las cadenas que dependen de esa fusión podrían no ser ejecutables en el juego.

Por ahora se mantiene el modelo de cualquier par. Si se comprueba que el juego no lo permite, habrá que restringir las transiciones y actualizar la sección «Algoritmo», los tests y los criterios de aceptación.
