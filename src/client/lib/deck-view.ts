// Logic of the best-deck page that needs no DOM: reading a chosen file, what the request carries, which claim
// the answer lets the page make, the rows of the stats table and how a failed request is told apart.

import type {
    CardIndexEntry,
    DeckLock,
    DeckOptimizeRequest,
    DeckOptimizeResponse,
    DeckStats,
} from "../../shared/types.js";
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
// what is sent: only card ids and counts. The page locks cards one by one, so it never asks to keep every
// non-monster as a group.
export function buildDeckRequest(save: FmSave, locked: readonly DeckLock[]): DeckOptimizeRequest {
    return {
        deck: [...save.deck],
        trunk: save.trunk.map(({ id, count }) => ({ id, count })),
        keepNonMonsters: false,
        locked: locked.map(({ id, count }) => ({ id, count })),
    };
}

export type VerdictClaim = "certified" | "certified-locked" | "local" | "truncated";

export interface Verdict {
    claim: VerdictClaim;
    // True when the answer holds no swap, so the page also says the current deck needs no change.
    noSwaps: boolean;
}

// What the page may say about the recommended deck. The weakest claim the answer allows wins: a search that
// ran out of time says so even when the answer also carries the flag of a certified deck.
export function verdictOf(
    answer: Pick<DeckOptimizeResponse, "certified" | "truncated" | "swaps">,
    hasLocks: boolean
): Verdict {
    const noSwaps = answer.swaps.length === 0;
    if (answer.truncated) return { claim: "truncated", noSwaps };
    if (answer.certified) return { claim: hasLocks ? "certified-locked" : "certified", noSwaps };
    return { claim: "local", noSwaps };
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

// A number as the player reads it in their language: one decimal, with the sign when `signed`.
export function formatNumber(value: number, locale: string, signed = false): string {
    return new Intl.NumberFormat(locale, {
        minimumFractionDigits: SHOWN_DECIMALS,
        maximumFractionDigits: SHOWN_DECIMALS,
        signDisplay: signed ? "exceptZero" : "auto",
    }).format(value);
}

export type DeckFailureKind = "rejected" | "busy" | "failed";

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

// A 400 or 413 means the server looked at the deck and refused it; 503 "busy" asks to wait; anything else,
// including a connection that never answered, is a failure worth trying again.
export function classifyDeckFailure(error: unknown): DeckFailure {
    if (error instanceof ApiError) {
        if (error.status === 503 && error.code === "busy") {
            return { kind: "busy", retryAfter: parseRetryAfter(error.retryAfter) };
        }
        if (error.status === 400 || error.status === 413) return { kind: "rejected" };
    }
    return { kind: "failed" };
}
