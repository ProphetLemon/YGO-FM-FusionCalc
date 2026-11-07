import { expect, test, type Locator, type Page } from "@playwright/test";
import { fillBoard, fillSlot, openCalculator, zoneSlot, type Zone } from "./helpers/board.js";

const MYSTICAL_ELF = "Mystical Elf";
const MUSHROOM_MAN = "Mushroom Man";
// Two cards with one fusion between them and no ritual.
const FUSION_RESULT = "Queen of Autumn Leaves";
// Legendary Sword and Sparks make Salamandra, an Equip: the one fusion here that does not make a monster.
const NON_MONSTER_HAND = ["Legendary Sword", "Sparks", MYSTICAL_ELF, MUSHROOM_MAN, "Baby Dragon"];
const NON_MONSTER_RESULT = "Salamandra";
// Five monsters that fuse with nothing among themselves, to fill the monster zone.
const FULL_ZONE = ["Celtic Guardian", "Zone Eater", "Kanikabuto", "Petit Dragon", "Dark Magician"];

test.beforeEach(async ({ page }) => {
    // The specs check behaviour, not artwork, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

function nameIn(page: Page, zone: Zone, index: number): Locator {
    return zoneSlot(page, zone, index).locator(".slot-name");
}

async function expectEmpty(page: Page, zone: Zone, index: number): Promise<void> {
    await expect(zoneSlot(page, zone, index).locator(".slot-filled")).toBeHidden();
    await expect(zoneSlot(page, zone, index).locator("input")).toHaveValue("");
}

test.describe("Applying a fusion to the board", () => {
    test("two hand cards: the result goes to the first empty monster slot and both hand slots empty", async ({
        page,
    }) => {
        await openCalculator(page);
        await fillBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });
        const rows = page.locator("#outputarealeft .fusion-row");
        await expect(rows).toHaveCount(1);

        // The pointer hits the row, not the button by name: the whole row is the target.
        await rows.first().click();

        await expect(nameIn(page, "monster", 0)).toHaveText(FUSION_RESULT);
        await expectEmpty(page, "hand", 0);
        await expectEmpty(page, "hand", 1);
        await expect(page.locator("#board-count")).toHaveText("1 de 15 cartas");
        // One card is left, so there is nothing to fuse and the old row is gone.
        await expect(rows).toHaveCount(0);
        await expect(page.locator("#chain-section")).toBeHidden();
    });

    test("the first empty monster slot is the first one that is free, not the first one", async ({
        page,
    }) => {
        await openCalculator(page);
        await fillBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });
        await fillSlot(page, "monster", 0, "Celtic Guardian");
        await fillSlot(page, "monster", 1, "Zone Eater");
        const rows = page.locator("#outputarealeft .fusion-row");
        await expect(rows.filter({ hasText: FUSION_RESULT })).toHaveCount(1);

        await rows.filter({ hasText: FUSION_RESULT }).first().click();

        await expect(nameIn(page, "monster", 0)).toHaveText("Celtic Guardian");
        await expect(nameIn(page, "monster", 1)).toHaveText("Zone Eater");
        await expect(nameIn(page, "monster", 2)).toHaveText(FUSION_RESULT);
    });

    test("one operand on the field: the result replaces it there and the hand slot empties", async ({
        page,
    }) => {
        await openCalculator(page);
        // The monster sits in the fourth slot and the hand card in the last one, to prove the slots come from
        // the answer's references and not from the order of the cards.
        await fillSlot(page, "hand", 4, MYSTICAL_ELF);
        await fillSlot(page, "monster", 3, MUSHROOM_MAN);
        const rows = page.locator("#outputarealeft .fusion-row");
        await expect(rows).toHaveCount(1);

        await rows.first().click();

        await expect(nameIn(page, "monster", 3)).toHaveText(FUSION_RESULT);
        await expectEmpty(page, "hand", 4);
        await expectEmpty(page, "monster", 0);
        await expect(page.locator("#board-count")).toHaveText("1 de 15 cartas");
    });

    test("one operand on the field and the same card also in the hand: the field one is the one used", async ({
        page,
    }) => {
        await openCalculator(page);
        await fillBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });
        await fillSlot(page, "monster", 1, MUSHROOM_MAN);
        const rows = page.locator("#outputarealeft .fusion-row");
        await expect(rows.filter({ hasText: FUSION_RESULT })).toHaveCount(2);

        // Hand + hand comes first in the answer, hand + field second.
        await rows.filter({ hasText: FUSION_RESULT }).nth(1).click();

        await expect(nameIn(page, "monster", 1)).toHaveText(FUSION_RESULT);
        await expectEmpty(page, "hand", 0);
        await expect(nameIn(page, "hand", 1)).toHaveText(MUSHROOM_MAN);
    });

    test("a full monster zone changes nothing and the status says so", async ({ page }) => {
        await openCalculator(page);
        await fillBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN], monster: FULL_ZONE });
        const rows = page.locator("#outputarealeft .fusion-row");
        await expect(rows.filter({ hasText: FUSION_RESULT })).toHaveCount(1);

        await rows.filter({ hasText: FUSION_RESULT }).first().click();

        await expect(page.locator("#apply-status")).toHaveText(
            "La zona de monstruos está llena. Vacía una casilla para colocar el resultado."
        );
        await expect(page.locator("#apply-status")).toHaveAttribute("role", "status");
        await expect(nameIn(page, "hand", 0)).toHaveText(MYSTICAL_ELF);
        await expect(nameIn(page, "hand", 1)).toHaveText(MUSHROOM_MAN);
        for (const [index, name] of FULL_ZONE.entries())
            await expect(nameIn(page, "monster", index)).toHaveText(name);
        await expect(page.locator("#board-count")).toHaveText("7 de 15 cartas");
    });

    test("a full monster zone still lets a field operand be replaced", async ({ page }) => {
        await openCalculator(page);
        await fillBoard(page, {
            hand: [MYSTICAL_ELF],
            monster: [MUSHROOM_MAN, "Zone Eater", "Kanikabuto", "Petit Dragon", "Dark Magician"],
        });
        const rows = page.locator("#outputarealeft .fusion-row");
        await expect(rows.filter({ hasText: FUSION_RESULT })).toHaveCount(1);

        await rows.filter({ hasText: FUSION_RESULT }).first().click();

        await expect(nameIn(page, "monster", 0)).toHaveText(FUSION_RESULT);
        await expectEmpty(page, "hand", 0);
        await expect(page.locator("#apply-status")).toBeEmpty();
    });

    test("the status clears once a fusion is applied after room was made", async ({ page }) => {
        await openCalculator(page);
        await fillBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN], monster: FULL_ZONE });
        const row = page.locator("#outputarealeft .fusion-row").filter({ hasText: FUSION_RESULT });
        await row.first().click();
        await expect(page.locator("#apply-status")).not.toBeEmpty();

        await zoneSlot(page, "monster", 4).locator(".clear-btn").click();
        await expect(nameIn(page, "monster", 4)).toHaveCount(1);
        await expect(page.locator("#apply-status")).toBeEmpty();
        await row.first().click();

        await expect(nameIn(page, "monster", 4)).toHaveText(FUSION_RESULT);
        await expect(page.locator("#apply-status")).toBeEmpty();
    });

    test("the row has a button that names what it does, and Enter on it applies the fusion", async ({
        page,
    }) => {
        await openCalculator(page);
        await fillBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });
        const row = page.locator("#outputarealeft .fusion-row");
        await expect(row).toHaveCount(1);
        await expect(row).toHaveAttribute("role", "row");

        const button = row.getByRole("button");
        await expect(button).toHaveAccessibleName(
            `Fusionar ${MYSTICAL_ELF} y ${MUSHROOM_MAN} en ${FUSION_RESULT}`
        );
        await button.focus();
        await page.keyboard.press("Enter");

        await expect(nameIn(page, "monster", 0)).toHaveText(FUSION_RESULT);
        await expectEmpty(page, "hand", 1);
        await expect(row).toHaveCount(0);
        // The focused row is gone and one card cannot fuse, so the keyboard lands on the board, not at the top.
        await expect(page.locator("#board-title")).toBeFocused();
    });

    test("recomputes the results for the new board and keeps the other cards in place", async ({ page }) => {
        await openCalculator(page);
        await fillBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN, "Baby Dragon"] });
        const rows = page.locator("#outputarealeft .fusion-row");
        await expect(rows.first()).toBeVisible();

        await rows.filter({ hasText: FUSION_RESULT }).first().click();

        await expect(nameIn(page, "monster", 0)).toHaveText(FUSION_RESULT);
        await expectEmpty(page, "hand", 0);
        await expectEmpty(page, "hand", 1);
        await expect(nameIn(page, "hand", 2)).toHaveText("Baby Dragon");
        // The rows were drawn again for the new board: Queen of Autumn Leaves fuses with Baby Dragon now, and
        // the pair that was applied is gone.
        await expect(rows.filter({ hasText: MUSHROOM_MAN })).toHaveCount(0);
        await expect(page.locator("#fusions-title")).toBeFocused();
    });

    test("the new board survives a reload", async ({ page }) => {
        await openCalculator(page);
        await fillBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });
        await page.locator("#outputarealeft .fusion-row").first().click();
        await expect(nameIn(page, "monster", 0)).toHaveText(FUSION_RESULT);

        await page.reload();

        await expect(nameIn(page, "monster", 0)).toHaveText(FUSION_RESULT);
        await expectEmpty(page, "hand", 0);
        await expectEmpty(page, "hand", 1);
    });

    test("a row of the table of results that are not monsters applies too, into the hand", async ({
        page,
    }) => {
        await openCalculator(page);
        await fillBoard(page, { hand: NON_MONSTER_HAND });
        const other = page.locator("#outputareaother .fusion-row");
        await expect(other).toHaveCount(1);
        await expect(page.locator("#board-count")).toHaveText("5 de 15 cartas");

        await other.getByRole("button").focus();
        await page.keyboard.press("Enter");

        // A Salamandra cannot sit in the monster zone, so it takes the place of the first hand card.
        await expect(nameIn(page, "hand", 0)).toHaveText(NON_MONSTER_RESULT);
        await expectEmpty(page, "hand", 1);
        await expect(page.locator("#zone-monster .slot-filled:not(.hidden)")).toHaveCount(0);
        await expect(page.locator("#board-count")).toHaveText("4 de 15 cartas");
        await expect(page.locator("#outputareaother .fusion-row")).toHaveCount(0);
    });
});
