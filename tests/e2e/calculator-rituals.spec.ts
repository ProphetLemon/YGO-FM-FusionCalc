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

// An empty block has no size and Playwright would call it hidden too, so also check it takes no space.
async function expectRitualsHidden(block: Locator): Promise<void> {
    await expect(block).toBeHidden();
    await expect(block).toHaveCSS("display", "none");
}

test.describe("rituals block", () => {
    test("is hidden on first load", async ({ page }) => {
        await page.goto("/calculator");
        await expectRitualsHidden(page.locator("#rituals-output"));
    });

    test("lists a ritual when the hand has its card and three materials", async ({ page }) => {
        await page.goto("/calculator");
        await fillHand(page, YAMADRON_HAND);
        const block = page.locator("#rituals-output");
        await expect(block).toBeVisible();
        await expect(block.getByRole("heading", { name: "Rituales" })).toBeVisible();
        await expect(block.locator(".ritual-entry").first().locator("p")).toHaveText([
            "Carta de ritual: Yamadron Ritual",
            "Material: Mountain Warrior",
            "Material: Koumori Dragon",
            "Material: Wings of Wicked Flame",
            "Resultado: Yamadron (1600/1800)",
        ]);
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
        test(`stays hidden when the hand lacks ${missing}`, async ({ page }) => {
            await page.goto("/calculator");
            const calculated = waitForCalculation(page, names.length);
            await fillHand(page, names);
            await (await calculated).finished();
            await expectRitualsHidden(page.locator("#rituals-output"));
        });
    }

    test("hides again when a card leaves the hand", async ({ page }) => {
        await page.goto("/calculator");
        await fillHand(page, YAMADRON_HAND);
        const block = page.locator("#rituals-output");
        await expect(block).toBeVisible();
        const lastSlot = page.locator(".hand-slot").nth(YAMADRON_HAND.length - 1);
        const calculated = waitForCalculation(page, YAMADRON_HAND.length - 1);
        await lastSlot.locator(".clear-btn").click();
        await (await calculated).finished();
        await expectRitualsHidden(block);
    });

    test("hides again on reset", async ({ page }) => {
        await page.goto("/calculator");
        await fillHand(page, YAMADRON_HAND);
        const block = page.locator("#rituals-output");
        await expect(block).toBeVisible();
        await page.locator("#resetBtn").click();
        await expectRitualsHidden(block);
    });

    test.describe("in English", () => {
        test.use({ locale: "en-US", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });

        test("uses the English labels", async ({ page }) => {
            await page.goto("/calculator");
            await fillHand(page, YAMADRON_HAND);
            const block = page.locator("#rituals-output");
            await expect(block.getByRole("heading", { name: "Rituals" })).toBeVisible();
            await expect(block.locator(".ritual-entry").first().locator("p")).toHaveText([
                "Ritual card: Yamadron Ritual",
                "Material: Mountain Warrior",
                "Material: Koumori Dragon",
                "Material: Wings of Wicked Flame",
                "Result: Yamadron (1600/1800)",
            ]);
        });
    });
});
