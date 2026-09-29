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
        expect(Array.isArray(res.body.rituals)).toBe(true);
    });

    it("returns the ritual a complete recipe in the hand makes", async () => {
        const res = await request(app)
            .post("/api/calculator")
            .send({ handIds: [666, 29, 31, 101] });
        expect(res.status).toBe(200);
        expect(res.body.rituals).toHaveLength(1);
        const [ritual] = res.body.rituals;
        expect(Object.keys(ritual).sort()).toEqual(["materials", "result", "ritualCard"]);
        expect(ritual.ritualCard).toMatchObject({ id: 666, name: "Yamadron Ritual" });
        expect(ritual.materials.map((card: { id: number }) => card.id)).toEqual([29, 31, 101]);
        expect(ritual.result).toMatchObject({ id: 357, name: "Yamadron", attack: 1600 });
    });

    it("returns no rituals when a piece of the recipe is missing", async () => {
        const res = await request(app)
            .post("/api/calculator")
            .send({ handIds: [666, 29, 31] });
        expect(res.status).toBe(200);
        expect(res.body.rituals).toEqual([]);
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
        expect(res.body).toEqual({ fusions: [], equips: [], rituals: [] });
    });
});
