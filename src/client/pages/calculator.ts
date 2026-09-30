import { mountNavbar } from "../components/navbar.js";
import { Autocomplete } from "../components/autocomplete.js";
import { renderPair, renderRitual } from "../components/fusion-card.js";
import { ApiError, calculate, chainSearch, getCardByName, getCardsIndex } from "../lib/api.js";
import type { CalculatorResponse, CardSummary, ChainResult, RitualExpanded } from "../../shared/types.js";
import { MAX_HAND_SIZE } from "../../shared/limits.js";
import { MIN_HAND_SIZE, canRemoveSlot, getValidIds } from "../lib/slots.js";
import { createCardImg } from "../lib/card-image.js";
import { clear, qs } from "../lib/dom.js";
import { createLatest, type Latest } from "../lib/latest.js";
import { t } from "../lib/i18n.js";

interface SlotState {
    cell: HTMLElement;
    input: HTMLInputElement;
    emptyState: HTMLElement;
    filledState: HTMLElement;
    imgWrapper: HTMLElement;
    nameLabel: HTMLElement;
    message: HTMLElement;
    clearBtn: HTMLButtonElement;
    removeBtn: HTMLButtonElement;
    // The card the slot shows, and the guard that stops a late name lookup from overwriting the slot.
    card: CardSummary | null;
    lookup: Latest;
}

type SlotProblem = "invalid" | "lookup-failed";

const ALERT_CLASS = "rounded p-3 mb-4 bg-red-100 text-red-800 border border-red-300 font-body text-sm";
const SLOT_ALERT_CLASS = "mt-1 text-xs text-rose-700 font-body text-center leading-tight";

document.addEventListener("DOMContentLoaded", () => {
    mountNavbar();
    mountCalculatorPage();
});

function mountCalculatorPage(): void {
    const slotsContainer = qs<HTMLElement>("#hand-slots");
    const addBtn = qs<HTMLButtonElement>("#addSlotBtn");
    const resetBtn = qs<HTMLButtonElement>("#resetBtn");
    const outputLeft = qs<HTMLElement>("#outputarealeft");
    const outputRight = qs<HTMLElement>("#outputarearight");
    const outputRituals = qs<HTMLElement>("#rituals-output");
    const resultsError = qs<HTMLElement>("#results-error");
    const indexError = qs<HTMLElement>("#index-error");
    const indexRetryBtn = qs<HTMLButtonElement>("#indexRetryBtn");
    const chainBtn = qs<HTMLButtonElement>("#chainBtn");
    const chainLoading = qs<HTMLElement>("#chain-loading");
    const chainOutput = qs<HTMLElement>("#chain-output");
    if (
        !slotsContainer ||
        !addBtn ||
        !outputLeft ||
        !outputRight ||
        !outputRituals ||
        !resultsError ||
        !indexError ||
        !indexRetryBtn ||
        !chainBtn ||
        !chainLoading ||
        !chainOutput
    ) {
        return;
    }

    // The hand is read from the card index, so the results never wait for the artwork lookups.
    const idsByNameLower = new Map<string, number>();
    let suggestions: readonly string[] = [];
    let markIndexReady = (): void => {};
    const indexReady = new Promise<void>((resolve) => {
        markIndexReady = resolve;
    });

    const slots: SlotState[] = [];
    let nextSlotId = 1;
    const refreshLatest = createLatest();
    const chainLatest = createLatest();
    // Ordered ids of the hand the results show or are being fetched for; null makes the next refresh fetch.
    let shownKey: string | null = null;

    const currentHandIds = (): number[] =>
        getValidIds(
            slots.map((s) => s.input.value),
            idsByNameLower
        );

    const clearResults = (): void => {
        clear(outputLeft);
        clear(outputRight);
        hideRituals(outputRituals);
        clear(resultsError);
    };

    const renderResults = (result: CalculatorResponse): void => {
        appendHeader(outputLeft, t("search.results.fusions"));
        for (const fusion of result.fusions) outputLeft.appendChild(renderPair(fusion));
        appendHeader(outputRight, t("search.results.equips"));
        for (const equip of result.equips) outputRight.appendChild(renderPair(equip));
        showRituals(outputRituals, result.rituals);
    };

    // The chain belongs to the hand it was made for: drop its output and any request still in flight.
    const resetChain = (): void => {
        chainLatest.cancel();
        clear(chainOutput);
        chainLoading.classList.add("hidden");
        setBusy(chainBtn, false);
    };

    // Only the latest call touches the page. A change event that repeats the hand shown is a no-op.
    const refresh = async (): Promise<void> => {
        const handIds = currentHandIds();
        const handKey = handIds.join(",");
        if (handKey === shownKey) return;
        shownKey = handKey;
        resetChain();
        const run = refreshLatest.begin();
        clearResults();
        if (handIds.length < 2) return;
        let result: CalculatorResponse;
        try {
            result = await calculate(handIds, run.signal);
        } catch {
            if (!run.isCurrent()) return;
            shownKey = null;
            appendAlert(resultsError, t("calculator.results.error"), ALERT_CLASS);
            return;
        }
        if (!run.isCurrent()) return;
        renderResults(result);
    };

    const loadIndex = async (): Promise<void> => {
        setBusy(indexRetryBtn, true);
        try {
            const cardsIndex = await getCardsIndex();
            for (const c of cardsIndex) idsByNameLower.set(c.name.toLowerCase(), c.id);
            suggestions = cardsIndex.map((c) => c.name).sort((a, b) => a.localeCompare(b));
            indexError.classList.add("hidden");
            markIndexReady();
            // Names may have been typed while the index was loading.
            void refresh();
        } catch {
            indexError.classList.remove("hidden");
        } finally {
            setBusy(indexRetryBtn, false);
        }
    };

    const updateRemoveBtns = (): void => {
        const removable = canRemoveSlot(slots.length);
        for (const slot of slots) {
            slot.removeBtn.classList.toggle("hidden", !removable);
        }
    };

    function setSlotCard(slot: SlotState, card: CardSummary | null): void {
        slot.card = card;
        setSlotProblem(slot, null);
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

    // An answer only applies if the slot was not cleared, edited or reset while the lookup was in flight.
    const updateSlotCard = async (slot: SlotState): Promise<void> => {
        const value = slot.input.value.trim();
        // The change event that follows a selection finds the slot already showing that card.
        if (value && slot.card?.name.toLowerCase() === value.toLowerCase()) return;
        const run = slot.lookup.begin();
        if (!value) {
            setSlotCard(slot, null);
            return;
        }
        try {
            const card = await getCardByName(value, run.signal);
            if (!run.isCurrent()) return;
            if (card) setSlotCard(slot, card);
            else setSlotProblem(slot, "invalid");
        } catch {
            if (run.isCurrent()) setSlotProblem(slot, "lookup-failed");
        }
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

        // Alert for a name that is invalid or could not be looked up (below both states)
        const message = document.createElement("div");
        message.id = `slot-message-${nextSlotId++}`;
        message.className = "slot-message w-full";

        // Remove slot button (below both states, only when canRemoveSlot)
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className =
            "remove-btn hidden mt-1 text-xs text-rose-600 hover:text-rose-500 font-body underline";
        removeBtn.textContent = `− ${t("calculator.btn.remove-slot")}`;
        removeBtn.setAttribute("aria-label", `${t("calculator.btn.remove-slot")} ${n}`);

        cell.appendChild(emptyState);
        cell.appendChild(filledState);
        cell.appendChild(message);
        cell.appendChild(removeBtn);
        slotsContainer.appendChild(cell);

        const state: SlotState = {
            cell,
            input,
            emptyState,
            filledState,
            imgWrapper,
            nameLabel,
            message,
            clearBtn,
            removeBtn,
            card: null,
            lookup: createLatest(),
        };
        slots.push(state);

        const commit = (): void => {
            void updateSlotCard(state);
            void refresh();
        };

        // Suggestions wait for the card index instead of failing when it has not arrived (or failed).
        new Autocomplete(input, {
            fetchList: () => indexReady.then(() => suggestions),
            onSelect: commit,
        });

        input.addEventListener("input", () => {
            // A lookup in flight is for older text and must not overwrite what is being typed.
            state.lookup.cancel();
            if (input.value.trim() === "") setSlotProblem(state, null);
        });
        input.addEventListener("change", commit);

        clearBtn.addEventListener("click", () => {
            state.lookup.cancel();
            setSlotCard(state, null);
            void refresh();
        });

        removeBtn.addEventListener("click", () => {
            const idx = slots.indexOf(state);
            if (idx === -1) return;
            state.lookup.cancel();
            slots.splice(idx, 1);
            slotsContainer.removeChild(cell);
            updateRemoveBtns();
            void refresh();
        });

        updateRemoveBtns();
    };

    // One request at a time: the button is disabled while it is in flight.
    const runChainSearch = async (): Promise<void> => {
        resetChain();
        const handIds = currentHandIds();
        if (handIds.length < 2) {
            chainOutput.textContent = t("calculator.chain.no-result");
            return;
        }
        const run = chainLatest.begin();
        chainLoading.textContent = t("calculator.chain.loading");
        chainLoading.classList.remove("hidden");
        setBusy(chainBtn, true);
        try {
            const res = await chainSearch(handIds, run.signal);
            if (!run.isCurrent()) return;
            if (res.chains.length === 0) {
                chainOutput.textContent = t("calculator.chain.no-result");
            } else {
                for (const chain of res.chains) chainOutput.appendChild(renderChain(chain));
            }
        } catch (err) {
            if (!run.isCurrent()) return;
            appendAlert(chainOutput, describeChainError(err), ALERT_CLASS);
        }
        chainLoading.classList.add("hidden");
        setBusy(chainBtn, false);
    };

    addBtn.addEventListener("click", addSlot);
    indexRetryBtn.addEventListener("click", () => void loadIndex());
    chainBtn.addEventListener("click", () => void runChainSearch());

    resetBtn?.addEventListener("click", () => {
        refreshLatest.cancel();
        shownKey = null;
        for (const slot of slots) {
            slot.lookup.cancel();
            setSlotCard(slot, null);
        }
        clearResults();
        resetChain();
    });

    for (let i = 0; i < MIN_HAND_SIZE; i++) addSlot();
    void loadIndex();
}

// Marks the input invalid only for an unknown name; a failed lookup says nothing about the name.
function setSlotProblem(slot: SlotState, problem: SlotProblem | null): void {
    clear(slot.message);
    slot.input.removeAttribute("aria-describedby");
    if (problem === "invalid") slot.input.setAttribute("aria-invalid", "true");
    else slot.input.removeAttribute("aria-invalid");
    if (problem === null) return;
    const key = problem === "invalid" ? "card.label.invalid" : "card.label.lookup-failed";
    appendAlert(slot.message, t(key), SLOT_ALERT_CLASS);
    slot.input.setAttribute("aria-describedby", slot.message.id);
}

function appendAlert(where: HTMLElement, message: string, className: string): void {
    const alert = document.createElement("p");
    alert.setAttribute("role", "alert");
    alert.className = className;
    alert.textContent = message;
    where.appendChild(alert);
}

function setBusy(button: HTMLButtonElement, busy: boolean): void {
    button.disabled = busy;
    if (busy) button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
}

function describeChainError(err: unknown): string {
    if (err instanceof ApiError && err.status === 400 && err.code === "hand-too-large") {
        return t("calculator.chain.hand-too-large", { max: MAX_HAND_SIZE });
    }
    return t("calculator.chain.error");
}

function appendHeader(where: HTMLElement, label: string): void {
    const h2 = document.createElement("h2");
    h2.className = "text-center my-4 font-display text-2xl";
    h2.textContent = label;
    where.appendChild(h2);
}

// Hidden with the class, not just emptied: the block has a top margin that would leave a gap.
function hideRituals(where: HTMLElement): void {
    clear(where);
    where.classList.add("hidden");
}

function showRituals(where: HTMLElement, rituals: readonly RitualExpanded[]): void {
    if (rituals.length === 0) return;
    appendHeader(where, t("search.results.rituals"));
    const list = document.createElement("div");
    list.className = "flex flex-wrap justify-center gap-x-3";
    for (const ritual of rituals) list.appendChild(renderRitual(ritual));
    where.appendChild(list);
    where.classList.remove("hidden");
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
