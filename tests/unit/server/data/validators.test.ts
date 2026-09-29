import { describe, expect, it } from "vitest";
import { validateCardsJson } from "../../../../src/server/data/validators.js";

const RITUAL_FIELDS = ["RitualCard", "Card1", "Card2", "Card3", "Result"] as const;

const BAD_CARD_IDS: ReadonlyArray<readonly [string, unknown]> = [
    ["zero", 0],
    ["a negative number", -1],
    ["a fraction", 1.5],
    ["a numeric string", "29"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["null", null],
];

function makeCard(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { Id: 1, Name: "Sample", Type: 0, ...extra };
}

function makeRecipe(): Record<string, unknown> {
    return { RitualCard: 666, Card1: 29, Card2: 31, Card3: 101, Result: 357 };
}

// The card under test goes second, so a failure also proves that the error reports its index.
function validateSecondCard(card: unknown): void {
    validateCardsJson([makeCard(), card]);
}

describe("validateCardsJson", () => {
    it("accepts cards with and without a ritual recipe", () => {
        expect(() =>
            validateCardsJson([
                makeCard({ Id: 1, Ritual: null }),
                makeCard({ Id: 2 }),
                makeCard({ Id: 3, Ritual: undefined }),
                makeCard({ Id: 666, Ritual: makeRecipe() }),
            ])
        ).not.toThrow();
    });

    it.each([
        ["undefined", undefined],
        ["null", null],
        ["an object", {}],
        ["a string", "cards"],
        ["an empty array", []],
    ])("rejects a payload that is %s", (_name, payload) => {
        expect(() => validateCardsJson(payload)).toThrow("Cards.json: expected non-empty array");
    });

    it.each([
        ["null", null],
        ["a number", 7],
        ["a string", "Blue-eyes White Dragon"],
        ["a card without Id", { Name: "Sample", Type: 0 }],
        ["a card with a text Id", makeCard({ Id: "1" })],
        ["a card without Name", { Id: 2, Type: 0 }],
        ["a card with a numeric Name", makeCard({ Name: 5 })],
        ["a card without Type", { Id: 2, Name: "Sample" }],
        ["a card with a text Type", makeCard({ Type: "0" })],
    ])("rejects %s and reports its index", (_name, card) => {
        expect(() => validateSecondCard(card)).toThrow("Cards.json: invalid card at index 1");
    });
});

describe("validateCardsJson ritual recipes", () => {
    it.each([
        ["a string", "Yamadron Ritual"],
        ["a number", 666],
        ["a boolean", true],
        ["an array", [666, 29, 31, 101, 357]],
        ["an empty object", {}],
    ])("rejects a recipe that is %s", (_name, ritual) => {
        expect(() => validateSecondCard(makeCard({ Id: 666, Ritual: ritual }))).toThrow(
            "Cards.json: invalid ritual at index 1"
        );
    });

    describe.each(RITUAL_FIELDS)("field %s", (field) => {
        it("is required", () => {
            const recipe = makeRecipe();
            delete recipe[field];
            expect(() => validateSecondCard(makeCard({ Id: 666, Ritual: recipe }))).toThrow(
                "Cards.json: invalid ritual at index 1"
            );
        });

        it.each(BAD_CARD_IDS)("rejects %s", (_name, value) => {
            const recipe = { ...makeRecipe(), [field]: value };
            expect(() => validateSecondCard(makeCard({ Id: 666, Ritual: recipe }))).toThrow(
                "Cards.json: invalid ritual at index 1"
            );
        });
    });
});
