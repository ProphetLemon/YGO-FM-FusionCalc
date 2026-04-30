import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../../src/server/app.js";

const app = createApp();

describe("GET /api/fusions/:id", () => {
    it("returns fusions and equips", async () => {
        const res = await request(app).get("/api/fusions/2");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.fusions)).toBe(true);
        expect(Array.isArray(res.body.equips)).toBe(true);
    });

    it("404 on missing card", async () => {
        const res = await request(app).get("/api/fusions/99999");
        expect(res.status).toBe(404);
    });
});

describe("GET /api/results/:id", () => {
    it("returns results array", async () => {
        const res = await request(app).get("/api/results/638");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.results)).toBe(true);
    });

    it("404 on missing card", async () => {
        const res = await request(app).get("/api/results/99999");
        expect(res.status).toBe(404);
    });
});

describe("GET /api/equips/:id", () => {
    it("returns equips array", async () => {
        const res = await request(app).get("/api/equips/1");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.equips)).toBe(true);
    });

    it("404 on missing card", async () => {
        const res = await request(app).get("/api/equips/99999");
        expect(res.status).toBe(404);
    });
});
