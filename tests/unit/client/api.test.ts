import { afterEach, describe, expect, it, vi } from "vitest";
import {
    ApiError,
    calculate,
    chainSearch,
    getCardByName,
    getCardsIndex,
    optimizeDeck,
} from "../../../src/client/lib/api.js";

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function stubFetch(response: Response): ReturnType<typeof vi.fn<typeof fetch>> {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (err) {
        return err;
    }
    throw new Error("expected the promise to reject");
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("ApiError", () => {
    it("carries the code the API sends in its error body", async () => {
        stubFetch(jsonResponse(400, { error: { code: "hand-too-large", message: "too many cards" } }));

        const err = await rejectionOf(calculate([1, 2]));

        expect(err).toBeInstanceOf(ApiError);
        expect(err).toMatchObject({ status: 400, code: "hand-too-large" });
    });

    it.each([
        ["plain text", "Bad gateway"],
        ["empty", ""],
        ["JSON without an error", '{"ok":false}'],
        ["JSON with a code that is not a string", '{"error":{"code":42}}'],
        ["JSON null", "null"],
        ["a JSON array", "[]"],
    ])("has no code when the error body is %s", async (_label, body) => {
        stubFetch(new Response(body, { status: 502 }));

        const err = await rejectionOf(chainSearch([1, 2]));

        expect(err).toBeInstanceOf(ApiError);
        expect(err).toMatchObject({ status: 502, code: undefined });
    });
});

describe("optimizeDeck", () => {
    const request = { deck: [1, 2], trunk: [{ id: 3, count: 1 }], keepNonMonsters: false };

    it("posts the request as JSON and returns the answer", async () => {
        const answer = { swaps: [], certified: true };
        const fetchMock = stubFetch(jsonResponse(200, answer));

        await expect(optimizeDeck(request)).resolves.toEqual(answer);

        const [url, init] = fetchMock.mock.calls[0] ?? [];
        expect(url).toBe("/api/deck/optimize");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual(request);
    });

    it("keeps the Retry-After header of a busy answer on the error", async () => {
        stubFetch(
            new Response(JSON.stringify({ error: { code: "busy", message: "wait" } }), {
                status: 503,
                headers: { "Retry-After": "5" },
            })
        );

        const err = await rejectionOf(optimizeDeck(request));

        expect(err).toBeInstanceOf(ApiError);
        expect(err).toMatchObject({ status: 503, code: "busy", retryAfter: "5" });
    });

    it("has no retryAfter when the answer sends no header", async () => {
        stubFetch(jsonResponse(400, { error: { code: "invalid-deck", message: "bad" } }));

        const err = await rejectionOf(optimizeDeck(request));

        expect(err).toMatchObject({ status: 400, code: "invalid-deck", retryAfter: undefined });
    });
});

describe("getCardByName", () => {
    it("returns the card the API found", async () => {
        const card = { id: 2, name: "Mystical Elf" };
        const fetchMock = stubFetch(jsonResponse(200, { card }));

        await expect(getCardByName("Mystical Elf")).resolves.toEqual(card);

        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/cards?name=Mystical%20Elf");
    });

    it("returns null when the API says the card does not exist", async () => {
        stubFetch(jsonResponse(404, { error: { code: "card-not-found", message: "No card" } }));

        await expect(getCardByName("Nope")).resolves.toBeNull();
    });

    it.each([
        ["a 404 with another code", jsonResponse(404, { error: { code: "route-not-found" } })],
        ["a 404 without a JSON body", new Response("Not found", { status: 404 })],
        ["a server error", jsonResponse(500, { error: { code: "internal-error" } })],
        ["a bad request", jsonResponse(400, { error: { code: "missing-name" } })],
    ])("throws instead of reporting a missing card on %s", async (_label, response) => {
        stubFetch(response);

        await expect(getCardByName("Mystical Elf")).rejects.toBeInstanceOf(ApiError);
    });

    it("lets a network failure through", async () => {
        const failure = new TypeError("Failed to fetch");
        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(failure));

        await expect(getCardByName("Mystical Elf")).rejects.toBe(failure);
    });
});

describe("abort signal", () => {
    const calls: ReadonlyArray<readonly [string, (signal: AbortSignal) => Promise<unknown>, unknown]> = [
        ["calculate", (signal) => calculate([1, 2], signal), { fusions: [], equips: [], rituals: [] }],
        ["chainSearch", (signal) => chainSearch([1, 2], signal), { chains: [], truncated: false }],
        ["getCardByName", (signal) => getCardByName("Mystical Elf", signal), { card: { id: 2 } }],
    ];

    it.each(calls)("%s hands the signal to fetch", async (_name, call, body) => {
        const controller = new AbortController();
        const fetchMock = stubFetch(jsonResponse(200, body));

        await call(controller.signal);

        expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    });

    it("calculate posts the hand as JSON", async () => {
        const fetchMock = stubFetch(jsonResponse(200, { fusions: [], equips: [], rituals: [] }));

        await calculate([13, 15]);

        const init = fetchMock.mock.calls[0]?.[1];
        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/calculator");
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(JSON.stringify({ handIds: [13, 15] }));
    });
});

describe("getCardsIndex", () => {
    const CARDS = [
        { id: 2, name: "Mystical Elf", type: 0 },
        { id: 8, name: "Mushroom Man", type: 0 },
    ];
    // Where the page keeps the index once it has it: the autocomplete specs read the same key.
    const KEY = "ygo-fm:cards-index";

    class MemorySession {
        readonly items = new Map<string, string>();

        getItem(key: string): string | null {
            return this.items.get(key) ?? null;
        }

        setItem(key: string, value: string): void {
            this.items.set(key, value);
        }
    }

    function stubSession(session: unknown): void {
        vi.stubGlobal("window", { sessionStorage: session });
    }

    function blocked(): never {
        throw new DOMException("The operation is insecure.", "SecurityError");
    }

    // A fresh answer per call: a Response body can be read only once.
    function stubFetchAnswering(
        ...answers: Array<() => Response | Promise<Response>>
    ): ReturnType<typeof vi.fn<typeof fetch>> {
        const fetchMock = vi.fn<typeof fetch>();
        for (const answer of answers) fetchMock.mockImplementationOnce(async () => answer());
        vi.stubGlobal("fetch", fetchMock);
        return fetchMock;
    }

    const indexAnswer = (): Response => jsonResponse(200, { cards: CARDS });

    it("fetches the index and keeps a copy in sessionStorage", async () => {
        const session = new MemorySession();
        stubSession(session);
        const fetchMock = stubFetchAnswering(indexAnswer);

        await expect(getCardsIndex()).resolves.toEqual(CARDS);

        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/cards-index");
        expect(JSON.parse(session.items.get(KEY) ?? "")).toEqual({ cards: CARDS });
    });

    it("answers from the copy in sessionStorage without a request", async () => {
        const session = new MemorySession();
        session.items.set(KEY, JSON.stringify({ cards: CARDS }));
        stubSession(session);
        const fetchMock = stubFetchAnswering();

        await expect(getCardsIndex()).resolves.toEqual(CARDS);

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("answers from the request when merely reading window.sessionStorage throws", async () => {
        vi.stubGlobal("window", {
            get sessionStorage(): never {
                return blocked();
            },
        });
        stubFetchAnswering(indexAnswer);

        await expect(getCardsIndex()).resolves.toEqual(CARDS);
    });

    it("answers from the request when reading and writing the stored copy both throw", async () => {
        stubSession({ getItem: blocked, setItem: blocked });
        stubFetchAnswering(indexAnswer);

        await expect(getCardsIndex()).resolves.toEqual(CARDS);
    });

    it("answers from the request when the environment has no window at all", async () => {
        vi.stubGlobal("window", undefined);
        stubFetchAnswering(indexAnswer);

        await expect(getCardsIndex()).resolves.toEqual(CARDS);
    });

    it.each([
        ["is not JSON", "{not json"],
        ["is JSON null", "null"],
        ["has no card list", '{"total":2}'],
        ["has a card list that is not an array", '{"cards":"Mystical Elf"}'],
        ["is an array", JSON.stringify(CARDS)],
    ])("asks again, and replaces the copy, when the stored copy %s", async (_label, stored) => {
        const session = new MemorySession();
        session.items.set(KEY, stored);
        stubSession(session);
        const fetchMock = stubFetchAnswering(indexAnswer);

        await expect(getCardsIndex()).resolves.toEqual(CARDS);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(JSON.parse(session.items.get(KEY) ?? "")).toEqual({ cards: CARDS });
    });

    it.each([
        ["a network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
        ["a server error", () => jsonResponse(500, { error: { code: "internal-error" } })],
        ["an answer that is not JSON", () => new Response("<h1>Bad gateway</h1>", { status: 200 })],
    ])("does not keep a failed request: %s is followed by a request that works", async (_label, failure) => {
        const session = new MemorySession();
        stubSession(session);
        const fetchMock = stubFetchAnswering(failure, indexAnswer);

        await expect(getCardsIndex()).rejects.toBeDefined();
        expect(session.items.size).toBe(0);
        await expect(getCardsIndex()).resolves.toEqual(CARDS);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(session.items.get(KEY) ?? "")).toEqual({ cards: CARDS });
    });

    it("fails when the request does with sessionStorage blocked too, and asks again", async () => {
        stubSession({ getItem: blocked, setItem: blocked });
        const fetchMock = stubFetchAnswering(() => jsonResponse(503, {}), indexAnswer);

        await expect(getCardsIndex()).rejects.toBeInstanceOf(ApiError);
        await expect(getCardsIndex()).resolves.toEqual(CARDS);

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
