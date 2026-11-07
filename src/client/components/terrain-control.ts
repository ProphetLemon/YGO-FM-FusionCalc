import { TERRAIN_AMOUNT, TERRAIN_IDS, isTerrainId, type TerrainId } from "../../shared/terrains.js";
import { terrainTypes } from "../lib/deck-view.js";
import { getLang, t } from "../lib/i18n.js";

// "Beast, Insect and Plant", in the language of the page. Only for the Types: the grammar of the joiner may
// change with the word that follows (Spanish "e" before "Hi"), so the duelists are joined with commas instead.
function listOf(names: readonly string[]): string {
    return new Intl.ListFormat(getLang(), { style: "long", type: "conjunction" }).format(names);
}

// What a terrain does to the ATK of each Type and who plays it; without a terrain, that the ATK is the printed one.
export function terrainHintText(terrain: TerrainId | null): string {
    if (terrain === null) return t("deck.terrain.hint.none");
    const { boosted, weakened, duelists } = terrainTypes(terrain);
    const amount = String(TERRAIN_AMOUNT);
    return [
        boosted.length > 0 ? t("deck.terrain.hint.boost", { amount, types: listOf(boosted) }) : "",
        weakened.length > 0 ? t("deck.terrain.hint.weaken", { amount, types: listOf(weakened) }) : "",
        t("deck.terrain.hint.players", { names: duelists.join(", ") }),
        t("deck.terrain.hint.scored"),
    ]
        .filter(Boolean)
        .join(" ");
}

// "No terrain" first (the empty value), then the six terrains in game order, each by its game name and where
// it is played.
export function fillTerrainOptions(select: HTMLSelectElement): void {
    const none = document.createElement("option");
    none.value = "";
    none.textContent = t("deck.terrain.none");
    select.appendChild(none);
    for (const id of TERRAIN_IDS) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = t("deck.terrain.option", {
            name: t(`deck.terrain.name.${id}`),
            place: t(`deck.terrain.place.${id}`),
        });
        select.appendChild(option);
    }
    select.value = "";
}

// The terrain a select holds: null for "No terrain".
export function readTerrain(select: HTMLSelectElement): TerrainId | null {
    return isTerrainId(select.value) ? select.value : null;
}
