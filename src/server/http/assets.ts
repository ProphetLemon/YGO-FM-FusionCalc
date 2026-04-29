import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");

const MANIFEST_PATH = path.join(projectRoot, "public/dist/.vite/manifest.json");

interface ManifestEntry {
    file: string;
    css?: string[];
    isEntry?: boolean;
}

type Manifest = Record<string, ManifestEntry>;

let cached: Manifest | null = null;

function loadManifest(): Manifest {
    if (cached !== null) return cached;
    if (!fs.existsSync(MANIFEST_PATH)) {
        cached = {};
        return cached;
    }
    const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
    cached = JSON.parse(raw) as Manifest;
    return cached;
}

export function resetManifestCache(): void {
    cached = null;
}

export function assetUrl(entry: string): string {
    const manifest = loadManifest();
    const record = manifest[entry];
    if (!record) {
        throw new Error(`Asset entry not found in Vite manifest: ${entry}`);
    }
    return `/public/dist/${record.file}`;
}

export function assetCssUrls(entry: string): readonly string[] {
    const manifest = loadManifest();
    const record = manifest[entry];
    if (!record || !record.css) return [];
    return record.css.map((c) => `/public/dist/${c}`);
}
