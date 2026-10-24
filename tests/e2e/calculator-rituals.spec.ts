import { expect, test, type Locator, type Page, type Response } from "@playwright/test";

const YAMADRON_HAND = ["Yamadron Ritual", "Mountain Warrior", "Koumori Dragon", "Wings of Wicked Flame"];

const INCOMPLETE_HANDS: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["the ritual card", ["Mountain Warrior", "Koumori Dragon", "Wings of Wicked Flame"]],
    ["a material", ["Yamadron Ritual", "Mountain Warrior", "Koumori Dragon"]],
];

// Artwork file names of the five cards of the entry, in display order: ritual card, materials, result. The CDN
// names a file after the password without its padding: Mountain Warrior's password is "04931562".
const YAMADRON_ARTWORK = ["29089635", "4931562", "67724379", "92944626", "70345785"];

test.beforeEach(async ({ page }) => {
    // The specs check the artwork markup, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

async function fillHand(page: Page, names: readonly string[]): Promise<void> {
    for (const [index, name] of names.entries()) {
        const slot = page.locator(".hand-slot").nth(index);
        await slot.locator("input").fill(name);
        await slot.locator("input").dispatchEvent("change");
        await expect(slot.locator(".slot-name")).toHaveText(name);
    }
}

// Resolves when the page gets the calculator answer for a hand of that size.
function waitForCalculation(page: Page, handSize: number): Promise<Response> {
    return page.waitForResponse((response) => {
        if (!response.url().endsWith("/api/calculator")) return false;
        const { handIds } = response.request().postDataJSON() as { handIds: number[] };
        return handIds.length === handSize;
    });
}

const EMPTY_ES =
    "Ninguno para esta mano. Un ritual aparece aquí cuando tienes la carta de ritual y sus tres materiales.";
const EMPTY_EN =
    "None for this hand. A ritual shows up here once you hold the ritual card and its three materials.";

// The panel is part of the results: it shows whenever the hand has two cards, and says what a ritual needs
// when there is none.
async function expectEmptyPanel(page: Page, copy: string): Promise<void> {
    await expect(page.locator("#rituals-title")).toBeVisible();
    await expect(page.locator("#rituals-output > p")).toHaveText(copy);
    await expect(page.locator("#rituals-output .ritual-entry")).toHaveCount(0);
}

const ES_CAPTIONS = ["Carta de ritual", "Material", "Material", "Material", "Resultado"];
const EN_CAPTIONS = ["Ritual card", "Material", "Material", "Material", "Result"];

// The entry draws five tiles, each with its caption: the ritual card, the three materials, the result (a
// fusion-framed tile).
async function expectRitualRow(block: Locator, captions: readonly string[]): Promise<void> {
    const entry = block.locator(".ritual-entry").first();
    await expect(entry.locator(".card-caption")).toHaveText(captions);
    await expect(entry.locator(".card-tile-name")).toHaveText([
        "Yamadron Ritual",
        "Mountain Warrior",
        "Koumori Dragon",
        "Wings of Wicked Flame",
        "Yamadron",
    ]);
    await expect(entry.locator(".card-tile").last()).toHaveAttribute("data-kind", "fusion");
}

// The empty copy in English: the same hand minus its ritual card.
async function expectEmptyAfterReset(page: Page, copy: string): Promise<void> {
    await page.locator("#resetBtn").click();
    await fillHand(page, INCOMPLETE_HANDS[0][1]);
    await expectEmptyPanel(page, copy);
}

test.describe("rituals block", () => {
    test("is hidden with the other results on first load", async ({ page }) => {
        await page.goto("/calculator");
        await expect(page.locator("#results-panels")).toBeHidden();
        await expect(page.locator("#rituals-output")).toBeEmpty();
    });

    test("lists a ritual when the hand has its card and three materials", async ({ page }) => {
        await page.goto("/calculator");
        await fillHand(page, YAMADRON_HAND);
        const block = page.locator("#rituals-output");
        await expect(block).toBeVisible();
        await expect(page.getByRole("heading", { name: "Rituales", level: 2, exact: true })).toBeVisible();
        await expectRitualRow(block, ES_CAPTIONS);
    });

    test("draws artwork for the ritual card, the materials and the result", async ({ page }) => {
        await page.goto("/calculator");
        await fillHand(page, YAMADRON_HAND);
        const images = page.locator("#rituals-output .ritual-entry").first().locator("img");
        await expect(images).toHaveCount(YAMADRON_ARTWORK.length);
        for (const [index, file] of YAMADRON_ARTWORK.entries()) {
            await expect(images.nth(index)).toHaveAttribute("src", new RegExp(`/${file}\\.jpg$`));
        }
    });

    for (const [missing, names] of INCOMPLETE_HANDS) {
        test(`shows the empty copy when the hand lacks ${missing}`, async ({ page }) => {
            await page.goto("/calculator");
            const calculated = waitForCalculation(page, names.length);
            await fillHand(page, names);
            await (await calculated).finished();
            await expectEmptyPanel(page, EMPTY_ES);
        });
    }

    test("shows the empty copy again when a card leaves the hand", async ({ page }) => {
        await page.goto("/calculator");
        await fillHand(page, YAMADRON_HAND);
        const block = page.locator("#rituals-output");
        await expect(block).toBeVisible();
        const lastSlot = page.locator(".hand-slot").nth(YAMADRON_HAND.length - 1);
        const calculated = waitForCalculation(page, YAMADRON_HAND.length - 1);
        await lastSlot.locator(".clear-btn").click();
        await (await calculated).finished();
        await expectEmptyPanel(page, EMPTY_ES);
    });

    test("goes with the other results on reset", async ({ page }) => {
        await page.goto("/calculator");
        await fillHand(page, YAMADRON_HAND);
        const block = page.locator("#rituals-output");
        await expect(block).toBeVisible();
        await page.locator("#resetBtn").click();
        await expect(page.locator("#results-panels")).toBeHidden();
        await expect(block).toBeEmpty();
    });

    test.describe("in English", () => {
        test.use({ locale: "en-US", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });

        test("uses the English labels", async ({ page }) => {
            await page.goto("/calculator");
            await fillHand(page, YAMADRON_HAND);
            const block = page.locator("#rituals-output");
            await expect(
                page.getByRole("heading", { name: "Rituals", level: 2, exact: true })
            ).toBeVisible();
            await expectRitualRow(block, EN_CAPTIONS);
            await expectEmptyAfterReset(page, EMPTY_EN);
        });
    });
});
