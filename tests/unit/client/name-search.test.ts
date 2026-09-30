import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { rankNameMatches } from "../../../src/client/lib/name-search.js";

const LIMIT = 8;

interface CardRecord {
    Name: string;
}

// The names of the game, read from the data the server serves instead of made up.
const cardsPath = fileURLToPath(new URL("../../../data/Cards.json", import.meta.url));
const GAME_NAMES: readonly string[] = (JSON.parse(fs.readFileSync(cardsPath, "utf-8")) as CardRecord[]).map(
    (card) => card.Name
);

const byLocale = (a: string, b: string): number => a.localeCompare(b);

describe("rankNameMatches", () => {
    describe("what counts as the same text", () => {
        const names = ["Blue-eyes White Dragon", "Mystical Elf"];

        it.each([
            ["the name as it is written", "Blue-eyes White Dragon"],
            ["lowercase", "blue-eyes white dragon"],
            ["uppercase", "BLUE-EYES WHITE DRAGON"],
            ["the hyphen typed as a space", "blue eyes white dragon"],
            ["the hyphen left out of a partial name", "blue eyes"],
            ["the hyphen kept in a partial name", "blue-eyes"],
            ["extra spaces around and inside", "  blue   eyes  "],
            ["a repeated hyphen", "blue--eyes"],
            ["another mark where the hyphen was", "blue.eyes"],
            ["a mark after the last word", "blue-eyes white dragon!"],
        ])("finds the name with %s", (_label, query) => {
            expect(rankNameMatches(names, query, LIMIT)).toEqual(["Blue-eyes White Dragon"]);
        });

        it.each([
            ["a number sign", "Mystical Sheep #1", "sheep 1"],
            ["an ampersand", "Master & Expert", "expert"],
            ["a comma and a hyphen", "30,000-Year White Turtle", "30 000 year"],
            ["a full stop", "Red-eyes B. Dragon", "b dragon"],
        ])("breaks a name into words at %s", (_label, name, query) => {
            expect(rankNameMatches([name, "Mystical Elf"], query, LIMIT)).toEqual([name]);
        });

        it.each([
            ["the apostrophe left out", "harpies"],
            ["the apostrophe kept", "harpie's"],
            ["a typographic apostrophe", "harpie’s"],
            ["the whole name without the apostrophe", "harpies lady"],
        ])("drops the apostrophe, so a name is found with %s", (_label, query) => {
            const names = ["Harpie's Lady", "Mystical Elf"];

            expect(rankNameMatches(names, query, LIMIT)).toEqual(["Harpie's Lady"]);
        });

        it.each([
            ["accents in the name", "Café Dragon", "cafe dragon"],
            ["accents in the query", "Cafe Dragon", "CAFÉ DRAGON"],
            ["an accent written as a letter and a combining mark", "Café Dragon", "café dragon"],
            ["the tilde of an n", "Ñandú Rey", "nandu"],
        ])("ignores %s", (_label, name, query) => {
            expect(rankNameMatches([name], query, LIMIT)).toEqual([name]);
        });

        it("keeps the letters of other alphabets", () => {
            expect(rankNameMatches(["Ωmega Dragon", "Omega Dragon"], "ωmega", LIMIT)).toEqual([
                "Ωmega Dragon",
            ]);
        });
    });

    describe("the order of the matches", () => {
        it("ranks exact, prefix, word-start and substring matches in that order", () => {
            const names = [
                "Waterdragon Fairy",
                "Red Dragon",
                "Dragon Zombie",
                "Dragon",
                "Baby-dragon",
                "Aqua Dragon",
                "Dragon Piper",
                "Mystical Elf",
            ];

            expect(rankNameMatches(names, "dragon", LIMIT)).toEqual([
                "Dragon",
                "Dragon Piper",
                "Dragon Zombie",
                "Aqua Dragon",
                "Baby-dragon",
                "Red Dragon",
                "Waterdragon Fairy",
            ]);
        });

        it("ranks the exact name above a prefix match that sorts before it", () => {
            // The space sorts before the mark, so alphabetically "Dragon Piper" would come first.
            expect(rankNameMatches(["Dragon Piper", "Dragon!"], "dragon", LIMIT)).toEqual([
                "Dragon!",
                "Dragon Piper",
            ]);
        });

        it("ranks a name that starts with the query above one that only has a word that does", () => {
            expect(rankNameMatches(["Aqua Dragon", "Dragon Zombie"], "dragon", LIMIT)).toEqual([
                "Dragon Zombie",
                "Aqua Dragon",
            ]);
        });

        it("ranks a word start above a hit in the middle of a word", () => {
            expect(rankNameMatches(["Waterdragon Fairy", "Zed Dragon"], "dragon", LIMIT)).toEqual([
                "Zed Dragon",
                "Waterdragon Fairy",
            ]);
        });

        it("finds a query that spans several words at a word start", () => {
            const names = ["Blue-eyes White Dragon", "Blue-eyes Ultimate Dragon", "Red-eyes B. Dragon"];

            expect(rankNameMatches(names, "eyes wh", LIMIT)).toEqual(["Blue-eyes White Dragon"]);
            expect(rankNameMatches(names, "ue eyes", LIMIT)).toEqual([
                "Blue-eyes Ultimate Dragon",
                "Blue-eyes White Dragon",
            ]);
        });

        it("sorts the names of a tier alphabetically whatever order they came in", () => {
            const names = ["Dragon Zombie", "Dragon Capture Jar", "Dragon Seeker", "Dragon Piper"];
            const sorted = ["Dragon Capture Jar", "Dragon Piper", "Dragon Seeker", "Dragon Zombie"];

            expect(rankNameMatches(names, "dragon", LIMIT)).toEqual(sorted);
            expect(rankNameMatches([...names].reverse(), "dragon", LIMIT)).toEqual(sorted);
        });

        it("sorts a tier by the name as it is written, not by the text it is compared as", () => {
            // Compared as text they are "dragon a" and "dragon b", but the space sorts before the hyphen.
            expect(rankNameMatches(["Dragon-a", "Dragon b"], "dragon", LIMIT)).toEqual([
                "Dragon b",
                "Dragon-a",
            ]);
        });

        it("gives names that compare equal one fixed order", () => {
            const composed = "Café Dragon";
            const decomposed = "Café Dragon";
            expect(composed.localeCompare(decomposed)).toBe(0);

            expect(rankNameMatches([composed, decomposed], "cafe dragon", LIMIT)).toEqual([
                decomposed,
                composed,
            ]);
            expect(rankNameMatches([decomposed, composed], "cafe dragon", LIMIT)).toEqual([
                decomposed,
                composed,
            ]);
        });
    });

    describe("the limit", () => {
        // The only name that starts with the query comes last in the list.
        const names = ["Aqua Dragon", "Baby Dragon", "Blue Dragon", "Dragon Piper"];

        it("cuts the ranked list, so the best matches stay", () => {
            expect(rankNameMatches(names, "dragon", 1)).toEqual(["Dragon Piper"]);
            expect(rankNameMatches(names, "dragon", 2)).toEqual(["Dragon Piper", "Aqua Dragon"]);
        });

        it.each([4, 5, 100, Infinity])("returns every match when the limit is %s", (limit) => {
            expect(rankNameMatches(names, "dragon", limit)).toEqual([
                "Dragon Piper",
                "Aqua Dragon",
                "Baby Dragon",
                "Blue Dragon",
            ]);
        });

        it("counts whole names", () => {
            expect(rankNameMatches(names, "dragon", 2.9)).toHaveLength(2);
        });

        it.each([0, -1, -Infinity, NaN, 0.5])("returns nothing for a limit of %s", (limit) => {
            expect(rankNameMatches(names, "dragon", limit)).toEqual([]);
        });
    });

    describe("a query without text", () => {
        const names = ["Mystical Sheep #1", "Blue-eyes White Dragon", "Dragon"];

        it.each([
            ["nothing", ""],
            ["spaces", "   "],
            ["a tab and a line break", "\t\n"],
            ["a hyphen", "-"],
            ["marks and spaces", "  #?! "],
        ])("returns nothing for %s", (_label, query) => {
            expect(rankNameMatches(names, query, LIMIT)).toEqual([]);
        });
    });

    describe("the names it is given", () => {
        it("returns nothing when no name matches", () => {
            expect(rankNameMatches(["Mystical Elf", "Mushroom Man"], "dragon", LIMIT)).toEqual([]);
        });

        it("returns nothing for an empty list", () => {
            expect(rankNameMatches([], "dragon", LIMIT)).toEqual([]);
        });

        it("lists a name once however often it comes", () => {
            const names = ["Dragon", "Dragon Piper", "Dragon", "Dragon Piper"];

            expect(rankNameMatches(names, "dragon", LIMIT)).toEqual(["Dragon", "Dragon Piper"]);
        });

        it("does not spend the limit on repeats", () => {
            const names = ["Dragon", "Dragon", "Dragon", "Dragon Piper"];

            expect(rankNameMatches(names, "dragon", 2)).toEqual(["Dragon", "Dragon Piper"]);
        });

        it("keeps apart names that only look alike", () => {
            const names = ["Blue-eyes White Dragon", "Blue Eyes White Dragon"];

            expect(rankNameMatches(names, "blue eyes white dragon", LIMIT)).toEqual([
                "Blue Eyes White Dragon",
                "Blue-eyes White Dragon",
            ]);
        });

        it("leaves the list alone and returns a new array", () => {
            const names = Object.freeze(["Dragon Zombie", "Aqua Dragon", "Dragon Piper"]);

            const ranked = rankNameMatches(names, "dragon", LIMIT);

            expect(names).toEqual(["Dragon Zombie", "Aqua Dragon", "Dragon Piper"]);
            expect(ranked).not.toBe(names);
        });
    });

    describe("with the card names of the game", () => {
        const rank = (query: string, limit = LIMIT): string[] => rankNameMatches(GAME_NAMES, query, limit);

        it.each(["blue eyes", "blue-eyes", "BLUE EYES", "Blue-Eyes", "  blue   eyes "])(
            "finds the Blue-eyes cards for %j",
            (query) => {
                expect(rank(query)).toEqual(["Blue-eyes Ultimate Dragon", "Blue-eyes White Dragon"]);
            }
        );

        it("puts the names that start with 'dragon' before the ones that only contain it", () => {
            const startWithDragon = GAME_NAMES.filter((name) =>
                name.toLowerCase().startsWith("dragon")
            ).sort(byLocale);

            const ranked = rank("dragon", GAME_NAMES.length);

            expect(startWithDragon.length).toBeGreaterThan(0);
            expect(ranked.slice(0, startWithDragon.length)).toEqual(startWithDragon);
            for (const name of ranked.slice(startWithDragon.length)) {
                expect(name.toLowerCase().startsWith("dragon"), name).toBe(false);
            }
        });

        it("lists Blue-eyes White Dragon for 'dragon' as soon as the limit reaches it", () => {
            const position = rank("dragon", GAME_NAMES.length).indexOf("Blue-eyes White Dragon");

            expect(position).toBeGreaterThan(-1);
            expect(rank("dragon", position + 1).at(-1)).toBe("Blue-eyes White Dragon");
            expect(rank("dragon", position)).not.toContain("Blue-eyes White Dragon");
        });

        it("lists the names that only contain 'mush' after the ones that start with it", () => {
            expect(rank("mush")).toEqual([
                "Mushroom Man",
                "Mushroom Man #2",
                "Kagemusha of the Blue Flame",
                "Minomushi Warrior",
            ]);
        });

        it("suggests a word start after the names that start with the query", () => {
            expect(rank("eyes")).toEqual([
                "Blue-eyes Ultimate Dragon",
                "Blue-eyes White Dragon",
                "Red-eyes B. Dragon",
            ]);
        });

        it.each([
            ["as it is written", (name: string) => name],
            [
                "in capitals with spaces for the marks",
                (name: string) => name.toUpperCase().replace(/[^A-Z0-9']+/g, " "),
            ],
        ])("puts a card first when its whole name is typed %s", (_label, type) => {
            const misplaced = GAME_NAMES.filter((name) => rank(type(name))[0] !== name);

            expect(misplaced).toEqual([]);
        });

        it("finds every name with an apostrophe when it is typed without it", () => {
            const withApostrophe = GAME_NAMES.filter((name) => name.includes("'"));

            expect(withApostrophe.length).toBeGreaterThan(0);
            for (const name of withApostrophe) {
                expect(rank(name.replace(/'/g, ""))[0], name).toBe(name);
            }
        });

        it("never returns more than the limit, a repeat or a name the game does not have", () => {
            const known = new Set(GAME_NAMES);

            for (const query of ["d", "dr", "dra", "a", "the", "of", "man", "1", "e", "ll", "#2", "z"]) {
                const ranked = rank(query);
                expect(ranked.length, query).toBeLessThanOrEqual(LIMIT);
                expect(new Set(ranked).size, query).toBe(ranked.length);
                for (const name of ranked) expect(known.has(name), name).toBe(true);
            }
        });

        it("gives the same list whatever order the names come in", () => {
            const reversed = [...GAME_NAMES].reverse();

            for (const query of ["dragon", "mush", "blue eyes", "a", "the", "1"]) {
                expect(rankNameMatches(reversed, query, LIMIT), query).toEqual(rank(query));
            }
        });
    });
});
