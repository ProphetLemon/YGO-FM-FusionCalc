import { beforeAll, describe, expect, it, vi } from "vitest";
import { MAX_COPIES_PER_CARD } from "../../../../src/shared/limits.js";
import type { DeckLock, DeckOptimizeRequest } from "../../../../src/shared/types.js";
import { loadStore } from "../../../../src/server/data/store.js";
import { scoreDeck } from "../../../../src/server/domain/deck-score.js";
import {
    EXHAUSTIVE_MAX_DECKS,
    EXHAUSTIVE_MAX_LEFT_OUT,
    buildSearchSpace,
    exhaustiveBest,
    feasibleStart,
    localSearch,
    obeysRules,
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

// The best total over every deck the rules allow, by brute force over copies per card. A card that is not a
// candidate keeps the copies the rules require (the copies the deck holds for a kept non-monster, none for a
// forbidden card); a candidate keeps at least its required copies.
function bruteForceBest(
    request: DeckOptimizeRequest,
    keepNonMonsters: boolean,
    locked: DeckLock[] = [],
    forbidden: number[] = []
): number {
    const space = buildSearchSpace(
        evaluator,
        request.deck,
        request.trunk,
        keepNonMonsters,
        locked,
        forbidden
    );
    const limits = new Map<number, number>();
    const fixed = new Map<number, number>();
    const minimum = new Map<number, number>();
    for (const id of space.candidates) {
        limits.set(id, space.limit[id] as number);
        if (space.lockedMin[id]! > 0) minimum.set(id, space.lockedMin[id] as number);
    }
    const owned = [...request.deck, ...request.trunk.map(({ id }) => id)];
    for (const id of owned) {
        if (space.candidates.includes(id) || forbidden.includes(id)) continue;
        // Not a candidate: either kept as the deck holds it, or pinned at the copies a lock asks for.
        limits.set(id, space.lockedMin[id] as number);
        fixed.set(id, space.lockedMin[id] as number);
    }
    let best = -1;
    forEachDeck(
        limits,
        fixed,
        (deck) => (best = Math.max(best, scorer(deck))),
        request.deck.length,
        minimum
    );
    return best;
}

function totalOf(cards: ArrayLike<number>): number {
    return scoreDeck(evaluator, cards).totalAtk;
}

function plan(
    request: DeckOptimizeRequest,
    keep: boolean,
    locked: DeckLock[] = [],
    forbidden: number[] = []
) {
    const space = buildSearchSpace(evaluator, request.deck, request.trunk, keep, locked, forbidden);
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
        expect(kept.lockedMin[magic[0] as number]).toBe(1);
        expect(kept.lockedMin[weak[0] as number]).toBe(0);
        expect(kept.candidates).not.toContain(magic[0]);
        expect(kept.candidates).not.toContain(magic[1]);
        const free = buildSearchSpace(
            evaluator,
            request.deck,
            [{ id: magic[1] as number, count: 2 }],
            false
        );
        expect(free.lockedMin[magic[0] as number]).toBe(0);
        expect(free.candidates).toContain(magic[0]);
        expect(free.candidates).toContain(magic[1]);
    });

    it("keeps the locked copies, and leaves a locked card with spare copies a candidate for them", () => {
        const request = pool(2, true);
        const [a, b] = [weak[0] as number, weak[1] as number];
        // Without keeping non-monsters, so the lock on the magic card is the only thing that holds it.
        const space = buildSearchSpace(
            evaluator,
            request.deck,
            [...request.trunk, { id: a, count: 5 }],
            false,
            [
                { id: a, count: 2 },
                { id: b, count: 3 },
                { id: magic[0] as number, count: 1 },
            ]
        );
        expect(space.lockedMin[a]).toBe(2);
        expect(space.lockedMin[b]).toBe(3);
        expect(space.lockedMin[magic[0] as number]).toBe(1);
        // `a` is held 3 times and limited to 3, so one copy may still come or go; `b` and the magic card
        // have nothing above their locks.
        expect(space.candidates).toContain(a);
        expect(space.candidates).not.toContain(b);
        expect(space.candidates).not.toContain(magic[0]);
    });

    it("adds the explicit locks to the non-monsters that are kept, and ignores locks above the copies held", () => {
        const request = pool(2, true);
        const space = buildSearchSpace(evaluator, request.deck, request.trunk, true, [
            { id: weak[0] as number, count: 1 },
            { id: weak[1] as number, count: 9 },
        ]);
        expect(space.lockedMin[magic[0] as number]).toBe(1);
        expect(space.lockedMin[weak[0] as number]).toBe(1);
        expect(space.lockedMin[weak[1] as number]).toBe(3);
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

    it("pins the locked copies, leaves out fewer cards, and counts only the movable copies in the deck", () => {
        const [a, b] = [weak[0] as number, weak[1] as number];
        const locked = [
            { id: a, count: 2 },
            { id: b, count: 3 },
        ];
        const { plan: found } = plan(pool(2), true, locked);
        expect([...(found?.pinned ?? [])].sort()).toEqual([a, a, b, b, b].sort());
        // 14 cards in the pool, 5 of them pinned: 9 may be left out, 2 of them, among C(9, 2) decks.
        expect(found?.movable).toHaveLength(9);
        expect(found?.leaveOut).toBe(2);
        expect(found?.decks).toBe(36);
        // The third copy of `a` is the only one of its card that is still in the deck and movable.
        const copiesOfA = found!.movable.map((id, i) => ({ id, i })).filter(({ id }) => id === a);
        expect(copiesOfA).toHaveLength(1);
        expect(found?.inCurrent[copiesOfA[0]!.i]).toBe(true);
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

    it("matches a brute force on seeded random pools with random locks, with and without kept non-monsters", () => {
        const random = testRandom(77);
        const cards = [...weak, ...fusionRichMonsters().slice(0, 25), ...magic];
        for (let round = 0; round < 6; round++) {
            const pick = () => cards[Math.floor(random() * cards.length)] as number;
            const deck = Array.from({ length: SIZE }, pick);
            const trunk = [...countOf(Array.from({ length: 2 + (round % 2) }, pick))].map(([id, count]) => ({
                id,
                count,
            }));
            const request: DeckOptimizeRequest = { deck, trunk };
            // Lock a random share of the copies of a few random cards of the deck.
            const locked = [...countOf(deck)]
                .filter(() => random() < 0.4)
                .map(([id, copies]) => ({ id, count: 1 + Math.floor(random() * copies) }));
            for (const keep of [true, false]) {
                const { plan: found } = plan(request, keep, locked);
                if (found === null) continue;
                const best = exhaustiveBest(evaluator, found);
                expect(totalOf(best), `round ${round}`).toBe(bruteForceBest(request, keep, locked));
                const kept = countOf(best);
                for (const { id, count } of locked) {
                    expect(kept.get(id) ?? 0, `round ${round}`).toBeGreaterThanOrEqual(count);
                }
            }
        }
    });

    it("keeps a locked card the unlocked best deck would drop", () => {
        const request = pool(2);
        const best = exhaustiveBest(evaluator, plan(request, true).plan!);
        const dropped = [...countOf(request.deck)].find(
            ([id, copies]) => copies > (countOf(best).get(id) ?? 0)
        );
        expect(dropped).toBeDefined();
        const [id] = dropped!;
        const locked = [{ id, count: countOf(request.deck).get(id) as number }];
        const again = exhaustiveBest(evaluator, plan(request, true, locked).plan!);
        expect(countOf(again).get(id)).toBe(locked[0]!.count);
        expect(totalOf(again)).toBe(bruteForceBest(request, true, locked));
        expect(totalOf(again)).toBeLessThanOrEqual(totalOf(best));
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

describe("buildSearchSpace with required and forbidden cards", () => {
    it("lets a lock ask for more copies than the deck holds, up to the copy limit", () => {
        const request = pool(0);
        const [a, b] = [strong[0] as number, strong[1] as number];
        const trunk = [
            { id: a, count: 2 },
            { id: b, count: 5 },
        ];
        const space = buildSearchSpace(evaluator, request.deck, trunk, true, [
            { id: a, count: 2 },
            { id: b, count: 5 },
        ]);
        // Both copies owned are required; the lock above the copy limit is held at the limit.
        expect(space.lockedMin[a]).toBe(2);
        expect(space.lockedMin[b]).toBe(MAX_COPIES_PER_CARD);
        // `a` has nothing above its requirement, `b` neither.
        expect(space.candidates).not.toContain(a);
        expect(space.candidates).not.toContain(b);
        const partial = buildSearchSpace(evaluator, request.deck, trunk, true, [{ id: a, count: 1 }]);
        expect(partial.lockedMin[a]).toBe(1);
        expect(partial.candidates).toContain(a);
    });

    it("takes the larger of the copies in the deck and the copies a lock asks for, for a kept card", () => {
        const request = pool(0, true);
        const trunk = [{ id: magic[0] as number, count: 2 }];
        const space = buildSearchSpace(evaluator, request.deck, trunk, true, [
            { id: magic[0] as number, count: 3 },
        ]);
        expect(space.lockedMin[magic[0] as number]).toBe(3);
        const below = buildSearchSpace(evaluator, request.deck, trunk, true, [
            { id: magic[0] as number, count: 1 },
        ]);
        expect(below.lockedMin[magic[0] as number]).toBe(1);
    });

    it("gives a forbidden card no copies and no place among the candidates, even a kept non-monster", () => {
        const request = pool(2, true);
        const space = buildSearchSpace(
            evaluator,
            request.deck,
            request.trunk,
            true,
            [],
            [weak[0] as number, magic[0] as number, strong[0] as number]
        );
        for (const id of [weak[0], magic[0], strong[0]] as number[]) {
            expect(space.limit[id]).toBe(0);
            expect(space.lockedMin[id]).toBe(0);
            expect(space.candidates).not.toContain(id);
        }
        // The cards around it are untouched.
        expect(space.candidates).toContain(weak[1]);
        expect(space.candidates).toContain(strong[1]);
    });
});

describe("planExhaustive with required and forbidden cards", () => {
    it("pins a required spare card and counts none of its copies as part of the deck", () => {
        const a = strong[0] as number;
        const { plan: found } = plan(pool(2), true, [{ id: a, count: 1 }]);
        expect(found?.pinned).toEqual([a]);
        expect(found?.movable).toHaveLength(13);
        expect(found?.leaveOut).toBe(2);
        expect(found?.decks).toBe(78);
    });

    it("leaves a forbidden card out of the pool, so it cannot be in any deck", () => {
        const request = pool(4);
        const { plan: found } = plan(request, true, [], [weak[0] as number]);
        expect(found?.movable).not.toContain(weak[0]);
        // 16 owned cards, 3 of them forbidden: 13 for a deck of 12.
        expect(found?.movable).toHaveLength(13);
        expect(found?.leaveOut).toBe(1);
        expect(exhaustiveBest(evaluator, found!)).not.toContain(weak[0]);
    });

    it("refuses a space with no deck of that size", () => {
        const request = pool(2);
        const [a, b, c, d, e] = strong.slice(0, 5) as number[];
        // 14 owned cards and 3 of them forbidden: 11 cannot make a deck of 12.
        expect(() => plan(request, true, [], [weak[0] as number])).toThrow(/no deck of 12 cards/);
        // 13 cards required, among them the five that exist only as one copy each.
        const trunk = [a, b, c, d, e].map((id) => ({ id, count: 1 }));
        const locks = [
            { id: weak[0] as number, count: 3 },
            { id: weak[1] as number, count: 3 },
            { id: weak[2] as number, count: 3 },
            { id: weak[3] as number, count: 3 },
            { id: a, count: 1 },
        ];
        expect(() =>
            planExhaustive(
                evaluator,
                request.deck,
                buildSearchSpace(evaluator, request.deck, trunk, true, locks)
            )
        ).toThrow(/13 required/);
    });
});

describe("exhaustiveBest with required and forbidden cards", () => {
    it("matches a brute force on seeded random pools with random required and forbidden cards", () => {
        const random = testRandom(404);
        const cards = [...weak, ...fusionRichMonsters().slice(0, 25), ...magic];
        let checked = 0;
        for (let round = 0; round < 24 && checked < 8; round++) {
            const pick = () => cards[Math.floor(random() * cards.length)] as number;
            const deck = Array.from({ length: SIZE }, pick);
            const trunk = [...countOf(Array.from({ length: 3 + (round % 3) }, pick))].map(([id, count]) => ({
                id,
                count,
            }));
            const request: DeckOptimizeRequest = { deck, trunk };
            const owned = countOf([
                ...deck,
                ...trunk.flatMap(({ id, count }) => Array<number>(count).fill(id)),
            ]);
            const ids = [...owned.keys()];
            // Some cards forbidden; some of the rest required, up to what the deck may hold, spare copies included.
            const forbidden = ids.filter(() => random() < 0.2);
            const locked = ids
                .filter((id) => !forbidden.includes(id) && random() < 0.4)
                .map((id) => ({
                    id,
                    count: 1 + Math.floor(random() * Math.min(owned.get(id) as number, MAX_COPIES_PER_CARD)),
                }));
            for (const keep of [true, false]) {
                let found: ReturnType<typeof plan>["plan"];
                try {
                    found = plan(request, keep, locked, forbidden).plan;
                } catch {
                    // The rules left no deck of this size.
                    continue;
                }
                if (found === null) continue;
                checked++;
                const best = exhaustiveBest(evaluator, found);
                expect(best, `round ${round}`).toHaveLength(SIZE);
                expect(totalOf(best), `round ${round}`).toBe(
                    bruteForceBest(request, keep, locked, forbidden)
                );
                const held = countOf(best);
                for (const id of forbidden) expect(held.has(id), `round ${round}`).toBe(false);
                for (const { id, count } of locked) {
                    expect(held.get(id) ?? 0, `round ${round}`).toBeGreaterThanOrEqual(count);
                }
            }
        }
        expect(checked).toBeGreaterThanOrEqual(4);
    });

    it("brings a required spare card in, and gives the one deck the rules leave when they fill it", () => {
        const request = pool(2);
        const [a, b] = [strong[0] as number, strong[1] as number];
        const best = exhaustiveBest(evaluator, plan(request, true, [{ id: a, count: 1 }]).plan!);
        expect(countOf(best).get(a)).toBe(1);
        expect(totalOf(best)).toBe(bruteForceBest(request, true, [{ id: a, count: 1 }]));
        // Twelve required copies: the whole deck is fixed, and the plan holds a single deck.
        const locked = [
            { id: weak[0] as number, count: 3 },
            { id: weak[1] as number, count: 3 },
            { id: weak[2] as number, count: 3 },
            { id: a, count: 1 },
            { id: b, count: 1 },
            { id: weak[3] as number, count: 1 },
        ];
        const { plan: found } = plan(request, true, locked);
        expect(found?.decks).toBe(1);
        // Every copy that is not required is left out.
        expect(found?.leaveOut).toBe(found?.movable.length);
        expect(countOf(exhaustiveBest(evaluator, found!))).toEqual(
            new Map(locked.map(({ id, count }) => [id, count]))
        );
    });
});

describe("feasibleStart", () => {
    function space(
        request: DeckOptimizeRequest,
        keep: boolean,
        locked: DeckLock[] = [],
        forbidden: number[] = []
    ) {
        return buildSearchSpace(evaluator, request.deck, request.trunk, keep, locked, forbidden);
    }

    it("returns the same cards in the same slots when the deck already obeys the rules", () => {
        const random = testRandom(9);
        const cards = [...weak, ...fusionRichMonsters().slice(0, 25), ...magic];
        for (let round = 0; round < 6; round++) {
            const pick = () => cards[Math.floor(random() * cards.length)] as number;
            const deck = Array.from({ length: SIZE }, pick);
            const request: DeckOptimizeRequest = { deck, trunk: [{ id: strong[0] as number, count: 2 }] };
            const owned = countOf(deck);
            // A lock on a share of what the deck holds, and a forbid on a card it does not.
            const locked = [...owned].filter(() => random() < 0.5).map(([id, count]) => ({ id, count }));
            for (const keep of [true, false]) {
                const rules = space(request, keep, locked, [strong[1] as number]);
                expect(obeysRules(evaluator, rules, deck)).toBe(true);
                expect([...feasibleStart(evaluator, rules, deck)], `round ${round}`).toEqual(deck);
            }
        }
        const plain = space(pool(2), true);
        expect([...feasibleStart(evaluator, plain, pool(2).deck)]).toEqual(pool(2).deck);
    });

    it("replaces each forbidden copy with the strongest allowed card, leaving the other slots alone", () => {
        const request = pool(4);
        const rules = space(request, true, [], [weak[0] as number]);
        expect(obeysRules(evaluator, rules, request.deck)).toBe(false);
        const start = feasibleStart(evaluator, rules, request.deck);
        expect(start).toHaveLength(SIZE);
        expect(obeysRules(evaluator, rules, start)).toBe(true);
        expect([...start]).not.toContain(weak[0]);
        start.forEach((id, slot) => {
            if (request.deck[slot] !== weak[0]) expect(id).toBe(request.deck[slot]);
        });
        // The copies that entered are the strongest by their own ATK: no allowed copy left unused is stronger.
        const entered = start.filter((_id, slot) => request.deck[slot] === weak[0]);
        expect(entered).toHaveLength(3);
        const held = countOf(start);
        const weakestEntered = Math.min(...entered.map((id) => evaluator.attack[id]!));
        for (const id of rules.candidates) {
            if ((held.get(id) ?? 0) < rules.limit[id]!) {
                expect(evaluator.attack[id]).toBeLessThanOrEqual(weakestEntered);
            }
        }
    });

    it("makes room for a required spare card by taking out the weakest copy that may leave", () => {
        const request = pool(2);
        const a = strong[0] as number;
        const rules = space(request, true, [{ id: a, count: 1 }]);
        const start = feasibleStart(evaluator, rules, request.deck);
        expect(obeysRules(evaluator, rules, start)).toBe(true);
        expect(countOf(start).get(a)).toBe(1);
        const left = [...request.deck];
        for (const id of start) {
            const at = left.indexOf(id);
            if (at >= 0) left.splice(at, 1);
        }
        // One deck card left; it has the lowest ATK of the deck.
        expect(left).toHaveLength(1);
        expect(evaluator.attack[left[0] as number]).toBe(
            Math.min(...request.deck.map((id) => evaluator.attack[id]!))
        );
    });

    it("never takes out a copy that must stay, even when it is the weakest", () => {
        const request = pool(2);
        const [a, w] = [strong[0] as number, weak[0] as number];
        const rules = space(request, true, [
            { id: w, count: 3 },
            { id: a, count: 1 },
        ]);
        const start = feasibleStart(evaluator, rules, request.deck);
        expect(countOf(start).get(w)).toBe(3);
        expect(countOf(start).get(a)).toBe(1);
        expect(obeysRules(evaluator, rules, start)).toBe(true);
    });

    it("gives the same deck every time, and refuses rules that leave no deck", () => {
        const request = pool(4);
        const rules = space(request, true, [{ id: strong[0] as number, count: 1 }], [weak[1] as number]);
        expect(feasibleStart(evaluator, rules, request.deck)).toEqual(
            feasibleStart(evaluator, rules, request.deck)
        );
        expect(() =>
            feasibleStart(evaluator, space(pool(2), true, [], [weak[0] as number]), pool(2).deck)
        ).toThrow(/no deck of 12 cards/);
    });
});

describe("localSearch", () => {
    const never = (): boolean => false;
    function search(
        request: DeckOptimizeRequest,
        keep: boolean,
        extra: {
            expired?: () => boolean;
            seed?: number;
            tabuSteps?: number;
            locked?: DeckLock[];
            forbidden?: number[];
        } = {}
    ) {
        const space = buildSearchSpace(
            evaluator,
            request.deck,
            request.trunk,
            keep,
            extra.locked,
            extra.forbidden
        );
        return localSearch(evaluator, space, feasibleStart(evaluator, space, request.deck), {
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

    it("never drops a locked copy, whatever the seed, and still finds the best deck that keeps them", () => {
        const request = pool(4, true);
        const [a, b] = [weak[0] as number, weak[1] as number];
        // A copy of a weak card, the magic card (with non-monsters free to move) and all of another weak card.
        const locked = [
            { id: a, count: 1 },
            { id: b, count: 3 },
            { id: magic[0] as number, count: 1 },
        ];
        for (const seed of [1, 2, 3, 4]) {
            for (const tabuSteps of [0, 2]) {
                const result = search(request, false, { seed, tabuSteps, locked });
                const held = countOf(result.deck);
                for (const { id, count } of locked) {
                    expect(held.get(id) ?? 0, `seed ${seed}`).toBeGreaterThanOrEqual(count);
                }
                expect(result.truncated).toBe(false);
                expect(totalOf(result.deck)).toBe(bruteForceBest(request, false, locked));
            }
        }
    });

    it("keeps the locked copies when the budget ends in the middle", () => {
        const request = pool(4);
        const locked = [{ id: weak[1] as number, count: 3 }];
        for (const checks of [2, 5, 12, 30]) {
            let reads = 0;
            const result = search(request, true, { locked, expired: () => ++reads > checks });
            expect(countOf(result.deck).get(weak[1] as number)).toBeGreaterThanOrEqual(3);
        }
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
    describe("with required and forbidden cards", () => {
        // The deck holds the forbidden weak[0] three times and lacks the required strong[0].
        const rules = () => ({
            locked: [{ id: strong[0] as number, count: 1 }],
            forbidden: [weak[0] as number],
        });

        function expectObeys(deck: ArrayLike<number>, label: string) {
            const { locked, forbidden } = rules();
            const held = countOf(deck);
            expect(deck, label).toHaveLength(SIZE);
            for (const id of forbidden) expect(held.has(id), label).toBe(false);
            for (const { id, count } of locked)
                expect(held.get(id) ?? 0, label).toBeGreaterThanOrEqual(count);
        }

        it("holds the required copy and no forbidden card, whatever the seed, and finds the best deck that obeys", () => {
            const request = pool(4);
            const { locked, forbidden } = rules();
            for (const seed of [1, 2, 3]) {
                const result = search(request, true, { seed, tabuSteps: 0, locked, forbidden });
                expectObeys(result.deck, `seed ${seed}`);
                expect(result.truncated).toBe(false);
                expect(totalOf(result.deck)).toBe(bruteForceBest(request, true, locked, forbidden));
            }
        });

        it("gives a valid deck when the budget is already spent at the first check", () => {
            const request = pool(4);
            const { locked, forbidden } = rules();
            const result = search(request, true, { locked, forbidden, expired: () => true });
            expect(result.truncated).toBe(true);
            expectObeys(result.deck, "spent");
            expect(result.deck).toEqual(
                feasibleStart(
                    evaluator,
                    buildSearchSpace(evaluator, request.deck, request.trunk, true, locked, forbidden),
                    request.deck
                )
            );
        });

        it.each([1, 2, 5, 12, 30, 80])(
            "gives a valid deck when the budget ends after %i checks",
            (checks) => {
                const request = pool(4);
                const { locked, forbidden } = rules();
                let reads = 0;
                const result = search(request, true, { locked, forbidden, expired: () => ++reads > checks });
                expectObeys(result.deck, `${checks} checks`);
            }
        );

        it("refuses rules that leave no deck", () => {
            const request = pool(2);
            expect(() => search(request, true, { forbidden: [weak[0] as number] })).toThrow(
                /no deck of 12 cards/
            );
        });
    });
});
