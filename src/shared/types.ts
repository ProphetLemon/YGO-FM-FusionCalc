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

export interface CardIndexEntry {
    id: number;
    name: string;
    type: number;
}

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

export interface DeckOptimizeRequest {
    // The 40 card ids of the current deck.
    deck: number[];
    // Spare cards, which do not include the ones in the deck.
    trunk: DeckTrunkEntry[];
    // Non-monster cards of the current deck are never swapped out. On by default.
    keepNonMonsters?: boolean;
}

// How a deck plays over random 5-card hands: the strongest monster each hand can make.
export interface DeckStats {
    averageBestAtk: number;
    // Share of hands, from 0 to 1, whose best monster reaches 1500 / 2000 ATK.
    share1500: number;
    share2000: number;
}

export interface DeckSwap {
    out: CardSummary;
    in: CardSummary;
}

export interface DeckFinal {
    card: CardSummary;
    // Share of hands, from 0 to 1, whose best monster is this card made by a fusion.
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
    // True when a time or evaluation budget stopped the search before it finished.
    truncated: boolean;
}
