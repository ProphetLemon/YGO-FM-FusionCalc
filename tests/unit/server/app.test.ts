import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../../src/server/app.js";

// The domain call is the one place a valid request can be made to fail on purpose.
const { findCombinations } = vi.hoisted(() => ({ findCombinations: vi.fn() }));
vi.mock("../../../src/server/domain/calculator.js", () => ({ findCombinations }));

const app = createApp();

function failWith(error: unknown): void {
    findCombinations.mockImplementationOnce(() => {
        throw error;
    });
}

function postValidHand() {
    return request(app)
        .post("/api/calculator")
        .send({ handIds: [2, 8] });
}

describe("error handler", () => {
    beforeEach(() => {
        findCombinations.mockReset();
    });

    describe("on /api", () => {
        it("answers 500 with a generic JSON error and hides an unexpected failure", async () => {
            failWith(new Error("secret internal detail"));
            const res = await postValidHand();
            expect(res.status).toBe(500);
            expect(res.type).toBe("application/json");
            expect(res.body).toEqual({
                error: { code: "internal-error", message: "Internal server error" },
            });
            expect(res.text).not.toContain("secret internal detail");
        });

        it("answers 500 when the thrown value is not an Error", async () => {
            failWith("secret internal detail");
            const res = await postValidHand();
            expect(res.status).toBe(500);
            expect(res.body).toEqual({
                error: { code: "internal-error", message: "Internal server error" },
            });
        });

        it.each([
            ["a 5xx status", { status: 503 }],
            ["a success status", { status: 200 }],
            ["a redirect status", { status: 302 }],
            ["an out-of-range status", { status: 600 }],
            ["a fractional status", { status: 404.5 }],
            ["a text status", { status: "404" }],
            ["a NaN statusCode", { statusCode: Number.NaN }],
        ])("answers 500 when the error carries %s", async (_name, fields) => {
            failWith(Object.assign(new Error("secret internal detail"), fields));
            const res = await postValidHand();
            expect(res.status).toBe(500);
            expect(res.body.error.code).toBe("internal-error");
        });

        it.each([
            ["status", { status: 409 }, 409, "conflict", "Conflict"],
            ["statusCode", { statusCode: 403 }, 403, "forbidden", "Forbidden"],
            ["a status Node has no name for", { status: 499 }, 499, "bad-request", "Bad Request"],
        ])("keeps the 4xx carried by %s", async (_name, fields, status, code, message) => {
            failWith(Object.assign(new Error("secret internal detail"), fields));
            const res = await postValidHand();
            expect(res.status).toBe(status);
            expect(res.body).toEqual({ error: { code, message } });
        });

        it("keeps the 400 Express raises for a malformed path parameter", async () => {
            const res = await request(app).get("/api/cards/%E0%A4%A");
            expect(res.status).toBe(400);
            expect(res.body).toEqual({ error: { code: "bad-request", message: "Bad Request" } });
        });

        // The JSON parser only takes utf-* charsets; the urlencoded one below only utf-8 and iso-8859-1.
        it("keeps the 415 body-parser raises for an unsupported charset", async () => {
            const res = await request(app)
                .post("/api/calculator")
                .set("Content-Type", "application/json; charset=iso-8859-1")
                .send('{"handIds": [2, 8]}');
            expect(res.status).toBe(415);
            expect(res.body).toEqual({
                error: { code: "unsupported-media-type", message: "Unsupported Media Type" },
            });
        });

        it("answers a malformed JSON body with a fixed message, not the parser's", async () => {
            const res = await request(app).post("/api/calculator").type("json").send('{"handIds": [1, 2');
            expect(res.status).toBe(400);
            expect(res.body).toEqual({
                error: { code: "invalid-json", message: "Request body must be valid JSON" },
            });
        });

        it("uses the JSON shape for upper-case /API paths too", async () => {
            const res = await request(app).post("/API/calculator").type("json").send("{bad");
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe("invalid-json");
        });
    });

    describe("outside /api", () => {
        it("keeps the plain-text 500 for an unexpected error", async () => {
            const brokenApp = createApp();
            brokenApp.set("views", "/nonexistent-views-directory");
            const res = await request(brokenApp).get("/about");
            expect(res.status).toBe(500);
            expect(res.type).toBe("text/plain");
            expect(res.text).toBe("Internal server error");
        });

        it("keeps the status of a client error and answers it as plain text", async () => {
            const res = await request(app)
                .post("/lang")
                .set("Content-Type", "application/x-www-form-urlencoded; charset=utf-16")
                .send("lang=en");
            expect(res.status).toBe(415);
            expect(res.type).toBe("text/plain");
            expect(res.text).toBe("Unsupported Media Type");
        });
    });
});
