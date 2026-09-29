import { beforeAll, describe, expect, it } from "vitest";
import type { RitualData } from "../../../../src/shared/types.js";
import { getRitualRecipes, loadStore } from "../../../../src/server/data/store.js";
import { findRituals } from "../../../../src/server/domain/rituals.js";

const UNKNOWN_CARD = 999_999;

const YAMADRON_HAND = [666, 29, 31, 101];
// Blue-eyes Ultimate Dragon (4500), Zera The Mant (2800) and Magician of Black Chaos (2800).
const ULTIMATE_ZERA_CHAOS_HAND = [675, 1, 1, 1, 671, 85, 298, 377, 721, 7, 35, 417];

const NO_RITUAL_HANDS: ReadonlyArray<readonly [string, readonly number[]]> = [
    ["an empty hand", []],
    ["cards that belong to no recipe", [2, 8, 9, 10]],
    ["ids that match no card", [UNKNOWN_CARD, 999_998]],
    ["a lone ritual card", [666]],
    ["the materials without their ritual card", [29, 31, 101]],
];

function cardsOf(recipe: RitualData): number[] {
    return [recipe.RitualCard, recipe.Card1, recipe.Card2, recipe.Card3];
}

function recipeOf(ritualCard: number): RitualData {
    const recipe = getRitualRecipes().find((candidate) => candidate.RitualCard === ritualCard);
    if (!recipe) throw new Error(`No recipe for ritual card ${ritualCard}`);
    return recipe;
}

function resultIds(handIds: readonly number[], recipes?: readonly RitualData[]): number[] {
    return findRituals(handIds, recipes).map((ritual) => ritual.result.id);
}

describe("rituals domain", () => {
    beforeAll(() => {
        loadStore();
    });

    describe("with the recipes of the data", () => {
        it("finds Yamadron from the Yamadron Ritual and its three materials", () => {
            const rituals = findRituals(YAMADRON_HAND);
            expect(rituals).toHaveLength(1);
            const [ritual] = rituals;
            expect(ritual?.ritualCard).toMatchObject({ id: 666, name: "Yamadron Ritual" });
            expect(ritual?.materials.map((card) => card.id)).toEqual([29, 31, 101]);
            expect(ritual?.result).toMatchObject({
                id: 357,
                name: "Yamadron",
                attack: 1600,
                isMonster: true,
            });
        });

        it("keeps the recipe order of the materials whatever the order of the hand", () => {
            const shuffled = [101, 666, 31, 29];
            expect(findRituals(shuffled)).toEqual(findRituals(YAMADRON_HAND));
            expect(findRituals(shuffled)[0]?.materials.map((card) => card.id)).toEqual([29, 31, 101]);
        });

        it("detects every recipe when its four cards are in the hand", () => {
            const undetected = getRitualRecipes().filter(
                (recipe) => !resultIds(cardsOf(recipe)).includes(recipe.Result)
            );
            expect(undetected).toEqual([]);
        });

        it("does not detect a recipe when any one of its four cards is missing", () => {
            const detected: string[] = [];
            for (const recipe of getRitualRecipes()) {
                const cards = cardsOf(recipe);
                for (let missing = 0; missing < cards.length; missing++) {
                    const hand = cards.filter((_id, index) => index !== missing);
                    if (resultIds(hand).includes(recipe.Result)) {
                        detected.push(`${recipe.RitualCard} without its card #${missing}`);
                    }
                }
            }
            expect(detected).toEqual([]);
        });

        it("ignores extra cards, whether unrelated or unknown", () => {
            const hand = [2, 666, 8, 29, UNKNOWN_CARD, 31, 9, 101, 10];
            expect(resultIds(hand)).toEqual([357]);
        });

        it.each(NO_RITUAL_HANDS)("returns nothing for %s", (_name, hand) => {
            expect(findRituals(hand)).toEqual([]);
        });
    });

    // The Ultimate Dragon ritual (675) needs Blue-eyes White Dragon (1) three times: the only repeated material.
    describe("a recipe that repeats a material", () => {
        it("is available with the ritual card and all three copies", () => {
            const [ritual] = findRituals([1, 675, 2, 1, 1]);
            expect(ritual?.result.id).toBe(380);
            expect(ritual?.ritualCard.id).toBe(675);
            expect(ritual?.materials.map((card) => card.id)).toEqual([1, 1, 1]);
        });

        it("is available when the hand holds a spare copy", () => {
            expect(resultIds([675, 1, 1, 1, 1])).toEqual([380]);
        });

        it.each([
            ["two copies", [675, 1, 1]],
            ["one copy", [675, 1]],
            ["no copy", [675]],
            ["the copies but no ritual card", [1, 1, 1]],
        ])("is not available with %s", (_name, hand) => {
            expect(resultIds(hand)).toEqual([]);
        });
    });

    describe("ordering", () => {
        it("puts the highest result attack first and breaks ties by result id", () => {
            expect(resultIds(ULTIMATE_ZERA_CHAOS_HAND)).toEqual([380, 360, 722]);
        });

        it("does not depend on the order of the recipes it reads", () => {
            const zera = recipeOf(671);
            const chaos = recipeOf(721);
            const hand = [...cardsOf(zera), ...cardsOf(chaos)];
            expect(resultIds(hand, [zera, chaos])).toEqual([360, 722]);
            expect(resultIds(hand, [chaos, zera])).toEqual([360, 722]);
        });

        it("returns the 24 rituals in attack then id order when the hand holds every recipe", () => {
            const rituals = findRituals(getRitualRecipes().flatMap(cardsOf));
            const sorted = [...rituals].sort(
                (a, b) => b.result.attack - a.result.attack || a.result.id - b.result.id
            );
            expect(rituals).toHaveLength(24);
            expect(rituals).toEqual(sorted);
            expect(rituals.map((ritual) => ritual.result.id)).not.toEqual(
                getRitualRecipes().map((recipe) => recipe.Result)
            );
        });

        it("leaves the shared recipe list as it was", () => {
            const before = getRitualRecipes().map((recipe) => recipe.RitualCard);
            findRituals(getRitualRecipes().flatMap(cardsOf));
            expect(getRitualRecipes().map((recipe) => recipe.RitualCard)).toEqual(before);
        });
    });

    describe("with injected recipes", () => {
        const yamadron = { RitualCard: 666, Card1: 29, Card2: 31, Card3: 101, Result: 357 };

        it("needs a material twice when the recipe lists it twice", () => {
            const recipe = { ...yamadron, Card2: 29 };
            expect(resultIds([666, 29, 101], [recipe])).toEqual([]);
            expect(resultIds([666, 29, 29, 101], [recipe])).toEqual([357]);
        });

        it("needs two copies of the ritual card when it is also one of its materials", () => {
            const recipe = { ...yamadron, Card1: 666 };
            expect(resultIds([666, 31, 101], [recipe])).toEqual([]);
            expect(resultIds([666, 666, 31, 101], [recipe])).toEqual([357]);
        });

        it("evaluates each recipe on its own, so recipes that share materials are both available", () => {
            const other = { ...yamadron, RitualCard: 667, Result: 374 };
            expect(resultIds([666, 667, 29, 31, 101], [yamadron, other])).toEqual([374, 357]);
        });

        it.each(["RitualCard", "Card1", "Card2", "Card3", "Result"] as const)(
            "skips a recipe whose %s is missing from the store and keeps the others",
            (field) => {
                const broken = { ...yamadron, [field]: UNKNOWN_CARD };
                const hand = [...cardsOf(broken), ...cardsOf(recipeOf(675))];
                expect(resultIds(hand, [broken, recipeOf(675)])).toEqual([380]);
            }
        );
    });
});
