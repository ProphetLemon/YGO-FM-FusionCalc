import { beforeAll, describe, expect, it } from "vitest";
import { DECK_SIZE, MAX_COPIES_PER_CARD } from "../../../../src/shared/limits.js";
import type { DeckOptimizeRequest } from "../../../../src/shared/types.js";
import { getAllCards, loadStore } from "../../../../src/server/data/store.js";
import { optimizeDeck, type DeckOptimizeOptions } from "../../../../src/server/domain/deck-optimizer.js";
import { isMonster } from "../../../../src/server/domain/cards.js";

// Small samples keep the tests quick; the search itself is the same.
const FAST: DeckOptimizeOptions = { searchHands: 400, checkHands: 3_000 };

let weakMonsters: number[];
let strongMonsters: number[];
let nonMonsters: number[];

beforeAll(() => {
    loadStore();
    const monsters = getAllCards()
        .filter(isMonster)
        .sort((a, b) => a.Attack - b.Attack || a.Id - b.Id);
    weakMonsters = monsters.slice(0, 14).map((card) => card.Id);
    strongMonsters = monsters.slice(-8).map((card) => card.Id);
    nonMonsters = getAllCards()
        .filter((card) => !isMonster(card))
        .slice(0, 5)
        .map((card) => card.Id);
});

// 40 slots filled from the ids in turn, so no id appears more than ceil(40 / ids.length) times.
function fillDeck(ids: number[]): number[] {
    return Array.from({ length: DECK_SIZE }, (_, i) => ids[i % ids.length] as number);
}

function weakDeckRequest(): DeckOptimizeRequest {
    return {
        deck: fillDeck(weakMonsters),
        trunk: strongMonsters.map((id) => ({ id, count: 3 })),
    };
}

function countOf(ids: number[]): Map<number, number> {
    const counts = new Map<number, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
}

describe("optimizeDeck", () => {
    it("gives the same result for the same seed", () => {
        const request = weakDeckRequest();
        expect(optimizeDeck(request, { ...FAST, seed: 7 })).toEqual(
            optimizeDeck(request, { ...FAST, seed: 7 })
        );
    });

    it("is deterministic with the default seed too", () => {
        const request = weakDeckRequest();
        expect(optimizeDeck(request, FAST)).toEqual(optimizeDeck(request, FAST));
    });

    it("improves an obviously bad deck when strong cards are spare", () => {
        const result = optimizeDeck(weakDeckRequest(), FAST);
        expect(result.swaps.length).toBeGreaterThan(0);
        expect(result.recommended.averageBestAtk).toBeGreaterThan(result.current.averageBestAtk);
        expect(result.truncated).toBe(false);
        const entering = result.swaps.map((swap) => swap.in.id);
        expect(entering.every((id) => strongMonsters.includes(id))).toBe(true);
    });

    it("returns 40 cards in the slots of the current deck and swaps that explain the change", () => {
        const request = weakDeckRequest();
        const result = optimizeDeck(request, FAST);
        expect(result.deck).toHaveLength(DECK_SIZE);
        const counts = countOf(request.deck);
        for (const swap of result.swaps) {
            counts.set(swap.out.id, (counts.get(swap.out.id) ?? 0) - 1);
            counts.set(swap.in.id, (counts.get(swap.in.id) ?? 0) + 1);
        }
        const net = new Map([...counts].filter(([, copies]) => copies > 0));
        expect(net).toEqual(countOf(result.deck.map((card) => card.id)));
    });

    it("never uses more copies than owned, nor than MAX_COPIES_PER_CARD", () => {
        const request: DeckOptimizeRequest = {
            deck: fillDeck(weakMonsters),
            // Single copies of three strong cards, and plenty of another.
            trunk: [
                { id: strongMonsters[0] as number, count: 1 },
                { id: strongMonsters[1] as number, count: 1 },
                { id: strongMonsters[2] as number, count: 1 },
                { id: strongMonsters[3] as number, count: 255 },
            ],
        };
        const result = optimizeDeck(request, FAST);
        const owned = countOf(request.deck);
        for (const { id, count } of request.trunk) owned.set(id, (owned.get(id) ?? 0) + count);
        for (const [id, copies] of countOf(result.deck.map((card) => card.id))) {
            expect(copies, `card ${id}`).toBeLessThanOrEqual(owned.get(id) as number);
            if (!request.deck.includes(id))
                expect(copies, `card ${id}`).toBeLessThanOrEqual(MAX_COPIES_PER_CARD);
        }
        // The plentiful card is the best use of the spare slots, so the cap is what stops it.
        expect(
            countOf(result.deck.map((card) => card.id)).get(strongMonsters[3] as number)
        ).toBeLessThanOrEqual(MAX_COPIES_PER_CARD);
    });

    it("does not add copies to a card that is already at the limit", () => {
        const strong = strongMonsters[0] as number;
        const deck = [
            ...Array.from({ length: MAX_COPIES_PER_CARD }, () => strong),
            ...fillDeck(weakMonsters),
        ].slice(0, DECK_SIZE);
        const result = optimizeDeck({ deck, trunk: [{ id: strong, count: 10 }] }, FAST);
        expect(countOf(result.deck.map((card) => card.id)).get(strong)).toBe(MAX_COPIES_PER_CARD);
        expect(result.swaps).toEqual([]);
    });

    it("keeps every non-monster of the deck by default and when keepNonMonsters is true", () => {
        const deck = [...nonMonsters, ...fillDeck(weakMonsters)].slice(0, DECK_SIZE);
        const trunk = strongMonsters.map((id) => ({ id, count: 3 }));
        for (const options of [FAST, { ...FAST, keepNonMonsters: true }]) {
            const result = optimizeDeck({ deck, trunk }, options);
            nonMonsters.forEach((id, position) => expect(result.deck[position]?.id).toBe(id));
            expect(result.swaps.some((swap) => nonMonsters.includes(swap.out.id))).toBe(false);
        }
        const viaRequest = optimizeDeck({ deck, trunk, keepNonMonsters: true }, FAST);
        nonMonsters.forEach((id, position) => expect(viaRequest.deck[position]?.id).toBe(id));
    });

    it("swaps non-monsters out when keepNonMonsters is false", () => {
        const deck = [...nonMonsters, ...fillDeck(weakMonsters)].slice(0, DECK_SIZE);
        const trunk = strongMonsters.map((id) => ({ id, count: 3 }));
        const result = optimizeDeck({ deck, trunk }, { ...FAST, keepNonMonsters: false });
        expect(result.swaps.some((swap) => nonMonsters.includes(swap.out.id))).toBe(true);
    });

    it("returns the deck unchanged when there are no spare cards", () => {
        const request: DeckOptimizeRequest = { deck: fillDeck(weakMonsters), trunk: [] };
        const result = optimizeDeck(request, FAST);
        expect(result.swaps).toEqual([]);
        expect(result.deck.map((card) => card.id)).toEqual(request.deck);
        expect(result.recommended).toEqual(result.current);
        expect(result.truncated).toBe(false);
    });

    it("flags truncated when the evaluation budget runs out and still returns a deck", () => {
        const result = optimizeDeck(weakDeckRequest(), { ...FAST, maxEvaluations: 50 });
        expect(result.truncated).toBe(true);
        expect(result.deck).toHaveLength(DECK_SIZE);
    });

    it("flags truncated when the time budget runs out", () => {
        let clock = 0;
        const result = optimizeDeck(weakDeckRequest(), {
            ...FAST,
            maxMillis: 1_000,
            // Every reading is a second later, so the deadline passes at the first check.
            now: () => (clock += 1_000),
        });
        expect(result.truncated).toBe(true);
        expect(result.deck).toHaveLength(DECK_SIZE);
    });

    it("reports stats as fractions and the top fusion finals in descending share", () => {
        const result = optimizeDeck(weakDeckRequest(), FAST);
        for (const stats of [result.current, result.recommended]) {
            expect(stats.share1500).toBeGreaterThanOrEqual(stats.share2000);
            expect(stats.share1500).toBeLessThanOrEqual(1);
            expect(stats.share2000).toBeGreaterThanOrEqual(0);
        }
        expect(result.topFinals.length).toBeLessThanOrEqual(8);
        const shares = result.topFinals.map((final) => final.share);
        expect(shares).toEqual([...shares].sort((a, b) => b - a));
        expect(shares.every((share) => share >= 0 && share <= 1)).toBe(true);
    });

    it("accepts an injected random source", () => {
        let state = 1;
        const random = (): number => (state = (state * 16807) % 2147483647) / 2147483647;
        const result = optimizeDeck(weakDeckRequest(), { ...FAST, random });
        expect(result.deck).toHaveLength(DECK_SIZE);
    });

    it("stays within its budget on a late-game collection", () => {
        const trunk = getAllCards()
            .slice(0, 300)
            .map((card) => ({ id: card.Id, count: 3 }));
        const started = performance.now();
        const result = optimizeDeck({ deck: fillDeck(weakMonsters), trunk });
        // The 2 s search budget, plus the stats pass and generous slack for a slow machine.
        expect(performance.now() - started).toBeLessThan(6_000);
        expect(result.recommended.averageBestAtk).toBeGreaterThan(result.current.averageBestAtk);
    });
});
