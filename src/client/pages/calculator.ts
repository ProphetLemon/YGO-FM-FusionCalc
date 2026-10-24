import { mountNavbar } from "../components/navbar.js";
import { Autocomplete } from "../components/autocomplete.js";
import { renderChain, renderEquip, renderPair, renderRitual } from "../components/fusion-card.js";
import { ApiError, calculate, chainSearch, getCardByName, getCardsIndex } from "../lib/api.js";
import type { CalculatorResponse, CardSummary, RitualExpanded } from "../../shared/types.js";
import { MAX_HAND_SIZE } from "../../shared/limits.js";
import { MIN_HAND_SIZE, canAddSlot, canRemoveSlot, getSlotIds, getValidIds } from "../lib/slots.js";
import { createCardImg } from "../lib/card-image.js";
import { clear, qs } from "../lib/dom.js";
import { loadHand, saveHand } from "../lib/hand-storage.js";
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
    // The card saved for this slot, until it is put back or the user touches the slot: whatever the user did
    // meanwhile wins over the saved hand.
    savedId: number | null;
}

type SlotProblem = "invalid" | "lookup-failed";

const ALERT_CLASS = "rounded p-3 mb-4 bg-red-100 text-red-800 border border-red-300 font-body text-sm";
const SLOT_ALERT_CLASS = "mt-1 text-xs text-rose-700 font-body text-center leading-tight";
const STATUS_CLASS = "text-center font-body text-sm text-fm-primary/80 my-4";
const NONE_CLASS = "text-center font-body text-sm text-fm-primary/80 mb-3";
const NOTE_CLASS = "rounded p-3 mb-4 bg-amber-50 text-amber-900 border border-amber-300 font-body text-sm";

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
    const resultsStatus = qs<HTMLElement>("#results-status");
    const addSlotHint = qs<HTMLElement>("#add-slot-hint");
    const handCount = qs<HTMLElement>("#hand-count");
    const answerColumn = qs<HTMLElement>("#answer-column");
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
        !resultsStatus ||
        !addSlotHint ||
        !handCount ||
        !answerColumn ||
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
    const namesById = new Map<number, string>();
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
    // Saving waits for the saved hand to be put back: before that the slots are still empty, and saving them
    // would erase the hand this page is about to restore.
    let persistReady = false;

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

    // What the panel says while it has nothing to list: a hint, the loading text, or nothing.
    const setStatus = (message: string | null): void => {
        // The region is announced when its text changes, so the same message is not written again.
        if ((resultsStatus.textContent ?? "") === (message ?? "")) return;
        clear(resultsStatus);
        if (message === null) return;
        const p = document.createElement("p");
        p.className = STATUS_CLASS;
        p.textContent = message;
        resultsStatus.appendChild(p);
    };

    const showHint = (): void => setStatus(t("calculator.results.hint"));

    // On a phone the answer column moves above the hand only while it has something to show.
    const setHasAnswer = (hasAnswer: boolean): void => {
        answerColumn.dataset.hasAnswer = String(hasAnswer);
    };

    const renderResults = (result: CalculatorResponse): void => {
        appendHeader(outputLeft, t("search.results.fusions"));
        for (const fusion of result.fusions) outputLeft.appendChild(renderPair(fusion));
        if (result.fusions.length === 0) appendNone(outputLeft, t("calculator.results.no-fusions"));
        appendHeader(outputRight, t("search.results.equips"));
        for (const equip of result.equips) outputRight.appendChild(renderEquip(equip));
        if (result.equips.length === 0) appendNone(outputRight, t("calculator.results.no-equips"));
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
        setHasAnswer(handIds.length >= 2);
        if (handIds.length < 2) {
            showHint();
            return;
        }
        setStatus(t("calculator.results.loading"));
        let result: CalculatorResponse;
        try {
            result = await calculate(handIds, run.signal);
        } catch {
            if (!run.isCurrent()) return;
            shownKey = null;
            setStatus(null);
            appendAlert(resultsError, t("calculator.results.error"), ALERT_CLASS);
            return;
        }
        if (!run.isCurrent()) return;
        setStatus(null);
        renderResults(result);
    };

    const loadIndex = async (): Promise<void> => {
        setBusy(indexRetryBtn, true);
        try {
            const cardsIndex = await getCardsIndex();
            for (const c of cardsIndex) {
                idsByNameLower.set(c.name.toLowerCase(), c.id);
                namesById.set(c.id, c.name);
            }
            suggestions = cardsIndex.map((c) => c.name);
            indexError.classList.add("hidden");
            restoreHand();
            markIndexReady();
            // Names may have been typed while the index was loading, and a restored hand needs its results.
            void refresh();
        } catch {
            indexError.classList.remove("hidden");
        } finally {
            setBusy(indexRetryBtn, false);
        }
    };

    // At the cap "Add card" is off and the hint says why; a slot removed brings it back.
    const updateSlotControls = (): void => {
        const removable = canRemoveSlot(slots.length);
        for (const slot of slots) {
            slot.removeBtn.classList.toggle("hidden", !removable);
        }
        const addable = canAddSlot(slots.length);
        addBtn.disabled = !addable;
        handCount.textContent = t("calculator.hand.count", { count: slots.length, max: MAX_HAND_SIZE });
        addSlotHint.textContent = addable ? "" : t("calculator.hand.max-reached", { max: MAX_HAND_SIZE });
    };

    function setSlotCard(slot: SlotState, card: CardSummary | null): void {
        slot.card = card;
        setSlotProblem(slot, null);
        if (card) {
            slot.imgWrapper.innerHTML = "";
            slot.imgWrapper.appendChild(
                createCardImg(card.name, card.imageCode, "w-full h-full object-contain")
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

    // The hand is saved from the names in the inputs, through the index: it never waits for an artwork
    // lookup, and a name the index does not know is left out.
    const persist = (): void => {
        if (!persistReady) return;
        const names = slots.map((s) => s.input.value);
        saveHand(getSlotIds(names, idsByNameLower));
    };

    // Puts the saved cards back once the index can name them, and only then lets the page save. A slot the
    // user touched has forgotten its saved card, so nothing typed or cleared meanwhile is overwritten.
    const restoreHand = (): void => {
        for (const slot of slots) {
            const name = slot.savedId === null ? undefined : namesById.get(slot.savedId);
            slot.savedId = null;
            if (name === undefined) continue;
            slot.input.value = name;
            void updateSlotCard(slot);
        }
        persistReady = true;
        persist();
    };

    // The cap is enforced here, not only by the disabled button, so no caller can grow the hand past it.
    const addSlot = (savedId: number | null = null): void => {
        if (!canAddSlot(slots.length)) return;
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
            savedId,
        };
        slots.push(state);

        const commit = (): void => {
            void updateSlotCard(state);
            void refresh();
            persist();
        };

        // Suggestions wait for the card index instead of failing when it has not arrived (or failed).
        new Autocomplete(input, {
            fetchList: () => indexReady.then(() => suggestions),
            onSelect: commit,
        });

        input.addEventListener("input", () => {
            // A lookup in flight is for older text and must not overwrite what is being typed.
            state.lookup.cancel();
            state.savedId = null;
            if (input.value.trim() === "") setSlotProblem(state, null);
        });
        input.addEventListener("change", commit);

        clearBtn.addEventListener("click", () => {
            state.lookup.cancel();
            setSlotCard(state, null);
            void refresh();
            persist();
        });

        removeBtn.addEventListener("click", () => {
            const idx = slots.indexOf(state);
            if (idx === -1) return;
            state.lookup.cancel();
            slots.splice(idx, 1);
            slotsContainer.removeChild(cell);
            updateSlotControls();
            void refresh();
            persist();
        });

        updateSlotControls();
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
            if (res.truncated) appendNote(chainOutput, t("calculator.chain.truncated"));
            if (res.chains.length === 0) chainOutput.append(t("calculator.chain.no-result"));
            for (const chain of res.chains) chainOutput.appendChild(renderChain(chain));
        } catch (err) {
            if (!run.isCurrent()) return;
            appendAlert(chainOutput, describeChainError(err), ALERT_CLASS);
        }
        chainLoading.classList.add("hidden");
        setBusy(chainBtn, false);
    };

    addBtn.addEventListener("click", () => {
        addSlot();
        persist();
    });
    indexRetryBtn.addEventListener("click", () => void loadIndex());
    chainBtn.addEventListener("click", () => void runChainSearch());

    resetBtn?.addEventListener("click", () => {
        refreshLatest.cancel();
        shownKey = null;
        for (const slot of slots) {
            slot.lookup.cancel();
            slot.savedId = null;
            setSlotCard(slot, null);
        }
        clearResults();
        setHasAnswer(false);
        showHint();
        resetChain();
        persist();
    });

    // The slots come back as they were saved; their cards wait for the index (see restoreHand).
    const savedHand = loadHand() ?? Array.from({ length: MIN_HAND_SIZE }, () => null);
    for (const savedId of savedHand) addSlot(savedId);
    showHint();
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

// A <p>, not a <div>, so the entries of a column stay exactly its <div> children.
function appendNone(where: HTMLElement, message: string): void {
    const p = document.createElement("p");
    p.className = NONE_CLASS;
    p.textContent = message;
    where.appendChild(p);
}

function appendNote(where: HTMLElement, message: string): void {
    const note = document.createElement("p");
    note.setAttribute("role", "note");
    note.className = NOTE_CLASS;
    note.textContent = message;
    where.appendChild(note);
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
