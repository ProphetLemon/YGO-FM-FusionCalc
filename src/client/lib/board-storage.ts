import { ZONE_SIZE } from "../../shared/limits.js";
import { isTerrainId, type TerrainId } from "../../shared/terrains.js";
import type { BoardZone } from "../../shared/types.js";
import type { ZoneRecord } from "./board.js";
import type { SlotIds } from "./hand-storage.js";
import { browserStorage, readJson, writeJson, type StorageLike } from "./storage.js";

// A change that old code cannot read needs a new version in the key and in `v`: old values are then ignored.
// The optional `terrain` key was added without one: a value without it means no terrain, and code that does not
// know the key ignores it.
// The v1 key belongs to hand-storage.ts, which only reads it; this page never deletes it.
const BOARD_KEY = "ygo-fm-fusioncalc:board:v2";
const BOARD_VERSION = 2;

export type SavedBoard = ZoneRecord<number | null>;

interface StoredBoard {
    v: typeof BOARD_VERSION;
    hand: Array<number | null>;
    monsters: Array<number | null>;
    spells: Array<number | null>;
    // Only written when a terrain is chosen.
    terrain?: TerrainId;
}

function isSlotId(entry: unknown): entry is number | null {
    return entry === null || (typeof entry === "number" && Number.isInteger(entry) && entry > 0);
}

function isZoneIds(value: unknown): value is Array<number | null> {
    return Array.isArray(value) && value.every(isSlotId);
}

// Storage is user-editable and outlives the code that wrote it, so anything but the exact shape is rejected.
function isStoredBoard(value: unknown): value is StoredBoard {
    if (typeof value !== "object" || value === null) return false;
    const { v, hand, monsters, spells } = value as Record<string, unknown>;
    return v === BOARD_VERSION && isZoneIds(hand) && isZoneIds(monsters) && isZoneIds(spells);
}

// A zone always has ZONE_SIZE slots: a short list is padded with empty slots and a long one cut.
function fitZone(ids: Array<number | null>): Array<number | null> {
    const slots = ids.slice(0, ZONE_SIZE);
    while (slots.length < ZONE_SIZE) slots.push(null);
    return slots;
}

// The saved board; null when nothing usable is saved. Never throws.
export function loadBoard(storage: StorageLike | null = browserStorage("localStorage")): SavedBoard | null {
    const stored = readJson<unknown>(storage, BOARD_KEY);
    if (!isStoredBoard(stored)) return null;
    return { hand: fitZone(stored.hand), monster: fitZone(stored.monsters), spell: fitZone(stored.spells) };
}

// The terrain saved with the board: none when nothing usable is saved, when the value has no `terrain` and when
// the one it has is not one of the six. Never throws.
export function loadTerrain(storage: StorageLike | null = browserStorage("localStorage")): TerrainId | null {
    const stored = readJson<unknown>(storage, BOARD_KEY);
    if (!isStoredBoard(stored)) return null;
    return isTerrainId(stored.terrain) ? stored.terrain : null;
}

// Best effort: a board that cannot be saved is not worth breaking the page for. Never throws. The terrain is
// part of the saved value; without one the key is left out.
export function saveBoard(
    board: Record<BoardZone, SlotIds> & { terrain?: TerrainId | null },
    storage: StorageLike | null = browserStorage("localStorage")
): void {
    const stored: StoredBoard = {
        v: BOARD_VERSION,
        hand: [...board.hand],
        monsters: [...board.monster],
        spells: [...board.spell],
        ...(board.terrain ? { terrain: board.terrain } : {}),
    };
    writeJson(storage, BOARD_KEY, stored);
}

// D7: what a saved v1 hand (5 to 12 slots) becomes on the board.
export interface LegacySplit {
    // The first ZONE_SIZE slots of the old hand, which stay the hand.
    hand: Array<number | null>;
    // The cards of the slots after those, in order: they go to a zone by kind once the index can say which.
    rest: number[];
}

export function splitLegacyHand(slots: SlotIds): LegacySplit {
    const rest = slots.slice(ZONE_SIZE).filter((id): id is number => id !== null);
    return { hand: fitZone([...slots.slice(0, ZONE_SIZE)]), rest };
}

export interface LegacyPlacement {
    // The slot of each zone to fill and the card for it.
    monster: Array<{ slot: number; id: number }>;
    spell: Array<{ slot: number; id: number }>;
    // Cards the zones had no free slot for.
    leftover: number[];
}

// Monsters go to the free monster slots in order and the other cards to the free spell/trap slots in order.
// `isMonster` is undefined for an id the index does not know: such a card cannot be shown, so it is dropped.
export function placeLegacyRest(
    rest: readonly number[],
    isMonster: (id: number) => boolean | undefined,
    free: { monster: readonly number[]; spell: readonly number[] }
): LegacyPlacement {
    const queues = { monster: [...free.monster], spell: [...free.spell] };
    const placement: LegacyPlacement = { monster: [], spell: [], leftover: [] };
    for (const id of rest) {
        const monster = isMonster(id);
        if (monster === undefined) continue;
        const zone = monster ? "monster" : "spell";
        const slot = queues[zone].shift();
        if (slot === undefined) placement.leftover.push(id);
        else placement[zone].push({ slot, id });
    }
    return placement;
}
