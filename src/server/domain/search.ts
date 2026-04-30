import type { CardIndexEntry, CardSummary } from "../../shared/types.js";
import { getCardByNameLower, getCardIndex } from "../data/store.js";
import { toCardSummary } from "./cards.js";

export function findCardByExactName(name: string): CardSummary | null {
    const card = getCardByNameLower(name.toLowerCase());
    return card ? toCardSummary(card) : null;
}

export function findCardsByPrefix(prefix: string, limit = 10): CardIndexEntry[] {
    const normalised = prefix.toLowerCase();
    if (normalised.length === 0) return [];
    const matches: CardIndexEntry[] = [];
    for (const entry of getCardIndex()) {
        if (entry.name.toLowerCase().startsWith(normalised)) {
            matches.push(entry);
            if (matches.length >= limit) break;
        }
    }
    return matches;
}
