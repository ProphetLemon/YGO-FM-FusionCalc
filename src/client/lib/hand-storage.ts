import { MAX_HAND_SIZE } from "../../shared/limits.js";
import { MIN_HAND_SIZE } from "./slots.js";
import { browserStorage, readJson, writeJson, type StorageLike } from "./storage.js";

// A change to the stored shape needs a new version in the key and in `v`: old values are then ignored.
const HAND_KEY = "ygo-fm-fusioncalc:hand:v1";
const HAND_VERSION = 1;

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

// The saved hand, with as many slots as the page allows; null when nothing usable is saved. Never throws.
export function loadHand(storage: StorageLike | null = browserStorage("localStorage")): SlotIds | null {
    const stored = readJson<unknown>(storage, HAND_KEY);
    if (!isStoredHand(stored)) return null;
    const slots = stored.slots.slice(0, MAX_HAND_SIZE);
    while (slots.length < MIN_HAND_SIZE) slots.push(null);
    return slots;
}

// Best effort: a hand that cannot be saved is not worth breaking the page for. Never throws.
export function saveHand(
    slots: SlotIds,
    storage: StorageLike | null = browserStorage("localStorage")
): void {
    writeJson(storage, HAND_KEY, { v: HAND_VERSION, slots });
}
