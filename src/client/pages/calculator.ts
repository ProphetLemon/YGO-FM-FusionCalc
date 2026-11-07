import { mountNavbar } from "../components/navbar.js";
import { Autocomplete } from "../components/autocomplete.js";
import { renderChains } from "../components/chain-panel.js";
import { renderEquipRow, renderFusionTable, renderRitualRow } from "../components/results-panels.js";
import { ApiError, calculate, chainSearch, getCardByName, getCardsIndex } from "../lib/api.js";
import type {
    BoardZone,
    CalculatorResponse,
    CardIndexEntry,
    CardSummary,
    FusionExpanded,
    RitualExpanded,
} from "../../shared/types.js";
import { ZONE_SIZE } from "../../shared/limits.js";
import {
    BOARD_SIZE,
    ZONES,
    buildBoardRequest,
    emptyZones,
    fitsZone,
    planFusion,
    type SentBoard,
    type SlotCard,
    type ZoneRecord,
} from "../lib/board.js";
import { loadBoard, placeLegacyRest, saveBoard, splitLegacyHand } from "../lib/board-storage.js";
import { createCardImg } from "../lib/card-image.js";
import { clear, qs } from "../lib/dom.js";
import { loadHand } from "../lib/hand-storage.js";
import { createLatest, type Latest } from "../lib/latest.js";
import { t } from "../lib/i18n.js";

interface SlotState {
    zone: BoardZone;
    index: number;
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
    // The accessible name of the input, which the clear button repeats: "Hand, card 2 of 5".
    label: string;
    // The card the slot shows, and the guard that stops a late name lookup from overwriting the slot.
    card: CardSummary | null;
    lookup: Latest;
    // The card saved for this slot, until it is put back or the user touches the slot: whatever the user did
    // meanwhile wins over the saved board.
    savedId: number | null;
}

interface ZoneElements {
    slots: HTMLElement;
    count: HTMLElement;
    clearBtn: HTMLButtonElement;
}

// "not-monster" and "not-spell" are the wrong-kind alerts of a typed zone (D5).
type SlotProblem = "invalid" | "lookup-failed" | "not-monster" | "not-spell";

const PROBLEM_KEYS: Record<SlotProblem, string> = {
    invalid: "card.label.invalid",
    "lookup-failed": "card.label.lookup-failed",
    "not-monster": "calculator.slot.not-monster",
    "not-spell": "calculator.slot.not-spell",
};

const ALERT_CLASS = "p-3 mb-4 bg-wb-well text-wb-red border-2 border-wb-red font-body font-bold text-sm";
const SLOT_ALERT_CLASS = "mt-1 text-xs text-wb-red font-bold font-body text-center leading-tight";
const STATUS_CLASS = "text-center font-body text-sm text-wb-mute my-4";
const NONE_CLASS = "text-center font-body text-sm text-wb-mute mb-3";
const NOTE_CLASS = "sink p-3 mb-4 text-wb-ink font-body text-sm";

// The frame colour of a slot tile (D7): a card on the board is never a fusion result. Literal strings, so
// Tailwind sees every class.
const TILE_CLASS =
    "slot-tile relative flex flex-col aspect-[2/3] p-1 border-2 border-wb-ink text-wb-ink " +
    "shadow-[inset_1px_1px_0_#fff,inset_-1px_-1px_0_rgb(0_0_0/0.25)]";
const TILE_FRAME_CLASS = {
    monster: "bg-card-monster",
    equip: "bg-card-equip",
    magic: "bg-card-magic",
} as const;

// The glyph drawn in the empty slots of the monster and the spell/trap zone. Constant markup, no user text.
const SLOT_GLYPHS: Record<BoardZone, string> = {
    hand: "",
    monster: '<path d="M3 15 L13 5 M11 2.5 L15.5 7 M4.5 10 L8 13.5"></path>',
    spell: '<path d="M9 1.5 L10.6 7.4 L16.5 9 L10.6 10.6 L9 16.5 L7.4 10.6 L1.5 9 L7.4 7.4 Z"></path>',
};

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

function findZoneElements(zone: BoardZone): ZoneElements | null {
    const root = qs<HTMLElement>(`#zone-${zone}`);
    if (!root) return null;
    const slots = qs<HTMLElement>(".zone-slots", root);
    const count = qs<HTMLElement>(".zone-count", root);
    const clearBtn = qs<HTMLButtonElement>(".zone-clear", root);
    return slots && count && clearBtn ? { slots, count, clearBtn } : null;
}

function mountCalculatorPage(): void {
    const zoneEls: Partial<Record<BoardZone, ZoneElements>> = {};
    for (const zone of ZONES) {
        const found = findZoneElements(zone);
        if (found) zoneEls[zone] = found;
    }
    const boardCount = qs<HTMLElement>("#board-count");
    const boardNote = qs<HTMLElement>("#board-note");
    const resetBtn = qs<HTMLButtonElement>("#resetBtn");
    const outputLeft = qs<HTMLElement>("#outputarealeft");
    const outputRight = qs<HTMLElement>("#outputarearight");
    const outputOther = qs<HTMLElement>("#outputareaother");
    const applyHint = qs<HTMLElement>("#fusions-apply-hint");
    const applyStatus = qs<HTMLElement>("#apply-status");
    const outputRituals = qs<HTMLElement>("#rituals-output");
    const resultsHint = qs<HTMLElement>("#results-hint");
    const resultsPanels = qs<HTMLElement>("#results-panels");
    const resultsError = qs<HTMLElement>("#results-error");
    const resultsStatus = qs<HTMLElement>("#results-status");
    const answerColumn = qs<HTMLElement>("#answer-column");
    const indexError = qs<HTMLElement>("#index-error");
    const indexRetryBtn = qs<HTMLButtonElement>("#indexRetryBtn");
    const chainSection = qs<HTMLElement>("#chain-section");
    const chainBtn = qs<HTMLButtonElement>("#chainBtn");
    const chainLoading = qs<HTMLElement>("#chain-loading");
    const chainOutput = qs<HTMLElement>("#chain-output");
    const hand = zoneEls.hand;
    const monster = zoneEls.monster;
    const spell = zoneEls.spell;
    if (
        !hand ||
        !monster ||
        !spell ||
        !boardCount ||
        !boardNote ||
        !resetBtn ||
        !outputLeft ||
        !outputRight ||
        !outputOther ||
        !applyHint ||
        !applyStatus ||
        !outputRituals ||
        !resultsHint ||
        !resultsPanels ||
        !resultsError ||
        !resultsStatus ||
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
    const zoneElements: Record<BoardZone, ZoneElements> = { hand, monster, spell };

    // The board is read from the card index, so the results never wait for the artwork lookups.
    const entriesByNameLower = new Map<string, CardIndexEntry>();
    const entriesById = new Map<number, CardIndexEntry>();
    let suggestions: readonly string[] = [];
    let markIndexReady = (): void => {};
    const indexReady = new Promise<void>((resolve) => {
        markIndexReady = resolve;
    });

    const slots: Record<BoardZone, SlotState[]> = { hand: [], monster: [], spell: [] };
    const allSlots: SlotState[] = [];
    let nextSlotId = 1;
    const refreshLatest = createLatest();
    const chainLatest = createLatest();
    // The board the results show or are being fetched for; null makes the next refresh fetch. Its slot map is
    // what turns the `from` references of an answer back into slots.
    let shownKey: string | null = null;
    let shownBoard: SentBoard | null = null;
    // Saving waits for the saved board to be put back: before that the slots are still empty, and saving them
    // would erase the board this page is about to restore.
    let persistReady = false;
    // Cards of a saved v1 hand past its fifth slot: they find their zone once the index can say what they are.
    let legacyRest: number[] = [];

    // The card a slot's text names, if the index knows it.
    const entryOf = (slot: SlotState): CardIndexEntry | undefined =>
        entriesByNameLower.get(slot.input.value.trim().toLowerCase());

    const cardOf = (slot: SlotState): SlotCard | null => {
        const entry = entryOf(slot);
        return entry ? { id: entry.id, isMonster: entry.isMonster } : null;
    };

    const boardCards = (): Record<BoardZone, Array<SlotCard | null>> => ({
        hand: slots.hand.map(cardOf),
        monster: slots.monster.map(cardOf),
        spell: slots.spell.map(cardOf),
    });

    // What the board sends: filled slots that fit their zone (D5), with the map back to the slots.
    const currentBoard = (): SentBoard => buildBoardRequest(boardCards());

    const clearResults = (): void => {
        clear(outputLeft);
        applyHint.hidden = true;
        applyStatus.textContent = "";
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

    // On a phone the answer column moves above the board only while it has something to show.
    const setHasAnswer = (hasAnswer: boolean): void => {
        answerColumn.dataset.hasAnswer = String(hasAnswer);
    };

    // The cards in each zone and in all, as the live region and the bars say them.
    const updateCounts = (sent: SentBoard): void => {
        for (const zone of ZONES) {
            zoneElements[zone].count.textContent = t("calculator.zone.count", {
                count: sent.slots[zone].length,
                max: ZONE_SIZE,
            });
        }
        // The text is written only when it changes, so the polite region does not repeat itself.
        const total = t("calculator.board.total", { count: sent.count, max: BOARD_SIZE });
        if (boardCount.textContent !== total) boardCount.textContent = total;
    };

    const renderResults = (result: CalculatorResponse, sent: SentBoard): void => {
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
                    sent,
                })
            );
        } else {
            const key =
                others.length === 0
                    ? "calculator.results.no-fusions"
                    : "calculator.results.no-monster-fusions";
            appendNone(outputLeft, t(key));
        }
        showOtherResults(outputOther, others, applyFusion, sent);
        for (const equip of result.equips) outputRight.appendChild(renderEquipRow(equip, sent));
        if (result.equips.length === 0) appendNone(outputRight, t("calculator.results.no-equips"));
        showRituals(outputRituals, result.rituals, sent);
        resultsHint.hidden = true;
        resultsPanels.hidden = false;
    };

    // The chain belongs to the board it was made for: drop its output and any request still in flight.
    const resetChain = (): void => {
        chainLatest.cancel();
        clear(chainOutput);
        chainLoading.classList.add("hidden");
        chainBtn.classList.add("hidden");
        setBusy(chainBtn, false);
    };

    // The best play needs the best single fusion of the results to say how much better it is. What the
    // calculation of the board shown settled with (null when it failed) is kept for the retry of the chain.
    let calculation: Promise<CalculatorResponse | null> = Promise.resolve(null);

    // The chain is searched together with the results and, as the answer, waits for them to settle (not to
    // succeed): a failed calculation only costs the gain line. One failing never hides the other.
    const runChainSearch = async (sent: SentBoard): Promise<void> => {
        const run = chainLatest.begin();
        clear(chainOutput);
        chainLoading.textContent = t("calculator.chain.loading");
        chainLoading.classList.remove("hidden");
        setBusy(chainBtn, true);
        try {
            const [res, calculated] = await Promise.all([
                chainSearch(sent.request, run.signal),
                calculation,
            ]);
            if (!run.isCurrent()) return;
            if (res.truncated) appendNote(chainOutput, t("calculator.chain.truncated"));
            if (res.chains.length === 0) chainOutput.append(t("calculator.chain.no-result"));
            else {
                chainOutput.appendChild(
                    renderChains(res.chains, bestSingleFusion(calculated), sent.request.handIds, sent)
                );
            }
            chainBtn.classList.add("hidden");
        } catch (err) {
            if (!run.isCurrent()) return;
            appendAlert(chainOutput, describeChainError(err), ALERT_CLASS);
            chainBtn.classList.remove("hidden");
        }
        chainLoading.classList.add("hidden");
        setBusy(chainBtn, false);
    };

    // Only the latest call touches the page. A change event that repeats the board shown is a no-op.
    const refresh = async (): Promise<void> => {
        const sent = currentBoard();
        updateCounts(sent);
        if (sent.key === shownKey) return;
        shownKey = sent.key;
        shownBoard = sent;
        resetChain();
        const run = refreshLatest.begin();
        clearResults();
        setHasAnswer(sent.count >= 2);
        chainSection.classList.toggle("hidden", sent.count < 2);
        if (sent.count < 2) {
            showHint();
            return;
        }
        setStatus(t("calculator.results.loading"));
        const calculating = calculate(sent.request, run.signal);
        calculation = calculating.catch(() => null);
        void runChainSearch(sent);
        let result: CalculatorResponse;
        try {
            result = await calculating;
        } catch (err) {
            if (!run.isCurrent()) return;
            shownKey = null;
            setStatus(null);
            appendAlert(resultsError, describeBoardError(err, "calculator.results.error"), ALERT_CLASS);
            return;
        }
        if (!run.isCurrent()) return;
        setStatus(null);
        renderResults(result, sent);
    };

    const loadIndex = async (): Promise<void> => {
        setBusy(indexRetryBtn, true);
        try {
            const cardsIndex = await getCardsIndex();
            for (const c of cardsIndex) {
                entriesByNameLower.set(c.name.toLowerCase(), c);
                entriesById.set(c.id, c);
            }
            suggestions = cardsIndex.map((c) => c.name);
            indexError.classList.add("hidden");
            restoreBoard();
            markIndexReady();
            // Names may have been typed while the index was loading, and a restored board needs its results.
            void refresh();
        } catch {
            indexError.classList.remove("hidden");
        } finally {
            setBusy(indexRetryBtn, false);
        }
    };

    function setSlotCard(slot: SlotState, card: CardSummary | null): void {
        slot.card = card;
        setSlotProblem(slot, null);
        if (card) {
            slot.imgWrapper.innerHTML = "";
            slot.imgWrapper.appendChild(createCardImg(card.name, card.imageCode, "w-full h-full"));
            slot.nameLabel.textContent = card.name;
            slot.statLabel.textContent = tileStat(card);
            slot.tile.className = `${TILE_CLASS} ${tileFrame(card)}`;
            slot.input.value = card.name;
            slot.clearBtn.setAttribute(
                "aria-label",
                t("calculator.slot.clear", { slot: slot.label, card: card.name })
            );
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
        // A card of the wrong kind for its zone is flagged and kept out of the request (D5): the index says
        // what it is, so there is nothing to look up.
        const entry = entryOf(slot);
        if (entry && !fitsZone(slot.zone, entry.isMonster)) {
            setSlotProblem(slot, wrongKindProblem(slot.zone));
            return;
        }
        try {
            const card = await getCardByName(value, run.signal);
            if (!run.isCurrent()) return;
            if (!card) setSlotProblem(slot, "invalid");
            else if (!fitsZone(slot.zone, card.isMonster)) setSlotProblem(slot, wrongKindProblem(slot.zone));
            else setSlotCard(slot, card);
        } catch {
            if (run.isCurrent()) setSlotProblem(slot, "lookup-failed");
        }
    };

    // The board is saved from the names in the inputs, through the index: it never waits for an artwork
    // lookup, and a name the index does not know, or a card of the wrong kind for its zone, is left out.
    const persist = (): void => {
        if (!persistReady) return;
        const idOf = (slot: SlotState): number | null => {
            const card = cardOf(slot);
            return card && fitsZone(slot.zone, card.isMonster) ? card.id : null;
        };
        saveBoard({
            hand: slots.hand.map(idOf),
            monster: slots.monster.map(idOf),
            spell: slots.spell.map(idOf),
        });
    };

    const forgetSlot = (slot: SlotState): void => {
        // A late name lookup must not overwrite the slot, and the saved board no longer applies to it.
        slot.lookup.cancel();
        slot.savedId = null;
    };

    const emptySlot = (slot: SlotState): void => {
        forgetSlot(slot);
        setSlotCard(slot, null);
    };

    // D6: takes a fusion from the results onto the board like a user edit, then asks for the results again.
    const applyFusion = (fusion: FusionExpanded): void => {
        const sent = shownBoard;
        // Only an answer made for the board shown has the slots to apply (`from` is there in board mode).
        if (!sent || !fusion.from) return;
        const now: Record<BoardZone, Array<number | null>> = {
            hand: slots.hand.map((slot) => cardOf(slot)?.id ?? null),
            monster: slots.monster.map((slot) => cardOf(slot)?.id ?? null),
            spell: slots.spell.map((slot) => cardOf(slot)?.id ?? null),
        };
        const monsterFree = slots.monster.map(
            (slot) => slot.input.value.trim() === "" && slot.savedId === null
        );
        const plan = planFusion(
            {
                from: fusion.from,
                operandIds: [fusion.card1.id, fusion.card2.id],
                resultIsMonster: fusion.result.isMonster,
            },
            sent,
            now,
            monsterFree
        );
        // The board changed since the results were drawn: nothing to apply, the next refresh will redraw.
        if (plan.kind === "stale") return;
        if (plan.kind === "zone-full") {
            applyStatus.textContent = t("calculator.results.zone-full");
            return;
        }
        applyStatus.textContent = "";
        const target = slots[plan.place.zone][plan.place.slot];
        if (!target) return;
        for (const address of plan.clear) {
            const spent = slots[address.zone][address.slot];
            if (spent) emptySlot(spent);
        }
        forgetSlot(target);
        setSlotCard(target, fusion.result);
        persist();
        // The row that had focus is redrawn away. Once the results are back, put the keyboard on the fusions
        // if there are still some to choose, or on the board if not; never take focus the user moved meanwhile.
        void refresh().then(() => {
            if (document.activeElement && document.activeElement !== document.body) return;
            qs<HTMLElement>(resultsPanels.hidden ? "#board-title" : "#fusions-title")?.focus();
        });
    };

    // Puts the saved cards back once the index can name them, and only then lets the page save. A slot the
    // user touched has forgotten its saved card, so nothing typed or cleared meanwhile is overwritten.
    const restoreBoard = (): void => {
        placeLegacyCards();
        for (const slot of allSlots) {
            const name = slot.savedId === null ? undefined : entriesById.get(slot.savedId)?.name;
            slot.savedId = null;
            if (name === undefined) continue;
            slot.input.value = name;
            void updateSlotCard(slot);
        }
        persistReady = true;
        persist();
    };

    // D7: the cards of a v1 hand past its fifth slot go to the monster or the spell/trap zone by kind, in
    // order, into the slots nobody has used. The ones that find no room are named once, in a note.
    const placeLegacyCards = (): void => {
        if (legacyRest.length === 0) return;
        const rest = legacyRest;
        legacyRest = [];
        const free = (zone: BoardZone): number[] =>
            slots[zone].filter((s) => s.savedId === null && s.input.value.trim() === "").map((s) => s.index);
        const placement = placeLegacyRest(rest, (id) => entriesById.get(id)?.isMonster, {
            monster: free("monster"),
            spell: free("spell"),
        });
        for (const zone of ["monster", "spell"] as const) {
            for (const { slot, id } of placement[zone]) {
                const target = slots[zone][slot];
                if (target) target.savedId = id;
            }
        }
        const names = placement.leftover.flatMap((id) => entriesById.get(id)?.name ?? []);
        if (names.length > 0) {
            boardNote.textContent = t("calculator.board.migrated", { cards: names.join(", ") });
            boardNote.hidden = false;
        }
    };

    const createSlot = (zone: BoardZone, index: number, savedId: number | null): SlotState => {
        const label = t(`calculator.slot.${zone}`, { n: index + 1, max: ZONE_SIZE });

        const cell = document.createElement("li");
        cell.className = "board-slot relative min-w-0";
        cell.dataset.zone = zone;

        // Empty state: a sunken tile holding the hint and the input.
        const emptyState = document.createElement("div");
        emptyState.className =
            "slot-empty w-full aspect-[2/3] bg-wb-empty border-2 border-wb-lo border-b-wb-hi border-r-wb-hi " +
            "flex flex-col items-center justify-center gap-1.5 p-1.5 text-wb-mute cursor-text";

        if (SLOT_GLYPHS[zone] !== "") {
            const glyph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            glyph.setAttribute("viewBox", "0 0 18 18");
            glyph.setAttribute("aria-hidden", "true");
            glyph.setAttribute("class", "w-[22px] h-[22px] flex-none fill-none stroke-current stroke-[1.6]");
            glyph.innerHTML = SLOT_GLYPHS[zone];
            emptyState.appendChild(glyph);
        }

        const emptyLabel = document.createElement("span");
        emptyLabel.className = "text-[13px] font-bold font-body text-center leading-tight";
        emptyLabel.textContent = t("calculator.slot.empty");

        // The suggestion list is absolute with no top: its parent must be a block, not the flex column
        // above, or the list opens over the input instead of below it.
        const inputBox = document.createElement("div");
        inputBox.className = "w-full";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "wb-input w-full min-w-0 px-1.5! text-xs font-body";
        input.setAttribute("aria-label", label);

        inputBox.appendChild(input);
        emptyState.appendChild(emptyLabel);
        emptyState.appendChild(inputBox);
        // The whole tile is the field, as the cursor says.
        emptyState.addEventListener("click", (event) => {
            if (!inputBox.contains(event.target as Node)) input.focus();
        });

        // Filled state: the card tile (name strip, art well, stat strip) and its clear "x".
        const filledState = document.createElement("div");
        filledState.className = "slot-filled hidden relative w-full";

        const tile = document.createElement("div");
        tile.className = `${TILE_CLASS} ${TILE_FRAME_CLASS.monster}`;

        const nameLabel = document.createElement("p");
        nameLabel.className =
            "slot-name m-0 h-9 px-1 py-0.5 bg-white/70 font-body font-bold text-xs leading-tight " +
            "[overflow-wrap:anywhere] line-clamp-2";

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

        // A 44px hit area around a 24px ink square, red on hover. It reaches 4px past the tile on a phone and
        // 8px on a desktop, inside the gap between two tiles (8px and 10px).
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className =
            "clear-btn group absolute -top-1 -right-1 min-[480px]:-top-2 min-[480px]:-right-2 z-10 w-11 h-11 " +
            "flex items-start justify-end bg-transparent border-0 p-0 cursor-pointer";
        clearBtn.setAttribute("aria-label", t("calculator.slot.clear", { slot: label, card: "" }));
        const clearMark = document.createElement("span");
        clearMark.className =
            "w-6 h-6 grid place-items-center bg-wb-ink text-white border-2 border-wb-plate " +
            "leading-none font-bold group-hover:bg-wb-red";
        clearMark.setAttribute("aria-hidden", "true");
        clearMark.textContent = "×";
        clearBtn.appendChild(clearMark);

        filledState.appendChild(tile);
        filledState.appendChild(clearBtn);

        // Alert for a name that is invalid, could not be looked up or is of the wrong kind (below both states)
        const message = document.createElement("div");
        message.id = `slot-message-${nextSlotId++}`;
        message.className = "slot-message w-full";

        cell.appendChild(emptyState);
        cell.appendChild(filledState);
        cell.appendChild(message);
        zoneElements[zone].slots.appendChild(cell);

        const state: SlotState = {
            zone,
            index,
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
            label,
            card: null,
            lookup: createLatest(),
            savedId,
        };
        slots[zone].push(state);
        allSlots.push(state);

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
            emptySlot(state);
            void refresh();
            persist();
        });

        return state;
    };

    indexRetryBtn.addEventListener("click", () => void loadIndex());
    // Only after a chain error: the results are not asked for again.
    chainBtn.addEventListener("click", () => void runChainSearch(currentBoard()));

    for (const zone of ZONES) {
        zoneElements[zone].clearBtn.addEventListener("click", () => {
            for (const slot of slots[zone]) emptySlot(slot);
            void refresh();
            persist();
        });
    }

    resetBtn.addEventListener("click", () => {
        refreshLatest.cancel();
        shownKey = null;
        shownBoard = null;
        legacyRest = [];
        boardNote.hidden = true;
        boardNote.textContent = "";
        for (const slot of allSlots) emptySlot(slot);
        updateCounts(currentBoard());
        clearResults();
        setHasAnswer(false);
        chainSection.classList.add("hidden");
        showHint();
        resetChain();
        persist();
    });

    // The slots come back as they were saved; their cards wait for the index (see restoreBoard). Without a
    // v2 board, the hand of an older version supplies the first five slots now and the rest of its cards later.
    const savedBoard = loadBoard() ?? boardFromLegacyHand();
    for (const zone of ZONES) {
        for (let index = 0; index < ZONE_SIZE; index++)
            createSlot(zone, index, savedBoard[zone][index] ?? null);
    }
    updateCounts(currentBoard());
    showHint();
    void loadIndex();

    function boardFromLegacyHand(): ZoneRecord<number | null> {
        const board = emptyZones<number | null>(null);
        const old = loadHand();
        if (old === null) return board;
        const split = splitLegacyHand(old);
        legacyRest = split.rest;
        board.hand = split.hand;
        return board;
    }
}

function wrongKindProblem(zone: BoardZone): SlotProblem {
    return zone === "monster" ? "not-monster" : "not-spell";
}

// Marks the input invalid for an unknown name or a card of the wrong kind; a failed lookup says nothing about
// the name.
function setSlotProblem(slot: SlotState, problem: SlotProblem | null): void {
    clear(slot.message);
    slot.input.removeAttribute("aria-describedby");
    if (problem === "invalid" || problem === "not-monster" || problem === "not-spell") {
        slot.input.setAttribute("aria-invalid", "true");
    } else {
        slot.input.removeAttribute("aria-invalid");
    }
    if (problem === null) return;
    appendAlert(slot.message, t(PROBLEM_KEYS[problem]), SLOT_ALERT_CLASS);
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

// The two board errors the server can answer with have a sentence of their own; anything else gets the
// generic one of the caller.
function describeBoardError(err: unknown, fallbackKey: string): string {
    if (err instanceof ApiError && err.status === 400) {
        if (err.code === "board-too-large") return t("calculator.error.board-too-large", { max: ZONE_SIZE });
        if (err.code === "invalid-zones") return t("calculator.error.invalid-zones");
    }
    return t(fallbackKey);
}

function describeChainError(err: unknown): string {
    return describeBoardError(err, "calculator.chain.error");
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
    onApply: (fusion: FusionExpanded) => void,
    sent: SentBoard
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
            sent,
        })
    );
    where.classList.remove("hidden");
}

// The panel stays on screen whatever the board: with no ritual it says what a ritual needs.
function showRituals(where: HTMLElement, rituals: readonly RitualExpanded[], sent: SentBoard): void {
    if (rituals.length === 0) {
        const none = document.createElement("p");
        none.className = "m-0";
        none.textContent = t("calculator.results.no-rituals");
        where.appendChild(none);
        return;
    }
    for (const ritual of rituals) where.appendChild(renderRitualRow(ritual, sent));
}
