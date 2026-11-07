import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../../src/server/app.js";

describe("view routes", () => {
    const app = createApp();

    it("renders home with default es", async () => {
        const res = await request(app).get("/");
        expect(res.status).toBe(200);
        expect(res.text).toContain('<html lang="es"');
        expect(res.text).toContain("Calculadora de Fusiones");
    });

    it("renders home in en when Accept-Language asks for it", async () => {
        const res = await request(app).get("/").set("Accept-Language", "en-US,en;q=0.9");
        expect(res.status).toBe(200);
        expect(res.text).toContain('<html lang="en"');
        expect(res.text).toContain("Yu-Gi-Oh! Forbidden Memories Fusion Calculator");
    });

    it("renders search page", async () => {
        const res = await request(app).get("/search");
        expect(res.status).toBe(200);
        expect(res.text).toContain('id="cardname"');
        expect(res.text).not.toContain("/public/styles/bootstrap.min.css");
        expect(res.text).not.toContain("/public/javascripts/fusionSearch.js");
    });

    it("renders the calculator page with its three zones and no way to add slots", async () => {
        const res = await request(app).get("/calculator");
        expect(res.status).toBe(200);
        for (const zone of ["hand", "monster", "spell"]) {
            expect(res.text).toContain(`id="zone-${zone}"`);
            expect(res.text).toContain(`id="zone-${zone}-title"`);
        }
        expect(res.text).toContain('id="board-count"');
        expect(res.text).toContain('id="resetBtn"');
        expect(res.text).not.toContain('id="addSlotBtn"');
        expect(res.text).not.toContain('id="hand-meter"');
        expect(res.text).not.toContain("/public/javascripts/fusionCalc.js");
    });

    it("renders the best deck page with a labelled file input and the navbar link", async () => {
        const res = await request(app).get("/deck");
        expect(res.status).toBe(200);
        expect(res.text).toContain('id="deck-file"');
        expect(res.text).toContain('for="deck-file"');
        expect(res.text).toContain('id="deck-compute"');
        expect(res.text).toMatch(/<a\s+href="\/deck"\s+class="[^"]*"\s+aria-current="page"/);
    });

    it("renders about page", async () => {
        const res = await request(app).get("/about");
        expect(res.status).toBe(200);
        expect(res.text.toLowerCase()).toContain("acerca");
    });

    it("returns 404 for unknown routes", async () => {
        const res = await request(app).get("/does-not-exist");
        expect(res.status).toBe(404);
    });
});
