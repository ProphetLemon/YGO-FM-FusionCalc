import type { CardSummary, ChainResult, FusionStep } from "../../shared/types.js";
import { getCardById, getFusionsForCard } from "../data/store.js";
import { toCardSummary } from "./cards.js";

export const MAX_CHAIN_HAND = 12;
const TOP_N = 5;

export function findBestChains(handIds: readonly number[]): ChainResult[] {
    if (handIds.length === 0) return [];

    const allResults: ChainResult[] = [];
    const visited = new Set<string>();

    function handKey(hand: readonly number[]): string {
        return [...hand].sort((a, b) => a - b).join(",");
    }

    function dfs(hand: number[], steps: FusionStep[]): void {
        const key = handKey(hand);
        if (visited.has(key)) return;
        visited.add(key);

        let fusedAny = false;
        for (let i = 0; i < hand.length - 1; i++) {
            for (let j = i + 1; j < hand.length; j++) {
                const id1 = hand[i];
                const id2 = hand[j];
                if (id1 === undefined || id2 === undefined) continue;
                const fusions = getFusionsForCard(id1);
                const entry = fusions.find((f) => f.card === id2);
                if (!entry) continue;

                const card1 = getCardById(id1);
                const card2 = getCardById(id2);
                const resultCard = getCardById(entry.result);
                if (!card1 || !card2 || !resultCard) continue;

                const step: FusionStep = {
                    card1: toCardSummary(card1),
                    card2: toCardSummary(card2),
                    result: toCardSummary(resultCard),
                };

                const newHand = hand.filter((_, idx) => idx !== i && idx !== j);
                newHand.push(entry.result);

                fusedAny = true;
                dfs(newHand, [...steps, step]);
            }
        }

        if (!fusedAny && steps.length > 0) {
            const best = bestCardInHand(hand);
            if (best) allResults.push({ steps, finalCard: best });
        }
    }

    dfs([...handIds], []);

    const seenIds = new Set<number>();
    const unique = allResults.filter((r) => {
        if (seenIds.has(r.finalCard.id)) return false;
        seenIds.add(r.finalCard.id);
        return true;
    });

    unique.sort((a, b) => {
        const diff = b.finalCard.attack - a.finalCard.attack;
        if (diff !== 0) return diff;
        return b.steps.length - a.steps.length;
    });

    return unique.slice(0, TOP_N);
}

function bestCardInHand(hand: readonly number[]): CardSummary | null {
    let best: CardSummary | null = null;
    for (const id of hand) {
        const card = getCardById(id);
        if (!card) continue;
        const summary = toCardSummary(card);
        if (!best || summary.attack > best.attack) best = summary;
    }
    return best;
}
