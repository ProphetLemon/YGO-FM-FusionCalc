import type { Card, CardSummary } from "../../shared/types.js";
import { getCardTypeName } from "../data/store.js";

const FIRST_NON_MONSTER_TYPE = 20;

export function isMonster(card: Card): boolean {
    return card.Type < FIRST_NON_MONSTER_TYPE;
}

export function toCardSummary(card: Card): CardSummary {
    return {
        id: card.Id,
        name: card.Name,
        description: card.Description,
        type: card.Type,
        typeName: getCardTypeName(card.Type),
        attack: card.Attack,
        defense: card.Defense,
        stars: card.Stars,
        password: card.CardCode,
        isMonster: isMonster(card),
    };
}
