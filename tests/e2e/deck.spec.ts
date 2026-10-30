import { expect, test, type Page, type Route } from "@playwright/test";

// Every save here is built in the test from bytes: a real save belongs to a player and holds a name.
const BLOCK = 0x2000;
const FIRST_COPY = 0x200;
const SECOND_COPY = 0x880;
const TRUNK_DELTA = 0x50;
// A marker written where the game keeps the player name; it must never reach the server.
const PLAYER_NAME = "PLAYERNAME";

// Twelve weak monsters three times each, then Legendary Sword, Sword of Dark Destruction, Dark Energy and
// Axe of Despair (the non-monsters of the deck).
const WEAK = [40, 393, 394, 399, 402, 499, 24, 58, 123, 156, 277, 278];
const NON_MONSTERS = [301, 302, 303, 304];
const DECK = [...WEAK, ...WEAK, ...WEAK, ...NON_MONSTERS];
// Strong spare cards: Blue-eyes White Dragon x3, Black Luster Soldier x3, Blue-eyes Ultimate Dragon x1.
const TRUNK: Record<number, number> = { 1: 3, 364: 3, 380: 1 };
const OTHER_DECK = [...WEAK, ...WEAK, ...WEAK, 305, 301, 302, 303];
const OTHER_TRUNK: Record<number, number> = { 217: 2, 67: 1 };

function makeBlock(deck: number[], trunk: Record<number, number>): Uint8Array {
    const block = new Uint8Array(BLOCK);
    block[0] = 0x53;
    block[1] = 0x43;
    block.set(new TextEncoder().encode(PLAYER_NAME), 0x60);
    const view = new DataView(block.buffer);
    for (const base of [FIRST_COPY, SECOND_COPY]) {
        deck.forEach((id, i) => view.setUint16(base + i * 2, id, true));
        for (const [id, count] of Object.entries(trunk)) block[base + TRUNK_DELTA + Number(id) - 1] = count;
    }
    return block;
}

function saveFile(name = "slot01.sav"): { name: string; mimeType: string; buffer: Buffer } {
    return { name, mimeType: "application/octet-stream", buffer: Buffer.from(makeBlock(DECK, TRUNK)) };
}

// A raw memory card of 16 blocks holding two saves, in blocks 1 and 4.
function twoSavesCard(): { name: string; mimeType: string; buffer: Buffer } {
    const card = new Uint8Array(16 * BLOCK);
    card.set(makeBlock(DECK, TRUNK), 1 * BLOCK);
    card.set(makeBlock(OTHER_DECK, OTHER_TRUNK), 4 * BLOCK);
    return { name: "card.mcr", mimeType: "application/octet-stream", buffer: Buffer.from(card) };
}

function card(id: number): Record<string, unknown> {
    return {
        id,
        name: `Card ${id}`,
        description: "",
        type: 0,
        typeName: "Dragon",
        attack: 1000,
        defense: 1000,
        stars: 4,
        password: "00000000",
        imageCode: null,
        isMonster: true,
    };
}

// A well-formed answer for the current deck: the first two cards are swapped for 1 and 364.
function answer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const deck = DECK.map((id, slot) => card(slot === 0 ? 1 : slot === 1 ? 364 : id));
    const stats = { averageBestAtk: 1316.3, share1500: 0.33, share2000: 0.12, shareDead: 0.28 };
    return {
        current: stats,
        recommended: { averageBestAtk: 1420.9, share1500: 0.443, share2000: 0.186, shareDead: 0.203 },
        swaps: [
            { out: card(DECK[0] as number), in: card(1) },
            { out: card(DECK[1] as number), in: card(364) },
        ],
        deck,
        topFinals: [
            { card: card(380), share: 0.2 },
            { card: card(364), share: 0.1 },
        ],
        truncated: false,
        certified: false,
        method: "local-search",
        ...overrides,
    };
}

function json(
    route: Route,
    status: number,
    body: unknown,
    headers: Record<string, string> = {}
): Promise<void> {
    return route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
}

async function mockOptimizer(page: Page, body: Record<string, unknown> = answer()): Promise<void> {
    await page.route("**/api/deck/optimize", (route) => json(route, 200, body));
}

async function chooseFile(page: Page, file = saveFile()): Promise<void> {
    await page.getByLabel("Archivo de la partida").setInputFiles(file);
    await expect(page.locator("#deck-collection")).toBeVisible();
}

const compute = (page: Page) => page.getByRole("button", { name: "Calcular el mejor mazo" });
// The 40 tiles of the deck before computing, each a lock toggle with a forbid toggle beside it.
const tiles = (page: Page) => page.locator('#deck-lock-grid button[data-action="lock"]');
const lockedTiles = (page: Page) =>
    page.locator('#deck-lock-grid button[data-action="lock"][aria-pressed="true"]');
const forbids = (page: Page) => page.locator('#deck-lock-grid button[data-action="forbid"]');
// The rows of the spare cards, strongest first: Blue-eyes Ultimate Dragon, Black Luster Soldier, then
// Blue-eyes White Dragon.
const rows = (page: Page) => page.locator("#deck-trunk-list li");
const ULTIMATE = 0;
const LUSTER = 1;
const WHITE = 2;
const rowButton = (page: Page, row: number, action: "add" | "remove" | "forbid") =>
    rows(page).nth(row).locator(`button[data-action="${action}"]`);
const addedTiles = (page: Page) => page.locator("#deck-added-list button");
const countLine = (locked = NON_MONSTERS.length, added = 0, forbidden = 0): string =>
    `Bloqueadas: ${locked} de 40. Añadidas: ${added}. Prohibidas: ${forbidden}.`;
// The slot of the first non-monster of DECK.
const FIRST_SPELL = WEAK.length * 3;

// Cards added by hand. Dark Magician is in neither the deck nor the trunk of the saves above; Blue-eyes White
// Dragon is in the trunk three times, which is the most a deck can use.
const DARK = 35;
const DARK_NAME = "Dark Magician";
const WHITE_NAME = "Blue-eyes White Dragon";
const manualField = (page: Page) => page.locator("#deck-manual-input");
const manualAdd = (page: Page) => page.locator("#deck-manual-add");
const manualMsg = (page: Page) => page.locator("#deck-manual-msg");
const rowOf = (page: Page, name: string) => rows(page).filter({ hasText: name });
const rowAction = (page: Page, name: string, action: "add" | "remove" | "forbid" | "delete") =>
    rowOf(page, name).locator(`button[data-action="${action}"]`);
const openTrunk = (page: Page) => page.locator("#deck-trunk-summary").click();
const option = (page: Page, name: string) =>
    page.locator("#deck-manual").getByRole("option", { name, exact: true });

// Types a name in the field and presses the button.
async function addByHand(page: Page, name: string): Promise<void> {
    await manualField(page).fill(name);
    await manualAdd(page).click();
}

// A save with nothing in the trunk.
function emptyTrunkSave(): { name: string; mimeType: string; buffer: Buffer } {
    return {
        name: "empty.sav",
        mimeType: "application/octet-stream",
        buffer: Buffer.from(makeBlock(DECK, {})),
    };
}

// Computes with the real optimiser and gives the status the server answered with, with what was sent.
async function computeStatus(page: Page): Promise<{ status: number; body: Record<string, unknown> }> {
    const requestSent = page.waitForRequest("**/api/deck/optimize");
    const responded = page.waitForResponse("**/api/deck/optimize");
    await compute(page).click();
    const body = bodyOf(await requestSent);
    const status = (await responded).status();
    await expect(page.locator("#deck-results")).toBeVisible({ timeout: 15_000 });
    return { status, body };
}

function bodyOf(request: { postDataJSON(): unknown }): Record<string, unknown> {
    return request.postDataJSON() as Record<string, unknown>;
}

// A save whose deck already holds one Blue-eyes White Dragon (the last weak slot is swapped for it), while
// the trunk still has three: adding one has to lock the copy the deck holds.
const HOLDING_DECK = DECK.map((id, slot) => (slot === WEAK.length * 3 - 1 ? 1 : id));
const HOLDING_SLOT = WEAK.length * 3 - 1;

function holdingSave(): { name: string; mimeType: string; buffer: Buffer } {
    return {
        name: "holding.sav",
        mimeType: "application/octet-stream",
        buffer: Buffer.from(makeBlock(HOLDING_DECK, TRUNK)),
    };
}

// Computes with the page as it is and reads what the real optimiser answered.
async function computeAndRead(
    page: Page
): Promise<{ body: Record<string, unknown>; deck: number[]; swaps: number }> {
    const requestSent = page.waitForRequest("**/api/deck/optimize");
    const responded = page.waitForResponse("**/api/deck/optimize");
    await compute(page).click();
    const body = bodyOf(await requestSent);
    const answerBody = (await (await responded).json()) as { deck: Array<{ id: number }>; swaps: unknown[] };
    await expect(page.locator("#deck-results")).toBeVisible({ timeout: 15_000 });
    return { body, deck: answerBody.deck.map((c) => c.id), swaps: answerBody.swaps.length };
}

test.beforeEach(async ({ page }) => {
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
    await page.goto("/deck");
});

// These two use the real optimiser, which runs one request at a time, so they run one after the other.
test.describe("with the real optimiser", () => {
    test.describe.configure({ mode: "serial" });

    test("a save goes from the file to a recommended deck, sending only card ids", async ({ page }) => {
        await chooseFile(page);
        await expect(page.locator("#deck-count")).toHaveText("40");
        await expect(page.locator("#spare-count")).toHaveText("7");
        await expect(page.locator("#spare-kinds")).toHaveText("3");
        await expect(lockedTiles(page)).toHaveCount(NON_MONSTERS.length);

        const requestSent = page.waitForRequest("**/api/deck/optimize");
        await compute(page).click();
        const request = await requestSent;
        const body = request.postDataJSON() as Record<string, unknown>;
        expect(Object.keys(body).sort()).toEqual([
            "deck",
            "forbidden",
            "keepNonMonsters",
            "locked",
            "trunk",
        ]);
        expect(body.deck).toEqual(DECK);
        expect(body.trunk).toEqual([
            { id: 1, count: 3 },
            { id: 364, count: 3 },
            { id: 380, count: 1 },
        ]);
        expect(body.keepNonMonsters).toBe(false);
        expect(body.locked).toEqual(NON_MONSTERS.map((id) => ({ id, count: 1 })));
        expect(body.forbidden).toEqual([]);
        expect(request.postData()).not.toContain(PLAYER_NAME);

        const heading = page.getByRole("heading", { name: "Mazo recomendado" }).last();
        await expect(heading).toBeFocused({ timeout: 15_000 });
        await expect(page.locator("#deck-status")).toContainText("Resultado listo");
        await expect(page.locator("#deck-results table tbody tr")).toHaveCount(4);
        expect(await page.locator("#deck-results ol li").count()).toBeGreaterThan(0);
        await expect(page.locator("#deck-grid-title")).toBeVisible();
        await expect(page.locator("#deck-results ul").last().locator("> li")).toHaveCount(40);
        await expect(page.locator("#deck-results")).toContainText(/mejor mazo (posible|que)|no lo mejora/);
        expect(await page.locator("#deck-results li[data-new='true']").count()).toBeGreaterThan(0);
        await expect(page.locator("#deck-results li[data-locked='true']")).toHaveCount(NON_MONSTERS.length);
    });

    test("locked cards stay in the deck, and an unlocked spell is sent as free to leave", async ({
        page,
    }) => {
        await chooseFile(page);

        const lockedRequest = page.waitForRequest("**/api/deck/optimize");
        const lockedResponse = page.waitForResponse("**/api/deck/optimize");
        await compute(page).click();
        expect(bodyOf(await lockedRequest).locked).toEqual(NON_MONSTERS.map((id) => ({ id, count: 1 })));
        const kept = (await (await lockedResponse).json()) as { deck: Array<{ id: number }> };
        const keptIds = kept.deck.map((c) => c.id);
        for (const id of NON_MONSTERS) expect(keptIds).toContain(id);
        await expect(page.locator("#deck-results")).toBeVisible({ timeout: 15_000 });

        // Changing a lock drops the old answer, which was made with the other locks.
        await tiles(page).nth(FIRST_SPELL).click();
        await expect(page.locator("#deck-results")).toBeHidden();

        const freeRequest = page.waitForRequest("**/api/deck/optimize");
        await compute(page).click();
        const body = bodyOf(await freeRequest);
        expect(body.keepNonMonsters).toBe(false);
        expect(body.locked).toEqual(NON_MONSTERS.slice(1).map((id) => ({ id, count: 1 })));
        await expect(page.locator("#deck-results")).toBeVisible({ timeout: 15_000 });
    });

    test("an added spare card is sent as locked and marked as added in the result", async ({ page }) => {
        await chooseFile(page);
        await page.locator("#deck-trunk-summary").click();
        await rowButton(page, WHITE, "add").click();
        await expect(addedTiles(page)).toHaveCount(1);
        await expect(page.locator("#lock-count")).toHaveText(countLine(NON_MONSTERS.length, 1, 0));

        const { body, deck } = await computeAndRead(page);

        expect(body.locked).toContainEqual({ id: 1, count: 1 });
        expect(deck).toContain(1);
        const marked = page.locator("#deck-results li[data-added='true']");
        await expect(marked).toHaveCount(1);
        await expect(marked).toContainText("Añadida");
    });

    test("a forbidden deck card is not in the result", async ({ page }) => {
        await chooseFile(page);
        const first = await computeAndRead(page);
        // A weak card the unconstrained answer keeps, so that the ban is what takes it out.
        const kept = WEAK.find((id) => first.deck.filter((card) => card === id).length === 3) as number;
        expect(kept).toBeDefined();

        await forbids(page).nth(DECK.indexOf(kept)).click();
        await expect(page.locator("#deck-results")).toBeHidden();
        const { body, deck } = await computeAndRead(page);

        expect(body.forbidden).toEqual([kept]);
        expect(deck).not.toContain(kept);
    });

    test("a forbidden spare card stays out of the result", async ({ page }) => {
        await chooseFile(page);
        const first = await computeAndRead(page);
        // The strongest spare card is in the unconstrained answer, so the ban is what keeps it out.
        expect(first.deck).toContain(380);

        await page.locator("#deck-trunk-summary").click();
        await rowButton(page, ULTIMATE, "forbid").click();
        await expect(rowButton(page, ULTIMATE, "forbid")).toHaveAttribute("aria-pressed", "true");
        await expect(rows(page).nth(ULTIMATE).getByText("Prohibida", { exact: true })).toBeVisible();
        const { body, deck } = await computeAndRead(page);

        expect(body.forbidden).toEqual([380]);
        expect(deck).not.toContain(380);
    });

    test("adding a spare card and forbidding a deck card is an exact swap", async ({ page }) => {
        await chooseFile(page);
        const leaving = WEAK[0] as number;
        // Everything else stays: the copies of the weak card are the only free slots.
        for (let slot = 0; slot < WEAK.length * 3; slot++) {
            if (DECK[slot] !== leaving) await tiles(page).nth(slot).click();
        }
        await page.locator("#deck-trunk-summary").click();
        for (let copy = 0; copy < 3; copy++) await rowButton(page, WHITE, "add").click();
        await forbids(page).nth(DECK.indexOf(leaving)).click();
        await expect(page.locator("#lock-count")).toHaveText(
            countLine(WEAK.length * 3 - 3 + NON_MONSTERS.length, 3, 1)
        );

        const { deck, swaps } = await computeAndRead(page);

        const expected = [...DECK.filter((id) => id !== leaving), 1, 1, 1];
        expect([...deck].sort((a, b) => a - b)).toEqual(expected.sort((a, b) => a - b));
        expect(swaps).toBe(3);
        await expect(page.locator("#deck-results li[data-added='true']")).toHaveCount(3);
    });

    test("a card added by hand can enter the deck through Añadir and appears in the result", async ({
        page,
    }) => {
        await chooseFile(page);
        await openTrunk(page);
        await addByHand(page, DARK_NAME);
        await rowAction(page, DARK_NAME, "add").click();

        const { status, body } = await computeStatus(page);

        expect(status).toBe(200);
        expect(body.trunk).toContainEqual({ id: DARK, count: 1 });
        expect(body.locked).toContainEqual({ id: DARK, count: 1 });
        await expect(page.locator("#deck-results li[data-added='true']")).toHaveCount(1);
        await expect(page.locator("#deck-results")).toContainText("cuenta las cartas que agregaste a mano");
    });

    test("deleting a hand-added copy that was added to the deck never makes the server refuse the rules", async ({
        page,
    }) => {
        await chooseFile(page);
        await openTrunk(page);
        await addByHand(page, DARK_NAME);
        await addByHand(page, DARK_NAME);
        await rowAction(page, DARK_NAME, "add").click();
        await rowAction(page, DARK_NAME, "add").click();
        await expect(page.locator("#lock-count")).toHaveText(countLine(NON_MONSTERS.length, 2, 0));

        await rowAction(page, DARK_NAME, "delete").click();
        // One copy is left to give: the page cut the added copies to it.
        await expect(page.locator("#lock-count")).toHaveText(countLine(NON_MONSTERS.length, 1, 0));
        const one = await computeStatus(page);
        expect(one.status).toBe(200);
        expect(one.body.trunk).toContainEqual({ id: DARK, count: 1 });
        expect(one.body.locked).toContainEqual({ id: DARK, count: 1 });

        await rowAction(page, DARK_NAME, "delete").click();
        await expect(rowOf(page, DARK_NAME)).toHaveCount(0);
        const none = await computeStatus(page);
        expect(none.status).toBe(200);
        expect(JSON.stringify(none.body)).not.toContain(`"id":${DARK}`);
    });

    test("deleting the last hand-added copy of a forbidden card lifts the ban the server would refuse", async ({
        page,
    }) => {
        await chooseFile(page);
        await openTrunk(page);
        await addByHand(page, DARK_NAME);
        await rowAction(page, DARK_NAME, "forbid").click();
        await expect(page.locator("#lock-count")).toHaveText(countLine(NON_MONSTERS.length, 0, 1));

        await rowAction(page, DARK_NAME, "delete").click();

        await expect(page.locator("#lock-count")).toHaveText(countLine());
        const { status, body } = await computeStatus(page);
        expect(status).toBe(200);
        expect(body.forbidden).toEqual([]);
    });
});

test.describe("the deck and the spare cards before computing", () => {
    test("the deck shows 40 toggles, locking the non-monsters, and counts the locked cards", async ({
        page,
    }) => {
        await chooseFile(page);

        await expect(tiles(page)).toHaveCount(40);
        await expect(lockedTiles(page)).toHaveCount(NON_MONSTERS.length);
        for (let slot = 0; slot < 40; slot++) {
            await expect(tiles(page).nth(slot)).toHaveAttribute("aria-pressed", String(slot >= FIRST_SPELL));
        }
        await expect(page.locator("#lock-count")).toHaveText(countLine(4));
        await expect(tiles(page).first()).toHaveAccessibleName(/, sin bloquear$/);
        await expect(tiles(page).last()).toHaveAccessibleName(/, bloqueada$/);
    });

    test("the spare cards are folded, counted, and sorted with monsters first by ATK", async ({ page }) => {
        await chooseFile(page);

        const summary = page.locator("#deck-trunk-summary");
        await expect(summary).toHaveText(
            "Cartas disponibles (7): añádelas al mazo, prohíbelas o agrega otras"
        );
        await expect(rows(page).first()).toBeHidden();
        await summary.click();
        await expect(rows(page)).toHaveCount(3);
        await expect(rows(page).first()).toContainText(/ATK 4\.?500/);
        await expect(rows(page).first()).toContainText("×1");
        await expect(rows(page).nth(1)).toContainText("×3");
        await expect(rows(page).nth(2)).toContainText("×3");
    });

    test("unlocking a spell changes the locks that are sent", async ({ page }) => {
        await mockOptimizer(page);
        await chooseFile(page);

        await tiles(page).nth(FIRST_SPELL).click();
        await expect(tiles(page).nth(FIRST_SPELL)).toHaveAttribute("aria-pressed", "false");
        await expect(page.locator("#lock-count")).toHaveText(countLine(3));

        const requestSent = page.waitForRequest("**/api/deck/optimize");
        await compute(page).click();
        expect(bodyOf(await requestSent).locked).toEqual(
            NON_MONSTERS.slice(1).map((id) => ({ id, count: 1 }))
        );
    });

    test("locking a monster sends its copies, and locking nothing sends an empty list", async ({ page }) => {
        await mockOptimizer(page);
        await chooseFile(page);

        await tiles(page).nth(0).click();
        await tiles(page).nth(WEAK.length).click();
        const first = page.waitForRequest("**/api/deck/optimize");
        await compute(page).click();
        // Slots 0 and 12 hold the same card: two copies are locked.
        expect(bodyOf(await first).locked).toEqual([
            { id: WEAK[0], count: 2 },
            ...NON_MONSTERS.map((id) => ({ id, count: 1 })),
        ]);
        await expect(page.locator("#deck-results")).toBeVisible();

        await tiles(page).nth(0).click();
        await tiles(page).nth(WEAK.length).click();
        for (let slot = FIRST_SPELL; slot < 40; slot++) await tiles(page).nth(slot).click();
        await expect(lockedTiles(page)).toHaveCount(0);
        const second = page.waitForRequest("**/api/deck/optimize");
        await compute(page).click();
        expect(bodyOf(await second).locked).toEqual([]);
    });

    test("a tile toggles from the keyboard with Space and with Enter", async ({ page }) => {
        await chooseFile(page);

        const tile = tiles(page).nth(FIRST_SPELL);
        await tile.focus();
        await page.keyboard.press("Space");
        await expect(tile).toHaveAttribute("aria-pressed", "false");
        await expect(tile).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(tile).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator("#lock-count")).toHaveText(countLine(4));
    });

    test("changing a lock after a result discards the result", async ({ page }) => {
        await mockOptimizer(page);
        await chooseFile(page);
        await compute(page).click();
        await expect(page.locator("#deck-results")).toBeVisible();

        await tiles(page).nth(0).click();

        await expect(page.locator("#deck-results")).toBeHidden();
        await expect(page.locator("#deck-results-hint")).toBeVisible();
    });

    test("a locked card is marked in the recommended deck", async ({ page }) => {
        await mockOptimizer(page);
        await chooseFile(page);
        await tiles(page).nth(0).click();
        await compute(page).click();

        const marked = page.locator("#deck-results li[data-locked='true']");
        // The four non-monsters, and one of the copies of the monster that is left in the deck.
        await expect(marked).toHaveCount(NON_MONSTERS.length + 1);
        await expect(marked.first()).toContainText("Bloqueada");
    });

    test("choosing another save, or another file, starts again from the default locks", async ({ page }) => {
        await mockOptimizer(page);
        await page.getByLabel("Archivo de la partida").setInputFiles(twoSavesCard());
        await expect(lockedTiles(page)).toHaveCount(4);

        await tiles(page).nth(0).click();
        await tiles(page).nth(FIRST_SPELL).click();
        await expect(page.locator("#lock-count")).toHaveText(countLine(4));
        await expect(tiles(page).nth(0)).toHaveAttribute("aria-pressed", "true");

        await page.getByRole("radio", { name: /Partida 2/ }).check();
        await expect(tiles(page).nth(0)).toHaveAttribute("aria-pressed", "false");
        await expect(tiles(page).nth(FIRST_SPELL)).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator("#lock-count")).toHaveText(countLine(4));
        const other = page.waitForRequest("**/api/deck/optimize");
        await compute(page).click();
        expect(bodyOf(await other).locked).toEqual([305, 301, 302, 303].map((id) => ({ id, count: 1 })));

        await tiles(page).nth(0).click();
        await page.getByLabel("Archivo de la partida").setInputFiles(saveFile("again.sav"));
        await expect(tiles(page).nth(0)).toHaveAttribute("aria-pressed", "false");
        await expect(page.locator("#lock-count")).toHaveText(countLine(4));
    });

    test("the deck and the spare cards do not scroll the page sideways at 375 px", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await chooseFile(page);
        await page.locator("#deck-trunk-summary").click();
        await expect(rows(page)).toHaveCount(3);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(overflow).toBe(0);
    });

    test("the catalog is asked for once, and no card of the player is looked up one by one", async ({
        page,
    }) => {
        const asked: string[] = [];
        page.on("request", (request) => {
            const { pathname } = new URL(request.url());
            if (pathname.startsWith("/api/")) asked.push(pathname);
        });
        await chooseFile(page);
        await expect(tiles(page)).toHaveCount(40);

        expect(asked).toEqual(["/api/cards-index"]);
    });

    test("a catalog that cannot be loaded is explained", async ({ page }) => {
        await page.route("**/api/cards-index", (route) => route.abort("failed"));
        await page.getByLabel("Archivo de la partida").setInputFiles(saveFile());

        await expect(page.getByRole("alert")).toContainText("No se ha podido cargar la lista de cartas");
        await expect(page.locator("#deck-collection")).toBeHidden();
    });
});

test.describe("rules on the cards", () => {
    test("forbidding a card lets go of its locks, and locking one lifts the ban", async ({ page }) => {
        await chooseFile(page);
        // Slots 0, 12 and 24 hold the same card.
        await tiles(page).nth(0).click();
        await tiles(page).nth(WEAK.length).click();
        await expect(page.locator("#lock-count")).toHaveText(countLine(NON_MONSTERS.length + 2));

        await forbids(page).nth(24).click();

        for (const slot of [0, WEAK.length, WEAK.length * 2]) {
            await expect(tiles(page).nth(slot)).toHaveAttribute("aria-pressed", "false");
            await expect(tiles(page).nth(slot)).toHaveAttribute("data-forbidden", "true");
            await expect(forbids(page).nth(slot)).toHaveAttribute("aria-pressed", "true");
        }
        await expect(page.locator("#lock-count")).toHaveText(countLine(NON_MONSTERS.length, 0, 1));

        await tiles(page).nth(WEAK.length).click();

        await expect(tiles(page).nth(WEAK.length)).toHaveAttribute("aria-pressed", "true");
        for (const slot of [0, WEAK.length, WEAK.length * 2]) {
            await expect(forbids(page).nth(slot)).toHaveAttribute("aria-pressed", "false");
            await expect(tiles(page).nth(slot)).toHaveAttribute("data-forbidden", "false");
        }
        await expect(page.locator("#lock-count")).toHaveText(countLine(NON_MONSTERS.length + 1, 0, 0));
    });

    test("forbidding a spare card shows it on its row and counts it, and a ban is lifted from there", async ({
        page,
    }) => {
        await chooseFile(page);
        await page.locator("#deck-trunk-summary").click();

        await rowButton(page, LUSTER, "forbid").click();

        await expect(rowButton(page, LUSTER, "forbid")).toHaveAttribute("aria-pressed", "true");
        await expect(rows(page).nth(LUSTER).getByText("Prohibida", { exact: true })).toBeVisible();
        await expect(page.locator("#lock-count")).toHaveText(countLine(NON_MONSTERS.length, 0, 1));

        await rowButton(page, LUSTER, "forbid").click();
        await expect(rowButton(page, LUSTER, "forbid")).toHaveAttribute("aria-pressed", "false");
        await expect(rows(page).nth(LUSTER).getByText("Prohibida", { exact: true })).toBeHidden();
    });

    test("adding a copy of a card the deck holds locks the copy in the deck", async ({ page }) => {
        await mockOptimizer(page);
        await chooseFile(page, holdingSave());
        await page.locator("#deck-trunk-summary").click();
        await expect(tiles(page).nth(HOLDING_SLOT)).toHaveAttribute("aria-pressed", "false");

        await rowButton(page, WHITE, "add").click();

        await expect(tiles(page).nth(HOLDING_SLOT)).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator("#lock-count")).toHaveText(countLine(NON_MONSTERS.length + 1, 1, 0));
        await expect(rows(page).nth(WHITE)).toContainText("×2");
        await expect(addedTiles(page)).toHaveCount(1);

        const requestSent = page.waitForRequest("**/api/deck/optimize");
        await compute(page).click();
        // One copy in the deck stays, and one more must come in.
        expect(bodyOf(await requestSent).locked).toContainEqual({ id: 1, count: 2 });
    });

    test("an added copy stops at the copy limit, and removing it keeps the deck copy locked", async ({
        page,
    }) => {
        await chooseFile(page, holdingSave());
        await page.locator("#deck-trunk-summary").click();

        await rowButton(page, WHITE, "add").click();
        await rowButton(page, WHITE, "add").click();
        // One copy in the deck and two added make the three the deck may hold.
        await expect(rowButton(page, WHITE, "add")).toBeDisabled();
        await expect(rows(page).nth(WHITE)).toContainText("×1");

        await rowButton(page, WHITE, "remove").click();
        await expect(rowButton(page, WHITE, "add")).toBeEnabled();
        await expect(addedTiles(page)).toHaveCount(1);
        await rowButton(page, WHITE, "remove").click();
        await expect(rowButton(page, WHITE, "remove")).toBeHidden();
        await expect(page.locator("#deck-added")).toBeHidden();
        await expect(tiles(page).nth(HOLDING_SLOT)).toHaveAttribute("aria-pressed", "true");
    });

    test("unlocking the deck copy of a card with added copies drops them", async ({ page }) => {
        await chooseFile(page, holdingSave());
        await page.locator("#deck-trunk-summary").click();
        await rowButton(page, WHITE, "add").click();
        await expect(addedTiles(page)).toHaveCount(1);

        await tiles(page).nth(HOLDING_SLOT).click();

        await expect(addedTiles(page)).toHaveCount(0);
        await expect(rows(page).nth(WHITE)).toContainText("×3");
    });

    test("adding stops when the cards that must stay would fill the deck", async ({ page }) => {
        await chooseFile(page);
        await page.locator("#deck-trunk-summary").click();
        for (let slot = 0; slot < FIRST_SPELL; slot++) await tiles(page).nth(slot).click();
        // 40 locked cards leave no room for another.
        await expect(rowButton(page, ULTIMATE, "add")).toBeDisabled();
        await tiles(page).nth(0).click();
        await expect(rowButton(page, ULTIMATE, "add")).toBeEnabled();
        await rowButton(page, ULTIMATE, "add").click();
        await expect(rowButton(page, LUSTER, "add")).toBeDisabled();
    });

    test("an added tile shows its mark, says the calculation chooses what leaves, and removes the copy", async ({
        page,
    }) => {
        await chooseFile(page);
        await page.locator("#deck-trunk-summary").click();
        await rowButton(page, LUSTER, "add").click();

        await expect(page.locator("#deck-added")).toBeVisible();
        await expect(page.locator("#deck-added")).toContainText("Entran al mazo");
        await expect(page.locator("#deck-added")).toContainText(
            "El cálculo elige qué cartas salen para hacerles sitio."
        );
        await expect(addedTiles(page).first()).toHaveAccessibleName(/Black Luster Soldier, añadida/);

        await addedTiles(page).first().click();

        await expect(page.locator("#deck-added")).toBeHidden();
        await expect(page.locator("#lock-count")).toHaveText(countLine());
    });

    test("any rule change discards the shown result", async ({ page }) => {
        await mockOptimizer(page);
        await chooseFile(page);
        await page.locator("#deck-trunk-summary").click();
        const steps = [
            () => rowButton(page, LUSTER, "add").click(),
            () => rowButton(page, LUSTER, "remove").click(),
            () => forbids(page).nth(0).click(),
            () => rowButton(page, ULTIMATE, "forbid").click(),
        ];
        for (const step of steps) {
            await compute(page).click();
            await expect(page.locator("#deck-results")).toBeVisible();
            await step();
            await expect(page.locator("#deck-results")).toBeHidden();
            await expect(page.locator("#deck-results-hint")).toBeVisible();
        }
    });

    test("choosing another save starts again from the default rules", async ({ page }) => {
        await page.getByLabel("Archivo de la partida").setInputFiles(twoSavesCard());
        await page.locator("#deck-trunk-summary").click();
        await rowButton(page, 0, "forbid").click();
        await forbids(page).nth(0).click();
        await expect(page.locator("#lock-count")).toHaveText(countLine(NON_MONSTERS.length, 0, 2));

        await page.getByRole("radio", { name: /Partida 2/ }).check();

        await expect(page.locator("#lock-count")).toHaveText(countLine());
        await expect(addedTiles(page)).toHaveCount(0);
    });

    test("the marks are real buttons of at least 24 px, beside the tile and clear of the card name", async ({
        page,
    }) => {
        await chooseFile(page);
        await page.locator("#deck-trunk-summary").click();

        // Never nested: the forbid button is a sibling of the tile button.
        await expect(page.locator("#deck-lock-grid li button button")).toHaveCount(0);
        await expect(page.locator("#deck-lock-grid li").first().locator("> button")).toHaveCount(2);
        await expect(forbids(page).first()).toHaveAccessibleName(/^Prohibir /);
        const forbid = (await forbids(page).first().boundingBox())!;
        const name = (await page.locator("#deck-lock-grid .card-tile-name").first().boundingBox())!;
        const lockMark = (await page
            .locator("#deck-lock-grid [data-action='lock'] > span")
            .first()
            .boundingBox())!;
        expect(Math.min(forbid.width, forbid.height)).toBeGreaterThanOrEqual(24);
        expect(forbid.y).toBeGreaterThanOrEqual(name.y + name.height);
        expect(lockMark.y).toBeGreaterThanOrEqual(name.y + name.height);
        expect(forbid.x + forbid.width).toBeLessThanOrEqual(lockMark.x);
        for (const action of ["add", "forbid"] as const) {
            const box = (await rowButton(page, ULTIMATE, action).boundingBox())!;
            expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
        }
    });

    test("a forbidden tile is ringed and its artwork dimmed, and its name stays visible", async ({
        page,
    }) => {
        await chooseFile(page);
        await forbids(page).nth(0).click();

        const tile = tiles(page).nth(0);
        await expect(tile).toHaveClass(/ring-wb-red/);
        await expect(tile.locator(".wb-art").first()).toHaveCSS("opacity", "0.4");
        await expect(tile.locator(".card-tile-name")).toHaveCSS("opacity", "1");
        await expect(tile.locator(".card-tile-name")).toBeVisible();
    });
});

test.describe("cards added by hand", () => {
    test("choosing a suggestion adds a copy at once, sends it as a trunk copy and keeps the focus in the field", async ({
        page,
    }) => {
        await mockOptimizer(page);
        await chooseFile(page);
        await openTrunk(page);
        await expect(page.locator("#deck-trunk-summary")).toContainText("(7)");

        await manualField(page).click();
        await page.keyboard.type("dark magi");
        await option(page, DARK_NAME).click();

        await expect(manualMsg(page)).toBeVisible();
        await expect(manualMsg(page)).toHaveText("Agregada: Dark Magician.");
        await expect(manualField(page)).toHaveValue("");
        await expect(manualField(page)).toBeFocused();
        await expect(rows(page)).toHaveCount(4);
        await expect(page.locator("#deck-trunk-summary")).toContainText("(8)");
        await expect(page.locator("#spare-count")).toHaveText("8");
        await expect(page.locator("#spare-kinds")).toHaveText("4");

        const requestSent = page.waitForRequest("**/api/deck/optimize");
        await compute(page).click();
        const body = bodyOf(await requestSent);
        expect(body.trunk).toEqual([
            { id: 1, count: 3 },
            { id: 364, count: 3 },
            { id: 380, count: 1 },
            { id: DARK, count: 1 },
        ]);
        expect(Object.keys(body).sort()).toEqual([
            "deck",
            "forbidden",
            "keepNonMonsters",
            "locked",
            "trunk",
        ]);
    });

    test("the button adds an exact name, ignoring case and the spaces around it", async ({ page }) => {
        await chooseFile(page);
        await openTrunk(page);

        await addByHand(page, "  dark MAGICIAN  ");

        await expect(rowOf(page, DARK_NAME)).toContainText("×1");
        await expect(manualMsg(page)).toHaveText("Agregada: Dark Magician.");
        await expect(manualField(page)).toHaveValue("");
        await expect(manualField(page)).toBeFocused();
    });

    test("a name that is not a card, or only part of one, shows a message and adds nothing", async ({
        page,
    }) => {
        await chooseFile(page);
        await openTrunk(page);

        await addByHand(page, "Dark Magi");

        const unknown = "No hay ninguna carta con ese nombre. Elige una de la lista.";
        await expect(manualMsg(page)).toHaveText(unknown);
        await expect(rows(page)).toHaveCount(3);
        await expect(page.locator("#spare-count")).toHaveText("7");
        // The text stays, to be completed.
        await expect(manualField(page)).toHaveValue("Dark Magi");

        await manualField(page).fill("");
        await manualAdd(page).click();
        await expect(manualMsg(page)).toHaveText(unknown);
        await expect(rows(page)).toHaveCount(3);
    });

    test("a card the player holds three of is refused at once, and a fourth hand add is too", async ({
        page,
    }) => {
        await chooseFile(page);
        await openTrunk(page);

        await addByHand(page, WHITE_NAME);
        await expect(manualMsg(page)).toHaveText(
            "Ya tienes 3 copias de Blue-eyes White Dragon: más no cambiarían el resultado."
        );
        await expect(rowOf(page, WHITE_NAME)).toContainText("×3");
        await expect(rowOf(page, WHITE_NAME).locator("[data-mark='manual']")).toHaveCount(0);

        for (let copy = 0; copy < 3; copy++) await addByHand(page, DARK_NAME);
        await expect(rowOf(page, DARK_NAME)).toContainText("×3");
        await addByHand(page, DARK_NAME);
        await expect(manualMsg(page)).toHaveText(
            "Ya tienes 3 copias de Dark Magician: más no cambiarían el resultado."
        );
        await expect(rowOf(page, DARK_NAME)).toContainText("×3");
    });

    test("the cap counts the copies the deck holds", async ({ page }) => {
        await chooseFile(page, holdingSave());
        await openTrunk(page);

        // One copy in the deck and three in the trunk.
        await addByHand(page, WHITE_NAME);

        await expect(manualMsg(page)).toHaveText(
            "Ya tienes 4 copias de Blue-eyes White Dragon: más no cambiarían el resultado."
        );
    });

    test("a row with hand-added copies is marked, counts them and deletes one at a time", async ({
        page,
    }) => {
        await chooseFile(page);
        await openTrunk(page);
        await addByHand(page, DARK_NAME);
        await addByHand(page, DARK_NAME);

        const row = rowOf(page, DARK_NAME);
        await expect(row).toContainText("A mano");
        await expect(row).toContainText("×2");
        await expect(rowAction(page, DARK_NAME, "delete")).toHaveAccessibleName(
            "Borrar una copia agregada a mano de Dark Magician"
        );
        // The cards of the save have neither the mark nor the button.
        await expect(rowOf(page, "Black Luster Soldier").locator("[data-mark='manual']")).toHaveCount(0);
        await expect(rows(page).locator("button[data-action='delete']")).toHaveCount(1);

        await rowAction(page, DARK_NAME, "delete").click();
        await expect(manualMsg(page)).toHaveText("Borrada una copia de Dark Magician.");
        await expect(row).toContainText("×1");
        await expect(page.locator("#spare-count")).toHaveText("8");

        await rowAction(page, DARK_NAME, "delete").click();
        await expect(row).toHaveCount(0);
        await expect(page.locator("#spare-count")).toHaveText("7");
        await expect(page.locator("#spare-kinds")).toHaveText("3");
    });

    test("a rebuilt list shows the current rules on every row", async ({ page }) => {
        await chooseFile(page);
        await openTrunk(page);
        await rowAction(page, "Black Luster Soldier", "forbid").click();
        await addByHand(page, DARK_NAME);
        await rowAction(page, DARK_NAME, "add").click();

        // A second hand add rebuilds the list: the ban, the added copy and the disabled button all remain.
        await addByHand(page, "Time Wizard");

        const luster = rowOf(page, "Black Luster Soldier");
        await expect(luster.getByText("Prohibida", { exact: true })).toBeVisible();
        await expect(rowAction(page, "Black Luster Soldier", "forbid")).toHaveAttribute(
            "aria-pressed",
            "true"
        );
        await expect(rowOf(page, DARK_NAME)).toContainText("×0");
        await expect(rowAction(page, DARK_NAME, "remove")).toBeVisible();
        await expect(rowAction(page, DARK_NAME, "add")).toBeDisabled();
        await expect(rowAction(page, "Time Wizard", "remove")).toBeHidden();
        await expect(rowAction(page, "Time Wizard", "add")).toBeEnabled();
        await expect(rowAction(page, WHITE_NAME, "forbid")).toHaveAttribute("aria-pressed", "false");
        await expect(page.locator("#lock-count")).toHaveText(countLine(NON_MONSTERS.length, 1, 1));
    });

    test("an empty trunk shows the field open, and the nothing-to-swap notice follows the hand-added cards", async ({
        page,
    }) => {
        await chooseFile(page, emptyTrunkSave());

        await expect(page.locator("#deck-trunk")).toBeVisible();
        await expect(page.locator("#deck-trunk")).toHaveAttribute("open", "");
        await expect(manualField(page)).toBeVisible();
        await expect(page.locator("#deck-no-spare")).toBeVisible();
        await expect(rows(page)).toHaveCount(0);

        await addByHand(page, DARK_NAME);
        await expect(page.locator("#deck-no-spare")).toBeHidden();
        await expect(rows(page)).toHaveCount(1);
        await expect(page.locator("#spare-count")).toHaveText("1");

        await rowAction(page, DARK_NAME, "delete").click();
        await expect(page.locator("#deck-no-spare")).toBeVisible();
        await expect(page.locator("#spare-count")).toHaveText("0");
        // The row is gone, so the focus went to the field.
        await expect(manualField(page)).toBeFocused();
        await expect(page.locator("#deck-trunk")).toHaveAttribute("open", "");
    });

    test("a save with a trunk starts folded, with the field inside", async ({ page }) => {
        await chooseFile(page);

        await expect(page.locator("#deck-trunk")).not.toHaveAttribute("open", "");
        await expect(manualField(page)).toBeHidden();
        await openTrunk(page);
        await expect(manualField(page)).toBeVisible();
        await expect(page.getByText("Agregar una carta que no está en la partida")).toBeVisible();
    });

    test("any change to the hand-added cards discards the shown result", async ({ page }) => {
        await mockOptimizer(page);
        await chooseFile(page);
        await openTrunk(page);

        for (const step of [
            () => addByHand(page, DARK_NAME),
            () => rowAction(page, DARK_NAME, "delete").click(),
        ]) {
            await compute(page).click();
            await expect(page.locator("#deck-results")).toBeVisible();
            await step();
            await expect(page.locator("#deck-results")).toBeHidden();
            await expect(page.locator("#deck-results-hint")).toBeVisible();
        }
    });

    test("a refused add keeps the result: nothing changed", async ({ page }) => {
        await mockOptimizer(page);
        await chooseFile(page);
        await openTrunk(page);
        await compute(page).click();
        await expect(page.locator("#deck-results")).toBeVisible();

        await addByHand(page, WHITE_NAME);
        await addByHand(page, "nothing like a card");

        await expect(page.locator("#deck-results")).toBeVisible();
    });

    test("choosing another save, or another file, starts without hand-added cards", async ({ page }) => {
        await mockOptimizer(page);
        await page.getByLabel("Archivo de la partida").setInputFiles(twoSavesCard());
        await openTrunk(page);
        await addByHand(page, DARK_NAME);
        await expect(page.locator("#spare-count")).toHaveText("8");

        await page.getByRole("radio", { name: /Partida 2/ }).check();
        await expect(page.locator("#spare-count")).toHaveText("3");
        await expect(rowOf(page, DARK_NAME)).toHaveCount(0);
        await expect(manualField(page)).toHaveValue("");
        await expect(manualMsg(page)).toBeHidden();

        await page.getByRole("radio", { name: /Partida 1/ }).check();
        await expect(page.locator("#spare-count")).toHaveText("7");
        await expect(rowOf(page, DARK_NAME)).toHaveCount(0);

        // A new choice folds the list again.
        await openTrunk(page);
        await addByHand(page, DARK_NAME);
        await page.getByLabel("Archivo de la partida").setInputFiles(saveFile("again.sav"));
        await expect(page.locator("#spare-count")).toHaveText("7");
        const requestSent = page.waitForRequest("**/api/deck/optimize");
        await compute(page).click();
        expect(JSON.stringify(bodyOf(await requestSent).trunk)).not.toContain(`"id":${DARK}`);
    });

    test("the results say they count the hand-added cards only when those were sent", async ({ page }) => {
        await mockOptimizer(page);
        await chooseFile(page);
        await openTrunk(page);
        const sentence = "Este resultado cuenta las cartas que agregaste a mano.";

        await compute(page).click();
        await expect(page.locator("#deck-results")).toBeVisible();
        await expect(page.locator("#deck-results")).not.toContainText(sentence);

        await addByHand(page, DARK_NAME);
        await compute(page).click();
        await expect(page.locator("#deck-results")).toContainText(sentence);

        await rowAction(page, DARK_NAME, "delete").click();
        await expect(page.locator("#deck-results")).toBeHidden();
        await compute(page).click();
        await expect(page.locator("#deck-results")).toBeVisible();
        await expect(page.locator("#deck-results")).not.toContainText(sentence);
    });

    test("the sentence is true of the answer even if a card is added while it calculates", async ({
        page,
    }) => {
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => (release = resolve));
        await page.route("**/api/deck/optimize", async (route) => {
            await gate;
            await json(route, 200, answer());
        });
        await chooseFile(page);
        await openTrunk(page);

        await compute(page).click();
        await expect(page.locator("#deck-loading")).toBeVisible();
        await addByHand(page, DARK_NAME);
        release();

        // The calculation was made without the card, and the change dropped it.
        await expect(page.locator("#deck-results")).toBeHidden();
        await expect(page.locator("#deck-results-hint")).toBeVisible();
    });

    test("a card the save lacks can be added by hand and then to the deck, and it is sent locked", async ({
        page,
    }) => {
        await mockOptimizer(page);
        await chooseFile(page);
        await openTrunk(page);
        await addByHand(page, DARK_NAME);

        await rowAction(page, DARK_NAME, "add").click();
        await expect(addedTiles(page)).toHaveCount(1);
        await expect(rowOf(page, DARK_NAME)).toContainText("×0");

        const requestSent = page.waitForRequest("**/api/deck/optimize");
        await compute(page).click();
        const body = bodyOf(await requestSent);
        expect(body.locked).toContainEqual({ id: DARK, count: 1 });
        expect(body.trunk).toContainEqual({ id: DARK, count: 1 });
    });

    test("deleting a copy keeps a ban while the trunk of the save still holds the card", async ({
        page,
    }) => {
        await mockOptimizer(page);
        await page.getByLabel("Archivo de la partida").setInputFiles(twoSavesCard());
        await page.getByRole("radio", { name: /Partida 2/ }).check();
        await openTrunk(page);
        // The last row is a card of the trunk of the save itself, which the player then also adds by hand.
        const name = (await rows(page).last().locator("span").first().textContent()) as string;
        await addByHand(page, name);
        await rowAction(page, name, "forbid").click();
        await expect(page.locator("#lock-count")).toHaveText(countLine(4, 0, 1));

        await rowAction(page, name, "delete").click();

        await expect(rowAction(page, name, "forbid")).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator("#lock-count")).toHaveText(countLine(4, 0, 1));
        const requestSent = page.waitForRequest("**/api/deck/optimize");
        await compute(page).click();
        expect(bodyOf(await requestSent).forbidden).toHaveLength(1);
    });

    test("the field works from the keyboard, and the delete button keeps the focus", async ({ page }) => {
        await chooseFile(page);
        await openTrunk(page);
        const row = rowOf(page, DARK_NAME);

        await manualField(page).focus();
        await page.keyboard.type("dark magici");
        await expect(option(page, DARK_NAME)).toBeVisible();
        await page.keyboard.press("Enter");
        await expect(row).toContainText("×1");
        await expect(manualField(page)).toBeFocused();
        await expect(manualField(page)).toHaveValue("");

        // With the list closed, Enter adds the name as typed.
        await page.keyboard.type(DARK_NAME);
        await page.keyboard.press("Escape");
        await page.keyboard.press("Enter");
        await expect(row).toContainText("×2");
        await expect(manualField(page)).toBeFocused();

        const remove = rowAction(page, DARK_NAME, "delete");
        await remove.focus();
        await page.keyboard.press("Enter");
        await expect(row).toContainText("×1");
        await expect(rowAction(page, DARK_NAME, "delete")).toBeFocused();
        await page.keyboard.press("Space");
        await expect(row).toHaveCount(0);
        await expect(manualField(page)).toBeFocused();
    });

    test("the suggestions are not clipped by the scroll box of the list", async ({ page }) => {
        await chooseFile(page);
        await openTrunk(page);

        await manualField(page).click();
        await page.keyboard.type("dark");
        const list = page.locator("#deck-manual [role='listbox']");
        await expect(list).toBeVisible();
        expect(await list.locator("[role='option']").count()).toBeGreaterThan(1);

        // The last suggestion is reachable: the topmost element at its centre is the suggestion itself.
        const last = list.locator("[role='option']").last();
        await last.scrollIntoViewIfNeeded();
        const box = (await last.boundingBox())!;
        const hit = await page.evaluate(
            ({ x, y }) => document.elementFromPoint(x, y)?.closest("[role='option']")?.textContent ?? null,
            { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        );
        expect(hit).toBe(await last.textContent());
        // The list is not inside the box that scrolls.
        expect(await page.locator("#deck-trunk-box [role='listbox']").count()).toBe(0);
    });

    test("a new row is scrolled into view inside its box", async ({ page }) => {
        const crowded: Record<number, number> = {};
        for (let id = 2; id <= 21; id++) crowded[id] = 1;
        await chooseFile(page, {
            name: "crowded.sav",
            mimeType: "application/octet-stream",
            buffer: Buffer.from(makeBlock(DECK, crowded)),
        });
        await openTrunk(page);

        // A spell sorts after every monster: its row starts below the fold of the box.
        await addByHand(page, "Dark Energy");

        const row = rowOf(page, "Dark Energy").first();
        await expect(manualMsg(page)).toHaveText("Agregada: Dark Energy.");
        const boxBounds = (await page.locator("#deck-trunk-box").boundingBox())!;
        const rowBounds = (await row.boundingBox())!;
        expect(rowBounds.y).toBeGreaterThanOrEqual(boxBounds.y - 1);
        expect(rowBounds.y + rowBounds.height).toBeLessThanOrEqual(boxBounds.y + boxBounds.height + 1);
    });

    test("nothing scrolls the page sideways at 375 px, with hand-added cards and results", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await mockOptimizer(page);
        await chooseFile(page);
        await openTrunk(page);
        await addByHand(page, DARK_NAME);
        await addByHand(page, DARK_NAME);
        await addByHand(page, "Dark Magi");
        await compute(page).click();
        await expect(page.locator("#deck-results")).toBeVisible();

        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);
        await manualField(page).fill("dark");
        await expect(page.locator("#deck-manual [role='listbox']")).toBeVisible();
        const list = (await page.locator("#deck-manual [role='listbox']").boundingBox())!;
        expect(list.x).toBeGreaterThanOrEqual(0);
        expect(list.x + list.width).toBeLessThanOrEqual(375);
    });
});

test.describe("what the result says when the rules lower the average", () => {
    const lower = {
        recommended: { averageBestAtk: 1200.2, share1500: 0.3, share2000: 0.1, shareDead: 0.3 },
    };

    test("it shows a real minus sign and says the rules lower the average", async ({ page }) => {
        await mockOptimizer(page, answer(lower));
        await chooseFile(page);
        await compute(page).click();

        const first = page.locator("#deck-results table tbody tr").first();
        await expect(first).toContainText("Empeora: −116,1");
        await expect(first).not.toContainText("Mejora");
        await expect(page.locator("#deck-results")).toContainText(
            "Tus reglas bajan el promedio de este mazo."
        );
        await expect(page.locator("#deck-status")).toContainText(
            "Tus reglas bajan el promedio de este mazo."
        );
        await expect(
            page.locator("#deck-result-title").locator("xpath=ancestor::div[contains(@class,'win-bar')]")
        ).toHaveClass(/win-bar-red/);
    });

    test("an answer that is better does not say it", async ({ page }) => {
        await mockOptimizer(page);
        await chooseFile(page);
        await compute(page).click();

        await expect(page.locator("#deck-results")).toBeVisible();
        await expect(page.locator("#deck-results")).not.toContainText("bajan el promedio");
    });
});

test.describe("reading the file", () => {
    test("a file that is not a save is explained and nothing is sent", async ({ page }) => {
        const sent: string[] = [];
        page.on("request", (request) => {
            if (request.url().includes("/api/deck")) sent.push(request.url());
        });

        await page
            .getByLabel("Archivo de la partida")
            .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a save") });

        await expect(page.getByRole("alert")).toContainText("No hemos encontrado ninguna partida");
        await expect(page.locator("#deck-collection")).toBeHidden();
        expect(sent).toEqual([]);
    });

    test("a file over 1 MB is refused by its size", async ({ page }) => {
        await page.getByLabel("Archivo de la partida").setInputFiles({
            name: "big.bin",
            mimeType: "application/octet-stream",
            buffer: Buffer.alloc(1024 * 1024 + 1),
        });

        await expect(page.getByRole("alert")).toContainText("más de 1 MB");
        await expect(page.locator("#deck-collection")).toBeHidden();
    });

    test("a card with several saves asks which one, and sends the chosen one", async ({ page }) => {
        await mockOptimizer(page);
        await page.getByLabel("Archivo de la partida").setInputFiles(twoSavesCard());

        const group = page.getByRole("group", { name: /2 partidas/ });
        await expect(group).toBeVisible();
        const first = group.getByRole("radio", { name: /Partida 1/ });
        const second = group.getByRole("radio", { name: /Partida 2/ });
        await expect(first).toBeChecked();
        await expect(page.locator("#spare-count")).toHaveText("7");

        await second.check();
        await expect(page.locator("#spare-count")).toHaveText("3");
        await expect(page.locator("#spare-kinds")).toHaveText("2");

        const requestSent = page.waitForRequest("**/api/deck/optimize");
        await compute(page).click();
        const body = (await requestSent).postDataJSON() as { deck: number[] };
        expect(body.deck).toEqual(OTHER_DECK);
    });

    test("choosing another file clears the old results", async ({ page }) => {
        await mockOptimizer(page);
        await chooseFile(page);
        await compute(page).click();
        await expect(page.locator("#deck-results")).toBeVisible();

        await page.getByLabel("Archivo de la partida").setInputFiles(saveFile("again.sav"));

        await expect(page.locator("#deck-results")).toBeHidden();
        await expect(page.locator("#deck-results-hint")).toBeVisible();
    });
});

test.describe("what the result claims", () => {
    const cases = [
        {
            name: "a certified deck is the best possible one",
            body: { certified: true, method: "exhaustive" },
            text: "Es el mejor mazo posible con tus cartas que respeta tus cartas bloqueadas, añadidas y prohibidas.",
        },
        {
            name: "a local search that finished says no single swap helps, under the rules",
            body: {},
            text: "Con tus reglas, cambiar una sola carta del mazo por cualquiera de las que tienes no lo mejora.",
        },
        {
            name: "a truncated search says it is the best found in the time",
            body: { truncated: true },
            text: "el mejor mazo que hemos encontrado en el tiempo disponible",
        },
        {
            name: "no swaps says the current deck is already the best the search finds",
            body: { swaps: [] },
            text: "Tu mazo actual ya es el mejor que encuentra la búsqueda",
        },
    ];
    for (const { name, body, text } of cases) {
        test(name, async ({ page }) => {
            await mockOptimizer(page, answer(body));
            await chooseFile(page);
            await compute(page).click();
            await expect(page.locator("#deck-results")).toContainText(text);
        });
    }

    test("with no rule a local search says no single swap helps, without mentioning rules", async ({
        page,
    }) => {
        await mockOptimizer(page);
        await chooseFile(page);
        for (let slot = FIRST_SPELL; slot < 40; slot++) await tiles(page).nth(slot).click();
        await compute(page).click();
        await expect(page.locator("#deck-results")).toContainText(
            "Cambiar una sola carta del mazo por cualquiera de las que tienes no lo mejora."
        );
        await expect(page.locator("#deck-results")).not.toContainText("reglas");
    });

    test("with no card locked a certified deck does not mention locks", async ({ page }) => {
        await mockOptimizer(page, answer({ certified: true, method: "exhaustive" }));
        await chooseFile(page);
        for (let slot = FIRST_SPELL; slot < 40; slot++) await tiles(page).nth(slot).click();
        await compute(page).click();
        await expect(page.locator("#deck-results")).toContainText(
            "Es el mejor mazo posible con tus cartas."
        );
        await expect(page.locator("#deck-results")).not.toContainText("bloqueadas");
    });

    test("the stats table shows both decks and the change with words, not only colour", async ({ page }) => {
        await mockOptimizer(page);
        await chooseFile(page);
        await compute(page).click();

        const rows = page.locator("#deck-results table tbody tr");
        await expect(rows.first()).toContainText("1316,3");
        await expect(rows.first()).toContainText("1420,9");
        await expect(rows.first()).toContainText("Mejora: +104,6");
        // Fewer dead hands is the better result.
        await expect(rows.nth(3)).toContainText("Mejora: −7,7 pts");
    });
});

test.describe("failures", () => {
    test("a busy server is explained and the retry waits for Retry-After", async ({ page }) => {
        let calls = 0;
        await page.route("**/api/deck/optimize", (route) => {
            calls += 1;
            return calls === 1
                ? json(route, 503, { error: { code: "busy", message: "busy" } }, { "Retry-After": "2" })
                : json(route, 200, answer());
        });
        await chooseFile(page);
        await compute(page).click();

        await expect(page.getByRole("alert")).toContainText("calculando el mazo de otra persona");
        const retry = page.getByRole("button", { name: /Reintentar en/ });
        await expect(retry).toBeDisabled();
        const enabled = page.getByRole("button", { name: "Reintentar", exact: true });
        await expect(enabled).toBeEnabled({ timeout: 5_000 });
        await enabled.click();
        await expect(page.locator("#deck-results")).toBeVisible();
        expect(calls).toBe(2);
    });

    test("a rejected deck says what to do", async ({ page }) => {
        await page.route("**/api/deck/optimize", (route) =>
            json(route, 400, { error: { code: "unknown-card", message: "No card with id 9" } })
        );
        await chooseFile(page);
        await compute(page).click();

        await expect(page.getByRole("alert")).toContainText("El servidor no ha aceptado este mazo");
    });

    test("rules that leave no deck are explained, with no retry", async ({ page }) => {
        let calls = 0;
        await page.route("**/api/deck/optimize", (route) => {
            calls += 1;
            return json(route, 400, {
                error: {
                    code: "impossible-deck",
                    message: "No deck of 40 cards obeys these rules",
                    details: { required: 41, allowed: 60, size: 40 },
                },
            });
        });
        await chooseFile(page);
        await compute(page).click();

        await expect(page.getByRole("alert")).toContainText("no se puede armar un mazo de 40 cartas");
        await expect(page.getByRole("alert")).toContainText("Cambia alguna");
        await expect(page.getByRole("button", { name: /Reintentar/ })).toHaveCount(0);
        expect(calls).toBe(1);
    });

    test("a server error can be retried", async ({ page }) => {
        let calls = 0;
        await page.route("**/api/deck/optimize", (route) => {
            calls += 1;
            return calls === 1
                ? json(route, 500, { error: { code: "internal-error", message: "x" } })
                : json(route, 200, answer());
        });
        await chooseFile(page);
        await compute(page).click();

        await expect(page.getByRole("alert")).toContainText("No se ha podido calcular el mazo");
        await page.getByRole("button", { name: "Reintentar" }).click();
        await expect(page.locator("#deck-results")).toBeVisible();
    });

    test("a connection that fails can be retried", async ({ page }) => {
        let calls = 0;
        await page.route("**/api/deck/optimize", (route) => {
            calls += 1;
            return calls === 1 ? route.abort("failed") : json(route, 200, answer());
        });
        await chooseFile(page);
        await compute(page).click();

        await expect(page.getByRole("alert")).toContainText("Revisa tu conexión");
        await page.getByRole("button", { name: "Reintentar" }).click();
        await expect(page.locator("#deck-results")).toBeVisible();
    });

    test("while it calculates the button says so and ignores a second click", async ({ page }) => {
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => (release = resolve));
        let calls = 0;
        await page.route("**/api/deck/optimize", async (route) => {
            calls += 1;
            await gate;
            await json(route, 200, answer());
        });
        await chooseFile(page);
        await compute(page).click();

        const busy = page.getByRole("button", { name: "Calculando…" });
        await expect(busy).toHaveAttribute("aria-disabled", "true");
        await expect(page.locator("#deck-loading")).toBeVisible();
        await expect(page.locator("#deck-status")).toHaveText(
            "Calculando el mejor mazo. Puede tardar unos segundos."
        );
        // aria-disabled keeps the button focusable, so the click goes through and must be ignored.
        await busy.click({ force: true });
        release();
        await expect(page.locator("#deck-results")).toBeVisible();
        expect(calls).toBe(1);
    });
});

test.describe("layout and keyboard", () => {
    test("the page does not scroll sideways at 375 px, with results shown", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await mockOptimizer(page);
        await chooseFile(page);
        await compute(page).click();
        await expect(page.locator("#deck-results")).toBeVisible();

        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);
    });

    test("the whole flow works from the keyboard", async ({ page }) => {
        await mockOptimizer(page);
        await chooseFile(page);
        await tiles(page).nth(FIRST_SPELL).focus();
        await page.keyboard.press("Space");
        await expect(tiles(page).nth(FIRST_SPELL)).toHaveAttribute("aria-pressed", "false");
        await compute(page).focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("heading", { name: "Mazo recomendado" }).last()).toBeFocused();
    });

    test("the tile buttons and the row buttons work from the keyboard and keep the focus", async ({
        page,
    }) => {
        await mockOptimizer(page);
        await chooseFile(page, holdingSave());
        await page.locator("#deck-trunk-summary").click();

        const forbid = forbids(page).nth(0);
        await forbid.focus();
        await page.keyboard.press("Space");
        await expect(forbid).toHaveAttribute("aria-pressed", "true");
        await expect(forbid).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(forbid).toHaveAttribute("aria-pressed", "false");
        await expect(forbid).toBeFocused();

        const add = rowButton(page, WHITE, "add");
        await add.focus();
        await page.keyboard.press("Enter");
        await expect(addedTiles(page)).toHaveCount(1);
        await expect(add).toBeFocused();
        // The second copy fills the limit: the button turns off, so the focus moves to Quitar.
        await page.keyboard.press("Space");
        await expect(add).toBeDisabled();
        await expect(rowButton(page, WHITE, "remove")).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(rowButton(page, WHITE, "remove")).toBeFocused();
        await page.keyboard.press("Space");
        // The last copy is gone: Quitar hides, so the focus moves to Añadir.
        await expect(rowButton(page, WHITE, "remove")).toBeHidden();
        await expect(add).toBeFocused();

        const forbidRow = rowButton(page, LUSTER, "forbid");
        await forbidRow.focus();
        await page.keyboard.press("Space");
        await expect(forbidRow).toHaveAttribute("aria-pressed", "true");
        await expect(forbidRow).toBeFocused();
    });

    test("removing an added tile moves the focus to the next one, then to the spare cards", async ({
        page,
    }) => {
        await chooseFile(page);
        const summary = page.locator("#deck-trunk-summary");
        await summary.click();
        await rowButton(page, ULTIMATE, "add").click();
        await rowButton(page, LUSTER, "add").click();
        await rowButton(page, WHITE, "add").click();
        await expect(addedTiles(page)).toHaveCount(3);

        await addedTiles(page).nth(0).focus();
        await page.keyboard.press("Enter");
        await expect(addedTiles(page)).toHaveCount(2);
        await expect(addedTiles(page).nth(0)).toBeFocused();
        await page.keyboard.press("Space");
        await expect(addedTiles(page)).toHaveCount(1);
        await expect(addedTiles(page).nth(0)).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("#deck-added")).toBeHidden();
        await expect(summary).toBeFocused();
    });

    test("the rules do not scroll the page sideways at 375 px, with results shown", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await mockOptimizer(page);
        await chooseFile(page);
        await page.locator("#deck-trunk-summary").click();
        for (const row of [ULTIMATE, LUSTER, WHITE]) await rowButton(page, row, "add").click();
        await rowButton(page, WHITE, "forbid").click();
        await forbids(page).nth(0).click();
        await expect(addedTiles(page)).toHaveCount(2);
        await compute(page).click();
        await expect(page.locator("#deck-results")).toBeVisible();

        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);
        // The buttons of a row wrap under its name.
        const name = (await rows(page).nth(ULTIMATE).locator("span").first().boundingBox())!;
        const button = (await rowButton(page, ULTIMATE, "add").boundingBox())!;
        expect(button.y).toBeGreaterThanOrEqual(name.y + name.height);
    });

    test("the navbar links the page and marks it as the current one", async ({ page }) => {
        const link = page.locator('#primary-navigation a[aria-current="page"]');
        await expect(link).toHaveText("Mejor mazo");
        await expect(link).toHaveAttribute("href", "/deck");
    });
});
