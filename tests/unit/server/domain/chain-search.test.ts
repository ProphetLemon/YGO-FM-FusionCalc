import { beforeAll, describe, expect, it } from "vitest";
import { findBestChains, MAX_CHAIN_HAND } from "../../../../src/server/domain/chain-search.js";
import { loadStore } from "../../../../src/server/data/store.js";

describe("findBestChains", () => {
    beforeAll(() => {
        loadStore();
    });

    it("returns empty for empty hand", () => {
        expect(findBestChains([])).toEqual([]);
    });

    it("returns empty for single card", () => {
        expect(findBestChains([1])).toEqual([]);
    });

    it("returns empty for hand with no possible fusions", () => {
        expect(findBestChains([1, 1])).toEqual([]);
    });

    it("returns a chain for a known fusable pair", () => {
        const chains = findBestChains([2, 8]);
        expect(chains.length).toBeGreaterThan(0);
        const first = chains[0];
        expect(first?.steps.length).toBe(1);
        expect(first?.finalCard.id).toBe(638);
    });

    it("chain step references correct cards", () => {
        const chains = findBestChains([2, 8]);
        const step = chains[0]?.steps[0];
        expect([step?.card1.id, step?.card2.id].sort()).toEqual([2, 8]);
        expect(step?.result.id).toBe(638);
    });

    it("sorts chains by finalCard attack descending", () => {
        const chains = findBestChains([2, 8, 9, 10]);
        for (let i = 1; i < chains.length; i++) {
            expect(chains[i - 1]?.finalCard.attack).toBeGreaterThanOrEqual(
                chains[i]?.finalCard.attack ?? 0
            );
        }
    });

    it("returns at most 5 results", () => {
        const chains = findBestChains([2, 8, 9, 10, 11, 12]);
        expect(chains.length).toBeLessThanOrEqual(5);
    });

    it("exports MAX_CHAIN_HAND as 12", () => {
        expect(MAX_CHAIN_HAND).toBe(12);
    });
});
