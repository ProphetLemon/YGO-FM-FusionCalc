import { describe, expect, it } from "vitest";
import {
    DEFAULT_LANG,
    SUPPORTED_LANGS,
    isLang,
    parseAcceptLanguage,
    translate,
} from "../../../src/shared/i18n/index.js";

describe("isLang", () => {
    it("accepts supported languages", () => {
        expect(isLang("es")).toBe(true);
        expect(isLang("en")).toBe(true);
    });

    it("rejects everything else", () => {
        expect(isLang("fr")).toBe(false);
        expect(isLang("")).toBe(false);
        expect(isLang(undefined)).toBe(false);
        expect(isLang(123)).toBe(false);
    });
});

describe("translate", () => {
    it("returns the catalog entry for a known key", () => {
        expect(translate("nav.home", "es")).toBe("Inicio");
        expect(translate("nav.home", "en")).toBe("Home");
    });

    it("interpolates variables with {{name}} syntax", () => {
        const result = translate("footer.copyright", "en", { year: 2026 });
        expect(result).toContain("© 2026");
    });

    it("leaves unmatched placeholders untouched", () => {
        // Use a known key with a known placeholder so we exercise the fallback branch.
        const result = translate("footer.copyright", "en", {});
        expect(result).toContain("{{year}}");
    });

    it("returns a bracketed key when missing and not strict", () => {
        // @ts-expect-error: forcing an unknown key to test runtime fallback.
        expect(translate("does.not.exist", "es")).toBe("[does.not.exist]");
    });

    it("throws when missing and strict", () => {
        expect(() =>
            // @ts-expect-error: forcing an unknown key to test runtime fallback.
            translate("does.not.exist", "es", undefined, { strict: true })
        ).toThrow(/Missing translation key/);
    });
});

describe("parseAcceptLanguage", () => {
    it("returns null when header is empty or missing", () => {
        expect(parseAcceptLanguage(undefined)).toBeNull();
        expect(parseAcceptLanguage("")).toBeNull();
    });

    it("returns the highest-quality supported language", () => {
        expect(parseAcceptLanguage("en-US,en;q=0.9")).toBe("en");
        expect(parseAcceptLanguage("es-ES,es;q=0.9,en;q=0.8")).toBe("es");
    });

    it("falls back through unsupported entries", () => {
        expect(parseAcceptLanguage("fr-FR,de;q=0.8,en;q=0.5")).toBe("en");
    });

    it("returns null when no supported language is present", () => {
        expect(parseAcceptLanguage("fr-FR,de;q=0.8")).toBeNull();
    });
});

describe("constants", () => {
    it("declares es and en as supported", () => {
        expect(SUPPORTED_LANGS).toEqual(["es", "en"]);
    });

    it("uses es as default", () => {
        expect(DEFAULT_LANG).toBe("es");
    });
});
