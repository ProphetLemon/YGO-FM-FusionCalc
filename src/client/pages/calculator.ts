import { mountNavbar } from "../components/navbar.js";
import { Autocomplete } from "../components/autocomplete.js";
import { renderChains } from "../components/chain-panel.js";
import { renderEquipRow, renderFusionTable, renderRitualRow } from "../components/results-panels.js";
import { ApiError, calculate, chainSearch, getCardByName, getCardsIndex } from "../lib/api.js";
import type { CalculatorResponse, CardSummary, FusionExpanded, RitualExpanded } from "../../shared/types.js";
import { MAX_HAND_SIZE } from "../../shared/limits.js";
import { findFusionSlots } from "../lib/fusion-slots.js";
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
    // The card tile of a filled slot: its frame colour follows the kind of the card.
    tile: HTMLElement;
    imgWrapper: HTMLElement;
    nameLabel: HTMLElement;
    statLabel: HTMLElement;
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

const ALERT_CLASS = "p-3 mb-4 bg-wb-well text-wb-red border-2 border-wb-red font-body font-bold text-sm";
const SLOT_ALERT_CLASS = "mt-1 text-xs text-wb-red font-bold font-body text-center leading-tight";
const STATUS_CLASS = "text-center font-body text-sm text-wb-mute my-4";
const NONE_CLASS = "text-center font-body text-sm text-wb-mute mb-3";
const NOTE_CLASS = "sink p-3 mb-4 text-wb-ink font-body text-sm";

// The frame colour of a hand tile (D7): a hand card is never a fusion result. Literal strings, so Tailwind
// sees every class.
const TILE_CLASS =
    "slot-tile relative flex flex-col aspect-[2/3] p-1 border-2 border-wb-ink text-wb-ink " +
    "shadow-[inset_1px_1px_0_#fff,inset_-1px_-1px_0_rgb(0_0_0/0.25)]";
const TILE_FRAME_CLASS = {
    monster: "bg-card-monster",
    equip: "bg-card-equip",
    magic: "bg-card-magic",
} as const;

function tileFrame(card: CardSummary): string {
    if (card.isMonster) return TILE_FRAME_CLASS.monster;
    return card.typeName === "Equip" ? TILE_FRAME_CLASS.equip : TILE_FRAME_CLASS.magic;
}

// What the stat strip of a tile says: the stats of a monster, the type of anything else.
function tileStat(card: CardSummary): string {
    return card.isMonster ? `${card.attack} / ${card.defense}` : card.typeName;
}

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
    const outputOther = qs<HTMLElement>("#outputareaother");
    const applyHint = qs<HTMLElement>("#fusions-apply-hint");
    const outputRituals = qs<HTMLElement>("#rituals-output");
    const resultsHint = qs<HTMLElement>("#results-hint");
    const resultsPanels = qs<HTMLElement>("#results-panels");
    const resultsError = qs<HTMLElement>("#results-error");
    const resultsStatus = qs<HTMLElement>("#results-status");
    const addSlotHint = qs<HTMLElement>("#add-slot-hint");
    const handCount = qs<HTMLElement>("#hand-count");
    const pips = document.querySelectorAll<HTMLElement>("#hand-meter .pip");
    const answerColumn = qs<HTMLElement>("#answer-column");
    const indexError = qs<HTMLElement>("#index-error");
    const indexRetryBtn = qs<HTMLButtonElement>("#indexRetryBtn");
    const chainSection = qs<HTMLElement>("#chain-section");
    const chainBtn = qs<HTMLButtonElement>("#chainBtn");
    const chainLoading = qs<HTMLElement>("#chain-loading");
    const chainOutput = qs<HTMLElement>("#chain-output");
    if (
        !slotsContainer ||
        !addBtn ||
        !outputLeft ||
        !outputRight ||
        !outputOther ||
        !applyHint ||
        !outputRituals ||
        !resultsHint ||
        !resultsPanels ||
        !resultsError ||
        !resultsStatus ||
        !addSlotHint ||
        !handCount ||
        !answerColumn ||
        !indexError ||
        !indexRetryBtn ||
        !chainSection ||
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
        applyHint.hidden = true;
        clear(outputRight);
        hideBlock(outputOther);
        clear(outputRituals);
        clear(resultsError);
        // The grey panel holds the hint, the loading text and the error; the coloured panels hold the results.
        resultsPanels.hidden = true;
        resultsHint.hidden = false;
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
        // The server sorts fusions by the ATK of what they make; each kind keeps that order.
        const monsters = result.fusions.filter((fusion) => fusion.result.isMonster);
        const others = result.fusions.filter((fusion) => !fusion.result.isMonster);
        applyHint.hidden = result.fusions.length === 0;
        if (monsters.length > 0) {
            outputLeft.appendChild(
                renderFusionTable(monsters, {
                    highlightFirst: true,
                    label: t("search.results.fusions"),
                    onApply: applyFusion,
                })
            );
        } else {
            const key =
                others.length === 0 ? "calculator.results.no-fusions" : "calculator.results.no-monster-fusions";
            appendNone(outputLeft, t(key));
        }
        showOtherResults(outputOther, others, applyFusion);
        for (const equip of result.equips) outputRight.appendChild(renderEquipRow(equip));
        if (result.equips.length === 0) appendNone(outputRight, t("calculator.results.no-equips"));
        showRituals(outputRituals, result.rituals);
        resultsHint.hidden = true;
        resultsPanels.hidden = false;
    };

    // The chain belongs to the hand it was made for: drop its output and any request still in flight.
    const resetChain = (): void => {
        chainLatest.cancel();
        clear(chainOutput);
        chainLoading.classList.add("hidden");
        chainBtn.classList.add("hidden");
        setBusy(chainBtn, false);
    };

    // The best play needs the best single fusion of the results to say how much better it is. What the
    // calculation of the hand shown settled with (null when it failed) is kept for the retry of the chain.
    let calculation: Promise<CalculatorResponse | null> = Promise.resolve(null);

    // The chain is searched together with the results and, as the answer, waits for them to settle (not to
    // succeed): a failed calculation only costs the gain line. One failing never hides the other.
    const runChainSearch = async (handIds: number[]): Promise<void> => {
        const run = chainLatest.begin();
        clear(chainOutput);
        chainLoading.textContent = t("calculator.chain.loading");
        chainLoading.classList.remove("hidden");
        setBusy(chainBtn, true);
        try {
            const [res, calculated] = await Promise.all([chainSearch(handIds, run.signal), calculation]);
            if (!run.isCurrent()) return;
            if (res.truncated) appendNote(chainOutput, t("calculator.chain.truncated"));
            if (res.chains.length === 0) chainOutput.append(t("calculator.chain.no-result"));
            else chainOutput.appendChild(renderChains(res.chains, bestSingleFusion(calculated), handIds));
            chainBtn.classList.add("hidden");
        } catch (err) {
            if (!run.isCurrent()) return;
            appendAlert(chainOutput, describeChainError(err), ALERT_CLASS);
            chainBtn.classList.remove("hidden");
        }
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
        chainSection.classList.toggle("hidden", handIds.length < 2);
        if (handIds.length < 2) {
            showHint();
            return;
        }
        setStatus(t("calculator.results.loading"));
        const calculating = calculate(handIds, run.signal);
        calculation = calculating.catch(() => null);
        void runChainSearch(handIds);
        let result: CalculatorResponse;
        try {
            result = await calculating;
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
        // Decorative: the count above is the accessible value. One pip per slot in use.
        pips.forEach((pip, i) => {
            pip.dataset.on = String(i < slots.length);
        });
        addSlotHint.textContent = addable ? "" : t("calculator.hand.max-reached", { max: MAX_HAND_SIZE });
    };

    function setSlotCard(slot: SlotState, card: CardSummary | null): void {
        slot.card = card;
        setSlotProblem(slot, null);
        if (card) {
            slot.imgWrapper.innerHTML = "";
            slot.imgWrapper.appendChild(
                createCardImg(card.name, card.imageCode, "w-full h-full")
            );
            slot.nameLabel.textContent = card.name;
            slot.statLabel.textContent = tileStat(card);
            slot.tile.className = `${TILE_CLASS} ${tileFrame(card)}`;
            slot.input.value = card.name;
            slot.emptyState.classList.add("hidden");
            slot.filledState.classList.remove("hidden");
        } else {
            slot.imgWrapper.innerHTML = "";
            slot.nameLabel.textContent = "";
            slot.statLabel.textContent = "";
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

    // Takes a fusion from the results into the hand like a user edit: the two cards leave, the result sits
    // in the slot of the first one and the second slot stays, empty. The results are then asked for again.
    const applyFusion = (fusion: FusionExpanded): void => {
        const ids = getSlotIds(
            slots.map((s) => s.input.value),
            idsByNameLower
        );
        const pair = findFusionSlots(ids, fusion.card1.id, fusion.card2.id);
        // The hand changed since the results were drawn: nothing to apply, the next refresh will redraw.
        if (!pair) return;
        const targetSlot = slots[pair[0]];
        const spentSlot = slots[pair[1]];
        if (!targetSlot || !spentSlot) return;
        // A late name lookup must not overwrite either slot, and the saved hand no longer applies to them.
        for (const slot of [targetSlot, spentSlot]) {
            slot.lookup.cancel();
            slot.savedId = null;
        }
        setSlotCard(targetSlot, fusion.result);
        setSlotCard(spentSlot, null);
        persist();
        // The row that had focus is redrawn away. Once the results are back, put the keyboard on the fusions
        // if there are still some to choose, or on the hand if not; never take focus the user moved meanwhile.
        void refresh().then(() => {
            if (document.activeElement && document.activeElement !== document.body) return;
            qs<HTMLElement>(resultsPanels.hidden ? "#hand-title" : "#fusions-title")?.focus();
        });
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
        cell.className = "hand-slot relative";

        // Empty state: a sunken tile holding the label and the input.
        const emptyState = document.createElement("div");
        emptyState.className =
            "slot-empty w-full aspect-[2/3] bg-wb-empty border-2 border-wb-lo border-b-wb-hi border-r-wb-hi " +
            "flex flex-col items-center justify-center gap-1 p-1.5 cursor-text";

        const emptyLabel = document.createElement("span");
        emptyLabel.className = "text-[13px] font-bold text-wb-mute font-body text-center leading-tight";
        emptyLabel.textContent = t("calculator.slot.empty");

        // The suggestion list is absolute with no top: its parent must be a block, not the flex column
        // above, or the list opens over the input instead of below it.
        const inputBox = document.createElement("div");
        inputBox.className = "w-full";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "wb-input w-full min-w-0 px-1.5! text-xs font-body";
        input.setAttribute("aria-label", t("calculator.slot.label", { n }));

        inputBox.appendChild(input);
        emptyState.appendChild(emptyLabel);
        emptyState.appendChild(inputBox);

        // Filled state: the card tile (name strip, art well, stat strip) and the remove "x".
        const filledState = document.createElement("div");
        filledState.className = "slot-filled hidden relative w-full";

        const tile = document.createElement("div");
        tile.className = `${TILE_CLASS} ${TILE_FRAME_CLASS.monster}`;

        const nameLabel = document.createElement("p");
        nameLabel.className =
            "slot-name m-0 min-h-8 px-1 py-0.5 bg-white/70 font-body font-bold text-xs leading-tight " +
            "flex items-center [overflow-wrap:anywhere] line-clamp-2";

        const art = document.createElement("div");
        art.className = "wb-art relative flex-1 min-h-0 my-[3px] overflow-hidden";

        const imgWrapper = document.createElement("div");
        imgWrapper.className = "absolute inset-0";
        art.appendChild(imgWrapper);

        const statLabel = document.createElement("p");
        statLabel.className =
            "slot-stat m-0 px-1 py-px bg-white/70 font-body font-bold text-xs text-center whitespace-nowrap overflow-hidden";

        tile.appendChild(nameLabel);
        tile.appendChild(art);
        tile.appendChild(statLabel);

        // A 44px hit area around a 24px ink square, red on hover.
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className =
            "clear-btn group absolute -top-2.5 -right-2.5 z-10 w-11 h-11 grid place-items-center " +
            "bg-transparent border-0 p-0 cursor-pointer";
        clearBtn.setAttribute("aria-label", `${t("calculator.btn.remove-slot")} ${n}`);
        const clearMark = document.createElement("span");
        clearMark.className =
            "w-6 h-6 grid place-items-center bg-wb-ink text-white border-2 border-wb-plate " +
            "leading-none font-bold group-hover:bg-wb-red";
        clearMark.setAttribute("aria-hidden", "true");
        clearMark.textContent = "×";
        clearBtn.appendChild(clearMark);

        filledState.appendChild(tile);
        filledState.appendChild(clearBtn);

        // Alert for a name that is invalid or could not be looked up (below both states)
        const message = document.createElement("div");
        message.id = `slot-message-${nextSlotId++}`;
        message.className = "slot-message w-full";

        // Remove slot button (below both states, only when canRemoveSlot)
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className =
            "remove-btn hidden mt-1 w-full min-h-[44px] px-1 text-xs font-bold text-wb-red " +
            "hover:bg-wb-plate-hover underline font-body cursor-pointer";
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
            tile,
            imgWrapper,
            nameLabel,
            statLabel,
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

    addBtn.addEventListener("click", () => {
        addSlot();
        persist();
    });
    indexRetryBtn.addEventListener("click", () => void loadIndex());
    // Only after a chain error: the results are not asked for again.
    chainBtn.addEventListener("click", () => void runChainSearch(currentHandIds()));

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
        chainSection.classList.add("hidden");
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

// The first fusion that makes a monster: the results come sorted by the ATK of what they make.
function bestSingleFusion(result: CalculatorResponse | null): CardSummary | null {
    return result?.fusions.find((fusion) => fusion.result.isMonster)?.result ?? null;
}

function describeChainError(err: unknown): string {
    if (err instanceof ApiError && err.status === 400 && err.code === "hand-too-large") {
        return t("calculator.chain.hand-too-large", { max: MAX_HAND_SIZE });
    }
    return t("calculator.chain.error");
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
function hideBlock(where: HTMLElement): void {
    clear(where);
    where.classList.remove("flex");
    where.classList.add("hidden");
}

function showOtherResults(
    where: HTMLElement,
    fusions: readonly FusionExpanded[],
    onApply: (fusion: FusionExpanded) => void
): void {
    if (fusions.length === 0) return;
    const title = document.createElement("h3");
    title.className = "m-0 mb-1 font-display text-[17px] font-bold";
    title.textContent = t("calculator.results.non-monster");
    where.appendChild(title);
    where.appendChild(
        renderFusionTable(fusions, {
            highlightFirst: false,
            label: t("calculator.results.non-monster"),
            onApply,
        })
    );
    where.classList.remove("hidden");
}

// The panel stays on screen whatever the hand: with no ritual it says what a ritual needs.
function showRituals(where: HTMLElement, rituals: readonly RitualExpanded[]): void {
    if (rituals.length === 0) {
        const none = document.createElement("p");
        none.className = "m-0";
        none.textContent = t("calculator.results.no-rituals");
        where.appendChild(none);
        return;
    }
    for (const ritual of rituals) where.appendChild(renderRitualRow(ritual));
}
