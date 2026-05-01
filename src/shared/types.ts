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
    Ritual?: unknown;
    Attribute?: number;
    NameColor?: number;
    DescColor?: number;
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

export interface CalculatorResponse {
    fusions: FusionExpanded[];
    equips: EquipExpanded[];
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
}
