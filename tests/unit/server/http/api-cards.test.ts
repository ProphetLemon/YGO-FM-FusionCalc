import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../../src/server/app.js";

const app = createApp();

describe("GET /api/cards/:id", () => {
    it("returns the card summary", async () => {
        const res = await request(app).get("/api/cards/1");
        expect(res.status).toBe(200);
        expect(res.body.card).toMatchObject({ id: 1, name: "Blue-eyes White Dragon", isMonster: true });
    });

    it("400 on invalid id", async () => {
        const res = await request(app).get("/api/cards/abc");
        expect(res.status).toBe(400);
    });

    it("404 on missing card", async () => {
        const res = await request(app).get("/api/cards/99999");
        expect(res.status).toBe(404);
    });
});

describe("GET /api/cards?name=", () => {
    it("returns the matching card", async () => {
        const res = await request(app).get("/api/cards").query({ name: "blue-eyes white dragon" });
        expect(res.status).toBe(200);
        expect(res.body.card.id).toBe(1);
    });

    it("400 without name", async () => {
        const res = await request(app).get("/api/cards");
        expect(res.status).toBe(400);
    });

    it("404 for unknown name", async () => {
        const res = await request(app).get("/api/cards").query({ name: "not-a-card" });
        expect(res.status).toBe(404);
    });
});
