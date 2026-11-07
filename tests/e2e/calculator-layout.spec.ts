import { expect, test, type Locator, type Page } from "@playwright/test";
import { BOARD_SIZE, ZONES, ZONE_SIZE } from "./helpers/board.js";

const PAIR = ["Mystical Elf", "Mushroom Man"] as const;

test.beforeEach(async ({ page }) => {
    // The specs check the layout, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

function slotAt(page: Page, index: number): Locator {
    return page.locator("#zone-hand .board-slot").nth(index);
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
        const hand = await box(page.locator("#board-section"));
        const answer = await box(page.locator("#answer-column"));
        expect(hand.x + hand.width).toBeLessThanOrEqual(answer.x);
        expect(Math.abs(hand.y - answer.y)).toBeLessThanOrEqual(1);
        expect(answer.width).toBeGreaterThan(hand.width);
    });

    test("the board column is 540 px wide", async ({ page }) => {
        await page.goto("/calculator");
        const board = await box(page.locator("#board-section"));
        expect(board.width).toBeCloseTo(540, 0);
    });

    test("the answer column stays right of the hand once there is an answer", async ({ page }) => {
        await page.goto("/calculator");
        await fillPair(page);
        await expect(page.locator("#answer-column")).toHaveAttribute("data-has-answer", "true");
        const hand = await box(page.locator("#board-section"));
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
        const hand = await box(page.locator("#board-section"));
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
        const hand = await box(page.locator("#board-section"));
        expect(answer.y + answer.height).toBeLessThanOrEqual(hand.y);

        await page.locator("#resetBtn").click();
        await expect(column).toHaveAttribute("data-has-answer", "false");
        const handAfter = await box(page.locator("#board-section"));
        const answerAfter = await box(column);
        expect(handAfter.y + handAfter.height).toBeLessThanOrEqual(answerAfter.y);
    });

    test("the DOM order stays hand first", async ({ page }) => {
        await page.goto("/calculator");
        await fillPair(page);
        const handFirst = await page.evaluate(() => {
            const hand = document.querySelector("#board-section");
            const answer = document.querySelector("#answer-column");
            if (!hand || !answer) return false;
            return Boolean(hand.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING);
        });
        expect(handFirst).toBe(true);
    });
});

// Where the first row of a zone ends: how many slots share the height of the first one.
async function slotsInFirstRow(page: Page, zone: string): Promise<number> {
    const slots = page.locator(`#zone-${zone} .board-slot`);
    const first = await box(slots.first());
    let count = 0;
    for (let i = 0; i < (await slots.count()); i++) {
        const next = await box(slots.nth(i));
        if (Math.abs(next.y - first.y) <= 1) count++;
    }
    return count;
}

async function hasHorizontalScroll(page: Page): Promise<boolean> {
    return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

test.describe("board layout at 1280 px", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("shows the three windows one under the other, five slots across in each", async ({ page }) => {
        await page.goto("/calculator");
        const hand = await box(page.locator("#zone-hand"));
        const monsters = await box(page.locator("#zone-monster"));
        const spells = await box(page.locator("#zone-spell"));
        expect(hand.y + hand.height).toBeLessThanOrEqual(monsters.y);
        expect(monsters.y + monsters.height).toBeLessThanOrEqual(spells.y);
        for (const zone of ZONES) expect(await slotsInFirstRow(page, zone)).toBe(5);
        expect(await hasHorizontalScroll(page)).toBe(false);
    });

    test("reaches 8 px past a filled tile with a 44 px clear button, inside the gap between two tiles", async ({
        page,
    }) => {
        await page.goto("/calculator");
        await fillSlot(page, 0, PAIR[0]);
        const slot = slotAt(page, 0);
        const tile = await box(slot.locator(".slot-tile"));
        const clear = await box(slot.locator(".clear-btn"));
        expect(clear.width).toBeCloseTo(44, 0);
        expect(clear.height).toBeCloseTo(44, 0);
        expect(clear.x + clear.width - (tile.x + tile.width)).toBeCloseTo(8, 0);
        expect(tile.y - clear.y).toBeCloseTo(8, 0);
    });
});

test.describe("board layout at 375 px", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("has no horizontal scroll, even with a card in every slot of the board", async ({ page }) => {
        await page.goto("/calculator");
        await fillSlot(page, 0, PAIR[0]);
        expect(await hasHorizontalScroll(page)).toBe(false);
        for (const zone of ZONES) {
            const window = await box(page.locator(`#zone-${zone}`));
            expect(window.x).toBeGreaterThanOrEqual(0);
            expect(window.x + window.width).toBeLessThanOrEqual(375);
        }
    });

    test("lays the slots out three and two", async ({ page }) => {
        await page.goto("/calculator");
        for (const zone of ZONES) expect(await slotsInFirstRow(page, zone)).toBe(3);
    });

    test("keeps the clear button inside 4 px past the tile, so its 44 px stay near it", async ({ page }) => {
        await page.goto("/calculator");
        await fillSlot(page, 0, PAIR[0]);
        const slot = slotAt(page, 0);
        const tile = await box(slot.locator(".slot-tile"));
        const clear = await box(slot.locator(".clear-btn"));
        expect(clear.width).toBeCloseTo(44, 0);
        expect(clear.x + clear.width - (tile.x + tile.width)).toBeCloseTo(4, 0);
        expect(tile.y - clear.y).toBeCloseTo(4, 0);
    });
});

test.describe("board layout between a phone and a desktop", () => {
    test("is full width and five slots across from 480 px, with the zone grids capped near 560 px", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 480, height: 900 });
        await page.goto("/calculator");
        for (const zone of ZONES) expect(await slotsInFirstRow(page, zone)).toBe(5);
        expect(await hasHorizontalScroll(page)).toBe(false);

        await page.setViewportSize({ width: 1000, height: 900 });
        const board = await box(page.locator("#board-section"));
        const win = await box(page.locator("#zone-hand"));
        const grid = await box(page.locator("#zone-hand .zone-slots"));
        expect(win.width).toBeCloseTo(board.width, 0);
        expect(board.width).toBeGreaterThan(900);
        expect(grid.width).toBeLessThanOrEqual(560);
    });
});

test.describe("board counters", () => {
    test("read none of fifteen cards on a fresh page, and none of five in each zone", async ({ page }) => {
        await page.goto("/calculator");
        await expect(page.locator("#board-count")).toHaveText(`0 de ${BOARD_SIZE} cartas`);
        for (const zone of ZONES) {
            await expect(page.locator(`#zone-${zone} .zone-count`)).toHaveText(`0 de ${ZONE_SIZE}`);
        }
    });

    test("count the cards, zone by zone and in all", async ({ page }) => {
        await page.goto("/calculator");
        await fillSlot(page, 0, PAIR[0]);
        await fillSlot(page, 1, PAIR[1]);
        await expect(page.locator("#zone-hand .zone-count")).toHaveText("2 de 5");
        await expect(page.locator("#zone-monster .zone-count")).toHaveText("0 de 5");
        await expect(page.locator("#board-count")).toHaveText("2 de 15 cartas");
        await page.locator("#zone-monster .board-slot").first().locator("input").fill("Celtic Guardian");
        await page.locator("#zone-monster .board-slot").first().locator("input").dispatchEvent("change");
        await expect(page.locator("#zone-monster .zone-count")).toHaveText("1 de 5");
        await expect(page.locator("#board-count")).toHaveText("3 de 15 cartas");
    });

    test("is the polite live region of the board", async ({ page }) => {
        await page.goto("/calculator");
        await expect(page.locator("#board-count")).toHaveAttribute("aria-live", "polite");
    });

    test.describe("in English", () => {
        test.use({ locale: "en-US", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });

        test("read the counts in English", async ({ page }) => {
            await page.goto("/calculator");
            await expect(page.locator("#board-count")).toHaveText(`0 of ${BOARD_SIZE} cards`);
            await expect(page.locator("#zone-hand .zone-count")).toHaveText(`0 of ${ZONE_SIZE}`);
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

    test("puts each zone in a window: grey for the hand, blue for the monsters, pink for the spells", async ({
        page,
    }) => {
        await page.goto("/calculator");
        expect(await bar(page, "#zone-hand .win-bar")).toBe("rgb(60, 62, 69)");
        expect(await bar(page, "#zone-monster .win-bar")).toBe("rgb(31, 70, 176)");
        expect(await bar(page, "#zone-spell .win-bar")).toBe("rgb(156, 34, 102)");
        await expect(page.locator("#zone-hand .win-bar h3")).toHaveText("Mano");
        await expect(page.locator("#zone-monster .win-bar h3")).toHaveText("Zona de monstruos");
        await expect(page.locator("#zone-spell .win-bar h3")).toHaveText("Zona de magias y trampas");
        for (const zone of ZONES) {
            await expect(page.locator(`#zone-${zone} .win-bar .zone-count`)).toBeVisible();
            await expect(page.locator(`#zone-${zone} .win-bar .zone-clear`)).toHaveText("Vaciar");
        }
    });

    test("shows a visible heading above the windows and Reiniciar below them", async ({ page }) => {
        await page.goto("/calculator");
        const heading = await box(page.locator("#board-title"));
        const hand = await box(page.locator("#zone-hand"));
        const spells = await box(page.locator("#zone-spell"));
        const reset = await box(page.locator("#resetBtn"));
        await expect(page.locator("#board-title")).toHaveText("Tu tablero");
        expect(heading.y + heading.height).toBeLessThanOrEqual(hand.y);
        expect(spells.y + spells.height).toBeLessThanOrEqual(reset.y);
    });

    test("puts the monster and spell slots in a sunken well, not the hand", async ({ page }) => {
        await page.goto("/calculator");
        await expect(page.locator("#zone-monster .sink")).toHaveCount(1);
        await expect(page.locator("#zone-spell .sink")).toHaveCount(1);
        await expect(page.locator("#zone-hand .sink")).toHaveCount(0);
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
        await expect(page.locator("#board-section")).toHaveCSS("position", "sticky");
    });
});
