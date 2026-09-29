import type { CardSummary, RitualData, RitualExpanded } from "../../shared/types.js";
import { getCardById, getRitualRecipes } from "../data/store.js";
import { toCardSummary } from "./cards.js";

// Each requirement takes its own hand card, so an id a recipe lists twice must be in the hand twice.
export function findRituals(
    handIds: readonly number[],
    recipes: readonly RitualData[] = getRitualRecipes()
): RitualExpanded[] {
    const inHand = countIds(handIds);
    const rituals: RitualExpanded[] = [];
    for (const recipe of recipes) {
        if (!isComplete(recipe, inHand)) continue;
        const ritual = expand(recipe);
        if (ritual) rituals.push(ritual);
    }
    return rituals.sort((a, b) => b.result.attack - a.result.attack || a.result.id - b.result.id);
}

function countIds(ids: readonly number[]): Map<number, number> {
    const counts = new Map<number, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
}

function isComplete(recipe: RitualData, inHand: ReadonlyMap<number, number>): boolean {
    const needed = countIds([recipe.RitualCard, recipe.Card1, recipe.Card2, recipe.Card3]);
    for (const [id, count] of needed) {
        if ((inHand.get(id) ?? 0) < count) return false;
    }
    return true;
}

// Null when the store lacks one of the recipe cards, like the other domain functions skip unknown ids.
function expand(recipe: RitualData): RitualExpanded | null {
    const ritualCard = getCardById(recipe.RitualCard);
    const result = getCardById(recipe.Result);
    if (!ritualCard || !result) return null;
    const materials: CardSummary[] = [];
    for (const id of [recipe.Card1, recipe.Card2, recipe.Card3]) {
        const material = getCardById(id);
        if (!material) return null;
        materials.push(toCardSummary(material));
    }
    return { ritualCard: toCardSummary(ritualCard), materials, result: toCardSummary(result) };
}
