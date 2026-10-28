import type {
    CardSummary,
    DeckFinal,
    DeckOptimizeMethod,
    DeckOptimizeRequest,
    DeckOptimizeResponse,
    DeckStats,
    DeckSwap,
} from "../../shared/types.js";
import { getCardById } from "../data/store.js";
import { toCardSummary } from "./cards.js";
import { scoreDeck, type DeckScore } from "./deck-score.js";
import {
    EXHAUSTIVE_MAX_DECKS,
    buildSearchSpace,
    exhaustiveBest,
    localSearch,
    planExhaustive,
    seededRandom,
} from "./deck-search.js";
import { getHandEvaluator } from "./hand-evaluator.js";

// Wall-clock time the local search may use. The search checks the clock between steps (a step is at most
// about 0.5 s), so the whole call can run a little over. The exhaustive search is bounded by its pool size
// instead, and takes about a second at most.
export const MAX_SEARCH_MILLIS = 5_000;
const DEFAULT_SEED = 20_251_025;
const TOP_FINALS = 8;

export interface DeckOptimizeOptions {
    // Non-monster cards of the current deck stay in. The score cannot see their value. Default true. The
    // cards of `request.locked` stay in either way.
    keepNonMonsters?: boolean;
    // Seeds the sampling of the local search, so one input always gives one answer (when no budget is hit).
    seed?: number;
    maxMillis?: number;
    // Clock in milliseconds, injectable so tests can run out of time without waiting.
    now?: () => number;
    // The exhaustive search handles pools with at most this many possible decks; larger ones use local search.
    exhaustiveMaxDecks?: number;
    // Steps of the tabu search that ends the local search.
    tabuSteps?: number;
}

function round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function toStats(score: DeckScore): DeckStats {
    return {
        averageBestAtk: round(score.totalAtk / score.hands, 2),
        share1500: round(score.strong / score.hands, 4),
        share2000: round(score.top / score.hands, 4),
        shareDead: round(score.dead / score.hands, 4),
    };
}

function summary(id: number): CardSummary {
    const card = getCardById(id);
    if (!card) throw new Error(`Card ${id} is missing from the store`);
    return toCardSummary(card);
}

function sameCards(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
    if (a.length !== b.length) return false;
    const counts = countOf(a);
    for (let i = 0; i < b.length; i++) {
        const left = counts.get(b[i] as number) ?? 0;
        if (left === 0) return false;
        counts.set(b[i] as number, left - 1);
    }
    return true;
}

function countOf(ids: ArrayLike<number>): Map<number, number> {
    const counts = new Map<number, number>();
    for (let i = 0; i < ids.length; i++)
        counts.set(ids[i] as number, (counts.get(ids[i] as number) ?? 0) + 1);
    return counts;
}

// The new deck laid out in the slots of the old one: a card that stays keeps its slot, and the cards that
// enter fill the slots of the cards that leave. Returns the deck and the swaps, out to in.
export function arrangeDeck(
    before: readonly number[],
    after: ArrayLike<number>
): { deck: number[]; swaps: DeckSwap[] } {
    const entering = countOf(after);
    const vacated: number[] = [];
    const deck = [...before];
    before.forEach((id, slot) => {
        const left = entering.get(id) ?? 0;
        if (left > 0) entering.set(id, left - 1);
        else vacated.push(slot);
    });
    const incoming = [...entering]
        .flatMap(([id, copies]) => Array<number>(copies).fill(id))
        .sort((a, b) => a - b);
    const swaps = vacated.map((slot, i) => {
        const out = before[slot] as number;
        deck[slot] = incoming[i] as number;
        return { out: summary(out), in: summary(incoming[i] as number) };
    });
    return { deck, swaps };
}

// Picks the 40-card deck, from the deck and the spare cards, whose 5-card hands make the strongest play on
// average (a monster as it is, a fusion chain's final card, or a ritual result; magic, equip and field
// cards score 0). The average is exact over all 658,008 hands of the deck. The route only accepts 40-card
// decks; any size from 5 cards works here, which lets tests run the whole path on small decks.
// When the number of possible decks is small, every one is tried and the answer is certified; otherwise a
// local search finds a deck that no single swap with any owned card improves (unless the budget ends first).
export function optimizeDeck(
    request: DeckOptimizeRequest,
    options: DeckOptimizeOptions = {}
): DeckOptimizeResponse {
    const now = options.now ?? (() => performance.now());
    const deadline = now() + (options.maxMillis ?? MAX_SEARCH_MILLIS);
    const keepNonMonsters = options.keepNonMonsters ?? request.keepNonMonsters ?? true;

    const evaluator = getHandEvaluator();
    const original = Int16Array.from(request.deck);
    const space = buildSearchSpace(evaluator, request.deck, request.trunk, keepNonMonsters, request.locked);

    let found: ArrayLike<number>;
    let method: DeckOptimizeMethod;
    let truncated = false;
    const plan = planExhaustive(
        evaluator,
        request.deck,
        space,
        options.exhaustiveMaxDecks ?? EXHAUSTIVE_MAX_DECKS
    );
    if (plan !== null) {
        found = exhaustiveBest(evaluator, plan);
        method = "exhaustive";
    } else {
        const result = localSearch(evaluator, space, original, {
            random: seededRandom(options.seed ?? DEFAULT_SEED),
            expired: () => now() >= deadline,
            ...(options.tabuSteps === undefined ? {} : { tabuSteps: options.tabuSteps }),
        });
        found = result.deck;
        method = "local-search";
        truncated = result.truncated;
    }

    // Every reported number is scored again here, on all hands, whatever the search believed.
    const current = scoreDeck(evaluator, original);
    const unchanged = sameCards(original, found);
    const candidate = unchanged ? current : scoreDeck(evaluator, found);
    // A search that found nothing better leaves the deck as it was.
    const improved = candidate.totalAtk > current.totalAtk;
    const recommended = improved ? candidate : current;
    const { deck, swaps } = improved
        ? arrangeDeck(request.deck, found)
        : { deck: [...request.deck], swaps: [] };

    const topFinals: DeckFinal[] = [...recommended.finals]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, TOP_FINALS)
        .map(([id, hands]) => ({ card: summary(id), share: round(hands / recommended.hands, 4) }));

    return {
        current: toStats(current),
        recommended: toStats(recommended),
        swaps,
        deck: deck.map(summary),
        topFinals,
        truncated,
        certified: method === "exhaustive",
        method,
    };
}
