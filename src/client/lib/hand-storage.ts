import { MAX_HAND_SIZE } from "../../shared/limits.js";
import { browserStorage, readJson, type StorageLike } from "./storage.js";

// The hand of before the board: 5 to 12 slots under the v1 key. The page no longer writes it and never
// deletes it, so a hand saved by an older version can be read once and moved onto the board (D7).
const HAND_KEY = "ygo-fm-fusioncalc:hand:v1";
const HAND_VERSION = 1;
const MIN_HAND_SLOTS = 5;

// One entry per slot, in slot order: the id of the card in it, or null while it is empty.
export type SlotIds = ReadonlyArray<number | null>;

interface StoredHand {
    v: typeof HAND_VERSION;
    slots: Array<number | null>;
}

function isSlotId(entry: unknown): entry is number | null {
    return entry === null || (typeof entry === "number" && Number.isInteger(entry) && entry > 0);
}

// Storage is user-editable and outlives the code that wrote it, so anything but the exact shape is rejected.
function isStoredHand(value: unknown): value is StoredHand {
    if (typeof value !== "object" || value === null) return false;
    const { v, slots } = value as { v?: unknown; slots?: unknown };
    return v === HAND_VERSION && Array.isArray(slots) && slots.every(isSlotId);
}

// The old hand, with the slots it had when saved (5 to 12); null when nothing usable is saved. Never throws.
export function loadHand(storage: StorageLike | null = browserStorage("localStorage")): SlotIds | null {
    const stored = readJson<unknown>(storage, HAND_KEY);
    if (!isStoredHand(stored)) return null;
    const slots = stored.slots.slice(0, MAX_HAND_SIZE);
    while (slots.length < MIN_HAND_SLOTS) slots.push(null);
    return slots;
}
