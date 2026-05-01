# PLAN: calculator-card-grid

Estado: COMPLETADO
Fecha: 2026-05-01
Spec: `.sdd/specs/20260501-calculator-card-grid.md`

---

## Resumen de cambios

| Archivo | Acción |
|---|---|
| `src/shared/i18n/es.json` | Añadir `calculator.slot.empty` |
| `src/shared/i18n/en.json` | Añadir `calculator.slot.empty` |
| `views/calculator.ejs` | Cambiar clase de `#hand-slots` a grid |
| `src/client/pages/calculator.ts` | Reescribir slot system |
| `tests/e2e/calculator-functional.spec.ts` | Actualizar selectores de botones |

Sin cambios en servidor, API, dominio ni tests unitarios.

---

## Commit 1 — `feat(calculator): card-grid slot design`

### `src/shared/i18n/es.json`

Añadir entre `calculator.slot.label` y `calculator.results.title`:

```json
"calculator.slot.empty": "Buscar carta",
```

### `src/shared/i18n/en.json`

Añadir en la posición equivalente:

```json
"calculator.slot.empty": "Search card",
```

---

### `views/calculator.ejs`

Cambiar la clase del contenedor `#hand-slots`:

```diff
-        <div id="hand-slots" class="space-y-2"></div>
+        <div id="hand-slots" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3"></div>
```

---

### `src/client/pages/calculator.ts`

Reescribir completo:

```ts
import { mountNavbar } from "../components/navbar.js";
import { Autocomplete } from "../components/autocomplete.js";
import { renderPair } from "../components/fusion-card.js";
import { ApiError, calculate, chainSearch, getCardByName, getCardsIndex } from "../lib/api.js";
import type { CardSummary, ChainResult } from "../../shared/types.js";
import { MIN_HAND_SIZE, canRemoveSlot, getValidIds } from "../lib/slots.js";
import { createCardImg } from "../lib/card-image.js";
import { clear, qs } from "../lib/dom.js";
import { t } from "../lib/i18n.js";

interface SlotState {
    cell: HTMLElement;
    input: HTMLInputElement;
    emptyState: HTMLElement;
    filledState: HTMLElement;
    imgWrapper: HTMLElement;
    nameLabel: HTMLElement;
    clearBtn: HTMLButtonElement;
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
            slot.removeBtn.classList.toggle("hidden", !removable);
        }
    };

    function setSlotCard(slot: SlotState, card: CardSummary | null): void {
        if (card) {
            slot.imgWrapper.innerHTML = "";
            slot.imgWrapper.appendChild(
                createCardImg(card.name, card.password, "w-full h-full object-contain")
            );
            slot.nameLabel.textContent = card.name;
            slot.input.value = card.name;
            slot.emptyState.classList.add("hidden");
            slot.filledState.classList.remove("hidden");
        } else {
            slot.imgWrapper.innerHTML = "";
            slot.nameLabel.textContent = "";
            slot.input.value = "";
            slot.filledState.classList.add("hidden");
            slot.emptyState.classList.remove("hidden");
        }
    }

    const updateSlotCard = async (slot: SlotState): Promise<void> => {
        const value = slot.input.value.trim();
        if (!value) {
            setSlotCard(slot, null);
            return;
        }
        const card = await getCardByName(value);
        setSlotCard(slot, card ?? null);
    };

    const addSlot = (): void => {
        const n = slots.length + 1;

        const cell = document.createElement("div");
        cell.className = "hand-slot flex flex-col items-center";

        // Empty state
        const emptyState = document.createElement("div");
        emptyState.className =
            "slot-empty w-full aspect-[2/3] border-2 border-dashed border-fm-primary/40 " +
            "rounded flex flex-col items-center justify-center gap-1 p-2 cursor-text";

        const plusIcon = document.createElement("span");
        plusIcon.className = "text-2xl text-fm-primary/40 select-none";
        plusIcon.textContent = "+";

        const emptyLabel = document.createElement("span");
        emptyLabel.className = "text-xs text-fm-primary/40 font-body text-center";
        emptyLabel.textContent = t("calculator.slot.empty");

        const input = document.createElement("input");
        input.type = "text";
        input.className =
            "w-full text-xs px-2 py-1 border border-fm-primary/30 rounded font-body bg-white/80 mt-1";
        input.setAttribute("aria-label", t("calculator.slot.label", { n }));

        emptyState.appendChild(plusIcon);
        emptyState.appendChild(emptyLabel);
        emptyState.appendChild(input);

        // Filled state
        const filledState = document.createElement("div");
        filledState.className = "slot-filled hidden w-full";

        const imgAspect = document.createElement("div");
        imgAspect.className = "w-full aspect-[2/3] relative rounded overflow-hidden";

        const imgWrapper = document.createElement("div");
        imgWrapper.className = "w-full h-full";

        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className =
            "clear-btn absolute top-1 right-1 z-10 w-5 h-5 bg-rose-600 text-white " +
            "rounded-full text-xs flex items-center justify-center hover:bg-rose-500 leading-none";
        clearBtn.textContent = "×";
        clearBtn.setAttribute("aria-label", `${t("calculator.btn.remove-slot")} ${n}`);

        imgAspect.appendChild(imgWrapper);
        imgAspect.appendChild(clearBtn);
        filledState.appendChild(imgAspect);

        const nameLabel = document.createElement("p");
        nameLabel.className =
            "slot-name text-xs text-center font-body mt-1 leading-tight line-clamp-2";
        filledState.appendChild(nameLabel);

        // Remove slot button (below both states)
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className =
            "remove-btn hidden mt-1 text-xs text-rose-600 hover:text-rose-500 font-body underline";
        removeBtn.textContent = `− ${t("calculator.btn.remove-slot")}`;
        removeBtn.setAttribute("aria-label", `${t("calculator.btn.remove-slot")} ${n}`);

        cell.appendChild(emptyState);
        cell.appendChild(filledState);
        cell.appendChild(removeBtn);
        slotsContainer.appendChild(cell);

        const state: SlotState = {
            cell,
            input,
            emptyState,
            filledState,
            imgWrapper,
            nameLabel,
            clearBtn,
            removeBtn,
        };
        slots.push(state);

        new Autocomplete(input, {
            fetchList: () =>
                Promise.resolve([...namesById.values()].sort((a, b) => a.localeCompare(b))),
            onSelect: () => void updateSlotCard(state).then(refresh),
        });

        input.addEventListener("change", () => void updateSlotCard(state).then(refresh));

        clearBtn.addEventListener("click", () => {
            setSlotCard(state, null);
            void refresh();
        });

        removeBtn.addEventListener("click", () => {
            const idx = slots.indexOf(state);
            if (idx === -1) return;
            slots.splice(idx, 1);
            slotsContainer.removeChild(cell);
            updateRemoveBtns();
            void refresh();
        });

        updateRemoveBtns();
    };

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

    addBtn.addEventListener("click", addSlot);

    resetBtn?.addEventListener("click", () => {
        for (const slot of slots) setSlotCard(slot, null);
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

---

## Commit 2 — `test(calculator): update e2e selectors for card-grid`

### `tests/e2e/calculator-functional.spec.ts`

Cambios de selectores:

| Antes | Después | Motivo |
|---|---|---|
| `.hand-slot button` (para remove) | `.remove-btn` | Hay dos tipos de botón por slot ahora |

Test "remove slot buttons are hidden at minimum slots":
```diff
-    const removeBtns = page.locator(".hand-slot button");
+    const removeBtns = page.locator(".remove-btn");
```

Test "remove slot button decreases slot count":
```diff
-    await page.locator(".hand-slot button").first().click();
+    await page.locator(".remove-btn").first().click();
```

Los demás tests no cambian: `.hand-slot input` sigue funcionando porque el `<input>` sigue dentro del `.hand-slot`, y `.hand-slot` count sigue siendo válido.

---

## Verificación local

```bash
npm run build   # sin errores TS
npm test        # sin regresiones
```

Verificación visual en `/calculator`:
- Carga con 2 celdas vacías en cuadrícula (borde discontinuo, «+», «Buscar carta»).
- Escribir «Blue-eyes White Dragon» → autocomplete → selección → aparece artwork.
- «×» limpia la carta y vuelve al estado vacío.
- «Añadir carta» añade una celda vacía.
- «Reiniciar» pone todo a vacío.
- Con Mystical Elf + Mushroom Man → sección de resultados se actualiza.
