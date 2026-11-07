import { TERRAIN_AMOUNT, TERRAIN_IDS, isTerrainId, type TerrainId } from "../../shared/terrains.js";
import { terrainTypes } from "../lib/terrain-view.js";
import { getLang, t } from "../lib/i18n.js";

// "Beast, Insect and Plant", in the language of the page. Only for the Types: the grammar of the joiner may
// change with the word that follows (Spanish "e" before "Hi"), so the duelists are joined with commas instead.
function listOf(names: readonly string[]): string {
    return new Intl.ListFormat(getLang(), { style: "long", type: "conjunction" }).format(names);
}

// The page a terrain control sits on: it names the stats the terrain changes there and closes the hint.
export type TerrainScope = "deck" | "calculator";

// What a terrain does to each Type and who plays it, then what the page does with it; without a terrain, that
// the numbers are the printed ones. The keys `<scope>.terrain.stats`, `.hint.none` and `.hint.scored` are the
// page's own, the rest is shared.
export function terrainHintText(terrain: TerrainId | null, scope: TerrainScope): string {
    if (terrain === null) return t(`${scope}.terrain.hint.none`);
    const { boosted, weakened, duelists } = terrainTypes(terrain);
    const amount = String(TERRAIN_AMOUNT);
    const stats = t(`${scope}.terrain.stats`);
    return [
        boosted.length > 0 ? t("terrain.hint.boost", { amount, stats, types: listOf(boosted) }) : "",
        weakened.length > 0 ? t("terrain.hint.weaken", { amount, stats, types: listOf(weakened) }) : "",
        t("terrain.hint.players", { names: duelists.join(", ") }),
        t(`${scope}.terrain.hint.scored`),
    ]
        .filter(Boolean)
        .join(" ");
}

// "No terrain" first (the empty value), then the six terrains in game order, each by its game name and where
// it is played.
export function fillTerrainOptions(select: HTMLSelectElement): void {
    const none = document.createElement("option");
    none.value = "";
    none.textContent = t("terrain.none");
    select.appendChild(none);
    for (const id of TERRAIN_IDS) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = t("terrain.option", {
            name: t(`terrain.name.${id}`),
            place: t(`terrain.place.${id}`),
        });
        select.appendChild(option);
    }
    select.value = "";
}

// The terrain a select holds: null for "No terrain".
export function readTerrain(select: HTMLSelectElement): TerrainId | null {
    return isTerrainId(select.value) ? select.value : null;
}
