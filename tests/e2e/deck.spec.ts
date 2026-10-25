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
        await expect(page.getByLabel("Mantener la magia, los equipos y los campos")).toBeChecked();

        const requestSent = page.waitForRequest("**/api/deck/optimize");
        await compute(page).click();
        const request = await requestSent;
        const body = request.postDataJSON() as Record<string, unknown>;
        expect(Object.keys(body).sort()).toEqual(["deck", "keepNonMonsters", "trunk"]);
        expect(body.deck).toEqual(DECK);
        expect(body.trunk).toEqual([
            { id: 1, count: 3 },
            { id: 364, count: 3 },
            { id: 380, count: 1 },
        ]);
        expect(body.keepNonMonsters).toBe(true);
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
    });

    test("the keep option is sent as keepNonMonsters, and when on no magic or equip leaves the deck", async ({
        page,
    }) => {
        await chooseFile(page);

        const keptRequest = page.waitForRequest("**/api/deck/optimize");
        const keptResponse = page.waitForResponse("**/api/deck/optimize");
        await compute(page).click();
        expect(((await keptRequest).postDataJSON() as { keepNonMonsters: boolean }).keepNonMonsters).toBe(
            true
        );
        const kept = (await (await keptResponse).json()) as { deck: Array<{ id: number }> };
        const keptIds = kept.deck.map((c) => c.id);
        for (const id of NON_MONSTERS) expect(keptIds).toContain(id);
        await expect(page.locator("#deck-results")).toBeVisible({ timeout: 15_000 });

        // Changing the option drops the old answer, which was made with the other one.
        await page.getByLabel("Mantener la magia, los equipos y los campos").uncheck();
        await expect(page.locator("#deck-results")).toBeHidden();

        const freeRequest = page.waitForRequest("**/api/deck/optimize");
        await compute(page).click();
        expect(((await freeRequest).postDataJSON() as { keepNonMonsters: boolean }).keepNonMonsters).toBe(
            false
        );
        await expect(page.locator("#deck-results")).toBeVisible({ timeout: 15_000 });
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
            text: "Es el mejor mazo posible con tus cartas, sin tocar la magia, los equipos ni los campos.",
        },
        {
            name: "a local search that finished says no single swap helps",
            body: {},
            text: "Cambiar una sola carta del mazo por cualquiera de las que tienes no lo mejora.",
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

    test("without the keep option a certified deck does not mention magic", async ({ page }) => {
        await mockOptimizer(page, answer({ certified: true, method: "exhaustive" }));
        await chooseFile(page);
        await page.getByLabel("Mantener la magia, los equipos y los campos").uncheck();
        await compute(page).click();
        await expect(page.locator("#deck-results")).toContainText(
            "Es el mejor mazo posible con tus cartas."
        );
        await expect(page.locator("#deck-results")).not.toContainText("sin tocar la magia");
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
        await expect(rows.nth(3)).toContainText("Mejora: -7,7 pts");
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
        await page.getByLabel("Mantener la magia, los equipos y los campos").focus();
        await page.keyboard.press("Space");
        await expect(page.getByLabel("Mantener la magia, los equipos y los campos")).not.toBeChecked();
        await page.keyboard.press("Tab");
        await expect(compute(page)).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("heading", { name: "Mazo recomendado" }).last()).toBeFocused();
    });

    test("the navbar links the page and marks it as the current one", async ({ page }) => {
        const link = page.locator('#primary-navigation a[aria-current="page"]');
        await expect(link).toHaveText("Mejor mazo");
        await expect(link).toHaveAttribute("href", "/deck");
    });
});
