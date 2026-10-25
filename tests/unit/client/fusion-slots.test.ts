import { describe, expect, it } from "vitest";
import { findFusionSlots } from "../../../src/client/lib/fusion-slots.js";

describe("findFusionSlots", () => {
    it("finds the slots of a simple pair", () => {
        expect(findFusionSlots([1, 2, 3], 1, 3)).toEqual([0, 2]);
    });

    it("counts the position in the slots, so empty slots shift nothing", () => {
        expect(findFusionSlots([null, 7, null, null, 9], 7, 9)).toEqual([1, 4]);
    });

    it("takes the first copy of card1 and the first copy of card2 after it", () => {
        expect(findFusionSlots([5, 8, 5, 8], 5, 8)).toEqual([0, 1]);
    });

    it("looks for card2 only after card1, as the server pairs i < j", () => {
        expect(findFusionSlots([8, 5, 8], 5, 8)).toEqual([1, 2]);
    });

    it("pairs two copies of the same card in different slots", () => {
        expect(findFusionSlots([4, null, 4], 4, 4)).toEqual([0, 2]);
    });

    it("does not pair a single copy with itself", () => {
        expect(findFusionSlots([4, 6], 4, 4)).toBeNull();
    });

    it("returns null when card2 only appears before card1", () => {
        expect(findFusionSlots([8, 5], 5, 8)).toBeNull();
    });

    it("returns null when a card is not in the hand", () => {
        expect(findFusionSlots([1, 2, null], 1, 9)).toBeNull();
        expect(findFusionSlots([1, 2, null], 9, 2)).toBeNull();
        expect(findFusionSlots([], 1, 2)).toBeNull();
    });
});
