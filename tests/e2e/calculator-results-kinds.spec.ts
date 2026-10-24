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
    best: "Mejor fusión simple",
    noAtk: "Sin ATK",
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

async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    if (!box) throw new Error("the element has no box");
    return box;
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
    test("lists only monsters in the fusions table, the best first and tagged", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, PROBLEM_HAND);

        const table = page.getByRole("table", { name: "Fusiones", exact: true });
        await expect(table).toBeVisible();
        await expect(table.getByRole("columnheader")).toHaveText(["Resultado", "ATK / DEF", "Entrada"]);
        const rows = page.locator("#outputarealeft .fusion-row");
        await expect(rows).toHaveCount(3);
        await expect(page.locator("#outputarealeft > p")).toHaveCount(0);

        const names = rows.locator(".fusion-name");
        await expect(names.nth(0)).toContainText("Sword Arm of Dragon");
        await expect(names.nth(1)).toContainText("Spike Seadra");
        await expect(names.nth(2)).toContainText("Spike Seadra");
        // Only the first row is the best single fusion.
        await expect(page.locator("#outputarealeft [data-best]")).toHaveCount(1);
        await expect(rows.nth(0)).toHaveAttribute("data-best", "true");
        await expect(page.locator("#outputarealeft .best-tag")).toHaveText(ES.best);
        await expect(rows.nth(0).locator(".best-tag")).toHaveCount(1);
        await expect(rows.nth(0).locator(".fusion-stat")).toHaveText(/^\d+ \/ \d+$/);
        await expect(rows.nth(0).locator(".fusion-input")).toHaveText(["Petit Dragon", "Celtic Guardian"]);
        await expect(rows.nth(0).locator(".card-tile")).toHaveAttribute("data-kind", "fusion");
        await expect(rows.nth(0).locator(".card-tile")).toHaveAttribute("data-size", "xs");
    });

    test("highlights the best row with the green fill and outline", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, PROBLEM_HAND);

        const rows = page.locator("#outputarealeft .fusion-row");
        await expect(rows).toHaveCount(3);
        await expect(rows.nth(0)).toHaveCSS("background-color", "rgb(221, 241, 227)");
        await expect(rows.nth(0)).toHaveCSS("outline-width", "2px");
        await expect(rows.nth(0)).toHaveCSS("outline-color", "rgb(23, 98, 50)");
        await expect(rows.nth(1)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(rows.nth(1)).toHaveCSS("outline-style", "none");
    });

    test("puts the fusion that does not make a monster only in its own subsection", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, PROBLEM_HAND);
        await expect(page.locator("#outputarealeft .fusion-row")).toHaveCount(3);

        const other = page.locator("#outputareaother");
        await expect(other).toBeVisible();
        await expect(other.getByRole("heading", { level: 3 })).toHaveText(ES.otherTitle);
        const rows = other.locator(".fusion-row");
        await expect(rows).toHaveCount(1);
        await expect(rows.locator(".fusion-name")).toHaveText("Salamandra");
        await expect(rows.locator(".fusion-type")).toHaveText("Equip");
        await expect(rows.locator(".fusion-stat")).toHaveText(ES.noAtk);
        await expect(rows.locator(".card-tile")).toHaveAttribute("data-kind", "fusion");
        await expect(other.locator(".best-tag")).toHaveCount(0);
        await expect(page.locator("#outputarealeft")).not.toContainText("Salamandra");
        await expect(page.locator("#outputarearight")).not.toContainText("Salamandra");
        // The subsection is inside the fusions panel, below the monster table.
        const panel = page.locator("section").filter({ has: page.locator("#fusions-title") });
        await expect(panel.locator("#outputareaother")).toHaveCount(1);
        await expect(panel.locator("#outputarealeft")).toHaveCount(1);
        const otherBox = await other.boundingBox();
        const leftBox = await page.locator("#outputarealeft").boundingBox();
        expect(otherBox!.y).toBeGreaterThanOrEqual(leftBox!.y + leftBox!.height - 1);
    });

    test("keeps Legendary Sword equipping Celtic Guardian in the equips panel", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, PROBLEM_HAND);
        await expect(page.locator("#outputareaother")).toBeVisible();

        const equips = page.locator("#outputarearight > div");
        await expect(equips).toHaveCount(1);
        await expect(equips.locator(".card-caption")).toHaveText(["Equipo", "Monstruo"]);
        await expect(equips.locator(".card-tile-name")).toHaveText(["Legendary Sword", "Celtic Guardian"]);
    });

    test("sets the ATK in the display font at 24px and the name in bold", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, PROBLEM_HAND);

        const row = page.locator("#outputarealeft .fusion-row").first();
        await expect(row).toBeVisible();
        const stat = row.locator(".fusion-stat");
        expect(await stat.evaluate((el) => getComputedStyle(el).fontSize)).toBe("24px");
        expect(await stat.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Chakra Petch");
        const weight = await row
            .locator(".fusion-name")
            .evaluate((el) => parseInt(getComputedStyle(el).fontWeight, 10));
        expect(weight).toBeGreaterThanOrEqual(700);
    });

    test("labels the table and the subsection in English too", async ({ browser }) => {
        const context = await browser.newContext({
            locale: "en-US",
            extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
        });
        const page = await context.newPage();
        await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
        try {
            await openCalculator(page);
            await fillHand(page, PROBLEM_HAND);

            await expect(page.locator("#outputareaother").getByRole("heading", { level: 3 })).toHaveText(
                "Results that are not monsters"
            );
            await expect(page.locator("#outputarealeft [role=columnheader]")).toHaveText([
                "Result",
                "ATK / DEF",
                "Input",
            ]);
            await expect(page.locator("#outputarealeft .best-tag")).toHaveText("Best single fusion");
            await expect(page.locator("#outputareaother .fusion-stat")).toHaveText("No ATK");
        } finally {
            await context.close();
        }
    });
});

test.describe("the layout of the results panels", () => {
    test("puts equips and rituals side by side below the fusions panel", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await openCalculator(page);
        await fillHand(page, PROBLEM_HAND);
        await expect(page.locator("#outputareaother")).toBeVisible();

        const fusions = await boxOf(page.locator("section").filter({ has: page.locator("#fusions-title") }));
        const equips = await boxOf(page.locator("section").filter({ has: page.locator("#equips-title") }));
        const rituals = await boxOf(page.locator("section").filter({ has: page.locator("#rituals-title") }));
        expect(equips.y).toBeGreaterThanOrEqual(fusions.y + fusions.height);
        expect(Math.abs(equips.y - rituals.y)).toBeLessThanOrEqual(1);
        expect(equips.x + equips.width).toBeLessThanOrEqual(rituals.x);
        // The fusions panel spans both columns.
        expect(fusions.width).toBeGreaterThanOrEqual(rituals.x + rituals.width - equips.x - 1);
    });

    test("stacks them at 1100px and below", async ({ page }) => {
        await page.setViewportSize({ width: 1000, height: 900 });
        await openCalculator(page);
        await fillHand(page, PROBLEM_HAND);
        await expect(page.locator("#outputareaother")).toBeVisible();

        const equips = await boxOf(page.locator("section").filter({ has: page.locator("#equips-title") }));
        const rituals = await boxOf(page.locator("section").filter({ has: page.locator("#rituals-title") }));
        expect(rituals.y).toBeGreaterThanOrEqual(equips.y + equips.height);
        expect(Math.abs(rituals.x - equips.x)).toBeLessThanOrEqual(1);
    });

    test.describe("on a phone", () => {
        test.use({ viewport: { width: 375, height: 812 } });

        test("hides the table header, stacks each row and does not scroll sideways", async ({ page }) => {
            await openCalculator(page);
            await fillHand(page, PROBLEM_HAND);
            await expect(page.locator("#outputareaother")).toBeVisible();

            await expect(page.locator("#outputarealeft [role=row]").first()).toBeHidden();
            const row = page.locator("#outputarealeft .fusion-row").first();
            const tile = await boxOf(row.locator(".card-tile"));
            const name = await boxOf(row.locator(".fusion-name"));
            const stat = await boxOf(row.locator(".fusion-stat"));
            const inputs = await boxOf(row.locator(".fusion-input").first());
            expect(name.x).toBeGreaterThanOrEqual(tile.x + tile.width);
            expect(stat.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
            expect(inputs.y).toBeGreaterThanOrEqual(stat.y + stat.height - 1);
            expect(Math.abs(stat.x - name.x)).toBeLessThanOrEqual(1);

            const widths = await page.evaluate(() => ({
                scroll: document.documentElement.scrollWidth,
                client: document.documentElement.clientWidth,
            }));
            expect(widths.scroll).toBeLessThanOrEqual(widths.client);
        });
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
        await expect(page.locator("#outputarealeft .fusion-row")).toHaveCount(0);
        await expect(page.locator("#fusions-title")).toBeVisible();
        await expect(page.locator("#outputareaother .fusion-row")).toHaveCount(1);
        await expect(page.locator("#outputareaother .fusion-name")).toHaveText("Mocked Equip");
        await expect(page.locator("#outputareaother .fusion-stat")).toHaveText(ES.noAtk);
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

        await expect(page.locator("#outputarealeft .fusion-row")).toHaveCount(1);
        await expectBlockHidden(page.locator("#outputareaother"));
    });
});

test.describe("the other block follows the hand", () => {
    test("is empty and hidden in the hint, and after the hand stops fusing", async ({ page }) => {
        await openCalculator(page);
        await expectBlockHidden(page.locator("#outputareaother"));

        await fillHand(page, PROBLEM_HAND);
        await expect(page.locator("#outputareaother .fusion-row")).toHaveCount(1);

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
        await expect(page.locator("#outputareaother .fusion-row")).toHaveCount(1);

        await page.locator("#resetBtn").click();

        await expect(page.locator("#outputarealeft")).toBeEmpty();
        await expectBlockHidden(page.locator("#outputareaother"));
    });
});
