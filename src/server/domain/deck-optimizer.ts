import { DECK_SIZE, MAX_COPIES_PER_CARD } from "../../shared/limits.js";
import type {
    CardSummary,
    DeckFinal,
    DeckOptimizeRequest,
    DeckOptimizeResponse,
    DeckStats,
    DeckSwap,
} from "../../shared/types.js";
import { getCardById, getFusionResult } from "../data/store.js";
import { isMonster, toCardSummary } from "./cards.js";
import { findBestChains } from "./chain-search.js";

const HAND_SIZE = 5;
// Random hands the search scores every candidate on, and the larger sample the reported stats use.
export const SEARCH_HANDS = 2_000;
export const CHECK_HANDS = 20_000;
// Hand evaluations the search may compute (cache hits are free) and the wall-clock time it may take.
export const MAX_EVALUATIONS = 400_000;
export const MAX_SEARCH_MILLIS = 2_000;
// Per sweep, the spare cards tried to come in and the deck cards tried to go out, chosen by a cheap score.
const MAX_IN_CANDIDATES = 24;
const MAX_OUT_CANDIDATES = 12;
// A swap must raise the average best ATK of the search hands by this much, so noise is not chased.
const MIN_AVERAGE_GAIN = 2;
// Weight of a fusion result in the cheap score: roughly the chance that its two cards meet in a hand.
const FUSION_WEIGHT = 0.1;
const DEFAULT_SEED = 20_251_025;
const TOP_FINALS = 8;
// Entries kept in the hand cache before it is emptied, so one request cannot grow memory without bound.
const MAX_CACHED_HANDS = 400_000;
// A cached play packs the ATK and the fusion that made it: atk * PLAY_BASE + card id (0 when the strongest
// monster is a card of the hand itself). Ids stay below the base, and a sorted hand packs into 50 bits.
const PLAY_BASE = 1024;
const THRESHOLDS = [1500, 2000] as const;

export interface DeckOptimizeOptions {
    // Non-monster cards of the current deck stay in. The score cannot see their value. Default true.
    keepNonMonsters?: boolean;
    // Seeds the hands, so one input always gives one answer.
    seed?: number;
    // Replaces the seeded generator; returns numbers in [0, 1).
    random?: () => number;
    searchHands?: number;
    checkHands?: number;
    maxEvaluations?: number;
    maxMillis?: number;
    // Scores hands; replaceable, and kept apart from the search loop.
    scorer?: HandScorer;
    // Clock in milliseconds, injectable so tests can run out of time without waiting.
    now?: () => number;
}

interface Swap {
    position: number;
    card: number;
    gain: number;
}

// Mulberry32: a small seeded generator with an even spread, enough for sampling hands.
export function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Hands as positions in the deck (0..39): `count` hands of 5 distinct positions, stored flat.
function sampleHands(count: number, random: () => number): Uint8Array {
    const hands = new Uint8Array(count * HAND_SIZE);
    const slots = Array.from({ length: DECK_SIZE }, (_, i) => i);
    for (let h = 0; h < count; h++) {
        for (let i = 0; i < HAND_SIZE; i++) {
            const pick = i + Math.floor(random() * (DECK_SIZE - i));
            const chosen = slots[pick] as number;
            slots[pick] = slots[i] as number;
            slots[i] = chosen;
            hands[h * HAND_SIZE + i] = chosen;
        }
    }
    return hands;
}

// The strongest monster a hand can make: a monster card as it is, or the best final of a fusion chain.
function computePlay(ids: readonly number[]): number {
    let ownBest = 0;
    for (const id of ids) {
        const card = getCardById(id);
        if (card && isMonster(card) && card.Attack > ownBest) ownBest = card.Attack;
    }
    const top = findBestChains(ids).chains[0];
    if (top && top.finalCard.attack > ownBest) return top.finalCard.attack * PLAY_BASE + top.finalCard.id;
    return ownBest * PLAY_BASE;
}

// Scores hands by the ids they hold. The result for each sorted hand is cached, and only computed hands count
// against the evaluation budget.
export class HandScorer {
    computed = 0;
    private readonly cache = new Map<number, number>();
    private readonly sorted: number[] = new Array<number>(HAND_SIZE).fill(0);

    play(ids: readonly number[]): number {
        const sorted = this.sorted;
        for (let i = 0; i < HAND_SIZE; i++) {
            const id = ids[i] as number;
            let j = i;
            while (j > 0 && (sorted[j - 1] as number) > id) {
                sorted[j] = sorted[j - 1] as number;
                j--;
            }
            sorted[j] = id;
        }
        let key = 0;
        for (let i = 0; i < HAND_SIZE; i++) key = key * PLAY_BASE + (sorted[i] as number);
        const hit = this.cache.get(key);
        if (hit !== undefined) return hit;
        if (this.cache.size >= MAX_CACHED_HANDS) this.cache.clear();
        const value = computePlay(sorted);
        this.cache.set(key, value);
        this.computed++;
        return value;
    }
}

class Deck {
    readonly ids: number[];
    // Copies in the deck and spare copies in the trunk, by card id.
    readonly inDeck = new Map<number, number>();
    readonly spare = new Map<number, number>();
    private readonly ids5: number[] = new Array<number>(HAND_SIZE).fill(0);

    constructor(deck: readonly number[], trunk: DeckOptimizeRequest["trunk"]) {
        this.ids = [...deck];
        for (const id of deck) this.inDeck.set(id, (this.inDeck.get(id) ?? 0) + 1);
        for (const { id, count } of trunk)
            if (count > 0) this.spare.set(id, (this.spare.get(id) ?? 0) + count);
    }

    // Replaces the card at a position and keeps the copy counts in step.
    replace(position: number, card: number): number {
        const out = this.ids[position] as number;
        this.ids[position] = card;
        this.bump(this.inDeck, out, -1);
        this.bump(this.inDeck, card, 1);
        this.bump(this.spare, out, 1);
        this.bump(this.spare, card, -1);
        return out;
    }

    // Whether one more copy of the card can enter the deck: one is spare and the copy limit allows it.
    canTake(card: number): boolean {
        return (this.spare.get(card) ?? 0) > 0 && (this.inDeck.get(card) ?? 0) < MAX_COPIES_PER_CARD;
    }

    private bump(map: Map<number, number>, id: number, by: number): void {
        const next = (map.get(id) ?? 0) + by;
        if (next > 0) map.set(id, next);
        else map.delete(id);
    }

    handIds(hands: Uint8Array, hand: number): readonly number[] {
        for (let i = 0; i < HAND_SIZE; i++)
            this.ids5[i] = this.ids[hands[hand * HAND_SIZE + i] as number] as number;
        return this.ids5;
    }
}

function attackOf(id: number | undefined): number {
    if (id === undefined) return 0;
    const card = getCardById(id);
    return card && isMonster(card) ? card.Attack : 0;
}

// A cheap guess at how much a card adds to a deck: its own ATK, plus the ATK of the monsters it fuses into
// with the other cards, weighted by how often the two meet. Used only to pick which swaps are worth scoring.
function potential(id: number, deck: Deck): number {
    let total = attackOf(id);
    for (const [other, copies] of deck.inDeck) {
        if (other !== id) total += FUSION_WEIGHT * copies * attackOf(getFusionResult(id, other));
    }
    return total;
}

function pickIncoming(deck: Deck): number[] {
    const scored: Array<[number, number]> = [];
    for (const id of deck.spare.keys()) {
        if ((deck.inDeck.get(id) ?? 0) >= MAX_COPIES_PER_CARD || !getCardById(id)) continue;
        scored.push([id, potential(id, deck)]);
    }
    scored.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    return scored.slice(0, MAX_IN_CANDIDATES).map(([id]) => id);
}

// The weakest distinct cards by the same guess, as the first position that holds each one.
function pickOutgoing(deck: Deck, keepNonMonsters: boolean): number[] {
    const scored: Array<[number, number, number]> = [];
    const seen = new Set<number>();
    deck.ids.forEach((id, position) => {
        if (seen.has(id)) return;
        seen.add(id);
        const card = getCardById(id);
        if (keepNonMonsters && !(card && isMonster(card))) return;
        scored.push([position, id, potential(id, deck)]);
    });
    scored.sort((a, b) => a[2] - b[2] || a[1] - b[1]);
    return scored.slice(0, MAX_OUT_CANDIDATES).map(([position]) => position);
}

function averageBest(deck: Deck, hands: Uint8Array, scorer: HandScorer): number {
    const count = hands.length / HAND_SIZE;
    let total = 0;
    for (let h = 0; h < count; h++) total += Math.floor(scorer.play(deck.handIds(hands, h)) / PLAY_BASE);
    return total / count;
}

function round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

interface CheckResult {
    stats: DeckStats;
    finals: Map<number, number>;
}

// Stats on the check hands, and how often each fusion final was the strongest play.
function check(deck: Deck, hands: Uint8Array, scorer: HandScorer): CheckResult {
    const count = hands.length / HAND_SIZE;
    const reached = THRESHOLDS.map(() => 0);
    const finals = new Map<number, number>();
    let total = 0;
    for (let h = 0; h < count; h++) {
        const play = scorer.play(deck.handIds(hands, h));
        const atk = Math.floor(play / PLAY_BASE);
        total += atk;
        THRESHOLDS.forEach((threshold, i) => {
            if (atk >= threshold) reached[i] = (reached[i] as number) + 1;
        });
        const final = play % PLAY_BASE;
        if (final > 0) finals.set(final, (finals.get(final) ?? 0) + 1);
    }
    return {
        stats: {
            averageBestAtk: round(total / count, 1),
            share1500: round((reached[0] as number) / count, 3),
            share2000: round((reached[1] as number) / count, 3),
        },
        finals,
    };
}

function summary(id: number): CardSummary {
    const card = getCardById(id);
    if (!card) throw new Error(`Card ${id} is missing from the store`);
    return toCardSummary(card);
}

// Swaps that turn the old deck into the new one, slot by slot. A card that left one slot and entered another
// cancels out, so the list shows only the net change.
function netSwaps(before: readonly number[], after: readonly number[]): DeckSwap[] {
    const outs: number[] = [];
    const ins: number[] = [];
    before.forEach((id, position) => {
        const now = after[position] as number;
        if (now === id) return;
        outs.push(id);
        ins.push(now);
    });
    for (let i = outs.length - 1; i >= 0; i--) {
        const match = ins.indexOf(outs[i] as number);
        if (match < 0) continue;
        outs.splice(i, 1);
        ins.splice(match, 1);
    }
    return outs.map((out, i) => ({ out: summary(out), in: summary(ins[i] as number) }));
}

// Picks the 40-card deck, from the deck and the spare cards, whose random 5-card hands make the strongest
// monster on average. It is a swap-based local search: it scores a bounded set of swaps on the same hands and
// applies the helpful ones, until none helps or a budget runs out. Magic, equip and field cards score 0.
export function optimizeDeck(
    request: DeckOptimizeRequest,
    options: DeckOptimizeOptions = {}
): DeckOptimizeResponse {
    const keepNonMonsters = options.keepNonMonsters ?? request.keepNonMonsters ?? true;
    const random = options.random ?? seededRandom(options.seed ?? DEFAULT_SEED);
    const now = options.now ?? (() => performance.now());
    const maxEvaluations = options.maxEvaluations ?? MAX_EVALUATIONS;
    const deadline = now() + (options.maxMillis ?? MAX_SEARCH_MILLIS);

    const original = [...request.deck];
    const deck = new Deck(request.deck, request.trunk);
    const scorer = options.scorer ?? new HandScorer();
    const searchHands = sampleHands(options.searchHands ?? SEARCH_HANDS, random);
    const checkHands = sampleHands(options.checkHands ?? CHECK_HANDS, random);
    const searchCount = searchHands.length / HAND_SIZE;

    // For each position, the search hands that hold it: only those change when its card is swapped.
    const handsOf: number[][] = Array.from({ length: DECK_SIZE }, () => []);
    for (let h = 0; h < searchCount; h++) {
        for (let i = 0; i < HAND_SIZE; i++) handsOf[searchHands[h * HAND_SIZE + i] as number]?.push(h);
    }
    const startComputed = scorer.computed;
    const exhausted = (): boolean => scorer.computed - startComputed >= maxEvaluations || now() >= deadline;

    const handSum = (position: number): number => {
        let total = 0;
        for (const h of handsOf[position] as number[]) {
            total += Math.floor(scorer.play(deck.handIds(searchHands, h)) / PLAY_BASE);
        }
        return total;
    };

    // Each sweep takes the weakest deck cards in turn and gives each its best swap, applied at once, so a
    // deck far from the best improves quickly. The search ends when a whole sweep changes nothing.
    let truncated = false;
    let changed = true;
    while (changed && !truncated) {
        changed = false;
        const incoming = pickIncoming(deck);
        for (const position of pickOutgoing(deck, keepNonMonsters)) {
            const before = handSum(position);
            let best: Swap | null = null;
            for (const card of incoming) {
                if (exhausted()) {
                    truncated = true;
                    break;
                }
                if (!deck.canTake(card)) continue;
                const out = deck.replace(position, card);
                const gain = handSum(position) - before;
                deck.replace(position, out);
                if (gain > (best?.gain ?? 0)) best = { position, card, gain };
            }
            if (best && best.gain / searchCount >= MIN_AVERAGE_GAIN) {
                deck.replace(best.position, best.card);
                changed = true;
            }
            if (truncated) break;
        }
    }

    const current = check(new Deck(original, request.trunk), checkHands, scorer);
    const searched = check(deck, checkHands, scorer);
    // A swap chosen on the search hands can still lose on the larger sample; then the deck stays as it was.
    const improved = searched.stats.averageBestAtk > current.stats.averageBestAtk;
    const chosen = improved ? deck.ids : original;
    const recommended = improved ? searched : current;

    const checkCount = checkHands.length / HAND_SIZE;
    const topFinals: DeckFinal[] = [...recommended.finals]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, TOP_FINALS)
        .map(([id, hands]) => ({ card: summary(id), share: round(hands / checkCount, 3) }));

    return {
        current: current.stats,
        recommended: recommended.stats,
        swaps: netSwaps(original, chosen),
        deck: chosen.map(summary),
        topFinals,
        truncated,
    };
}
