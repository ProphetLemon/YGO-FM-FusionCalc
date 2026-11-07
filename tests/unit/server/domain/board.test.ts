import { beforeAll, describe, expect, it } from "vitest";
import { loadStore } from "../../../../src/server/data/store.js";
import {
    findBoardChains,
    findBoardCombinations,
    sortRitualsOnTerrain,
} from "../../../../src/server/domain/board.js";
import { expand } from "../../../../src/server/domain/rituals.js";
import { getRitualRecipes } from "../../../../src/server/data/store.js";
import { TERRAIN_IDS, terrainAttack, type TerrainId } from "../../../../src/shared/terrains.js";
import { findCombinations } from "../../../../src/server/domain/calculator.js";
import {
    MAX_CHAIN_STATES,
    compareCandidates,
    exploreHandStates,
    findBestChains,
} from "../../../../src/server/domain/chain-search.js";
import type { SlotRef } from "../../../../src/shared/types.js";

const UNKNOWN_CARD = 999_999;

const BABY_DRAGON = 4;
const TIME_WIZARD = 16;
const THOUSAND_DRAGON = 69;
const CELTIC_GUARDIAN = 41;
const HORN_IMP = 25;
const LEGENDARY_SWORD = 301;
const YAMADRON_RITUAL = 666;
const YAMADRON = 357;
const YAMADRON_MATERIALS = [29, 31, 101];

function hand(index: number): SlotRef {
    return { zone: "hand", index };
}

function monster(index: number): SlotRef {
    return { zone: "monster", index };
}

function spell(index: number): SlotRef {
    return { zone: "spell", index };
}

function board(handIds: number[], monsterIds: number[] = [], spellIds: number[] = []) {
    return { handIds, monsterIds, spellIds };
}

function pairKeys(pairs: ReadonlyArray<{ card1: { id: number }; card2: { id: number } }>): string[] {
    return pairs.map(({ card1, card2 }) => [card1.id, card2.id].sort((a, b) => a - b).join("+")).sort();
}

function fusionIds(handIds: number[], monsterIds: number[] = [], spellIds: number[] = []): number[] {
    return findBoardCombinations(board(handIds, monsterIds, spellIds)).fusions.map((f) => f.result.id);
}

describe("board domain", () => {
    beforeAll(() => {
        loadStore();
    });

    describe("fusions", () => {
        it("fuses two hand cards and records both hand slots", () => {
            const { fusions } = findBoardCombinations(board([BABY_DRAGON, TIME_WIZARD]));
            expect(fusions).toHaveLength(1);
            expect(fusions[0]?.result.id).toBe(THOUSAND_DRAGON);
            expect(fusions[0]?.from).toEqual([hand(0), hand(1)]);
        });

        it("fuses a hand card with a monster-zone card, the hand card being card1", () => {
            const { fusions } = findBoardCombinations(board([TIME_WIZARD], [BABY_DRAGON]));
            expect(fusions).toHaveLength(1);
            expect(fusions[0]?.card1.id).toBe(TIME_WIZARD);
            expect(fusions[0]?.card2.id).toBe(BABY_DRAGON);
            expect(fusions[0]?.from).toEqual([hand(0), monster(0)]);
        });

        it("never fuses two monster-zone cards", () => {
            expect(fusionIds([], [BABY_DRAGON, TIME_WIZARD])).toEqual([]);
        });

        it("never uses a spell-zone card as a material", () => {
            expect(fusionIds([BABY_DRAGON], [], [TIME_WIZARD])).toEqual([]);
            expect(fusionIds([], [BABY_DRAGON], [TIME_WIZARD])).toEqual([]);
        });

        it("sorts by result attack and keeps hand pairs before hand-field pairs on a tie", () => {
            // Baby Dragon + Celtic Guardian (1750) beats Baby Dragon + Horn Imp (1500).
            const { fusions } = findBoardCombinations(board([BABY_DRAGON, CELTIC_GUARDIAN], [HORN_IMP]));
            expect(fusions.map((f) => f.result.attack)).toEqual([1750, 1500]);
            const sameResult = findBoardCombinations(board([BABY_DRAGON, TIME_WIZARD], [TIME_WIZARD]));
            expect(sameResult.fusions.map((f) => f.from)).toEqual([
                [hand(0), hand(1)],
                [hand(0), monster(0)],
            ]);
        });

        it("skips unknown ids but keeps the indexes of the arrays as sent", () => {
            const { fusions } = findBoardCombinations(
                board([UNKNOWN_CARD, BABY_DRAGON], [UNKNOWN_CARD, TIME_WIZARD])
            );
            expect(fusions).toHaveLength(1);
            expect(fusions[0]?.from).toEqual([hand(1), monster(1)]);
        });
    });

    describe("equips", () => {
        it("equips a hand Equip card on a hand monster", () => {
            const { equips } = findBoardCombinations(board([LEGENDARY_SWORD, CELTIC_GUARDIAN]));
            expect(equips).toHaveLength(1);
            expect(equips[0]?.card1.id).toBe(LEGENDARY_SWORD);
            expect(equips[0]?.card2.id).toBe(CELTIC_GUARDIAN);
            expect(equips[0]?.from).toEqual([hand(0), hand(1)]);
        });

        it("equips a hand Equip card on a monster-zone monster", () => {
            const { equips } = findBoardCombinations(board([LEGENDARY_SWORD], [CELTIC_GUARDIAN]));
            expect(equips.map((e) => e.from)).toEqual([[hand(0), monster(0)]]);
        });

        it("equips a spell-zone Equip card on a monster-zone monster only", () => {
            const onField = findBoardCombinations(board([], [CELTIC_GUARDIAN], [LEGENDARY_SWORD]));
            expect(onField.equips.map((e) => e.from)).toEqual([[spell(0), monster(0)]]);
            const onHand = findBoardCombinations(board([CELTIC_GUARDIAN], [], [LEGENDARY_SWORD]));
            expect(onHand.equips).toEqual([]);
        });

        it("orders hand Equip cards before spell-zone ones", () => {
            const { equips } = findBoardCombinations(
                board([LEGENDARY_SWORD, CELTIC_GUARDIAN], [CELTIC_GUARDIAN], [LEGENDARY_SWORD])
            );
            expect(equips.map((e) => e.from)).toEqual([
                [hand(0), hand(1)],
                [hand(0), monster(0)],
                [spell(0), monster(0)],
            ]);
        });

        it("does not equip a monster that the Equip card does not fit", () => {
            const { equips } = findBoardCombinations(board([LEGENDARY_SWORD], [TIME_WIZARD]));
            expect(equips).toEqual([]);
        });
    });

    describe("rituals", () => {
        it("completes a ritual with the ritual card in the hand and the materials on the field", () => {
            const { rituals } = findBoardCombinations(board([YAMADRON_RITUAL], YAMADRON_MATERIALS));
            expect(rituals).toHaveLength(1);
            expect(rituals[0]?.result.id).toBe(YAMADRON);
            expect(rituals[0]?.from).toEqual({
                ritualCard: hand(0),
                materials: [monster(0), monster(1), monster(2)],
            });
        });

        it("takes the ritual card from the spell zone too", () => {
            const { rituals } = findBoardCombinations(board([], YAMADRON_MATERIALS, [YAMADRON_RITUAL]));
            expect(rituals.map((r) => r.from?.ritualCard)).toEqual([spell(0)]);
        });

        it("keeps the materials in recipe order whatever order they sit on the field", () => {
            const { rituals } = findBoardCombinations(board([YAMADRON_RITUAL], [101, UNKNOWN_CARD, 29, 31]));
            expect(rituals[0]?.from?.materials).toEqual([monster(2), monster(3), monster(0)]);
        });

        it("stays incomplete when a material is in the hand instead of the field", () => {
            const { rituals } = findBoardCombinations(
                board([YAMADRON_RITUAL, YAMADRON_MATERIALS[2] ?? 0], YAMADRON_MATERIALS.slice(0, 2))
            );
            expect(rituals).toEqual([]);
        });

        it("stays incomplete when the ritual card is on the field", () => {
            const { rituals } = findBoardCombinations(board([], [YAMADRON_RITUAL, ...YAMADRON_MATERIALS]));
            expect(rituals).toEqual([]);
        });
    });

    describe("chains", () => {
        it("starts a chain with the field monster as card1 of the first step", () => {
            const { chains, truncated } = findBoardChains(board([TIME_WIZARD], [BABY_DRAGON]));
            expect(truncated).toBe(false);
            expect(chains).toHaveLength(1);
            expect(chains[0]?.finalCard.id).toBe(THOUSAND_DRAGON);
            expect(chains[0]?.fieldIndex).toBe(0);
            expect(chains[0]?.steps[0]?.card1.id).toBe(BABY_DRAGON);
            expect(chains[0]?.steps[0]?.card2.id).toBe(TIME_WIZARD);
        });

        it("reports the index in monsterIds, unknown ids and repeated monsters included", () => {
            const { chains } = findBoardChains(
                board([TIME_WIZARD], [UNKNOWN_CARD, BABY_DRAGON, BABY_DRAGON])
            );
            expect(chains.map((c) => c.fieldIndex)).toEqual([1]);
        });

        it("lets the hand-only chain win a tie", () => {
            const { chains } = findBoardChains(board([BABY_DRAGON, TIME_WIZARD], [BABY_DRAGON]));
            expect(chains).toHaveLength(1);
            expect(chains[0]?.fieldIndex).toBeUndefined();
        });

        it("lets a shorter field chain beat a longer hand-only one", () => {
            const handIds = [BABY_DRAGON, CELTIC_GUARDIAN, 9];
            const handOnly = findBestChains(handIds).chains.find((c) => c.finalCard.id === 39);
            expect(handOnly?.steps).toHaveLength(2);
            const merged = findBoardChains(board(handIds, [11])).chains.find((c) => c.finalCard.id === 39);
            expect(merged?.steps).toHaveLength(1);
            expect(merged?.fieldIndex).toBe(0);
        });

        it("prefers the lower field index when two field monsters tie", () => {
            const { chains } = findBoardChains(
                board([TIME_WIZARD], [BABY_DRAGON, TIME_WIZARD, BABY_DRAGON])
            );
            expect(chains.filter((c) => c.finalCard.id === THOUSAND_DRAGON)).toHaveLength(1);
            expect(chains[0]?.fieldIndex).toBe(0);
        });

        it("ignores the spell zone and non-monster results", () => {
            const { chains } = findBoardChains(board([TIME_WIZARD], [], [BABY_DRAGON]));
            expect(chains).toEqual([]);
        });

        it("reports truncated when any search runs out of states", () => {
            expect(findBoardChains(board([BABY_DRAGON, CELTIC_GUARDIAN, 9], [11]), 1).truncated).toBe(true);
        });
    });

    describe("without a field or spells", () => {
        const HANDS: ReadonlyArray<readonly number[]> = [
            [],
            [BABY_DRAGON, TIME_WIZARD],
            [BABY_DRAGON, CELTIC_GUARDIAN, HORN_IMP, LEGENDARY_SWORD],
            [YAMADRON_RITUAL, ...YAMADRON_MATERIALS],
        ];

        it.each(HANDS)("answers like the hand-only functions for %j", (...handIds) => {
            const answer = findBoardCombinations(board(handIds));
            const legacy = findCombinations({ handIds });
            expect(answer.fusions.map(({ from: _from, ...rest }) => rest)).toEqual(legacy.fusions);
            // Legacy lists an Equip pair in hand order; the board always puts the Equip card first.
            expect(pairKeys(answer.equips)).toEqual(pairKeys(legacy.equips));
            expect(findBoardChains(board(handIds))).toEqual(findBestChains(handIds));
        });
    });

    describe("on a terrain", () => {
        // Time Wizard and Celtic Guardian each fuse with Baby Dragon: Dinosaur (card 11, 1750) and Thunder
        // (card 425, 1600), and Mountain lifts Thunder but not Dinosaur.
        const FUSION_HAND = [BABY_DRAGON, 41, 45];
        const DINOSAUR_RESULT = 11;
        const THUNDER_RESULT = 425;
        // The hand whose sixth candidate by printed ATK (card 11, a Dinosaur) is lifted into the top 5 by Wasteland.
        const PROMOTION_HAND = [553, 272, 448, 438, 199];

        const terrainBoard = (terrain: TerrainId | null, ...rest: Parameters<typeof board>) => ({
            ...board(...rest),
            terrain,
        });

        it("orders the fusions by the ATK of the result on the terrain", () => {
            const printed = findBoardCombinations(board(FUSION_HAND)).fusions.map((f) => f.result.id);
            expect(printed.slice(0, 2)).toEqual([DINOSAUR_RESULT, THUNDER_RESULT]);
            const onMountain = findBoardCombinations(terrainBoard("mountain", FUSION_HAND));
            expect(onMountain.fusions.map((f) => f.result.id).slice(0, 2)).toEqual([
                THUNDER_RESULT,
                DINOSAUR_RESULT,
            ]);
        });

        it("keeps the printed values in the summaries", () => {
            const { fusions } = findBoardCombinations(terrainBoard("mountain", FUSION_HAND));
            expect(fusions.find((f) => f.result.id === THUNDER_RESULT)?.result.attack).toBe(1600);
        });

        it("answers like no terrain for a null terrain and for a terrain that moves nothing", () => {
            const plain = findBoardCombinations(board(FUSION_HAND));
            expect(findBoardCombinations(terrainBoard(null, FUSION_HAND))).toEqual(plain);
            // Yami touches Fiend, Spellcaster and Fairy only; none of these results is one.
            expect(findBoardCombinations(terrainBoard("yami", FUSION_HAND)).fusions).toEqual(plain.fusions);
            expect(findBoardChains(terrainBoard(null, FUSION_HAND))).toEqual(
                findBoardChains(board(FUSION_HAND))
            );
        });

        it("orders rituals by the ATK of the result on the terrain, ties by id", () => {
            // Recipe 666 makes Yamadron (Dragon, 1600) and 677 makes card 702 (Warrior, 2000).
            const rituals = getRitualRecipes()
                .filter((recipe) => recipe.Result === YAMADRON || recipe.Result === 702)
                .flatMap((recipe) => expand(recipe) ?? []);
            expect(rituals).toHaveLength(2);
            const order = (terrain: TerrainId): number[] =>
                sortRitualsOnTerrain([...rituals], terrain).map((r) => r.result.id);
            expect(order("sogen")).toEqual([702, YAMADRON]);
            expect(order("mountain")).toEqual([YAMADRON, 702]);
            expect(terrainAttack(1600, 0, "mountain")).toBeGreaterThan(2000);
        });

        it("sorts a ritual board with a terrain without losing the ritual", () => {
            const { rituals } = findBoardCombinations(
                terrainBoard("mountain", [YAMADRON_RITUAL], YAMADRON_MATERIALS)
            );
            expect(rituals.map((r) => r.result.id)).toEqual([YAMADRON]);
        });

        it("chooses the top 5 chains after the terrain adjusts them", () => {
            const all = [...exploreHandStates(PROMOTION_HAND, MAX_CHAIN_STATES).candidates.values()];
            const printedRank = [...all].sort(compareCandidates).map((c) => c.last.result);
            expect(printedRank.indexOf(DINOSAUR_RESULT)).toBeGreaterThanOrEqual(5);

            const printed = findBoardChains(board(PROMOTION_HAND)).chains.map((c) => c.finalCard.id);
            expect(printed).not.toContain(DINOSAUR_RESULT);

            const { chains } = findBoardChains(terrainBoard("wasteland", PROMOTION_HAND));
            const promoted = chains.find((c) => c.finalCard.id === DINOSAUR_RESULT);
            expect(promoted).toBeDefined();
            // The summary keeps the printed ATK while the ranking uses 2250.
            expect(promoted?.finalCard.attack).toBe(1750);
            expect(chains).toHaveLength(5);
            const adjusted = chains.map((c) =>
                terrainAttack(c.finalCard.attack, c.finalCard.type, "wasteland")
            );
            expect(adjusted).toEqual([...adjusted].sort((a, b) => b - a));
        });

        it.each(TERRAIN_IDS)("ranks the chains of every candidate on %s by adjusted ATK", (terrain) => {
            const { chains } = findBoardChains(terrainBoard(terrain, PROMOTION_HAND));
            const adjusted = chains.map((c) => terrainAttack(c.finalCard.attack, c.finalCard.type, terrain));
            expect(adjusted).toEqual([...adjusted].sort((a, b) => b - a));
        });
    });
});
