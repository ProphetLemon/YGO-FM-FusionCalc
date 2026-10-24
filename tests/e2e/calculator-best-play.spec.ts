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
        await expect(number).toHaveCSS("font-family", /JetBrains Mono/);
    });

    test("makes the final card clearly bigger than the cards of the steps", async ({ page }) => {
        await openCalculator(page);
        await fillProblemHand(page);

        const best = page.locator("#chain-output .chain-best");
        await expect(best).toBeVisible();
        const final = await best.locator(".chain-final > div").first().boundingBox();
        const step = await best.locator(".chain-step .w-10").first().boundingBox();
        expect(final).not.toBeNull();
        expect(step).not.toBeNull();
        expect(final!.height).toBeGreaterThan(step!.height * 2);
    });

    test("keeps the other chains folded away in a details element, with a reachable summary", async ({
        page,
    }) => {
        await openCalculator(page);
        await fillProblemHand(page);
        await expect(page.locator("#chain-output .chain-best")).toBeVisible();

        const others = page.locator("#chain-output details.chain-others");
        await expect(others).toHaveCount(1);
        await expect(others).not.toHaveAttribute("open", "");
        const summary = others.locator("summary");
        await expect(summary).toHaveText(/^Otras cadenas \(\d+\)$/);
        const box = await summary.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);

        const count = Number(/\((\d+)\)/.exec((await summary.textContent()) ?? "")?.[1]);
        await expect(others.locator(".chain-entry")).toHaveCount(count);
        await expect(others.locator(".chain-entry").first()).toBeHidden();
        await summary.focus();
        await page.keyboard.press("Enter");
        await expect(others.locator(".chain-entry").first()).toBeVisible();
        await expect(others.locator(".chain-entry .chain-final").first()).toBeVisible();
    });

    test("shows the results split as before next to the best play", async ({ page }) => {
        await openCalculator(page);
        await fillProblemHand(page);

        await expect(page.locator("#chain-section")).toBeVisible();
        await expect(page.locator("#outputarealeft h2")).toHaveCount(1);
        await expect(page.locator("#outputarearight h2")).toHaveCount(1);
    });
});
