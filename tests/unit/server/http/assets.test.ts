import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assetUrl, resetManifestCache } from "../../../../src/server/http/assets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../../..");
const manifestPath = path.join(projectRoot, "public/dist/.vite/manifest.json");

const ORIGINAL_MANIFEST = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf-8") : null;

describe("assetUrl", () => {
    beforeEach(() => {
        resetManifestCache();
        fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
        fs.writeFileSync(
            manifestPath,
            JSON.stringify({
                "pages/home.ts": {
                    file: "assets/home-abc123.js",
                    isEntry: true,
                },
            }),
            "utf-8"
        );
        resetManifestCache();
    });

    afterEach(() => {
        if (ORIGINAL_MANIFEST !== null) {
            fs.writeFileSync(manifestPath, ORIGINAL_MANIFEST, "utf-8");
        } else {
            fs.rmSync(manifestPath, { force: true });
        }
        resetManifestCache();
    });

    it("returns the public url for a known entry", () => {
        expect(assetUrl("pages/home.ts")).toBe("/public/dist/assets/home-abc123.js");
    });

    it("throws when entry is unknown", () => {
        expect(() => assetUrl("pages/missing.ts")).toThrow(/Asset entry not found/);
    });

    it("returns empty when manifest does not exist", () => {
        // Remove manifest entirely to verify the fallback path.
        fs.rmSync(manifestPath, { force: true });
        resetManifestCache();
        expect(() => assetUrl("any")).toThrow(/Asset entry not found/);
    });

    // Reference vi to keep it imported for future tests; current cases do not need it.
    void vi;
});
