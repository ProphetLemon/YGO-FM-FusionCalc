import { afterEach, describe, expect, it, vi } from "vitest";
import { loadHand, saveHand } from "../../../src/client/lib/hand-storage.js";
import { MIN_HAND_SIZE } from "../../../src/client/lib/slots.js";
import type { StorageLike } from "../../../src/client/lib/storage.js";
import { MAX_HAND_SIZE } from "../../../src/shared/limits.js";

// The key and the shape are what users' browsers hold: changing either drops every saved hand.
const KEY = "ygo-fm-fusioncalc:hand:v1";

class MemoryStorage implements StorageLike {
    readonly items = new Map<string, string>();

    getItem(key: string): string | null {
        return this.items.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.items.set(key, value);
    }
}

function storageHolding(raw: string): MemoryStorage {
    const storage = new MemoryStorage();
    storage.items.set(KEY, raw);
    return storage;
}

function blockedStorage(): StorageLike & { removeItem(key: string): void } {
    const blocked = (): never => {
        throw new DOMException("The operation is insecure.", "SecurityError");
    };
    return { getItem: blocked, setItem: blocked, removeItem: blocked };
}

const noCards = (count: number): null[] => Array.from({ length: count }, () => null);

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("saveHand and loadHand", () => {
    it("bring back the hand that was saved, empty slots included", () => {
        const storage = new MemoryStorage();
        const hand = [2, null, 8, null, null, 13];

        saveHand(hand, storage);

        expect(loadHand(storage)).toEqual(hand);
    });

    it("keep the same card in more than one slot", () => {
        const storage = new MemoryStorage();

        saveHand([1, 1, 1, null, null], storage);

        expect(loadHand(storage)).toEqual([1, 1, 1, null, null]);
    });

    it("save under the versioned key as the ids of the slots in order", () => {
        const storage = new MemoryStorage();

        saveHand([2, null, 8, null, null], storage);

        expect([...storage.items.keys()]).toEqual([KEY]);
        expect(JSON.parse(storage.items.get(KEY) ?? "")).toEqual({ v: 1, slots: [2, null, 8, null, null] });
    });

    it("replace the hand saved before", () => {
        const storage = new MemoryStorage();
        saveHand([2, 8, null, null, null], storage);

        saveHand(noCards(6), storage);

        expect(loadHand(storage)).toEqual(noCards(6));
    });

    it("load nothing when no hand was saved", () => {
        expect(loadHand(new MemoryStorage())).toBeNull();
    });

    it("load a hand whose value has properties they do not know", () => {
        const storage = storageHolding('{"v":1,"slots":[2,null,null,null,null],"saved":"today"}');

        expect(loadHand(storage)).toEqual([2, null, null, null, null]);
    });
});

describe("loadHand with a value that is not a saved hand", () => {
    it.each([
        ["empty", ""],
        ["not JSON", "{not json"],
        ["truncated JSON", '{"v":1,"slots":[2,'],
        ["JSON null", "null"],
        ["a number", "7"],
        ["a string", '"hand"'],
        ["a boolean", "true"],
        ["a JSON array of ids", "[2,8,13,15,1]"],
    ])("ignores it when it is %s", (_label, raw) => {
        expect(loadHand(storageHolding(raw))).toBeNull();
    });

    it.each([
        ["a newer version", '{"v":2,"slots":[2,null,null,null,null]}'],
        ["an older version", '{"v":0,"slots":[2,null,null,null,null]}'],
        ["a version that is a string", '{"v":"1","slots":[2,null,null,null,null]}'],
        ["a version that is a float", '{"v":1.5,"slots":[2,null,null,null,null]}'],
        ["no version", '{"slots":[2,null,null,null,null]}'],
    ])("ignores it when it has %s", (_label, raw) => {
        expect(loadHand(storageHolding(raw))).toBeNull();
    });

    it.each([
        ["no slots", '{"v":1}'],
        ["slots that are null", '{"v":1,"slots":null}'],
        ["slots that are a string", '{"v":1,"slots":"23456"}'],
        ["slots that are an object", '{"v":1,"slots":{"0":2}}'],
        ["a slot that is an array", '{"v":1,"slots":[[2],null,null,null,null]}'],
        ["a slot that is an object", '{"v":1,"slots":[{"id":2},null,null,null,null]}'],
        ["a slot that is a boolean", '{"v":1,"slots":[true,null,null,null,null]}'],
        ["a slot that is a string of digits", '{"v":1,"slots":["2",null,null,null,null]}'],
        ["a slot that is an empty string", '{"v":1,"slots":["",null,null,null,null]}'],
    ])("ignores it when it has %s", (_label, raw) => {
        expect(loadHand(storageHolding(raw))).toBeNull();
    });

    it.each([
        ["a float", "1.5"],
        ["a negative id", "-3"],
        ["zero", "0"],
        ["an id too large for a number", "1e999"],
    ])("ignores the whole hand when one slot holds %s", (_label, id) => {
        const storage = storageHolding(`{"v":1,"slots":[2,${id},8,null,null]}`);

        expect(loadHand(storage)).toBeNull();
    });
});

describe("loadHand and the number of slots", () => {
    it("pads a short hand with empty slots up to the starting size", () => {
        expect(loadHand(storageHolding('{"v":1,"slots":[13]}'))).toEqual([
            13,
            ...noCards(MIN_HAND_SIZE - 1),
        ]);
    });

    it("gives an empty list of slots the starting size", () => {
        expect(loadHand(storageHolding('{"v":1,"slots":[]}'))).toEqual(noCards(MIN_HAND_SIZE));
    });

    it("keeps a hand of the starting size as it is", () => {
        const hand = [1, 2, 3, 4, 5];
        expect(hand).toHaveLength(MIN_HAND_SIZE);

        expect(loadHand(storageHolding(JSON.stringify({ v: 1, slots: hand })))).toEqual(hand);
    });

    it("keeps a hand of the largest size as it is", () => {
        const hand = Array.from({ length: MAX_HAND_SIZE }, (_, i) => i + 1);

        expect(loadHand(storageHolding(JSON.stringify({ v: 1, slots: hand })))).toEqual(hand);
    });

    it("cuts a hand that has more slots than the cap, keeping the first ones", () => {
        const hand = Array.from({ length: MAX_HAND_SIZE + 8 }, (_, i) => i + 1);

        const loaded = loadHand(storageHolding(JSON.stringify({ v: 1, slots: hand })));

        expect(loaded).toHaveLength(MAX_HAND_SIZE);
        expect(loaded).toEqual(hand.slice(0, MAX_HAND_SIZE));
    });

    it("validates the slots it would cut as well", () => {
        const slots = [...noCards(MAX_HAND_SIZE), "not a card"];

        expect(loadHand(storageHolding(JSON.stringify({ v: 1, slots })))).toBeNull();
    });
});

describe("storage that cannot be used", () => {
    it("loads nothing from storage that throws", () => {
        expect(loadHand(blockedStorage())).toBeNull();
    });

    it("does not throw when storage refuses the write", () => {
        expect(() => saveHand([2, null, null, null, null], blockedStorage())).not.toThrow();
    });

    it("does not throw when the storage is full", () => {
        const full: StorageLike = {
            getItem: () => null,
            setItem: () => {
                throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
            },
        };

        expect(() => saveHand([2, null, null, null, null], full)).not.toThrow();
        expect(loadHand(full)).toBeNull();
    });

    it("loads nothing and does not throw when there is no storage", () => {
        expect(loadHand(null)).toBeNull();
        expect(() => saveHand([2, null, null, null, null], null)).not.toThrow();
    });

    it("does not throw when the environment has no window at all", () => {
        expect(loadHand()).toBeNull();
        expect(() => saveHand([2, null, null, null, null])).not.toThrow();
    });
});

describe("the browser's localStorage", () => {
    it("is what a call without storage uses", () => {
        const local = new MemoryStorage();
        vi.stubGlobal("window", { localStorage: local });

        saveHand([2, 8, null, null, null]);

        expect(loadHand()).toEqual([2, 8, null, null, null]);
        expect([...local.items.keys()]).toEqual([KEY]);
    });

    it("is treated as no storage when merely reading it throws", () => {
        vi.stubGlobal("window", {
            get localStorage(): Storage {
                throw new DOMException("The operation is insecure.", "SecurityError");
            },
        });

        expect(loadHand()).toBeNull();
        expect(() => saveHand([2, null, null, null, null])).not.toThrow();
    });

    it("is not confused with sessionStorage", () => {
        const session = new MemoryStorage();
        vi.stubGlobal("window", { localStorage: new MemoryStorage(), sessionStorage: session });

        saveHand([2, 8, null, null, null]);

        expect(session.items.size).toBe(0);
    });
});
