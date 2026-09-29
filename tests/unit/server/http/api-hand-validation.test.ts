import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../../src/server/app.js";
import { MAX_CHAIN_HAND } from "../../../../src/server/domain/chain-search.js";
import { MAX_HAND_SIZE } from "../../../../src/shared/limits.js";

const app = createApp();

const ENDPOINTS = ["/api/calculator", "/api/chain-search"] as const;

const EMPTY_RESULTS = {
    "/api/calculator": { fusions: [], equips: [] },
    "/api/chain-search": { chains: [], truncated: false },
} as const;

// A string is sent as the JSON text itself, so values that JSON.stringify cannot produce reach the server too.
const INVALID_BODIES: ReadonlyArray<readonly [string, string | object]> = [
    ["a float id", { handIds: [1.5, 2] }],
    ["a negative id", { handIds: [-3, 2] }],
    ["a zero id", { handIds: [0, 2] }],
    ["a numeric string id", { handIds: ["2", 8] }],
    ["a text id", { handIds: [1, "two", 3] }],
    ["a null entry", { handIds: [2, null] }],
    ["a boolean entry", { handIds: [true, 8] }],
    ["a nested array entry", { handIds: [[2], 8] }],
    ["a non-finite number", '{"handIds": [2, 1e999]}'],
    ["a string handIds", { handIds: "2,8" }],
    ["an object handIds", { handIds: { 0: 2, 1: 8 } }],
    ["a numeric handIds", { handIds: 2 }],
    ["a null handIds", { handIds: null }],
    ["a body without handIds", {}],
    ["an array body", [2, 8]],
];

function post(endpoint: string, body?: string | object) {
    const req = request(app).post(endpoint);
    if (body === undefined) return req;
    return typeof body === "string" ? req.type("json").send(body) : req.send(body);
}

function distinctIds(count: number): number[] {
    return Array.from({ length: count }, (_, index) => index + 1);
}

describe("hand size cap", () => {
    it("is 12 cards, and the chain search still exports it under its own name", () => {
        expect(MAX_HAND_SIZE).toBe(12);
        expect(MAX_CHAIN_HAND).toBe(MAX_HAND_SIZE);
    });
});

describe.each(ENDPOINTS)("POST %s hand validation", (endpoint) => {
    it.each(INVALID_BODIES)("400 invalid-hand for %s", async (_name, body) => {
        const res = await post(endpoint, body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("invalid-hand");
    });

    it("400 invalid-hand when the request has no body", async () => {
        const res = await post(endpoint);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("invalid-hand");
    });

    it("400 hand-too-large above the cap and the message names the maximum", async () => {
        const res = await post(endpoint, { handIds: distinctIds(MAX_HAND_SIZE + 1) });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("hand-too-large");
        expect(res.body.error.message).toContain(String(MAX_HAND_SIZE));
    });

    it("400 hand-too-large for a huge hand that still fits the body limit, without searching it", async () => {
        const res = await post(endpoint, { handIds: Array.from({ length: 5_000 }, () => 1) });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("hand-too-large");
    });

    it("200 with exactly the maximum number of cards and the usual response shape", async () => {
        const res = await post(endpoint, { handIds: distinctIds(MAX_HAND_SIZE) });
        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual(Object.keys(EMPTY_RESULTS[endpoint]).sort());
    });

    it("200 with no results for an empty hand", async () => {
        const res = await post(endpoint, { handIds: [] });
        expect(res.status).toBe(200);
        expect(res.body).toEqual(EMPTY_RESULTS[endpoint]);
    });

    it("200 with no results for a single card", async () => {
        const res = await post(endpoint, { handIds: [2] });
        expect(res.status).toBe(200);
        expect(res.body).toEqual(EMPTY_RESULTS[endpoint]);
    });

    it("200 and ignores ids that match no card", async () => {
        const withUnknown = await post(endpoint, { handIds: [999_999, 2, 8] });
        const withoutUnknown = await post(endpoint, { handIds: [2, 8] });
        expect(withUnknown.status).toBe(200);
        expect(withoutUnknown.body).not.toEqual(EMPTY_RESULTS[endpoint]);
        expect(withUnknown.body).toEqual(withoutUnknown.body);
    });

    it("400 invalid-json for a malformed JSON body", async () => {
        const res = await post(endpoint, '{"handIds": [1, 2');
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("invalid-json");
    });

    it("413 payload-too-large for a body over the 32kb limit", async () => {
        const res = await post(endpoint, { handIds: Array.from({ length: 20_000 }, () => 1) });
        expect(res.status).toBe(413);
        expect(res.body.error.code).toBe("payload-too-large");
    });
});
