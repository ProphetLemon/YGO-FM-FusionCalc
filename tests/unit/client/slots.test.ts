import { describe, expect, it } from "vitest";
import {
    MIN_HAND_SIZE,
    canAddSlot,
    canRemoveSlot,
    getSlotIds,
    getValidIds,
} from "../../../src/client/lib/slots.js";
import { MAX_HAND_SIZE } from "../../../src/shared/limits.js";

describe("canAddSlot", () => {
    it("allows adding from the starting size up to one below the cap", () => {
        expect(canAddSlot(MIN_HAND_SIZE)).toBe(true);
        expect(canAddSlot(MAX_HAND_SIZE - 1)).toBe(true);
    });

    it("blocks adding at the cap", () => {
        expect(canAddSlot(MAX_HAND_SIZE)).toBe(false);
    });

    it("blocks adding above the cap", () => {
        expect(canAddSlot(MAX_HAND_SIZE + 1)).toBe(false);
    });

    it("keeps the starting size inside the cap", () => {
        expect(MIN_HAND_SIZE).toBeLessThan(MAX_HAND_SIZE);
    });
});

describe("canRemoveSlot", () => {
    it("allows removing when above min", () => {
        expect(canRemoveSlot(MIN_HAND_SIZE + 1)).toBe(true);
        expect(canRemoveSlot(10)).toBe(true);
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

describe("getSlotIds", () => {
    const map: ReadonlyMap<string, number> = new Map([
        ["mystical elf", 2],
        ["mushroom man", 8],
    ]);

    it("returns the id of every slot in slot order, null where there is none", () => {
        expect(getSlotIds(["Mystical Elf", "", "Mushroom Man", "Unknown Card"], map)).toEqual([
            2,
            null,
            8,
            null,
        ]);
    });

    it("keeps a card that is in more than one slot in each of them", () => {
        expect(getSlotIds(["Mushroom Man", "Mystical Elf", "Mushroom Man"], map)).toEqual([8, 2, 8]);
    });

    it("is case-insensitive and trims whitespace", () => {
        expect(getSlotIds(["MYSTICAL ELF", "  mushroom man  "], map)).toEqual([2, 8]);
    });

    it("gives null for a slot that only holds whitespace", () => {
        expect(getSlotIds([" ", "\t"], map)).toEqual([null, null]);
    });

    it("returns an empty array for no slots", () => {
        expect(getSlotIds([], map)).toEqual([]);
    });
});
