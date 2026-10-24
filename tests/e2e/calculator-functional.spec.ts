import { expect, test } from "@playwright/test";

const START_SLOTS = 5;

test("calculator loads with five empty slots", async ({ page }) => {
    await page.goto("/calculator");
    await expect(page.locator(".hand-slot")).toHaveCount(START_SLOTS);
});

test("add slot button increases slot count", async ({ page }) => {
    await page.goto("/calculator");
    await page.locator("#addSlotBtn").click();
    await expect(page.locator(".hand-slot")).toHaveCount(START_SLOTS + 1);
});

test("remove slot buttons are hidden at minimum slots", async ({ page }) => {
    await page.goto("/calculator");
    const removeBtns = page.locator(".remove-btn");
    await expect(removeBtns.first()).toBeHidden();
});

test("remove slot button decreases slot count", async ({ page }) => {
    await page.goto("/calculator");
    await page.locator("#addSlotBtn").click();
    await expect(page.locator(".hand-slot")).toHaveCount(START_SLOTS + 1);
    await page.locator(".remove-btn").first().click();
    await expect(page.locator(".hand-slot")).toHaveCount(START_SLOTS);
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
    await expect(page.locator(".hand-slot")).toHaveCount(START_SLOTS + 1);
    await page.locator("#resetBtn").click();
    await expect(page.locator(".hand-slot")).toHaveCount(START_SLOTS + 1);
});

test("the chain is searched by itself for a known fusable pair", async ({ page }) => {
    await page.goto("/calculator");
    const hand1 = page.locator(".hand-slot").nth(0).locator("input");
    const hand2 = page.locator(".hand-slot").nth(1).locator("input");
    await hand1.fill("Mystical Elf");
    await hand1.dispatchEvent("change");
    await hand2.fill("Mushroom Man");
    await hand2.dispatchEvent("change");
    await expect(page.locator("#chain-output .chain-best")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#chain-output")).toContainText("Queen of Autumn Leaves");
});

test("the chain section stays hidden and nothing is searched for an empty hand", async ({ page }) => {
    const chainRequests: string[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/chain-search") chainRequests.push(request.url());
    });
    await page.goto("/calculator");
    await expect(page.locator("#results-status")).not.toBeEmpty();
    await expect(page.locator("#chain-section")).toBeHidden();
    await expect(page.locator("#chain-output")).toBeEmpty();
    await expect(page.locator("#chainBtn")).toBeHidden();
    expect(chainRequests).toHaveLength(0);
});
