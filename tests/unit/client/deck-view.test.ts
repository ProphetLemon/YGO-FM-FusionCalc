import { describe, expect, it } from "vitest";
import { ApiError } from "../../../src/client/lib/api.js";
import {
    addCopy,
    addedCards,
    buildDeckRequest,
    canAdd,
    classifyDeckFailure,
    defaultLocks,
    defaultRules,
    formatNumber,
    lockedCards,
    lowersAverage,
    markAddedSlots,
    markLockedSlots,
    parseRetryAfter,
    readSaveFile,
    removeCopy,
    requiredCards,
    spareRows,
    statRows,
    summarizeSave,
    toggleForbid,
    toggleLock,
    verdictOf,
    type CardLookup,
    type DeckRules,
} from "../../../src/client/lib/deck-view.js";
import { MAX_SAVE_FILE_BYTES, type FmSave } from "../../../src/client/lib/fm-save.js";
import type { CardIndexEntry, DeckStats } from "../../../src/shared/types.js";

const SAVE: FmSave = {
    deck: Array.from({ length: 40 }, (_, i) => i + 1),
    trunk: [
        { id: 100, count: 2 },
        { id: 200, count: 1 },
    ],
};

function fileOf(bytes: Uint8Array): { size: number; arrayBuffer(): Promise<ArrayBuffer> } {
    return {
        size: bytes.length,
        arrayBuffer: async () =>
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    };
}

describe("readSaveFile", () => {
    it("refuses a file over the limit without reading it", async () => {
        let read = false;
        const file = {
            size: MAX_SAVE_FILE_BYTES + 1,
            arrayBuffer: async () => {
                read = true;
                return new ArrayBuffer(0);
            },
        };

        await expect(readSaveFile(file)).resolves.toEqual({ ok: false, error: "too-large" });
        expect(read).toBe(false);
    });

    it("says not-a-save for a file that holds no save", async () => {
        await expect(readSaveFile(fileOf(new Uint8Array(100)))).resolves.toEqual({
            ok: false,
            error: "not-a-save",
        });
    });

    it("says unreadable when the browser cannot read the file", async () => {
        const file = { size: 10, arrayBuffer: () => Promise.reject(new Error("denied")) };

        await expect(readSaveFile(file)).resolves.toEqual({ ok: false, error: "unreadable" });
    });

    it("finds the saves of a file that has them", async () => {
        const block = new Uint8Array(0x2000);
        block[0] = 0x53;
        block[1] = 0x43;
        const view = new DataView(block.buffer);
        for (let i = 0; i < 40; i++) view.setUint16(0x200 + i * 2, i + 1, true);
        block[0x250 + 99] = 3;

        const result = await readSaveFile(fileOf(block));

        expect(result).toEqual({
            ok: true,
            saves: [{ deck: SAVE.deck, trunk: [{ id: 100, count: 3 }] }],
        });
    });
});

describe("summarizeSave", () => {
    it("counts the deck, every spare copy and the different spare cards", () => {
        expect(summarizeSave(SAVE)).toEqual({ deckCards: 40, spareCards: 3, spareKinds: 2 });
    });

    it("counts an empty trunk as nothing", () => {
        expect(summarizeSave({ ...SAVE, trunk: [] })).toEqual({
            deckCards: 40,
            spareCards: 0,
            spareKinds: 0,
        });
    });
});

function entry(id: number, over: Partial<CardIndexEntry> = {}): CardIndexEntry {
    return {
        id,
        name: `Card ${id}`,
        type: 0,
        typeName: "Dragon",
        attack: 1000,
        defense: 1000,
        imageCode: null,
        isMonster: true,
        ...over,
    };
}

const NO_RULES: DeckRules = { locked: SAVE.deck.map(() => false), added: new Map(), forbidden: [] };

describe("buildDeckRequest", () => {
    it("carries only the deck, the trunk and the rules, and never asks to keep every non-monster", () => {
        const withExtra = { ...SAVE, name: "PLAYER", trunk: [{ id: 100, count: 2, name: "x" }] };
        const rules: DeckRules = {
            locked: SAVE.deck.map((id) => id === 3),
            added: new Map([[100, 1]]),
            forbidden: [7],
        };

        const request = buildDeckRequest(withExtra as FmSave, rules);

        expect(request).toEqual({
            deck: SAVE.deck,
            trunk: [{ id: 100, count: 2 }],
            keepNonMonsters: false,
            locked: [
                { id: 3, count: 1 },
                { id: 100, count: 1 },
            ],
            forbidden: [7],
        });
        expect(Object.keys(request).sort()).toEqual([
            "deck",
            "forbidden",
            "keepNonMonsters",
            "locked",
            "trunk",
        ]);
        expect(JSON.stringify(request)).not.toContain("PLAYER");
    });

    it("sends locked and forbidden even when there are none", () => {
        const request = buildDeckRequest(SAVE, NO_RULES);
        expect(request.locked).toEqual([]);
        expect(request.forbidden).toEqual([]);
    });

    it("copies the arrays, so the save cannot change under a request", () => {
        const rules: DeckRules = { ...NO_RULES, locked: SAVE.deck.map((id) => id === 3), forbidden: [7] };
        const request = buildDeckRequest(SAVE, rules);
        request.deck[0] = 999;
        request.locked![0]!.count = 9;
        request.forbidden![0] = 1;
        expect(SAVE.deck[0]).toBe(1);
        expect(requiredCards(SAVE.deck, rules)[0]?.count).toBe(1);
        expect(rules.forbidden).toEqual([7]);
    });
});

describe("defaultLocks", () => {
    const cards: CardLookup = new Map([
        [1, entry(1)],
        [2, entry(2, { isMonster: false, typeName: "Magic" })],
        [3, entry(3, { isMonster: false, typeName: "Equip" })],
    ]);

    it("locks every slot that holds a non-monster and leaves the monsters free", () => {
        expect(defaultLocks([1, 2, 1, 3], cards)).toEqual([false, true, false, true]);
    });

    it("leaves a card the catalog does not know unlocked", () => {
        expect(defaultLocks([9], cards)).toEqual([false]);
    });
});

describe("lockedCards", () => {
    it("counts the copies locked of each card, in the order they first appear", () => {
        const deck = [5, 7, 5, 5, 7];

        expect(lockedCards(deck, [true, false, true, false, true])).toEqual([
            { id: 5, count: 2 },
            { id: 7, count: 1 },
        ]);
    });

    it("is empty when nothing is locked", () => {
        expect(lockedCards([5, 7], [false, false])).toEqual([]);
    });
});

describe("markLockedSlots", () => {
    it("marks as many copies of a card as were locked", () => {
        const deck = [{ id: 5 }, { id: 7 }, { id: 5 }, { id: 5 }];

        expect(markLockedSlots(deck, [{ id: 5, count: 2 }])).toEqual([true, false, true, false]);
    });

    it("marks nothing without locks", () => {
        expect(markLockedSlots([{ id: 5 }], [])).toEqual([false]);
    });
});

describe("spareRows", () => {
    const cards: CardLookup = new Map([
        [1, entry(1, { name: "Weak", attack: 500 })],
        [2, entry(2, { name: "Strong", attack: 3000 })],
        [3, entry(3, { name: "Alpha", attack: 500 })],
        [4, entry(4, { name: "Zed spell", isMonster: false, typeName: "Magic", attack: 0 })],
        [5, entry(5, { name: "Axe", isMonster: false, typeName: "Equip", attack: 0 })],
    ]);
    const trunk = (ids: number[]) => ({
        deck: [],
        trunk: ids.map((id) => ({ id, count: id })),
    });

    it("puts monsters first by ATK, then the other cards by name", () => {
        const rows = spareRows(trunk([4, 1, 5, 2, 3]), cards);

        expect(rows.map((row) => row.card.name)).toEqual(["Strong", "Alpha", "Weak", "Axe", "Zed spell"]);
        expect(rows.map((row) => row.count)).toEqual([2, 3, 1, 5, 4]);
    });

    it("leaves out a card the catalog does not know", () => {
        expect(spareRows(trunk([1, 99]), cards)).toHaveLength(1);
    });
});

describe("verdictOf", () => {
    const swaps = [{}] as never[];

    it.each([
        ["certified without rules", { certified: true, truncated: false, swaps }, false, "certified"],
        ["certified with rules", { certified: true, truncated: false, swaps }, true, "certified-rules"],
        ["a local search that finished", { certified: false, truncated: false, swaps }, false, "local"],
        [
            "a local search that finished under rules",
            { certified: false, truncated: false, swaps },
            true,
            "local-rules",
        ],
        ["a search that ran out of time", { certified: false, truncated: true, swaps }, true, "truncated"],
        [
            "an answer that is both certified and truncated",
            { certified: true, truncated: true, swaps },
            false,
            "truncated",
        ],
    ] as const)("%s says %s", (_label, answer, rules, claim) => {
        expect(verdictOf(answer, rules)).toEqual({ claim, noSwaps: false });
    });

    it("marks an answer without swaps", () => {
        expect(verdictOf({ certified: false, truncated: false, swaps: [] }, true)).toEqual({
            claim: "local-rules",
            noSwaps: true,
        });
    });
});

describe("statRows", () => {
    const current: DeckStats = {
        averageBestAtk: 1316.29,
        share1500: 0.3313,
        share2000: 0.1199,
        shareDead: 0.281,
    };
    const recommended: DeckStats = {
        averageBestAtk: 1420.9,
        share1500: 0.443,
        share2000: 0.186,
        shareDead: 0.203,
    };

    it("turns shares into percentages and the change into points", () => {
        const [average, share1500, , dead] = statRows(current, recommended);

        expect(average).toMatchObject({ unit: "atk", direction: "better", delta: 104.6 });
        expect(share1500).toMatchObject({ unit: "percent", direction: "better" });
        expect(share1500?.current).toBeCloseTo(33.13, 5);
        expect(share1500?.delta).toBe(11.2);
        expect(dead).toMatchObject({ direction: "better", delta: -7.8 });
    });

    it("counts a rise in dead hands as worse", () => {
        const [, , , dead] = statRows(current, { ...current, shareDead: 0.35 });
        expect(dead?.direction).toBe("worse");
    });

    it("calls a change that rounds to zero the same", () => {
        const rows = statRows(current, { ...current, averageBestAtk: current.averageBestAtk + 0.04 });
        expect(rows[0]).toMatchObject({ delta: 0, direction: "same" });
    });
});

describe("formatNumber", () => {
    it("uses one decimal and the locale's separator", () => {
        expect(formatNumber(1420.84, "en")).toBe("1,420.8");
        expect(formatNumber(1420.84, "es")).toBe("1420,8");
    });

    it("signs a change only when asked", () => {
        expect(formatNumber(4.5, "en", true)).toBe("+4.5");
        expect(formatNumber(-4.5, "en", true)).toBe("\u22124.5");
        expect(formatNumber(-4.5, "es", true)).toBe("\u22124,5");
        expect(formatNumber(4.5, "en")).toBe("4.5");
    });
});

describe("parseRetryAfter", () => {
    it.each([
        ["5", 5],
        [" 12 ", 12],
        ["0", 1],
        ["900", 60],
        [undefined, 5],
        ["soon", 5],
        ["Wed, 21 Oct 2026 07:28:00 GMT", 5],
        ["-3", 5],
    ])("reads %j as %i seconds", (header, seconds) => {
        expect(parseRetryAfter(header)).toBe(seconds);
    });
});

describe("classifyDeckFailure", () => {
    it("tells a busy answer apart and keeps its wait", () => {
        const error = new ApiError(503, "busy", "busy", "7");
        expect(classifyDeckFailure(error)).toEqual({ kind: "busy", retryAfter: 7 });
    });

    it("falls back to the default wait when a busy answer has no header", () => {
        expect(classifyDeckFailure(new ApiError(503, "busy", "busy"))).toEqual({
            kind: "busy",
            retryAfter: 5,
        });
    });

    it("tells apart a deck the rules make impossible, which asking again cannot fix", () => {
        const error = new ApiError(400, "no deck", "impossible-deck");
        expect(classifyDeckFailure(error)).toEqual({ kind: "impossible" });
    });

    it.each([
        [400, "invalid-deck"],
        [400, "unknown-card"],
        [400, "invalid-locks"],
        [400, "invalid-forbidden"],
        [413, "payload-too-large"],
    ])("calls a %i %s a rejected deck", (status, code) => {
        expect(classifyDeckFailure(new ApiError(status, "x", code))).toEqual({ kind: "rejected" });
    });

    it.each([
        ["a 500", new ApiError(500, "x", "internal-error")],
        ["a 503 that is not busy", new ApiError(503, "x")],
        ["a network failure", new TypeError("Failed to fetch")],
    ])("calls %s a failure to try again", (_label, error) => {
        expect(classifyDeckFailure(error)).toEqual({ kind: "failed" });
    });
});

describe("lowersAverage", () => {
    const stats: DeckStats = { averageBestAtk: 1316.29, share1500: 0.33, share2000: 0.12, shareDead: 0.28 };

    it("is true only when the average falls by a shown amount", () => {
        expect(lowersAverage(stats, { ...stats, averageBestAtk: 1300 })).toBe(true);
        expect(lowersAverage(stats, { ...stats, averageBestAtk: 1400 })).toBe(false);
        expect(lowersAverage(stats, { ...stats, averageBestAtk: stats.averageBestAtk - 0.04 })).toBe(false);
    });
});

describe("markAddedSlots", () => {
    it("marks the copies that come after the locked ones of the same card", () => {
        const deck = [{ id: 5 }, { id: 5 }, { id: 5 }, { id: 7 }];

        expect(markAddedSlots(deck, [{ id: 5, count: 2 }], [{ id: 5, count: 1 }])).toEqual([
            false,
            false,
            true,
            false,
        ]);
    });

    it("marks the first copies of a card the deck did not hold", () => {
        const deck = [{ id: 9 }, { id: 9 }, { id: 7 }];
        expect(markAddedSlots(deck, [], [{ id: 9, count: 2 }])).toEqual([true, true, false]);
    });

    it("marks nothing without added copies", () => {
        expect(markAddedSlots([{ id: 5 }], [{ id: 5, count: 1 }], [])).toEqual([false]);
    });
});

// A deck of 40 slots: ids 1 to 36 once each, then card 40 four times (a deck may hold more than the limit).
// Trunk: 100 x2, 200 x1, 300 x5, and 1 x2 (so card 1 is owned three times).
describe("deck rules", () => {
    const deck = [...Array.from({ length: 36 }, (_, i) => i + 1), 40, 40, 40, 40];
    const save: FmSave = {
        deck,
        trunk: [
            { id: 100, count: 2 },
            { id: 200, count: 1 },
            { id: 300, count: 5 },
            { id: 1, count: 2 },
        ],
    };
    const base: DeckRules = { locked: deck.map(() => false), added: new Map(), forbidden: [] };

    it("starts with the non-monsters locked, nothing added and nothing forbidden", () => {
        const cards: CardLookup = new Map([
            [1, entry(1)],
            [2, entry(2, { isMonster: false })],
        ]);

        expect(defaultRules([1, 2, 2], cards)).toEqual({
            locked: [false, true, true],
            added: new Map(),
            forbidden: [],
        });
    });

    describe("toggling a lock", () => {
        it("locks and unlocks one slot", () => {
            const locked = toggleLock(base, deck, 0);
            expect(locked.locked[0]).toBe(true);
            expect(locked.locked.filter(Boolean)).toHaveLength(1);
            expect(toggleLock(locked, deck, 0).locked[0]).toBe(false);
        });

        it("clears the ban of the card when it locks a copy", () => {
            const rules = toggleLock({ ...base, forbidden: [1, 2] }, deck, 0);
            expect(rules.forbidden).toEqual([2]);
        });

        it("clears the added copies of the card when it unlocks one of its deck copies", () => {
            const added: DeckRules = {
                ...base,
                added: new Map([
                    [40, 1],
                    [100, 1],
                ]),
            };
            const rules = toggleLock({ ...added, locked: deck.map((id) => id === 40) }, deck, 36);
            expect(rules.added).toEqual(new Map([[100, 1]]));
        });

        it("leaves the rules alone for a slot the deck does not have", () => {
            expect(toggleLock(base, deck, 99)).toBe(base);
        });

        it("does not change the rules it was given", () => {
            toggleLock(base, deck, 0);
            expect(base.locked.some(Boolean)).toBe(false);
        });
    });

    describe("toggling a ban", () => {
        it("clears every lock of the card and its added copies when it bans", () => {
            const rules = toggleForbid(
                {
                    locked: deck.map((id) => id === 40 || id === 1),
                    added: new Map([
                        [40, 1],
                        [100, 1],
                    ]),
                    forbidden: [],
                },
                deck,
                40
            );

            expect(rules.forbidden).toEqual([40]);
            expect(rules.locked.filter(Boolean)).toHaveLength(1);
            expect(rules.locked[0]).toBe(true);
            expect(rules.added).toEqual(new Map([[100, 1]]));
        });

        it("bans a card the deck does not hold", () => {
            expect(toggleForbid(base, deck, 100).forbidden).toEqual([100]);
        });

        it("changes nothing else when it lifts the ban", () => {
            const banned = toggleForbid(toggleLock(base, deck, 0), deck, 5);
            const lifted = toggleForbid(banned, deck, 5);

            expect(lifted.forbidden).toEqual([]);
            expect(lifted.locked).toEqual(banned.locked);
            expect(lifted.added).toEqual(banned.added);
        });
    });

    describe("adding a copy", () => {
        it("adds a card the deck does not hold", () => {
            const rules = addCopy(base, save, 100);
            expect(rules.added).toEqual(new Map([[100, 1]]));
            expect(rules.locked).toEqual(base.locked);
        });

        it("locks every deck copy of the card it adds, and lifts its ban", () => {
            const rules = addCopy({ ...base, forbidden: [1, 300] }, save, 1);

            expect(rules.added).toEqual(new Map([[1, 1]]));
            expect(rules.locked[0]).toBe(true);
            expect(rules.locked.filter(Boolean)).toHaveLength(1);
            expect(rules.forbidden).toEqual([300]);
        });

        it("stops at the copy limit less the copies the deck holds", () => {
            // Card 1: owned three times, one in the deck, so two more fit.
            let rules = addCopy(base, save, 1);
            rules = addCopy(rules, save, 1);
            expect(canAdd(rules, save, 1)).toBe(false);
            expect(addCopy(rules, save, 1)).toBe(rules);
            expect(rules.added.get(1)).toBe(2);
        });

        it("stops at three copies even when more are owned", () => {
            let rules = base;
            for (let i = 0; i < 5; i++) rules = addCopy(rules, save, 300);
            expect(rules.added.get(300)).toBe(3);
        });

        it("cannot add more of a card than the trunk holds", () => {
            let rules = addCopy(base, save, 200);
            expect(canAdd(rules, save, 200)).toBe(false);
            rules = addCopy(rules, save, 200);
            expect(rules.added.get(200)).toBe(1);
        });

        it("cannot add a card the deck holds over the copy limit, because the deck keeps what it has", () => {
            // Card 40 is in the deck four times: the limit is 4, so nothing is left to add.
            expect(canAdd(base, { ...save, trunk: [{ id: 40, count: 2 }] }, 40)).toBe(false);
        });

        it("cannot add when the required cards would not fit in the deck", () => {
            const full: DeckRules = {
                locked: deck.map((_, slot) => slot < 39),
                added: new Map(),
                forbidden: [],
            };
            // 39 locked plus one more is 40: it fits; a second does not.
            expect(canAdd(full, save, 100)).toBe(true);
            const filled = addCopy(full, save, 100);
            expect(canAdd(filled, save, 200)).toBe(false);
            expect(addCopy(filled, save, 200)).toBe(filled);
        });

        it("counts the deck copies that adding would lock", () => {
            // Every slot but the first is locked. Card 1 sits in the first slot and has spare copies, yet adding
            // one would lock that slot too: 39 + 1 + 1 > 40.
            const rules: DeckRules = {
                locked: deck.map((_, slot) => slot > 0),
                added: new Map(),
                forbidden: [],
            };
            expect(canAdd(rules, save, 1)).toBe(false);
            // Card 100 locks no deck copy: 39 + 0 + 1 fits.
            expect(canAdd(rules, save, 100)).toBe(true);
        });

        it("counts the copies already added", () => {
            const rules: DeckRules = {
                locked: deck.map((_, slot) => slot < 38),
                added: new Map([[100, 1]]),
                forbidden: [],
            };
            expect(canAdd(rules, save, 200)).toBe(true);
            expect(canAdd({ ...rules, added: new Map([[100, 2]]) }, save, 200)).toBe(false);
        });

        it("cannot add a card the player does not own", () => {
            expect(canAdd(base, save, 999)).toBe(false);
        });
    });

    describe("removing an added copy", () => {
        it("takes one copy back and drops the entry at none", () => {
            const two = addCopy(addCopy(base, save, 300), save, 300);
            const one = removeCopy(two, 300);
            expect(one.added.get(300)).toBe(1);
            expect(removeCopy(one, 300).added.has(300)).toBe(false);
        });

        it("keeps the deck copies that adding locked", () => {
            const added = addCopy(base, save, 1);
            const removed = removeCopy(added, 1);

            expect(removed.added.size).toBe(0);
            expect(removed.locked[0]).toBe(true);
        });

        it("does nothing for a card with no added copy", () => {
            expect(removeCopy(base, 300)).toBe(base);
        });
    });

    describe("what the request asks for", () => {
        it("adds the added copies to the locked ones of the same card", () => {
            const rules = addCopy(addCopy(base, save, 1), save, 100);

            expect(requiredCards(deck, rules)).toEqual([
                { id: 1, count: 2 },
                { id: 100, count: 1 },
            ]);
            expect(addedCards(rules)).toEqual([
                { id: 1, count: 1 },
                { id: 100, count: 1 },
            ]);
            expect(lockedCards(deck, rules.locked)).toEqual([{ id: 1, count: 1 }]);
        });

        it("sends the banned cards as they are", () => {
            expect(buildDeckRequest(save, toggleForbid(base, deck, 5)).forbidden).toEqual([5]);
        });
    });
});
