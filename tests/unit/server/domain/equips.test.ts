import { beforeAll, describe, expect, it } from "vitest";
import { getEquipsFor } from "../../../../src/server/domain/equips.js";
import { loadStore } from "../../../../src/server/data/store.js";

describe("equips domain", () => {
    beforeAll(() => {
        loadStore();
    });

    it("returns null for unknown card", () => {
        expect(getEquipsFor(999_999)).toBeNull();
    });

    it("returns array (possibly empty) for known card", () => {
        const result = getEquipsFor(1);
        expect(Array.isArray(result)).toBe(true);
    });
});
