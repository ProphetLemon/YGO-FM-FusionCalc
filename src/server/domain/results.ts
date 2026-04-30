import type { ResultExpanded } from "../../shared/types.js";
import { getCardById, getResultsForCard } from "../data/store.js";
import { toCardSummary } from "./cards.js";

export function getResultsFor(id: number): ResultExpanded[] | null {
    const card = getCardById(id);
    if (!card) return null;
    const entries = getResultsForCard(id);
    const expanded: ResultExpanded[] = [];
    for (const entry of entries) {
        const c1 = getCardById(entry.card1);
        const c2 = getCardById(entry.card2);
        if (!c1 || !c2) continue;
        expanded.push({ card1: toCardSummary(c1), card2: toCardSummary(c2) });
    }
    return expanded;
}
