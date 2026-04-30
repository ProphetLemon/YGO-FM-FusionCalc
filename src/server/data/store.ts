import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Card, FusionIndexEntry, ResultEntry } from "../../shared/types.js";
import typesAndStars from "../../shared/types-and-stars.json" with { type: "json" };
import {
    validateCardsJson,
    validateEquipsJson,
    validateFusionsJson,
    validateResultsJson,
} from "./validators.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");

interface StoreInternals {
    cardsById: Map<number, Card>;
    cardsByNameLower: Map<string, Card>;
    allCards: readonly Card[];
    cardIndex: ReadonlyArray<{ id: number; name: string; type: number }>;
    fusionsByCard: Map<number, readonly FusionIndexEntry[]>;
    equipsByCard: Map<number, readonly number[]>;
    resultsByCard: Map<number, readonly ResultEntry[]>;
}

let state: StoreInternals | null = null;

function readJson(filename: string): unknown {
    const content = fs.readFileSync(path.join(projectRoot, "data", filename), "utf-8");
    return JSON.parse(content);
}

export function loadStore(): void {
    const cardsRaw = readJson("Cards.json");
    validateCardsJson(cardsRaw);
    const cards = cardsRaw;

    const fusionsRaw = readJson("fusions.json");
    validateFusionsJson(fusionsRaw);

    const equipsRaw = readJson("equips.json");
    validateEquipsJson(equipsRaw);

    const resultsRaw = readJson("results.json");
    validateResultsJson(resultsRaw);

    const cardsById = new Map<number, Card>();
    const cardsByNameLower = new Map<string, Card>();
    const cardIndex: Array<{ id: number; name: string; type: number }> = [];
    for (const card of cards) {
        cardsById.set(card.Id, card);
        cardsByNameLower.set(card.Name.toLowerCase(), card);
        cardIndex.push({ id: card.Id, name: card.Name, type: card.Type });
    }
    cardIndex.sort((a, b) => a.name.localeCompare(b.name));

    const fusionsByCard = new Map<number, readonly FusionIndexEntry[]>();
    fusionsRaw.forEach((entry, idx) => {
        if (entry !== null) fusionsByCard.set(idx, entry);
    });

    const equipsByCard = new Map<number, readonly number[]>();
    equipsRaw.forEach((entry, idx) => {
        if (entry !== null) equipsByCard.set(idx, entry);
    });

    const resultsByCard = new Map<number, readonly ResultEntry[]>();
    resultsRaw.forEach((entry, idx) => {
        if (entry !== null) resultsByCard.set(idx, entry);
    });

    state = {
        cardsById,
        cardsByNameLower,
        allCards: cards,
        cardIndex,
        fusionsByCard,
        equipsByCard,
        resultsByCard,
    };
}

function getState(): StoreInternals {
    if (state === null) {
        throw new Error("Store not loaded. Call loadStore() before reading.");
    }
    return state;
}

export function getCardById(id: number): Card | undefined {
    return getState().cardsById.get(id);
}

export function getCardByNameLower(nameLower: string): Card | undefined {
    return getState().cardsByNameLower.get(nameLower);
}

export function getAllCards(): readonly Card[] {
    return getState().allCards;
}

export function getCardIndex(): ReadonlyArray<{ id: number; name: string; type: number }> {
    return getState().cardIndex;
}

export function getFusionsForCard(id: number): readonly FusionIndexEntry[] {
    return getState().fusionsByCard.get(id) ?? [];
}

export function getEquipsForCard(id: number): readonly number[] {
    return getState().equipsByCard.get(id) ?? [];
}

export function getResultsForCard(id: number): readonly ResultEntry[] {
    return getState().resultsByCard.get(id) ?? [];
}

export function getCardTypeName(typeIndex: number): string {
    const name = typesAndStars.cardTypes[typeIndex];
    return name ?? "Unknown";
}

export function resetStore(): void {
    state = null;
}
