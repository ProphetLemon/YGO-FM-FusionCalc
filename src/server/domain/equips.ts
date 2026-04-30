import type { CardSummary } from "../../shared/types.js";
import { getCardById, getEquipsForCard } from "../data/store.js";
import { toCardSummary } from "./cards.js";

export function getEquipsFor(id: number): CardSummary[] | null {
    const card = getCardById(id);
    if (!card) return null;
    const partners = getEquipsForCard(id);
    const result: CardSummary[] = [];
    for (const partnerId of partners) {
        const partner = getCardById(partnerId);
        if (partner) result.push(toCardSummary(partner));
    }
    return result;
}
