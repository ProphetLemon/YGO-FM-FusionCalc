import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

// Names of the game, looked up in data/Cards.json instead of guessed.
const BLUE_EYES_WHITE_DRAGON = "Blue-eyes White Dragon";
const BLUE_EYES_ULTIMATE_DRAGON = "Blue-eyes Ultimate Dragon";
const BLUE_EYES = [BLUE_EYES_ULTIMATE_DRAGON, BLUE_EYES_WHITE_DRAGON];
const MUSHROOM_MAN = "Mushroom Man";
const MUSHROOM_MAN_2 = "Mushroom Man #2";
// "mushroom": the two names that start with it and nothing else, the list the autocomplete gave before it
// ranked matches. The specs of what did not change use it, so they hold for both versions.
const MUSHROOM = "mushroom";
const MUSHROOMS = [MUSHROOM_MAN, MUSHROOM_MAN_2];
const KAGEMUSHA = "Kagemusha of the Blue Flame";
const MINOMUSHI = "Minomushi Warrior";
// "mush": the same two names, then two that only have the text inside a word.
const MUSH = [...MUSHROOMS, KAGEMUSHA, MINOMUSHI];
// "dragon": seven names start with it and the eighth suggestion is the first name with a word that does.
// Blue-eyes White Dragon comes after these, so it is not among the eight.
const DRAGON = [
    "Dragon Capture Jar",
    "Dragon Piper",
    "Dragon Seeker",
    "Dragon Statue",
    "Dragon Treasure",
    "Dragon Zombie",
    "Dragoness the Wicked Knight",
    "Aqua Dragon",
];
const MAX_SUGGESTIONS = 8;

// Where the page keeps the card index once it has it (src/client/lib/api.ts).
const CARDS_INDEX_KEY = "ygo-fm:cards-index";

const isCardsIndex = (url: URL): boolean => url.pathname === "/api/cards-index";

test.beforeEach(async ({ page }) => {
    // The specs check the suggestions, not the artwork, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

function options(page: Page): Locator {
    return page.getByRole("option");
}

// The suggestion under the keyboard highlight, the only one drawn on the ink background.
function highlighted(page: Page): Locator {
    return page.locator("[role='option'].bg-wb-ink");
}

function slotInput(page: Page, index: number): Locator {
    return page.locator(".hand-slot").nth(index).locator("input");
}

function slotName(page: Page, index: number): Locator {
    return page.locator(".hand-slot").nth(index).locator(".slot-name");
}

function searchInput(page: Page): Locator {
    return page.locator("#cardname");
}

// The card the search shows: the title of the first card summary.
function searchedCard(page: Page): Locator {
    return page.locator("#outputcard h5").first();
}

// Holds every matching request until the test lets it go, so the test decides when the answer comes.
async function holdRequests(page: Page, matches: (url: URL) => boolean): Promise<Route[]> {
    const held: Route[] = [];
    await page.route(matches, (route) => {
        held.push(route);
    });
    return held;
}

// The page drops a request it no longer wants, and then there is nothing left to let through.
async function release(route: Route | undefined): Promise<void> {
    if (!route) throw new Error("no request was held");
    await route.continue().catch(() => undefined);
}

// The page stores the index the moment it has it, and the suggestions that waited for it run right after in
// the same turn of the event loop: once it is stored nothing that waited for it is still pending.
async function waitForIndexStored(page: Page): Promise<void> {
    await expect
        .poll(() => page.evaluate((key) => window.sessionStorage.getItem(key) !== null, CARDS_INDEX_KEY))
        .toBe(true);
}

interface Selection {
    readonly how: string;
    readonly typed: string;
    readonly picks: string;
    readonly act: (page: Page, input: Locator) => Promise<void>;
}

const pressKeys =
    (...keys: string[]) =>
    async (_page: Page, input: Locator): Promise<void> => {
        for (const key of keys) await input.press(key);
    };

const clickOption = (name: string) => (page: Page) =>
    page.getByRole("option", { name, exact: true }).click();

// Every way to pick a suggestion of "mushroom", and the one each of them picks.
const PICKS_OF_MUSHROOM: readonly Selection[] = [
    { how: "Enter", typed: MUSHROOM, picks: MUSHROOM_MAN, act: pressKeys("Enter") },
    {
        how: "ArrowDown and Enter",
        typed: MUSHROOM,
        picks: MUSHROOM_MAN_2,
        act: pressKeys("ArrowDown", "Enter"),
    },
    {
        how: "ArrowDown, ArrowUp and Enter",
        typed: MUSHROOM,
        picks: MUSHROOM_MAN,
        act: pressKeys("ArrowDown", "ArrowUp", "Enter"),
    },
    { how: "Tab", typed: MUSHROOM, picks: MUSHROOM_MAN, act: pressKeys("Tab") },
    { how: "a click", typed: MUSHROOM, picks: MUSHROOM_MAN_2, act: clickOption(MUSHROOM_MAN_2) },
];

// The picks that only exist since names that merely contain the text are suggested too.
const PICKS_OF_OTHER_MATCHES: readonly Selection[] = [
    {
        how: "ArrowDown three times and Enter",
        typed: "mush",
        picks: MINOMUSHI,
        act: pressKeys("ArrowDown", "ArrowDown", "ArrowDown", "Enter"),
    },
    {
        how: "a click on a name that only contains the text",
        typed: "mush",
        picks: KAGEMUSHA,
        act: clickOption(KAGEMUSHA),
    },
    {
        how: "a click on a name typed without its hyphen",
        typed: "blue eyes",
        picks: BLUE_EYES_WHITE_DRAGON,
        act: clickOption(BLUE_EYES_WHITE_DRAGON),
    },
];

const SELECTIONS: readonly Selection[] = [...PICKS_OF_MUSHROOM, ...PICKS_OF_OTHER_MATCHES];

test.describe("on the calculator", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/calculator");
    });

    test.describe("the suggestions", () => {
        test("match the words of a name, not only its start", async ({ page }) => {
            await slotInput(page, 0).fill("blue eyes");

            await expect(options(page)).toHaveText(BLUE_EYES);
        });

        for (const typed of ["BLUE EYES", "blue-eyes", "Blue--Eyes", "  blue   eyes  "]) {
            test(`ignore case, hyphens and extra spaces in ${JSON.stringify(typed)}`, async ({ page }) => {
                await slotInput(page, 0).fill(typed);

                await expect(options(page)).toHaveText(BLUE_EYES);
            });
        }

        test("follow the typing key by key", async ({ page }) => {
            await slotInput(page, 0).pressSequentially("blue eyes");

            await expect(options(page)).toHaveText(BLUE_EYES);
        });

        test("list the names that start with the text before the ones that only contain it", async ({
            page,
        }) => {
            await slotInput(page, 0).fill("mush");

            await expect(options(page)).toHaveText(MUSH);
        });

        test("stop at eight, the names that start with the text first", async ({ page }) => {
            await slotInput(page, 0).fill("dragon");

            await expect(options(page)).toHaveCount(MAX_SUGGESTIONS);
            await expect(options(page)).toHaveText(DRAGON);
        });

        test("put the card whose whole name was typed first", async ({ page }) => {
            await slotInput(page, 0).fill(MUSHROOM_MAN);

            await expect(options(page)).toHaveText(MUSHROOMS);
            await expect(highlighted(page)).toHaveText(MUSHROOM_MAN);
        });

        test("open under the slot that is being typed in", async ({ page }) => {
            await slotInput(page, 1).fill(MUSHROOM);

            await expect(page.locator(".hand-slot").nth(1).getByRole("option")).toHaveText(MUSHROOMS);
            await expect(options(page)).toHaveCount(MUSHROOMS.length);
        });

        test("close when nothing matches any more", async ({ page }) => {
            const input = slotInput(page, 0);
            await input.fill(MUSHROOM);
            await expect(options(page)).toHaveText(MUSHROOMS);

            await input.fill("zzzz");

            await expect(options(page)).toHaveCount(0);
            await expect(input).toHaveAttribute("aria-expanded", "false");
        });

        test("close when the text is erased", async ({ page }) => {
            const input = slotInput(page, 0);
            await input.fill(MUSHROOM);
            await expect(options(page)).toHaveText(MUSHROOMS);

            await input.fill("");

            await expect(options(page)).toHaveCount(0);
            await expect(input).toHaveAttribute("aria-expanded", "false");
        });
    });

    test.describe("the keyboard highlight", () => {
        test("starts on the first suggestion and follows the arrow keys without leaving the list", async ({
            page,
        }) => {
            const input = slotInput(page, 0);
            await input.fill(MUSHROOM);
            await expect(options(page)).toHaveText(MUSHROOMS);
            await expect(highlighted(page)).toHaveText(MUSHROOM_MAN);

            await input.press("ArrowUp");
            await expect(highlighted(page)).toHaveText(MUSHROOM_MAN);
            await input.press("ArrowDown");
            await expect(highlighted(page)).toHaveText(MUSHROOM_MAN_2);
            await input.press("ArrowDown");
            await expect(highlighted(page)).toHaveText(MUSHROOM_MAN_2);
            await input.press("ArrowUp");
            await expect(highlighted(page)).toHaveText(MUSHROOM_MAN);
        });

        test("goes down to the last suggestion, a name that only contains the text", async ({ page }) => {
            const input = slotInput(page, 0);
            await input.fill("mush");
            await expect(options(page)).toHaveText(MUSH);

            for (let press = 0; press < MUSH.length + 2; press++) await input.press("ArrowDown");

            await expect(highlighted(page)).toHaveText(MINOMUSHI);
        });

        test("goes back to the first suggestion when the text changes", async ({ page }) => {
            const input = slotInput(page, 0);
            await input.fill("mushroo");
            await expect(options(page)).toHaveText(MUSHROOMS);
            await input.press("ArrowDown");
            await expect(highlighted(page)).toHaveText(MUSHROOM_MAN_2);

            await input.pressSequentially("m");

            await expect(options(page)).toHaveText(MUSHROOMS);
            await expect(highlighted(page)).toHaveText(MUSHROOM_MAN);
        });
    });

    test.describe("picking a suggestion", () => {
        for (const { how, typed, picks, act } of SELECTIONS) {
            test(`with ${how} ends with ${picks} in the slot`, async ({ page }) => {
                const input = slotInput(page, 0);
                await input.fill(typed);
                await expect(options(page)).not.toHaveCount(0);

                await act(page, input);

                await expect(slotName(page, 0)).toHaveText(picks);
                await expect(input).toHaveValue(picks);
                await expect(options(page)).toHaveCount(0);
                await expect(input).toHaveAttribute("aria-expanded", "false");
            });
        }

        test("with Tab moves on to the next slot", async ({ page }) => {
            await slotInput(page, 0).fill(MUSHROOM);
            await expect(options(page)).toHaveText(MUSHROOMS);

            await slotInput(page, 0).press("Tab");

            await expect(slotInput(page, 1)).toBeFocused();
            await expect(options(page)).toHaveCount(0);
        });
    });

    test.describe("closing the list", () => {
        test("Escape closes it and keeps what was typed", async ({ page }) => {
            const input = slotInput(page, 0);
            await input.fill(MUSHROOM);
            await expect(options(page)).toHaveText(MUSHROOMS);

            await input.press("Escape");

            await expect(options(page)).toHaveCount(0);
            await expect(input).toHaveAttribute("aria-expanded", "false");
            await expect(input).toHaveValue(MUSHROOM);
            await expect(input).toBeFocused();
            await expect(slotName(page, 0)).toHaveText("");
        });

        test("Escape leaves Enter with nothing to pick", async ({ page }) => {
            const input = slotInput(page, 0);
            await input.fill(MUSHROOM);
            await expect(options(page)).toHaveText(MUSHROOMS);
            await input.press("Escape");

            await input.press("Enter");

            await expect(input).toHaveValue(MUSHROOM);
            await expect(options(page)).toHaveCount(0);
        });

        test("typing again opens it after Escape", async ({ page }) => {
            const input = slotInput(page, 0);
            await input.fill("mushroo");
            await expect(options(page)).toHaveText(MUSHROOMS);
            await input.press("Escape");
            await expect(options(page)).toHaveCount(0);

            await input.pressSequentially("m");

            await expect(options(page)).toHaveText(MUSHROOMS);
            await expect(input).toHaveAttribute("aria-expanded", "true");
        });

        test("a click elsewhere closes it without picking anything", async ({ page }) => {
            const input = slotInput(page, 0);
            await input.fill(MUSHROOM);
            await expect(options(page)).toHaveText(MUSHROOMS);

            await page.getByRole("heading", { name: "Tu mano" }).click();

            await expect(options(page)).toHaveCount(0);
            await expect(input).toHaveAttribute("aria-expanded", "false");
            await expect(input).toHaveValue(MUSHROOM);
            await expect(slotName(page, 0)).toHaveText("");
        });

        test("focusing the input again opens it again", async ({ page }) => {
            const input = slotInput(page, 0);
            await input.fill(MUSHROOM);
            await expect(options(page)).toHaveText(MUSHROOMS);
            await page.getByRole("heading", { name: "Tu mano" }).click();
            await expect(options(page)).toHaveCount(0);

            await input.focus();

            await expect(options(page)).toHaveText(MUSHROOMS);
        });
    });
});

test.describe("on the search page", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/search");
    });

    test.describe("the suggestions", () => {
        test("match the words of a name, not only its start", async ({ page }) => {
            await searchInput(page).fill("blue eyes");

            await expect(options(page)).toHaveText(BLUE_EYES);
        });

        test("ignore case and hyphens", async ({ page }) => {
            await searchInput(page).fill("BLUE-EYES");

            await expect(options(page)).toHaveText(BLUE_EYES);
        });

        test("list the names that start with the text before the ones that only contain it", async ({
            page,
        }) => {
            await searchInput(page).fill("mush");

            await expect(options(page)).toHaveText(MUSH);
        });

        test("stop at eight, the names that start with the text first", async ({ page }) => {
            await searchInput(page).fill("dragon");

            await expect(options(page)).toHaveText(DRAGON);
        });

        test("start the search of the card whose whole name was typed", async ({ page }) => {
            await searchInput(page).fill(MUSHROOM_MAN);
            await expect(options(page)).toHaveText(MUSHROOMS);

            await searchInput(page).press("Enter");

            await expect(searchedCard(page)).toHaveText(MUSHROOM_MAN);
        });
    });

    test.describe("picking a suggestion", () => {
        for (const { how, typed, picks, act } of SELECTIONS) {
            test(`with ${how} searches ${picks}`, async ({ page }) => {
                await searchInput(page).fill(typed);
                await expect(options(page)).not.toHaveCount(0);

                await act(page, searchInput(page));

                // Tab also takes the focus away, and the change event that follows searches a second time,
                // so the card may show twice: only the card that ends up on top is checked.
                await expect(searchedCard(page)).toHaveText(picks);
                await expect(searchInput(page)).toHaveValue(picks);
                await expect(options(page)).toHaveCount(0);
                await expect(searchInput(page)).toHaveAttribute("aria-expanded", "false");
            });
        }
    });

    test.describe("closing the list", () => {
        test("Escape closes it, keeps what was typed and searches nothing", async ({ page }) => {
            await searchInput(page).fill(MUSHROOM);
            await expect(options(page)).toHaveText(MUSHROOMS);

            await searchInput(page).press("Escape");

            await expect(options(page)).toHaveCount(0);
            await expect(searchInput(page)).toHaveAttribute("aria-expanded", "false");
            await expect(searchInput(page)).toHaveValue(MUSHROOM);
            await expect(page.locator("#outputcard")).toBeEmpty();
        });

        test("a click elsewhere closes it without picking anything", async ({ page }) => {
            await searchInput(page).fill(MUSHROOM);
            await expect(options(page)).toHaveText(MUSHROOMS);

            await page.getByRole("heading", { name: "Resultados", exact: true }).click();

            await expect(options(page)).toHaveCount(0);
            await expect(searchInput(page)).toHaveAttribute("aria-expanded", "false");
            await expect(searchInput(page)).toHaveValue(MUSHROOM);
            await expect(page.locator("#outputcard")).toBeEmpty();
        });
    });
});

test.describe("when the card index is slow", () => {
    // The calculator asks for the index as soon as it opens; the request is held until the test says so.
    async function openCalculatorWithHeldIndex(page: Page): Promise<Route[]> {
        const held = await holdRequests(page, isCardsIndex);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);
        return held;
    }

    // The search page asks for it when the input is first used.
    async function typeOnSearchWithHeldIndex(page: Page, text: string): Promise<Route[]> {
        const held = await holdRequests(page, isCardsIndex);
        await page.goto("/search");
        await searchInput(page).fill(text);
        await expect.poll(() => held.length).toBe(1);
        return held;
    }

    test("a calculator slot that kept the focus gets its suggestions when the index arrives", async ({
        page,
    }) => {
        const held = await openCalculatorWithHeldIndex(page);
        await slotInput(page, 0).fill(MUSHROOM);
        await expect(options(page)).toHaveCount(0);

        await release(held[0]);

        await expect(options(page)).toHaveText(MUSHROOMS);
    });

    test("a calculator slot that lost the focus meanwhile gets none until it has the focus again", async ({
        page,
    }) => {
        const held = await openCalculatorWithHeldIndex(page);
        const input = slotInput(page, 0);
        await input.fill(MUSHROOM);
        await input.blur();

        await release(held[0]);
        await waitForIndexStored(page);

        await expect(options(page)).toHaveCount(0);
        await expect(input).toHaveAttribute("aria-expanded", "false");
        await input.focus();
        await expect(options(page)).toHaveText(MUSHROOMS);
    });

    test("a calculator slot that lost the focus while a failed index was retried gets none", async ({
        page,
    }) => {
        await page.route(isCardsIndex, (route) => route.abort());
        await page.goto("/calculator");
        const alert = page.locator("#index-error");
        await expect(alert).toBeVisible();
        const input = slotInput(page, 0);
        await input.fill(MUSHROOM);
        await input.blur();

        await page.unroute(isCardsIndex);
        await alert.getByRole("button", { name: "Reintentar" }).click();
        await waitForIndexStored(page);

        await expect(alert).toBeHidden();
        await expect(options(page)).toHaveCount(0);
        await input.focus();
        await expect(options(page)).toHaveText(MUSHROOMS);
    });

    test("the search input that kept the focus gets its suggestions when the index arrives", async ({
        page,
    }) => {
        const held = await typeOnSearchWithHeldIndex(page, MUSHROOM);
        await expect(options(page)).toHaveCount(0);

        await release(held[0]);

        await expect(options(page)).toHaveText(MUSHROOMS);
    });

    test("the search input that lost the focus meanwhile gets none until it has the focus again", async ({
        page,
    }) => {
        const held = await typeOnSearchWithHeldIndex(page, MUSHROOM);
        await searchInput(page).blur();

        await release(held[0]);
        await waitForIndexStored(page);

        await expect(options(page)).toHaveCount(0);
        await expect(searchInput(page)).toHaveAttribute("aria-expanded", "false");
        await searchInput(page).focus();
        await expect(options(page)).toHaveText(MUSHROOMS);
    });
});
