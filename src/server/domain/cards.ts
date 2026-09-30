import type { Card, CardSummary } from "../../shared/types.js";
import imageOverrides from "../../shared/card-image-overrides.json" with { type: "json" };
import { getCardTypeName } from "../data/store.js";

const FIRST_NON_MONSTER_TYPE = 20;

// Artwork codes, by card id, for cards whose password has no picture on the CDN. Each is the id of the card
// with the same name in the YGOProDeck API, and its picture was checked.
const IMAGE_OVERRIDES: Readonly<Record<string, string>> = imageOverrides;
const DIGITS_ONLY = /^\d+$/;
const LEADING_ZEROS = /^0+/;

export function isMonster(card: Card): boolean {
    return card.Type < FIRST_NON_MONSTER_TYPE;
}

// The CDN names a file after the password without its padding ("04931562" is "4931562.jpg"). A password of
// zeros, which Forbidden Memories gives cards that have none, names no file.
function imageCodeOf(card: Card): string | null {
    const override = IMAGE_OVERRIDES[String(card.Id)];
    if (override !== undefined) return override;
    if (!DIGITS_ONLY.test(card.CardCode)) return null;
    const code = card.CardCode.replace(LEADING_ZEROS, "");
    return code === "" ? null : code;
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
        imageCode: imageCodeOf(card),
        isMonster: isMonster(card),
    };
}
