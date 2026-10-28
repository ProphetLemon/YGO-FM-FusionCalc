import type {
    CalculatorResponse,
    CardIndexEntry,
    CardSummary,
    ChainSearchResponse,
    DeckOptimizeRequest,
    DeckOptimizeResponse,
    EquipExpanded,
    FusionExpanded,
    ResultExpanded,
} from "../../shared/types.js";
import { browserStorage, readJson, writeJson } from "./storage.js";

// Versioned by the shape of an entry: a tab that stored an older shape fetches the index again.
const CARDS_INDEX_KEY = "ygo-fm:cards-index:v2";

interface ErrorBody {
    error?: { code?: unknown };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
        const text = await res.text();
        throw new ApiError(
            res.status,
            `HTTP ${res.status} on ${url}: ${text}`,
            readErrorCode(text),
            res.headers.get("Retry-After") ?? undefined
        );
    }
    return (await res.json()) as T;
}

// The API answers errors as { error: { code, message } }; anything else has no code.
function readErrorCode(text: string): string | undefined {
    try {
        const code = (JSON.parse(text) as ErrorBody | null)?.error?.code;
        return typeof code === "string" ? code : undefined;
    } catch {
        return undefined;
    }
}

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        public code?: string,
        // The raw Retry-After header of the answer, when it had one.
        public retryAfter?: string
    ) {
        super(message);
        this.name = "ApiError";
    }
}

// The copy in sessionStorage only saves a request: storage that is blocked, or a copy that cannot be used,
// means fetching. A failed request stores nothing, so the next call asks again.
export async function getCardsIndex(): Promise<readonly CardIndexEntry[]> {
    const storage = browserStorage("sessionStorage");
    const cards = readJson<{ cards?: unknown }>(storage, CARDS_INDEX_KEY)?.cards;
    if (Array.isArray(cards)) return cards;
    const fresh = await fetchJson<{ cards: readonly CardIndexEntry[] }>("/api/cards-index");
    writeJson(storage, CARDS_INDEX_KEY, fresh);
    return fresh.cards;
}

// Null only when the API says the card does not exist; any other failure is thrown.
export async function getCardByName(name: string, signal?: AbortSignal): Promise<CardSummary | null> {
    const url = `/api/cards?name=${encodeURIComponent(name)}`;
    try {
        const data = await fetchJson<{ card: CardSummary }>(url, { signal });
        return data.card;
    } catch (err) {
        if (err instanceof ApiError && err.status === 404 && err.code === "card-not-found") return null;
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

export async function calculate(handIds: number[], signal?: AbortSignal): Promise<CalculatorResponse> {
    return fetchJson<CalculatorResponse>("/api/calculator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handIds }),
        signal,
    });
}

export async function chainSearch(handIds: number[], signal?: AbortSignal): Promise<ChainSearchResponse> {
    return fetchJson<ChainSearchResponse>("/api/chain-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handIds }),
        signal,
    });
}

// The deck optimisation can take several seconds; the caller aborts it when the player moves on.
export async function optimizeDeck(
    request: DeckOptimizeRequest,
    signal?: AbortSignal
): Promise<DeckOptimizeResponse> {
    return fetchJson<DeckOptimizeResponse>("/api/deck/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal,
    });
}
