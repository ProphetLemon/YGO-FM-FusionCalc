import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import type { CalculatorResponse, CardSummary } from "../../src/shared/types.js";

// The hand the redesign was built around (see calculator-best-play.spec.ts). No API is mocked for it: the
// results are the real ones. Salamandra, an Equip, is the one fusion that does not make a monster.
const PROBLEM_HAND = [
    "Petit Dragon",
    "Kanikabuto",
    "Mystical Elf",
    "Celtic Guardian",
    "Legendary Sword",
    "Zone Eater",
    "Sparks",
];
const MYSTICAL_ELF = "Mystical Elf";
const MUSHROOM_MAN = "Mushroom Man";
const TWO_CARDS = [MYSTICAL_ELF, MUSHROOM_MAN];

const ES = {
    monsterNone: "Ninguna fusión de esta mano da un monstruo.",
    noFusions: "No hay fusiones posibles con esta mano.",
    otherTitle: "Resultados que no son monstruos",
};

function slotAt(page: Page, index: number): Locator {
    return page.locator(".hand-slot").nth(index);
}

// The slots exist at once but the hand is read from the card index, which arrives a little later.
async function openCalculator(page: Page): Promise<void> {
    await page.goto("/calculator");
    const input = slotAt(page, 0).locator("input");
    await input.fill("Mystical");
    await expect(page.getByRole("option", { name: MYSTICAL_ELF, exact: true })).toBeVisible();
    await input.fill("");
}

async function fillHand(page: Page, names: readonly string[]): Promise<void> {
    while ((await page.locator(".hand-slot").count()) < names.length) {
        await page.locator("#addSlotBtn").click();
    }
    for (const [index, name] of names.entries()) {
        const input = slotAt(page, index).locator("input");
        await input.fill(name);
        await input.dispatchEvent("change");
        await expect(slotAt(page, index).locator(".slot-name")).toHaveText(name);
    }
}

function card(id: number, name: string, typeName: string, isMonster: boolean): CardSummary {
    return {
        id,
        name,
        description: "",
        type: 0,
        typeName,
        attack: 1000,
        defense: 1000,
        stars: 1,
        password: "00000000",
        imageCode: null,
        isMonster,
    };
}

// Answers /api/calculator with these fusions and nothing else; the chain search stays real.
async function mockFusions(page: Page, fusions: CalculatorResponse["fusions"]): Promise<void> {
    const body: CalculatorResponse = { fusions, equips: [], rituals: [] };
    await page.route(
        (url) => url.pathname === "/api/calculator",
        (route: Route) =>
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    );
}

// An empty block has no size and Playwright would call it hidden too, so also check it takes no space.
async function expectBlockHidden(block: Locator): Promise<void> {
    await expect(block).toBeEmpty();
    await expect(block).toHaveCSS("display", "none");
}

test.beforeEach(async ({ page }) => {
    // The specs check the markup, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

test.describe("the results of the real hand, split by kind", () => {
    test("lists only monsters on the left, the best first, each with its result line first", async ({
        page,
    }) => {
        await openCalculator(page);
        await fillHand(page, PROBLEM_HAND);

        const entries = page.locator("#outputarealeft > div");
        await expect(entries).toHaveCount(3);
        await expect(page.locator("#outputarealeft h2")).toHaveCount(1);
        await expect(page.locator("#outputarealeft > p")).toHaveCount(0);

        const results = entries.locator(".fusion-result p");
        await expect(results).toHaveCount(3);
        await expect(results.nth(0)).toContainText("Sword Arm of Dragon");
        await expect(results.nth(1)).toContainText("Spike Seadra");
        await expect(results.nth(2)).toContainText("Spike Seadra");
        await expect(results.first()).toHaveText(/^Resultado: Sword Arm of Dragon \(\d+\/\d+\)$/);
        // The result line is the first row of the entry, followed by the two inputs.
        await expect(entries.first().locator(":scope > div")).toHaveCount(3);
        await expect(entries.first().locator(":scope > div").first()).toHaveClass(/fusion-result/);
        await expect(entries.first().locator("p")).toHaveText([
            /^Resultado: Sword Arm of Dragon/,
            /^Carta: /,
            /^Carta: /,
        ]);
    });

    test("puts the fusion that does not make a monster only in its own block", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, PROBLEM_HAND);
        await expect(page.locator("#outputarealeft > div")).toHaveCount(3);

        const other = page.locator("#outputareaother");
        await expect(other).toBeVisible();
        await expect(other.locator("h2")).toHaveText(ES.otherTitle);
        await expect(other.locator(":scope > div")).toHaveCount(1);
        await expect(other.locator(":scope > div .fusion-result p")).toHaveText(
            /^Resultado: Salamandra \[Equip\]$/
        );
        await expect(page.locator("#outputarealeft")).not.toContainText("Salamandra");
        await expect(page.locator("#outputarearight")).not.toContainText("Salamandra");
        // The block sits below the two-column grid and above the rituals.
        const otherBox = await other.boundingBox();
        const leftBox = await page.locator("#outputarealeft").boundingBox();
        expect(otherBox!.y).toBeGreaterThanOrEqual(leftBox!.y + leftBox!.height - 1);
    });

    test("keeps Legendary Sword equipping Celtic Guardian on the right", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, PROBLEM_HAND);
        await expect(page.locator("#outputareaother")).toBeVisible();

        const equips = page.locator("#outputarearight > div");
        await expect(equips).toHaveCount(1);
        await expect(equips.locator("p")).toHaveText([
            "Equipo: Legendary Sword",
            "Monstruo: Celtic Guardian",
        ]);
    });

    test("makes the result line bigger and bolder than the input lines", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, PROBLEM_HAND);

        const entry = page.locator("#outputarealeft > div").first();
        await expect(entry).toBeVisible();
        const result = entry.locator(".fusion-result");
        const input = entry.locator(":scope > div").nth(1);
        const resultImg = await result.locator(":scope > div").first().boundingBox();
        const inputImg = await input.locator(":scope > div").first().boundingBox();
        expect(resultImg!.height).toBeGreaterThan(inputImg!.height * 1.5);

        const resultText = result.locator("p");
        const inputText = input.locator("p");
        const size = (locator: Locator): Promise<number> =>
            locator.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        const weight = (locator: Locator): Promise<number> =>
            locator.evaluate((el) => parseInt(getComputedStyle(el).fontWeight, 10));
        expect(await size(resultText)).toBeGreaterThan(await size(inputText));
        expect(await weight(resultText)).toBeGreaterThanOrEqual(700);
    });

    test("labels the lines in English too", async ({ browser }) => {
        const context = await browser.newContext({
            locale: "en-US",
            extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
        });
        const page = await context.newPage();
        await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
        try {
            await openCalculator(page);
            await fillHand(page, PROBLEM_HAND);

            await expect(page.locator("#outputareaother h2")).toHaveText("Results that are not monsters");
            await expect(page.locator("#outputarealeft > div").first().locator("p")).toHaveText([
                /^Result: Sword Arm of Dragon/,
                /^Input: /,
                /^Input: /,
            ]);
        } finally {
            await context.close();
        }
    });
});

test.describe("a hand whose fusions make no monster", () => {
    const SPELL_ONLY = [
        {
            card1: card(1, MYSTICAL_ELF, "Spellcaster", true),
            card2: card(2, MUSHROOM_MAN, "Plant", true),
            result: card(3, "Mocked Equip", "Equip", false),
        },
    ];

    test("says so on the left and lists the fusion in the other block", async ({ page }) => {
        await mockFusions(page, SPELL_ONLY);
        await openCalculator(page);
        await fillHand(page, TWO_CARDS);

        await expect(page.locator("#outputarealeft > p")).toHaveText(ES.monsterNone);
        await expect(page.locator("#outputarealeft > div")).toHaveCount(0);
        await expect(page.locator("#outputarealeft h2")).toHaveCount(1);
        await expect(page.locator("#outputareaother > div")).toHaveCount(1);
        await expect(page.locator("#outputareaother")).toContainText("Mocked Equip [Equip]");
    });

    test("keeps the plain message when there are no fusions at all", async ({ page }) => {
        await mockFusions(page, []);
        await openCalculator(page);
        await fillHand(page, TWO_CARDS);

        await expect(page.locator("#outputarealeft > p")).toHaveText(ES.noFusions);
        await expectBlockHidden(page.locator("#outputareaother"));
    });

    test("leaves the other block hidden when every fusion makes a monster", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, TWO_CARDS);

        await expect(page.locator("#outputarealeft > div")).toHaveCount(1);
        await expectBlockHidden(page.locator("#outputareaother"));
    });
});

test.describe("the other block follows the hand", () => {
    test("is empty and hidden in the hint, and after the hand stops fusing", async ({ page }) => {
        await openCalculator(page);
        await expectBlockHidden(page.locator("#outputareaother"));

        await fillHand(page, PROBLEM_HAND);
        await expect(page.locator("#outputareaother > div")).toHaveCount(1);

        // Back to a single card: the hint returns and the block goes with the results.
        for (let index = 1; index < PROBLEM_HAND.length; index++) {
            await slotAt(page, index).locator(".clear-btn").click();
        }
        await expect(page.locator("#outputarealeft")).toBeEmpty();
        await expectBlockHidden(page.locator("#outputareaother"));
    });

    test("is empty and hidden after a reset", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, PROBLEM_HAND);
        await expect(page.locator("#outputareaother > div")).toHaveCount(1);

        await page.locator("#resetBtn").click();

        await expect(page.locator("#outputarealeft")).toBeEmpty();
        await expectBlockHidden(page.locator("#outputareaother"));
    });
});
