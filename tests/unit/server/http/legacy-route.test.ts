import express, { type Express } from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { legacyRedirectsRouter } from "../../../../src/server/http/routes/legacy.js";

function buildApp(): Express {
    const app = express();
    app.use(legacyRedirectsRouter());
    return app;
}

describe("legacy redirects", () => {
    const cases = [
        { from: "/index.html", to: "/" },
        { from: "/fusion-search.html", to: "/search" },
        { from: "/fusion-calculator.html", to: "/calculator" },
        { from: "/about.html", to: "/about" },
    ];

    for (const { from, to } of cases) {
        it(`redirects ${from} → ${to} with status 301`, async () => {
            const res = await request(buildApp()).get(from);
            expect(res.status).toBe(301);
            expect(res.headers.location).toBe(to);
        });
    }
});
