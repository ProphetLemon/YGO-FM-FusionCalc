import { describe, expect, it } from "vitest";
import {
    MAX_TERRAIN_ATK,
    TERRAIN_AMOUNT,
    TERRAIN_IDS,
    TERRAINS,
    isTerrainId,
    terrainAttack,
} from "../../../src/shared/terrains.js";
import typesAndStars from "../../../src/shared/types-and-stars.json" with { type: "json" };

const TYPE = Object.fromEntries(typesAndStars.cardTypes.map((name, id) => [name, id])) as Record<
    string,
    number
>;

describe("terrains", () => {
    it("lists the six terrains, each keyed by its own id", () => {
        expect([...TERRAIN_IDS]).toEqual(["forest", "wasteland", "mountain", "sogen", "umi", "yami"]);
        for (const id of TERRAIN_IDS) expect(TERRAINS[id].id).toBe(id);
    });

    it("holds the table of the game executable", () => {
        const names = (types: readonly number[]) => types.map((id) => typesAndStars.cardTypes[id]).sort();
        expect(names(TERRAINS.forest.boosted)).toEqual(["Beast", "Beast-Warrior", "Insect", "Plant"].sort());
        expect(names(TERRAINS.wasteland.boosted)).toEqual(["Dinosaur", "Rock", "Zombie"]);
        expect(names(TERRAINS.mountain.boosted)).toEqual(["Dragon", "Thunder", "Winged Beast"]);
        expect(names(TERRAINS.sogen.boosted)).toEqual(["Beast-Warrior", "Warrior"]);
        expect(names(TERRAINS.umi.boosted)).toEqual(["Aqua", "Fish", "Sea Serpent", "Thunder"]);
        expect(names(TERRAINS.umi.weakened)).toEqual(["Machine", "Pyro"]);
        expect(names(TERRAINS.yami.boosted)).toEqual(["Fiend", "Spellcaster"]);
        expect(names(TERRAINS.yami.weakened)).toEqual(["Fairy"]);
        expect(TERRAIN_IDS.map((id) => TERRAINS[id].fieldCard)).toEqual([330, 331, 332, 333, 334, 335]);
        // Nothing touches Reptile, and only Umi and Yami weaken anything.
        for (const id of TERRAIN_IDS) {
            expect(TERRAINS[id].boosted).not.toContain(TYPE.Reptile);
            expect(TERRAINS[id].weakened).not.toContain(TYPE.Reptile);
            expect(TERRAINS[id].duelists.length).toBeGreaterThan(0);
        }
    });

    it("recognises only the six ids", () => {
        for (const id of TERRAIN_IDS) expect(isTerrainId(id)).toBe(true);
        for (const value of ["Umi", "sea", "", null, undefined, 4, {}, ["umi"]]) {
            expect(isTerrainId(value)).toBe(false);
        }
    });

    it("adds and takes 500 by Type, and leaves other Types alone", () => {
        expect(terrainAttack(1500, TYPE.Aqua!, "umi")).toBe(1500 + TERRAIN_AMOUNT);
        expect(terrainAttack(1500, TYPE.Machine!, "umi")).toBe(1500 - TERRAIN_AMOUNT);
        expect(terrainAttack(1500, TYPE.Reptile!, "umi")).toBe(1500);
        expect(terrainAttack(1500, TYPE.Fairy!, "yami")).toBe(1000);
        expect(terrainAttack(1500, TYPE.Machine!, "yami")).toBe(1500);
    });

    it("clamps to 0..9999 and ignores no terrain", () => {
        expect(terrainAttack(300, TYPE.Machine!, "umi")).toBe(0);
        expect(terrainAttack(0, TYPE.Pyro!, "umi")).toBe(0);
        expect(terrainAttack(9800, TYPE.Aqua!, "umi")).toBe(MAX_TERRAIN_ATK);
        expect(terrainAttack(1500, TYPE.Aqua!, null)).toBe(1500);
        expect(terrainAttack(1500, TYPE.Aqua!, undefined)).toBe(1500);
    });

    it("applies to monsters only", () => {
        const magic = 20;
        for (const id of TERRAIN_IDS) expect(terrainAttack(0, magic, id)).toBe(0);
    });
});
