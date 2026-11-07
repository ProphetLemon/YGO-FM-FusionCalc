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
import { TERRAIN_IDS, TERRAINS, type TerrainId } from "../../../../src/shared/terrains.js";
import {
    fusionRichMonsters,
    referencePlay,
    referencePlayOnTerrain,
    testRandom,
} from "../helpers/deck-fixtures.js";

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

function atkOn(terrainEvaluator: HandEvaluator, hand: readonly number[]): number {
    return atkOfPlay(terrainEvaluator.play(hand[0]!, hand[1]!, hand[2]!, hand[3]!, hand[4]!));
}

// 200 hands of any cards, 200 of fusion-rich cards and 100 that hold a ritual card with its materials.
function terrainHands(terrain: TerrainId): number[][] {
    const random = testRandom(100 + TERRAIN_IDS.indexOf(terrain));
    const recipes = getRitualRecipes();
    const hands: number[][] = [];
    for (let i = 0; i < 200; i++) hands.push(randomHand(random, everyId));
    for (let i = 0; i < 200; i++) hands.push(randomHand(random, richIds));
    for (let i = 0; i < 100; i++) {
        const recipe = recipes[Math.floor(random() * recipes.length)]!;
        hands.push(
            [
                recipe.RitualCard,
                recipe.Card1,
                recipe.Card2,
                recipe.Card3,
                everyId[Math.floor(random() * everyId.length)] as number,
            ].sort(() => random() - 0.5)
        );
    }
    return hands;
}

describe("HandEvaluator on a terrain", () => {
    for (const terrain of TERRAIN_IDS) {
        it(`equals the terrain reference on 500 seeded hands on ${terrain}`, () => {
            const onTerrain = getHandEvaluator(terrain);
            let changed = 0;
            for (const hand of terrainHands(terrain)) {
                const expected = referencePlayOnTerrain(hand, terrain);
                expect(atkOn(onTerrain, hand), `hand ${hand.join(",")}`).toBe(expected);
                if (expected !== referencePlay(hand)) changed++;
            }
            // The terrain matters on these hands, so the comparison is not vacuous.
            expect(changed).toBeGreaterThan(0);
        });
    }

    it("is cached per terrain, apart from the base evaluator, and rebuilt with the store", () => {
        expect(getHandEvaluator(null)).toBe(evaluator);
        expect(getHandEvaluator(undefined)).toBe(evaluator);
        const umi = getHandEvaluator("umi");
        expect(umi).not.toBe(evaluator);
        expect(getHandEvaluator("umi")).toBe(umi);
        expect(getHandEvaluator("yami")).not.toBe(umi);
        expect(umi.terrain).toBe("umi");
        expect(evaluator.terrain).toBeNull();
        // The fusion table is shared, not rebuilt.
        expect(umi.fusion).toBe(evaluator.fusion);
        resetStore();
        loadStore();
        expect(getHandEvaluator("umi")).not.toBe(umi);
        evaluator = getHandEvaluator();
    });

    it("never alters the base evaluator", () => {
        const before = evaluator.attack.slice();
        const hands = terrainHands("umi").slice(0, 200);
        const plays = hands.map((hand) => atk(hand));
        for (const terrain of TERRAIN_IDS) getHandEvaluator(terrain);
        expect(evaluator.attack).toEqual(before);
        expect(hands.map((hand) => atk(hand))).toEqual(plays);
        for (const hand of hands.slice(0, 50))
            expect(atk(hand), `hand ${hand.join(",")}`).toBe(referencePlay(hand));
    });

    it("keeps two terrains independent", () => {
        const umi = getHandEvaluator("umi");
        const mountain = getHandEvaluator("mountain");
        const thunder = getAllCards().find((card) => card.Type === 15 && card.Attack >= 1000)!;
        const machine = getAllCards().find((card) => card.Type === 14 && card.Attack >= 1000)!;
        // A Thunder monster gains on both; a Machine loses only on Umi.
        expect(umi.attack[thunder.Id]).toBe(thunder.Attack + 500);
        expect(mountain.attack[thunder.Id]).toBe(thunder.Attack + 500);
        expect(umi.attack[machine.Id]).toBe(machine.Attack - 500);
        expect(mountain.attack[machine.Id]).toBe(machine.Attack);
        expect(evaluator.attack[machine.Id]).toBe(machine.Attack);
    });

    it("applies the table by Type and leaves the other Types and non-monsters alone", () => {
        for (const terrain of TERRAIN_IDS) {
            const onTerrain = getHandEvaluator(terrain);
            const { boosted, weakened } = TERRAINS[terrain];
            for (const card of getAllCards()) {
                if (!isMonster(card)) {
                    expect(onTerrain.attack[card.Id]).toBe(0);
                    continue;
                }
                const delta = boosted.includes(card.Type) ? 500 : weakened.includes(card.Type) ? -500 : 0;
                expect(onTerrain.attack[card.Id]).toBe(Math.max(0, card.Attack + delta));
            }
        }
    });

    it("never goes below 0: a weakened monster of less than 500 ATK is worth 0", () => {
        // Dragon Piper (Pyro, 200 ATK) on Umi and Key Mace (Fairy, 400 ATK) on Yami.
        const inert = getAllCards()
            .filter((card) => !isMonster(card) && card.Type !== 22)
            .slice(0, 4)
            .map((card) => card.Id);
        const cases: Array<[TerrainId, number]> = [
            ["umi", 40],
            ["yami", 192],
        ];
        for (const [terrain, id] of cases) {
            const onTerrain = getHandEvaluator(terrain);
            expect(getCardById(id)!.Attack).toBeLessThan(500);
            expect(onTerrain.attack[id]).toBe(0);
            // Alone with cards that fuse into nothing, it plays as 0, never as a negative number.
            const hand = [id, ...inert];
            expect(atkOn(onTerrain, hand)).toBe(0);
            // Self-fusing may still make a stronger card; the oracle says how much.
            const pair = [id, id, id, id, id];
            expect(atkOn(onTerrain, pair)).toBe(referencePlayOnTerrain(pair, terrain));
        }
        for (const terrain of TERRAIN_IDS) {
            const onTerrain = getHandEvaluator(terrain);
            for (const card of getAllCards()) expect(onTerrain.attack[card.Id]).toBeGreaterThanOrEqual(0);
        }
    });
});
