import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../../src/server/app.js";
import { DECK_SIZE, MAX_TRUNK_COUNT } from "../../../../src/shared/limits.js";

const app = createApp();

const DECK = Array.from({ length: DECK_SIZE }, (_, i) => i + 1);
const TRUNK = [
    { id: 296, count: 1 },
    { id: 397, count: 2 },
];

function post(body?: string | object) {
    const req = request(app).post("/api/deck/optimize");
    if (body === undefined) return req;
    return typeof body === "string" ? req.type("json").send(body) : req.send(body);
}

describe("POST /api/deck/optimize", () => {
    it("200 with the stats, swaps, deck, finals and the truncated flag", async () => {
        const res = await post({ deck: DECK, trunk: TRUNK });
        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual(
            ["current", "deck", "recommended", "swaps", "topFinals", "truncated"].sort()
        );
        expect(res.body.deck).toHaveLength(DECK_SIZE);
        expect(Object.keys(res.body.current).sort()).toEqual(["averageBestAtk", "share1500", "share2000"]);
        expect(typeof res.body.truncated).toBe("boolean");
        expect(res.body.recommended.averageBestAtk).toBeGreaterThanOrEqual(res.body.current.averageBestAtk);
    });

    it("200 for an empty trunk, which leaves the deck as it was", async () => {
        const res = await post({ deck: DECK, trunk: [] });
        expect(res.status).toBe(200);
        expect(res.body.swaps).toEqual([]);
        expect(res.body.deck.map((card: { id: number }) => card.id)).toEqual(DECK);
    });

    it("200 with zero counts, a boolean keepNonMonsters, and a trunk of every card", async () => {
        const fullTrunk = Array.from({ length: 722 }, (_, i) => ({
            id: i + 1,
            count: i % 2 === 0 ? 0 : MAX_TRUNK_COUNT,
        }));
        const res = await post({ deck: DECK, trunk: fullTrunk, keepNonMonsters: false });
        expect(res.status).toBe(200);
        expect(res.body.deck).toHaveLength(DECK_SIZE);
    });

    it("gives the same answer for the same body", async () => {
        const first = await post({ deck: DECK, trunk: TRUNK });
        const second = await post({ deck: DECK, trunk: TRUNK });
        expect(second.body).toEqual(first.body);
    });

    const INVALID_DECKS: ReadonlyArray<readonly [string, unknown]> = [
        ["a missing deck", undefined],
        ["a string deck", "nope"],
        ["39 cards", DECK.slice(1)],
        ["41 cards", [...DECK, 1]],
        ["a float id", [...DECK.slice(1), 1.5]],
        ["a zero id", [...DECK.slice(1), 0]],
        ["a negative id", [...DECK.slice(1), -4]],
        ["a numeric string id", [...DECK.slice(1), "7"]],
        ["a null entry", [...DECK.slice(1), null]],
    ];
    it.each(INVALID_DECKS)("400 invalid-deck for %s", async (_name, deck) => {
        const res = await post({ deck, trunk: TRUNK });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("invalid-deck");
    });

    it.each([
        ["an array body", [1, 2]],
        ["an empty body", {}],
    ])("400 invalid-deck for %s", async (_name, body) => {
        const res = await post(body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("invalid-deck");
    });

    it("400 invalid-deck when the request has no body", async () => {
        const res = await post();
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("invalid-deck");
    });

    const INVALID_TRUNKS: ReadonlyArray<readonly [string, unknown]> = [
        ["a missing trunk", undefined],
        ["an object trunk", { 296: 1 }],
        ["a bare id entry", [296]],
        ["a float count", [{ id: 296, count: 1.5 }]],
        ["a negative count", [{ id: 296, count: -1 }]],
        ["a count over a byte", [{ id: 296, count: MAX_TRUNK_COUNT + 1 }]],
        ["a string count", [{ id: 296, count: "1" }]],
        ["a missing count", [{ id: 296 }]],
        ["a zero id", [{ id: 0, count: 1 }]],
        ["a float id", [{ id: 2.5, count: 1 }]],
        [
            "a repeated id",
            [
                { id: 296, count: 1 },
                { id: 296, count: 2 },
            ],
        ],
        ["more entries than cards", Array.from({ length: 800 }, (_, i) => ({ id: i + 1, count: 1 }))],
    ];
    it.each(INVALID_TRUNKS)("400 invalid-trunk for %s", async (_name, trunk) => {
        const res = await post({ deck: DECK, trunk });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("invalid-trunk");
    });

    it("400 invalid-options for a keepNonMonsters that is not a boolean", async () => {
        const res = await post({ deck: DECK, trunk: TRUNK, keepNonMonsters: "yes" });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("invalid-options");
    });

    it("400 unknown-card for a deck id that matches no card", async () => {
        const res = await post({ deck: [...DECK.slice(1), 999_999], trunk: TRUNK });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("unknown-card");
    });

    it("400 unknown-card for a trunk id that matches no card", async () => {
        const res = await post({ deck: DECK, trunk: [{ id: 999_999, count: 1 }] });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("unknown-card");
    });

    it("400 invalid-json for a malformed JSON body", async () => {
        const res = await post('{"deck": [1, 2');
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("invalid-json");
    });

    it("413 payload-too-large for a body over the 32kb limit", async () => {
        const res = await post({
            deck: DECK,
            trunk: Array.from({ length: 5_000 }, (_, i) => ({ id: i + 1, count: 1 })),
        });
        expect(res.status).toBe(413);
        expect(res.body.error.code).toBe("payload-too-large");
    });
});
