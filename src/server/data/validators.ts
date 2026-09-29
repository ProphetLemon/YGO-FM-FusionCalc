import type { Card, FusionIndexEntry, ResultEntry } from "../../shared/types.js";

const RITUAL_FIELDS = ["RitualCard", "Card1", "Card2", "Card3", "Result"] as const;

function isPositiveInteger(value: unknown): boolean {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// Cards without a recipe carry `null` (or no field at all); a recipe needs its five card ids.
function isValidRitual(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value !== "object") return false;
    return RITUAL_FIELDS.every((field) => isPositiveInteger((value as Record<string, unknown>)[field]));
}

export function validateCardsJson(value: unknown): asserts value is Card[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error("Cards.json: expected non-empty array");
    }
    for (const [index, card] of value.entries()) {
        if (
            typeof card !== "object" ||
            card === null ||
            typeof (card as Card).Id !== "number" ||
            typeof (card as Card).Name !== "string" ||
            typeof (card as Card).Type !== "number"
        ) {
            throw new Error(`Cards.json: invalid card at index ${index}`);
        }
        if (!isValidRitual((card as Card).Ritual)) {
            throw new Error(`Cards.json: invalid ritual at index ${index}`);
        }
    }
}

export function validateFusionsJson(value: unknown): asserts value is Array<FusionIndexEntry[] | null> {
    if (!Array.isArray(value)) {
        throw new Error("fusions.json: expected array");
    }
    for (const [index, entry] of value.entries()) {
        if (entry === null) continue;
        if (!Array.isArray(entry)) {
            throw new Error(`fusions.json: invalid entry at index ${index}`);
        }
    }
}

export function validateEquipsJson(value: unknown): asserts value is Array<number[] | null> {
    if (!Array.isArray(value)) {
        throw new Error("equips.json: expected array");
    }
    for (const [index, entry] of value.entries()) {
        if (entry === null) continue;
        if (!Array.isArray(entry)) {
            throw new Error(`equips.json: invalid entry at index ${index}`);
        }
    }
}

export function validateResultsJson(value: unknown): asserts value is Array<ResultEntry[] | null> {
    if (!Array.isArray(value)) {
        throw new Error("results.json: expected array");
    }
    for (const [index, entry] of value.entries()) {
        if (entry === null) continue;
        if (!Array.isArray(entry)) {
            throw new Error(`results.json: invalid entry at index ${index}`);
        }
    }
}
