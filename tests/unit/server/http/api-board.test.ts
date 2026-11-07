import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../../src/server/app.js";
import { findCombinations } from "../../../../src/server/domain/calculator.js";
import { findBestChains } from "../../../../src/server/domain/chain-search.js";

const app = createApp();

const BABY_DRAGON = 4;
const TIME_WIZARD = 16;
const LEGENDARY_SWORD = 301;
const FOREST = 330;

const ENDPOINTS = ["/api/calculator", "/api/chain-search"] as const;

describe("board mode of the hand endpoints", () => {
    describe("without monsterIds and spellIds", () => {
        it("answers /api/calculator exactly as findCombinations does", async () => {
            const handIds = [BABY_DRAGON, TIME_WIZARD, 41, LEGENDARY_SWORD];
            const res = await request(app).post("/api/calculator").send({ handIds });
            expect(res.status).toBe(200);
            expect(res.body).toEqual(JSON.parse(JSON.stringify(findCombinations({ handIds }))));
            expect(res.text).not.toContain('"from"');
        });

        it("answers /api/chain-search exactly as findBestChains does", async () => {
            const handIds = [BABY_DRAGON, TIME_WIZARD, 41];
            const res = await request(app).post("/api/chain-search").send({ handIds });
            expect(res.body).toEqual(JSON.parse(JSON.stringify(findBestChains(handIds))));
            expect(res.text).not.toContain("fieldIndex");
        });

        it("keeps accepting up to 12 cards and rejecting more with hand-too-large", async () => {
            const twelve = Array.from({ length: 12 }, () => 1);
            expect((await request(app).post("/api/calculator").send({ handIds: twelve })).status).toBe(200);
            const res = await request(app)
                .post("/api/calculator")
                .send({ handIds: [...twelve, 1] });
            expect(res.body.error.code).toBe("hand-too-large");
        });
    });

    describe.each(ENDPOINTS)("%s with a zone key", (endpoint) => {
        it("treats an absent zone as empty", async () => {
            const res = await request(app)
                .post(endpoint)
                .send({ handIds: [BABY_DRAGON, TIME_WIZARD], spellIds: [] });
            expect(res.status).toBe(200);
        });

        it("requires handIds", async () => {
            const res = await request(app)
                .post(endpoint)
                .send({ monsterIds: [BABY_DRAGON] });
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe("invalid-hand");
        });

        it.each(["monsterIds", "spellIds"])("rejects a malformed %s with invalid-hand", async (key) => {
            const res = await request(app)
                .post(endpoint)
                .send({ handIds: [], [key]: [1, "two"] });
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe("invalid-hand");
        });

        it.each(["handIds", "monsterIds", "spellIds"])(
            "rejects six cards in %s with board-too-large",
            async (key) => {
                const body = { handIds: [], monsterIds: [], spellIds: [], [key]: [1, 1, 1, 1, 1, 1] };
                const res = await request(app).post(endpoint).send(body);
                expect(res.status).toBe(400);
                expect(res.body.error.code).toBe("board-too-large");
            }
        );

        it("accepts five cards in every zone", async () => {
            const five = [1, 1, 1, 1, 1];
            const res = await request(app)
                .post(endpoint)
                .send({
                    handIds: five,
                    monsterIds: five,
                    spellIds: [FOREST, FOREST, FOREST, FOREST, FOREST],
                });
            expect(res.status).toBe(200);
        });

        it("rejects a known non-monster in monsterIds with invalid-zones", async () => {
            const res = await request(app)
                .post(endpoint)
                .send({ handIds: [], monsterIds: [BABY_DRAGON, FOREST] });
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe("invalid-zones");
        });

        it("rejects a known monster in spellIds with invalid-zones", async () => {
            const res = await request(app)
                .post(endpoint)
                .send({ handIds: [], spellIds: [BABY_DRAGON] });
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe("invalid-zones");
        });

        it("skips unknown ids in the zones instead of rejecting them", async () => {
            const res = await request(app)
                .post(endpoint)
                .send({ handIds: [], monsterIds: [999_999], spellIds: [999_999] });
            expect(res.status).toBe(200);
        });
    });

    it("/api/calculator returns slot references", async () => {
        const res = await request(app)
            .post("/api/calculator")
            .send({ handIds: [TIME_WIZARD], monsterIds: [BABY_DRAGON], spellIds: [] });
        expect(res.body.fusions[0].from).toEqual([
            { zone: "hand", index: 0 },
            { zone: "monster", index: 0 },
        ]);
    });

    it("/api/chain-search returns the field index of a chain that starts on the field", async () => {
        const res = await request(app)
            .post("/api/chain-search")
            .send({ handIds: [TIME_WIZARD], monsterIds: [BABY_DRAGON] });
        expect(res.body.chains[0].fieldIndex).toBe(0);
        expect(res.body.truncated).toBe(false);
    });

    describe.each(ENDPOINTS)("%s with a terrain", (endpoint) => {
        const body = { handIds: [BABY_DRAGON, 41, 45], monsterIds: [], spellIds: [] };

        it.each(["umi", "yami", null])("accepts %s", async (terrain) => {
            const res = await request(app)
                .post(endpoint)
                .send({ ...body, terrain });
            expect(res.status).toBe(200);
        });

        it("treats an absent terrain and a null one as the answer without terrain", async () => {
            const plain = await request(app).post(endpoint).send(body);
            const none = await request(app)
                .post(endpoint)
                .send({ ...body, terrain: null });
            expect(none.text).toBe(plain.text);
        });

        it.each(["lava", "", 5, true, ["umi"], {}])("rejects %j with invalid-options", async (terrain) => {
            const res = await request(app)
                .post(endpoint)
                .send({ ...body, terrain });
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe("invalid-options");
            expect(res.body.error.message).toContain("terrain");
        });
    });

    it("/api/calculator ranks the fusions by the ATK on the terrain and keeps the printed values", async () => {
        const send = { handIds: [BABY_DRAGON, 41, 45], monsterIds: [], spellIds: [] };
        const plain = await request(app).post("/api/calculator").send(send);
        const mountain = await request(app)
            .post("/api/calculator")
            .send({ ...send, terrain: "mountain" });
        expect(plain.body.fusions[0].result.id).toBe(11);
        expect(mountain.body.fusions[0].result.id).toBe(425);
        expect(mountain.body.fusions[0].result.attack).toBe(1600);
    });

    it("/api/chain-search promotes a chain with the terrain", async () => {
        const send = { handIds: [553, 272, 448, 438, 199], monsterIds: [], spellIds: [] };
        const ids = (chains: Array<{ finalCard: { id: number } }>): number[] =>
            chains.map((c) => c.finalCard.id);
        const plain = await request(app).post("/api/chain-search").send(send);
        const wasteland = await request(app)
            .post("/api/chain-search")
            .send({ ...send, terrain: "wasteland" });
        expect(ids(plain.body.chains)).not.toContain(11);
        expect(ids(wasteland.body.chains)).toContain(11);
    });

    it("ignores a terrain in the legacy hand-only mode", async () => {
        const handIds = [BABY_DRAGON, 41, 45];
        const res = await request(app).post("/api/calculator").send({ handIds, terrain: "lava" });
        expect(res.status).toBe(200);
        expect(res.body).toEqual(JSON.parse(JSON.stringify(findCombinations({ handIds }))));
    });
});
