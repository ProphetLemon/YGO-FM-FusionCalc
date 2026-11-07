import { describe, expect, it } from "vitest";
import { markText, statOnTerrain, terrainTypes } from "../../../src/client/lib/terrain-view.js";
import { TERRAIN_IDS } from "../../../src/shared/terrains.js";

describe("terrainTypes", () => {
    it("names the boosted and weakened Types of Umi and who plays it", () => {
        expect(terrainTypes("umi")).toEqual({
            boosted: ["Fish", "Sea Serpent", "Thunder", "Aqua"],
            weakened: ["Machine", "Pyro"],
            duelists: ["Ocean Mage", "High Mage Secmeton"],
        });
    });

    it("names the Types of Yami, with Fairy weakened", () => {
        const yami = terrainTypes("yami");
        expect(yami.boosted).toEqual(["Fiend", "Spellcaster"]);
        expect(yami.weakened).toEqual(["Fairy"]);
        expect(yami.duelists).toEqual(["Guardian Sebek", "Guardian Neku"]);
    });

    it("gives every terrain at least one boosted Type and one duelist, and a name to each Type", () => {
        for (const id of TERRAIN_IDS) {
            const { boosted, weakened, duelists } = terrainTypes(id);
            expect(boosted.length).toBeGreaterThan(0);
            expect(duelists.length).toBeGreaterThan(0);
            for (const name of [...boosted, ...weakened]) expect(name).toMatch(/^[A-Za-z-]+( [A-Za-z]+)?$/);
        }
    });
});

describe("statOnTerrain", () => {
    const AQUA = 16;
    const MACHINE = 14;
    const REPTILE = 11;
    const EQUIP = 23;

    it("is the printed value, unmarked, without a terrain", () => {
        expect(statOnTerrain(1800, AQUA, null)).toEqual({ value: 1800, printed: 1800, mark: 0 });
    });

    it("marks +500 on a boosted Type and -500 on a weakened one, for ATK and DEF alike", () => {
        expect(statOnTerrain(1800, AQUA, "umi")).toEqual({ value: 2300, printed: 1800, mark: 500 });
        expect(statOnTerrain(1200, MACHINE, "umi")).toEqual({ value: 700, printed: 1200, mark: -500 });
    });

    it("leaves a Type the terrain does not touch, and a card that is not a monster, without a mark", () => {
        expect(statOnTerrain(1800, REPTILE, "umi").mark).toBe(0);
        expect(statOnTerrain(1800, AQUA, "forest").mark).toBe(0);
        expect(statOnTerrain(0, EQUIP, "umi")).toEqual({ value: 0, printed: 0, mark: 0 });
    });

    it("clamps at 0 and at 9999", () => {
        expect(statOnTerrain(300, MACHINE, "umi")).toEqual({ value: 0, printed: 300, mark: -500 });
        expect(statOnTerrain(9800, AQUA, "umi")).toEqual({ value: 9999, printed: 9800, mark: 500 });
    });

    it("does not mark a stat the clamp leaves where it was", () => {
        expect(statOnTerrain(0, MACHINE, "umi").mark).toBe(0);
        expect(statOnTerrain(9999, AQUA, "umi").mark).toBe(0);
    });
});

describe("markText", () => {
    it("writes the sign, with a real minus", () => {
        expect(markText(500)).toBe("+500");
        expect(markText(-500)).toBe("\u2212500");
        expect(markText(0)).toBe("");
    });
});
