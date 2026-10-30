export interface Card {
    Id: number;
    Name: string;
    Description: string;
    Type: number;
    Attack: number;
    Defense: number;
    Stars: number;
    CardCode: string;
    Fusions: FusionEntry[];
    Equip: number[] | null;
    GuardianStarA?: number;
    GuardianStarB?: number;
    Level?: number;
    Ritual?: RitualData | null;
    Attribute?: number;
    NameColor?: number;
    DescColor?: number;
}

// Recipe kept in Cards.json on its Ritual card: that card plus three materials make the result.
export interface RitualData {
    RitualCard: number;
    Card1: number;
    Card2: number;
    Card3: number;
    Result: number;
}

export interface FusionEntry {
    _card1: number;
    _card2: number;
    _result: number;
}

export interface FusionIndexEntry {
    card: number;
    result: number;
}

export interface ResultEntry {
    card1: number;
    card2: number;
}

export interface CardSummary {
    id: number;
    name: string;
    description: string;
    type: number;
    typeName: string;
    attack: number;
    defense: number;
    stars: number;
    password: string;
    // File name of the artwork on the image CDN. null when the card has none, so the page asks for nothing.
    imageCode: string | null;
    isMonster: boolean;
}

// One card of the catalog `GET /api/cards-index` serves: enough to name a card, tell its kind and draw its
// tile, without a request per card.
export type CardIndexEntry = Pick<
    CardSummary,
    "id" | "name" | "type" | "typeName" | "attack" | "defense" | "imageCode" | "isMonster"
>;

export interface FusionExpanded {
    card1: CardSummary;
    card2: CardSummary;
    result: CardSummary;
}

export interface ResultExpanded {
    card1: CardSummary;
    card2: CardSummary;
}

export interface EquipExpanded {
    card1: CardSummary;
    card2: CardSummary;
}

export interface RitualExpanded {
    ritualCard: CardSummary;
    materials: CardSummary[];
    result: CardSummary;
}

export interface CalculatorResponse {
    fusions: FusionExpanded[];
    equips: EquipExpanded[];
    rituals: RitualExpanded[];
}

export interface FusionStep {
    card1: CardSummary;
    card2: CardSummary;
    result: CardSummary;
}

export interface ChainResult {
    steps: FusionStep[];
    finalCard: CardSummary;
}

export interface ChainSearchResponse {
    chains: ChainResult[];
    truncated: boolean;
}

export interface DeckTrunkEntry {
    id: number;
    count: number;
}

// Copies of one card the answer must hold.
export interface DeckLock {
    id: number;
    count: number;
}

export interface DeckOptimizeRequest {
    // The 40 card ids of the current deck.
    deck: number[];
    // Spare cards, which do not include the ones in the deck.
    trunk: DeckTrunkEntry[];
    // Non-monster cards of the current deck are never swapped out. On by default.
    keepNonMonsters?: boolean;
    // Cards to hold: the answer holds at least `count` copies of each `id`, whether those copies are in the deck
    // or among the spare cards. `count` goes up to the copies the deck may hold (the copies owned, up to the
    // copy limit). At most 40 entries, distinct ids. They add to the non-monsters kept by `keepNonMonsters`.
    // Omitted: no locks.
    locked?: DeckLock[];
    // Distinct ids of cards the player owns that the answer must not hold, in the deck or among the spare
    // cards, at most one entry per card owned. They win over `keepNonMonsters` and cannot also be in `locked`.
    // Omitted: none.
    forbidden?: number[];
}

// How a deck plays over all of its 5-card hands: the strongest monster each hand can make. Every number is
// exact, computed over every possible hand, not estimated.
export interface DeckStats {
    averageBestAtk: number;
    // Share of hands, from 0 to 1, whose best monster reaches 1500 / 2000 ATK.
    share1500: number;
    share2000: number;
    // Share of hands, from 0 to 1, whose best monster is 1000 ATK or less: the hands that do nothing.
    shareDead: number;
}

export interface DeckSwap {
    out: CardSummary;
    in: CardSummary;
}

export interface DeckFinal {
    card: CardSummary;
    // Share of hands, from 0 to 1, whose best play is this card made by a fusion that beats every card
    // played as it is (and every ritual result).
    share: number;
}

export interface DeckOptimizeResponse {
    current: DeckStats;
    recommended: DeckStats;
    swaps: DeckSwap[];
    // The recommended deck: 40 cards, in the slots of the current deck.
    deck: CardSummary[];
    // The fusions the recommended deck relies on most, up to 8.
    topFinals: DeckFinal[];
    // Only for method "local-search": true when the time budget ended before the search could confirm that no
    // single swap with any owned card improves `deck`. The deck is then the best found so far. Always false for
    // "exhaustive".
    truncated: boolean;
    // True when `deck` is the best possible deck under the request's constraints, proven by trying every deck:
    // the best among those that obey the rules (hold the locked cards, hold no forbidden card). With
    // `keepNonMonsters` (the default) the constraints also pin the non-monsters of the current deck and keep
    // spare non-monsters out; without it every other owned card may move. False for a deck found by local
    // search: unless `truncated`, no single swap with any owned card improves it, but a swap of several cards
    // at once might.
    certified: boolean;
    method: DeckOptimizeMethod;
}

export type DeckOptimizeMethod = "exhaustive" | "local-search";
