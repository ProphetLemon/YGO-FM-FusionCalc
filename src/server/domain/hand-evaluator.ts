import {
    getAllCards,
    getCardById,
    getFusionResult,
    getFusionsForCard,
    getRitualRecipes,
} from "../data/store.js";
import { isMonster } from "./cards.js";

// A play is a packed integer: the ATK of the strongest monster a hand can make, shifted left by PLAY_SHIFT,
// plus a code for how it was made. A card played as it is, or a ritual result, has the code PLAY_NO_FUSION.
// A fusion result has MADE_BASE minus its id, so among equal ATK a card played as it is wins and, among
// fusion results, the lower id does. Unpack with `atkOfPlay` and `fusionOfPlay`.
export const PLAY_SHIFT = 10;
const PLAY_NO_FUSION = (1 << PLAY_SHIFT) - 1;
const MADE_BASE = 1000;
const HAND_SIZE = 5;

export function atkOfPlay(play: number): number {
    return play >> PLAY_SHIFT;
}

// The id of the fusion result that makes the play, or 0 when a card of the hand or a ritual makes it (or the
// hand makes nothing: the play 0).
export function fusionOfPlay(play: number): number {
    const code = play & PLAY_NO_FUSION;
    return play === 0 || code === PLAY_NO_FUSION ? 0 : MADE_BASE - code;
}

// Scores a 5-card hand with the same model as `findBestChains` and the ritual panel, on flat typed tables so
// it runs about 25 times faster:
//   - a monster of the hand counts as it is;
//   - the final card of any fusion chain counts (fusing two cards leaves the result in the hand, to be
//     fused again);
//   - a ritual card with its three materials in the hand counts as its result.
// A fusion result that fuses with no card at all is a dead end, so the chain stops there. That prune is
// exact. A stronger "no partner left in the hand" prune is NOT: it was measured to change the answer.
// Build one per loaded store; it reads the store once.
export class HandEvaluator {
    // Ids run from 0 to size - 1.
    readonly size: number;
    // fusion[a * size + b] is the id a and b fuse into, or 0.
    readonly fusion: Int16Array;
    // 1 for a monster card.
    readonly monster: Uint8Array;
    // ATK of a monster card as it is; 0 for any other card.
    readonly attack: Int16Array;
    private readonly single: Int32Array;
    private readonly made: Int32Array;
    private readonly alive: Uint8Array;
    // Recipe (1-based) a ritual card starts, or 0.
    private readonly ritualOf: Uint8Array;
    private readonly ritualRequires: Int16Array;
    private readonly ritualNeeds: Uint8Array;
    private readonly ritualPlays: Int32Array;
    private readonly hand = new Int16Array(HAND_SIZE);
    // scratch[m] holds the m cards left after one fusion, for the chain search one level down.
    private readonly scratch: Int16Array[] = Array.from({ length: HAND_SIZE }, (_, m) => new Int16Array(m));

    constructor() {
        const cards = getAllCards();
        const size = cards.reduce((top, card) => Math.max(top, card.Id), 0) + 1;
        if (size > MADE_BASE) throw new Error(`Card ids up to ${size - 1} do not fit the packed play`);
        this.size = size;
        this.fusion = new Int16Array(size * size);
        this.monster = new Uint8Array(size);
        this.attack = new Int16Array(size);
        this.single = new Int32Array(size);
        this.made = new Int32Array(size);
        this.alive = new Uint8Array(size);
        this.ritualOf = new Uint8Array(size);

        for (const card of cards) {
            if (!isMonster(card)) continue;
            this.monster[card.Id] = 1;
            this.attack[card.Id] = card.Attack;
            this.single[card.Id] = (card.Attack << PLAY_SHIFT) | PLAY_NO_FUSION;
            this.made[card.Id] = (card.Attack << PLAY_SHIFT) | (MADE_BASE - card.Id);
        }
        for (const { Id: a } of cards) {
            for (const { card: b } of getFusionsForCard(a)) {
                const result = getFusionResult(a, b);
                if (result === undefined || getCardById(result) === undefined) continue;
                this.fusion[a * size + b] = result;
                this.alive[a] = 1;
                this.alive[b] = 1;
            }
        }

        const recipes = getRitualRecipes().filter(
            (recipe) => getCardById(recipe.Result) !== undefined && this.hasAll(recipe)
        );
        this.ritualRequires = new Int16Array(recipes.length * 4);
        this.ritualNeeds = new Uint8Array(recipes.length * 4);
        this.ritualPlays = new Int32Array(recipes.length);
        recipes.forEach((recipe, index) => {
            const required = [recipe.RitualCard, recipe.Card1, recipe.Card2, recipe.Card3];
            required.forEach((id, slot) => {
                this.ritualRequires[index * 4 + slot] = id;
                // An id a recipe lists twice must be in the hand twice, as in `findRituals`.
                this.ritualNeeds[index * 4 + slot] = required.filter((other) => other === id).length;
            });
            const result = getCardById(recipe.Result);
            this.ritualPlays[index] =
                result && isMonster(result) ? (result.Attack << PLAY_SHIFT) | PLAY_NO_FUSION : 0;
            this.ritualOf[recipe.RitualCard] = index + 1;
        });
    }

    // The best play of a 5-card hand, as a packed integer (see `atkOfPlay` and `fusionOfPlay`).
    play(a: number, b: number, c: number, d: number, e: number): number {
        const hand = this.hand;
        hand[0] = a;
        hand[1] = b;
        hand[2] = c;
        hand[3] = d;
        hand[4] = e;
        const { single } = this;
        // The cards of the hand as they are. Fusion results are scored when they are made, in `chain`.
        let best = 0;
        for (let i = 0; i < HAND_SIZE; i++) {
            const value = single[hand[i]!]!;
            if (value > best) best = value;
        }
        const fused = this.chain(hand, HAND_SIZE);
        if (fused > best) best = fused;
        if (
            this.ritualOf[a] ||
            this.ritualOf[b] ||
            this.ritualOf[c] ||
            this.ritualOf[d] ||
            this.ritualOf[e]
        ) {
            const ritual = this.ritual(hand);
            if (ritual > best) best = ritual;
        }
        return best;
    }

    private hasAll(recipe: { RitualCard: number; Card1: number; Card2: number; Card3: number }): boolean {
        return [recipe.RitualCard, recipe.Card1, recipe.Card2, recipe.Card3].every(
            (id) => getCardById(id) !== undefined
        );
    }

    // The best fusion result any chain of fusions over the first `n` cards makes, or 0. Indexes below are in
    // range by construction: card ids are below `size` and loops stay inside `n`.
    private chain(cards: Int16Array, n: number): number {
        const { made, fusion, alive, size } = this;
        let best = 0;
        const next = this.scratch[n - 1]!;
        for (let i = 0; i < n - 1; i++) {
            const row = cards[i]! * size;
            for (let j = i + 1; j < n; j++) {
                const result = fusion[row + cards[j]!]!;
                if (result === 0) continue;
                const value = made[result]!;
                if (value > best) best = value;
                if (n === 2 || alive[result] === 0) continue;
                let k = 0;
                for (let t = 0; t < n; t++) if (t !== i && t !== j) next[k++] = cards[t]!;
                next[k] = result;
                const deeper = this.chain(next, n - 1);
                if (deeper > best) best = deeper;
            }
        }
        return best;
    }

    private ritual(cards: Int16Array): number {
        let best = 0;
        for (let i = 0; i < HAND_SIZE; i++) {
            const recipe = this.ritualOf[cards[i]!]!;
            if (recipe === 0) continue;
            const base = (recipe - 1) * 4;
            let complete = true;
            for (let slot = 0; slot < 4 && complete; slot++) {
                const id = this.ritualRequires[base + slot]!;
                let held = 0;
                for (let t = 0; t < HAND_SIZE; t++) if (cards[t] === id) held++;
                if (held < this.ritualNeeds[base + slot]!) complete = false;
            }
            if (complete && this.ritualPlays[recipe - 1]! > best) best = this.ritualPlays[recipe - 1]!;
        }
        return best;
    }
}

let cached: { source: readonly unknown[]; evaluator: HandEvaluator } | null = null;

// One evaluator per loaded store: the store replaces its card list when it is loaded again.
export function getHandEvaluator(): HandEvaluator {
    const source = getAllCards();
    if (cached === null || cached.source !== source) cached = { source, evaluator: new HandEvaluator() };
    return cached.evaluator;
}
