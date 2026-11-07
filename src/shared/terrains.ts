// Field terrains of Forbidden Memories. A terrain raises or lowers the ATK of the monsters of some Types by
// 500. Source: the table `gDuel_aTerrainBoost` of the retail PS1 executable (decompiled), which is
// authoritative over the field card texts. Type ids are the indexes of `types-and-stars.json`.

export const TERRAIN_IDS = ["forest", "wasteland", "mountain", "sogen", "umi", "yami"] as const;

export type TerrainId = (typeof TERRAIN_IDS)[number];

// ATK points a terrain adds to a boosted Type and takes from a weakened one.
export const TERRAIN_AMOUNT = 500;
// Bounds the game clamps a monster's ATK to after the terrain is applied.
export const MIN_TERRAIN_ATK = 0;
export const MAX_TERRAIN_ATK = 9999;

export interface Terrain {
    id: TerrainId;
    // Id of the field card that sets this terrain.
    fieldCard: number;
    // Monster Types (ids) that gain TERRAIN_AMOUNT ATK.
    boosted: readonly number[];
    // Monster Types (ids) that lose TERRAIN_AMOUNT ATK.
    weakened: readonly number[];
    // Duelists who start a duel on this terrain.
    duelists: readonly string[];
}

// Types from this id up are magic, trap, ritual and equip cards.
const FIRST_NON_MONSTER_TYPE = 20;

const DRAGON = 0;
const SPELLCASTER = 1;
const ZOMBIE = 2;
const WARRIOR = 3;
const BEAST_WARRIOR = 4;
const BEAST = 5;
const WINGED_BEAST = 6;
const FIEND = 7;
const FAIRY = 8;
const INSECT = 9;
const DINOSAUR = 10;
const FISH = 12;
const SEA_SERPENT = 13;
const MACHINE = 14;
const THUNDER = 15;
const AQUA = 16;
const PYRO = 17;
const ROCK = 18;
const PLANT = 19;

export const TERRAINS: Readonly<Record<TerrainId, Terrain>> = {
    forest: {
        id: "forest",
        fieldCard: 330,
        boosted: [BEAST, BEAST_WARRIOR, INSECT, PLANT],
        weakened: [],
        duelists: ["Forest Mage", "High Mage Anubisius"],
    },
    wasteland: {
        id: "wasteland",
        fieldCard: 331,
        boosted: [DINOSAUR, ZOMBIE, ROCK],
        weakened: [],
        duelists: ["Desert Mage", "High Mage Martis"],
    },
    mountain: {
        id: "mountain",
        fieldCard: 332,
        boosted: [DRAGON, WINGED_BEAST, THUNDER],
        weakened: [],
        duelists: ["Mountain Mage", "High Mage Atenza"],
    },
    sogen: {
        id: "sogen",
        fieldCard: 333,
        boosted: [WARRIOR, BEAST_WARRIOR],
        weakened: [],
        duelists: ["Meadow Mage", "High Mage Kepura"],
    },
    umi: {
        id: "umi",
        fieldCard: 334,
        boosted: [FISH, SEA_SERPENT, THUNDER, AQUA],
        weakened: [MACHINE, PYRO],
        duelists: ["Ocean Mage", "High Mage Secmeton"],
    },
    yami: {
        id: "yami",
        fieldCard: 335,
        boosted: [FIEND, SPELLCASTER],
        weakened: [FAIRY],
        duelists: ["Guardian Sebek", "Guardian Neku"],
    },
};

export function isTerrainId(value: unknown): value is TerrainId {
    return typeof value === "string" && (TERRAIN_IDS as readonly string[]).includes(value);
}

// ATK change of a monster of `type` on `terrain`: +500, -500 or 0.
export function terrainDelta(type: number, terrain: TerrainId): number {
    const entry = TERRAINS[terrain];
    if (entry.boosted.includes(type)) return TERRAIN_AMOUNT;
    if (entry.weakened.includes(type)) return -TERRAIN_AMOUNT;
    return 0;
}

// The ATK a monster of `type` has on `terrain`, clamped to 0..9999. Applies to monsters only: a card whose
// type is not a monster (20 and up) keeps its value.
export function terrainAttack(attack: number, type: number, terrain: TerrainId | null | undefined): number {
    if (terrain === null || terrain === undefined || type >= FIRST_NON_MONSTER_TYPE) return attack;
    const adjusted = attack + terrainDelta(type, terrain);
    return Math.min(MAX_TERRAIN_ATK, Math.max(MIN_TERRAIN_ATK, adjusted));
}
