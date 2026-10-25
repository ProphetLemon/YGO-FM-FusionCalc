import { beforeAll, describe, expect, it, vi } from "vitest";
import {
    getAllCards,
    getCardById,
    getRitualRecipes,
    loadStore,
    resetStore,
} from "../../../../src/server/data/store.js";
import { isMonster } from "../../../../src/server/domain/cards.js";
import {
    HandEvaluator,
    atkOfPlay,
    fusionOfPlay,
    getHandEvaluator,
} from "../../../../src/server/domain/hand-evaluator.js";
import { fusionRichMonsters, referencePlay, testRandom } from "../helpers/deck-fixtures.js";

// These tests score hundreds of thousands of hands; coverage instrumentation and parallel files slow them down.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let evaluator: HandEvaluator;
let everyId: number[];
let richIds: number[];

beforeAll(() => {
    loadStore();
    evaluator = getHandEvaluator();
    everyId = getAllCards().map((card) => card.Id);
    richIds = fusionRichMonsters().slice(0, 120);
});

function atk(hand: readonly number[]): number {
    return atkOfPlay(evaluator.play(hand[0]!, hand[1]!, hand[2]!, hand[3]!, hand[4]!));
}

function randomHand(random: () => number, pool: readonly number[]): number[] {
    return Array.from({ length: 5 }, () => pool[Math.floor(random() * pool.length)] as number);
}

describe("HandEvaluator", () => {
    it("equals the reference on 3,000 seeded hands of any cards", () => {
        const random = testRandom(1);
        for (let i = 0; i < 3_000; i++) {
            const hand = randomHand(random, everyId);
            expect(atk(hand), `hand ${hand.join(",")}`).toBe(referencePlay(hand));
        }
    });

    it("equals the reference on 3,000 seeded hands of fusion-rich cards", () => {
        const random = testRandom(2);
        for (let i = 0; i < 3_000; i++) {
            const hand = randomHand(random, richIds);
            expect(atk(hand), `hand ${hand.join(",")}`).toBe(referencePlay(hand));
        }
    });

    it("equals the reference on 1,500 hands that hold a ritual card and its materials", () => {
        const random = testRandom(3);
        const recipes = getRitualRecipes();
        for (let i = 0; i < 1_500; i++) {
            const recipe = recipes[Math.floor(random() * recipes.length)]!;
            const hand = [
                recipe.RitualCard,
                recipe.Card1,
                recipe.Card2,
                recipe.Card3,
                everyId[Math.floor(random() * everyId.length)] as number,
            ].sort(() => random() - 0.5);
            expect(atk(hand), `hand ${hand.join(",")}`).toBe(referencePlay(hand));
        }
    });

    it("does not depend on the order of the hand", () => {
        const random = testRandom(4);
        for (let i = 0; i < 300; i++) {
            const hand = randomHand(random, richIds);
            const shuffled = [...hand].sort(() => random() - 0.5);
            expect(atk(shuffled)).toBe(atk(hand));
        }
    });

    it("scores the result of a ritual whose card and three materials are all in the hand", () => {
        for (const recipe of getRitualRecipes()) {
            const result = getCardById(recipe.Result)!;
            const hand = [recipe.RitualCard, recipe.Card1, recipe.Card2, recipe.Card3];
            const duplicates = new Set(hand).size < 4;
            const play = evaluator.play(hand[0]!, hand[1]!, hand[2]!, hand[3]!, hand[3]!);
            expect(atkOfPlay(play)).toBeGreaterThanOrEqual(isMonster(result) ? result.Attack : 0);
            // Without the last material the ritual is not complete, unless the recipe lists a card twice.
            if (!duplicates) {
                const partial = evaluator.play(hand[0]!, hand[1]!, hand[2]!, hand[1]!, hand[2]!);
                expect(atkOfPlay(partial)).toBe(
                    referencePlay([hand[0]!, hand[1]!, hand[2]!, hand[1]!, hand[2]!])
                );
            }
        }
    });

    it("scores a hand of non-monsters, which fuse into nothing, as 0 with no fusion", () => {
        const nonMonsters = getAllCards()
            .filter((card) => !isMonster(card) && card.Type !== 22)
            .slice(0, 5)
            .map((card) => card.Id);
        const play = evaluator.play(
            nonMonsters[0]!,
            nonMonsters[1]!,
            nonMonsters[2]!,
            nonMonsters[3]!,
            nonMonsters[4]!
        );
        expect(play).toBe(0);
        expect(atkOfPlay(play)).toBe(0);
        expect(fusionOfPlay(play)).toBe(0);
    });

    it("names the fusion result only when it beats every card played as it is", () => {
        const random = testRandom(5);
        let fused = 0;
        let plain = 0;
        for (let i = 0; i < 2_000; i++) {
            const hand = randomHand(random, richIds);
            const play = evaluator.play(hand[0]!, hand[1]!, hand[2]!, hand[3]!, hand[4]!);
            const own = Math.max(...hand.map((id) => evaluator.attack[id] as number));
            const final = fusionOfPlay(play);
            if (final === 0) {
                expect(atkOfPlay(play)).toBe(own);
                plain++;
            } else {
                expect(atkOfPlay(play)).toBe(getCardById(final)!.Attack);
                expect(atkOfPlay(play)).toBeGreaterThan(own);
                fused++;
            }
        }
        expect(fused).toBeGreaterThan(0);
        expect(plain).toBeGreaterThan(0);
    });

    it("is cached per loaded store and rebuilt when the store is loaded again", () => {
        expect(getHandEvaluator()).toBe(evaluator);
        resetStore();
        loadStore();
        const rebuilt = getHandEvaluator();
        expect(rebuilt).not.toBe(evaluator);
        expect(rebuilt.fusion).toEqual(evaluator.fusion);
        evaluator = rebuilt;
    });
});
