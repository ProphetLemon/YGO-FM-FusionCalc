# SPEC: chained-fusion-search

Estado: COMPLETADO
Fecha: 2026-05-01
Slug: `chained-fusion-search`

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

- **Dominio**: nueva función `findBestChains` en `src/server/domain/chain-search.ts`.
- **Tipos compartidos**: nuevas interfaces `FusionStep`, `ChainResult`, `ChainSearchResponse` en `src/shared/types.ts`.
- **API**: nuevo endpoint `POST /api/chain-search` en `src/server/http/routes/api.ts`.
- **Cliente**: nueva función `chainSearch(handIds)` en `src/client/lib/api.ts`.
- **Vista**: nueva sección «Cadena óptima» en `views/calculator.ejs`.
- **Página**: lógica de la nueva sección en `src/client/pages/calculator.ts`.
- **i18n**: claves nuevas en `es.json` y `en.json`.
- **Tests unitarios** (Vitest): cubrir `findBestChains` con fixtures.
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
2. Una línea de resumen: «ATK final: {{atk}}» con el ATK del monstruo final de esa cadena.

Las cadenas se ordenan por ATK final descendente. Si hay empate en ATK final, se ordena por número de pasos descendente (más pasos = más interesante).

---

## Algoritmo (descripción funcional)

La función `findBestChains(handIds)` realiza una búsqueda en profundidad (DFS) sobre el espacio de estados de la mano:

- **Estado**: multiconjunto de IDs de carta actualmente en mano.
- **Transición**: elegir un par (i, j) que pueda fusionarse → quitar ambas cartas, añadir el resultado.
- **Resultado de un estado**: la carta con mayor ATK de la mano en ese instante.
- **Exploración**: explorar TODAS las secuencias posibles de fusiones (el árbol se termina cuando no quedan pares que puedan fusionarse).
- **Recolección**: cada vez que se llega a un estado terminal (sin más fusiones posibles), guardar `{ steps: FusionStep[], finalCard: CardSummary }`.
- **Salida**: los top-`N` resultados únicos (por ATK final desc, luego pasos desc), donde `N = 5`.

### Guarda de rendimiento

- Si `handIds.length > MAX_CHAIN_HAND` (constante: 12), el endpoint responde `400` con código `hand-too-large`.
- El DFS registra todos los estados visitados (por el hash de la mano ordenada) para evitar revisitar el mismo estado por distinto camino (poda por estado repetido).

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
    ]
}
```

**Respuesta vacía legítima:** `{ "chains": [] }` cuando no hay ninguna fusión posible con esa mano.

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

Usando el fixture `tests/fixtures/sample-cards.json`:

- Mano `[2, 8]` (Mystical Elf + Mountain Warrior → resultado 638): devuelve una cadena de 1 paso con `finalCard.id = 638`.
- Mano `[1]` (solo Blue-Eyes, sin fusión): devuelve `chains: []`.
- Mano `[]`: devuelve `chains: []`.
- Mano con 13 elementos: `findBestChains` lanza o el handler devuelve 400 (testear en el test de API).

### Vitest (API) — `tests/unit/server/http/api-chain-search.test.ts`

- `POST /api/chain-search` con `{ handIds: [2, 8] }` → 200, `chains` es array.
- `POST /api/chain-search` con `{ handIds: "nope" }` → 400.
- `POST /api/chain-search` con mano de 13 IDs → 400 con código `hand-too-large`.
- `POST /api/chain-search` con `{ handIds: [] }` → 200 con `chains: []`.

### Playwright (E2E) — `tests/e2e/calculator-functional.spec.ts`

Añadir casos:
- Rellenar 2 ranuras con un par que funde (Mystical Elf + Mushroom Man), pulsar «Calcular cadena» → `#chain-output` contiene el nombre del resultado.
- Rellenar 2 ranuras con nombres inválidos, pulsar «Calcular cadena» → aparece mensaje de sin resultado.

---

## Criterios de aceptación

1. El botón «Calcular cadena» aparece en `/calculator` y solo se activa al pulsarlo.
2. Con una mano de 2 cartas que pueden fusionarse, devuelve al menos 1 cadena con 1 paso.
3. Con una mano vacía o sin fusiones posibles, muestra el mensaje `calculator.chain.no-result`.
4. Las cadenas se ordenan por ATK final descendente.
5. `POST /api/chain-search` con `handIds` de más de 12 elementos responde 400.
6. Paridad i18n: test pasa.
7. `npm test` pasa (unit) sin regresiones.
8. `npm run build` pasa sin errores TypeScript.
