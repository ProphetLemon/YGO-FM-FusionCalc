import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import type { CardSummary, EquipExpanded } from "../../src/shared/types.js";

// Real cards, looked up in data/*.json instead of guessed.
// An Equip card that fits a single monster and also fuses with it, into a third card.
const EQUIP_CARD = "Elegant Egotist";
const HARPIE_LADY = "Harpie Lady";
const HARPIE_LADY_SISTERS = "Harpie Lady Sisters";
// A monster that three Equip cards fit, in the order the API lists them.
const MONSTER = "Blue-eyes White Dragon";
const MONSTER_EQUIPS = ["Dragon Treasure", "Megamorph", "Bright Castle"];
// An Equip card that fits 63 monsters and a monster that takes 12 Equip cards.
const MANY_MONSTERS = "Legendary Sword";
const MANY_EQUIP_CARDS = "Swamp Battleguard";
// Artwork file names of the cards whose images the specs check.
const PASSWORD = {
    elegantEgotist: "90219263",
    harpieLady: "76812113",
};

test.beforeEach(async ({ page }) => {
    // The specs check the markup, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

function equipPairs(page: Page): Locator {
    return page.locator("#output-area-right > div");
}

function fusionEntries(page: Page): Locator {
    return page.locator("#output-area-left > div");
}

// The search starts with the change event, as the calculator specs start theirs: a click on the button after
// typing fires that event too, and the page then searches twice.
async function searchByName(page: Page, name: string): Promise<void> {
    await page.goto("/search");
    const input = page.locator("#cardname");
    await input.fill(name);
    await input.dispatchEvent("change");
}

// What the API answers for the equip pairs of a card: the rendered column must hold exactly those.
async function equipPairsOf(request: APIRequestContext, name: string): Promise<EquipExpanded[]> {
    const lookup = await request.get(`/api/cards?name=${encodeURIComponent(name)}`);
    const { card } = (await lookup.json()) as { card: CardSummary };
    const fusions = await request.get(`/api/fusions/${card.id}`);
    return ((await fusions.json()) as { equips: EquipExpanded[] }).equips;
}

test.describe("the equip pairs of a searched card", () => {
    test("name the Equip card and the monster it fits", async ({ page }) => {
        await searchByName(page, EQUIP_CARD);

        await expect(equipPairs(page)).toHaveCount(1);
        await expect(equipPairs(page).locator("p")).toHaveText([
            `Equipo: ${EQUIP_CARD}`,
            `Monstruo: ${HARPIE_LADY}`,
        ]);
    });

    test("draw the artwork of each card in the order of its label", async ({ page }) => {
        await searchByName(page, EQUIP_CARD);

        const images = equipPairs(page).locator("img");
        await expect(images).toHaveCount(2);
        await expect(images.nth(0)).toHaveAttribute("src", new RegExp(`/${PASSWORD.elegantEgotist}\\.jpg$`));
        await expect(images.nth(1)).toHaveAttribute("src", new RegExp(`/${PASSWORD.harpieLady}\\.jpg$`));
    });

    test("put the Equip card first when the searched card is the monster", async ({ page }) => {
        await searchByName(page, MONSTER);

        await expect(equipPairs(page)).toHaveCount(MONSTER_EQUIPS.length);
        await expect(equipPairs(page).locator("p")).toHaveText(
            MONSTER_EQUIPS.flatMap((equip) => [`Equipo: ${equip}`, `Monstruo: ${MONSTER}`])
        );
    });

    for (const name of [MANY_MONSTERS, MANY_EQUIP_CARDS]) {
        test(`name every pair of ${name}`, async ({ page, request }) => {
            const pairs = await equipPairsOf(request, name);
            expect(pairs.length).toBeGreaterThan(10);

            await searchByName(page, name);

            await expect(equipPairs(page)).toHaveCount(pairs.length);
            await expect(equipPairs(page).locator("p")).toHaveText(
                pairs.flatMap(({ card1, card2 }) => {
                    const [equip, monster] = card1.typeName === "Equip" ? [card1, card2] : [card2, card1];
                    return [`Equipo: ${equip.name}`, `Monstruo: ${monster.name}`];
                })
            );
        });
    }
});

test.describe("everything else on the search page", () => {
    test("keeps the neutral labels for a fusion of the same Equip card", async ({ page }) => {
        await searchByName(page, EQUIP_CARD);

        const fusion = fusionEntries(page).filter({ hasText: HARPIE_LADY_SISTERS });
        await expect(fusion).toHaveCount(1);
        await expect(fusion.locator("p")).toHaveText([
            `Carta: ${EQUIP_CARD}`,
            `Carta: ${HARPIE_LADY}`,
            `Resultado: ${HARPIE_LADY_SISTERS} (1950/2100)`,
        ]);
        await expect(page.locator("#output-area-left")).not.toContainText("Equipo:");
        await expect(page.locator("#output-area-left")).not.toContainText("Monstruo:");
    });

    test("keeps the neutral labels when it searches by result", async ({ page }) => {
        await page.goto("/search");
        await page.locator("#cardname").fill(HARPIE_LADY_SISTERS);

        // Not a real click, which takes the focus away first: the change event that follows would start the
        // search by name as well.
        await page.locator("#search-results-btn").dispatchEvent("click");

        await expect(fusionEntries(page)).toHaveCount(1);
        await expect(fusionEntries(page).locator("p")).toHaveText([
            `Carta: ${HARPIE_LADY}`,
            `Carta: ${EQUIP_CARD}`,
        ]);
        await expect(equipPairs(page)).toHaveCount(0);
    });
});

test.describe("in English", () => {
    test.use({ locale: "en-US", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });

    test("translates the labels of an Equip card", async ({ page }) => {
        await searchByName(page, EQUIP_CARD);

        await expect(equipPairs(page).locator("p")).toHaveText([
            `Equip: ${EQUIP_CARD}`,
            `Monster: ${HARPIE_LADY}`,
        ]);
    });

    test("translates the labels of a monster", async ({ page }) => {
        await searchByName(page, MONSTER);

        await expect(equipPairs(page).locator("p")).toHaveText(
            MONSTER_EQUIPS.flatMap((equip) => [`Equip: ${equip}`, `Monster: ${MONSTER}`])
        );
    });

    test("keeps the neutral labels of a fusion", async ({ page }) => {
        await searchByName(page, EQUIP_CARD);

        const fusion = fusionEntries(page).filter({ hasText: HARPIE_LADY_SISTERS });
        await expect(fusion.locator("p")).toHaveText([
            `Input: ${EQUIP_CARD}`,
            `Input: ${HARPIE_LADY}`,
            `Result: ${HARPIE_LADY_SISTERS} (1950/2100)`,
        ]);
    });
});
