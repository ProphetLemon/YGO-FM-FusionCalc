import { beforeAll, describe, expect, it } from "vitest";
import type { Card } from "../../../../src/shared/types.js";
import { isMonster, toCardSummary } from "../../../../src/server/domain/cards.js";
import { loadStore } from "../../../../src/server/data/store.js";

describe("cards domain", () => {
    beforeAll(() => {
        loadStore();
    });

    it("isMonster recognises monsters and non-monsters", () => {
        expect(isMonster({ Type: 0 } as Card)).toBe(true);
        expect(isMonster({ Type: 19 } as Card)).toBe(true);
        expect(isMonster({ Type: 20 } as Card)).toBe(false);
        expect(isMonster({ Type: 23 } as Card)).toBe(false);
    });

    it("toCardSummary maps fields and resolves type name", () => {
        const summary = toCardSummary({
            Id: 1,
            Name: "Blue-eyes White Dragon",
            Description: "Sample",
            Type: 0,
            Attack: 3000,
            Defense: 2500,
            Stars: 999_999,
            CardCode: "89631139",
            Equip: null,
            Fusions: [],
        });
        expect(summary).toEqual({
            id: 1,
            name: "Blue-eyes White Dragon",
            description: "Sample",
            type: 0,
            typeName: "Dragon",
            attack: 3000,
            defense: 2500,
            stars: 999_999,
            password: "89631139",
            isMonster: true,
        });
    });
});
