import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../../src/server/app.js";

const app = createApp();

describe("POST /api/calculator", () => {
    it("returns combinations for a hand", async () => {
        const res = await request(app)
            .post("/api/calculator")
            .send({ handIds: [2, 8] });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.fusions)).toBe(true);
        expect(Array.isArray(res.body.equips)).toBe(true);
    });

    it("400 on invalid body", async () => {
        const res = await request(app).post("/api/calculator").send({ handIds: "nope" });
        expect(res.status).toBe(400);
    });

    it("400 with non-numeric ids", async () => {
        const res = await request(app)
            .post("/api/calculator")
            .send({ handIds: [1, "two", 3] });
        expect(res.status).toBe(400);
    });

    it("returns empty arrays for empty hand", async () => {
        const res = await request(app).post("/api/calculator").send({ handIds: [] });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ fusions: [], equips: [] });
    });
});
