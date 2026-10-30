// Largest hand the calculator and the chain search accept; shared so the client can cap "Add card" at it.
export const MAX_HAND_SIZE = 12;

// Cards in a deck. The game fixes it at 40.
export const DECK_SIZE = 40;

// Most copies of one card the optimiser puts in a deck. This is an ASSUMED deck-building rule: no source has
// confirmed the in-game limit for Forbidden Memories. It lives here, in one place, so it is easy to change.
export const MAX_COPIES_PER_CARD = 3;

// Largest count a trunk entry can have: the save stores each count in a single byte.
export const MAX_TRUNK_COUNT = 255;

// Copies of one card a deck may hold: the copies owned, up to MAX_COPIES_PER_CARD. A deck that already holds
// more than that may keep them, so the player's own deck is never over the limit. The route and the search
// both read this, so they cannot disagree about what a deck may hold.
export function copyLimit(owned: number, inDeck: number): number {
    return Math.min(owned, Math.max(MAX_COPIES_PER_CARD, inDeck));
}
