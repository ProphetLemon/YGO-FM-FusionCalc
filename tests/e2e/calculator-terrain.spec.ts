import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { BOARD_KEY, fillSlot, openCalculator, zoneSlot } from "./helpers/board.js";

// The field terrain on the calculator (E11 to E14): the selector, the adjusted ATK and DEF with their marks,
// the new request when it changes, and the terrain saved with the board.

test.beforeEach(async ({ page }) => {
    // The specs check text and layout, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

const terrainSelect = (page: Page): Locator => page.getByLabel("Terreno");
const hint = (page: Page): Locator => page.locator("#board-terrain-hint");
const stat = (page: Page, zone: "hand" | "monster" | "spell", index: number): Locator =>
    zoneSlot(page, zone, index).locator(".slot-stat");

const MINUS = "−";

function bodyOf(request: Request): Record<string, unknown> {
    return JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
}

function isPost(path: string) {
    return (request: Request): boolean =>
        request.method() === "POST" && new URL(request.url()).pathname === path;
}

// Baby Dragon (Dragon, 1200 / 700) and Time Wizard (Spellcaster, 500 / 400) fuse into Thousand Dragon
// (Dragon, 2400 / 2000). Mountain lifts Dragons and leaves Spellcasters alone.
async function fillDragons(page: Page): Promise<void> {
    await openCalculator(page);
    await fillSlot(page, "hand", 0, "Baby Dragon");
    await fillSlot(page, "hand", 1, "Time Wizard");
}

test.describe("the terrain control", () => {
    test("is a labelled select with the hint, placed above the board", async ({ page }) => {
        await page.goto("/calculator");
        const select = terrainSelect(page);
        await expect(select).toBeVisible();
        await expect(select).toHaveAttribute("aria-describedby", "board-terrain-hint");
        await expect(select).toHaveValue("");
        await expect(select.locator("option")).toHaveText([
            "Sin terreno",
            "Forest: santuario del bosque",
            "Wasteland: santuario del desierto",
            "Mountain: santuario de la montaña",
            "Sogen: santuario de la pradera",
            "Umi: santuario del mar",
            "Yami: Guardianes Sebek y Neku",
        ]);
        await expect(hint(page)).toHaveText(
            "Sin terreno, el tablero y los resultados muestran el ATK y la DEF impresos de las cartas."
        );
        // Above the board, outside its sticky column.
        const heading = await page.locator("#board-title").boundingBox();
        const hintBox = await hint(page).boundingBox();
        expect(heading && hintBox).toBeTruthy();
        expect((hintBox?.y ?? 0) + (hintBox?.height ?? 0)).toBeLessThanOrEqual(heading?.y ?? 0);
        await expect(page.locator("#board-section #board-terrain")).toHaveCount(0);
    });

    test("leaves the board column short enough to stay in view on a 1080p window", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 880 });
        await fillDragons(page);
        await terrainSelect(page).selectOption("umi");
        await expect(page.locator("#board-section")).toHaveCSS("position", "sticky");
        const board = await page.locator("#board-section").boundingBox();
        // top-4 is 16 px: the whole column, Reiniciar included, fits under it.
        expect((board?.height ?? Infinity) + 16).toBeLessThanOrEqual(880);
    });

    test("the hint names the Types, the players and what the page shows", async ({ page }) => {
        await page.goto("/calculator");
        await terrainSelect(page).selectOption("umi");
        await expect(hint(page)).toHaveText(
            "Suma 500 de ATK y DEF a los monstruos de tipo Fish, Sea Serpent, Thunder y Aqua. " +
                "Resta 500 de ATK y DEF a los de tipo Machine y Pyro. " +
                "Lo juegan: Ocean Mage, High Mage Secmeton. " +
                "El tablero y los resultados muestran ese ATK y esa DEF."
        );
        await terrainSelect(page).selectOption("");
        await expect(hint(page)).toContainText("Sin terreno");
    });

    test("keeps the zones inside the 540 px column on a wide screen", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto("/calculator");
        await terrainSelect(page).selectOption("umi");
        const board = await page.locator("#board-section").boundingBox();
        expect(board?.width).toBeCloseTo(540, 0);
        for (const zone of ["hand", "monster", "spell"]) {
            const box = await page.locator(`#zone-${zone}`).boundingBox();
            expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((board?.x ?? 0) + 540 + 0.5);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
    });

    test("does not scroll sideways at 375 px, with a terrain and results on screen", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await fillDragons(page);
        await terrainSelect(page).selectOption("mountain");
        await expect(page.locator(".fusion-row").first()).toContainText("2900");
        await expect(page.locator("#chain-output .chain-final-atk")).toContainText("2900");
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    });
});

test.describe("the values on screen", () => {
    test("a board tile shows the adjusted ATK and DEF with a mark, and leaves other Types alone", async ({
        page,
    }) => {
        await fillDragons(page);
        await expect(stat(page, "hand", 0)).toHaveText("1200 / 700");
        await terrainSelect(page).selectOption("mountain");

        const dragon = stat(page, "hand", 0);
        await expect(dragon).toContainText("1700");
        await expect(dragon).toContainText("1200");
        await expect(dragon.locator(".terrain-mark")).toHaveCount(2);
        await expect(dragon.locator(".terrain-mark > [aria-hidden='true']").first()).toHaveText("+500");
        // The mark is also text for a screen reader.
        await expect(dragon.locator(".terrain-mark .sr-only").first()).toHaveText(", terreno +500");
        // A Spellcaster is not touched by Mountain: exactly the printed text, no mark.
        await expect(stat(page, "hand", 1)).toHaveText("500 / 400");
        await expect(stat(page, "hand", 1).locator(".terrain-mark")).toHaveCount(0);
    });

    test("a weakened monster shows the minus mark, in the monster zone too", async ({ page }) => {
        await openCalculator(page);
        // Gatekeeper is a Machine (1500 / 1800), and Umi takes 500 from Machines.
        await fillSlot(page, "monster", 0, "Gatekeeper");
        await terrainSelect(page).selectOption("umi");
        const tile = stat(page, "monster", 0);
        await expect(tile).toContainText("1000");
        await expect(tile).toContainText("1300");
        await expect(tile.locator(".terrain-mark > [aria-hidden='true']").first()).toHaveText(`${MINUS}500`);
        await expect(tile.locator(".terrain-mark .sr-only").first()).toHaveText(`, terreno ${MINUS}500`);
    });

    test("a fusion row, the chain and the tiles of the results show the adjusted values", async ({
        page,
    }) => {
        await fillDragons(page);
        await terrainSelect(page).selectOption("mountain");

        const row = page.locator(".fusion-row").first();
        await expect(row.locator(".fusion-stat")).toContainText("2900");
        await expect(row.locator(".fusion-stat")).toContainText("2500");
        await expect(row.locator(".fusion-stat .terrain-mark")).toHaveCount(2);

        const chain = page.locator("#chain-output .chain-best");
        await expect(chain.locator(".chain-final-atk")).toContainText("2900");
        await expect(chain.locator(".chain-final-atk .terrain-mark > [aria-hidden='true']")).toHaveText(
            "+500"
        );
        // The final tile and the result tile of the step show the adjusted pair too.
        await expect(chain.locator(".card-tile-stat").last()).toContainText("2900");
        await expect(chain.locator(".chain-step .card-tile-stat").first()).toContainText("1700");
    });

    test("with no terrain nothing is marked and the numbers are the printed ones", async ({ page }) => {
        await fillDragons(page);
        await expect(page.locator(".fusion-row").first().locator(".fusion-stat")).toHaveText("2400 / 2000");
        await expect(page.locator(".terrain-mark")).toHaveCount(0);
        await terrainSelect(page).selectOption("mountain");
        await expect(page.locator(".terrain-mark").first()).toBeVisible();
        await terrainSelect(page).selectOption("");
        await expect(page.locator(".fusion-row").first().locator(".fusion-stat")).toHaveText("2400 / 2000");
        await expect(page.locator(".terrain-mark")).toHaveCount(0);
        await expect(stat(page, "hand", 0)).toHaveText("1200 / 700");
    });
});

test.describe("asking again", () => {
    test("a terrain change asks for the results and the chain again, with the terrain in the body", async ({
        page,
    }) => {
        await fillDragons(page);

        const calculation = page.waitForRequest(isPost("/api/calculator"));
        const chain = page.waitForRequest(isPost("/api/chain-search"));
        await terrainSelect(page).selectOption("mountain");
        expect(bodyOf(await calculation).terrain).toBe("mountain");
        expect(bodyOf(await chain).terrain).toBe("mountain");
    });

    test("leaves the terrain out of the body when there is none", async ({ page }) => {
        await fillDragons(page);
        await terrainSelect(page).selectOption("mountain");
        await expect(page.locator(".fusion-row").first()).toContainText("2900");

        const calculation = page.waitForRequest(isPost("/api/calculator"));
        await terrainSelect(page).selectOption("");
        expect(bodyOf(await calculation)).not.toHaveProperty("terrain");

        await fillSlot(page, "hand", 2, "Celtic Guardian");
        const again = page.waitForRequest(isPost("/api/calculator"));
        await fillSlot(page, "hand", 3, "Mystical Elf");
        expect(bodyOf(await again)).not.toHaveProperty("terrain");
    });

    test("ranks the fusions on the terrain: Mountain puts the Thunder result first", async ({ page }) => {
        await openCalculator(page);
        // Baby Dragon fuses with Celtic Guardian (Sword Arm of Dragon, Dinosaur, 1750) and with Oscillo Hero #2
        // (Thunder Dragon, Thunder, 1600). Mountain lifts Thunder, not Dinosaur.
        await fillSlot(page, "hand", 0, "Baby Dragon");
        await fillSlot(page, "hand", 1, "Celtic Guardian");
        await fillSlot(page, "hand", 2, "Oscillo Hero #2");
        const names = page.locator(".fusion-row .fusion-name");
        await expect(names.first()).toContainText("Sword Arm of Dragon");

        await terrainSelect(page).selectOption("mountain");
        await expect(names.first()).toContainText("Thunder Dragon");
        await expect(page.locator(".fusion-row").first().locator(".fusion-stat")).toContainText("2100");
    });
});

test.describe("saved with the board", () => {
    test("the terrain comes back after a reload with the cards", async ({ page }) => {
        await fillDragons(page);
        await terrainSelect(page).selectOption("mountain");
        await expect
            .poll(() =>
                page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").terrain, BOARD_KEY)
            )
            .toBe("mountain");

        await page.reload();
        await expect(terrainSelect(page)).toHaveValue("mountain");
        await expect(hint(page)).toContainText("El tablero y los resultados muestran ese ATK y esa DEF.");
        await expect(zoneSlot(page, "hand", 0).locator(".slot-name")).toHaveText("Baby Dragon");
        await expect(stat(page, "hand", 0)).toContainText("1700");
        await expect(page.locator(".fusion-row").first()).toContainText("2900");
    });

    test("is dropped from the saved value when it goes back to none", async ({ page }) => {
        await fillDragons(page);
        await terrainSelect(page).selectOption("umi");
        await terrainSelect(page).selectOption("");
        await expect
            .poll(() =>
                page.evaluate(
                    (key) => Object.keys(JSON.parse(localStorage.getItem(key) ?? "{}")).sort(),
                    BOARD_KEY
                )
            )
            .toEqual(["hand", "monsters", "spells", "v"]);
    });

    test("Reiniciar empties the cards and keeps the terrain", async ({ page }) => {
        await fillDragons(page);
        await terrainSelect(page).selectOption("mountain");
        await page.getByRole("button", { name: "Reiniciar" }).click();

        await expect(zoneSlot(page, "hand", 0).locator(".slot-name")).toHaveText("");
        await expect(terrainSelect(page)).toHaveValue("mountain");
        await expect
            .poll(() =>
                page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").terrain, BOARD_KEY)
            )
            .toBe("mountain");
        await page.reload();
        await expect(terrainSelect(page)).toHaveValue("mountain");
    });

    test("an old value without the key, and one with an invalid terrain, start on no terrain", async ({
        page,
    }) => {
        const saved = (extra: object): string =>
            JSON.stringify({ v: 2, hand: [4, 16, null, null, null], monsters: [], spells: [], ...extra });
        await page.addInitScript(
            ([key, value]) => {
                if (!localStorage.getItem(key as string))
                    localStorage.setItem(key as string, value as string);
            },
            [BOARD_KEY, saved({})]
        );
        await page.goto("/calculator");
        await expect(zoneSlot(page, "hand", 0).locator(".slot-name")).toHaveText("Baby Dragon");
        await expect(terrainSelect(page)).toHaveValue("");

        await page.evaluate(
            ([key, value]) => localStorage.setItem(key as string, value as string),
            [BOARD_KEY, saved({ terrain: "lava" })]
        );
        await page.reload();
        await expect(zoneSlot(page, "hand", 0).locator(".slot-name")).toHaveText("Baby Dragon");
        await expect(terrainSelect(page)).toHaveValue("");
        await expect(page.locator(".terrain-mark")).toHaveCount(0);
    });
});
