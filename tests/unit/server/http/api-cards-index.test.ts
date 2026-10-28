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

    it("carries what a page needs to draw each card", async () => {
        const res = await request(app).get("/api/cards-index");
        const byName = new Map<string, Record<string, unknown>>(
            res.body.cards.map((card: { name: string }) => [card.name, card])
        );
        expect(byName.get("Blue-eyes White Dragon")).toMatchObject({
            typeName: "Dragon",
            attack: 3000,
            defense: 2500,
            isMonster: true,
        });
        const spell = res.body.cards.find((card: { isMonster: boolean }) => !card.isMonster);
        expect(spell).toMatchObject({ isMonster: false, attack: expect.any(Number) });
        expect(Object.keys(res.body.cards[0]).sort()).toEqual([
            "attack",
            "defense",
            "id",
            "imageCode",
            "isMonster",
            "name",
            "type",
            "typeName",
        ]);
    });
});
