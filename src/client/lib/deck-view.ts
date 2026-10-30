// Logic of the best-deck page that needs no DOM: reading a chosen file, the rules the player sets, what the
// request carries, which claim the answer lets the page make, the rows of the stats table and how a failed
// request is told apart.

import type {
    CardIndexEntry,
    DeckLock,
    DeckOptimizeRequest,
    DeckOptimizeResponse,
    DeckStats,
} from "../../shared/types.js";
import { copyLimit } from "../../shared/limits.js";
import { ApiError } from "./api.js";
import { MAX_SAVE_FILE_BYTES, parseFmSaves, type FmSave, type ParseSavesResult } from "./fm-save.js";

export type ReadSaveResult = ParseSavesResult | { ok: false; error: "unreadable" };

// The part of a File the reader uses, so tests need no browser.
export interface SaveFileLike {
    size: number;
    arrayBuffer(): Promise<ArrayBuffer>;
}

// Reads the file in the browser. A file over the limit is refused by its size, before any byte is read.
export async function readSaveFile(file: SaveFileLike): Promise<ReadSaveResult> {
    if (file.size > MAX_SAVE_FILE_BYTES) return { ok: false, error: "too-large" };
    try {
        return parseFmSaves(new Uint8Array(await file.arrayBuffer()));
    } catch {
        return { ok: false, error: "unreadable" };
    }
}

export interface SaveSummary {
    deckCards: number;
    // Spare cards counting every copy, and how many different cards they are.
    spareCards: number;
    spareKinds: number;
}

export function summarizeSave(save: FmSave): SaveSummary {
    return {
        deckCards: save.deck.length,
        spareCards: save.trunk.reduce((total, entry) => total + entry.count, 0),
        spareKinds: save.trunk.length,
    };
}

export type CardLookup = ReadonlyMap<number, CardIndexEntry>;

// Which slots of the deck start locked: every card that is not a monster. The player unlocks the ones they
// would let the optimiser replace.
export function defaultLocks(deck: readonly number[], cards: CardLookup): boolean[] {
    return deck.map((id) => cards.get(id)?.isMonster === false);
}

// The locked slots as the request states them: how many copies of each card must stay.
export function lockedCards(deck: readonly number[], locked: readonly boolean[]): DeckLock[] {
    const counts = new Map<number, number>();
    deck.forEach((id, slot) => {
        if (locked[slot]) counts.set(id, (counts.get(id) ?? 0) + 1);
    });
    return [...counts].map(([id, count]) => ({ id, count }));
}

// Which slots of the recommended deck are the locked copies. Copies of a card are identical, so a lock of n
// copies marks the first n copies of that card.
export function markLockedSlots(deck: readonly { id: number }[], locked: readonly DeckLock[]): boolean[] {
    const left = new Map(locked.map(({ id, count }) => [id, count]));
    return deck.map(({ id }) => {
        const remaining = left.get(id) ?? 0;
        if (remaining === 0) return false;
        left.set(id, remaining - 1);
        return true;
    });
}

// Which slots of the recommended deck are the added copies: the copies that come after the locked ones of the
// same card, since adding a copy locks every copy the deck already holds.
export function markAddedSlots(
    deck: readonly { id: number }[],
    locked: readonly DeckLock[],
    added: readonly DeckLock[]
): boolean[] {
    const skip = new Map(locked.map(({ id, count }) => [id, count]));
    const left = new Map(added.map(({ id, count }) => [id, count]));
    return deck.map(({ id }) => {
        const toSkip = skip.get(id) ?? 0;
        if (toSkip > 0) {
            skip.set(id, toSkip - 1);
            return false;
        }
        const remaining = left.get(id) ?? 0;
        if (remaining === 0) return false;
        left.set(id, remaining - 1);
        return true;
    });
}

// What the player asked for. A rule never lives next to one it contradicts: the transitions below keep them
// apart, the newest rule winning.
export interface DeckRules {
    // The lock of each slot of the deck.
    locked: readonly boolean[];
    // Copies taken from the trunk, per card.
    added: ReadonlyMap<number, number>;
    // Cards that may not be in the answer, whether the deck holds them or not.
    forbidden: readonly number[];
}

export function defaultRules(deck: readonly number[], cards: CardLookup): DeckRules {
    return { locked: defaultLocks(deck, cards), added: new Map(), forbidden: [] };
}

function without(added: ReadonlyMap<number, number>, id: number): ReadonlyMap<number, number> {
    const next = new Map(added);
    next.delete(id);
    return next;
}

// Locking a copy of a forbidden card lifts the ban; unlocking one drops the copies added to that card, since
// those only meant something while every copy of the deck stayed.
export function toggleLock(rules: DeckRules, deck: readonly number[], slot: number): DeckRules {
    const id = deck[slot];
    if (id === undefined) return rules;
    const locked = [...rules.locked];
    locked[slot] = !rules.locked[slot];
    if (locked[slot]) return { ...rules, locked, forbidden: rules.forbidden.filter((card) => card !== id) };
    return { ...rules, locked, added: without(rules.added, id) };
}

// Forbidding a card lets go of every lock and added copy it had. Lifting the ban changes nothing else.
export function toggleForbid(rules: DeckRules, deck: readonly number[], id: number): DeckRules {
    if (rules.forbidden.includes(id))
        return { ...rules, forbidden: rules.forbidden.filter((c) => c !== id) };
    return {
        locked: rules.locked.map((isLocked, slot) => (deck[slot] === id ? false : isLocked)),
        added: without(rules.added, id),
        forbidden: [...rules.forbidden, id],
    };
}

function copiesIn(deck: readonly number[], id: number): number {
    return deck.filter((card) => card === id).length;
}

function addedTotal(rules: DeckRules): number {
    let total = 0;
    for (const count of rules.added.values()) total += count;
    return total;
}

// Another copy fits when the card has a spare one under its copy limit, and when the cards the answer must
// hold, counting this one, still fit in the deck.
export function canAdd(rules: DeckRules, save: FmSave, id: number): boolean {
    const inDeck = copiesIn(save.deck, id);
    const owned = inDeck + (save.trunk.find((entry) => entry.id === id)?.count ?? 0);
    if ((rules.added.get(id) ?? 0) >= copyLimit(owned, inDeck) - inDeck) return false;
    const lockedNow = rules.locked.filter(Boolean).length;
    // Adding locks the copies of this card that the deck holds and has not locked yet.
    const toLock = save.deck.filter((card, slot) => card === id && !rules.locked[slot]).length;
    return lockedNow + addedTotal(rules) + toLock + 1 <= save.deck.length;
}

export function addCopy(rules: DeckRules, save: FmSave, id: number): DeckRules {
    if (!canAdd(rules, save, id)) return rules;
    return {
        locked: rules.locked.map((isLocked, slot) => save.deck[slot] === id || isLocked),
        added: new Map(rules.added).set(id, (rules.added.get(id) ?? 0) + 1),
        forbidden: rules.forbidden.filter((card) => card !== id),
    };
}

// The deck copies that adding locked stay locked, so the player sees them and can let them go.
export function removeCopy(rules: DeckRules, id: number): DeckRules {
    const count = rules.added.get(id) ?? 0;
    if (count === 0) return rules;
    if (count === 1) return { ...rules, added: without(rules.added, id) };
    return { ...rules, added: new Map(rules.added).set(id, count - 1) };
}

export function addedCards(rules: DeckRules): DeckLock[] {
    return [...rules.added].map(([id, count]) => ({ id, count }));
}

// The copies the answer must hold: the locked slots of the deck, and on top of them the copies added.
export function requiredCards(deck: readonly number[], rules: DeckRules): DeckLock[] {
    const counts = new Map(lockedCards(deck, rules.locked).map(({ id, count }) => [id, count]));
    for (const [id, count] of rules.added) counts.set(id, (counts.get(id) ?? 0) + count);
    return [...counts].map(([id, count]) => ({ id, count }));
}

export interface SpareRow {
    card: CardIndexEntry;
    count: number;
}

// The trunk with its cards: monsters first, strongest ATK first, then the other cards by name. A card the
// catalog does not know is left out, since there is nothing to show of it.
export function spareRows(save: FmSave, cards: CardLookup): SpareRow[] {
    const rows: SpareRow[] = [];
    for (const { id, count } of save.trunk) {
        const card = cards.get(id);
        if (card) rows.push({ card, count });
    }
    return rows.sort((a, b) => {
        if (a.card.isMonster !== b.card.isMonster) return a.card.isMonster ? -1 : 1;
        if (a.card.isMonster && a.card.attack !== b.card.attack) return b.card.attack - a.card.attack;
        return a.card.name.localeCompare(b.card.name);
    });
}

// The request is built field by field, so nothing else of the save (and never the player name) can leak into
// what is sent: only card ids and counts. The page sets the rules card by card, so it never asks to keep every
// non-monster as a group.
export function buildDeckRequest(save: FmSave, rules: DeckRules): DeckOptimizeRequest {
    return {
        deck: [...save.deck],
        trunk: save.trunk.map(({ id, count }) => ({ id, count })),
        keepNonMonsters: false,
        locked: requiredCards(save.deck, rules),
        forbidden: [...rules.forbidden],
    };
}

export type VerdictClaim = "certified" | "certified-rules" | "local" | "local-rules" | "truncated";

export interface Verdict {
    claim: VerdictClaim;
    // True when the answer holds no swap, so the page also says the current deck needs no change.
    noSwaps: boolean;
}

// What the page may say about the recommended deck. The weakest claim the answer allows wins: a search that
// ran out of time says so even when the answer also carries the flag of a certified deck. With any rule the
// claim is about the decks that obey them, not about every deck.
export function verdictOf(
    answer: Pick<DeckOptimizeResponse, "certified" | "truncated" | "swaps">,
    hasRules: boolean
): Verdict {
    const noSwaps = answer.swaps.length === 0;
    if (answer.truncated) return { claim: "truncated", noSwaps };
    if (answer.certified) return { claim: hasRules ? "certified-rules" : "certified", noSwaps };
    return { claim: hasRules ? "local-rules" : "local", noSwaps };
}

export type StatKey = "averageBestAtk" | "share1500" | "share2000" | "shareDead";
export type StatDirection = "better" | "worse" | "same";

export interface StatRow {
    key: StatKey;
    // A share is a fraction from 0 to 1 and is shown as a percentage.
    unit: "atk" | "percent";
    current: number;
    recommended: number;
    // Recommended minus current, in the unit shown: ATK, or percentage points for a share.
    delta: number;
    direction: StatDirection;
}

const STAT_ROWS: ReadonlyArray<{ key: StatKey; unit: StatRow["unit"]; lowerIsBetter: boolean }> = [
    { key: "averageBestAtk", unit: "atk", lowerIsBetter: false },
    { key: "share1500", unit: "percent", lowerIsBetter: false },
    { key: "share2000", unit: "percent", lowerIsBetter: false },
    { key: "shareDead", unit: "percent", lowerIsBetter: true },
];

// Both stats and the change are shown with one decimal, so a change that rounds to zero there is "same".
const SHOWN_DECIMALS = 1;

function round(value: number): number {
    const factor = 10 ** SHOWN_DECIMALS;
    return Math.round(value * factor) / factor;
}

export function statRows(current: DeckStats, recommended: DeckStats): StatRow[] {
    return STAT_ROWS.map(({ key, unit, lowerIsBetter }) => {
        const scale = unit === "percent" ? 100 : 1;
        const from = current[key] * scale;
        const to = recommended[key] * scale;
        const delta = round(to - from);
        let direction: StatDirection = "same";
        if (delta !== 0) direction = delta > 0 !== lowerIsBetter ? "better" : "worse";
        return { key, unit, current: from, recommended: to, delta, direction };
    });
}

// True when the player's rules left the recommended deck with a lower average than the deck they have.
export function lowersAverage(current: DeckStats, recommended: DeckStats): boolean {
    return statRows(current, recommended)[0]?.direction === "worse";
}

// A number as the player reads it in their language: one decimal, with the sign when `signed`. A negative
// number gets the real minus sign, which a screen reader says as "minus" and a hyphen is not.
export function formatNumber(value: number, locale: string, signed = false): string {
    return new Intl.NumberFormat(locale, {
        minimumFractionDigits: SHOWN_DECIMALS,
        maximumFractionDigits: SHOWN_DECIMALS,
        signDisplay: signed ? "exceptZero" : "auto",
    })
        .format(value)
        .replace("-", "\u2212");
}

export type DeckFailureKind = "rejected" | "impossible" | "busy" | "failed";

export interface DeckFailure {
    kind: DeckFailureKind;
    // For "busy": seconds to wait before asking again.
    retryAfter?: number;
}

// Used when the server did not say how long to wait, and the longest wait the page accepts.
const DEFAULT_RETRY_SECONDS = 5;
const MAX_RETRY_SECONDS = 60;

// Retry-After is either a whole number of seconds or a date; only the first is read, since the server
// sends seconds. Anything else falls back to the default.
export function parseRetryAfter(header: string | undefined): number {
    if (header === undefined || !/^\d+$/.test(header.trim())) return DEFAULT_RETRY_SECONDS;
    return Math.min(Math.max(Number(header), 1), MAX_RETRY_SECONDS);
}

// A 400 or 413 means the server looked at the deck and refused it, and "impossible-deck" says the rules are
// the reason, so asking again cannot help; 503 "busy" asks to wait; anything else, including a connection
// that never answered, is a failure worth trying again.
export function classifyDeckFailure(error: unknown): DeckFailure {
    if (error instanceof ApiError) {
        if (error.status === 503 && error.code === "busy") {
            return { kind: "busy", retryAfter: parseRetryAfter(error.retryAfter) };
        }
        if (error.status === 400 && error.code === "impossible-deck") return { kind: "impossible" };
        if (error.status === 400 || error.status === 413) return { kind: "rejected" };
    }
    return { kind: "failed" };
}
