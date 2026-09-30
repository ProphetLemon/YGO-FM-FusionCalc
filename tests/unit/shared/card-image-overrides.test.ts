import { beforeAll, describe, expect, it } from "vitest";
import imageOverrides from "../../../src/shared/card-image-overrides.json" with { type: "json" };
import { getCardById, loadStore } from "../../../src/server/data/store.js";

const entries = Object.entries(imageOverrides);

describe("card image overrides", () => {
    beforeAll(() => {
        loadStore();
    });

    it("lists at least one card", () => {
        expect(entries.length).toBeGreaterThan(0);
    });

    it("keys every entry by the id of a card of the game", () => {
        for (const [id] of entries) {
            expect(id, "id spelling").toMatch(/^[1-9]\d*$/);
            expect(getCardById(Number(id)), `card ${id}`).toBeDefined();
        }
    });

    it("holds numeric codes, written the way the CDN names its files (no padding)", () => {
        for (const [id, code] of entries) {
            expect(typeof code, `code of ${id}`).toBe("string");
            expect(code, `code of ${id}`).toMatch(/^[1-9]\d*$/);
        }
    });

    it("gives no two cards the same artwork", () => {
        const codes = entries.map(([, code]) => code);
        expect(new Set(codes).size).toBe(codes.length);
    });
});
