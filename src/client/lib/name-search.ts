// Names and queries compare as lowercase words with single spaces between them: accents, punctuation and
// spacing do not tell "Blue-eyes White Dragon" from "blue eyes white dragon". An apostrophe is dropped
// instead of splitting the word, so "harpies" finds "Harpie's Lady".
function normalise(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}+/gu, "")
        .replace(/['’]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

// In rank order: the name is the query, starts with it, has a word that starts with it, or contains it.
const TIERS: ReadonlyArray<(name: string, query: string) => boolean> = [
    (name, query) => name === query,
    (name, query) => name.startsWith(query),
    (name, query) => name.includes(` ${query}`),
    (name, query) => name.includes(query),
];

function compareNames(a: string, b: string): number {
    const byLocale = a.localeCompare(b);
    if (byLocale !== 0) return byLocale;
    // Names that only differ in how an accent is encoded compare equal: give them one fixed order anyway.
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

// The original names that match the query, best tier first and alphabetical inside a tier, at most `limit`.
export function rankNameMatches(names: readonly string[], query: string, limit: number): string[] {
    const wanted = normalise(query);
    if (wanted === "" || !(limit > 0)) return [];

    const matches: Array<{ name: string; tier: number }> = [];
    const seen = new Set<string>();
    for (const name of names) {
        if (seen.has(name)) continue;
        seen.add(name);
        const normalised = normalise(name);
        const tier = TIERS.findIndex((isMatch) => isMatch(normalised, wanted));
        if (tier !== -1) matches.push({ name, tier });
    }
    matches.sort((a, b) => a.tier - b.tier || compareNames(a.name, b.name));
    return matches.slice(0, limit).map((match) => match.name);
}
