import { expect, test } from "@playwright/test";

test("home page loads with expected title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Yu-Gi-Oh/i);
    await expect(page.locator("header.navbar")).toBeVisible();
});

test("fusion search page loads", async ({ page }) => {
    const response = await page.goto("/fusion-search.html");
    expect(response?.status()).toBe(200);
    await expect(page.locator("header.navbar")).toBeVisible();
});

test("fusion calculator page loads", async ({ page }) => {
    const response = await page.goto("/fusion-calculator.html");
    expect(response?.status()).toBe(200);
    await expect(page.locator("header.navbar")).toBeVisible();
});

test("about page loads", async ({ page }) => {
    const response = await page.goto("/about.html");
    expect(response?.status()).toBe(200);
    await expect(page.locator("header.navbar")).toBeVisible();
});
