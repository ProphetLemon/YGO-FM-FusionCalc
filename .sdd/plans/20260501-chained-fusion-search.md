# PLAN: chained-fusion-search

Estado: COMPLETADO
Fecha: 2026-05-01
Spec: `.sdd/specs/20260501-chained-fusion-search.md`

---

## Resumen de cambios

| Archivo | Acción |
|---|---|
| `src/shared/types.ts` | Modificar — 3 tipos nuevos |
| `src/shared/i18n/es.json` | Modificar — 7 claves nuevas |
| `src/shared/i18n/en.json` | Modificar — 7 claves nuevas |
| `src/server/domain/chain-search.ts` | Crear — algoritmo DFS |
| `src/server/http/routes/api.ts` | Modificar — nuevo endpoint |
| `src/client/lib/api.ts` | Modificar — `chainSearch` |
| `views/calculator.ejs` | Modificar — sección cadena |
| `src/client/pages/calculator.ts` | Modificar — wiring cadena |
| `tests/unit/server/domain/chain-search.test.ts` | Crear |
| `tests/unit/server/http/api-chain-search.test.ts` | Crear |
| `tests/e2e/calculator-functional.spec.ts` | Modificar — 2 casos nuevos |

---

## Commit 1 — `feat(types): add FusionStep, ChainResult, ChainSearchResponse`

### `src/shared/types.ts` — añadir al final del archivo

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

## Commit 2 — `feat(i18n): add chain-search keys to es/en catalogs`

### `src/shared/i18n/es.json` — añadir tras `"calculator.results.title"`

```json
"calculator.chain.title": "Cadena óptima de fusiones",
"calculator.chain.btn": "Calcular cadena",
"calculator.chain.loading": "Calculando…",
"calculator.chain.no-result": "No se encontró ninguna cadena posible con esta mano.",
"calculator.chain.step": "Paso {{n}}",
"calculator.chain.final-atk": "ATK final: {{atk}}",
"calculator.chain.hand-too-large": "La mano es demasiado grande para el cálculo de cadenas (máximo {{max}} cartas).",
```

### `src/shared/i18n/en.json` — misma posición relativa

```json
"calculator.chain.title": "Optimal fusion chain",
"calculator.chain.btn": "Calculate chain",
"calculator.chain.loading": "Calculating…",
"calculator.chain.no-result": "No fusion chain found for this hand.",
"calculator.chain.step": "Step {{n}}",
"calculator.chain.final-atk": "Final ATK: {{atk}}",
"calculator.chain.hand-too-large": "Hand is too large for chain calculation (max {{max}} cards).",
```

---

## Commit 3 — `feat(chain-search): domain function findBestChains`

### `src/server/domain/chain-search.ts` (nuevo)

```ts
import type { CardSummary, ChainResult, FusionStep } from "../../shared/types.js";
import { getCardById, getFusionsForCard } from "../data/store.js";
import { toCardSummary } from "./cards.js";

export const MAX_CHAIN_HAND = 12;
const TOP_N = 5;

export function findBestChains(handIds: readonly number[]): ChainResult[] {
    if (handIds.length === 0) return [];

    const allResults: ChainResult[] = [];
    const visited = new Set<string>();

    function handKey(hand: readonly number[]): string {
        return [...hand].sort((a, b) => a - b).join(",");
    }

    function dfs(hand: number[], steps: FusionStep[]): void {
        const key = handKey(hand);
        if (visited.has(key)) return;
        visited.add(key);

        let fusedAny = false;
        for (let i = 0; i < hand.length - 1; i++) {
            for (let j = i + 1; j < hand.length; j++) {
                const id1 = hand[i];
                const id2 = hand[j];
                if (id1 === undefined || id2 === undefined) continue;
                const fusions = getFusionsForCard(id1);
                const entry = fusions.find((f) => f.card === id2);
                if (!entry) continue;

                const card1 = getCardById(id1);
                const card2 = getCardById(id2);
                const resultCard = getCardById(entry.result);
                if (!card1 || !card2 || !resultCard) continue;

                const step: FusionStep = {
                    card1: toCardSummary(card1),
                    card2: toCardSummary(card2),
                    result: toCardSummary(resultCard),
                };

                const newHand = hand.filter((_, idx) => idx !== i && idx !== j);
                newHand.push(entry.result);

                fusedAny = true;
                dfs(newHand, [...steps, step]);
            }
        }

        if (!fusedAny && steps.length > 0) {
            const best = bestCardInHand(hand);
            if (best) allResults.push({ steps, finalCard: best });
        }
    }

    dfs([...handIds], []);

    const seenIds = new Set<number>();
    const unique = allResults.filter((r) => {
        if (seenIds.has(r.finalCard.id)) return false;
        seenIds.add(r.finalCard.id);
        return true;
    });

    unique.sort((a, b) => {
        const diff = b.finalCard.attack - a.finalCard.attack;
        if (diff !== 0) return diff;
        return b.steps.length - a.steps.length;
    });

    return unique.slice(0, TOP_N);
}

function bestCardInHand(hand: readonly number[]): CardSummary | null {
    let best: CardSummary | null = null;
    for (const id of hand) {
        const card = getCardById(id);
        if (!card) continue;
        const summary = toCardSummary(card);
        if (!best || summary.attack > best.attack) best = summary;
    }
    return best;
}
```

**Notas sobre el algoritmo:**

- DFS con `visited` evita re-explorar el mismo estado de mano (por caminos distintos).
- Solo se registra un resultado cuando `!fusedAny && steps.length > 0` (terminal con al menos 1 fusión realizada). Manos sin ninguna fusión posible producen `[]`.
- `bestCardInHand` busca la carta con mayor ATK en la mano terminal.
- Deduplicación por `finalCard.id` antes de devolver: si dos caminos llegan al mismo resultado, se guarda solo el primero.
- Se devuelven como máximo `TOP_N = 5` resultados.

---

## Commit 4 — `feat(chain-search): POST /api/chain-search endpoint`

### `src/server/http/routes/api.ts` — añadir antes del `return router`

Añadir el import de `findBestChains` y `MAX_CHAIN_HAND` al bloque de imports existente:

```ts
import { findBestChains, MAX_CHAIN_HAND } from "../../domain/chain-search.js";
```

Añadir el handler justo antes de `return router;`:

```ts
router.post("/chain-search", (req: Request, res: Response): void => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const handIds = body.handIds;
    if (!Array.isArray(handIds) || handIds.some((id) => typeof id !== "number")) {
        sendError(res, 400, {
            code: "invalid-hand",
            message: "Body must include handIds as a number array",
        });
        return;
    }
    if (handIds.length > MAX_CHAIN_HAND) {
        sendError(res, 400, {
            code: "hand-too-large",
            message: `handIds must not exceed ${MAX_CHAIN_HAND} cards`,
        });
        return;
    }
    const chains = findBestChains(handIds as number[]);
    res.json({ chains });
});
```

---

## Commit 5 — `feat(chain-search): client api, calculator view and page`

### `src/client/lib/api.ts` — añadir al final

Añadir el import de los nuevos tipos al bloque de imports existente:

```ts
import type {
    CalculatorResponse,
    CardIndexEntry,
    CardSummary,
    ChainSearchResponse,
    EquipExpanded,
    FusionExpanded,
    ResultExpanded,
} from "../../shared/types.js";
```

Añadir la función al final del archivo:

```ts
export async function chainSearch(handIds: number[]): Promise<ChainSearchResponse> {
    return fetchJson<ChainSearchResponse>("/api/chain-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handIds }),
    });
}
```

### `views/calculator.ejs` — añadir sección al final

Después del cierre de la sección de resultados simples (`</section>` final), añadir:

```ejs
<section class="bg-white/95 text-fm-primary rounded-lg p-6 shadow-lg mt-6">
    <h4 class="font-display text-2xl md:text-3xl text-center my-4">
        <%= t('calculator.chain.title') %>
    </h4>
    <div class="flex justify-center mb-4">
        <button
            type="button"
            id="chainBtn"
            class="px-4 py-2 bg-fm-primary text-white rounded hover:bg-fm-primary/80 font-display text-sm"
        >
            <%= t('calculator.chain.btn') %>
        </button>
    </div>
    <p id="chain-loading" class="text-center font-body hidden"></p>
    <div id="chain-output"></div>
</section>
```

Nota: `#chain-loading` se rellena con texto desde JS en el momento de uso (no inline en EJS) porque el texto traducido llega vía i18n-bootstrap en el cliente.

### `src/client/pages/calculator.ts` — añadir wiring en `mountCalculatorPage`

Añadir imports nuevos al bloque de imports del archivo:

```ts
import { chainSearch } from "../lib/api.js";
import type { ChainResult } from "../../shared/types.js";
```

Añadir después del listener de `resetBtn`:

```ts
const chainBtn = qs<HTMLButtonElement>("#chainBtn");
const chainLoading = qs<HTMLElement>("#chain-loading");
const chainOutput = qs<HTMLElement>("#chain-output");

if (chainBtn && chainLoading && chainOutput) {
    chainBtn.addEventListener("click", () => {
        void runChainSearch(chainOutput, chainLoading);
    });
}

async function runChainSearch(output: HTMLElement, loading: HTMLElement): Promise<void> {
    clear(output);
    const handIds = getValidIds(
        slots.map((s) => s.input.value),
        idsByNameLower
    );
    if (handIds.length < 2) {
        output.textContent = t("calculator.chain.no-result");
        return;
    }
    loading.textContent = t("calculator.chain.loading");
    loading.classList.remove("hidden");
    try {
        const res = await chainSearch(handIds);
        loading.classList.add("hidden");
        if (res.chains.length === 0) {
            output.textContent = t("calculator.chain.no-result");
            return;
        }
        for (const chain of res.chains) {
            output.appendChild(renderChain(chain));
        }
    } catch (err) {
        loading.classList.add("hidden");
        if (err instanceof ApiError && err.status === 400) {
            output.textContent = t("calculator.chain.hand-too-large", { max: "12" });
        } else {
            output.textContent = t("calculator.chain.no-result");
        }
    }
}
```

Añadir la función `renderChain` al final del archivo:

```ts
function renderChain(chain: ChainResult): HTMLElement {
    const div = document.createElement("div");
    div.className = "mb-6 p-4 border border-fm-primary/20 rounded";
    for (const [i, step] of chain.steps.entries()) {
        const p = document.createElement("p");
        p.className = "font-body text-sm mb-1";
        p.textContent = `${t("calculator.chain.step", { n: i + 1 })}: ${step.card1.name} + ${step.card2.name} → ${step.result.name} (${step.result.attack} ATK)`;
        div.appendChild(p);
    }
    const summary = document.createElement("p");
    summary.className = "font-display text-sm mt-2 font-bold";
    summary.textContent = t("calculator.chain.final-atk", { atk: String(chain.finalCard.attack) });
    div.appendChild(summary);
    return div;
}
```

Nota: `runChainSearch` se declara dentro de `mountCalculatorPage` para capturar `slots` e `idsByNameLower` por closure. `renderChain` se declara fuera (no usa estado local).

Import de `ApiError` ya estaba en `api.ts` y se importa junto al resto.

---

## Commit 6 — `test(chain-search): unit tests for domain and API`

### `tests/unit/server/domain/chain-search.test.ts` (nuevo)

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { findBestChains, MAX_CHAIN_HAND } from "../../../../src/server/domain/chain-search.js";
import { loadStore } from "../../../../src/server/data/store.js";

describe("findBestChains", () => {
    beforeAll(() => {
        loadStore();
    });

    it("returns empty for empty hand", () => {
        expect(findBestChains([])).toEqual([]);
    });

    it("returns empty for single card", () => {
        expect(findBestChains([1])).toEqual([]);
    });

    it("returns empty for hand with no possible fusions", () => {
        // Card 1 (Blue-eyes) has no fusions with itself
        expect(findBestChains([1, 1])).toEqual([]);
    });

    it("returns a chain for a known fusable pair", () => {
        // Card 2 (Mystical Elf) + card 8 → 638
        const chains = findBestChains([2, 8]);
        expect(chains.length).toBeGreaterThan(0);
        const first = chains[0];
        expect(first?.steps.length).toBe(1);
        expect(first?.finalCard.id).toBe(638);
    });

    it("sorts chains by finalCard attack descending", () => {
        const chains = findBestChains([2, 8, 9, 10]);
        for (let i = 1; i < chains.length; i++) {
            expect(chains[i - 1]?.finalCard.attack).toBeGreaterThanOrEqual(
                chains[i]?.finalCard.attack ?? 0
            );
        }
    });

    it("returns at most TOP_N results", () => {
        const chains = findBestChains([2, 8, 9, 10, 11, 12]);
        expect(chains.length).toBeLessThanOrEqual(5);
    });

    it("exports MAX_CHAIN_HAND as 12", () => {
        expect(MAX_CHAIN_HAND).toBe(12);
    });
});
```

### `tests/unit/server/http/api-chain-search.test.ts` (nuevo)

```ts
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../../src/server/app.js";

const app = createApp();

describe("POST /api/chain-search", () => {
    it("returns chains array for a fusable pair", async () => {
        const res = await request(app)
            .post("/api/chain-search")
            .send({ handIds: [2, 8] });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.chains)).toBe(true);
        expect(res.body.chains.length).toBeGreaterThan(0);
    });

    it("returns empty chains for hand with no fusions", async () => {
        const res = await request(app)
            .post("/api/chain-search")
            .send({ handIds: [1, 1] });
        expect(res.status).toBe(200);
        expect(res.body.chains).toEqual([]);
    });

    it("returns empty chains for empty hand", async () => {
        const res = await request(app)
            .post("/api/chain-search")
            .send({ handIds: [] });
        expect(res.status).toBe(200);
        expect(res.body.chains).toEqual([]);
    });

    it("400 on invalid body", async () => {
        const res = await request(app)
            .post("/api/chain-search")
            .send({ handIds: "nope" });
        expect(res.status).toBe(400);
    });

    it("400 with hand-too-large when handIds exceeds limit", async () => {
        const bigHand = Array.from({ length: 13 }, (_, i) => i + 1);
        const res = await request(app)
            .post("/api/chain-search")
            .send({ handIds: bigHand });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("hand-too-large");
    });
});
```

---

## Commit 7 — `test(e2e): add chain-search cases to calculator functional tests`

### `tests/e2e/calculator-functional.spec.ts` — añadir al final

```ts
test("chain search finds a result for a known fusable pair", async ({ page }) => {
    await page.goto("/calculator");
    const hand1 = page.locator(".hand-slot").nth(0).locator("input");
    const hand2 = page.locator(".hand-slot").nth(1).locator("input");
    await hand1.fill("Mystical Elf");
    await hand1.dispatchEvent("change");
    await hand2.fill("Mushroom Man");
    await hand2.dispatchEvent("change");
    await page.locator("#chainBtn").click();
    await expect(page.locator("#chain-output")).not.toBeEmpty({ timeout: 5000 });
});

test("chain search shows no-result message for empty hand", async ({ page }) => {
    await page.goto("/calculator");
    await page.locator("#chainBtn").click();
    await expect(page.locator("#chain-output")).not.toBeEmpty({ timeout: 3000 });
});
```

---

## Orden de ejecución

1. Tipos (prerequisito de todo lo demás)
2. i18n (prerequisito para paridad test)
3. Dominio (prerequisito para API)
4. API endpoint (prerequisito para client)
5. Client + vista + página (prerequisito para E2E)
6. Unit tests
7. E2E tests

---

## Verificación local

```bash
npm run build     # sin errores TS
npm test          # 20+ test files, todos pasan
npm run test:e2e  # suite completa contra servidor real
```

No se añaden dependencias npm.
