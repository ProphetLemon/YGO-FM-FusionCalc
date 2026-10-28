import { beforeAll, describe, expect, it, vi } from "vitest";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { createApp } from "../../../../src/server/app.js";
import { DECK_SIZE, MAX_TRUNK_COUNT } from "../../../../src/shared/limits.js";
import type { DeckOptimizeResponse } from "../../../../src/shared/types.js";
import {
    createDeckOptimizerService,
    runInWorker,
} from "../../../../src/server/workers/deck-optimizer-runner.js";

// These tests score hundreds of thousands of hands; coverage instrumentation and parallel files slow them down.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// The default app runs the optimisation in a worker thread, as the server does. The tests that only need an
// answer use one with a short budget, which runs in a worker too: coverage instrumentation slows an
// optimisation on this thread several times over.
const app = createApp();
const quickApp = createApp({
    deckOptimizer: createDeckOptimizerService((body) => runInWorker(body, { maxMillis: 800, tabuSteps: 0 })),
});

const DECK = Array.from({ length: DECK_SIZE }, (_, i) => i + 1);
const TRUNK = [
    { id: 296, count: 1 },
    { id: 397, count: 2 },
];

// A real answer, for the tests that hold an optimisation open and then let it finish.
let answer: DeckOptimizeResponse;
beforeAll(async () => {
    answer = await runInWorker({ deck: DECK, trunk: [] });
});

function post(body?: string | object, target = quickApp) {
    const req = request(target).post("/api/deck/optimize");
    if (body === undefined) return req;
    return typeof body === "string" ? req.type("json").send(body) : req.send(body);
}

describe("POST /api/deck/optimize", () => {
    it("200 with the stats, swaps, deck, finals and the flags, computed in a worker thread", async () => {
        const res = await post({ deck: DECK, trunk: TRUNK }, app);
        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual(
            [
                "certified",
                "current",
                "deck",
                "method",
                "recommended",
                "swaps",
                "topFinals",
                "truncated",
            ].sort()
        );
        expect(res.body.deck).toHaveLength(DECK_SIZE);
        expect(Object.keys(res.body.current).sort()).toEqual([
            "averageBestAtk",
            "share1500",
            "share2000",
            "shareDead",
        ]);
        expect(typeof res.body.truncated).toBe("boolean");
        expect(typeof res.body.certified).toBe("boolean");
        expect(["exhaustive", "local-search"]).toContain(res.body.method);
        expect(res.body.recommended.averageBestAtk).toBeGreaterThanOrEqual(res.body.current.averageBestAtk);
        expect(res.body.recommended.shareDead).toBeLessThanOrEqual(res.body.current.shareDead);
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

    describe("while an optimisation runs", () => {
        // An app whose optimisation starts when asked and ends when `release` is called. `started` settles
        // once the first request has reached the optimiser, so a test never races the server.
        function blockedApp() {
            let release!: (value: DeckOptimizeResponse) => void;
            let begin!: () => void;
            const running = new Promise<DeckOptimizeResponse>((resolve) => (release = resolve));
            const started = new Promise<void>((resolve) => (begin = resolve));
            const blocked = createApp({
                deckOptimizer: createDeckOptimizerService(() => {
                    begin();
                    return running;
                }),
            });
            return { blocked, release, started };
        }

        it("503 busy for a second request, with a Retry-After, and the first still gets its answer", async () => {
            const { blocked, release, started } = blockedApp();
            const first = post({ deck: DECK, trunk: TRUNK }, blocked).then((res) => res);
            await started;
            const second = await post({ deck: DECK, trunk: TRUNK }, blocked);
            expect(second.status).toBe(503);
            expect(second.body.error.code).toBe("busy");
            expect(second.headers["retry-after"]).toBe("5");
            release(answer);
            expect((await first).status).toBe(200);
            expect((await post({ deck: DECK, trunk: [] }, quickApp)).status).toBe(200);
        });

        it("validates the body before it looks at whether it is busy", async () => {
            const { blocked, release, started } = blockedApp();
            const first = post({ deck: DECK, trunk: TRUNK }, blocked).then((res) => res);
            await started;
            const invalid = await post({ deck: DECK.slice(1), trunk: TRUNK }, blocked);
            expect(invalid.status).toBe(400);
            release(answer);
            await first;
        });
    });

    it("aborts the optimisation and frees the slot when the client disconnects", async () => {
        let begin!: () => void;
        const started = new Promise<void>((resolve) => (begin = resolve));
        let aborted = false;
        const server = createApp({
            deckOptimizer: createDeckOptimizerService((_body, _options, signal) => {
                if (aborted) return Promise.resolve(answer);
                begin();
                return new Promise((_resolve, reject) =>
                    signal?.addEventListener("abort", () => {
                        aborted = true;
                        reject(new Error("aborted"));
                    })
                );
            }),
        }).listen(0);
        try {
            const { port } = server.address() as AddressInfo;
            const payload = JSON.stringify({ deck: DECK, trunk: TRUNK });
            const client = httpRequest({
                port,
                method: "POST",
                path: "/api/deck/optimize",
                headers: {
                    "content-type": "application/json",
                    "content-length": Buffer.byteLength(payload),
                },
            });
            client.on("error", () => undefined);
            client.end(payload);
            await started;
            client.destroy();
            await vi.waitFor(() => expect(aborted).toBe(true));
            // The slot is free again: the next request is answered, not refused as busy.
            const next = await request(server).post("/api/deck/optimize").send({ deck: DECK, trunk: TRUNK });
            expect(next.status).toBe(200);
        } finally {
            server.close();
        }
    });

    it("500 internal-error, without the failure's detail, when the optimisation fails", async () => {
        const failing = createApp({
            deckOptimizer: createDeckOptimizerService(async () => {
                throw new Error("secret worker detail");
            }),
        });
        const res = await post({ deck: DECK, trunk: TRUNK }, failing);
        expect(res.status).toBe(500);
        expect(res.body.error.code).toBe("internal-error");
        expect(res.text).not.toContain("secret worker detail");
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

    it("200 with locks, which the recommended deck keeps", async () => {
        // Card 1 is in the deck once; locking it keeps it whatever the trunk offers.
        const locked = [{ id: 1, count: 1 }];
        const res = await post({ deck: DECK, trunk: TRUNK, keepNonMonsters: false, locked });
        expect(res.status).toBe(200);
        expect(res.body.deck.map((card: { id: number }) => card.id)).toContain(1);
        expect((await post({ deck: DECK, trunk: TRUNK, locked: [] })).status).toBe(200);
    });

    const INVALID_LOCKS: ReadonlyArray<readonly [string, unknown]> = [
        ["a locked that is not an array", { id: 1, count: 1 }],
        ["a null locked", null],
        ["more than 40 entries", Array.from({ length: 41 }, (_, i) => ({ id: i + 1, count: 1 }))],
        ["a non-object entry", [7]],
        ["a null entry", [null]],
        ["a float id", [{ id: 1.5, count: 1 }]],
        ["a zero id", [{ id: 0, count: 1 }]],
        ["a string id", [{ id: "1", count: 1 }]],
        ["a missing id", [{ count: 1 }]],
        ["an id that matches no card", [{ id: 999_999, count: 1 }]],
        ["a count of 0", [{ id: 1, count: 0 }]],
        ["a negative count", [{ id: 1, count: -1 }]],
        ["a float count", [{ id: 1, count: 1.5 }]],
        ["a string count", [{ id: 1, count: "1" }]],
        ["a missing count", [{ id: 1 }]],
        [
            "a repeated id",
            [
                { id: 1, count: 1 },
                { id: 1, count: 1 },
            ],
        ],
        ["more copies than the deck holds", [{ id: 1, count: 2 }]],
        ["a card that is not in the deck", [{ id: 296, count: 1 }]],
    ];
    it.each(INVALID_LOCKS)("400 invalid-locks for %s", async (_name, locked) => {
        const res = await post({ deck: DECK, trunk: TRUNK, locked });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("invalid-locks");
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
