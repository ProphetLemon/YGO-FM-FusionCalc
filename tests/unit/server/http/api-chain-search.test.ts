import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../../src/server/app.js";

const app = createApp();

describe("POST /api/chain-search", () => {
    it("returns chains array for a fusable pair", async () => {
        const res = await request(app)
            .post("/api/chain-search")
            .send({ handIds: [2, 8] });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.chains)).toBe(true);
        expect(res.body.chains.length).toBeGreaterThan(0);
        expect(res.body.truncated).toBe(false);
    });

    it("returns empty chains for hand with no fusions", async () => {
        const res = await request(app)
            .post("/api/chain-search")
            .send({ handIds: [1, 1] });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ chains: [], truncated: false });
    });

    it("returns empty chains for empty hand", async () => {
        const res = await request(app)
            .post("/api/chain-search")
            .send({ handIds: [] });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ chains: [], truncated: false });
    });

    it("returns the fusion product of the last step as the chain result", async () => {
        const res = await request(app)
            .post("/api/chain-search")
            .send({ handIds: [13, 15, 325] });
        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual(["chains", "truncated"]);
        expect(res.body.chains).toHaveLength(1);
        expect(res.body.chains[0].steps).toHaveLength(1);
        expect(res.body.chains[0].finalCard.name).toBe("Crimson Sunbird");
        expect(res.body.chains[0].finalCard.id).toBe(res.body.chains[0].steps[0].result.id);
    });

    it("flags truncated when a dense hand exhausts the search budget", async () => {
        const denseHand = [635, 157, 649, 425, 244, 561, 215, 353, 172, 555, 138, 154];
        const res = await request(app).post("/api/chain-search").send({ handIds: denseHand });
        expect(res.status).toBe(200);
        expect(res.body.truncated).toBe(true);
        expect(res.body.chains.length).toBeGreaterThan(0);
        expect(res.body.chains.length).toBeLessThanOrEqual(5);
    });

    it("400 on invalid body", async () => {
        const res = await request(app)
            .post("/api/chain-search")
            .send({ handIds: "nope" });
        expect(res.status).toBe(400);
    });

    it("400 with hand-too-large when handIds exceeds limit", async () => {
        const bigHand = Array.from({ length: 13 }, (_, i) => i + 1);
        const res = await request(app)
            .post("/api/chain-search")
            .send({ handIds: bigHand });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("hand-too-large");
    });
});
