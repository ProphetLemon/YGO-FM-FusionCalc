import { expect, type Locator, type Page } from "@playwright/test";

// The board of /calculator: three zones of five slots each. These helpers are shared by the calculator specs.

export type Zone = "hand" | "monster" | "spell";

export const ZONES: readonly Zone[] = ["hand", "monster", "spell"];
export const ZONE_SIZE = 5;
export const BOARD_SIZE = ZONE_SIZE * ZONES.length;

// The saved board and the saved hand of an older version.
export const BOARD_KEY = "ygo-fm-fusioncalc:board:v2";
export const LEGACY_HAND_KEY = "ygo-fm-fusioncalc:hand:v1";

export interface BoardNames {
    hand?: readonly string[];
    monster?: readonly string[];
    spell?: readonly string[];
}

export function zoneSlot(page: Page, zone: Zone, index: number): Locator {
    return page.locator(`#zone-${zone} .board-slot`).nth(index);
}

export function handSlot(page: Page, index: number): Locator {
    return zoneSlot(page, "hand", index);
}

// Types a name into a slot and commits it, as a change event does when the user leaves the field.
export async function typeInSlot(page: Page, zone: Zone, index: number, name: string): Promise<void> {
    const input = zoneSlot(page, zone, index).locator("input");
    await input.fill(name);
    await input.dispatchEvent("change");
}

// Fills a slot with a card that fits its zone and waits for the tile to show it.
export async function fillSlot(page: Page, zone: Zone, index: number, name: string): Promise<void> {
    await typeInSlot(page, zone, index, name);
    await expect(zoneSlot(page, zone, index).locator(".slot-name")).toHaveText(name);
}

export async function fillZone(page: Page, zone: Zone, names: readonly string[]): Promise<void> {
    for (const [index, name] of names.entries()) await fillSlot(page, zone, index, name);
}

export async function fillBoard(page: Page, board: BoardNames): Promise<void> {
    for (const zone of ZONES) await fillZone(page, zone, board[zone] ?? []);
}

// The slots exist at once but the board is read from the card index, which arrives a little later.
export async function openCalculator(page: Page): Promise<void> {
    await page.goto("/calculator");
    const input = handSlot(page, 0).locator("input");
    await input.fill("Mystical");
    await expect(page.getByRole("option", { name: "Mystical Elf", exact: true })).toBeVisible();
    await input.fill("");
}

// The hand the redesign was built around: the best single fusion is Sword Arm of Dragon (1750 ATK) but a
// chain of two steps reaches Kaminari Attack (1900 ATK). It has seven cards, so on the board five stay in the
// hand and the two that cannot fuse with them sit in the zones: a monster in the monster zone, a magic card in
// the spell/trap zone. The chain only uses hand cards, so its answer is the same as for the flat hand.
export const PROBLEM_BOARD: Required<BoardNames> = {
    hand: ["Petit Dragon", "Kanikabuto", "Mystical Elf", "Celtic Guardian", "Legendary Sword"],
    monster: ["Zone Eater"],
    spell: ["Sparks"],
};
