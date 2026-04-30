import { expect, test } from "@playwright/test";

test("search by name renders the card and lists fusions", async ({ page }) => {
    await page.goto("/search");
    const input = page.locator("#cardname");
    await input.fill("Mystical Elf");
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
