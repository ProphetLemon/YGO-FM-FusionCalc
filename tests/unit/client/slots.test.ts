import { describe, expect, it } from "vitest";
import {
    MIN_HAND_SIZE,
    MAX_HAND_SIZE,
    canAddSlot,
    canRemoveSlot,
    getValidIds,
} from "../../../src/client/lib/slots.js";

describe("canAddSlot", () => {
    it("allows adding when below max", () => {
        expect(canAddSlot(MIN_HAND_SIZE)).toBe(true);
        expect(canAddSlot(MAX_HAND_SIZE - 1)).toBe(true);
    });

    it("blocks adding when at max", () => {
        expect(canAddSlot(MAX_HAND_SIZE)).toBe(false);
    });
});

describe("canRemoveSlot", () => {
    it("allows removing when above min", () => {
        expect(canRemoveSlot(MIN_HAND_SIZE + 1)).toBe(true);
        expect(canRemoveSlot(MAX_HAND_SIZE)).toBe(true);
    });

    it("blocks removing when at min", () => {
        expect(canRemoveSlot(MIN_HAND_SIZE)).toBe(false);
    });
});

describe("getValidIds", () => {
    const map: ReadonlyMap<string, number> = new Map([
        ["mystical elf", 2],
        ["mushroom man", 8],
    ]);

    it("returns ids for recognized names", () => {
        expect(getValidIds(["Mystical Elf", "Mushroom Man"], map)).toEqual([2, 8]);
    });

    it("ignores unrecognized names", () => {
        expect(getValidIds(["", "Unknown Card", "Mystical Elf"], map)).toEqual([2]);
    });

    it("returns empty array when no valid names", () => {
        expect(getValidIds([], map)).toEqual([]);
        expect(getValidIds(["", " "], map)).toEqual([]);
    });

    it("is case-insensitive", () => {
        expect(getValidIds(["MYSTICAL ELF"], map)).toEqual([2]);
    });

    it("trims whitespace", () => {
        expect(getValidIds(["  Mystical Elf  "], map)).toEqual([2]);
    });
});
