import { expect, test } from "@playwright/test";
import { BOARD_SIZE, ZONE_SIZE, ZONES } from "./helpers/board.js";

test("calculator loads with fifteen empty slots in three zones", async ({ page }) => {
    await page.goto("/calculator");
    await expect(page.locator(".board-slot")).toHaveCount(BOARD_SIZE);
    for (const zone of ZONES) {
        await expect(page.locator(`#zone-${zone} .board-slot`)).toHaveCount(ZONE_SIZE);
    }
});

test("the slots cannot be added or removed", async ({ page }) => {
    await page.goto("/calculator");
    await expect(page.locator("#addSlotBtn")).toHaveCount(0);
    await expect(page.locator(".remove-btn")).toHaveCount(0);
});

test("calculator finds fusion when hand contains a known pair", async ({ page }) => {
    await page.goto("/calculator");
    const hand1 = page.locator("#zone-hand .board-slot").nth(0).locator("input");
    const hand2 = page.locator("#zone-hand .board-slot").nth(1).locator("input");
    await hand1.fill("Mystical Elf");
    await hand1.dispatchEvent("change");
    await hand2.fill("Mushroom Man");
    await hand2.dispatchEvent("change");
    await expect(page.locator("#outputarealeft")).toContainText("Mystical Elf", { timeout: 5000 });
    await expect(page.locator("#outputarealeft")).toContainText("Mushroom Man");
});

test("reset clears all hand inputs and outputs", async ({ page }) => {
    await page.goto("/calculator");
    const hand1 = page.locator("#zone-hand .board-slot").nth(0).locator("input");
    await hand1.fill("Mystical Elf");
    await hand1.dispatchEvent("change");
    await page.locator("#resetBtn").click();
    await expect(hand1).toHaveValue("");
    await expect(page.locator("#outputarealeft")).toBeEmpty();
});

test("reset keeps the fifteen slots", async ({ page }) => {
    await page.goto("/calculator");
    await page.locator("#resetBtn").click();
    await expect(page.locator(".board-slot")).toHaveCount(BOARD_SIZE);
});

test("the chain is searched by itself for a known fusable pair", async ({ page }) => {
    await page.goto("/calculator");
    const hand1 = page.locator("#zone-hand .board-slot").nth(0).locator("input");
    const hand2 = page.locator("#zone-hand .board-slot").nth(1).locator("input");
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
