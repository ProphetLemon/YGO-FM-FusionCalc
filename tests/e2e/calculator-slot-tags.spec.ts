import { expect, test, type Locator } from "@playwright/test";
import { fillSlot, openCalculator } from "./helpers/board.js";

// Every card a result uses says the slot it stands in (D10): "Mano 3", "Monstruo 2", "Magia 1". The number is
// the place on the board, counting empty slots, not the place in the arrays the page sends. Each board here
// leaves slots empty before its cards so the two numberings differ. No API is mocked: these are real answers.

test.beforeEach(async ({ page }) => {
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

// The tag next to the operand chip that holds this card name.
function operandTag(row: Locator, name: string): Locator {
    return row.locator(".fusion-operand").filter({ hasText: name }).locator(".slot-tag");
}

test.describe("slot tags in Spanish", () => {
    test("tag a fusion with its hand card and its field monster", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, "hand", 2, "Petit Dragon");
        await fillSlot(page, "monster", 1, "Zone Eater");

        const row = page.locator("#outputarealeft .fusion-row").filter({ hasText: "Zone Eater" });
        await expect(row).toHaveCount(1);
        await expect(operandTag(row, "Petit Dragon")).toHaveText("Mano 3");
        await expect(operandTag(row, "Zone Eater")).toHaveText("Monstruo 2");
        await expect(row.locator(".slot-tag")).toHaveCount(2);
        // The chip keeps the card name alone: the tag is beside it, not inside.
        const chips = await row.locator(".fusion-input").allTextContents();
        expect([...chips].sort()).toEqual(["Petit Dragon", "Zone Eater"]);
    });

    test("tag an equip of the spell zone and the monster it targets", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, "spell", 2, "Legendary Sword");
        await fillSlot(page, "monster", 3, "Celtic Guardian");

        const equip = page.locator("#outputarearight .equip-entry");
        await expect(equip).toHaveCount(1);
        await expect(equip.locator(".card-caption")).toHaveText(["Equipo", "Monstruo"]);
        await expect(equip.locator(".slot-tag")).toHaveText(["Magia 3", "Monstruo 4"]);
        await expect(equip.locator(".slot-tag").first()).toHaveAttribute("data-zone", "spell");
    });

    test("tag an equip of the hand, whichever card the answer lists first", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, "hand", 1, "Celtic Guardian");
        await fillSlot(page, "hand", 4, "Legendary Sword");

        // The Equip card is drawn first even when the monster comes first in the hand.
        const equip = page.locator("#outputarearight .equip-entry");
        await expect(equip.locator(".card-tile-name")).toHaveText(["Legendary Sword", "Celtic Guardian"]);
        await expect(equip.locator(".slot-tag")).toHaveText(["Mano 5", "Mano 2"]);
    });

    test("tag a ritual with its card and each material", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, "hand", 3, "Yamadron Ritual");
        await fillSlot(page, "monster", 1, "Mountain Warrior");
        await fillSlot(page, "monster", 2, "Koumori Dragon");
        await fillSlot(page, "monster", 4, "Wings of Wicked Flame");

        const entry = page.locator("#rituals-output .ritual-entry");
        await expect(entry).toHaveCount(1);
        const tagOf = (name: string): Locator =>
            entry.locator(":scope > div").filter({ hasText: name }).locator(".slot-tag");
        await expect(tagOf("Yamadron Ritual").first()).toHaveText("Mano 4");
        await expect(tagOf("Mountain Warrior")).toHaveText("Monstruo 2");
        await expect(tagOf("Koumori Dragon")).toHaveText("Monstruo 3");
        await expect(tagOf("Wings of Wicked Flame")).toHaveText("Monstruo 5");
        await expect(entry.locator(".slot-tag")).toHaveCount(4);
    });

    test("tag a ritual card that stands in the spell zone", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, "spell", 1, "Yamadron Ritual");
        await fillSlot(page, "monster", 0, "Mountain Warrior");
        await fillSlot(page, "monster", 1, "Koumori Dragon");
        await fillSlot(page, "monster", 2, "Wings of Wicked Flame");

        const tags = page.locator("#rituals-output .ritual-entry .slot-tag");
        await expect(tags).toHaveText(["Magia 2", "Monstruo 1", "Monstruo 2", "Monstruo 3"]);
    });

    test("label the field monster a chain starts from, and no card of the hand", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, "monster", 2, "Mushroom Man");
        await fillSlot(page, "hand", 1, "Mystical Elf");

        const best = page.locator("#chain-output .chain-best");
        await expect(best).toBeVisible();
        await expect(best.locator(".chain-step")).toHaveCount(1);
        // The monster is the only entry in the monster array, index 0, but it stands in the third slot.
        await expect(best.locator(".slot-tag")).toHaveText("Monstruo 3");
        const field = best.locator(".chain-step > div > div").filter({ hasText: "Mushroom Man" });
        await expect(field.locator(".slot-tag")).toHaveCount(1);
    });

    test("show no tag in a chain that uses the hand only", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, "hand", 1, "Mystical Elf");
        await fillSlot(page, "hand", 3, "Mushroom Man");

        await expect(page.locator("#chain-output .chain-best")).toBeVisible();
        await expect(page.locator("#chain-output .slot-tag")).toHaveCount(0);
    });

    test("read as text a screen reader says next to the card, with contrast to spare", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, "hand", 0, "Petit Dragon");
        await fillSlot(page, "monster", 0, "Zone Eater");

        const tag = page.locator("#outputarealeft .fusion-row .slot-tag").first();
        await expect(tag).toBeVisible();
        await expect(tag).not.toHaveAttribute("aria-hidden", /.*/);
        const ratios = await page.locator("#outputarealeft .fusion-row .slot-tag").evaluateAll((tags) => {
            const channel = (v: number): number => {
                const c = v / 255;
                return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            };
            const luminance = (css: string): number => {
                const [r = 0, g = 0, b = 0] = (css.match(/\d+(\.\d+)?/g) ?? []).map(Number);
                return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
            };
            return tags.map((el) => {
                const style = getComputedStyle(el);
                const a = luminance(style.color);
                const b = luminance(style.backgroundColor);
                return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            });
        });
        for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
});

test.describe("slot tags in English", () => {
    test.use({ locale: "en-US", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });

    test("name the zone in English", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, "hand", 2, "Petit Dragon");
        await fillSlot(page, "monster", 1, "Zone Eater");
        await fillSlot(page, "spell", 3, "Legendary Sword");
        await fillSlot(page, "monster", 4, "Celtic Guardian");

        const row = page.locator("#outputarealeft .fusion-row").filter({ hasText: "Zone Eater" });
        await expect(operandTag(row, "Petit Dragon")).toHaveText("Hand 3");
        await expect(operandTag(row, "Zone Eater")).toHaveText("Monster 2");
        await expect(page.locator("#outputarearight .equip-entry .slot-tag")).toHaveText([
            "Spell 4",
            "Monster 5",
        ]);
    });
});

test.describe("slot tags on a phone", () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test("fit the rows at 375px without a horizontal scroll", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, "hand", 2, "Petit Dragon");
        await fillSlot(page, "monster", 1, "Zone Eater");
        await fillSlot(page, "spell", 2, "Legendary Sword");
        await fillSlot(page, "monster", 3, "Celtic Guardian");

        await expect(page.locator("#outputarealeft .fusion-row .slot-tag").first()).toBeVisible();
        await expect(page.locator("#outputarearight .equip-entry .slot-tag").first()).toBeVisible();
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
        expect(overflow).toBe(false);
    });
});
