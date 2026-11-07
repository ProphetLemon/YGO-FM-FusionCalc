import { expect, test, type Page, type Request as PageRequest } from "@playwright/test";
import {
    BOARD_SIZE,
    ZONES,
    ZONE_SIZE,
    fillBoard,
    fillSlot,
    handSlot,
    openCalculator,
    typeInSlot,
    zoneSlot,
    type Zone,
} from "./helpers/board.js";

// The board of the calculator: three zones of five slots, the kind each zone takes, the per-zone clear and the
// keyboard. How a fusion is applied is in calculator-apply-fusion.spec.ts and what is saved in
// calculator-persistence.spec.ts.

const MYSTICAL_ELF = "Mystical Elf";
const MUSHROOM_MAN = "Mushroom Man";
const DARK_HOLE = "Dark Hole";
const NOT_MONSTER = "Esta zona solo admite monstruos. La carta no cuenta en los resultados.";
const NOT_SPELL = "Esta zona no admite monstruos. La carta no cuenta en los resultados.";

test.beforeEach(async ({ page }) => {
    // The specs check behaviour, not artwork, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

interface SentBoard {
    handIds: number[];
    monsterIds: number[];
    spellIds: number[];
}

function sentBoard(request: PageRequest): SentBoard {
    return request.postDataJSON() as SentBoard;
}

// Every request the page makes to an endpoint, from now on.
function logRequests(page: Page, path: string): PageRequest[] {
    const requests: PageRequest[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname === path) requests.push(request);
    });
    return requests;
}

async function idOf(page: Page, name: string): Promise<number> {
    const response = await page.request.get(`/api/cards?name=${encodeURIComponent(name)}`);
    return ((await response.json()) as { card: { id: number } }).card.id;
}

test.describe("the three zones", () => {
    test("are windows, each a labelled group, in the order hand, monsters, spells", async ({ page }) => {
        await page.goto("/calculator");

        const groups = page.getByRole("group");
        await expect(groups).toHaveCount(ZONES.length);
        await expect(groups.nth(0)).toHaveAccessibleName("Mano");
        await expect(groups.nth(1)).toHaveAccessibleName("Zona de monstruos");
        await expect(groups.nth(2)).toHaveAccessibleName("Zona de magias y trampas");
        for (const zone of ZONES)
            await expect(page.locator(`#zone-${zone} .board-slot`)).toHaveCount(ZONE_SIZE);
        await expect(page.locator(".board-slot")).toHaveCount(BOARD_SIZE);
    });

    test("name each input by its zone and its place in it", async ({ page }) => {
        await page.goto("/calculator");

        for (let n = 1; n <= ZONE_SIZE; n++) {
            await expect(handSlot(page, n - 1).getByRole("combobox")).toHaveAccessibleName(
                `Mano, carta ${n} de 5`
            );
            await expect(zoneSlot(page, "monster", n - 1).getByRole("combobox")).toHaveAccessibleName(
                `Zona de monstruos, casilla ${n} de 5`
            );
            await expect(zoneSlot(page, "spell", n - 1).getByRole("combobox")).toHaveAccessibleName(
                `Zona de magias y trampas, casilla ${n} de 5`
            );
        }
    });

    test("name each input in English too", async ({ browser }) => {
        const context = await browser.newContext({
            locale: "en-US",
            extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
        });
        const page = await context.newPage();
        try {
            await page.goto("/calculator");

            await expect(handSlot(page, 1).getByRole("combobox")).toHaveAccessibleName("Hand, card 2 of 5");
            await expect(zoneSlot(page, "monster", 2).getByRole("combobox")).toHaveAccessibleName(
                "Monster zone, slot 3 of 5"
            );
            await expect(zoneSlot(page, "spell", 4).getByRole("combobox")).toHaveAccessibleName(
                "Spell and trap zone, slot 5 of 5"
            );
            await expect(page.locator("#zone-spell .zone-clear")).toHaveAccessibleName(
                "Clear the spell and trap zone"
            );
        } finally {
            await context.close();
        }
    });

    test("name the clear button of a card by its slot and the card", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, "hand", 1, MYSTICAL_ELF);
        await fillSlot(page, "monster", 2, "Celtic Guardian");
        await fillSlot(page, "spell", 0, DARK_HOLE);

        await expect(handSlot(page, 1).getByRole("button")).toHaveAccessibleName(
            `Vaciar Mano, carta 2 de 5: ${MYSTICAL_ELF}`
        );
        await expect(zoneSlot(page, "monster", 2).getByRole("button")).toHaveAccessibleName(
            "Vaciar Zona de monstruos, casilla 3 de 5: Celtic Guardian"
        );
        await expect(zoneSlot(page, "spell", 0).getByRole("button")).toHaveAccessibleName(
            `Vaciar Zona de magias y trampas, casilla 1 de 5: ${DARK_HOLE}`
        );
    });

    test("have a Vaciar button in the bar whose name says which zone it empties", async ({ page }) => {
        await page.goto("/calculator");

        await expect(page.locator("#zone-hand .zone-clear")).toHaveAccessibleName("Vaciar la mano");
        await expect(page.locator("#zone-monster .zone-clear")).toHaveAccessibleName(
            "Vaciar la zona de monstruos"
        );
        await expect(page.locator("#zone-spell .zone-clear")).toHaveAccessibleName(
            "Vaciar la zona de magias y trampas"
        );
    });

    test("show the zone glyph in the empty slots of the monster and spell zones only", async ({ page }) => {
        await page.goto("/calculator");

        await expect(page.locator("#zone-hand .slot-empty svg")).toHaveCount(0);
        await expect(page.locator("#zone-monster .slot-empty svg")).toHaveCount(ZONE_SIZE);
        await expect(page.locator("#zone-spell .slot-empty svg")).toHaveCount(ZONE_SIZE);
    });
});

test.describe("emptying a zone", () => {
    test("Vaciar empties that zone's slots, its count and the results made of them, and no other zone", async ({
        page,
    }) => {
        await openCalculator(page);
        await fillBoard(page, {
            hand: [MYSTICAL_ELF, MUSHROOM_MAN],
            monster: ["Celtic Guardian", "Flame Swordsman"],
            spell: [DARK_HOLE],
        });
        await expect(page.locator("#board-count")).toHaveText("5 de 15 cartas");

        await page.locator("#zone-monster .zone-clear").click();

        for (let i = 0; i < ZONE_SIZE; i++) {
            await expect(zoneSlot(page, "monster", i).locator(".slot-filled")).toBeHidden();
            await expect(zoneSlot(page, "monster", i).locator("input")).toHaveValue("");
        }
        await expect(page.locator("#zone-monster .zone-count")).toHaveText("0 de 5");
        await expect(page.locator("#zone-hand .zone-count")).toHaveText("2 de 5");
        await expect(page.locator("#zone-spell .zone-count")).toHaveText("1 de 5");
        await expect(page.locator("#board-count")).toHaveText("3 de 15 cartas");
        await expect(handSlot(page, 0).locator(".slot-name")).toHaveText(MYSTICAL_ELF);
        await expect(zoneSlot(page, "spell", 0).locator(".slot-name")).toHaveText(DARK_HOLE);
    });

    test("Vaciar on the hand leaves the other zones and asks for new results", async ({ page }) => {
        await openCalculator(page);
        await fillBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN], monster: ["Celtic Guardian"] });
        await expect(page.locator("#fusions-title")).toBeVisible();
        const calculations = logRequests(page, "/api/calculator");

        await page.locator("#zone-hand .zone-clear").click();

        await expect(page.locator("#zone-hand .zone-count")).toHaveText("0 de 5");
        await expect(page.locator("#zone-monster .zone-count")).toHaveText("1 de 5");
        await expect(page.locator("#results-status")).toHaveText(/Añade al menos 2 cartas/);
        expect(calculations).toHaveLength(0);
    });

    test("Vaciar also empties a slot that holds a name the zone does not take or the index does not know", async ({
        page,
    }) => {
        await openCalculator(page);
        await typeInSlot(page, "spell", 0, MYSTICAL_ELF);
        await typeInSlot(page, "spell", 1, "Definitely Not A Card");
        await expect(zoneSlot(page, "spell", 0).getByRole("alert")).toBeVisible();
        await expect(zoneSlot(page, "spell", 1).getByRole("alert")).toBeVisible();

        await page.locator("#zone-spell .zone-clear").click();

        await expect(page.locator("#zone-spell").getByRole("alert")).toHaveCount(0);
        await expect(zoneSlot(page, "spell", 0).locator("input")).toHaveValue("");
        await expect(zoneSlot(page, "spell", 1).locator("input")).toHaveValue("");
        await expect(page.locator("[aria-invalid='true']")).toHaveCount(0);
    });

    test("Reiniciar empties all three zones", async ({ page }) => {
        await openCalculator(page);
        await fillBoard(page, {
            hand: [MYSTICAL_ELF],
            monster: ["Celtic Guardian"],
            spell: [DARK_HOLE],
        });
        await expect(page.locator("#board-count")).toHaveText("3 de 15 cartas");

        await page.locator("#resetBtn").click();

        await expect(page.locator("#board-count")).toHaveText("0 de 15 cartas");
        for (const zone of ZONES)
            await expect(page.locator(`#zone-${zone} .zone-count`)).toHaveText("0 de 5");
        await expect(page.locator(".slot-filled:not(.hidden)")).toHaveCount(0);
    });

    test("the clear button of a card empties that slot only", async ({ page }) => {
        await openCalculator(page);
        await fillBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });

        await handSlot(page, 0).getByRole("button").click();

        await expect(handSlot(page, 0).locator(".slot-filled")).toBeHidden();
        await expect(handSlot(page, 1).locator(".slot-name")).toHaveText(MUSHROOM_MAN);
        await expect(page.locator("#zone-hand .zone-count")).toHaveText("1 de 5");
    });
});

test.describe("a card of the wrong kind for its zone", () => {
    test("shows an alert in its slot, saying the card does not count", async ({ page }) => {
        await openCalculator(page);

        await typeInSlot(page, "monster", 1, DARK_HOLE);
        await typeInSlot(page, "spell", 2, MYSTICAL_ELF);

        const inMonsters = zoneSlot(page, "monster", 1);
        await expect(inMonsters.getByRole("alert")).toHaveText(NOT_MONSTER);
        await expect(inMonsters.locator("input")).toHaveAttribute("aria-invalid", "true");
        await expect(inMonsters.locator("input")).toHaveAccessibleDescription(NOT_MONSTER);
        const inSpells = zoneSlot(page, "spell", 2);
        await expect(inSpells.getByRole("alert")).toHaveText(NOT_SPELL);
        await expect(inSpells.locator("input")).toHaveAttribute("aria-invalid", "true");
        // The card is not taken: the slot keeps the text and shows no tile, and nothing is counted.
        await expect(inMonsters.locator("input")).toHaveValue(DARK_HOLE);
        await expect(inMonsters.locator(".slot-filled")).toBeHidden();
        await expect(page.locator("#board-count")).toHaveText("0 de 15 cartas");
    });

    test("is not sent to the server, while the cards that fit are, with their own zone", async ({
        page,
    }) => {
        const [elf, mushroom] = [await idOf(page, MYSTICAL_ELF), await idOf(page, MUSHROOM_MAN)];
        const celtic = await idOf(page, "Celtic Guardian");
        const darkHole = await idOf(page, DARK_HOLE);
        await openCalculator(page);
        const calculations = logRequests(page, "/api/calculator");
        const chains = logRequests(page, "/api/chain-search");

        await fillBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });
        await typeInSlot(page, "monster", 0, DARK_HOLE);
        await typeInSlot(page, "spell", 0, MYSTICAL_ELF);
        await fillSlot(page, "monster", 1, "Celtic Guardian");
        // The two wrong-kind cards change nothing that is sent, so they ask for nothing: two requests, not four.
        await expect.poll(() => calculations.length).toBe(2);

        for (const request of [...calculations, ...chains]) {
            const board = sentBoard(request);
            expect(board.monsterIds).not.toContain(darkHole);
            expect(board.spellIds).not.toContain(elf);
        }
        expect(sentBoard(calculations[1]!)).toEqual({
            handIds: [elf, mushroom],
            monsterIds: [celtic],
            spellIds: [],
        });
    });

    test("counts for nothing: with two cards that fit it is the fit ones the results come from", async ({
        page,
    }) => {
        await openCalculator(page);
        await typeInSlot(page, "monster", 0, DARK_HOLE);
        await typeInSlot(page, "spell", 0, MYSTICAL_ELF);
        await fillSlot(page, "hand", 0, MYSTICAL_ELF);

        // One card sent, so there is nothing to calculate yet.
        await expect(page.locator("#results-status")).toHaveText(/Añade al menos 2 cartas/);
        await fillSlot(page, "hand", 1, MUSHROOM_MAN);
        await expect(page.locator("#outputarealeft .fusion-row")).toHaveCount(1);
        await expect(page.locator("#board-count")).toHaveText("2 de 15 cartas");
    });

    test("takes the card once the text is a card of the zone", async ({ page }) => {
        await openCalculator(page);
        await typeInSlot(page, "monster", 0, DARK_HOLE);
        await expect(zoneSlot(page, "monster", 0).getByRole("alert")).toBeVisible();

        await fillSlot(page, "monster", 0, "Celtic Guardian");

        await expect(zoneSlot(page, "monster", 0).getByRole("alert")).toHaveCount(0);
        await expect(zoneSlot(page, "monster", 0).locator("input")).not.toHaveAttribute(
            "aria-invalid",
            "true"
        );
        await expect(page.locator("#board-count")).toHaveText("1 de 15 cartas");
    });

    test("is accepted in the hand, which takes any card", async ({ page }) => {
        await openCalculator(page);

        await fillSlot(page, "hand", 0, DARK_HOLE);
        await fillSlot(page, "hand", 1, MYSTICAL_ELF);

        await expect(page.locator("#zone-hand").getByRole("alert")).toHaveCount(0);
        await expect(page.locator("#zone-hand .zone-count")).toHaveText("2 de 5");
    });

    test("is explained in English too", async ({ browser }) => {
        const context = await browser.newContext({
            locale: "en-US",
            extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
        });
        const page = await context.newPage();
        await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
        try {
            await openCalculator(page);

            await typeInSlot(page, "monster", 0, DARK_HOLE);
            await typeInSlot(page, "spell", 0, MYSTICAL_ELF);

            await expect(zoneSlot(page, "monster", 0).getByRole("alert")).toHaveText(
                "This zone only takes monsters. The card does not count in the results."
            );
            await expect(zoneSlot(page, "spell", 0).getByRole("alert")).toHaveText(
                "This zone does not take monsters. The card does not count in the results."
            );
        } finally {
            await context.close();
        }
    });
});

test.describe("the request", () => {
    test("always carries the three arrays, empty ones included", async ({ page }) => {
        const elf = await idOf(page, MYSTICAL_ELF);
        const mushroom = await idOf(page, MUSHROOM_MAN);
        await openCalculator(page);
        const calculations = logRequests(page, "/api/calculator");
        const chains = logRequests(page, "/api/chain-search");

        await fillBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });

        await expect.poll(() => chains.length).toBe(1);
        expect(calculations).toHaveLength(1);
        for (const request of [calculations[0]!, chains[0]!]) {
            expect(sentBoard(request)).toEqual({ handIds: [elf, mushroom], monsterIds: [], spellIds: [] });
        }
    });

    test("leaves empty slots out and sends each zone's cards in slot order", async ({ page }) => {
        const ids = {
            elf: await idOf(page, MYSTICAL_ELF),
            mushroom: await idOf(page, MUSHROOM_MAN),
            celtic: await idOf(page, "Celtic Guardian"),
            flame: await idOf(page, "Flame Swordsman"),
            darkHole: await idOf(page, DARK_HOLE),
            forest: await idOf(page, "Forest"),
        };
        await openCalculator(page);
        const calculations = logRequests(page, "/api/calculator");

        await fillSlot(page, "hand", 4, MYSTICAL_ELF);
        await fillSlot(page, "hand", 1, MUSHROOM_MAN);
        await fillSlot(page, "monster", 3, "Celtic Guardian");
        await fillSlot(page, "monster", 0, "Flame Swordsman");
        await fillSlot(page, "spell", 2, DARK_HOLE);
        await fillSlot(page, "spell", 1, "Forest");

        await expect.poll(() => calculations.length).toBeGreaterThan(0);
        await expect(page.locator("#board-count")).toHaveText("6 de 15 cartas");
        const last = sentBoard(calculations[calculations.length - 1]!);
        expect(last).toEqual({
            handIds: [ids.mushroom, ids.elf],
            monsterIds: [ids.flame, ids.celtic],
            spellIds: [ids.forest, ids.darkHole],
        });
    });

    test("asks again when a card moves to another slot of the same zone", async ({ page }) => {
        await openCalculator(page);
        await fillBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });
        await expect(page.locator("#outputarealeft .fusion-row")).toHaveCount(1);
        const calculations = logRequests(page, "/api/calculator");

        await handSlot(page, 0).getByRole("button").click();
        await fillSlot(page, "hand", 3, MYSTICAL_ELF);

        // The same two ids in the same order, but the answer's slots changed: it is asked for again.
        await expect(page.locator("#outputarealeft .fusion-row")).toHaveCount(1);
        expect(calculations.length).toBeGreaterThan(0);
        const last = sentBoard(calculations[calculations.length - 1]!);
        expect(last.handIds).toHaveLength(2);
    });
});

test.describe("a chain that starts on the field", () => {
    test("is searched with the field monster and shown without a hand-card caption on it", async ({
        page,
    }) => {
        await openCalculator(page);
        await fillSlot(page, "monster", 2, MUSHROOM_MAN);
        await fillSlot(page, "hand", 0, MYSTICAL_ELF);

        const best = page.locator("#chain-output .chain-best");
        await expect(best).toBeVisible();
        await expect(best.locator(".chain-verdict")).toHaveText(
            "Fusiona una vez para obtener Queen of Autumn Leaves."
        );
        await expect(best.locator(".chain-step")).toHaveCount(1);
        // Both operands are tiles of cards on the board, none carried from an earlier step.
        await expect(best.locator(".chain-carried")).toHaveCount(0);
        await expect(best.locator(".chain-step .card-tile")).toHaveCount(3);
        await expect(best.locator(".chain-step .card-tile-name").first()).toHaveText(MUSHROOM_MAN);
    });
});

test.describe("the keyboard", () => {
    test("walks the board in visual order: hand, monsters, spells", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, "hand", 0, MYSTICAL_ELF);
        await fillSlot(page, "monster", 0, "Celtic Guardian");
        await page.locator("#board-title").focus();

        const visited: string[] = [];
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press("Tab");
            const name = await page.evaluate(() => {
                const active = document.activeElement;
                return active?.getAttribute("aria-label") ?? active?.textContent?.trim() ?? "";
            });
            visited.push(name);
            if (name === "Reiniciar") break;
        }

        const index = (label: string): number => visited.findIndex((name) => name.startsWith(label));
        // Each zone's own controls come together and zones come one after the other.
        expect(index("Vaciar la mano")).toBeGreaterThanOrEqual(0);
        expect(index("Vaciar la mano")).toBeLessThan(index("Vaciar Mano, carta 1"));
        expect(index("Vaciar Mano, carta 1")).toBeLessThan(index("Mano, carta 2 de 5"));
        expect(index("Mano, carta 5 de 5")).toBeLessThan(index("Vaciar la zona de monstruos"));
        expect(index("Vaciar la zona de monstruos")).toBeLessThan(
            index("Vaciar Zona de monstruos, casilla 1")
        );
        expect(index("Zona de monstruos, casilla 5 de 5")).toBeLessThan(index("Vaciar la zona de magias"));
        expect(index("Zona de magias y trampas, casilla 1 de 5")).toBeLessThan(
            index("Zona de magias y trampas, casilla 5 de 5")
        );
        expect(index("Zona de magias y trampas, casilla 5 de 5")).toBeLessThan(index("Reiniciar"));
        expect(visited[visited.length - 1]).toBe("Reiniciar");
    });

    test("puts a visible focus ring on a slot input and on a Vaciar button", async ({ page }) => {
        await page.goto("/calculator");

        await page.keyboard.press("Tab");
        for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
        const ring = await page.evaluate(() => {
            const style = getComputedStyle(document.activeElement as Element);
            return { width: style.outlineWidth, style: style.outlineStyle };
        });
        expect(ring.style).not.toBe("none");
        expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);

        const clear = page.locator("#zone-hand .zone-clear");
        await clear.focus();
        await expect(clear).toBeFocused();
        await expect(clear).not.toHaveCSS("outline-style", "none");
    });

    test("clears a zone with Enter on its Vaciar button", async ({ page }) => {
        await openCalculator(page);
        await fillBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });
        await expect(page.locator("#zone-hand .zone-count")).toHaveText("2 de 5");

        await page.locator("#zone-hand .zone-clear").focus();
        await page.keyboard.press("Enter");

        await expect(page.locator("#zone-hand .zone-count")).toHaveText("0 de 5");
        await expect(page.locator("#zone-hand .zone-clear")).toBeFocused();
    });
});

test.describe("the live region", () => {
    test("says the number of cards on the board and follows every change", async ({ page }) => {
        await openCalculator(page);
        const total = page.locator("#board-count");
        await expect(total).toHaveText("0 de 15 cartas");

        await fillSlot(page, "monster", 0, "Celtic Guardian");
        await expect(total).toHaveText("1 de 15 cartas");
        await fillSlot(page, "hand", 0, MYSTICAL_ELF);
        await expect(total).toHaveText("2 de 15 cartas");
        await page.locator("#zone-monster .zone-clear").click();
        await expect(total).toHaveText("1 de 15 cartas");
    });
});

// Keeps the helper imports honest: a zone name the specs use is one the page has.
test("the zones the specs use are the zones of the page", async ({ page }) => {
    await page.goto("/calculator");
    const zones: Zone[] = ["hand", "monster", "spell"];
    for (const zone of zones) await expect(page.locator(`#zone-${zone}`)).toHaveCount(1);
});
