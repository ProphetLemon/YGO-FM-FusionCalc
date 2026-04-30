import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../../src/server/app.js";

const app = createApp();

describe("GET /api/cards-index", () => {
    it("returns sorted card index", async () => {
        const res = await request(app).get("/api/cards-index");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.cards)).toBe(true);
        expect(res.body.cards.length).toBeGreaterThan(700);
        const first = res.body.cards[0];
        expect(typeof first.id).toBe("number");
        expect(typeof first.name).toBe("string");
        expect(typeof first.type).toBe("number");
    });
});
