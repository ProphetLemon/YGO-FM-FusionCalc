import { expect, test, type Locator, type Page } from "@playwright/test";

const MYSTICAL_ELF = "Mystical Elf";
const MUSHROOM_MAN = "Mushroom Man";
// Two cards with one fusion between them and no ritual.
const FUSION_PAIR = [MYSTICAL_ELF, MUSHROOM_MAN];
const FUSION_RESULT = "Queen of Autumn Leaves";
// Salamandra, an Equip, is the one fusion of this hand that does not make a monster.
const PROBLEM_HAND = [
    "Petit Dragon",
    "Kanikabuto",
    MYSTICAL_ELF,
    "Celtic Guardian",
    "Legendary Sword",
    "Zone Eater",
    "Sparks",
];
const NON_MONSTER_RESULT = "Salamandra";

test.beforeEach(async ({ page }) => {
    // The specs check behaviour, not artwork, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

function slotAt(page: Page, index: number): Locator {
    return page.locator(".hand-slot").nth(index);
}

// The slots exist at once but the hand is read from the card index, which arrives a little later.
async function openCalculator(page: Page): Promise<void> {
    await page.goto("/calculator");
    const input = slotAt(page, 0).locator("input");
    await input.fill("Mystical");
    await expect(page.getByRole("option", { name: MYSTICAL_ELF, exact: true })).toBeVisible();
    await input.fill("");
}

async function fillHand(page: Page, names: readonly string[]): Promise<void> {
    while ((await page.locator(".hand-slot").count()) < names.length) {
        await page.locator("#addSlotBtn").click();
    }
    for (const [index, name] of names.entries()) {
        const input = slotAt(page, index).locator("input");
        await input.fill(name);
        await input.dispatchEvent("change");
        await expect(slotAt(page, index).locator(".slot-name")).toHaveText(name);
    }
}

test.describe("Applying a fusion to the hand", () => {
    test("a click on the row puts the result in the first slot and empties the second", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        const rows = page.locator("#outputarealeft .fusion-row");
        await expect(rows).toHaveCount(1);

        // The pointer hits the row, not the button by name: the whole row is the target.
        await rows.first().click();

        await expect(slotAt(page, 0).locator(".slot-name")).toHaveText(FUSION_RESULT);
        await expect(slotAt(page, 1).locator(".slot-filled")).toBeHidden();
        await expect(slotAt(page, 1).locator("input")).toHaveValue("");
        await expect(page.locator(".hand-slot")).toHaveCount(5);
        // One card is left, so there is nothing to fuse and the old row is gone.
        await expect(rows).toHaveCount(0);
        await expect(page.locator("#chain-section")).toBeHidden();
    });

    test("the row has a button that names what it does, and Enter on it applies the fusion", async ({
        page,
    }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        const row = page.locator("#outputarealeft .fusion-row");
        await expect(row).toHaveCount(1);
        await expect(row).toHaveAttribute("role", "row");

        const button = row.getByRole("button");
        await expect(button).toHaveAccessibleName(
            `Fusionar ${MYSTICAL_ELF} y ${MUSHROOM_MAN} en ${FUSION_RESULT}`
        );
        await button.focus();
        await page.keyboard.press("Enter");

        await expect(slotAt(page, 0).locator(".slot-name")).toHaveText(FUSION_RESULT);
        await expect(slotAt(page, 1).locator("input")).toHaveValue("");
        await expect(row).toHaveCount(0);
        // The focused row is gone and one card cannot fuse, so the keyboard lands on the hand, not at the top.
        await expect(page.locator("#hand-title")).toBeFocused();
    });

    test("recomputes the results for the new hand and keeps the other cards in place", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, [MYSTICAL_ELF, MUSHROOM_MAN, "Baby Dragon"]);
        const rows = page.locator("#outputarealeft .fusion-row");
        await expect(rows.first()).toBeVisible();
        const before = await rows.count();

        await rows.filter({ hasText: FUSION_RESULT }).first().click();

        await expect(slotAt(page, 0).locator(".slot-name")).toHaveText(FUSION_RESULT);
        await expect(slotAt(page, 1).locator("input")).toHaveValue("");
        await expect(slotAt(page, 2).locator(".slot-name")).toHaveText("Baby Dragon");
        // The rows were drawn again for the new hand: the one that was applied, whose inputs left it, is gone.
        await expect(rows.filter({ hasText: MUSHROOM_MAN })).toHaveCount(0);
        expect(before).toBeGreaterThan(0);
        // Two cards are left, so the results stay and focus goes to the fusions, where the next choice is.
        await expect(page.locator("#fusions-title")).toBeFocused();
    });

    test("the new hand survives a reload", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await page.locator("#outputarealeft .fusion-row").first().click();
        await expect(slotAt(page, 0).locator(".slot-name")).toHaveText(FUSION_RESULT);

        await page.reload();

        await expect(slotAt(page, 0).locator(".slot-name")).toHaveText(FUSION_RESULT);
        await expect(slotAt(page, 1).locator("input")).toHaveValue("");
    });

    test("a row of the table of results that are not monsters applies too", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, PROBLEM_HAND);
        const other = page.locator("#outputareaother .fusion-row");
        await expect(other).toHaveCount(1);
        const filled = page.locator(".hand-slot .slot-filled:not(.hidden)");
        await expect(filled).toHaveCount(PROBLEM_HAND.length);

        await other.getByRole("button").focus();
        await page.keyboard.press("Enter");

        await expect(page.locator(".hand-slot .slot-name", { hasText: NON_MONSTER_RESULT })).toHaveCount(1);
        // Two cards left the hand and one came in.
        await expect(filled).toHaveCount(PROBLEM_HAND.length - 1);
        await expect(page.locator("#outputareaother .fusion-row")).toHaveCount(0);
    });
});
