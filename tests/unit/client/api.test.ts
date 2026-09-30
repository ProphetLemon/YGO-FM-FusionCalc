import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, calculate, chainSearch, getCardByName } from "../../../src/client/lib/api.js";

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
