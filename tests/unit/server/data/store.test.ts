import { beforeAll, describe, expect, it } from "vitest";
import {
    getAllCards,
    getCardById,
    getCardByNameLower,
    getCardIndex,
    getCardTypeName,
    getEquipsForCard,
    getFusionResult,
    getFusionsForCard,
    getResultsForCard,
    loadStore,
} from "../../../../src/server/data/store.js";

describe("store", () => {
    beforeAll(() => {
        loadStore();
    });

    it("indexes cards by id", () => {
        const card = getCardById(1);
        expect(card?.Name).toBe("Blue-eyes White Dragon");
    });

    it("looks up cards case-insensitively by name", () => {
        const card = getCardByNameLower("blue-eyes white dragon");
        expect(card?.Id).toBe(1);
    });

    it("returns the full card array", () => {
        expect(getAllCards().length).toBeGreaterThan(700);
    });

    it("provides a sorted card index", () => {
        const idx = getCardIndex();
        expect(idx.length).toBeGreaterThan(700);
        expect(idx[0]?.name.localeCompare(idx[1]?.name ?? "")).toBeLessThanOrEqual(0);
    });

    it("returns fusions for a card with fusions", () => {
        const fusions = getFusionsForCard(2);
        expect(fusions.length).toBeGreaterThan(0);
        expect(fusions[0]).toMatchObject({ card: expect.any(Number), result: expect.any(Number) });
    });

    it("returns empty fusions for unknown card id", () => {
        expect(getFusionsForCard(0)).toEqual([]);
        expect(getFusionsForCard(999_999)).toEqual([]);
    });

    it("returns the fusion result of a pair regardless of the argument order", () => {
        expect(getFusionResult(13, 15)).toBe(467);
        expect(getFusionResult(15, 13)).toBe(467);
    });

    it("returns the fusion result of a card fused with itself", () => {
        expect(getFusionResult(15, 15)).toBe(473);
    });

    it("returns undefined for a pair that does not fuse", () => {
        expect(getFusionResult(1, 1)).toBeUndefined();
        expect(getFusionResult(8, 1)).toBeUndefined();
    });

    it("returns undefined when a card is unknown", () => {
        expect(getFusionResult(0, 1)).toBeUndefined();
        expect(getFusionResult(1, 999_999)).toBeUndefined();
        expect(getFusionResult(999_999, 999_999)).toBeUndefined();
    });

    it("matches the first entry the per-card fusion index lists for every partner", () => {
        const mismatches: number[][] = [];
        for (const card of getAllCards()) {
            const entries = getFusionsForCard(card.Id);
            for (const { card: partner } of entries) {
                const expected = entries.find((entry) => entry.card === partner)?.result;
                if (getFusionResult(card.Id, partner) !== expected) mismatches.push([card.Id, partner]);
            }
        }
        expect(mismatches).toEqual([]);
    });

    it("returns equips lists", () => {
        expect(Array.isArray(getEquipsForCard(1))).toBe(true);
    });

    it("returns results lists", () => {
        expect(Array.isArray(getResultsForCard(1))).toBe(true);
    });

    it("maps type indices to names", () => {
        expect(getCardTypeName(0)).toBe("Dragon");
        expect(getCardTypeName(20)).toBe("Magic");
        expect(getCardTypeName(999)).toBe("Unknown");
    });
});
