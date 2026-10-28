import { beforeAll, describe, expect, it, vi } from "vitest";
import { DECK_SIZE, MAX_COPIES_PER_CARD } from "../../../../src/shared/limits.js";
import type { DeckOptimizeRequest, DeckOptimizeResponse } from "../../../../src/shared/types.js";
import { getAllCards, getCardById, loadStore } from "../../../../src/server/data/store.js";
import { isMonster } from "../../../../src/server/domain/cards.js";
import {
    MAX_SEARCH_MILLIS,
    arrangeDeck,
    optimizeDeck,
    type DeckOptimizeOptions,
} from "../../../../src/server/domain/deck-optimizer.js";
import { handCount } from "../../../../src/server/domain/deck-score.js";
import { runInWorker } from "../../../../src/server/workers/deck-optimizer-runner.js";
import {
    countOf,
    createMultisetScorer,
    deckOf,
    fusionRichMonsters,
    monstersByAttack,
    nonMonsterIds,
} from "../helpers/deck-fixtures.js";

// The full-size runs go to a worker thread, which coverage instrumentation does not slow down.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// The optimiser works on any deck of 5 cards or more, so most tests use 12 cards, where everything is quick.
const SIZE = 12;
// Forces the local search. The budget is far away, so these runs finish whatever the machine's speed.
const LOCAL: DeckOptimizeOptions = { exhaustiveMaxDecks: 0, tabuSteps: 0, maxMillis: 600_000 };
const scorer = createMultisetScorer();

let weak: number[];
let strong: number[];
let magic: number[];

beforeAll(() => {
    loadStore();
    weak = monstersByAttack().slice(0, 14);
    strong = fusionRichMonsters()
        .filter((id) => !weak.includes(id))
        .slice(0, 6);
    magic = nonMonsterIds().slice(0, 3);
});

// 4 weak cards in 3 copies and two strong spare cards: 14 cards for a deck of 12.
function smallPool(): DeckOptimizeRequest {
    return {
        deck: deckOf(weak.slice(0, 4), 3, SIZE),
        trunk: strong.slice(0, 2).map((id) => ({ id, count: 1 })),
    };
}

function ids(result: DeckOptimizeResponse): number[] {
    return result.deck.map((card) => card.id);
}

function exactAverage(cards: readonly number[]): number {
    return scorer(countOf(cards)) / handCount(cards.length);
}

describe("optimizeDeck, exhaustive", () => {
    it("certifies the best deck of a small pool and reports exact stats", () => {
        const request = smallPool();
        const result = optimizeDeck(request);
        expect(result.method).toBe("exhaustive");
        expect(result.certified).toBe(true);
        expect(result.truncated).toBe(false);
        expect(result.deck).toHaveLength(SIZE);
        expect(result.swaps.length).toBeGreaterThan(0);
        // The numbers are the exact averages, computed here by an independent route.
        expect(result.recommended.averageBestAtk).toBeCloseTo(exactAverage(ids(result)), 2);
        expect(result.current.averageBestAtk).toBeCloseTo(exactAverage(request.deck), 2);
        expect(result.recommended.averageBestAtk).toBeGreaterThan(result.current.averageBestAtk);
    });

    it("lists net swaps that turn the current deck into the recommended one, leaving other slots alone", () => {
        const request = smallPool();
        const result = optimizeDeck(request);
        const counts = countOf(request.deck);
        for (const swap of result.swaps) {
            counts.set(swap.out.id, (counts.get(swap.out.id) ?? 0) - 1);
            counts.set(swap.in.id, (counts.get(swap.in.id) ?? 0) + 1);
        }
        const net = new Map([...counts].filter(([, copies]) => copies > 0));
        expect(net).toEqual(countOf(ids(result)));
        const changedSlots = request.deck.filter((id, slot) => id !== ids(result)[slot]).length;
        expect(changedSlots).toBe(result.swaps.length);
        // A card is never swapped for itself.
        expect(result.swaps.every((swap) => swap.out.id !== swap.in.id)).toBe(true);
    });

    it("keeps the deck and certifies it when there are no spare cards", () => {
        const request: DeckOptimizeRequest = { deck: deckOf(weak.slice(0, 4), 3, SIZE), trunk: [] };
        const result = optimizeDeck(request);
        expect(result.certified).toBe(true);
        expect(result.swaps).toEqual([]);
        expect(ids(result)).toEqual(request.deck);
        expect(result.recommended).toEqual(result.current);
    });

    it("keeps the non-monsters of the deck by default, and swaps them out when asked not to", () => {
        const deck = deckOf(weak.slice(0, 4), 3, SIZE);
        deck[SIZE - 1] = magic[0] as number;
        const request: DeckOptimizeRequest = {
            deck,
            trunk: strong.slice(0, 2).map((id) => ({ id, count: 1 })),
        };
        for (const result of [optimizeDeck(request), optimizeDeck({ ...request, keepNonMonsters: true })]) {
            // A certified answer under the default keeps every non-monster.
            expect(result.certified).toBe(true);
            expect(ids(result)[SIZE - 1]).toBe(magic[0]);
            expect(result.swaps.some((swap) => swap.out.id === magic[0])).toBe(false);
        }
        const free = optimizeDeck(request, { keepNonMonsters: false });
        expect(free.swaps.some((swap) => swap.out.id === magic[0])).toBe(true);
        expect(free.recommended.averageBestAtk).toBeGreaterThanOrEqual(
            optimizeDeck(request).recommended.averageBestAtk
        );
        // The option wins over the request field.
        const overridden = optimizeDeck({ ...request, keepNonMonsters: true }, { keepNonMonsters: false });
        expect(overridden.swaps.some((swap) => swap.out.id === magic[0])).toBe(true);
    });

    describe("with locked cards", () => {
        // A deck with two magic cards in its last slots, and two strong cards waiting in the trunk.
        function withTwoMagic(): DeckOptimizeRequest {
            const deck = deckOf(weak.slice(0, 4), 3, SIZE);
            deck[SIZE - 1] = magic[0] as number;
            deck[SIZE - 2] = magic[1] as number;
            return { deck, trunk: strong.slice(0, 2).map((id) => ({ id, count: 1 })) };
        }

        it("keeps a locked spell and replaces an unlocked one when non-monsters are free to move", () => {
            const request = withTwoMagic();
            const result = optimizeDeck({
                ...request,
                keepNonMonsters: false,
                locked: [{ id: magic[0] as number, count: 1 }],
            });
            expect(result.certified).toBe(true);
            expect(ids(result)).toContain(magic[0]);
            expect(ids(result)).not.toContain(magic[1]);
            expect(result.swaps.some((swap) => swap.out.id === magic[1])).toBe(true);
            expect(result.swaps.some((swap) => swap.out.id === magic[0])).toBe(false);
        });

        it("adds locks on monsters to the spells that are kept", () => {
            const request = withTwoMagic();
            const locked = [{ id: weak[0] as number, count: 3 }];
            const result = optimizeDeck({ ...request, locked });
            expect(result.certified).toBe(true);
            expect(ids(result)).toContain(magic[0]);
            expect(ids(result)).toContain(magic[1]);
            expect(countOf(ids(result)).get(weak[0] as number)).toBe(3);
            // Without the lock the optimiser would drop some weak card to make room for a strong one.
            expect(result.swaps.every((swap) => swap.out.id !== weak[0])).toBe(true);
        });

        it("keeps the locked copies on the local search too", () => {
            const request = withTwoMagic();
            const locked = [
                { id: magic[0] as number, count: 1 },
                { id: weak[1] as number, count: 3 },
            ];
            const result = optimizeDeck({ ...request, keepNonMonsters: false, locked }, LOCAL);
            expect(result.method).toBe("local-search");
            const held = countOf(ids(result));
            expect(held.get(magic[0] as number)).toBeGreaterThanOrEqual(1);
            expect(held.get(weak[1] as number)).toBeGreaterThanOrEqual(3);
            expect(ids(result)).not.toContain(magic[1]);
            expect(result.recommended).toEqual(
                optimizeDeck({ ...request, keepNonMonsters: false, locked }).recommended
            );
        });

        it("gives the current deck, certified and without swaps, when every card is locked", () => {
            const request = withTwoMagic();
            const locked = [...countOf(request.deck)].map(([id, count]) => ({ id, count }));
            const result = optimizeDeck({ ...request, keepNonMonsters: false, locked });
            expect(result.method).toBe("exhaustive");
            expect(result.certified).toBe(true);
            expect(result.swaps).toEqual([]);
            expect(ids(result)).toEqual(request.deck);
            expect(result.recommended).toEqual(result.current);
        });
    });

    it("never takes a spare non-monster in when non-monsters are kept", () => {
        const request: DeckOptimizeRequest = {
            deck: deckOf(weak.slice(0, 4), 3, SIZE),
            trunk: [...strong.slice(0, 2), ...magic].map((id) => ({ id, count: 1 })),
        };
        expect(ids(optimizeDeck(request)).every((id) => !magic.includes(id))).toBe(true);
    });

    it("never uses more copies than owned or than the copy limit", () => {
        const request: DeckOptimizeRequest = {
            deck: deckOf(weak.slice(0, 4), 3, SIZE),
            trunk: [
                { id: strong[0] as number, count: 6 },
                { id: strong[1] as number, count: 2 },
            ],
        };
        const result = optimizeDeck(request);
        const owned = new Map([
            [strong[0] as number, 6],
            [strong[1] as number, 2],
        ]);
        for (const [id, copies] of countOf(ids(result))) {
            expect(copies).toBeLessThanOrEqual(Math.min(owned.get(id) ?? Infinity, MAX_COPIES_PER_CARD));
        }
        expect(countOf(ids(result)).get(strong[0] as number)).toBe(MAX_COPIES_PER_CARD);
    });

    it("reports shares in order, the dead hands, and the top fusion finals in descending share", () => {
        const result = optimizeDeck(smallPool());
        for (const stats of [result.current, result.recommended]) {
            expect(stats.share1500).toBeGreaterThanOrEqual(stats.share2000);
            expect(stats.share1500 + stats.shareDead).toBeLessThanOrEqual(1);
            expect(stats.shareDead).toBeGreaterThanOrEqual(0);
        }
        expect(result.recommended.shareDead).toBeLessThanOrEqual(result.current.shareDead);
        expect(result.topFinals.length).toBeGreaterThan(0);
        expect(result.topFinals.length).toBeLessThanOrEqual(8);
        const shares = result.topFinals.map((final) => final.share);
        expect(shares).toEqual([...shares].sort((a, b) => b - a));
        expect(shares.every((share) => share > 0 && share <= 1)).toBe(true);
        expect(result.topFinals.every((final) => final.card.isMonster)).toBe(true);
    });

    it("gives the same answer every time", () => {
        expect(optimizeDeck(smallPool())).toEqual(optimizeDeck(smallPool()));
    });

    it("rejects a deck too small to deal a hand", () => {
        expect(() => optimizeDeck({ deck: [1, 2, 3], trunk: [] })).toThrow(/at least 5 cards/);
    });
});

describe("optimizeDeck, local search", () => {
    it("finds the same average as the certified answer on a small pool, and says it is not certified", () => {
        const request = smallPool();
        const local = optimizeDeck(request, LOCAL);
        expect(local.method).toBe("local-search");
        expect(local.certified).toBe(false);
        expect(local.truncated).toBe(false);
        expect(local.recommended).toEqual(optimizeDeck(request).recommended);
    });

    it("gives the same result for the same seed", () => {
        const request = smallPool();
        expect(optimizeDeck(request, { ...LOCAL, seed: 7 })).toEqual(
            optimizeDeck(request, { ...LOCAL, seed: 7 })
        );
    });

    it("keeps the non-monsters and the copy limit", () => {
        const deck = deckOf(weak.slice(0, 4), 3, SIZE);
        deck[SIZE - 1] = magic[0] as number;
        const request: DeckOptimizeRequest = {
            deck,
            trunk: [
                { id: strong[0] as number, count: 6 },
                { id: strong[1] as number, count: 2 },
                { id: magic[1] as number, count: 1 },
            ],
        };
        const result = optimizeDeck(request, LOCAL);
        expect(ids(result)[SIZE - 1]).toBe(magic[0]);
        expect(ids(result)).not.toContain(magic[1]);
        for (const [id, copies] of countOf(ids(result))) {
            expect(copies).toBeLessThanOrEqual(id === strong[1] ? 2 : MAX_COPIES_PER_CARD);
        }
    });

    it("flags truncated and returns the current deck when the budget is already spent", () => {
        const request = smallPool();
        const result = optimizeDeck(request, { ...LOCAL, maxMillis: 0 });
        expect(result.truncated).toBe(true);
        expect(result.certified).toBe(false);
        expect(ids(result)).toEqual(request.deck);
        expect(result.swaps).toEqual([]);
        expect(result.recommended).toEqual(result.current);
    });

    it("flags truncated when the clock runs out in the middle, and still returns a deck no worse than the start", () => {
        const request = smallPool();
        let reads = 0;
        // The first reads fix the deadline and start the search; later ones are far past it.
        const result = optimizeDeck(request, {
            ...LOCAL,
            maxMillis: 1_000,
            now: () => (++reads > 12 ? 1e9 : 0),
        });
        expect(result.truncated).toBe(true);
        expect(result.deck).toHaveLength(SIZE);
        expect(result.recommended.averageBestAtk).toBeGreaterThanOrEqual(result.current.averageBestAtk);
    });

    it("uses the local search by itself when the pool is too large to enumerate", () => {
        const trunk = getAllCards()
            .filter(isMonster)
            .slice(0, 40)
            .map((card) => ({ id: card.Id, count: 1 }));
        const result = optimizeDeck(
            { deck: deckOf(weak.slice(0, 4), 3, SIZE), trunk },
            { maxMillis: 600_000 }
        );
        expect(result.method).toBe("local-search");
        expect(result.certified).toBe(false);
        expect(result.recommended.averageBestAtk).toBeGreaterThan(result.current.averageBestAtk);
    });
});

describe("arrangeDeck", () => {
    it("keeps the cards that stay in their slots and fills the freed slots with the cards that enter", () => {
        const { deck, swaps } = arrangeDeck([5, 6, 7, 5, 8], [8, 9, 7, 5, 10]);
        expect(deck).toEqual([5, 9, 7, 10, 8]);
        expect(swaps.map((swap) => [swap.out.id, swap.in.id])).toEqual([
            [6, 9],
            [5, 10],
        ]);
    });

    it("lists nothing when the same cards come back in any order", () => {
        const { deck, swaps } = arrangeDeck([5, 6, 7, 5, 8], [8, 7, 6, 5, 5]);
        expect(deck).toEqual([5, 6, 7, 5, 8]);
        expect(swaps).toEqual([]);
    });
});

describe("optimizeDeck at full size, in a worker thread", () => {
    // 13 weak cards in 3 copies and a 14th once, plus `spare` strong cards once each.
    function fullPool(spare: number): DeckOptimizeRequest {
        return { deck: deckOf(weak, 3), trunk: strong.slice(0, spare).map((id) => ({ id, count: 1 })) };
    }

    it("certifies the best 40-card deck, which a brute force over every deck confirms", async () => {
        const request = fullPool(1);
        const result = await runInWorker(request);
        expect(result.certified).toBe(true);
        expect(result.method).toBe("exhaustive");
        expect(result.deck).toHaveLength(DECK_SIZE);
        // The pool is 41 cards, so the 41 decks differ by the one card left out.
        const owned = countOf([...request.deck, strong[0] as number]);
        let best = -1;
        for (const [leftOut] of owned) {
            const deck = new Map(owned);
            deck.set(leftOut, (deck.get(leftOut) as number) - 1);
            best = Math.max(best, scorer(deck));
        }
        expect(scorer(countOf(ids(result)))).toBe(best);
        expect(result.recommended.averageBestAtk).toBeCloseTo(best / handCount(DECK_SIZE), 2);
        expect(result.current.averageBestAtk).toBeCloseTo(exactAverage(request.deck), 2);
    });

    it("finds the same deck by local search, and a truncated run is no worse than the current deck", async () => {
        const request = fullPool(2);
        const certified = await runInWorker(request);
        const local = await runInWorker(request, { exhaustiveMaxDecks: 0, maxMillis: 600_000 });
        expect(local.method).toBe("local-search");
        expect(local.truncated).toBe(false);
        expect(local.recommended).toEqual(certified.recommended);
        const spent = await runInWorker(request, { exhaustiveMaxDecks: 0, maxMillis: 0 });
        expect(spent.truncated).toBe(true);
        expect(spent.recommended).toEqual(spent.current);
    });

    it("keeps non-monsters and the copy limit on a late-game collection, within its time budget", async () => {
        const deck = deckOf(weak, 3);
        deck[DECK_SIZE - 1] = magic[0] as number;
        const trunk = getAllCards()
            .filter((card) => isMonster(card) || card.Id === magic[1])
            .slice(0, 150)
            .map((card) => ({ id: card.Id, count: 3 }));
        const started = performance.now();
        const result = await runInWorker({ deck, trunk }, { maxMillis: 2_000, tabuSteps: 0 });
        expect(result.method).toBe("local-search");
        expect(result.recommended.averageBestAtk).toBeGreaterThan(result.current.averageBestAtk);
        expect(ids(result)[DECK_SIZE - 1]).toBe(magic[0]);
        expect(ids(result)).not.toContain(magic[1]);
        for (const [id, copies] of countOf(ids(result))) {
            expect(copies, getCardById(id)?.Name).toBeLessThanOrEqual(MAX_COPIES_PER_CARD);
        }
        // The budget, the closing exact scores, the worker start-up and slack for a slow machine.
        expect(performance.now() - started).toBeLessThan(2_000 + 6_000);
        expect(MAX_SEARCH_MILLIS).toBeGreaterThan(2_000);
    });
});
