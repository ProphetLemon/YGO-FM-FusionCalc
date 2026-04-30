import { beforeAll, describe, expect, it } from "vitest";
import { getFusionsFor } from "../../../../src/server/domain/fusions.js";
import { loadStore } from "../../../../src/server/data/store.js";

describe("fusions domain", () => {
    beforeAll(() => {
        loadStore();
    });

    it("returns null for unknown card", () => {
        expect(getFusionsFor(999_999)).toBeNull();
    });

    it("returns fusions and equips for an existing card", () => {
        const result = getFusionsFor(2);
        expect(result).not.toBeNull();
        expect(Array.isArray(result?.fusions)).toBe(true);
        expect(Array.isArray(result?.equips)).toBe(true);
        if (result && result.fusions.length > 0) {
            const first = result.fusions[0];
            expect(first?.card1.id).toBe(2);
            expect(first?.card2.id).toBeGreaterThan(0);
            expect(first?.result.id).toBeGreaterThan(0);
        }
    });
});
