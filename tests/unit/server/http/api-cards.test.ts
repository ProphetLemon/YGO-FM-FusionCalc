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

describe("the artwork code of a card summary", () => {
    it("names the file the CDN has and leaves the password as the game spells it", async () => {
        const res = await request(app).get("/api/cards").query({ name: "Mountain Warrior" });
        expect(res.body.card).toMatchObject({ password: "04931562", imageCode: "4931562" });
    });

    it("names the file of a card with no password through the override list", async () => {
        const res = await request(app).get("/api/cards/374");
        expect(res.body.card).toMatchObject({ password: "00000000", imageCode: "25833572" });
    });

    it("is null for a card with no artwork at all", async () => {
        const res = await request(app).get("/api/cards/715");
        expect(res.body.card).toMatchObject({ password: "00000000", imageCode: null });
    });
});
