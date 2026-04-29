import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { i18nMiddleware } from "../../../../src/server/http/middleware/i18n.js";

function buildApp(): Express {
    const app = express();
    app.use(cookieParser());
    app.use(i18nMiddleware);
    app.get("/probe", (_req, res) => {
        res.json({ lang: res.locals.lang, greeting: res.locals.t("nav.home") });
    });
    return app;
}

describe("i18nMiddleware", () => {
    it("uses cookie lang when present", async () => {
        const res = await request(buildApp()).get("/probe").set("Cookie", "lang=en");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ lang: "en", greeting: "Home" });
    });

    it("uses Accept-Language when no cookie", async () => {
        const res = await request(buildApp()).get("/probe").set("Accept-Language", "en-US,en;q=0.9");
        expect(res.body).toEqual({ lang: "en", greeting: "Home" });
    });

    it("falls back to es when neither cookie nor header is set", async () => {
        const res = await request(buildApp()).get("/probe");
        expect(res.body).toEqual({ lang: "es", greeting: "Inicio" });
    });

    it("ignores unsupported cookie values", async () => {
        const res = await request(buildApp()).get("/probe").set("Cookie", "lang=fr");
        expect(res.body.lang).toBe("es");
    });
});
