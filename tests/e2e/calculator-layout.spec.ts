import { expect, test, type Locator, type Page } from "@playwright/test";

const START_SLOTS = 5;
const MAX_SLOTS = 12;
const PAIR = ["Mystical Elf", "Mushroom Man"] as const;

test.beforeEach(async ({ page }) => {
    // The specs check the layout, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

function slotAt(page: Page, index: number): Locator {
    return page.locator(".hand-slot").nth(index);
}

async function fillSlot(page: Page, index: number, name: string): Promise<void> {
    const input = slotAt(page, index).locator("input");
    await input.fill(name);
    await input.dispatchEvent("change");
    await expect(slotAt(page, index).locator(".slot-name")).toHaveText(name);
}

// Resolves when the page gets the calculator answer for the hand that was typed.
function waitForCalculation(page: Page): Promise<unknown> {
    return page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/calculator" && response.status() === 200
    );
}

async function fillPair(page: Page): Promise<void> {
    await fillSlot(page, 0, PAIR[0]);
    const answered = waitForCalculation(page);
    await fillSlot(page, 1, PAIR[1]);
    await answered;
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
    const found = await locator.boundingBox();
    if (!found) throw new Error("element has no box");
    return found;
}

test.describe("desktop layout", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("the hand is left of the answer column and both start at the same height", async ({ page }) => {
        await page.goto("/calculator");
        const hand = await box(page.locator("#hand-section"));
        const answer = await box(page.locator("#answer-column"));
        expect(hand.x + hand.width).toBeLessThanOrEqual(answer.x);
        expect(Math.abs(hand.y - answer.y)).toBeLessThanOrEqual(1);
        expect(answer.width).toBeGreaterThan(hand.width);
    });

    test("the answer column stays right of the hand once there is an answer", async ({ page }) => {
        await page.goto("/calculator");
        await fillPair(page);
        await expect(page.locator("#answer-column")).toHaveAttribute("data-has-answer", "true");
        const hand = await box(page.locator("#hand-section"));
        const answer = await box(page.locator("#answer-column"));
        expect(hand.x + hand.width).toBeLessThanOrEqual(answer.x);
        expect(Math.abs(hand.y - answer.y)).toBeLessThanOrEqual(1);
    });

    test("the chain section sits above the results section in the answer column", async ({ page }) => {
        await page.goto("/calculator");
        await fillPair(page);
        await expect(page.locator("#chain-section")).toBeVisible();
        // The chain grows the section once it arrives: measure after that.
        await expect(page.locator("#chain-output .chain-best")).toBeVisible();
        const chain = await box(page.locator("#chain-section"));
        const results = await box(
            page.locator("#answer-column section").filter({ has: page.locator("#outputarealeft") })
        );
        expect(chain.y + chain.height).toBeLessThanOrEqual(results.y);
    });
});

test.describe("phone order", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("the hand comes first while there are fewer than two recognized cards", async ({ page }) => {
        await page.goto("/calculator");
        const column = page.locator("#answer-column");
        await expect(column).toHaveAttribute("data-has-answer", "false");
        await fillSlot(page, 0, PAIR[0]);
        await expect(column).toHaveAttribute("data-has-answer", "false");
        const hand = await box(page.locator("#hand-section"));
        const answer = await box(column);
        expect(hand.y + hand.height).toBeLessThanOrEqual(answer.y);
    });

    test("the answer column moves above the hand with two recognized cards and back on reset", async ({
        page,
    }) => {
        await page.goto("/calculator");
        await fillPair(page);
        const column = page.locator("#answer-column");
        await expect(column).toHaveAttribute("data-has-answer", "true");
        const answer = await box(column);
        const hand = await box(page.locator("#hand-section"));
        expect(answer.y + answer.height).toBeLessThanOrEqual(hand.y);

        await page.locator("#resetBtn").click();
        await expect(column).toHaveAttribute("data-has-answer", "false");
        const handAfter = await box(page.locator("#hand-section"));
        const answerAfter = await box(column);
        expect(handAfter.y + handAfter.height).toBeLessThanOrEqual(answerAfter.y);
    });

    test("the DOM order stays hand first", async ({ page }) => {
        await page.goto("/calculator");
        await fillPair(page);
        const handFirst = await page.evaluate(() => {
            const hand = document.querySelector("#hand-section");
            const answer = document.querySelector("#answer-column");
            if (!hand || !answer) return false;
            return Boolean(hand.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING);
        });
        expect(handFirst).toBe(true);
    });
});

test.describe("slot counter", () => {
    test("reads five of twelve slots on a fresh page and follows add and remove", async ({ page }) => {
        await page.goto("/calculator");
        const count = page.locator("#hand-count");
        await expect(count).toHaveText(`${START_SLOTS} de ${MAX_SLOTS} casillas`);
        await page.locator("#addSlotBtn").click();
        await expect(count).toHaveText(`${START_SLOTS + 1} de ${MAX_SLOTS} casillas`);
        await page.locator(".remove-btn").first().click();
        await expect(count).toHaveText(`${START_SLOTS} de ${MAX_SLOTS} casillas`);
    });

    test("counts slots, not cards, and reaches the cap", async ({ page }) => {
        await page.goto("/calculator");
        await fillSlot(page, 0, PAIR[0]);
        await expect(page.locator("#hand-count")).toHaveText(`${START_SLOTS} de ${MAX_SLOTS} casillas`);
        while ((await page.locator(".hand-slot").count()) < MAX_SLOTS)
            await page.locator("#addSlotBtn").click();
        await expect(page.locator("#hand-count")).toHaveText(`${MAX_SLOTS} de ${MAX_SLOTS} casillas`);
    });

    test("restores the counter of a saved hand with extra slots", async ({ page }) => {
        await page.goto("/calculator");
        await page.locator("#addSlotBtn").click();
        await page.locator("#addSlotBtn").click();
        await expect(page.locator("#hand-count")).toHaveText(`${START_SLOTS + 2} de ${MAX_SLOTS} casillas`);
        await fillSlot(page, 0, PAIR[0]);
        await page.reload();
        await expect(page.locator("#hand-count")).toHaveText(`${START_SLOTS + 2} de ${MAX_SLOTS} casillas`);
    });

    test.describe("in English", () => {
        test.use({ locale: "en-US", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });

        test("reads slots in English", async ({ page }) => {
            await page.goto("/calculator");
            await expect(page.locator("#hand-count")).toHaveText(`${START_SLOTS} of ${MAX_SLOTS} slots`);
        });
    });
});

test.describe("the Workbench frame", () => {
    test.use({ viewport: { width: 1280, height: 1000 } });

    const bar = (page: Page, selector: string): Promise<string> =>
        page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor);

    test("has one h1 and a subtitle", async ({ page }) => {
        await page.goto("/calculator");
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.locator("h1")).toHaveText("Calculadora de fusiones");
        await expect(page.getByText("Introduce las cartas que tienes.")).toBeVisible();
    });

    test("puts the hand in a panel with a grey bar that holds the title and the count", async ({ page }) => {
        await page.goto("/calculator");
        expect(await bar(page, "#hand-section .win-bar")).toBe("rgb(60, 62, 69)");
        await expect(page.locator("#hand-section .win-bar h2")).toHaveText("Tu mano");
        await expect(page.locator("#hand-section .win-bar #hand-count")).toBeVisible();
    });

    test("shows the slots in use as filled pips of a twelve pip meter", async ({ page }) => {
        await page.goto("/calculator");
        const filled = page.locator('#hand-meter .pip[data-on="true"]');
        await expect(page.locator("#hand-meter .pip")).toHaveCount(MAX_SLOTS);
        await expect(filled).toHaveCount(START_SLOTS);
        await page.locator("#addSlotBtn").click();
        await expect(filled).toHaveCount(START_SLOTS + 1);
        await page.locator(".remove-btn").first().click();
        await expect(filled).toHaveCount(START_SLOTS);
    });

    test("frames a filled slot as a card tile of its kind", async ({ page }) => {
        await page.goto("/calculator");
        await fillSlot(page, 0, "Mystical Elf");
        await fillSlot(page, 1, "Legendary Sword");
        await fillSlot(page, 2, "Dark Hole");
        const tile = (index: number) => slotAt(page, index).locator(".slot-tile");
        await expect(tile(0)).toHaveClass(/bg-card-monster/);
        await expect(tile(0).locator(".slot-stat")).toHaveText("800 / 2000");
        await expect(tile(1)).toHaveClass(/bg-card-equip/);
        await expect(tile(1).locator(".slot-stat")).toHaveText("Equip");
        await expect(tile(2)).toHaveClass(/bg-card-magic/);
    });

    test("gives the chain panel a blue bar and the results panel a grey one", async ({ page }) => {
        await page.goto("/calculator");
        await fillPair(page);
        expect(await bar(page, "#chain-section .win-bar")).toBe("rgb(31, 70, 176)");
        await expect(page.locator("#chain-section .win-bar h2")).toHaveText("Cadena óptima de fusiones");
        expect(await bar(page, "#results-hint .win-bar")).toBe("rgb(60, 62, 69)");
    });

    test("keeps the hand panel in view on a tall desktop window", async ({ page }) => {
        await page.goto("/calculator");
        await expect(page.locator("#hand-section")).toHaveCSS("position", "sticky");
    });
});
