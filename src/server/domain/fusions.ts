import type { EquipExpanded, FusionExpanded } from "../../shared/types.js";
import { getCardById, getEquipsForCard, getFusionsForCard } from "../data/store.js";
import { toCardSummary } from "./cards.js";

export interface FusionsAndEquips {
    fusions: FusionExpanded[];
    equips: EquipExpanded[];
}

export function getFusionsFor(id: number): FusionsAndEquips | null {
    const card = getCardById(id);
    if (!card) return null;
    const cardSummary = toCardSummary(card);

    const fusionsList = getFusionsForCard(id);
    const fusions: FusionExpanded[] = [];
    for (const entry of fusionsList) {
        const partner = getCardById(entry.card);
        const result = getCardById(entry.result);
        if (!partner || !result) continue;
        fusions.push({
            card1: cardSummary,
            card2: toCardSummary(partner),
            result: toCardSummary(result),
        });
    }

    const equipIds = getEquipsForCard(id);
    const equips: EquipExpanded[] = [];
    for (const partnerId of equipIds) {
        const partner = getCardById(partnerId);
        if (!partner) continue;
        equips.push({ card1: cardSummary, card2: toCardSummary(partner) });
    }

    return { fusions, equips };
}
