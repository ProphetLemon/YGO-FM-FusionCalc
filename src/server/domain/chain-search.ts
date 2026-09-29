import { MAX_HAND_SIZE } from "../../shared/limits.js";
import type { CardSummary, ChainResult, ChainSearchResponse, FusionStep } from "../../shared/types.js";
import { getCardById, getFusionResult } from "../data/store.js";
import { isMonster, toCardSummary } from "./cards.js";

// Alias of the shared cap, kept for the callers that still import the chain-search name.
export const MAX_CHAIN_HAND = MAX_HAND_SIZE;
// Hand states the search may discover before it stops and reports `truncated`. Random hands need a few
// thousand at most; 50k caps the densest 12-card hands at roughly 0.2-0.3 s (measured with the full data).
export const MAX_CHAIN_STATES = 50_000;
const TOP_N = 5;

interface RawStep {
    previous: RawStep | null;
    card1: number;
    card2: number;
    result: number;
}

interface SearchState {
    // Fusion results are appended at the end, so untouched cards keep their slot order.
    hand: number[];
    // Same cards in ascending order: its joined ids identify the state.
    sorted: number[];
    last: RawStep | null;
}

interface Candidate {
    last: RawStep;
    steps: number;
    attack: number;
}

interface Exploration {
    candidates: Map<number, Candidate>;
    truncated: boolean;
}

// A chain ends at the fusion that makes its final card (a monster), never at a card left in the hand.
export function findBestChains(
    handIds: readonly number[],
    maxStates: number = MAX_CHAIN_STATES
): ChainSearchResponse {
    const hand = handIds.filter((id) => getCardById(id) !== undefined);
    const { candidates, truncated } = exploreHandStates(hand, maxStates);

    const chains = [...candidates.values()]
        .sort((a, b) => b.attack - a.attack || a.steps - b.steps || a.last.result - b.last.result)
        .slice(0, TOP_N)
        .map(toChainResult);
    return { chains, truncated };
}

// Breadth-first, so the first chain that produces a card is also the shortest one.
function exploreHandStates(initialHand: number[], maxStates: number): Exploration {
    const initialSorted = [...initialHand].sort((a, b) => a - b);
    const visited = new Set<string>([initialSorted.join(",")]);
    const candidates = new Map<number, Candidate>();
    let frontier: SearchState[] = [{ hand: initialHand, sorted: initialSorted, last: null }];

    for (let steps = 1; frontier.length > 0; steps++) {
        const next: SearchState[] = [];
        for (const { hand, sorted, last } of frontier) {
            for (let i = 0; i < hand.length - 1; i++) {
                for (let j = i + 1; j < hand.length; j++) {
                    const card1 = hand[i];
                    const card2 = hand[j];
                    if (card1 === undefined || card2 === undefined) continue;
                    const result = getFusionResult(card1, card2);
                    if (result === undefined) continue;
                    const resultCard = getCardById(result);
                    if (!resultCard) continue;

                    const fusedSorted = fuseSorted(sorted, card1, card2, result);
                    const key = fusedSorted.join(",");
                    const isNewState = !visited.has(key);
                    const isNewFinalCard = isMonster(resultCard) && !candidates.has(result);
                    if (!isNewState && !isNewFinalCard) continue;

                    // Every fusion ends a chain, even when it leads to a state that is already known.
                    const step: RawStep = { previous: last, card1, card2, result };
                    if (isNewFinalCard) {
                        candidates.set(result, { last: step, steps, attack: resultCard.Attack });
                    }
                    if (!isNewState) continue;

                    if (visited.size >= maxStates) return { candidates, truncated: true };
                    visited.add(key);
                    const fusedHand = hand.filter((_, index) => index !== i && index !== j);
                    fusedHand.push(result);
                    next.push({ hand: fusedHand, sorted: fusedSorted, last: step });
                }
            }
        }
        frontier = next;
    }
    return { candidates, truncated: false };
}

function fuseSorted(sorted: readonly number[], card1: number, card2: number, result: number): number[] {
    const fused: number[] = [];
    let removed1 = false;
    let removed2 = false;
    let inserted = false;
    for (const id of sorted) {
        if (!removed1 && id === card1) {
            removed1 = true;
            continue;
        }
        if (!removed2 && id === card2) {
            removed2 = true;
            continue;
        }
        if (!inserted && result <= id) {
            fused.push(result);
            inserted = true;
        }
        fused.push(id);
    }
    if (!inserted) fused.push(result);
    return fused;
}

function toChainResult(candidate: Candidate): ChainResult {
    const steps: FusionStep[] = [];
    for (let step: RawStep | null = candidate.last; step !== null; step = step.previous) {
        steps.push({
            card1: toSummary(step.card1),
            card2: toSummary(step.card2),
            result: toSummary(step.result),
        });
    }
    steps.reverse();
    return { steps, finalCard: toSummary(candidate.last.result) };
}

function toSummary(id: number): CardSummary {
    const card = getCardById(id);
    if (!card) throw new Error(`Card ${id} is missing from the store`);
    return toCardSummary(card);
}
