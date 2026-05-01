# PLAN: dynamic-slots-calculator

Estado: COMPLETADO
Fecha: 2026-05-01
Spec: `.sdd/specs/20260501-dynamic-slots-calculator.md`

---

## Resumen de cambios

Cinco archivos modificados, dos archivos nuevos. Sin cambios de servidor.

| Archivo | Acción |
|---|---|
| `src/shared/i18n/es.json` | Modificar — 3 claves nuevas |
| `src/shared/i18n/en.json` | Modificar — 3 claves nuevas |
| `src/client/lib/slots.ts` | Crear — helpers puros |
| `views/calculator.ejs` | Modificar — eliminar bucle estático |
| `src/client/pages/calculator.ts` | Modificar — gestión dinámica de ranuras |
| `tests/unit/client/slots.test.ts` | Crear — unit tests de helpers |
| `tests/e2e/calculator-functional.spec.ts` | Modificar — actualizar selectores + casos dinámicos |

---

## Commit 1 — `feat(i18n): add dynamic-slot keys to es/en catalogs`

### `src/shared/i18n/es.json`

Añadir tres claves después de `"calculator.btn.reset"`:

```json
"calculator.btn.add-slot": "Añadir carta",
"calculator.btn.remove-slot": "Eliminar ranura",
"calculator.slot.label": "Carta {{n}}",
```

### `src/shared/i18n/en.json`

Añadir las mismas claves, en inglés, en la misma posición relativa:

```json
"calculator.btn.add-slot": "Add card",
"calculator.btn.remove-slot": "Remove slot",
"calculator.slot.label": "Card {{n}}",
```

---

## Commit 2 — `feat(calculator): extract slot helpers to slots.ts`

### `src/client/lib/slots.ts` (nuevo)

```ts
export const MIN_HAND_SIZE = 2;
export const MAX_HAND_SIZE = 5;

export function canAddSlot(count: number): boolean {
    return count < MAX_HAND_SIZE;
}

export function canRemoveSlot(count: number): boolean {
    return count > MIN_HAND_SIZE;
}

export function getValidIds(
    values: readonly string[],
    idsByNameLower: ReadonlyMap<string, number>
): number[] {
    return values
        .map((v) => idsByNameLower.get(v.trim().toLowerCase()))
        .filter((id): id is number => id !== undefined);
}
```

Notas:
- Tres funciones puras, sin dependencias de DOM ni de módulos del servidor.
- `MIN_HAND_SIZE` y `MAX_HAND_SIZE` reemplazan la constante `HAND_SIZE = 5` de `calculator.ts`.

---

## Commit 3 — `feat(calculator): dynamic slots in calculator view and page`

### `views/calculator.ejs`

Reemplazar el bloque completo de la sección `Tu mano` por:

```ejs
<div class="container mx-auto px-4 py-6">
    <section class="bg-white/95 text-fm-primary rounded-lg p-6 mb-6 shadow-lg">
        <h3 class="font-display text-2xl md:text-3xl my-4"><%= t('calculator.hand.title') %></h3>
        <div id="hand-slots" class="space-y-2"></div>
        <div class="flex flex-wrap gap-3 mt-6">
            <button
                type="button"
                id="addSlotBtn"
                class="px-4 py-2 bg-fm-primary text-white rounded hover:bg-fm-primary/80 font-display text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
                <%= t('calculator.btn.add-slot') %>
            </button>
            <button
                type="button"
                id="resetBtn"
                class="px-4 py-2 bg-rose-600 text-white rounded hover:bg-rose-500 font-display text-sm"
            >
                <%= t('calculator.btn.reset') %>
            </button>
        </div>
    </section>

    <section class="bg-white/95 text-fm-primary rounded-lg p-6 shadow-lg">
        <h4 class="font-display text-2xl md:text-3xl text-center my-4">
            <%= t('calculator.results.title') %>
        </h4>
        <div class="grid md:grid-cols-2 gap-4">
            <div id="outputarealeft"></div>
            <div id="outputarearight"></div>
        </div>
    </section>
</div>
```

Cambios respecto al original:
- Eliminado el `<% for (let i = 1; i <= 5; i++) %>` y sus inputs estáticos.
- Añadido `<div id="hand-slots">` vacío — los inputs se crean en JS.
- Añadido `#addSlotBtn`.
- Eliminado `<span id="search-msg">` (no se usaba en el código).

### `src/client/pages/calculator.ts`

Reescribir el archivo completo:

```ts
import { mountNavbar } from "../components/navbar.js";
import { Autocomplete } from "../components/autocomplete.js";
import { renderPair } from "../components/fusion-card.js";
import { calculate, getCardByName, getCardsIndex } from "../lib/api.js";
import { MIN_HAND_SIZE, canAddSlot, canRemoveSlot, getValidIds } from "../lib/slots.js";
import { clear, qs } from "../lib/dom.js";
import { t } from "../lib/i18n.js";

interface SlotState {
    row: HTMLElement;
    input: HTMLInputElement;
    info: HTMLSpanElement;
    removeBtn: HTMLButtonElement;
}

document.addEventListener("DOMContentLoaded", () => {
    mountNavbar();
    void mountCalculatorPage();
});

async function mountCalculatorPage(): Promise<void> {
    const slotsContainer = qs<HTMLElement>("#hand-slots");
    const addBtn = qs<HTMLButtonElement>("#addSlotBtn");
    const resetBtn = qs<HTMLButtonElement>("#resetBtn");
    const outputLeft = qs<HTMLElement>("#outputarealeft");
    const outputRight = qs<HTMLElement>("#outputarearight");
    if (!slotsContainer || !addBtn || !outputLeft || !outputRight) return;

    const cardsIndex = await getCardsIndex();
    const namesById = new Map(cardsIndex.map((c) => [c.id, c.name]));
    const idsByNameLower = new Map(cardsIndex.map((c) => [c.name.toLowerCase(), c.id]));

    const slots: SlotState[] = [];

    const refresh = async (): Promise<void> => {
        clear(outputLeft);
        clear(outputRight);
        const handIds = getValidIds(
            slots.map((s) => s.input.value),
            idsByNameLower
        );
        if (handIds.length < 2) return;
        const result = await calculate(handIds);
        appendHeader(outputLeft, t("search.results.fusions"));
        for (const fusion of result.fusions) outputLeft.appendChild(renderPair(fusion));
        appendHeader(outputRight, t("search.results.equips"));
        for (const equip of result.equips) outputRight.appendChild(renderPair(equip));
    };

    const updateRemoveBtns = (): void => {
        const removable = canRemoveSlot(slots.length);
        for (const slot of slots) {
            slot.removeBtn.disabled = !removable;
            slot.removeBtn.classList.toggle("hidden", !removable);
        }
    };

    const updateAddBtn = (): void => {
        const addable = canAddSlot(slots.length);
        addBtn.disabled = !addable;
        addBtn.setAttribute("aria-disabled", String(!addable));
    };

    const updateInfo = async (slot: SlotState): Promise<void> => {
        slot.info.textContent = "";
        const value = slot.input.value.trim();
        if (value === "") return;
        const card = await getCardByName(value);
        if (!card) {
            slot.info.textContent = t("card.label.invalid");
            return;
        }
        slot.info.textContent = card.isMonster
            ? `(${card.attack}/${card.defense}) [${card.typeName}]`
            : `[${card.typeName}]`;
    };

    const addSlot = (): void => {
        const n = slots.length + 1;

        const row = document.createElement("div");
        row.className = "hand-slot flex flex-wrap items-center gap-2";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "flex-1 min-w-0 px-3 py-2 border border-fm-primary/30 rounded font-body";
        input.setAttribute("aria-label", t("calculator.slot.label", { n }));

        const info = document.createElement("span");
        info.className = "font-body";

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className =
            "px-2 py-1 text-sm bg-rose-600 text-white rounded hover:bg-rose-500 font-display";
        removeBtn.textContent = "×";
        removeBtn.setAttribute(
            "aria-label",
            `${t("calculator.btn.remove-slot")} ${n}`
        );

        row.appendChild(input);
        row.appendChild(info);
        row.appendChild(removeBtn);
        slotsContainer.appendChild(row);

        const state: SlotState = { row, input, info, removeBtn };
        slots.push(state);

        new Autocomplete(input, {
            fetchList: () =>
                Promise.resolve([...namesById.values()].sort((a, b) => a.localeCompare(b))),
            onSelect: () => void updateInfo(state).then(refresh),
        });

        input.addEventListener("change", () => void updateInfo(state).then(refresh));

        removeBtn.addEventListener("click", () => {
            const idx = slots.indexOf(state);
            if (idx === -1) return;
            slots.splice(idx, 1);
            slotsContainer.removeChild(row);
            updateRemoveBtns();
            updateAddBtn();
            void refresh();
        });

        updateRemoveBtns();
        updateAddBtn();
    };

    addBtn.addEventListener("click", addSlot);

    resetBtn?.addEventListener("click", () => {
        for (const slot of slots) {
            slot.input.value = "";
            slot.info.textContent = "";
        }
        clear(outputLeft);
        clear(outputRight);
    });

    for (let i = 0; i < MIN_HAND_SIZE; i++) addSlot();
}

function appendHeader(where: HTMLElement, label: string): void {
    const h2 = document.createElement("h2");
    h2.className = "text-center my-4 font-display text-2xl";
    h2.textContent = label;
    where.appendChild(h2);
}
```

---

## Commit 4 — `test(calculator): unit tests for slot helpers`

### `tests/unit/client/slots.test.ts` (nuevo)

```ts
import { describe, expect, it } from "vitest";
import {
    MIN_HAND_SIZE,
    MAX_HAND_SIZE,
    canAddSlot,
    canRemoveSlot,
    getValidIds,
} from "../../../src/client/lib/slots.js";

describe("canAddSlot", () => {
    it("allows adding when below max", () => {
        expect(canAddSlot(MIN_HAND_SIZE)).toBe(true);
        expect(canAddSlot(MAX_HAND_SIZE - 1)).toBe(true);
    });

    it("blocks adding when at max", () => {
        expect(canAddSlot(MAX_HAND_SIZE)).toBe(false);
    });
});

describe("canRemoveSlot", () => {
    it("allows removing when above min", () => {
        expect(canRemoveSlot(MIN_HAND_SIZE + 1)).toBe(true);
        expect(canRemoveSlot(MAX_HAND_SIZE)).toBe(true);
    });

    it("blocks removing when at min", () => {
        expect(canRemoveSlot(MIN_HAND_SIZE)).toBe(false);
    });
});

describe("getValidIds", () => {
    const map: ReadonlyMap<string, number> = new Map([
        ["mystical elf", 2],
        ["mushroom man", 8],
    ]);

    it("returns ids for recognized names", () => {
        expect(getValidIds(["Mystical Elf", "Mushroom Man"], map)).toEqual([2, 8]);
    });

    it("ignores unrecognized names", () => {
        expect(getValidIds(["", "Unknown Card", "Mystical Elf"], map)).toEqual([2]);
    });

    it("returns empty array when no valid names", () => {
        expect(getValidIds([], map)).toEqual([]);
        expect(getValidIds(["", " "], map)).toEqual([]);
    });

    it("is case-insensitive", () => {
        expect(getValidIds(["MYSTICAL ELF"], map)).toEqual([2]);
    });

    it("trims whitespace", () => {
        expect(getValidIds(["  Mystical Elf  "], map)).toEqual([2]);
    });
});
```

---

## Commit 5 — `test(e2e): update calculator functional tests for dynamic slots`

### `tests/e2e/calculator-functional.spec.ts`

Reemplazar el archivo completo. Los selectores `#hand1` y `#hand2` ya no existen; se usa `.hand-slot` con `nth()`.

```ts
import { expect, test } from "@playwright/test";

test("calculator loads with two empty slots", async ({ page }) => {
    await page.goto("/calculator");
    await expect(page.locator(".hand-slot")).toHaveCount(2);
});

test("add slot button increases slot count", async ({ page }) => {
    await page.goto("/calculator");
    await page.locator("#addSlotBtn").click();
    await expect(page.locator(".hand-slot")).toHaveCount(3);
});

test("add slot button disables at max hand size", async ({ page }) => {
    await page.goto("/calculator");
    for (let i = 0; i < 3; i++) await page.locator("#addSlotBtn").click();
    await expect(page.locator(".hand-slot")).toHaveCount(5);
    await expect(page.locator("#addSlotBtn")).toBeDisabled();
});

test("remove slot button hides when at minimum slots", async ({ page }) => {
    await page.goto("/calculator");
    const removeBtns = page.locator(".hand-slot button");
    await expect(removeBtns.first()).toBeHidden();
});

test("remove slot button decreases slot count", async ({ page }) => {
    await page.goto("/calculator");
    await page.locator("#addSlotBtn").click();
    await expect(page.locator(".hand-slot")).toHaveCount(3);
    await page.locator(".hand-slot button").first().click();
    await expect(page.locator(".hand-slot")).toHaveCount(2);
});

test("calculator finds fusion when hand contains a known pair", async ({ page }) => {
    await page.goto("/calculator");
    const hand1 = page.locator(".hand-slot").nth(0).locator("input");
    const hand2 = page.locator(".hand-slot").nth(1).locator("input");
    await hand1.fill("Mystical Elf");
    await hand1.dispatchEvent("change");
    await hand2.fill("Mushroom Man");
    await hand2.dispatchEvent("change");
    await expect(page.locator("#outputarealeft")).toContainText("Mystical Elf", { timeout: 5000 });
    await expect(page.locator("#outputarealeft")).toContainText("Mushroom Man");
});

test("reset clears all hand inputs and outputs", async ({ page }) => {
    await page.goto("/calculator");
    const hand1 = page.locator(".hand-slot").nth(0).locator("input");
    await hand1.fill("Mystical Elf");
    await hand1.dispatchEvent("change");
    await page.locator("#resetBtn").click();
    await expect(hand1).toHaveValue("");
    await expect(page.locator("#outputarealeft")).toBeEmpty();
});

test("reset keeps current slot count", async ({ page }) => {
    await page.goto("/calculator");
    await page.locator("#addSlotBtn").click();
    await expect(page.locator(".hand-slot")).toHaveCount(3);
    await page.locator("#resetBtn").click();
    await expect(page.locator(".hand-slot")).toHaveCount(3);
});
```

---

## Orden de ejecución

1. Commit 1: i18n (prerequisito para que el test de paridad no falle durante implementación)
2. Commit 2: `slots.ts` (prerequisito para importar en `calculator.ts`)
3. Commit 3: vista + página (depende de 1 y 2)
4. Commit 4: unit tests (depende de 2)
5. Commit 5: E2E tests (depende de 3)

---

## Verificación local

```bash
npm run build          # Vite + tsc — sin errores TS
npm test               # Vitest unit — paridad i18n + slots helpers
npm run test:e2e       # Playwright — suite completa contra servidor real
```

No se añaden dependencias npm.
