import enCatalog from "./en.json" with { type: "json" };
import esCatalog from "./es.json" with { type: "json" };

export const SUPPORTED_LANGS = ["es", "en"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const DEFAULT_LANG: Lang = "es";

const catalogs = {
    es: esCatalog,
    en: enCatalog,
} as const;

export type TranslationKey = keyof typeof esCatalog;

export interface TranslateOptions {
    strict?: boolean;
}

export type TranslateVars = Readonly<Record<string, string | number>>;

export function isLang(value: unknown): value is Lang {
    return typeof value === "string" && (SUPPORTED_LANGS as readonly string[]).includes(value);
}

export function getCatalog(lang: Lang): Readonly<Record<string, string>> {
    return catalogs[lang];
}

export function translate(
    key: TranslationKey,
    lang: Lang,
    vars?: TranslateVars,
    opts: TranslateOptions = {}
): string {
    const catalog = catalogs[lang] as Readonly<Record<string, string>>;
    const raw = catalog[key];
    if (raw === undefined) {
        if (opts.strict) {
            throw new Error(`Missing translation key "${String(key)}" in lang "${lang}"`);
        }
        return `[${String(key)}]`;
    }
    if (!vars) return raw;
    return raw.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
        const v = vars[name];
        return v === undefined ? match : String(v);
    });
}

const Q_VALUE = /^q=([\d.]+)$/;

export function parseAcceptLanguage(header: string | undefined): Lang | null {
    if (!header) return null;
    const candidates = header
        .split(",")
        .map((entry) => {
            const parts = entry
                .trim()
                .split(";")
                .map((p) => p.trim());
            const tag = (parts[0] ?? "").toLowerCase();
            const qPart = parts.find((p) => Q_VALUE.test(p));
            const q = qPart ? Number.parseFloat(qPart.slice(2)) : 1;
            return { tag, q };
        })
        .filter((c) => c.tag.length > 0)
        .sort((a, b) => b.q - a.q);
    for (const candidate of candidates) {
        const primary = candidate.tag.split("-")[0];
        if (primary && isLang(primary)) return primary;
    }
    return null;
}
