import { describe, expect, it } from "vitest";
import {
    loadBoard,
    placeLegacyRest,
    saveBoard,
    splitLegacyHand,
} from "../../../src/client/lib/board-storage.js";
import type { StorageLike } from "../../../src/client/lib/storage.js";

// The key and the shape are what users' browsers hold: changing either drops every saved board.
const KEY = "ygo-fm-fusioncalc:board:v2";

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

const blocked = (): never => {
    throw new DOMException("The operation is insecure.", "SecurityError");
};

const none = (): null[] => [null, null, null, null, null];
const stored = (hand: unknown, monsters: unknown, spells: unknown, v: unknown = 2): string =>
    JSON.stringify({ v, hand, monsters, spells });

describe("saveBoard and loadBoard", () => {
    it("bring back the board that was saved, empty slots included", () => {
        const storage = new MemoryStorage();
        const board = {
            hand: [2, null, 8, null, null],
            monster: [3, 4, null, null, null],
            spell: [null, null, null, null, 9],
        };

        saveBoard(board, storage);

        expect(loadBoard(storage)).toEqual(board);
    });

    it("save under the v2 key as { v, hand, monsters, spells }", () => {
        const storage = new MemoryStorage();

        saveBoard(
            { hand: [2, null, null, null, null], monster: none(), spell: [null, null, null, null, 9] },
            storage
        );

        expect([...storage.items.keys()]).toEqual([KEY]);
        expect(JSON.parse(storage.items.get(KEY) ?? "")).toEqual({
            v: 2,
            hand: [2, null, null, null, null],
            monsters: none(),
            spells: [null, null, null, null, 9],
        });
    });

    it("do not touch the v1 key", () => {
        const storage = new MemoryStorage();
        storage.items.set("ygo-fm-fusioncalc:hand:v1", '{"v":1,"slots":[2,null,null,null,null]}');

        saveBoard({ hand: none(), monster: none(), spell: none() }, storage);

        expect(storage.items.get("ygo-fm-fusioncalc:hand:v1")).toBe(
            '{"v":1,"slots":[2,null,null,null,null]}'
        );
    });

    it("replace the board saved before", () => {
        const storage = new MemoryStorage();
        saveBoard({ hand: [2, 8, null, null, null], monster: none(), spell: none() }, storage);

        saveBoard({ hand: none(), monster: [3, null, null, null, null], spell: none() }, storage);

        expect(loadBoard(storage)).toEqual({
            hand: none(),
            monster: [3, null, null, null, null],
            spell: none(),
        });
    });

    it("load nothing when no board was saved", () => {
        expect(loadBoard(new MemoryStorage())).toBeNull();
    });

    it("load a board whose value has properties they do not know", () => {
        const storage = storageHolding(
            '{"v":2,"hand":[2,null,null,null,null],"monsters":[null,null,null,null,null],"spells":[null,null,null,null,null],"at":"today"}'
        );

        expect(loadBoard(storage)).toEqual({
            hand: [2, null, null, null, null],
            monster: none(),
            spell: none(),
        });
    });
});

describe("loadBoard and the number of slots", () => {
    it("pads a short zone with empty slots", () => {
        const loaded = loadBoard(storageHolding(stored([2], [], [null, 9])));

        expect(loaded).toEqual({
            hand: [2, null, null, null, null],
            monster: none(),
            spell: [null, 9, null, null, null],
        });
    });

    it("cuts a long zone to five slots, keeping the first ones", () => {
        const loaded = loadBoard(storageHolding(stored([1, 2, 3, 4, 5, 6, 7], none(), none())));

        expect(loaded?.hand).toEqual([1, 2, 3, 4, 5]);
    });
});

describe("loadBoard with a value that is not a saved board", () => {
    it.each([
        ["empty", ""],
        ["not JSON", "{not json"],
        ["JSON null", "null"],
        ["a number", "7"],
        ["a string", '"board"'],
        ["a JSON array", "[1,2,3]"],
    ])("ignores it when it is %s", (_label, raw) => {
        expect(loadBoard(storageHolding(raw))).toBeNull();
    });

    it.each([
        ["version 1", 1],
        ["version 3", 3],
        ["a version that is a string", "2"],
        ["a version that is a float", 2.5],
        ["a version that is null", null],
    ])("ignores it when it has %s", (_label, v) => {
        expect(loadBoard(storageHolding(stored(none(), none(), none(), v)))).toBeNull();
    });

    it.each([
        ["a missing zone", '{"v":2,"hand":[null],"monsters":[null]}'],
        ["a zone that is null", stored(null, none(), none())],
        ["a zone that is a string", stored("23456", none(), none())],
        ["a zone that is an object", stored({ 0: 2 }, none(), none())],
        ["a slot that is an array", stored(none(), [[3], null, null, null, null], none())],
        ["a slot that is a string of digits", stored(none(), none(), ["9", null, null, null, null])],
        ["a slot that is a boolean", stored([true, null, null, null, null], none(), none())],
    ])("ignores it when it has %s", (_label, raw) => {
        expect(loadBoard(storageHolding(raw))).toBeNull();
    });

    it.each([
        ["a float", 1.5],
        ["a negative id", -3],
        ["zero", 0],
    ])("ignores the whole board when one slot holds %s", (_label, id) => {
        expect(loadBoard(storageHolding(stored([2, id, null, null, null], none(), none())))).toBeNull();
    });

    it("validates the slots past the fifth as well", () => {
        expect(
            loadBoard(storageHolding(stored([null, null, null, null, null, "x"], none(), none())))
        ).toBeNull();
    });
});

describe("storage that cannot be used", () => {
    it("loads nothing from storage that throws", () => {
        expect(loadBoard({ getItem: blocked, setItem: blocked })).toBeNull();
    });

    it("does not throw when storage refuses the write", () => {
        const board = { hand: none(), monster: none(), spell: none() };

        expect(() => saveBoard(board, { getItem: blocked, setItem: blocked })).not.toThrow();
    });

    it("does not throw when the storage is full", () => {
        const full: StorageLike = {
            getItem: () => null,
            setItem: () => {
                throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
            },
        };

        expect(() => saveBoard({ hand: none(), monster: none(), spell: none() }, full)).not.toThrow();
    });

    it("loads nothing and does not throw when there is no storage", () => {
        expect(loadBoard(null)).toBeNull();
        expect(() => saveBoard({ hand: none(), monster: none(), spell: none() }, null)).not.toThrow();
    });

    it("does not throw when the environment has no window at all", () => {
        expect(loadBoard()).toBeNull();
        expect(() => saveBoard({ hand: none(), monster: none(), spell: none() })).not.toThrow();
    });
});

describe("splitLegacyHand", () => {
    it("keeps the first five slots as the hand, empty slots in place", () => {
        const split = splitLegacyHand([2, null, 8, null, 13]);

        expect(split.hand).toEqual([2, null, 8, null, 13]);
        expect(split.rest).toEqual([]);
    });

    it("moves the cards past the fifth slot to the rest, in order, without the empty slots", () => {
        const split = splitLegacyHand([1, 2, 3, 4, 5, 6, null, 8, null, 10]);

        expect(split.hand).toEqual([1, 2, 3, 4, 5]);
        expect(split.rest).toEqual([6, 8, 10]);
    });

    it("pads a hand shorter than five slots", () => {
        expect(splitLegacyHand([2, 8]).hand).toEqual([2, 8, null, null, null]);
    });
});

describe("placeLegacyRest", () => {
    const kinds = new Map<number, boolean>([
        [1, true],
        [2, true],
        [3, true],
        [7, false],
        [8, false],
    ]);
    const isMonster = (id: number): boolean | undefined => kinds.get(id);
    const allFree = { monster: [0, 1, 2, 3, 4], spell: [0, 1, 2, 3, 4] };

    it("sends monsters to the monster zone and the rest to the spell/trap zone, in order", () => {
        const placement = placeLegacyRest([1, 7, 2, 8], isMonster, allFree);

        expect(placement.monster).toEqual([
            { slot: 0, id: 1 },
            { slot: 1, id: 2 },
        ]);
        expect(placement.spell).toEqual([
            { slot: 0, id: 7 },
            { slot: 1, id: 8 },
        ]);
        expect(placement.leftover).toEqual([]);
    });

    it("uses only the free slots it is given", () => {
        const placement = placeLegacyRest([1, 2, 7], isMonster, { monster: [1, 4], spell: [3] });

        expect(placement.monster).toEqual([
            { slot: 1, id: 1 },
            { slot: 4, id: 2 },
        ]);
        expect(placement.spell).toEqual([{ slot: 3, id: 7 }]);
    });

    it("lists the cards that find no room, in order", () => {
        const placement = placeLegacyRest([1, 2, 3, 7, 8], isMonster, { monster: [0], spell: [2] });

        expect(placement.monster).toEqual([{ slot: 0, id: 1 }]);
        expect(placement.spell).toEqual([{ slot: 2, id: 7 }]);
        expect(placement.leftover).toEqual([2, 3, 8]);
    });

    it("lists everything when the zones are full", () => {
        const placement = placeLegacyRest([1, 7], isMonster, { monster: [], spell: [] });

        expect(placement.leftover).toEqual([1, 7]);
    });

    it("drops a card the index does not know", () => {
        const placement = placeLegacyRest([99, 1], isMonster, allFree);

        expect(placement.monster).toEqual([{ slot: 0, id: 1 }]);
        expect(placement.leftover).toEqual([]);
    });

    it("places nothing for nothing", () => {
        expect(placeLegacyRest([], isMonster, allFree)).toEqual({ monster: [], spell: [], leftover: [] });
    });
});
