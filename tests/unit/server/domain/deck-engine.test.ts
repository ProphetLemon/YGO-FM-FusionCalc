import { beforeAll, describe, expect, it } from "vitest";
import { loadStore } from "../../../../src/server/data/store.js";
import { DeltaEngine, fullSample, randomSample } from "../../../../src/server/domain/deck-engine.js";
import { handCount, scoreDeck } from "../../../../src/server/domain/deck-score.js";
import { seededRandom } from "../../../../src/server/domain/deck-search.js";
import { getHandEvaluator, type HandEvaluator } from "../../../../src/server/domain/hand-evaluator.js";
import { deckOf, fusionRichMonsters, monstersByAttack } from "../helpers/deck-fixtures.js";

const SIZE = 12;

let evaluator: HandEvaluator;
let deck: number[];
let outsiders: number[];

beforeAll(() => {
    loadStore();
    evaluator = getHandEvaluator();
    const rich = fusionRichMonsters();
    // The engine does not care about the copy limit: 12 slots of 4 cards, 3 copies each.
    deck = deckOf([...monstersByAttack().slice(0, 2), ...rich.slice(0, 2)], 3, SIZE);
    outsiders = rich.slice(2, 6);
});

function withSwap(cards: readonly number[], slot: number, card: number): number[] {
    const next = [...cards];
    next[slot] = card;
    return next;
}

function totalOf(cards: readonly number[]): number {
    return scoreDeck(evaluator, cards).totalAtk;
}

describe("subset samples", () => {
    it("the full sample holds all C(n, 4) subsets and scales by 1", () => {
        const sample = fullSample(SIZE);
        expect(sample.size).toBe(SIZE);
        expect(sample.count).toBe(495);
        expect(sample.scale).toBe(1);
        // A slot belongs to C(11, 3) = 165 subsets, each listing the other three slots.
        expect(sample.around.every((slots) => slots.length === 165 * 3)).toBe(true);
        expect(fullSample(SIZE)).toBe(sample);
    });

    it("a random sample is a fixed share of the subsets, reproducible from its seed", () => {
        const first = randomSample(SIZE, 0.2, seededRandom(3));
        expect(first.count).toBe(99);
        expect(first.scale).toBeCloseTo(5, 5);
        expect(randomSample(SIZE, 0.2, seededRandom(3)).subsets).toEqual(first.subsets);
        expect(randomSample(SIZE, 0.2, seededRandom(4)).subsets).not.toEqual(first.subsets);
        expect(first.around.every((slots) => slots.length % 3 === 0)).toBe(true);
    });
});

describe("DeltaEngine on all subsets", () => {
    it("reports the exact average best ATK", () => {
        const engine = new DeltaEngine(evaluator, deck, fullSample(SIZE));
        expect(engine.average()).toBeCloseTo(totalOf(deck) / handCount(SIZE), 9);
    });

    it("every gain equals the change in the exact average of the whole deck", () => {
        const engine = new DeltaEngine(evaluator, deck, fullSample(SIZE));
        const base = totalOf(deck);
        for (const card of outsiders) {
            engine.ensure(card);
            for (let slot = 0; slot < SIZE; slot++) {
                const gain = engine.gain(slot, card, engine.baseline(slot));
                const swapped = totalOf(withSwap(deck, slot, card));
                expect(gain).toBeCloseTo((swapped - base) / handCount(SIZE), 9);
            }
        }
    });

    it("stays exact after a series of swaps", () => {
        const engine = new DeltaEngine(evaluator, deck, fullSample(SIZE));
        for (const card of outsiders) engine.ensure(card);
        let now = [...deck];
        const swaps: Array<[number, number]> = [
            [0, outsiders[0] as number],
            [7, outsiders[1] as number],
            [3, outsiders[0] as number],
            [10, outsiders[2] as number],
        ];
        for (const [slot, card] of swaps) {
            engine.swap(slot, card);
            now = withSwap(now, slot, card);
            expect([...engine.deck]).toEqual(now);
            const total = totalOf(now);
            expect(engine.average()).toBeCloseTo(total / handCount(SIZE), 9);
            const gain = engine.gain(5, outsiders[3] as number, engine.baseline(5));
            expect(gain).toBeCloseTo(
                (totalOf(withSwap(now, 5, outsiders[3] as number)) - total) / handCount(SIZE),
                9
            );
        }
    });

    it("ignores a swap that puts the same card back, and forgets columns it no longer needs", () => {
        const engine = new DeltaEngine(evaluator, deck, fullSample(SIZE));
        engine.ensure(outsiders[0] as number);
        engine.swap(0, deck[0] as number);
        expect([...engine.deck]).toEqual(deck);
        engine.ensureDeck();
        engine.retain(new Set());
        expect(engine.has(outsiders[0] as number)).toBe(false);
        expect(engine.has(deck[0] as number)).toBe(true);
        expect(() => engine.gain(0, outsiders[0] as number, 0)).toThrow(/No column/);
    });

    it("rejects a sample made for another deck size", () => {
        expect(() => new DeltaEngine(evaluator, deck, fullSample(SIZE + 1))).toThrow(/13 slots, not 12/);
    });
});

describe("DeltaEngine on a sample", () => {
    it("estimates the average of a larger deck within a few percent", () => {
        const larger = deckOf(
            [...monstersByAttack().slice(0, 3), ...fusionRichMonsters().slice(0, 3)],
            4,
            24
        );
        const engine = new DeltaEngine(evaluator, larger, randomSample(24, 0.5, seededRandom(9)));
        const exact = totalOf(larger) / handCount(24);
        expect(Math.abs(engine.average() - exact)).toBeLessThan(exact * 0.05);
    });
});
