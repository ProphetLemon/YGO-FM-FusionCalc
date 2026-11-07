import { TERRAIN_AMOUNT, TERRAINS, terrainAttack, type TerrainId } from "../../shared/terrains.js";
import typesAndStars from "../../shared/types-and-stars.json";

export interface TerrainTypes {
    // Names of the monster Types that gain the terrain bonus, in the order of the table.
    boosted: string[];
    // Names of the monster Types that lose it.
    weakened: string[];
    // The duelists who start a duel on the terrain.
    duelists: string[];
}

function typeName(id: number): string {
    return typesAndStars.cardTypes[id] ?? String(id);
}

// What a terrain does, in the names the cards show (the app names Types in English everywhere).
export function terrainTypes(terrain: TerrainId): TerrainTypes {
    const entry = TERRAINS[terrain];
    return {
        boosted: entry.boosted.map(typeName),
        weakened: entry.weakened.map(typeName),
        duelists: [...entry.duelists],
    };
}

// What the terrain did to one printed stat of a monster (ATK or DEF; the table is the same for both).
export interface TerrainStat {
    // The value the monster has on the terrain: clamped to 0..9999, the printed one when the terrain leaves it.
    value: number;
    // The value the card prints.
    printed: number;
    // +500 or -500 when the terrain changed the value, 0 when it did not. A stat the clamp leaves where it was
    // (a 0 that loses 500) is not changed, so it carries no mark.
    mark: number;
}

// `terrainAttack` applies to DEF too: the game gives both the same bonus.
export function statOnTerrain(printed: number, type: number, terrain: TerrainId | null): TerrainStat {
    const value = terrainAttack(printed, type, terrain);
    if (value === printed || terrain === null) return { value, printed, mark: 0 };
    return { value, printed, mark: value > printed ? TERRAIN_AMOUNT : -TERRAIN_AMOUNT };
}

// "+500" or "\u2212500" (a real minus sign), the short mark next to a changed value; "" for no change.
export function markText(mark: number): string {
    if (mark === 0) return "";
    return `${mark > 0 ? "+" : "\u2212"}${Math.abs(mark)}`;
}
