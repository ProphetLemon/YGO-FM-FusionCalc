import { beforeAll, describe, expect, it } from "vitest";
import { findCombinations } from "../../../../src/server/domain/calculator.js";
import { loadStore } from "../../../../src/server/data/store.js";

describe("calculator domain", () => {
    beforeAll(() => {
        loadStore();
    });

    it("returns empty results for empty hand", () => {
        const out = findCombinations({ handIds: [] });
        expect(out).toEqual({ fusions: [], equips: [], rituals: [] });
    });

    it("ignores unknown card ids without throwing", () => {
        const out = findCombinations({ handIds: [999_999, 999_998] });
        expect(out).toEqual({ fusions: [], equips: [], rituals: [] });
    });

    it("finds Mystical Elf + card 8 fusion", () => {
        const out = findCombinations({ handIds: [2, 8] });
        expect(out.fusions.length).toBeGreaterThan(0);
        const first = out.fusions[0];
        expect([first?.card1.id, first?.card2.id].sort()).toEqual([2, 8]);
        expect(first?.result.id).toBe(638);
    });

    it("sorts fusions by result attack descending", () => {
        const out = findCombinations({ handIds: [2, 8, 9, 10] });
        for (let i = 1; i < out.fusions.length; i++) {
            const prev = out.fusions[i - 1]?.result.attack ?? 0;
            const curr = out.fusions[i]?.result.attack ?? 0;
            expect(prev).toBeGreaterThanOrEqual(curr);
        }
    });

    it("returns no rituals when the hand has none", () => {
        const out = findCombinations({ handIds: [2, 8, 9, 10] });
        expect(out.rituals).toEqual([]);
    });

    it("returns the ritual a complete recipe in the hand makes", () => {
        const out = findCombinations({ handIds: [666, 29, 31, 101] });
        expect(out.rituals).toHaveLength(1);
        expect(out.rituals[0]?.ritualCard.id).toBe(666);
        expect(out.rituals[0]?.materials.map((card) => card.id)).toEqual([29, 31, 101]);
        expect(out.rituals[0]?.result.id).toBe(357);
    });

    it("returns rituals next to the fusions of the same hand", () => {
        const out = findCombinations({ handIds: [2, 666, 8, 29, 31, 101] });
        expect(out.fusions.map((fusion) => fusion.result.id)).toContain(638);
        expect(out.rituals.map((ritual) => ritual.result.id)).toEqual([357]);
    });

    it("returns no ritual when a piece of the recipe is missing", () => {
        const out = findCombinations({ handIds: [666, 29, 31] });
        expect(out.rituals).toEqual([]);
    });
});
