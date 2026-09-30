import { describe, expect, it } from "vitest";
import { cardImageUrl, hasArtwork } from "../../../src/client/lib/card-image.js";

describe("hasArtwork", () => {
    it.each(["4931562", "89631139", "10"])("is true for code %s", (code) => {
        expect(hasArtwork(code)).toBe(true);
    });

    it.each([null, ""])("is false for %j, which names no file", (code) => {
        expect(hasArtwork(code)).toBe(false);
    });

    it.each(["0", "00000000"])("is false for %s, which is no password", (code) => {
        expect(hasArtwork(code)).toBe(false);
    });

    it("is false for a code the page never received", () => {
        expect(hasArtwork(undefined as unknown as null)).toBe(false);
    });
});

describe("cardImageUrl", () => {
    it("points at the file the CDN names after the code", () => {
        expect(cardImageUrl("4931562")).toBe("https://images.ygoprodeck.com/images/cards/4931562.jpg");
    });
});
