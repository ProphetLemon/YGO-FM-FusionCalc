import { beforeAll, describe, expect, it } from "vitest";
import {
    getAllCards,
    getCardById,
    getCardByNameLower,
    getCardIndex,
    getCardTypeName,
    getEquipsForCard,
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
