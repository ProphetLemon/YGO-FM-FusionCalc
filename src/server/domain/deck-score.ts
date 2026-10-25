import { DECK_SIZE } from "../../shared/limits.js";
import { atkOfPlay, fusionOfPlay, type HandEvaluator } from "./hand-evaluator.js";

export const HAND_SIZE = 5;

// C(n, 5): the number of different 5-card hands an n-card deck can deal.
export function handCount(deckSize: number): number {
    let count = 1;
    for (let i = 0; i < HAND_SIZE; i++) count = (count * (deckSize - i)) / (i + 1);
    return Math.round(count);
}

// C(40, 5) = 658,008.
export const HAND_COMBINATIONS = handCount(DECK_SIZE);

// Best-play thresholds the stats report: share of hands that reach each, and the dead hands at or below DEAD.
export const THRESHOLD_STRONG = 1500;
export const THRESHOLD_TOP = 2000;
export const DEAD_ATK = 1000;

// Exact totals over every 5-card hand of a deck. Divide a count by `hands` for a share.
export interface DeckScore {
    // How many hands the deck deals: C(n, 5).
    hands: number;
    // Sum of the best ATK of every hand; divide by `hands` for the average.
    totalAtk: number;
    strong: number;
    top: number;
    dead: number;
    // Hands whose best play is this fusion result and beats every card played as it is, by result id. A hand
    // whose best play is a card of the hand or a ritual result is not counted here.
    finals: Map<number, number>;
}

// Scores all the hands of the deck's slots, one by one: C(40, 5) = 658,008 for a real deck, about 0.15 s.
// The deck may hold any number of cards from 5 up, which keeps tests small.
export function scoreDeck(evaluator: HandEvaluator, deck: ArrayLike<number>): DeckScore {
    const n = deck.length;
    if (n < HAND_SIZE) throw new Error(`A deck needs at least ${HAND_SIZE} cards, got ${n}`);
    const cards = Int16Array.from(deck);
    const finals = new Map<number, number>();
    let totalAtk = 0;
    let strong = 0;
    let top = 0;
    let dead = 0;
    for (let a = 0; a < n - 4; a++) {
        for (let b = a + 1; b < n - 3; b++) {
            for (let c = b + 1; c < n - 2; c++) {
                for (let d = c + 1; d < n - 1; d++) {
                    for (let e = d + 1; e < n; e++) {
                        const play = evaluator.play(cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!);
                        const atk = atkOfPlay(play);
                        totalAtk += atk;
                        if (atk >= THRESHOLD_STRONG) strong++;
                        if (atk >= THRESHOLD_TOP) top++;
                        if (atk <= DEAD_ATK) dead++;
                        const fusion = fusionOfPlay(play);
                        if (fusion !== 0) finals.set(fusion, (finals.get(fusion) ?? 0) + 1);
                    }
                }
            }
        }
    }
    return { hands: handCount(n), totalAtk, strong, top, dead, finals };
}
