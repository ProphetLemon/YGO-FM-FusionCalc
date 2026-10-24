import { expect, test, type Locator, type Page } from "@playwright/test";

// The hand the redesign was built around: the best single fusion is Sword Arm of Dragon (1750 ATK) but a
// chain of two steps reaches Kaminari Attack (1900 ATK). No API is mocked here: this is the real answer.
const PROBLEM_HAND = [
    "Petit Dragon",
    "Kanikabuto",
    "Mystical Elf",
    "Celtic Guardian",
    "Legendary Sword",
    "Zone Eater",
    "Sparks",
];

function slotAt(page: Page, index: number): Locator {
    return page.locator(".hand-slot").nth(index);
}

// The slots exist at once but the hand is read from the card index, which arrives a little later.
async function openCalculator(page: Page): Promise<void> {
    await page.goto("/calculator");
    const input = slotAt(page, 0).locator("input");
    await input.fill("Mystical");
    await expect(page.getByRole("option", { name: "Mystical Elf", exact: true })).toBeVisible();
    await input.fill("");
}

// Fills the hand without a single click on anything but "Add card": the answer must come by itself.
async function fillProblemHand(page: Page): Promise<void> {
    while ((await page.locator(".hand-slot").count()) < PROBLEM_HAND.length) {
        await page.locator("#addSlotBtn").click();
    }
    for (const [index, name] of PROBLEM_HAND.entries()) {
        const input = slotAt(page, index).locator("input");
        await input.fill(name);
        await input.dispatchEvent("change");
        await expect(slotAt(page, index).locator(".slot-name")).toHaveText(name);
    }
}

test.beforeEach(async ({ page }) => {
    // The specs check the markup, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

test.describe("the best play for the real hand", () => {
    test("is announced in Spanish without any click", async ({ page }) => {
        await openCalculator(page);
        await fillProblemHand(page);

        const best = page.locator("#chain-output .chain-best");
        await expect(best).toBeVisible();
        await expect(best.locator(".chain-verdict")).toHaveText(
            "Fusiona en 2 pasos para obtener Kaminari Attack."
        );
        await expect(best.locator(".chain-final-atk")).toHaveText("ATK final: 1900");
        await expect(best.locator(".chain-final-atk span").last()).toHaveText("1900");
        await expect(best.locator(".chain-gain")).toHaveText(
            "150 de ATK más que tu mejor fusión simple, Sword Arm of Dragon (1750)."
        );
        await expect(best.locator(".chain-step")).toHaveCount(2);
        await expect(best.locator(".chain-step > p")).toHaveText(["Paso 1", "Paso 2"]);
        // Step 2 fuses Spike Seadra, which step 1 made, so only that operand carries the caption.
        const carried = best.locator(".chain-carried");
        await expect(carried).toHaveText("Resultado del paso 1");
        await expect(best.locator(".chain-step").nth(1).locator(".chain-carried")).toHaveCount(1);
        await expect(carried.locator("xpath=preceding-sibling::*[1]")).toContainText("Spike Seadra");
        // The best single fusion is the first monster of the results column.
        await expect(page.locator("#outputarealeft > div").first()).toContainText("Sword Arm of Dragon");
    });

    test("is announced in English without any click", async ({ browser }) => {
        const context = await browser.newContext({
            locale: "en-US",
            extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
        });
        const page = await context.newPage();
        await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
        try {
            await openCalculator(page);
            await fillProblemHand(page);

            const best = page.locator("#chain-output .chain-best");
            await expect(best.locator(".chain-verdict")).toHaveText(
                "Fuse in 2 steps to make Kaminari Attack."
            );
            await expect(best.locator(".chain-final-atk")).toHaveText("Final ATK: 1900");
            await expect(best.locator(".chain-gain")).toHaveText(
                "150 ATK more than your best single fusion, Sword Arm of Dragon (1750)."
            );
            await expect(best.locator(".chain-step > p")).toHaveText(["Step 1", "Step 2"]);
            await expect(best.locator(".chain-carried")).toHaveText("Result of step 1");
        } finally {
            await context.close();
        }
    });

    test("shows the final ATK as the biggest number on the page, in the display font", async ({ page }) => {
        await openCalculator(page);
        await fillProblemHand(page);

        const number = page.locator("#chain-output .chain-best .chain-final-atk span").last();
        await expect(number).toHaveText("1900");
        const fontSizes = await page.evaluate(() =>
            [...document.querySelectorAll("body *")]
                .filter(
                    (element) => element.children.length === 0 && (element.textContent ?? "").trim() !== ""
                )
                .map((element) => parseFloat(getComputedStyle(element).fontSize))
        );
        const numberSize = await number.evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize)
        );
        expect(numberSize).toBeGreaterThanOrEqual(Math.max(...fontSizes));
        expect(numberSize).toBeGreaterThanOrEqual(40);
        await expect(number).toHaveCSS("font-family", /Chakra Petch/);
    });

    test("makes the final card clearly bigger than the cards of the steps", async ({ page }) => {
        await openCalculator(page);
        await fillProblemHand(page);

        const best = page.locator("#chain-output .chain-best");
        await expect(best).toBeVisible();
        const final = await best.locator(".chain-final .card-tile").boundingBox();
        const step = await best.locator(".chain-step .card-tile").first().boundingBox();
        expect(final).not.toBeNull();
        expect(step).not.toBeNull();
        expect(final!.width).toBeGreaterThan(step!.width * 1.5);
        expect(final!.height).toBeGreaterThan(step!.height * 1.5);
    });

    test("keeps the big final ATK inside its box on a phone", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await openCalculator(page);
        await fillProblemHand(page);

        const best = page.locator("#chain-output .chain-best");
        await expect(best).toBeVisible();
        const number = best.locator(".chain-final-atk span").last();
        await expect(number).toHaveText("1900");
        const numberBox = await number.boundingBox();
        const finalBox = await best.locator(".chain-final").boundingBox();
        const bodyBox = await best.locator(".chain-final").locator("xpath=..").boundingBox();
        expect(numberBox).not.toBeNull();
        expect(finalBox).not.toBeNull();
        expect(numberBox!.x).toBeGreaterThanOrEqual(finalBox!.x);
        expect(numberBox!.x + numberBox!.width).toBeLessThanOrEqual(finalBox!.x + finalBox!.width + 0.5);
        expect(finalBox!.x + finalBox!.width).toBeLessThanOrEqual(bodyBox!.x + bodyBox!.width + 0.5);
        const scrolls = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
        expect(scrolls).toBe(false);
        // Below 700px the final column goes under the steps.
        const steps = await best.locator("ol").boundingBox();
        expect(finalBox!.y).toBeGreaterThanOrEqual(steps!.y + steps!.height);
    });

    test("offers every chain in a tab, the best selected first", async ({ page }) => {
        await openCalculator(page);
        await fillProblemHand(page);
        await expect(page.locator("#chain-output .chain-best")).toBeVisible();

        const tabs = page.getByRole("tab");
        await expect(tabs).toHaveCount(4);
        await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
        await expect(tabs.first()).toContainText("Cadena 1");
        await expect(tabs.first()).toContainText("Kaminari Attack, 1900 ATK");
        await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "false");
        for (const tab of await tabs.all()) {
            expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        const entries = page.locator("#chain-output .chain-entry");
        await expect(entries).toHaveCount(4);
        await expect(entries.first()).toBeVisible();
        await expect(entries.nth(1)).toBeHidden();
        // The gain belongs to the best chain only.
        await expect(page.locator("#chain-output .chain-gain")).toHaveCount(1);
    });

    test("shows another chain when its tab is clicked and hides the best one", async ({ page }) => {
        await openCalculator(page);
        await fillProblemHand(page);
        const entries = page.locator("#chain-output .chain-entry");
        await expect(entries.first()).toBeVisible();

        const tabs = page.getByRole("tab");
        await tabs.nth(1).click();
        await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
        await expect(tabs.first()).toHaveAttribute("aria-selected", "false");
        await expect(entries.nth(1)).toBeVisible();
        await expect(entries.first()).toBeHidden();
        await expect(entries.nth(1).locator(".chain-final")).toBeVisible();
        await expect(entries.nth(1).locator(".chain-gain")).toHaveCount(0);
        await expect(entries.nth(1).locator(".chain-verdict")).toContainText("Fusiona");
    });

    test("selects chains with the arrow keys", async ({ page }) => {
        await openCalculator(page);
        await fillProblemHand(page);
        const entries = page.locator("#chain-output .chain-entry");
        await expect(entries.first()).toBeVisible();

        const tabs = page.getByRole("tab");
        await tabs.first().focus();
        await page.keyboard.press("ArrowRight");
        await expect(tabs.nth(1)).toBeFocused();
        await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
        await expect(entries.nth(1)).toBeVisible();
        await expect(entries.first()).toBeHidden();

        await page.keyboard.press("End");
        await expect(tabs.nth(3)).toBeFocused();
        await expect(entries.nth(3)).toBeVisible();
        await page.keyboard.press("ArrowRight");
        await expect(tabs.first()).toBeFocused();
        await expect(entries.first()).toBeVisible();
        // Only the selected tab is in the tab order.
        await expect(tabs.nth(1)).toHaveAttribute("tabindex", "-1");
    });

    test("puts the tabs in two columns and the chain in one column on a phone", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await openCalculator(page);
        await fillProblemHand(page);
        await expect(page.locator("#chain-output .chain-best")).toBeVisible();

        const tabs = page.getByRole("tab");
        const first = (await tabs.nth(0).boundingBox())!;
        const second = (await tabs.nth(1).boundingBox())!;
        const third = (await tabs.nth(2).boundingBox())!;
        expect(second.y).toBeCloseTo(first.y, 0);
        expect(third.y).toBeGreaterThan(first.y);
    });

    test("shows the results split as before next to the best play", async ({ page }) => {
        await openCalculator(page);
        await fillProblemHand(page);

        await expect(page.locator("#chain-section")).toBeVisible();
        await expect(page.locator("#outputarealeft h2")).toHaveCount(1);
        await expect(page.locator("#outputarearight h2")).toHaveCount(1);
    });
});
