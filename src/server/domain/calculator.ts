import type { CalculatorResponse, EquipExpanded, FusionExpanded } from "../../shared/types.js";
import { getCardById, getEquipsForCard, getFusionsForCard } from "../data/store.js";
import { toCardSummary } from "./cards.js";

export interface CalculatorInput {
    handIds: readonly number[];
}

export function findCombinations(input: CalculatorInput): CalculatorResponse {
    const fusions: FusionExpanded[] = [];
    const equips: EquipExpanded[] = [];

    const cards = input.handIds
        .map((id) => getCardById(id))
        .filter((card): card is NonNullable<typeof card> => card !== undefined);

    for (let i = 0; i < cards.length - 1; i++) {
        const card1 = cards[i];
        if (!card1) continue;
        const fusionsForCard = getFusionsForCard(card1.Id);
        const equipsForCard = getEquipsForCard(card1.Id);
        for (let j = i + 1; j < cards.length; j++) {
            const card2 = cards[j];
            if (!card2) continue;
            const fusion = fusionsForCard.find((f) => f.card === card2.Id);
            if (fusion) {
                const resultCard = getCardById(fusion.result);
                if (resultCard) {
                    fusions.push({
                        card1: toCardSummary(card1),
                        card2: toCardSummary(card2),
                        result: toCardSummary(resultCard),
                    });
                }
            }
            if (equipsForCard.includes(card2.Id)) {
                equips.push({ card1: toCardSummary(card1), card2: toCardSummary(card2) });
            }
        }
    }

    fusions.sort((a, b) => b.result.attack - a.result.attack);
    return { fusions, equips };
}
