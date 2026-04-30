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

    it("renders calculator page with dynamic slots container", async () => {
        const res = await request(app).get("/calculator");
        expect(res.status).toBe(200);
        expect(res.text).toContain('id="hand-slots"');
        expect(res.text).toContain('id="addSlotBtn"');
        expect(res.text).not.toContain("/public/javascripts/fusionCalc.js");
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
