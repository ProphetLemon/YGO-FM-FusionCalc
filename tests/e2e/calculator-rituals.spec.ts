import { expect, test, type Locator, type Page, type Response } from "@playwright/test";
import { fillBoard, fillSlot, zoneSlot, type BoardNames } from "./helpers/board.js";

// A ritual needs its card in the hand or in the spell/trap zone and its three materials in the monster zone.
const YAMADRON_BOARD: Required<BoardNames> = {
    hand: ["Yamadron Ritual"],
    monster: ["Mountain Warrior", "Koumori Dragon", "Wings of Wicked Flame"],
    spell: [],
};

const INCOMPLETE_BOARDS: ReadonlyArray<readonly [string, BoardNames]> = [
    ["the ritual card", { monster: YAMADRON_BOARD.monster }],
    ["a material", { hand: YAMADRON_BOARD.hand, monster: YAMADRON_BOARD.monster.slice(0, 2) }],
    [
        "its materials in the monster zone, because they are in the hand",
        { hand: ["Yamadron Ritual", ...YAMADRON_BOARD.monster] },
    ],
];

// Artwork file names of the five cards of the entry, in display order: ritual card, materials, result. The CDN
// names a file after the password without its padding: Mountain Warrior's password is "04931562".
const YAMADRON_ARTWORK = ["29089635", "4931562", "67724379", "92944626", "70345785"];

test.beforeEach(async ({ page }) => {
    // The specs check the artwork markup, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

function cardsOf(board: BoardNames): number {
    return (board.hand?.length ?? 0) + (board.monster?.length ?? 0) + (board.spell?.length ?? 0);
}

// Resolves when the page gets the calculator answer for a board with that many cards.
function waitForCalculation(page: Page, cards: number): Promise<Response> {
    return page.waitForResponse((response) => {
        if (!response.url().endsWith("/api/calculator")) return false;
        const body = response.request().postDataJSON() as {
            handIds: number[];
            monsterIds: number[];
            spellIds: number[];
        };
        return body.handIds.length + body.monsterIds.length + body.spellIds.length === cards;
    });
}

const EMPTY_ES =
    "Ninguno para este tablero. Un ritual aparece aquí cuando tienes la carta de ritual en la mano o en la zona de magias y trampas, y sus tres materiales en la zona de monstruos.";
const EMPTY_EN =
    "None for this board. A ritual shows up here once you hold the ritual card in your hand or in the spell and trap zone, and its three materials in the monster zone.";

// The panel is part of the results: it shows whenever the hand has two cards, and says what a ritual needs
// when there is none.
async function expectEmptyPanel(page: Page, copy: string): Promise<void> {
    await expect(page.locator("#rituals-title")).toBeVisible();
    await expect(page.locator("#rituals-output > p")).toHaveText(copy);
    await expect(page.locator("#rituals-output .ritual-entry")).toHaveCount(0);
}

const ES_CAPTIONS = ["Carta de ritual", "Material", "Material", "Material", "Resultado"];
const EN_CAPTIONS = ["Ritual card", "Material", "Material", "Material", "Result"];

// The entry draws five tiles, each with its caption: the ritual card, the three materials, the result (a
// fusion-framed tile).
async function expectRitualRow(block: Locator, captions: readonly string[]): Promise<void> {
    const entry = block.locator(".ritual-entry").first();
    await expect(entry.locator(".card-caption")).toHaveText(captions);
    await expect(entry.locator(".card-tile-name")).toHaveText([
        "Yamadron Ritual",
        "Mountain Warrior",
        "Koumori Dragon",
        "Wings of Wicked Flame",
        "Yamadron",
    ]);
    await expect(entry.locator(".card-tile").last()).toHaveAttribute("data-kind", "fusion");
}

// The empty copy in English: the same hand minus its ritual card.
async function expectEmptyAfterReset(page: Page, copy: string): Promise<void> {
    await page.locator("#resetBtn").click();
    await fillBoard(page, INCOMPLETE_BOARDS[0][1]);
    await expectEmptyPanel(page, copy);
}

test.describe("rituals block", () => {
    test("is hidden with the other results on first load", async ({ page }) => {
        await page.goto("/calculator");
        await expect(page.locator("#results-panels")).toBeHidden();
        await expect(page.locator("#rituals-output")).toBeEmpty();
    });

    test("lists a ritual when the board has its card in the hand and three materials in the monster zone", async ({
        page,
    }) => {
        await page.goto("/calculator");
        await fillBoard(page, YAMADRON_BOARD);
        const block = page.locator("#rituals-output");
        await expect(block).toBeVisible();
        await expect(page.getByRole("heading", { name: "Rituales", level: 2, exact: true })).toBeVisible();
        await expectRitualRow(block, ES_CAPTIONS);
    });

    test("draws artwork for the ritual card, the materials and the result", async ({ page }) => {
        await page.goto("/calculator");
        await fillBoard(page, YAMADRON_BOARD);
        const images = page.locator("#rituals-output .ritual-entry").first().locator("img");
        await expect(images).toHaveCount(YAMADRON_ARTWORK.length);
        for (const [index, file] of YAMADRON_ARTWORK.entries()) {
            await expect(images.nth(index)).toHaveAttribute("src", new RegExp(`/${file}\\.jpg$`));
        }
    });

    for (const [missing, board] of INCOMPLETE_BOARDS) {
        test(`shows the empty copy when the board lacks ${missing}`, async ({ page }) => {
            await page.goto("/calculator");
            const calculated = waitForCalculation(page, cardsOf(board));
            await fillBoard(page, board);
            await (await calculated).finished();
            await expectEmptyPanel(page, EMPTY_ES);
        });
    }

    test("takes the ritual card from the spell/trap zone as well", async ({ page }) => {
        await page.goto("/calculator");
        await fillBoard(page, { monster: YAMADRON_BOARD.monster });
        await fillSlot(page, "spell", 0, "Yamadron Ritual");
        await expectRitualRow(page.locator("#rituals-output"), ES_CAPTIONS);
    });

    test("does not take a material from the hand or from the spell/trap zone", async ({ page }) => {
        await page.goto("/calculator");
        const calculated = waitForCalculation(page, 4);
        await fillBoard(page, {
            hand: ["Yamadron Ritual", "Mountain Warrior"],
            monster: ["Koumori Dragon", "Wings of Wicked Flame"],
        });
        await (await calculated).finished();
        await expectEmptyPanel(page, EMPTY_ES);
    });

    test("shows the empty copy again when a material leaves the monster zone", async ({ page }) => {
        await page.goto("/calculator");
        await fillBoard(page, YAMADRON_BOARD);
        const block = page.locator("#rituals-output");
        await expect(block).toBeVisible();
        const lastMaterial = zoneSlot(page, "monster", YAMADRON_BOARD.monster.length - 1);
        const calculated = waitForCalculation(page, cardsOf(YAMADRON_BOARD) - 1);
        await lastMaterial.locator(".clear-btn").click();
        await (await calculated).finished();
        await expectEmptyPanel(page, EMPTY_ES);
    });

    test("goes with the other results on reset", async ({ page }) => {
        await page.goto("/calculator");
        await fillBoard(page, YAMADRON_BOARD);
        const block = page.locator("#rituals-output");
        await expect(block).toBeVisible();
        await page.locator("#resetBtn").click();
        await expect(page.locator("#results-panels")).toBeHidden();
        await expect(block).toBeEmpty();
    });

    test.describe("in English", () => {
        test.use({ locale: "en-US", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });

        test("uses the English labels", async ({ page }) => {
            await page.goto("/calculator");
            await fillBoard(page, YAMADRON_BOARD);
            const block = page.locator("#rituals-output");
            await expect(
                page.getByRole("heading", { name: "Rituals", level: 2, exact: true })
            ).toBeVisible();
            await expectRitualRow(block, EN_CAPTIONS);
            await expectEmptyAfterReset(page, EMPTY_EN);
        });
    });
});
