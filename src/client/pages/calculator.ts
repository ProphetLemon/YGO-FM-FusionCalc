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
        removeBtn.setAttribute("aria-label", `${t("calculator.btn.remove-slot")} ${n}`);

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
