import { HAND_SIZE, handCount } from "./deck-score.js";
import { PLAY_SHIFT, type HandEvaluator } from "./hand-evaluator.js";

// The 4-subsets of a deck's slots an engine adds up over: all of them (exact) or a fixed random share
// (an estimate). Each subset plus a fifth card makes a 5-card hand.
export interface SubsetSample {
    // Slots in the deck.
    size: number;
    // Four slot numbers per subset, flat.
    subsets: Uint8Array;
    count: number;
    // Multiplies a sum over the sample into an estimate of the sum over all subsets.
    scale: number;
    // For each slot, the other three slots of every sampled subset that holds it, flat.
    around: Uint8Array[];
}

const allSamples = new Map<number, SubsetSample>();

function allFourSubsets(size: number): number[] {
    const list: number[] = [];
    for (let a = 0; a < size; a++)
        for (let b = a + 1; b < size; b++)
            for (let c = b + 1; c < size; c++) for (let d = c + 1; d < size; d++) list.push(a, b, c, d);
    return list;
}

function toSample(size: number, list: ArrayLike<number>, total: number): SubsetSample {
    const count = list.length / 4;
    const around: number[][] = Array.from({ length: size }, () => []);
    for (let q = 0; q < count; q++) {
        for (let k = 0; k < 4; k++) {
            const slot = list[q * 4 + k] as number;
            for (let t = 0; t < 4; t++) if (t !== k) around[slot]?.push(list[q * 4 + t] as number);
        }
    }
    return {
        size,
        subsets: Uint8Array.from(list),
        count,
        scale: total / count,
        around: around.map((slots) => Uint8Array.from(slots)),
    };
}

// Every 4-subset of the slots of a deck of `size` cards (91,390 for 40): sums over it are exact.
export function fullSample(size: number): SubsetSample {
    let sample = allSamples.get(size);
    if (sample === undefined) {
        const list = allFourSubsets(size);
        sample = toSample(size, list, list.length / 4);
        allSamples.set(size, sample);
    }
    return sample;
}

// A fixed random `fraction` of the 4-subsets, drawn with the given generator.
export function randomSample(size: number, fraction: number, random: () => number): SubsetSample {
    const all = allFourSubsets(size);
    const total = all.length / 4;
    const order = Uint32Array.from({ length: total }, (_, i) => i);
    const wanted = Math.max(1, Math.round(total * fraction));
    // Partial Fisher-Yates: the first `wanted` entries end up a uniform draw without replacement.
    for (let i = 0; i < wanted; i++) {
        const pick = i + Math.floor(random() * (total - i));
        const chosen = order[pick] as number;
        order[pick] = order[i] as number;
        order[i] = chosen;
    }
    const picked = Array.from(order.subarray(0, wanted)).sort((x, y) => x - y);
    const list: number[] = [];
    for (const q of picked) list.push(...all.slice(q * 4, q * 4 + 4));
    return toSample(size, list, total);
}

// What swapping a card in costs to know, for one card B: `total` is the sum of the best ATK of the hands
// "4 slots + B" over every sampled 4-subset, and `slot[i]` the part of it whose 4-subset holds slot i.
interface Column {
    total: number;
    slot: Float64Array;
}

// Tracks the exact effect of swapping the card in one slot for another, without scoring the deck again.
// The deck's average best ATK is the sum over 5-subsets of slots of f(hand) / C(n, 5). Replacing the card
// c in slot i by B changes only the hands that hold slot i, so
//     gain(i -> B) = [(total_B - slot_B[i]) - (total_c - slot_c[i])] / C(n, 5)
// where each bracket is a sum over the 4-subsets that leave slot i out. A swap updates only the subsets
// that hold the slot (9,139 of 91,390 for 40 cards). Over a sample the gains are estimates; over all
// subsets, exact.
export class DeltaEngine {
    readonly deck: Int16Array;
    private readonly hands: number;
    private readonly columns = new Map<number, Column>();

    constructor(
        private readonly evaluator: HandEvaluator,
        deck: ArrayLike<number>,
        private readonly sample: SubsetSample
    ) {
        if (sample.size !== deck.length) {
            throw new Error(`The sample is for ${sample.size} slots, not ${deck.length}`);
        }
        this.deck = Int16Array.from(deck);
        this.hands = handCount(deck.length);
    }

    has(card: number): boolean {
        return this.columns.has(card);
    }

    // The column of a card, built on first use: one hand score per sampled subset.
    ensure(card: number): Column {
        const known = this.columns.get(card);
        if (known) return known;
        const { evaluator, deck } = this;
        const { subsets, count, scale } = this.sample;
        const slot = new Float64Array(deck.length);
        let total = 0;
        for (let q = 0; q < count; q++) {
            const a = subsets[q * 4]!;
            const b = subsets[q * 4 + 1]!;
            const c = subsets[q * 4 + 2]!;
            const d = subsets[q * 4 + 3]!;
            const value = evaluator.play(deck[a]!, deck[b]!, deck[c]!, deck[d]!, card) >> PLAY_SHIFT;
            if (value === 0) continue;
            total += value;
            slot[a]! += value;
            slot[b]! += value;
            slot[c]! += value;
            slot[d]! += value;
        }
        for (let i = 0; i < slot.length; i++) slot[i]! *= scale;
        const column = { total: total * scale, slot };
        this.columns.set(card, column);
        return column;
    }

    // Builds the columns of every card in the deck.
    ensureDeck(): void {
        for (const card of this.deck) this.ensure(card);
    }

    // Forgets the columns of cards that are neither in `keep` nor in the deck.
    retain(keep: ReadonlySet<number>): void {
        const inDeck = new Set(this.deck);
        for (const card of [...this.columns.keys()]) {
            if (!keep.has(card) && !inDeck.has(card)) this.columns.delete(card);
        }
    }

    // The summed best ATK of the hands that hold the slot (a sum over 4-subsets that leave it out).
    baseline(slot: number): number {
        const column = this.ensure(this.deck[slot]!);
        return column.total - column.slot[slot]!;
    }

    // Change in the deck's average best ATK if the card in `slot` became `card`. The card's column must exist.
    gain(slot: number, card: number, baseline: number): number {
        const column = this.columns.get(card);
        if (!column) throw new Error(`No column for card ${card}`);
        return (column.total - column.slot[slot]! - baseline) / this.hands;
    }

    // The deck's average best ATK; an estimate when the sample is partial.
    average(): number {
        let sum = 0;
        for (let i = 0; i < this.deck.length; i++) sum += this.baseline(i);
        // Every hand holds five slots, so it was counted five times.
        return sum / HAND_SIZE / this.hands;
    }

    // Puts `card` in `slot` and brings every column up to date.
    swap(slot: number, card: number): void {
        const { evaluator, deck } = this;
        const old = deck[slot]!;
        if (old === card) return;
        const around = this.sample.around[slot]!;
        const triples = around.length / 3;
        const { scale } = this.sample;
        for (const [other, column] of this.columns) {
            let change = 0;
            for (let q = 0; q < triples; q++) {
                const x = around[q * 3]!;
                const y = around[q * 3 + 1]!;
                const z = around[q * 3 + 2]!;
                const dx = deck[x]!;
                const dy = deck[y]!;
                const dz = deck[z]!;
                const diff =
                    (evaluator.play(dx, dy, dz, card, other) >> PLAY_SHIFT) -
                    (evaluator.play(dx, dy, dz, old, other) >> PLAY_SHIFT);
                if (diff === 0) continue;
                const scaled = diff * scale;
                change += scaled;
                column.slot[x]! += scaled;
                column.slot[y]! += scaled;
                column.slot[z]! += scaled;
            }
            column.total += change;
            column.slot[slot]! += change;
        }
        deck[slot] = card;
    }
}
