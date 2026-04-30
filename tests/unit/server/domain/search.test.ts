import { beforeAll, describe, expect, it } from "vitest";
import { findCardByExactName, findCardsByPrefix } from "../../../../src/server/domain/search.js";
import { loadStore } from "../../../../src/server/data/store.js";

describe("search domain", () => {
    beforeAll(() => {
        loadStore();
    });

    it("finds cards by exact name (case-insensitive)", () => {
        expect(findCardByExactName("Blue-eyes White Dragon")?.id).toBe(1);
        expect(findCardByExactName("blue-eyes white dragon")?.id).toBe(1);
    });

    it("returns null for unknown name", () => {
        expect(findCardByExactName("not-a-real-card")).toBeNull();
    });

    it("returns matches by prefix up to limit", () => {
        const matches = findCardsByPrefix("blue", 3);
        expect(matches.length).toBeLessThanOrEqual(3);
        for (const m of matches) {
            expect(m.name.toLowerCase().startsWith("blue")).toBe(true);
        }
    });

    it("returns empty for empty prefix", () => {
        expect(findCardsByPrefix("", 5)).toEqual([]);
    });
});
