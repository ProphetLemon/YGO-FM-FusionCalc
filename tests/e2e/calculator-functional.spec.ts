import { expect, test } from "@playwright/test";

test("calculator loads with two empty slots", async ({ page }) => {
    await page.goto("/calculator");
    await expect(page.locator(".hand-slot")).toHaveCount(2);
});

test("add slot button increases slot count", async ({ page }) => {
    await page.goto("/calculator");
    await page.locator("#addSlotBtn").click();
    await expect(page.locator(".hand-slot")).toHaveCount(3);
});

test("remove slot buttons are hidden at minimum slots", async ({ page }) => {
    await page.goto("/calculator");
    const removeBtns = page.locator(".remove-btn");
    await expect(removeBtns.first()).toBeHidden();
});

test("remove slot button decreases slot count", async ({ page }) => {
    await page.goto("/calculator");
    await page.locator("#addSlotBtn").click();
    await expect(page.locator(".hand-slot")).toHaveCount(3);
    await page.locator(".remove-btn").first().click();
    await expect(page.locator(".hand-slot")).toHaveCount(2);
});

test("calculator finds fusion when hand contains a known pair", async ({ page }) => {
    await page.goto("/calculator");
    const hand1 = page.locator(".hand-slot").nth(0).locator("input");
    const hand2 = page.locator(".hand-slot").nth(1).locator("input");
    await hand1.fill("Mystical Elf");
    await hand1.dispatchEvent("change");
    await hand2.fill("Mushroom Man");
    await hand2.dispatchEvent("change");
    await expect(page.locator("#outputarealeft")).toContainText("Mystical Elf", { timeout: 5000 });
    await expect(page.locator("#outputarealeft")).toContainText("Mushroom Man");
});

test("reset clears all hand inputs and outputs", async ({ page }) => {
    await page.goto("/calculator");
    const hand1 = page.locator(".hand-slot").nth(0).locator("input");
    await hand1.fill("Mystical Elf");
    await hand1.dispatchEvent("change");
    await page.locator("#resetBtn").click();
    await expect(hand1).toHaveValue("");
    await expect(page.locator("#outputarealeft")).toBeEmpty();
});

test("reset keeps current slot count", async ({ page }) => {
    await page.goto("/calculator");
    await page.locator("#addSlotBtn").click();
    await expect(page.locator(".hand-slot")).toHaveCount(3);
    await page.locator("#resetBtn").click();
    await expect(page.locator(".hand-slot")).toHaveCount(3);
});

test("chain search finds a result for a known fusable pair", async ({ page }) => {
    await page.goto("/calculator");
    const hand1 = page.locator(".hand-slot").nth(0).locator("input");
    const hand2 = page.locator(".hand-slot").nth(1).locator("input");
    await hand1.fill("Mystical Elf");
    await hand1.dispatchEvent("change");
    await hand2.fill("Mushroom Man");
    await hand2.dispatchEvent("change");
    await page.locator("#chainBtn").click();
    await expect(page.locator("#chain-output")).not.toBeEmpty({ timeout: 5000 });
});

test("chain search shows no-result message for empty hand", async ({ page }) => {
    await page.goto("/calculator");
    await page.locator("#chainBtn").click();
    await expect(page.locator("#chain-output")).not.toBeEmpty({ timeout: 3000 });
});
