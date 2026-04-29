import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/server/config.js";

describe("loadConfig", () => {
    it("parses valid env vars", () => {
        const cfg = loadConfig({
            PORT: "4000",
            NODE_ENV: "production",
            LOG_LEVEL: "warn",
        });
        expect(cfg).toEqual({ port: 4000, nodeEnv: "production", logLevel: "warn" });
    });

    it("falls back to defaults when env vars are missing", () => {
        const cfg = loadConfig({});
        expect(cfg).toEqual({ port: 3000, nodeEnv: "development", logLevel: "info" });
    });

    it("rejects invalid LOG_LEVEL", () => {
        expect(() => loadConfig({ LOG_LEVEL: "verbose" })).toThrow(/Invalid LOG_LEVEL/);
    });

    it("rejects invalid NODE_ENV", () => {
        expect(() => loadConfig({ NODE_ENV: "staging" })).toThrow(/Invalid NODE_ENV/);
    });

    it("rejects non-numeric PORT", () => {
        expect(() => loadConfig({ PORT: "abc" })).toThrow(/Invalid PORT/);
    });

    it("rejects out-of-range PORT", () => {
        expect(() => loadConfig({ PORT: "70000" })).toThrow(/Invalid PORT/);
    });
});
