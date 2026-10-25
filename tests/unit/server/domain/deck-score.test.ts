import { beforeAll, describe, expect, it, vi } from "vitest";
import { getCardById, loadStore } from "../../../../src/server/data/store.js";
import { findBestChains } from "../../../../src/server/domain/chain-search.js";
import {
    DEAD_ATK,
    HAND_COMBINATIONS,
    THRESHOLD_STRONG,
    THRESHOLD_TOP,
    handCount,
    scoreDeck,
} from "../../../../src/server/domain/deck-score.js";
import { getHandEvaluator, type HandEvaluator } from "../../../../src/server/domain/hand-evaluator.js";
import { deckOf, fusionRichMonsters, referencePlay } from "../helpers/deck-fixtures.js";

// Coverage instrumentation makes the 40-card brute force several times slower.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let evaluator: HandEvaluator;

beforeAll(() => {
    loadStore();
    evaluator = getHandEvaluator();
});

interface Outcome {
    atk: number;
    // ATK of the fusion result that beats every card played as it is, or 0.
    fusedAtk: number;
}

interface BruteForce {
    total: number;
    strong: number;
    top: number;
    dead: number;
    fused: Map<number, number>;
}

// Brute force over all C(n, 5) slot combinations, scoring each distinct hand once with the slow reference.
function bruteForce(cards: readonly number[]): BruteForce {
    const memo = new Map<number, Outcome>();
    const outcome = (hand: number[]): Outcome => {
        const sorted = [...hand].sort((a, b) => a - b);
        const key = sorted.reduce((k, id) => k * 1024 + id, 0);
        let known = memo.get(key);
        if (known === undefined) {
            const own = Math.max(...sorted.map((id) => getCardById(id)?.Attack ?? 0));
            const top = findBestChains(sorted).chains[0]?.finalCard.attack ?? 0;
            known = { atk: referencePlay(sorted), fusedAtk: top > own ? top : 0 };
            memo.set(key, known);
        }
        return known;
    };
    const result: BruteForce = { total: 0, strong: 0, top: 0, dead: 0, fused: new Map() };
    const n = cards.length;
    for (let a = 0; a < n - 4; a++)
        for (let b = a + 1; b < n - 3; b++)
            for (let c = b + 1; c < n - 2; c++)
                for (let d = c + 1; d < n - 1; d++)
                    for (let e = d + 1; e < n; e++) {
                        const { atk, fusedAtk } = outcome([
                            cards[a]!,
                            cards[b]!,
                            cards[c]!,
                            cards[d]!,
                            cards[e]!,
                        ]);
                        result.total += atk;
                        if (atk >= THRESHOLD_STRONG) result.strong++;
                        if (atk >= THRESHOLD_TOP) result.top++;
                        if (atk <= DEAD_ATK) result.dead++;
                        if (fusedAtk > 0) result.fused.set(fusedAtk, (result.fused.get(fusedAtk) ?? 0) + 1);
                    }
    return result;
}

// The fusion results the score names, grouped by their ATK (two results of the same ATK tie for a hand).
function finalsByAtk(finals: ReadonlyMap<number, number>): Map<number, number> {
    const byAtk = new Map<number, number>();
    for (const [id, hands] of finals) {
        const attack = getCardById(id)?.Attack ?? 0;
        byAtk.set(attack, (byAtk.get(attack) ?? 0) + hands);
    }
    return byAtk;
}

describe("scoreDeck", () => {
    it("matches a brute force over every 5-card slot combination of a 12-card deck", () => {
        const deck = deckOf(fusionRichMonsters().slice(0, 4), 3, 12);
        const expected = bruteForce(deck);
        const score = scoreDeck(evaluator, deck);
        expect(score.hands).toBe(792);
        expect(score.totalAtk).toBe(expected.total);
        expect(score.strong).toBe(expected.strong);
        expect(score.top).toBe(expected.top);
        expect(score.dead).toBe(expected.dead);
        expect(finalsByAtk(score.finals)).toEqual(expected.fused);
        expect(expected.fused.size).toBeGreaterThan(0);
    });

    it("matches a brute force over every C(40, 5) slot combination of a 40-card deck", () => {
        // 13 cards in 3 copies and one in a single copy: 14 distinct, so hands repeat and can be memoised.
        const deck = deckOf(fusionRichMonsters().slice(0, 14), 3);
        const expected = bruteForce(deck);
        const score = scoreDeck(evaluator, deck);
        expect(score.hands).toBe(HAND_COMBINATIONS);
        expect(score.totalAtk).toBe(expected.total);
        expect(score.strong).toBe(expected.strong);
        expect(score.top).toBe(expected.top);
        expect(score.dead).toBe(expected.dead);
        expect(finalsByAtk(score.finals)).toEqual(expected.fused);
        expect(score.strong).toBeGreaterThanOrEqual(score.top);
    });

    it("counts C(n, 5) hands", () => {
        expect(handCount(5)).toBe(1);
        expect(handCount(12)).toBe(792);
        expect(handCount(40)).toBe(658_008);
        expect(HAND_COMBINATIONS).toBe(658_008);
    });

    it("rejects a deck too small to deal a hand", () => {
        expect(() => scoreDeck(evaluator, [1, 2, 3, 4])).toThrow(/at least 5 cards/);
    });
});
