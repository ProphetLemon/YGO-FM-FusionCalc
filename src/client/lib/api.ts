import type {
    CalculatorResponse,
    CardIndexEntry,
    CardSummary,
    EquipExpanded,
    FusionExpanded,
    ResultExpanded,
} from "../../shared/types.js";
import { readJson, writeJson } from "./storage.js";

const CARDS_INDEX_KEY = "ygo-fm:cards-index";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
        const text = await res.text();
        throw new ApiError(res.status, `HTTP ${res.status} on ${url}: ${text}`);
    }
    return (await res.json()) as T;
}

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string
    ) {
        super(message);
        this.name = "ApiError";
    }
}

export async function getCardsIndex(): Promise<readonly CardIndexEntry[]> {
    const cached = readJson<{ cards: readonly CardIndexEntry[] }>(window.sessionStorage, CARDS_INDEX_KEY);
    if (cached !== null) return cached.cards;
    const fresh = await fetchJson<{ cards: readonly CardIndexEntry[] }>("/api/cards-index");
    writeJson(window.sessionStorage, CARDS_INDEX_KEY, fresh);
    return fresh.cards;
}

export async function getCardByName(name: string): Promise<CardSummary | null> {
    try {
        const data = await fetchJson<{ card: CardSummary }>(`/api/cards?name=${encodeURIComponent(name)}`);
        return data.card;
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

export async function getFusions(
    id: number
): Promise<{ fusions: FusionExpanded[]; equips: EquipExpanded[] } | null> {
    try {
        return await fetchJson(`/api/fusions/${id}`);
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

export async function getResults(id: number): Promise<ResultExpanded[] | null> {
    try {
        const data = await fetchJson<{ results: ResultExpanded[] }>(`/api/results/${id}`);
        return data.results;
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

export async function calculate(handIds: number[]): Promise<CalculatorResponse> {
    return fetchJson<CalculatorResponse>("/api/calculator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handIds }),
    });
}
