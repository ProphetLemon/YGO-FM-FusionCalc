import { expect, test } from "@playwright/test";

test("search by name renders the card and lists fusions", async ({ page }) => {
    await page.goto("/search");
    const input = page.locator("#cardname");
    await input.fill("Mystical Elf");
    // The suggestion list opens below the input and covers the buttons until it is dismissed.
    await input.press("Escape");
    await page.locator("#search-name-btn").click();
    await expect(page.locator("#outputcard")).toContainText("Mystical Elf");
    await expect(page.locator("#output-area-left")).toContainText("Mystical Elf");
});

test("search by name shows error when card does not exist", async ({ page }) => {
    await page.goto("/search");
    await page.locator("#cardname").fill("Not A Real Card 12345");
    await page.locator("#search-name-btn").click();
    await expect(page.locator("#search-msg")).toContainText(/No (card|se ha encontrado)/);
});

test("search result lists are panels with coloured header bars", async ({ page }) => {
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
    await page.goto("/search");
    // Started with the change event, as the other search specs do: a click after typing fires it too.
    await page.locator("#cardname").fill("Mystical Elf");
    await page.locator("#cardname").dispatchEvent("change");
    const bar = (area: string) =>
        page.locator(`${area} > h2`).evaluate((el) => getComputedStyle(el).backgroundColor);
    await expect(page.locator("#output-area-left > h2")).toBeVisible();
    expect(await bar("#output-area-left")).toBe("rgb(23, 98, 50)");
    await expect(page.locator("#output-area-right > h2")).toBeVisible();
    expect(await bar("#output-area-right")).toBe("rgb(163, 32, 26)");
});

test("search errors use the Workbench error red", async ({ page }) => {
    await page.goto("/search");
    await page.locator("#search-name-btn").click();
    const alert = page.locator("#search-msg [role='alert']");
    await expect(alert).toBeVisible();
    expect(await alert.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(163, 32, 26)");
});

test("the suggestion list opens below the search input, not over it", async ({ page }) => {
    await page.goto("/search");
    const input = page.locator("#cardname");
    await input.pressSequentially("Celtic Gu");
    const list = page.locator("[role='listbox']");
    await expect(list).toBeVisible();
    const inputBox = await input.boundingBox();
    const listBox = await list.boundingBox();
    expect(listBox!.y).toBeGreaterThanOrEqual(inputBox!.y + inputBox!.height);
});
