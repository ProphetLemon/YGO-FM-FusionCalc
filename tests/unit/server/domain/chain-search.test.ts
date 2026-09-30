import { beforeAll, describe, expect, it } from "vitest";
import type { ChainResult } from "../../../../src/shared/types.js";
import {
    findBestChains,
    MAX_CHAIN_HAND,
    MAX_CHAIN_STATES,
} from "../../../../src/server/domain/chain-search.js";
import { getFusionResult, loadStore } from "../../../../src/server/data/store.js";

// Twelve strong fusers whose fusion graph has ~450k reachable hand states, far above MAX_CHAIN_STATES.
const DENSE_HAND = [635, 157, 649, 425, 244, 561, 215, 353, 172, 555, 138, 154];

function describeChains(chains: ChainResult[]): string[] {
    return chains.map((chain) => `${chain.finalCard.name}:${chain.steps.length}`);
}

// Replays the steps over the hand: every step must consume cards that are really in the working hand.
function expectExecutable(handIds: number[], chain: ChainResult): void {
    const hand = [...handIds];
    for (const { card1, card2, result } of chain.steps) {
        for (const id of [card1.id, card2.id]) {
            const index = hand.indexOf(id);
            expect(index, `card ${id} is not in the working hand`).toBeGreaterThanOrEqual(0);
            hand.splice(index, 1);
        }
        expect(getFusionResult(card1.id, card2.id)).toBe(result.id);
        hand.push(result.id);
    }
    expect(chain.steps.length).toBeGreaterThan(0);
    expect(chain.finalCard).toEqual(chain.steps.at(-1)?.result);
    expect(chain.finalCard.isMonster).toBe(true);
}

describe("findBestChains", () => {
    beforeAll(() => {
        loadStore();
    });

    it("returns no chains for an empty hand", () => {
        expect(findBestChains([])).toEqual({ chains: [], truncated: false });
    });

    it("returns no chains for a single card", () => {
        expect(findBestChains([1])).toEqual({ chains: [], truncated: false });
    });

    it("returns no chains for a hand with no possible fusions", () => {
        expect(findBestChains([1, 1])).toEqual({ chains: [], truncated: false });
    });

    it("ignores unknown card ids", () => {
        expect(findBestChains([2, 8, 999_999])).toEqual(findBestChains([2, 8]));
        expect(findBestChains([999_999, 0, -1])).toEqual({ chains: [], truncated: false });
    });

    it("returns a chain for a known fusable pair", () => {
        const { chains } = findBestChains([2, 8]);
        expect(chains.length).toBeGreaterThan(0);
        const first = chains[0];
        expect(first?.steps.length).toBe(1);
        expect(first?.finalCard.id).toBe(638);
    });

    it("chain step references correct cards", () => {
        const step = findBestChains([2, 8]).chains[0]?.steps[0];
        expect([step?.card1.id, step?.card2.id].sort()).toEqual([2, 8]);
        expect(step?.result.id).toBe(638);
    });

    it("fuses a card with a second copy of itself", () => {
        const { chains } = findBestChains([15, 15]);
        expect(describeChains(chains)).toEqual(["Vermillion Sparrow:1"]);
        expect([chains[0]?.steps[0]?.card1.id, chains[0]?.steps[0]?.card2.id]).toEqual([15, 15]);
    });

    describe("chain outcome", () => {
        it("stops at the fusion that produces the card instead of forcing further fusions", () => {
            // Tyhone + Flame Swordsman = Crimson Sunbird; fusing it again with the Equip only yields a Magic card.
            const { chains } = findBestChains([13, 15, 325]);
            expect(describeChains(chains)).toEqual(["Crimson Sunbird:1"]);
            expect(chains[0]?.finalCard.attack).toBe(2300);
            expect(chains.map((chain) => chain.finalCard.name)).not.toContain("Harpie's Feather Duster");
        });

        it("reports the fusion product, never a stronger card that was only left in hand", () => {
            // Blue-eyes White Dragon (3000) cannot fuse with anything here and is not a chain result.
            const { chains } = findBestChains([8, 9, 1]);
            expect(describeChains(chains)).toEqual(["Wood Remains:1"]);
            expect(chains[0]?.finalCard.attack).toBe(1000);
            expect(chains.map((chain) => chain.finalCard.name)).not.toContain("Blue-eyes White Dragon");
        });

        it("chains fusions when the best monster needs more than one step", () => {
            const { chains } = findBestChains([154, 4, 200]);
            expect(describeChains(chains)).toEqual(["Skelgon:2", "Dragon Zombie:1"]);
            const [first, second] = chains[0]?.steps ?? [];
            expect([second?.card1.id, second?.card2.id]).toContain(first?.result.id);
            expect(chains[0]?.finalCard.id).toBe(second?.result.id);
        });

        it("can fuse two intermediate results with each other", () => {
            // The model lets any two cards of the working hand fuse, products of earlier steps included. That is
            // unverified against the real game (spec chained-fusion-search, "Preguntas abiertas"): if the game
            // does not allow it, this is the test to change. Garvas (The Wicked Worm Beast + Witch's Apprentice)
            // and Metal Dragon (Ancient Tool + Dragon Zombie) can only meet this way, and nothing else in this
            // hand reaches Flame Cerebrus.
            const { chains } = findBestChains([23, 124, 97, 628]);
            expect(chains[0]?.finalCard.name).toBe("Flame Cerebrus");
            expect(chains[0]?.steps).toHaveLength(3);
            const [first, second, last] = chains[0]?.steps ?? [];
            expect([first?.result.name, second?.result.name].sort()).toEqual(["Garvas", "Metal Dragon"]);
            expect([last?.card1.id, last?.card2.id].sort()).toEqual(
                [first?.result.id, second?.result.id].sort()
            );
        });

        it("keeps the shortest route to a card that also has longer routes", () => {
            // Flame Cerebrus can be made in one step and, spending more cards, in two.
            const { chains } = findBestChains([266, 7, 47, 409]);
            expect(describeChains(chains)[0]).toBe("Flame Cerebrus:1");
        });

        it("uses the pair that comes first in the hand when several pairs make the same card", () => {
            // Mystical Elf makes Queen of Autumn Leaves with Mushroom Man and with Man-eating Plant alike.
            const queenStep = (hand: number[]): Array<number | undefined> => {
                const chain = findBestChains(hand).chains.find(({ finalCard }) => finalCard.id === 638);
                return [chain?.steps[0]?.card1.id, chain?.steps[0]?.card2.id];
            };
            expect(queenStep([2, 8, 75])).toEqual([2, 8]);
            expect(queenStep([2, 75, 8])).toEqual([2, 75]);
        });

        it("returns every final card once and only monsters", () => {
            const hand = [545, 108, 172, 180, 635];
            const { chains } = findBestChains(hand);
            const ids = chains.map((chain) => chain.finalCard.id);
            expect(new Set(ids).size).toBe(ids.length);
            for (const chain of chains) expectExecutable(hand, chain);
        });

        it.each([
            { name: "six low-level cards", hand: [2, 8, 9, 10, 11, 12] },
            { name: "a two-step fusion", hand: [154, 4, 200] },
            { name: "a fusion followed by an Equip", hand: [13, 15, 325] },
            { name: "a duplicated card", hand: [15, 15, 2, 8] },
            { name: "a dense 12-card hand", hand: DENSE_HAND },
        ])("returns chains that can be executed from $name", ({ hand }) => {
            const { chains } = findBestChains(hand);
            expect(chains.length).toBeGreaterThan(0);
            for (const chain of chains) expectExecutable(hand, chain);
        });
    });

    describe("ranking", () => {
        it("sorts chains by final card attack descending", () => {
            const { chains } = findBestChains([2, 8, 9, 10]);
            expect(chains.length).toBeGreaterThan(1);
            for (let i = 1; i < chains.length; i++) {
                expect(chains[i - 1]?.finalCard.attack).toBeGreaterThanOrEqual(
                    chains[i]?.finalCard.attack ?? 0
                );
            }
        });

        it("ranks fewer steps first when the attack is equal, even against a lower card id", () => {
            const { chains } = findBestChains([395, 180, 214, 280]);
            expect(describeChains(chains).slice(0, 2)).toEqual([
                "Queen of Autumn Leaves:1",
                "Flame Swordsman:2",
            ]);
            expect(chains[0]?.finalCard.attack).toBe(chains[1]?.finalCard.attack);
            expect(chains[0]?.finalCard.id).toBeGreaterThan(chains[1]?.finalCard.id ?? 0);
        });

        it("ranks the lower card id first when attack and steps are equal", () => {
            const { chains } = findBestChains([157, 31, 46, 255]);
            expect(describeChains(chains)).toEqual(["Flame Cerebrus:1", "B. Dragon Jungle King:1"]);
            expect(chains[0]?.finalCard.attack).toBe(chains[1]?.finalCard.attack);
        });

        it("returns only the five best chains", () => {
            const { chains } = findBestChains([545, 108, 172, 180, 635]);
            expect(describeChains(chains)).toEqual([
                "B. Dragon Jungle King:2",
                "Curse of Dragon:1",
                "Pumpking the King of Ghosts:1",
                "Queen of Autumn Leaves:1",
                "Sword Arm of Dragon:1",
            ]);
        });

        it("returns the same chains in the same order on every call", () => {
            const hand = [2, 8, 9, 10, 11, 12];
            expect(findBestChains(hand)).toEqual(findBestChains(hand));
        });
    });

    describe("state budget", () => {
        it("exports MAX_CHAIN_HAND as 12", () => {
            expect(MAX_CHAIN_HAND).toBe(12);
        });

        it("does not report truncation when the whole search space fits the budget", () => {
            // {2, 8} plus {638}: exactly two hand states.
            expect(findBestChains([2, 8], 2)).toEqual(findBestChains([2, 8]));
            expect(findBestChains([2, 8], 2).truncated).toBe(false);
        });

        it("reports truncation and keeps the chains found before the budget ran out", () => {
            const result = findBestChains([2, 8], 1);
            expect(result.truncated).toBe(true);
            expect(describeChains(result.chains)).toEqual(["Queen of Autumn Leaves:1"]);
        });

        it("returns executable chains from a search cut short by a small budget", () => {
            const hand = [2, 8, 9, 10, 11, 12];
            const cut = findBestChains(hand, 5);
            expect(cut.truncated).toBe(true);
            expect(cut.chains.length).toBeGreaterThan(0);
            for (const chain of cut.chains) expectExecutable(hand, chain);
        });

        it("truncates a dense 12-card hand at the default MAX_CHAIN_STATES budget", () => {
            const result = findBestChains(DENSE_HAND);
            expect(result.truncated).toBe(true);
            expect(result.chains.length).toBeGreaterThan(0);
            expect(result.chains.length).toBeLessThanOrEqual(5);
            expect(findBestChains(DENSE_HAND, MAX_CHAIN_STATES)).toEqual(result);
        });

        it("does not truncate hands whose search space is small", () => {
            expect(findBestChains([2, 8, 9, 10, 11, 12]).truncated).toBe(false);
            expect(findBestChains([545, 108, 172, 180, 635]).truncated).toBe(false);
        });
    });
});
