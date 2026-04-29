import express, { type Express } from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { langRouter } from "../../../../src/server/http/routes/lang.js";

function buildApp(): Express {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(langRouter());
    return app;
}

describe("POST /lang", () => {
    it("sets the cookie and redirects 303 to referer", async () => {
        const res = await request(buildApp())
            .post("/lang")
            .type("form")
            .set("Referer", "/calculator")
            .send("lang=en");
        expect(res.status).toBe(303);
        expect(res.headers.location).toBe("/calculator");
        const setCookie = res.headers["set-cookie"];
        const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
        expect(cookieHeader).toMatch(/lang=en/);
        expect(cookieHeader).toMatch(/Max-Age=/);
        expect(cookieHeader).toMatch(/SameSite=Lax/i);
    });

    it("falls back to / when no referer", async () => {
        const res = await request(buildApp()).post("/lang").type("form").send("lang=es");
        expect(res.status).toBe(303);
        expect(res.headers.location).toBe("/");
    });

    it("rejects unsupported languages with 400", async () => {
        const res = await request(buildApp()).post("/lang").type("form").send("lang=fr");
        expect(res.status).toBe(400);
    });

    it("rejects empty body with 400", async () => {
        const res = await request(buildApp()).post("/lang").type("form").send("");
        expect(res.status).toBe(400);
    });
});
