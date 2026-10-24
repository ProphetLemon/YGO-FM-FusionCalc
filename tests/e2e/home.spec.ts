import { expect, test } from "@playwright/test";

test.describe("home", () => {
    test("every call to action is a Workbench plate at least 44px tall", async ({ page }) => {
        await page.goto("/");
        const buttons = page.locator("main a.wb-btn");
        await expect(buttons).toHaveCount(4);
        for (const button of await buttons.all()) {
            const box = await button.boundingBox();
            expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        }
    });

    test("the sections are panels with coloured header bars", async ({ page }) => {
        await page.goto("/");
        const colours = await page
            .locator("main .win-bar")
            .evaluateAll((bars) => bars.map((bar) => getComputedStyle(bar).backgroundColor));
        expect(colours).toEqual(["rgb(60, 62, 69)", "rgb(23, 98, 50)", "rgb(31, 70, 176)"]);
    });
});
