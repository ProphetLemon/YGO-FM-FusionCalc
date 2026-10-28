import { MAX_COPIES_PER_CARD } from "../../shared/limits.js";
import type { DeckLock, DeckTrunkEntry } from "../../shared/types.js";
import { DeltaEngine, fullSample, randomSample } from "./deck-engine.js";
import { HAND_SIZE, handCount, scoreDeck } from "./deck-score.js";
import { PLAY_SHIFT, type HandEvaluator } from "./hand-evaluator.js";

// Most possible decks (leave-out sets) the exhaustive search enumerates. Measured: 135,751 sets (44 cards, 4
// left out) take about 1 s, most of it scoring the 1.1 million hands of the pool; the scan itself is cheap.
export const EXHAUSTIVE_MAX_DECKS = 300_000;
// Most cards the exhaustive search leaves out. A hand holds 5 cards, so the tables it keeps cover subsets of
// at most 5, and larger pools would need more hands than a request can afford.
export const EXHAUSTIVE_MAX_LEFT_OUT = 6;

// Local search: spare cards kept per step by the pre-filter, and the random 4-card samples it scores them on.
export const PREFILTER_CANDIDATES = 30;
export const PREFILTER_SAMPLES = 400;
// Share of the 4-subsets of slots the first, cheap phase of the local search adds up over.
export const SAMPLED_FRACTION = 0.1;
// Smallest gain, in average best ATK, a swap needs in each phase. The sampled phase ignores noise below
// 0.02 ATK; the exact phase takes any real gain (gains come in multiples of 1 / 658,008).
export const SAMPLED_MIN_GAIN = 0.02;
export const EXACT_MIN_GAIN = 1e-6;
// Swaps a climb may take, per slot of the deck, before it is cut off.
const MAX_STEPS_PER_SLOT = 4;
// Gains closer than this are the same gain (they are multiples of 1 / 658,008, plus float error).
const TIE = 1e-9;
// Greedy start: cards added per round, and the random 4-card samples a candidate is scored on.
const GREEDY_BATCH = 8;
const GREEDY_SAMPLES = 100;
// Steps of the final tabu search, which may take a swap that loses ground to leave a local optimum.
export const TABU_STEPS = 6;

// Mulberry32: a small seeded generator with an even spread, enough for sampling.
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

// What the search may do with the cards the player owns.
export interface SearchSpace {
    keepNonMonsters: boolean;
    // By card id, the copies the deck may hold: the copies owned, up to MAX_COPIES_PER_CARD. A deck that
    // already holds more copies of a card than that may keep them, so the current deck is always allowed.
    limit: Int16Array;
    // By card id, the copies that always stay in the deck: all of a non-monster's copies when non-monsters are
    // kept, and the copies the player locked. Never more than the deck holds, so the current deck satisfies it.
    lockedMin: Int16Array;
    // The cards that may still gain copies, ascending: owned, with copies above their locked minimum, and
    // monsters when non-monsters are kept.
    candidates: number[];
}

export function buildSearchSpace(
    evaluator: HandEvaluator,
    deck: readonly number[],
    trunk: readonly DeckTrunkEntry[],
    keepNonMonsters: boolean,
    locked: readonly DeckLock[] = []
): SearchSpace {
    const inDeck = new Int16Array(evaluator.size);
    const owned = new Int16Array(evaluator.size);
    for (const id of deck) {
        inDeck[id]! += 1;
        owned[id]! += 1;
    }
    for (const { id, count } of trunk) owned[id]! += count;
    const explicit = new Int16Array(evaluator.size);
    for (const { id, count } of locked) explicit[id] = Math.min(count, inDeck[id]!);
    const limit = new Int16Array(evaluator.size);
    const lockedMin = new Int16Array(evaluator.size);
    const candidates: number[] = [];
    for (let id = 0; id < evaluator.size; id++) {
        const kept = keepNonMonsters && evaluator.monster[id] !== 1;
        limit[id] = Math.min(owned[id]!, Math.max(MAX_COPIES_PER_CARD, inDeck[id]!));
        lockedMin[id] = kept ? inDeck[id]! : explicit[id]!;
        if (limit[id]! > lockedMin[id]! && !kept) candidates.push(id);
    }
    return { keepNonMonsters, limit, lockedMin, candidates };
}

// The copies of each card that always stay, as a list of card ids.
function lockedCopies(space: SearchSpace): number[] {
    const copies: number[] = [];
    space.lockedMin.forEach((count, id) => {
        for (let copy = 0; copy < count; copy++) copies.push(id);
    });
    return copies;
}

// The copies of each candidate that may be in the deck or left out, beyond the ones that always stay.
function openCopies(space: SearchSpace): number[] {
    return space.candidates.flatMap((id) => Array<number>(space.limit[id]! - space.lockedMin[id]!).fill(id));
}

// Copies of each card in a deck, by id.
function countCards(evaluator: HandEvaluator, deck: ArrayLike<number>): Int16Array {
    const counts = new Int16Array(evaluator.size);
    for (let i = 0; i < deck.length; i++) counts[deck[i]!]! += 1;
    return counts;
}

function choose(n: number, r: number): number {
    if (r < 0 || r > n) return 0;
    let value = 1;
    for (let i = 0; i < r; i++) value = (value * (n - i)) / (i + 1);
    return Math.round(value);
}

// ---- Exhaustive search -----------------------------------------------------------------------------------

// The pool of card copies the deck is drawn from, when it is small enough to try every deck.
export interface ExhaustivePlan {
    // Copies that may be left out, by card id, and whether each is part of the current deck.
    movable: number[];
    inCurrent: boolean[];
    // Copies that always stay: the non-monsters of the deck when they are kept, and the locked cards.
    pinned: number[];
    // How many movable copies are left out of the pool to make a 40-card deck.
    leaveOut: number;
    // The number of decks: ways to choose the copies to leave out.
    decks: number;
}

// Plans the exhaustive search, or returns null when the pool allows more than `maxDecks` decks.
export function planExhaustive(
    evaluator: HandEvaluator,
    deck: readonly number[],
    space: SearchSpace,
    maxDecks: number = EXHAUSTIVE_MAX_DECKS
): ExhaustivePlan | null {
    const inDeck = countCards(evaluator, deck);
    const movable: number[] = [];
    const inCurrent: boolean[] = [];
    for (const id of space.candidates) {
        // The locked copies are pinned, so the movable ones are the rest, and the first ones are in the deck.
        const open = space.limit[id]! - space.lockedMin[id]!;
        for (let copy = 0; copy < open; copy++) {
            movable.push(id);
            inCurrent.push(copy < inDeck[id]! - space.lockedMin[id]!);
        }
    }
    const pinned = lockedCopies(space);
    const leaveOut = movable.length + pinned.length - deck.length;
    if (leaveOut > EXHAUSTIVE_MAX_LEFT_OUT) return null;
    const decks = choose(movable.length, leaveOut);
    if (decks > maxDecks) return null;
    return { movable, inCurrent, pinned, leaveOut, decks };
}

// Finds the best deck of the plan by trying them all, with inclusion-exclusion so no deck is scored hand by
// hand. A deck is the pool minus a set L of copies, and the hands it deals are the pool's hands that avoid L:
//     sum over hands avoiding L = total - sum_i S(i) + sum_{i<j} S(i, j) - ...
// where S(T) is the summed best ATK of the pool's hands that hold every copy of T. Each pool hand is scored
// once and added to the S of every subset of the movable copies it holds. Among equal decks, the one that
// leaves out the fewest copies of the current deck wins, so no needless swap is suggested.
// Returns the 40 card ids of the best deck, in no particular order.
export function exhaustiveBest(evaluator: HandEvaluator, plan: ExhaustivePlan): number[] {
    const { movable, pinned, leaveOut: k, inCurrent } = plan;
    const pool = [...movable, ...pinned];
    const m = movable.length;
    if (k === 0) return pool;

    const maxSize = Math.min(k, HAND_SIZE);
    // binomial[n][r] = C(n, r), for ranking subsets: the rank of t_0 < ... < t_{s-1} is sum C(t_i, i + 1).
    const binomial = Array.from({ length: m + 1 }, (_, n) =>
        Float64Array.from({ length: HAND_SIZE + 1 }, (_, r) => choose(n, r))
    );
    const sums = Array.from({ length: maxSize + 1 }, (_, size) => new Float64Array(choose(m, size)));
    let total = 0;

    const ids = new Int16Array(pool);
    const held = [0, 0, 0, 0, 0];
    const ranks = new Float64Array(1 << HAND_SIZE);
    const bitCounts = Uint8Array.from({ length: 1 << HAND_SIZE }, (_, mask) => bitCount(mask));
    const total5 = pool.length;
    for (let a = 0; a < total5 - 4; a++)
        for (let b = a + 1; b < total5 - 3; b++)
            for (let c = b + 1; c < total5 - 2; c++)
                for (let d = c + 1; d < total5 - 1; d++)
                    for (let e = d + 1; e < total5; e++) {
                        const value =
                            evaluator.play(ids[a]!, ids[b]!, ids[c]!, ids[d]!, ids[e]!) >> PLAY_SHIFT;
                        if (value === 0) continue;
                        total += value;
                        // Movable copies come first in the pool, so the ones this hand holds are a prefix.
                        held[0] = a;
                        held[1] = b;
                        held[2] = c;
                        held[3] = d;
                        held[4] = e;
                        let inside = 0;
                        while (inside < HAND_SIZE && held[inside]! < m) inside++;
                        // The rank of a subset is its highest card's term plus the rank of the rest, so each
                        // subset costs one step.
                        for (let mask = 1; mask < 1 << inside; mask++) {
                            const top = 31 - Math.clz32(mask);
                            const size = bitCounts[mask]!;
                            const rank = ranks[mask ^ (1 << top)]! + binomial[held[top]!]![size]!;
                            ranks[mask] = rank;
                            if (size <= maxSize) sums[size]![rank]! += value;
                        }
                    }

    // The non-empty subsets of the k left-out copies that can hold a hand (at most 5), with their sign.
    const masks: Array<{ mask: number; size: number; sign: number }> = [];
    for (let mask = 1; mask < 1 << k; mask++) {
        const size = bitCount(mask);
        if (size <= maxSize) masks.push({ mask, size, sign: size % 2 === 1 ? -1 : 1 });
    }

    const left = Array.from({ length: k }, (_, i) => i);
    let bestValue = -1;
    let bestPenalty = Infinity;
    let bestLeft = left.slice();
    for (;;) {
        let value = total;
        for (const { mask, size, sign } of masks) {
            let rank = 0;
            let position = 0;
            for (let t = 0; t < k; t++) {
                if ((mask >> t) & 1) rank += binomial[left[t]!]![++position]!;
            }
            value += sign * sums[size]![rank]!;
        }
        if (value >= bestValue) {
            const penalty = left.reduce((n, index) => n + (inCurrent[index] ? 1 : 0), 0);
            if (value > bestValue || penalty < bestPenalty) {
                bestValue = value;
                bestPenalty = penalty;
                bestLeft = left.slice();
            }
        }
        // Next k-subset of 0..m-1 in lexicographic order.
        let t = k - 1;
        while (t >= 0 && left[t] === m - k + t) t--;
        if (t < 0) break;
        left[t]! += 1;
        for (let u = t + 1; u < k; u++) left[u] = left[u - 1]! + 1;
    }
    const out = new Set(bestLeft);
    return pool.filter((_, index) => !out.has(index));
}

function bitCount(value: number): number {
    let count = 0;
    for (let v = value; v > 0; v >>= 1) count += v & 1;
    return count;
}

// ---- Local search ----------------------------------------------------------------------------------------

export interface LocalSearchOptions {
    random: () => number;
    // True once the time budget is spent.
    expired: () => boolean;
    tabuSteps?: number;
}

export interface LocalSearchResult {
    // The 40 cards of the best deck found.
    deck: Int16Array;
    // True when the budget ended before the final sweep could confirm that no single swap with any owned card
    // improves the deck.
    truncated: boolean;
}

interface Context extends LocalSearchOptions {
    evaluator: HandEvaluator;
    space: SearchSpace;
    // The player's current deck, and its copies of each card.
    original: Int16Array;
    originalCounts: Int16Array;
}

interface Move {
    slot: number;
    card: number;
    gain: number;
    // The swap puts back a card the player's deck had more copies of than the deck now holds, in place of a
    // card the deck holds more copies of than the player's did: it walks back.
    restores: boolean;
}

interface Found {
    deck: Int16Array;
    // Exact total best ATK over all hands.
    total: number;
    // The engine that polished it, when the polish finished: its columns are exact.
    engine: DeltaEngine | null;
}

// Local search for a pool too large to enumerate: from three starts it climbs by the best single swap,
// first on a sample of the hands and then on all of them, keeps the best, and tries a few tabu steps.
// Every swap is scored by the incremental engine, so a step costs a fraction of scoring the deck again.
// The result is a deck that no single swap with any owned card improves, which a final sweep confirms (the
// search itself only tries a shortlist), unless the budget ended first: then `truncated` is true. It is not
// a proven optimum: a swap of two or more cards at once could still help.
export function localSearch(
    evaluator: HandEvaluator,
    space: SearchSpace,
    original: Int16Array,
    options: LocalSearchOptions
): LocalSearchResult {
    const ctx: Context = {
        ...options,
        evaluator,
        space,
        original,
        originalCounts: countCards(evaluator, original),
    };
    if (ctx.expired()) return { deck: original, truncated: true };
    const starts = [Int16Array.from(original), greedyDeck(ctx), randomDeck(ctx)];

    // Phase 1, cheap: climb each start on a fixed sample of the hands.
    const size = original.length;
    const sampled = randomSample(size, SAMPLED_FRACTION, ctx.random);
    const climbed: Int16Array[] = [];
    for (const start of starts) {
        if (ctx.expired()) break;
        const engine = new DeltaEngine(evaluator, start, sampled);
        const finished = ascend(ctx, engine, SAMPLED_MIN_GAIN, false);
        climbed.push(engine.deck);
        if (!finished) break;
    }
    if (climbed.length === 0) return { deck: original, truncated: true };

    // Rank what phase 1 found on all the hands, then finish the best ones exactly while time lasts.
    const seen = new Set<string>();
    const ranked: Found[] = [];
    for (const deck of climbed) {
        const key = [...deck].sort((x, y) => x - y).join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        ranked.push({ deck, total: scoreDeck(evaluator, deck).totalAtk, engine: null });
    }
    ranked.sort((x, y) => y.total - x.total);

    const exact = fullSample(size);
    const hands = handCount(size);
    const found: Found[] = [];
    for (const start of ranked) {
        if (ctx.expired()) {
            found.push(start);
            continue;
        }
        const engine = new DeltaEngine(evaluator, start.deck, exact);
        const finished = ascend(ctx, engine, EXACT_MIN_GAIN, true);
        if (finished) {
            found.push({
                deck: Int16Array.from(engine.deck),
                total: Math.round(engine.average() * hands),
                engine,
            });
        } else {
            found.push({
                deck: Int16Array.from(engine.deck),
                total: scoreDeck(evaluator, engine.deck).totalAtk,
                engine: null,
            });
        }
    }

    let best = found.reduce((top, next) => (next.total > top.total ? next : top), found[0] as Found);
    // Make sure no single swap with any owned card improves the deck, before and after the tabu steps.
    let checked = sweep(ctx, best.deck, best.engine);
    best = checked.found;
    if (checked.complete && best.engine !== null && !ctx.expired()) {
        const improved = tabu(ctx, best.engine, best.total, ctx.tabuSteps ?? TABU_STEPS);
        if (improved !== null) {
            checked = sweep(ctx, improved.deck, null);
            best = checked.found;
        }
    }
    return { deck: best.deck, truncated: !checked.complete };
}

// Tries every owned card that could enter, not only the shortlist, against every slot that may change, on
// all the hands, and takes any swap that gains. Repeats until none does. `complete` is false when the budget
// ended before every card had been tried: then nothing is known about the cards not reached.
function sweep(
    ctx: Context,
    start: Int16Array,
    known: DeltaEngine | null
): { found: Found; complete: boolean } {
    const size = start.length;
    const engine = known ?? new DeltaEngine(ctx.evaluator, start, fullSample(size));
    const result = (complete: boolean): { found: Found; complete: boolean } => {
        const deck = Int16Array.from(engine.deck);
        const total = complete
            ? Math.round(engine.average() * handCount(size))
            : scoreDeck(ctx.evaluator, deck).totalAtk;
        return { found: { deck, total, engine: complete ? engine : null }, complete };
    };
    for (let step = 0; step <= MAX_STEPS_PER_SLOT * size; step++) {
        for (const card of engine.deck) {
            if (ctx.expired()) return result(false);
            engine.ensure(card);
        }
        const baselines = Float64Array.from({ length: size }, (_, slot) => engine.baseline(slot));
        const spare = spareCards(ctx, engine.deck);
        const counts = countCards(ctx.evaluator, engine.deck);
        const ordered =
            spare.length <= PREFILTER_CANDIDATES
                ? spare
                : rankByPotential(ctx, engine.deck, spare, PREFILTER_SAMPLES);
        let swapped = false;
        for (const card of ordered) {
            if (ctx.expired()) return result(false);
            engine.ensure(card);
            let best: Move | null = null;
            for (let slot = 0; slot < size; slot++) {
                const current = engine.deck[slot]!;
                if (!mayLeave(ctx, counts, current)) continue;
                const gain = engine.gain(slot, card, baselines[slot]!);
                if (best === null || gain > best.gain) best = { slot, card, gain, restores: false };
            }
            if (best !== null && best.gain >= EXACT_MIN_GAIN) {
                engine.swap(best.slot, card);
                swapped = true;
            }
            // Only the deck's columns are kept: a column per owned card would cost more than it saves.
            engine.retain(new Set());
            if (swapped) break;
        }
        if (!swapped) return result(true);
    }
    return result(true);
}

// Climbs by the best swap until none gains at least `minGain`. False when the budget stopped it first.
// With `walkBack`, a swap that puts back a card of the player's deck in place of a surplus one (a card the
// deck holds more copies of than the player's did) is also taken when it gains nothing, so the answer never
// keeps a swap that does not pay. That cannot loop: each such swap brings the deck's cards strictly closer
// to the player's, and every other swap raises the average.
// On a sample the gains are estimates, so a climb there is not guaranteed to rise forever; MAX_STEPS_PER_SLOT
// stops one that wanders (a real climb needs about one swap per slot).
function ascend(ctx: Context, engine: DeltaEngine, minGain: number, walkBack: boolean): boolean {
    const maxSteps = MAX_STEPS_PER_SLOT * engine.deck.length;
    for (let step = 0; step < maxSteps; step++) {
        if (ctx.expired()) return false;
        const candidates = refresh(ctx, engine);
        if (candidates === null) return false;
        const move = bestMove(ctx, engine, candidates);
        if (move === null) return true;
        if (move.gain < (walkBack && move.restores ? -TIE : minGain)) return true;
        engine.swap(move.slot, move.card);
    }
    return true;
}

// A few steps that may lose ground: the best swap that does not undo a recent one. Returns the best deck
// seen when it beats `startTotal`, else null.
function tabu(ctx: Context, engine: DeltaEngine, startTotal: number, steps: number): Found | null {
    let bestTotal = startTotal;
    let bestDeck: Int16Array | null = null;
    const touched = new Set<number>();
    const removed = new Set<number>();
    for (let step = 0; step < steps && !ctx.expired(); step++) {
        const candidates = refresh(ctx, engine);
        if (candidates === null) break;
        const move = bestMove(
            ctx,
            engine,
            candidates.filter((card) => !removed.has(card)),
            (slot) => touched.has(slot)
        );
        if (move === null) break;
        touched.add(move.slot);
        removed.add(engine.deck[move.slot]!);
        engine.swap(move.slot, move.card);
        engine.ensureDeck();
        const total = Math.round(engine.average() * handCount(engine.deck.length));
        if (total > bestTotal) {
            bestTotal = total;
            bestDeck = Int16Array.from(engine.deck);
        }
    }
    return bestDeck === null ? null : { deck: bestDeck, total: bestTotal, engine: null };
}

// Whether one more copy of a card may leave a deck that holds `counts` of each: only while the deck holds
// more than the copies that must stay. Counts change as swaps happen, so this is asked per slot, not per card.
function mayLeave(ctx: Context, counts: Int16Array, card: number): boolean {
    return counts[card]! > ctx.space.lockedMin[card]!;
}

// The spare cards that could enter the deck: owned, under their copy limit, and allowed in.
function spareCards(ctx: Context, deck: ArrayLike<number>): number[] {
    const counts = countCards(ctx.evaluator, deck);
    return ctx.space.candidates.filter((id) => counts[id]! < ctx.space.limit[id]!);
}

function randomSlots(random: () => number, size: number, count: number): number[] {
    const picked: number[] = [];
    while (picked.length < count) {
        const slot = Math.floor(random() * size);
        if (!picked.includes(slot)) picked.push(slot);
    }
    return picked;
}

// Ranks cards by the mean best ATK of "4 cards of the pool + the card" over random 4-card samples, best first.
// The same samples score every card, so the ranking compares like with like.
function rankByPotential(
    ctx: Context,
    around: ArrayLike<number>,
    cards: number[],
    samples: number
): number[] {
    const picks = Array.from({ length: samples }, () => randomSlots(ctx.random, around.length, 4));
    const scored = cards.map((card) => {
        let sum = 0;
        for (const [a, b, c, d] of picks as Array<[number, number, number, number]>) {
            sum += ctx.evaluator.play(around[a]!, around[b]!, around[c]!, around[d]!, card) >> PLAY_SHIFT;
        }
        return { card, sum };
    });
    scored.sort((x, y) => y.sum - x.sum || x.card - y.card);
    return scored.map(({ card }) => card);
}

// Shortlists the spare cards worth trying against the deck, and builds the columns for them and the deck.
// The cards of the player's deck that left it are always tried, so a swap can be walked back.
// Null when the budget ran out while building.
function refresh(ctx: Context, engine: DeltaEngine): number[] | null {
    const spare = spareCards(ctx, engine.deck);
    const counts = countCards(ctx.evaluator, engine.deck);
    const shortlist =
        spare.length <= PREFILTER_CANDIDATES
            ? spare
            : rankByPotential(ctx, engine.deck, spare, PREFILTER_SAMPLES).slice(0, PREFILTER_CANDIDATES);
    const candidates = [
        ...shortlist,
        ...spare.filter((id) => ctx.originalCounts[id]! > counts[id]! && !shortlist.includes(id)),
    ];
    engine.retain(new Set(candidates));
    for (const card of [...engine.deck, ...candidates]) {
        if (engine.has(card)) continue;
        if (ctx.expired()) return null;
        engine.ensure(card);
    }
    return candidates;
}

// The swap with the largest gain among the shortlisted cards, or null when there is none.
function bestMove(
    ctx: Context,
    engine: DeltaEngine,
    candidates: readonly number[],
    skip?: (slot: number) => boolean
): Move | null {
    const { deck } = engine;
    const counts = countCards(ctx.evaluator, deck);
    const size = deck.length;
    const baselines = new Float64Array(size);
    for (let slot = 0; slot < size; slot++) baselines[slot] = engine.baseline(slot);
    let best: Move | null = null;
    for (const card of candidates) {
        for (let slot = 0; slot < size; slot++) {
            const current = deck[slot]!;
            if (current === card || !mayLeave(ctx, counts, current) || skip?.(slot)) continue;
            const gain = engine.gain(slot, card, baselines[slot]!);
            // Walking back puts a missing card in place of a surplus one; swapping two cards the player
            // already had is not walking back, or two cards of equal worth would trade places forever.
            const restores =
                ctx.originalCounts[card]! > counts[card]! && counts[current]! > ctx.originalCounts[current]!;
            if (
                best === null ||
                gain > best.gain + TIE ||
                (gain >= best.gain - TIE && restores && !best.restores)
            ) {
                best = { slot, card, gain, restores };
            }
        }
    }
    return best;
}

// Slots of cards that stay whatever happens: the non-monsters of the deck when they are kept, and the locked
// cards.
function fixedCards(ctx: Context): number[] {
    return lockedCopies(ctx.space);
}

// Starts from the cards that stay, then adds the card that does best with the deck so far, a few at a time.
function greedyDeck(ctx: Context): Int16Array {
    const { space } = ctx;
    const counts = new Int16Array(ctx.evaluator.size);
    const deck = fixedCards(ctx);
    for (const id of deck) counts[id]! += 1;
    // Before the deck holds a few cards, the sample comes from the owned cards themselves.
    const everyCopy = openCopies(space);
    const size = ctx.original.length;
    while (deck.length < size) {
        const around = deck.length >= 2 * GREEDY_BATCH ? deck : everyCopy;
        const open = space.candidates.filter((id) => counts[id]! < space.limit[id]!);
        const ranked = rankByPotential(ctx, around, open, GREEDY_SAMPLES);
        for (const id of ranked.slice(0, Math.min(GREEDY_BATCH, size - deck.length))) {
            deck.push(id);
            counts[id]! += 1;
        }
    }
    return Int16Array.from(deck);
}

// The cards that stay plus a seeded random pick of the rest.
function randomDeck(ctx: Context): Int16Array {
    const { space } = ctx;
    const deck = fixedCards(ctx);
    const everyCopy = openCopies(space);
    for (let i = everyCopy.length - 1; i > 0; i--) {
        const j = Math.floor(ctx.random() * (i + 1));
        [everyCopy[i], everyCopy[j]] = [everyCopy[j] as number, everyCopy[i] as number];
    }
    deck.push(...everyCopy.slice(0, ctx.original.length - deck.length));
    return Int16Array.from(deck);
}
