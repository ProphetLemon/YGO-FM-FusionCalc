import { beforeAll, describe, expect, it, vi } from "vitest";
import { MAX_COPIES_PER_CARD } from "../../../../src/shared/limits.js";
import type { DeckOptimizeRequest } from "../../../../src/shared/types.js";
import { loadStore } from "../../../../src/server/data/store.js";
import { scoreDeck } from "../../../../src/server/domain/deck-score.js";
import {
    EXHAUSTIVE_MAX_DECKS,
    EXHAUSTIVE_MAX_LEFT_OUT,
    buildSearchSpace,
    exhaustiveBest,
    localSearch,
    planExhaustive,
    seededRandom,
} from "../../../../src/server/domain/deck-search.js";
import { getHandEvaluator, type HandEvaluator } from "../../../../src/server/domain/hand-evaluator.js";
import {
    countOf,
    createMultisetScorer,
    deckOf,
    forEachDeck,
    fusionRichMonsters,
    monstersByAttack,
    nonMonsterIds,
    testRandom,
} from "../helpers/deck-fixtures.js";

// Coverage instrumentation slows the searches several times over.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// The algorithms do not depend on the deck having 40 cards, so these tests run them on 12-card decks, where
// every deck and every hand can be enumerated in a blink. The 40-card runs are in the optimiser tests.
const SIZE = 12;

let evaluator: HandEvaluator;
let weak: number[];
let strong: number[];
let magic: number[];
const scorer = createMultisetScorer();

beforeAll(() => {
    loadStore();
    evaluator = getHandEvaluator();
    weak = monstersByAttack().slice(0, 8);
    strong = fusionRichMonsters()
        .filter((id) => !weak.includes(id))
        .slice(0, 6);
    magic = nonMonsterIds().slice(0, 3);
});

// 4 weak cards in 3 copies, and `spare` strong cards once each. With `magicInDeck`, the last slot holds a magic
// card instead.
function pool(spare: number, magicInDeck = false): DeckOptimizeRequest {
    const deck = deckOf(weak.slice(0, 4), 3, SIZE);
    if (magicInDeck) deck[SIZE - 1] = magic[0] as number;
    return { deck, trunk: strong.slice(0, spare).map((id) => ({ id, count: 1 })) };
}

// The best total over every deck the rules allow, by brute force over copies per card.
function bruteForceBest(request: DeckOptimizeRequest, keepNonMonsters: boolean): number {
    const space = buildSearchSpace(evaluator, request.deck, request.trunk, keepNonMonsters);
    const limits = new Map<number, number>();
    const fixed = new Map<number, number>();
    for (const id of space.candidates) limits.set(id, space.limit[id] as number);
    for (const [id, copies] of countOf(request.deck)) {
        if (space.movable(id)) continue;
        limits.set(id, copies);
        fixed.set(id, copies);
    }
    let best = -1;
    forEachDeck(limits, fixed, (deck) => (best = Math.max(best, scorer(deck))), request.deck.length);
    return best;
}

function totalOf(cards: ArrayLike<number>): number {
    return scoreDeck(evaluator, cards).totalAtk;
}

function plan(request: DeckOptimizeRequest, keep: boolean) {
    const space = buildSearchSpace(evaluator, request.deck, request.trunk, keep);
    return { space, plan: planExhaustive(evaluator, request.deck, space) };
}

describe("buildSearchSpace", () => {
    it("limits each card to the copies owned, up to the copy limit", () => {
        const deck = deckOf(monstersByAttack().slice(0, 14), 3, 40);
        const space = buildSearchSpace(
            evaluator,
            deck,
            [
                { id: strong[0] as number, count: 5 },
                { id: strong[1] as number, count: 1 },
                { id: weak[0] as number, count: 2 },
            ],
            true
        );
        expect(space.limit[strong[0] as number]).toBe(MAX_COPIES_PER_CARD);
        expect(space.limit[strong[1] as number]).toBe(1);
        // Owning 5 copies of a card the deck holds 3 times still allows only 3.
        expect(space.limit[weak[0] as number]).toBe(MAX_COPIES_PER_CARD);
    });

    it("lets a deck that already holds more than the copy limit keep those copies", () => {
        const deck = [...Array<number>(5).fill(weak[0] as number), ...deckOf(weak.slice(1, 3), 3, 6)];
        const space = buildSearchSpace(evaluator, deck, [], true);
        expect(space.limit[weak[0] as number]).toBe(5);
    });

    it("keeps non-monsters in the deck and out of the candidates when asked", () => {
        const request = pool(2, true);
        const kept = buildSearchSpace(
            evaluator,
            request.deck,
            [...request.trunk, { id: magic[1] as number, count: 2 }],
            true
        );
        expect(kept.movable(magic[0] as number)).toBe(false);
        expect(kept.movable(weak[0] as number)).toBe(true);
        expect(kept.candidates).not.toContain(magic[0]);
        expect(kept.candidates).not.toContain(magic[1]);
        const free = buildSearchSpace(
            evaluator,
            request.deck,
            [{ id: magic[1] as number, count: 2 }],
            false
        );
        expect(free.movable(magic[0] as number)).toBe(true);
        expect(free.candidates).toContain(magic[0]);
        expect(free.candidates).toContain(magic[1]);
    });
});

describe("planExhaustive", () => {
    it("counts the copies to leave out and the decks that choice allows", () => {
        const { plan: found } = plan(pool(2), true);
        expect(found?.movable).toHaveLength(14);
        expect(found?.pinned).toEqual([]);
        expect(found?.leaveOut).toBe(2);
        // C(14, 2)
        expect(found?.decks).toBe(91);
    });

    it("pins the non-monsters that are kept, and leaves them out of the choice", () => {
        const { plan: found } = plan(pool(2, true), true);
        expect(found?.pinned).toEqual([magic[0]]);
        expect(found?.movable).toHaveLength(13);
        expect(found?.leaveOut).toBe(2);
    });

    it("is null when the pool allows more decks than the limit, or leaves out too many cards", () => {
        const request = pool(2);
        const space = buildSearchSpace(evaluator, request.deck, request.trunk, true);
        expect(planExhaustive(evaluator, request.deck, space, 90)).toBeNull();
        expect(planExhaustive(evaluator, request.deck, space, 91)).not.toBeNull();
        const big = buildSearchSpace(
            evaluator,
            request.deck,
            strong.map((id) => ({ id, count: 3 })),
            true
        );
        // 12 + 18 cards leave out 18 of them, more than EXHAUSTIVE_MAX_LEFT_OUT.
        expect(planExhaustive(evaluator, request.deck, big, Number.MAX_SAFE_INTEGER)).toBeNull();
        expect(EXHAUSTIVE_MAX_LEFT_OUT).toBeLessThan(18);
        expect(EXHAUSTIVE_MAX_DECKS).toBeGreaterThan(100_000);
    });

    it("has nothing to leave out when the deck is the whole pool", () => {
        const { plan: found } = plan(pool(0), true);
        expect(found?.leaveOut).toBe(0);
        expect(found?.decks).toBe(1);
        expect(countOf(exhaustiveBest(evaluator, found!))).toEqual(countOf(pool(0).deck));
    });
});

describe("exhaustiveBest", () => {
    it.each([
        ["a pool of monsters", 2, false, true],
        ["a deck with a magic card that is kept", 2, true, true],
        ["a deck with a magic card that may be replaced", 2, true, false],
        ["three cards left out", 3, false, true],
        ["four cards left out, which needs subsets of four", 4, false, true],
        ["five cards left out, which needs subsets of five", 5, false, true],
        ["six cards left out, where subsets of six hold no hand", 6, false, true],
    ])(
        "finds the same best deck as a brute force over every deck: %s",
        (_name, spare, magicInDeck, keep) => {
            const request = pool(spare, magicInDeck);
            const { space, plan: found } = plan(request, keep);
            expect(found).not.toBeNull();
            const best = exhaustiveBest(evaluator, found!);
            expect(best).toHaveLength(SIZE);
            expect(totalOf(best)).toBe(bruteForceBest(request, keep));
            for (const [id, copies] of countOf(best)) {
                expect(copies).toBeLessThanOrEqual(Math.max(space.limit[id] as number, magicInDeck ? 1 : 0));
            }
            if (keep && magicInDeck) expect(best).toContain(magic[0]);
        }
    );

    it("matches a brute force on seeded random pools, with repeated cards, magic and decks over the copy limit", () => {
        const random = testRandom(21);
        const cards = [...weak, ...fusionRichMonsters().slice(0, 25), ...magic];
        for (let round = 0; round < 5; round++) {
            const pick = () => cards[Math.floor(random() * cards.length)] as number;
            const deck = Array.from({ length: SIZE }, pick);
            const trunk = [...countOf(Array.from({ length: 2 + (round % 2) }, pick))].map(([id, count]) => ({
                id,
                count,
            }));
            const request: DeckOptimizeRequest = { deck, trunk };
            for (const keep of [true, false]) {
                const { plan: found } = plan(request, keep);
                if (found === null) continue;
                expect(totalOf(exhaustiveBest(evaluator, found)), `round ${round}`).toBe(
                    bruteForceBest(request, keep)
                );
            }
        }
    });

    it("beats the current deck when strong spare cards wait in the trunk", () => {
        const request = pool(2);
        const best = exhaustiveBest(evaluator, plan(request, true).plan!);
        expect(totalOf(best)).toBeGreaterThan(totalOf(request.deck));
        for (const { id } of request.trunk) expect(best).toContain(id);
    });

    it("returns the current deck when it is already the best, instead of an equal one with swaps", () => {
        // Take the best deck of a pool and hand it back with the cards it left out as the trunk.
        const first = pool(2);
        const best = exhaustiveBest(evaluator, plan(first, true).plan!);
        const leftOut = countOf([...first.deck, ...first.trunk.map(({ id }) => id)]);
        for (const [id, copies] of countOf(best)) leftOut.set(id, (leftOut.get(id) ?? 0) - copies);
        const trunk = [...leftOut].filter(([, count]) => count > 0).map(([id, count]) => ({ id, count }));
        expect(trunk.length).toBeGreaterThan(0);

        const again = exhaustiveBest(evaluator, plan({ deck: best, trunk }, true).plan!);
        expect(countOf(again)).toEqual(countOf(best));
    });
});

describe("localSearch", () => {
    const never = (): boolean => false;
    function search(
        request: DeckOptimizeRequest,
        keep: boolean,
        extra: { expired?: () => boolean; seed?: number; tabuSteps?: number } = {}
    ) {
        const space = buildSearchSpace(evaluator, request.deck, request.trunk, keep);
        return localSearch(evaluator, space, Int16Array.from(request.deck), {
            random: seededRandom(extra.seed ?? 1),
            expired: extra.expired ?? never,
            tabuSteps: extra.tabuSteps ?? 2,
        });
    }

    it("reaches the best deck on a small pool, which the exhaustive search proves", () => {
        const request = pool(4);
        const result = search(request, true);
        expect(result.truncated).toBe(false);
        expect(totalOf(result.deck)).toBe(bruteForceBest(request, true));
    });

    it("never ends below the current deck nor above the best one, on seeded random pools", () => {
        const random = testRandom(5);
        const cards = [...weak, ...fusionRichMonsters().slice(0, 25)];
        for (let round = 0; round < 2; round++) {
            const pick = () => cards[Math.floor(random() * cards.length)] as number;
            const deck = Array.from({ length: SIZE }, pick);
            const trunk = [...countOf(Array.from({ length: 3 }, pick))].map(([id, count]) => ({
                id,
                count,
            }));
            const request: DeckOptimizeRequest = { deck, trunk };
            const total = totalOf(search(request, true).deck);
            expect(total, `round ${round}`).toBeGreaterThanOrEqual(totalOf(deck));
            expect(total, `round ${round}`).toBeLessThanOrEqual(bruteForceBest(request, true));
        }
    });

    it("respects the copies owned, the copy limit and the non-monsters that are kept", () => {
        const request = pool(2, true);
        request.trunk.push({ id: strong[0] as number, count: 5 }, { id: magic[1] as number, count: 2 });
        const owned = countOf([
            ...request.deck,
            ...request.trunk.flatMap(({ id, count }) => Array<number>(count).fill(id)),
        ]);
        const result = search(request, true);
        expect(result.deck).toHaveLength(SIZE);
        for (const [id, copies] of countOf(result.deck)) {
            expect(copies).toBeLessThanOrEqual(owned.get(id) as number);
            expect(copies).toBeLessThanOrEqual(
                Math.max(MAX_COPIES_PER_CARD, countOf(request.deck).get(id) ?? 0)
            );
        }
        expect([...result.deck]).toContain(magic[0]);
        expect([...result.deck]).not.toContain(magic[1]);
    });

    it("can move every card when non-monsters are not kept", () => {
        const { deck } = search(pool(2, true), false);
        expect([...deck]).not.toContain(magic[0]);
    });

    it("gives the same deck for the same seed", () => {
        const request = pool(4);
        expect(search(request, true, { seed: 11 })).toEqual(search(request, true, { seed: 11 }));
    });

    it("returns the current deck, truncated, when the budget is already spent", () => {
        const request = pool(2);
        const result = search(request, true, { expired: () => true });
        expect(result.truncated).toBe(true);
        expect([...result.deck]).toEqual(request.deck);
    });

    it.each([2, 5, 12, 30])(
        "returns a valid deck no worse than the start when the budget ends after %i checks",
        (checks) => {
            const request = pool(4);
            let reads = 0;
            const result = search(request, true, { expired: () => ++reads > checks });
            expect(result.truncated).toBe(true);
            expect(result.deck).toHaveLength(SIZE);
            expect(totalOf(result.deck)).toBeGreaterThanOrEqual(totalOf(request.deck));
        }
    );

    it("walks back a swap that gains nothing", () => {
        // Two cards that never fuse and sit below the best card of every hand are interchangeable.
        const request = pool(4);
        const result = search(request, true);
        const kept = [...result.deck].filter((id, slot) => id === request.deck[slot]).length;
        // Whatever the search changed, each changed slot pays: reverting any one of them loses ATK.
        const base = totalOf(result.deck);
        result.deck.forEach((card, slot) => {
            if (card === request.deck[slot]) return;
            const reverted = Int16Array.from(result.deck);
            reverted[slot] = request.deck[slot] as number;
            expect(totalOf(reverted)).toBeLessThan(base);
        });
        expect(kept).toBeLessThanOrEqual(SIZE);
    });

    it("does not trade two cards of no worth for each other forever when a better card waits", () => {
        // Two different magic cards (worth nothing) in the deck, a strong card and six more magic cards spare.
        const request: DeckOptimizeRequest = {
            deck: [...deckOf(weak.slice(0, 4), 3, SIZE - 2), magic[0] as number, magic[1] as number],
            trunk: [
                { id: strong[0] as number, count: 1 },
                ...nonMonsterIds()
                    .slice(3, 9)
                    .map((id) => ({ id, count: 1 })),
            ],
        };
        let reads = 0;
        const result = search(request, false, { expired: () => (++reads, false) });
        // Two magic cards trading places for ever used to run every climb to its step cap (271 budget checks
        // here against 133 now); the climbs now end on their own.
        expect(reads).toBeLessThan(200);
        expect(result.truncated).toBe(false);
        expect([...result.deck]).toContain(strong[0]);
        // One card left to make room for the strong one; the magic cards did not change places.
        const kept = countOf(request.deck);
        const now = countOf(result.deck);
        let changed = 0;
        for (const [id, copies] of kept) changed += Math.max(0, copies - (now.get(id) ?? 0));
        expect(changed).toBe(1);
    });

    it("sweeps every owned card, not only the shortlist, and reports truncated when it cannot finish", () => {
        // 60 different spare cards: more than the shortlist, so the sweep has cards the search never tried.
        const spares = fusionRichMonsters().slice(0, 60);
        const request: DeckOptimizeRequest = {
            deck: deckOf(weak.slice(0, 4), 3, SIZE),
            trunk: spares.map((id) => ({ id, count: 1 })),
        };
        const full = search(request, true, { tabuSteps: 0 });
        expect(full.truncated).toBe(false);
        // No single swap with any owned card improves the result.
        const base = totalOf(full.deck);
        const counts = countOf(full.deck);
        const space = buildSearchSpace(evaluator, request.deck, request.trunk, true);
        for (const card of spares) {
            if ((counts.get(card) ?? 0) >= (space.limit[card] as number)) continue;
            for (let slot = 0; slot < SIZE; slot++) {
                const swapped = Int16Array.from(full.deck);
                swapped[slot] = card;
                expect(totalOf(swapped)).toBeLessThanOrEqual(base);
            }
        }
        // A budget that ends during the sweep leaves it unconfirmed.
        let reads = 0;
        const cut = search(request, true, { tabuSteps: 0, expired: () => ++reads > 400 });
        expect(cut.truncated).toBe(true);
    });

    it("uses a pre-filter when more cards wait than it shortlists", () => {
        // 36 different spare cards, more than the 30 the pre-filter keeps.
        const spares = fusionRichMonsters().slice(0, 36);
        const request: DeckOptimizeRequest = {
            deck: deckOf(weak.slice(0, 4), 3, SIZE),
            trunk: spares.map((id) => ({ id, count: 1 })),
        };
        const result = search(request, true, { tabuSteps: 0 });
        expect(result.truncated).toBe(false);
        expect(totalOf(result.deck)).toBeGreaterThan(totalOf(request.deck));
    });
});
