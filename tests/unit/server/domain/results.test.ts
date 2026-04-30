import { beforeAll, describe, expect, it } from "vitest";
import { getResultsFor } from "../../../../src/server/domain/results.js";
import { loadStore } from "../../../../src/server/data/store.js";

describe("results domain", () => {
    beforeAll(() => {
        loadStore();
    });

    it("returns null for unknown card", () => {
        expect(getResultsFor(999_999)).toBeNull();
    });

    it("returns expanded result entries for a known result card", () => {
        const result = getResultsFor(638);
        expect(Array.isArray(result)).toBe(true);
    });
});
