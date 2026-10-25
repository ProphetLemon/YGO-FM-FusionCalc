import { DECK_SIZE } from "../../../../src/shared/limits.js";
import { getAllCards, getCardById } from "../../../../src/server/data/store.js";
import { isMonster } from "../../../../src/server/domain/cards.js";
import { findBestChains } from "../../../../src/server/domain/chain-search.js";
import { findRituals } from "../../../../src/server/domain/rituals.js";
import { getHandEvaluator } from "../../../../src/server/domain/hand-evaluator.js";

// The model every fast path must agree with: the strongest of a monster of the hand, the final card of the
// best fusion chain, and the result of a ritual the hand completes. Slow (microseconds per hand), so tests
// use it on samples or memoise it.
export function referencePlay(hand: readonly number[]): number {
    let best = 0;
    for (const id of hand) {
        const card = getCardById(id);
        if (card && isMonster(card)) best = Math.max(best, card.Attack);
    }
    const chain = findBestChains(hand).chains[0];
    if (chain) best = Math.max(best, chain.finalCard.attack);
    const ritual = findRituals(hand)[0];
    if (ritual) best = Math.max(best, ritual.result.attack);
    return best;
}

// A small seeded generator, so a failing test fails the same way every time.
export function testRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
        return state / 4_294_967_296;
    };
}

export function monstersByAttack(): number[] {
    return getAllCards()
        .filter(isMonster)
        .sort((a, b) => a.Attack - b.Attack || a.Id - b.Id)
        .map((card) => card.Id);
}

// Monsters that fuse with the most other cards, richest first.
export function fusionRichMonsters(): number[] {
    const evaluator = getHandEvaluator();
    const partners = (id: number): number => {
        let count = 0;
        for (let other = 0; other < evaluator.size; other++) {
            if (evaluator.fusion[id * evaluator.size + other]) count++;
        }
        return count;
    };
    return getAllCards()
        .filter(isMonster)
        .map((card) => ({ id: card.Id, partners: partners(card.Id) }))
        .sort((a, b) => b.partners - a.partners || a.id - b.id)
        .map(({ id }) => id);
}

export function nonMonsterIds(): number[] {
    return getAllCards()
        .filter((card) => !isMonster(card))
        .map((card) => card.Id);
}

// A deck of `ids` repeated `copies` times each, cut to `size` cards (a full deck by default).
export function deckOf(ids: readonly number[], copies = 3, size = DECK_SIZE): number[] {
    const deck = ids.flatMap((id) => Array<number>(copies).fill(id)).slice(0, size);
    if (deck.length !== size) {
        throw new Error(`${ids.length} ids x ${copies} copies do not fill ${size} cards`);
    }
    return deck;
}

export function countOf(ids: ArrayLike<number>): Map<number, number> {
    const counts = new Map<number, number>();
    for (let i = 0; i < ids.length; i++)
        counts.set(ids[i] as number, (counts.get(ids[i] as number) ?? 0) + 1);
    return counts;
}

function choose(n: number, r: number): number {
    let value = 1;
    for (let i = 0; i < r; i++) value = (value * (n - i)) / (i + 1);
    return Math.round(value);
}

// Independent brute force for the exact objective: the summed best play over all C(40, 5) hands of a deck
// given as copies per card, by summing the 5-multisets of cards with their hypergeometric weights
// (the number of slot choices that give each multiset). Memoises the slow reference per multiset.
export function createMultisetScorer(): (deck: ReadonlyMap<number, number>) => number {
    const memo = new Map<number, number>();
    const hand: number[] = [];
    const play = (key: number): number => {
        let value = memo.get(key);
        if (value === undefined) {
            value = referencePlay(hand);
            memo.set(key, value);
        }
        return value;
    };
    return (deck) => {
        const ids = [...deck.keys()].filter((id) => (deck.get(id) ?? 0) > 0).sort((a, b) => a - b);
        const copies = ids.map((id) => deck.get(id) as number);
        let total = 0;
        const walk = (from: number, left: number, key: number, weight: number): void => {
            if (left === 0) {
                total += weight * play(key);
                return;
            }
            for (let i = from; i < ids.length; i++) {
                for (let take = 1; take <= Math.min(copies[i] as number, left); take++) {
                    for (let t = 0; t < take; t++) hand.push(ids[i] as number);
                    let next = key;
                    for (let t = 0; t < take; t++) next = next * 1024 + (ids[i] as number);
                    walk(i + 1, left - take, next, weight * choose(copies[i] as number, take));
                    hand.length -= take;
                }
            }
        };
        walk(0, 5, 0, 1);
        return total;
    };
}

// Every deck of `size` cards that holds up to `limits` copies of each card (as copies per card), calling
// `visit` on each. `fixed` lists cards whose copies cannot change.
export function forEachDeck(
    limits: ReadonlyMap<number, number>,
    fixed: ReadonlyMap<number, number>,
    visit: (deck: Map<number, number>) => void,
    size = DECK_SIZE
): void {
    const ids = [...limits.keys()].sort((a, b) => a - b);
    const chosen = new Map<number, number>();
    // Copies the cards from each index on can still add, to stop branches that cannot reach the deck size.
    const room = ids.map((_, index) =>
        ids.slice(index).reduce((sum, id) => sum + (fixed.get(id) ?? (limits.get(id) as number)), 0)
    );
    const walk = (index: number, left: number): void => {
        if (index === ids.length) {
            if (left === 0) visit(new Map(chosen));
            return;
        }
        if (left > (room[index] as number)) return;
        const id = ids[index] as number;
        const pinned = fixed.get(id);
        const most = Math.min(left, limits.get(id) as number);
        for (let copies = pinned ?? 0; copies <= (pinned ?? most); copies++) {
            chosen.set(id, copies);
            walk(index + 1, left - copies);
        }
        chosen.delete(id);
    };
    walk(0, size);
}
