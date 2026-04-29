import { describe, expect, it } from "vitest";
import enCatalog from "../../../src/shared/i18n/en.json" with { type: "json" };
import esCatalog from "../../../src/shared/i18n/es.json" with { type: "json" };

describe("i18n catalog parity", () => {
    it("es and en expose exactly the same keys", () => {
        const esKeys = Object.keys(esCatalog).sort();
        const enKeys = Object.keys(enCatalog).sort();
        expect(esKeys).toEqual(enKeys);
    });

    it("no value is empty", () => {
        for (const [key, value] of Object.entries(esCatalog)) {
            expect(value, `es value for ${key}`).not.toBe("");
        }
        for (const [key, value] of Object.entries(enCatalog)) {
            expect(value, `en value for ${key}`).not.toBe("");
        }
    });
});
