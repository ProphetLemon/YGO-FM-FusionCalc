import {
    expect,
    test,
    type APIRequestContext,
    type Locator,
    type Page,
    type Request as PageRequest,
    type Route,
} from "@playwright/test";
import {
    BOARD_KEY,
    LEGACY_HAND_KEY,
    ZONE_SIZE,
    ZONES,
    handSlot,
    typeInSlot,
    zoneSlot,
    type Zone,
} from "./helpers/board.js";

const MYSTICAL_ELF = "Mystical Elf";
const MUSHROOM_MAN = "Mushroom Man";
const BLUE_EYES = "Blue-eyes White Dragon";
const DARK_HOLE = "Dark Hole";
const FOREST = "Forest";
const SPARKS = "Sparks";
// The one fusion of the pair, with no equip and no ritual.
const FUSION_PAIR = [MYSTICAL_ELF, MUSHROOM_MAN];
const FUSION_RESULT = "Queen of Autumn Leaves";
const UNKNOWN_NAME = "Definitely Not A Card";
// "mushroo": the two names that start with it and nothing else.
const MUSHROOMS = [MUSHROOM_MAN, "Mushroom Man #2"];

// What the page keeps in localStorage, spelled out here on purpose (see helpers/board.ts): a change to the key
// or to the shape would make every board a user saved unreadable, so the specs have to fail when either changes.
// Where the page keeps the card index once it has it (src/client/lib/api.ts).
const CARDS_INDEX_KEY = "ygo-fm:cards-index:v2";

const TEXT = {
    lookupFailed: "No se pudo buscar la carta. Inténtalo de nuevo.",
    indexFailed: "No se pudo cargar la lista de cartas.",
    retry: "Reintentar",
    notMonster: "Esta zona solo admite monstruos. La carta no cuenta en los resultados.",
    notSpell: "Esta zona no admite monstruos. La carta no cuenta en los resultados.",
};

const onPath =
    (path: string) =>
    (url: URL): boolean =>
        url.pathname === path;
const isCalculator = onPath("/api/calculator");
const isCardLookup = onPath("/api/cards");
const isCardsIndex = onPath("/api/cards-index");

test.beforeEach(async ({ page }) => {
    // The specs check behaviour, not artwork, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

type Slots = ReadonlyArray<number | null>;
type Names = ReadonlyArray<string | null>;

// A zone as saved: the ids of its five slots, empty ones null. A short list is padded.
function zoneIds(ids: Slots = []): Array<number | null> {
    return Array.from({ length: ZONE_SIZE }, (_, i) => ids[i] ?? null);
}

interface SavedBoard {
    hand?: Slots;
    monsters?: Slots;
    spells?: Slots;
}

function savedValue(board: SavedBoard): string {
    return JSON.stringify({
        v: 2,
        hand: zoneIds(board.hand),
        monsters: zoneIds(board.monsters),
        spells: zoneIds(board.spells),
    });
}

function legacyValue(slots: Slots): string {
    return JSON.stringify({ v: 1, slots });
}

// The zone key of a saved board for a zone of the page.
const SAVED_ZONE: Record<Zone, keyof SavedBoard> = { hand: "hand", monster: "monsters", spell: "spells" };

function slotName(page: Page, zone: Zone, index: number): Locator {
    return zoneSlot(page, zone, index).locator(".slot-name");
}

function results(page: Page): Locator {
    return page.locator("#outputarealeft");
}

async function fillSlot(page: Page, zone: Zone, index: number, name: string): Promise<void> {
    await typeInSlot(page, zone, index, name);
}

async function fillCards(page: Page, zone: Zone, names: readonly string[]): Promise<void> {
    for (const [index, name] of names.entries()) {
        await fillSlot(page, zone, index, name);
        await expect(slotName(page, zone, index)).toHaveText(name);
    }
}

async function fillHand(page: Page, names: readonly string[]): Promise<void> {
    await fillCards(page, "hand", names);
}

// The board of a page that has just opened: slots exist at once but the cards come from the card index, and
// suggestions only list once the index is there. Only for pages that start with no saved board: typing in the
// first slot is a touch that would keep a saved card out of it.
async function openCalculator(page: Page): Promise<void> {
    await page.goto("/calculator");
    const input = handSlot(page, 0).locator("input");
    await input.fill("Mystical");
    await expect(page.getByRole("option", { name: MYSTICAL_ELF, exact: true })).toBeVisible();
    await input.fill("");
}

// The page stores the index the moment it has it, and everything that waited for it runs right after in the
// same turn of the event loop: once it is stored, the saved board has been put back (or not).
async function waitForIndex(page: Page): Promise<void> {
    await expect
        .poll(() => page.evaluate((key) => window.sessionStorage.getItem(key) !== null, CARDS_INDEX_KEY))
        .toBe(true);
}

// The slots of a zone in order: the name of the card in each, null for a slot that is empty.
async function expectZone(page: Page, zone: Zone, names: Names): Promise<void> {
    const slots = Array.from({ length: ZONE_SIZE }, (_, i) => names[i] ?? null);
    for (const [index, name] of slots.entries()) {
        await expect(slotName(page, zone, index)).toHaveText(name ?? "");
        await expect(zoneSlot(page, zone, index).locator("input")).toHaveValue(name ?? "");
        const filled = zoneSlot(page, zone, index).locator(".slot-filled");
        if (name === null) await expect(filled).toBeHidden();
        else await expect(filled).toBeVisible();
    }
}

interface ShownBoard {
    hand?: Names;
    monster?: Names;
    spell?: Names;
}

// The whole board: fifteen slots, whatever is not named is empty.
async function expectBoard(page: Page, board: ShownBoard): Promise<void> {
    await expect(page.locator(".board-slot")).toHaveCount(ZONES.length * ZONE_SIZE);
    for (const zone of ZONES) await expectZone(page, zone, board[zone] ?? []);
}

async function savedRaw(page: Page): Promise<string | null> {
    return page.evaluate((key) => window.localStorage.getItem(key), BOARD_KEY);
}

async function legacyRaw(page: Page): Promise<string | null> {
    return page.evaluate((key) => window.localStorage.getItem(key), LEGACY_HAND_KEY);
}

async function savedBoard(page: Page): Promise<unknown> {
    const raw = await savedRaw(page);
    return raw === null ? null : (JSON.parse(raw) as unknown);
}

// The value the page is expected to hold: the id in every slot of every zone, null for a slot that is empty.
async function expectSaved(page: Page, board: SavedBoard): Promise<void> {
    await expect
        .poll(() => savedBoard(page))
        .toEqual({
            v: 2,
            hand: zoneIds(board.hand),
            monsters: zoneIds(board.monsters),
            spells: zoneIds(board.spells),
        });
}

// Puts a value in localStorage before the calculator opens. Any page of the site reaches it, and this one
// never writes to it.
async function seed(page: Page, key: string, raw: string): Promise<void> {
    await page.goto("/about");
    await page.evaluate(([k, value]) => window.localStorage.setItem(k, value), [key, raw] as const);
}

async function seedBoard(page: Page, raw: string): Promise<void> {
    await seed(page, BOARD_KEY, raw);
}

async function seedLegacyHand(page: Page, raw: string): Promise<void> {
    await seed(page, LEGACY_HAND_KEY, raw);
}

async function idOf(request: APIRequestContext, name: string): Promise<number> {
    const response = await request.get(`/api/cards?name=${encodeURIComponent(name)}`);
    return ((await response.json()) as { card: { id: number } }).card.id;
}

async function ids(request: APIRequestContext, names: readonly string[]): Promise<number[]> {
    return Promise.all(names.map((name) => idOf(request, name)));
}

async function pairIds(request: APIRequestContext): Promise<{ elf: number; mushroom: number }> {
    return { elf: await idOf(request, MYSTICAL_ELF), mushroom: await idOf(request, MUSHROOM_MAN) };
}

// Uncaught exceptions and unhandled rejections, and console errors other than a failed request: the specs
// make requests fail on purpose, and the browser logs each of them.
function watchPageErrors(page: Page): string[] {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
        if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
            problems.push(`console: ${message.text()}`);
        }
    });
    return problems;
}

interface RequestLog {
    readonly started: PageRequest[];
    pending(): number;
}

// Records the requests of one kind, and how many of them have neither finished nor failed yet.
function logRequests(page: Page, matches: (url: URL) => boolean): RequestLog {
    const started: PageRequest[] = [];
    let done = 0;
    const counts = (request: PageRequest): boolean => matches(new URL(request.url()));
    page.on("request", (request) => {
        if (counts(request)) started.push(request);
    });
    const finish = (request: PageRequest): void => {
        if (counts(request)) done++;
    };
    page.on("requestfinished", finish);
    page.on("requestfailed", finish);
    return { started, pending: () => started.length - done };
}

// Holds every matching request until the test lets it go, so the test decides when the answer comes.
async function holdRequests(page: Page, matches: (url: URL) => boolean): Promise<Route[]> {
    const held: Route[] = [];
    await page.route(matches, (route) => {
        held.push(route);
    });
    return held;
}

async function release(route: Route | undefined): Promise<void> {
    if (!route) throw new Error("no request was held");
    await route.continue().catch(() => undefined);
}

async function pause(page: Page): Promise<void> {
    await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
}

// Nothing is in flight any more and the page had a moment to apply the last answer.
async function settled(page: Page, log: RequestLog): Promise<void> {
    await pause(page);
    await expect.poll(() => log.pending()).toBe(0);
    await pause(page);
}

interface SentBoard {
    handIds: number[];
    monsterIds: number[];
    spellIds: number[];
}

function sentBoard(request: PageRequest): SentBoard {
    return request.postDataJSON() as SentBoard;
}

test.describe("saving the board", () => {
    test("saves the id of each card in slot order, zone by zone, and null for a slot that is empty", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        const [celtic, darkHole] = await ids(request, ["Celtic Guardian", DARK_HOLE]);
        await openCalculator(page);

        await fillSlot(page, "hand", 0, MYSTICAL_ELF);
        await fillSlot(page, "hand", 2, MUSHROOM_MAN);
        await fillSlot(page, "monster", 1, "Celtic Guardian");
        await fillSlot(page, "spell", 4, DARK_HOLE);

        await expectSaved(page, {
            hand: [elf, null, mushroom],
            monsters: [null, celtic as number],
            spells: [null, null, null, null, darkHole as number],
        });
    });

    test("saves a card picked from the suggestions", async ({ page, request }) => {
        const { elf } = await pairIds(request);
        await openCalculator(page);

        await handSlot(page, 0).locator("input").fill("Mysti");
        await page.getByRole("option", { name: MYSTICAL_ELF, exact: true }).click();

        await expectSaved(page, { hand: [elf] });
    });

    test("saves a card typed in another case under its id", async ({ page, request }) => {
        const { elf } = await pairIds(request);
        await openCalculator(page);

        await fillSlot(page, "hand", 1, "mystical ELF");

        await expectSaved(page, { hand: [null, elf] });
    });

    test("leaves out a name the index does not know", async ({ page, request }) => {
        const { elf, mushroom } = await pairIds(request);
        await openCalculator(page);

        await fillSlot(page, "hand", 0, MYSTICAL_ELF);
        await fillSlot(page, "hand", 1, MUSHROOM_MAN);
        await fillSlot(page, "hand", 2, UNKNOWN_NAME);

        await expectSaved(page, { hand: [elf, mushroom] });
        await expect(handSlot(page, 2).locator("input")).toHaveValue(UNKNOWN_NAME);
    });

    test("leaves out a card of the wrong kind for its zone, which is not sent either", async ({
        page,
        request,
    }) => {
        const { elf } = await pairIds(request);
        const [darkHole] = await ids(request, [DARK_HOLE]);
        await openCalculator(page);
        await fillSlot(page, "hand", 0, MYSTICAL_ELF);

        await fillSlot(page, "monster", 0, DARK_HOLE);
        await fillSlot(page, "spell", 0, MYSTICAL_ELF);

        await expect(zoneSlot(page, "monster", 0).getByRole("alert")).toHaveText(TEXT.notMonster);
        await expect(zoneSlot(page, "spell", 0).getByRole("alert")).toHaveText(TEXT.notSpell);
        await expectSaved(page, { hand: [elf] });
        expect(darkHole).toBeGreaterThan(0);
    });

    test("saves from the names in the inputs, so failing artwork lookups do not matter", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        await openCalculator(page);
        await page.route(isCardLookup, (route) => route.abort());

        await fillSlot(page, "hand", 0, MYSTICAL_ELF);
        await fillSlot(page, "hand", 1, MUSHROOM_MAN);

        await expect(handSlot(page, 0).getByRole("alert")).toHaveText(TEXT.lookupFailed);
        await expect(handSlot(page, 1).getByRole("alert")).toHaveText(TEXT.lookupFailed);
        await expectSaved(page, { hand: [elf, mushroom] });
    });

    test("forgets a card once its slot is cleared", async ({ page, request }) => {
        const { elf } = await pairIds(request);
        const blueEyes = await idOf(request, BLUE_EYES);
        await openCalculator(page);
        await fillHand(page, [MYSTICAL_ELF, MUSHROOM_MAN, BLUE_EYES]);

        await handSlot(page, 1).locator(".clear-btn").click();

        await expectSaved(page, { hand: [elf, null, blueEyes] });
    });

    test("forgets the cards of a zone once it is cleared, and only that zone's", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await fillCards(page, "monster", ["Celtic Guardian", "Flame Swordsman"]);
        await fillCards(page, "spell", [DARK_HOLE]);

        await page.locator("#zone-monster .zone-clear").click();

        await expectSaved(page, { hand: [elf, mushroom], spells: [await idOf(request, DARK_HOLE)] });
    });

    test("saves the emptied board on reset", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await fillCards(page, "monster", ["Celtic Guardian"]);

        await page.locator("#resetBtn").click();

        await expectSaved(page, {});
    });

    test("never writes the key of the hand of an older version", async ({ page }) => {
        const raw = legacyValue([2, 8, null, null, null]);
        await seedLegacyHand(page, raw);
        await seedBoard(page, savedValue({}));

        await page.goto("/calculator");
        await waitForIndex(page);
        await fillHand(page, FUSION_PAIR);
        await page.locator("#resetBtn").click();

        expect(await legacyRaw(page)).toBe(raw);
    });
});

test.describe("restoring the board", () => {
    test("brings the cards and their results back after a reload", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await expect(results(page)).toContainText(FUSION_RESULT);

        await page.reload();

        await expectBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });
        await expect(page.locator("#fusions-title")).toBeVisible();
        await expect(results(page)).toContainText(FUSION_RESULT);
        await expect(page.locator("#results-status")).toBeEmpty();
        await expect(page.locator("#board-count")).toHaveText("2 de 15 cartas");
    });

    test("asks for the results of the restored board only once, not once per card", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        const blueEyes = await idOf(request, BLUE_EYES);
        const [celtic, darkHole] = await ids(request, ["Celtic Guardian", DARK_HOLE]);
        await openCalculator(page);
        await fillHand(page, [...FUSION_PAIR, BLUE_EYES]);
        await fillCards(page, "monster", ["Celtic Guardian"]);
        await fillCards(page, "spell", [DARK_HOLE]);
        await expect(results(page)).toContainText(FUSION_RESULT);
        const calculations = logRequests(page, isCalculator);

        await page.reload();
        await expect(results(page)).toContainText(FUSION_RESULT);
        await settled(page, calculations);

        expect(calculations.started).toHaveLength(1);
        expect(calculations.started.map(sentBoard)).toEqual([
            { handIds: [elf, mushroom, blueEyes], monsterIds: [celtic], spellIds: [darkHole] },
        ]);
    });

    test("puts each card back in its own slot, the empty slots between them included", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, "hand", 0, MYSTICAL_ELF);
        await fillSlot(page, "hand", 3, MUSHROOM_MAN);
        await fillSlot(page, "monster", 2, "Celtic Guardian");
        await fillSlot(page, "spell", 4, FOREST);
        await expect(results(page)).toContainText(FUSION_RESULT);

        await page.reload();

        await expectBoard(page, {
            hand: [MYSTICAL_ELF, null, null, MUSHROOM_MAN],
            monster: [null, null, "Celtic Guardian"],
            spell: [null, null, null, null, FOREST],
        });
    });

    test("brings a full board back", async ({ page }) => {
        const board = {
            hand: [
                MYSTICAL_ELF,
                MUSHROOM_MAN,
                "Winged Dragon #1",
                "Shadow Specter",
                "Blackland Fire Dragon",
            ],
            monster: [BLUE_EYES, "Hitotsu-me Giant", "Baby Dragon", "Ryu-kishin", "Feral Imp"],
            spell: [DARK_HOLE, FOREST, SPARKS, "Mountain", "Wasteland"],
        };
        await openCalculator(page);
        for (const zone of ZONES) await fillCards(page, zone, board[zone]);
        await expect(results(page)).toContainText(FUSION_RESULT);

        await page.reload();

        await expectBoard(page, board);
        await expect(page.locator("#board-count")).toHaveText("15 de 15 cartas");
        await expect(results(page)).toContainText(FUSION_RESULT);
    });

    test("keeps the board when the page is left and opened again", async ({ page, request }) => {
        const { elf, mushroom } = await pairIds(request);
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await expectSaved(page, { hand: [elf, mushroom] });

        await page.goto("/search");
        await page.goto("/calculator");

        await expectBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });
        await expect(results(page)).toContainText(FUSION_RESULT);
    });

    test("leaves the board empty after a reset and a reload", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await page.locator("#resetBtn").click();
        await expectSaved(page, {});
        const lookups = logRequests(page, isCardLookup);

        await page.reload();
        await waitForIndex(page);
        await settled(page, lookups);

        await expectBoard(page, {});
        expect(lookups.started).toHaveLength(0);
        await expect(results(page)).toBeEmpty();
    });

    test("keeps the board through the language switch, in both directions", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await fillCards(page, "monster", ["Celtic Guardian"]);
        await expect(results(page)).toContainText(FUSION_RESULT);

        await page.getByRole("button", { name: "English" }).click();

        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        await expectBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN], monster: ["Celtic Guardian"] });
        await expect(page.getByRole("heading", { name: "Fusions", level: 2, exact: true })).toBeVisible();
        await expect(page.locator("#outputarealeft .fusion-name")).toContainText(FUSION_RESULT);
        await expect(page.locator("#board-count")).toHaveText("3 of 15 cards");
        await expect(page.locator("#outputarealeft [role=columnheader]")).toHaveText([
            "Result",
            "ATK / DEF",
            "Input",
        ]);

        await page.getByRole("button", { name: "Español" }).click();

        await expect(page.locator("html")).toHaveAttribute("lang", "es");
        await expectBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN], monster: ["Celtic Guardian"] });
        await expect(page.getByRole("heading", { name: "Fusiones", level: 2, exact: true })).toBeVisible();
        await expect(page.locator("#board-count")).toHaveText("3 de 15 cartas");
        await expect(page.locator("#outputarealeft [role=columnheader]")).toHaveText([
            "Resultado",
            "ATK / DEF",
            "Entrada",
        ]);
    });

    test("keeps the names when the artwork lookups fail, and does not forget the board", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await expectSaved(page, { hand: [elf, mushroom] });
        await page.route(isCardLookup, (route) => route.abort());

        await page.reload();

        await expect(handSlot(page, 0).locator("input")).toHaveValue(MYSTICAL_ELF);
        await expect(handSlot(page, 1).locator("input")).toHaveValue(MUSHROOM_MAN);
        await expect(handSlot(page, 0).getByRole("alert")).toHaveText(TEXT.lookupFailed);
        await expect(results(page)).toContainText(FUSION_RESULT);
        await expectSaved(page, { hand: [elf, mushroom] });
    });

    test("puts back the cards of a zone saved with more slots than five, up to five", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        await seedBoard(
            page,
            JSON.stringify({
                v: 2,
                hand: [elf, mushroom, null, null, null, mushroom, mushroom, mushroom],
                monsters: [],
                spells: [],
            })
        );

        await page.goto("/calculator");

        await expectBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });
        await expectSaved(page, { hand: [elf, mushroom] });
    });

    test("gives a zone saved with fewer slots than five its five slots", async ({ page, request }) => {
        const { elf } = await pairIds(request);
        await seedBoard(page, JSON.stringify({ v: 2, hand: [elf], monsters: [], spells: [] }));

        await page.goto("/calculator");

        await expectBoard(page, { hand: [MYSTICAL_ELF] });
    });
});

// Every way a value the page did not write can be wrong. The page ignores it and starts with an empty board.
const UNUSABLE_VALUES: ReadonlyArray<readonly [string, string]> = [
    ["is not JSON", "{not json"],
    ["is a list of ids instead of a board", "[2,8,null,null,null]"],
    ["is another version", JSON.stringify({ v: 3, hand: [], monsters: [], spells: [] })],
    ["is the version of the hand", JSON.stringify({ v: 1, hand: [], monsters: [], spells: [] })],
    ["has no version", JSON.stringify({ hand: [2, 8], monsters: [], spells: [] })],
    ["has no monster zone", JSON.stringify({ v: 2, hand: [2, 8], spells: [] })],
    ["has a zone that is not a list", JSON.stringify({ v: 2, hand: "2,8", monsters: [], spells: [] })],
    ["has an id that is not an integer", JSON.stringify({ v: 2, hand: [2, 8.5], monsters: [], spells: [] })],
    ["has a negative id", JSON.stringify({ v: 2, hand: [2, -8], monsters: [], spells: [] })],
    ["has an id written as a string", JSON.stringify({ v: 2, hand: [2, "8"], monsters: [], spells: [] })],
];

test.describe("a saved value the page cannot use", () => {
    for (const [problem, raw] of UNUSABLE_VALUES) {
        test(`is ignored when it ${problem}, and the page works with an empty board`, async ({ page }) => {
            const problems = watchPageErrors(page);
            await seedBoard(page, raw);
            const lookups = logRequests(page, isCardLookup);

            await page.goto("/calculator");
            await waitForIndex(page);
            await settled(page, lookups);

            await expectBoard(page, {});
            expect(lookups.started).toHaveLength(0);
            await fillHand(page, FUSION_PAIR);
            await expect(results(page)).toContainText(FUSION_RESULT);
            expect(problems).toEqual([]);
        });
    }

    test("is replaced by a value the page can read once the board is up", async ({ page }) => {
        await seedBoard(page, "{not json");

        await page.goto("/calculator");

        await expectSaved(page, {});
    });

    test("ignores the ids the index does not know and restores the others in their places", async ({
        page,
        request,
    }) => {
        const problems = watchPageErrors(page);
        const { elf, mushroom } = await pairIds(request);
        await seedBoard(page, savedValue({ hand: [999_999, elf, null, mushroom, 424_242] }));

        await page.goto("/calculator");

        await expectBoard(page, { hand: [null, MYSTICAL_ELF, null, MUSHROOM_MAN] });
        await expect(results(page)).toContainText(FUSION_RESULT);
        await expectSaved(page, { hand: [null, elf, null, mushroom] });
        await expect(page.locator("[aria-invalid='true']")).toHaveCount(0);
        expect(problems).toEqual([]);
    });

    test("with only ids the index does not know gives an empty board", async ({ page }) => {
        const lookups = logRequests(page, isCardLookup);
        await seedBoard(page, savedValue({ hand: [999_999, 424_242], spells: [999_999] }));

        await page.goto("/calculator");
        await waitForIndex(page);
        await settled(page, lookups);

        await expectBoard(page, {});
        expect(lookups.started).toHaveLength(0);
    });

    test("flags a card saved in a zone that does not take it, and does not send or keep it", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        const [darkHole] = await ids(request, [DARK_HOLE]);
        await seedBoard(
            page,
            savedValue({ hand: [elf, mushroom], monsters: [darkHole as number], spells: [elf] })
        );
        const calculations = logRequests(page, isCalculator);

        await page.goto("/calculator");

        await expect(zoneSlot(page, "monster", 0).getByRole("alert")).toHaveText(TEXT.notMonster);
        await expect(zoneSlot(page, "spell", 0).getByRole("alert")).toHaveText(TEXT.notSpell);
        await expect(results(page)).toContainText(FUSION_RESULT);
        await settled(page, calculations);
        expect(calculations.started.map(sentBoard)).toEqual([
            { handIds: [elf, mushroom], monsterIds: [], spellIds: [] },
        ]);
        await expectSaved(page, { hand: [elf, mushroom] });
    });
});

// A hand saved by the version before the board: 5 to 12 slots under another key (D7).
test.describe("a hand saved before the board", () => {
    test("is moved onto the board: five slots stay the hand and nothing is lost", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        const blueEyes = await idOf(request, BLUE_EYES);
        const raw = legacyValue([elf, null, mushroom, blueEyes, null]);
        await seedLegacyHand(page, raw);

        await page.goto("/calculator");

        await expectBoard(page, { hand: [MYSTICAL_ELF, null, MUSHROOM_MAN, BLUE_EYES] });
        await expectSaved(page, { hand: [elf, null, mushroom, blueEyes] });
        await expect(page.locator("#board-note")).toBeHidden();
        // The old key stays exactly as it was.
        expect(await legacyRaw(page)).toBe(raw);
    });

    test("sends the cards past its fifth slot to the zones by kind, in order", async ({ page, request }) => {
        const hand = ["Baby Dragon", "Zone Eater", "Kanikabuto", "Petit Dragon", "Dark Magician"];
        const rest = [MYSTICAL_ELF, DARK_HOLE, null, MUSHROOM_MAN, FOREST, BLUE_EYES, SPARKS];
        const handIds = await ids(request, hand);
        const restIds = await Promise.all(rest.map((name) => (name === null ? null : idOf(request, name))));
        await seedLegacyHand(page, legacyValue([...handIds, ...restIds]));

        await page.goto("/calculator");

        await expectBoard(page, {
            hand,
            monster: [MYSTICAL_ELF, MUSHROOM_MAN, BLUE_EYES],
            spell: [DARK_HOLE, FOREST, SPARKS],
        });
        await expect(page.locator("#board-note")).toBeHidden();
        await expectSaved(page, {
            hand: handIds,
            monsters: [restIds[0] as number, restIds[3] as number, restIds[5] as number],
            spells: [restIds[1] as number, restIds[4] as number, restIds[6] as number],
        });
    });

    test("lists once, in a visible note, the cards that do not fit", async ({ page, request }) => {
        // Seven monsters after the fifth slot: five fit in the monster zone and two do not.
        const monsters = [
            MYSTICAL_ELF,
            MUSHROOM_MAN,
            BLUE_EYES,
            "Celtic Guardian",
            "Flame Swordsman",
            "Hitotsu-me Giant",
            "Ryu-kishin",
        ];
        const handIds = await ids(request, ["Baby Dragon"]);
        await seedLegacyHand(
            page,
            legacyValue([...handIds, null, null, null, null, ...(await ids(request, monsters))])
        );

        await page.goto("/calculator");

        await expectZone(page, "monster", monsters.slice(0, ZONE_SIZE));
        const note = page.locator("#board-note");
        await expect(note).toBeVisible();
        await expect(note).toHaveAttribute("role", "note");
        await expect(note).toHaveText(
            "Algunas cartas de tu mano guardada no caben en el tablero y se han quitado: Hitotsu-me Giant, Ryu-kishin."
        );
        await expect(page.locator("#board-count")).toHaveText("6 de 15 cartas");

        // Once: the board is saved now, so the next visit reads it and says nothing.
        await page.reload();
        await expectZone(page, "monster", monsters.slice(0, ZONE_SIZE));
        await expect(note).toBeHidden();
    });

    test("waits for the card index to place the rest, and saves nothing before that", async ({
        page,
        request,
    }) => {
        const { elf } = await pairIds(request);
        const raw = legacyValue([elf, null, null, null, null, elf]);
        await seedLegacyHand(page, raw);
        const held = await holdRequests(page, isCardsIndex);

        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);
        await pause(page);
        expect(await savedRaw(page)).toBeNull();
        await release(held[0]);

        await expectBoard(page, { hand: [MYSTICAL_ELF], monster: [MYSTICAL_ELF] });
    });

    test("is ignored once a board is saved: the board wins", async ({ page, request }) => {
        const { elf, mushroom } = await pairIds(request);
        await seedLegacyHand(page, legacyValue([elf, null, null, null, null, mushroom]));
        await seedBoard(page, savedValue({ hand: [mushroom] }));

        await page.goto("/calculator");

        await expectBoard(page, { hand: [MUSHROOM_MAN] });
        await expectSaved(page, { hand: [mushroom] });
    });

    test("is ignored when it is not a saved hand, and the board starts empty", async ({ page }) => {
        await seedLegacyHand(page, "{not json");

        await page.goto("/calculator");
        await waitForIndex(page);

        await expectBoard(page, {});
    });

    test("places the rest in the slots nobody has used while the index was loading", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        await seedLegacyHand(page, legacyValue([elf, null, null, null, null, mushroom]));
        const held = await holdRequests(page, isCardsIndex);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);
        await zoneSlot(page, "monster", 0).locator("input").fill("Celtic Guardian");

        await release(held[0]);

        await expectZone(page, "hand", [MYSTICAL_ELF]);
        await expect(zoneSlot(page, "monster", 0).locator("input")).toHaveValue("Celtic Guardian");
        await expect(slotName(page, "monster", 1)).toHaveText(MUSHROOM_MAN);
    });
});

// Ways a browser can refuse a page its storage. Each one is installed before any script of the page runs.
const REFUSED_STORAGE: ReadonlyArray<readonly [string, () => void]> = [
    [
        "reading window.localStorage throws",
        () => {
            Object.defineProperty(window, "localStorage", {
                get() {
                    throw new DOMException("The operation is insecure.", "SecurityError");
                },
            });
        },
    ],
    [
        "every call on a storage throws",
        () => {
            const refuse = (): never => {
                throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
            };
            Storage.prototype.getItem = refuse;
            Storage.prototype.setItem = refuse;
            Storage.prototype.removeItem = refuse;
        },
    ],
    [
        "window.localStorage is null",
        () => {
            Object.defineProperty(window, "localStorage", { value: null });
        },
    ],
];

test.describe("storage the browser refuses", () => {
    for (const [refusal, install] of REFUSED_STORAGE) {
        test(`leaves the calculator fully working when ${refusal}`, async ({ page }) => {
            const problems = watchPageErrors(page);
            await page.addInitScript(install);

            await openCalculator(page);
            await expect(page.locator(".board-slot")).toHaveCount(ZONES.length * ZONE_SIZE);
            await fillHand(page, FUSION_PAIR);
            await expect(results(page)).toContainText(FUSION_RESULT);
            await fillCards(page, "monster", ["Celtic Guardian"]);
            await handSlot(page, 1).locator(".clear-btn").click();
            await expect(slotName(page, "hand", 1)).toHaveText("");
            await page.locator("#zone-monster .zone-clear").click();
            await page.locator("#resetBtn").click();
            await expectBoard(page, {});

            // Nothing was saved, so the next visit starts from the beginning.
            await page.reload();
            await expectBoard(page, {});
            expect(problems).toEqual([]);
        });
    }
});

test.describe("a card index that is slow or down", () => {
    test("leaves the saved value as it is while the index is pending, then puts the board back", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        const raw = savedValue({ hand: [elf, null, mushroom], monsters: [null, mushroom] });
        await seedBoard(page, raw);
        const held = await holdRequests(page, isCardsIndex);

        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);

        // The slots do not wait for the index, only their cards do.
        await expect(page.locator(".board-slot")).toHaveCount(ZONES.length * ZONE_SIZE);
        await pause(page);
        expect(await savedRaw(page)).toBe(raw);
        await release(held[0]);

        await expectBoard(page, { hand: [MYSTICAL_ELF, null, MUSHROOM_MAN], monster: [null, MUSHROOM_MAN] });
        await expect(results(page)).toContainText(FUSION_RESULT);
        await expectSaved(page, { hand: [elf, null, mushroom], monsters: [null, mushroom] });
    });

    test("does not save what the page does before the index is there", async ({ page, request }) => {
        const { elf, mushroom } = await pairIds(request);
        const raw = savedValue({ hand: [elf, mushroom] });
        await seedBoard(page, raw);
        const held = await holdRequests(page, isCardsIndex);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);

        await page.locator("#zone-spell .zone-clear").click();
        await fillSlot(page, "hand", 2, UNKNOWN_NAME);
        await pause(page);

        expect(await savedRaw(page)).toBe(raw);
    });

    test("leaves the saved value untouched when the index fails, and a retry puts the board back", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        const raw = savedValue({ hand: [elf, mushroom] });
        await seedBoard(page, raw);
        await page.route(isCardsIndex, (route) => route.abort());

        await page.goto("/calculator");
        const alert = page.locator("#index-error");
        await expect(alert).toBeVisible();
        await expect(alert).toContainText(TEXT.indexFailed);
        await expect(page.locator(".board-slot")).toHaveCount(ZONES.length * ZONE_SIZE);
        // Whatever the page does while the names cannot be resolved, the saved board is not overwritten.
        await fillSlot(page, "monster", 0, MUSHROOM_MAN);
        await pause(page);
        expect(await savedRaw(page)).toBe(raw);

        await page.unroute(isCardsIndex);
        await alert.getByRole("button", { name: TEXT.retry }).click();

        await expect(alert).toBeHidden();
        await expectBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN], monster: [MUSHROOM_MAN] });
        await expect(results(page)).toContainText(FUSION_RESULT);
        await expectSaved(page, { hand: [elf, mushroom], monsters: [mushroom] });
    });

    test("does not bring the board back after a reset that came before the index", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        const raw = savedValue({ hand: [elf, mushroom] });
        await seedBoard(page, raw);
        const held = await holdRequests(page, isCardsIndex);
        const lookups = logRequests(page, isCardLookup);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);

        await page.locator("#resetBtn").click();
        expect(await savedRaw(page)).toBe(raw);
        await release(held[0]);

        // The reset is what the page saves once it may save: the old board is not back on the next visit.
        await expectSaved(page, {});
        await settled(page, lookups);
        await expectBoard(page, {});
        expect(lookups.started).toHaveLength(0);
    });

    test("keeps what was typed in a slot meanwhile, and brings the other cards back", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        await seedBoard(page, savedValue({ hand: [elf, mushroom] }));
        const held = await holdRequests(page, isCardsIndex);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);
        await handSlot(page, 0).locator("input").fill("Blue-eyes");

        await release(held[0]);

        await expect(slotName(page, "hand", 1)).toHaveText(MUSHROOM_MAN);
        await expect(handSlot(page, 0).locator("input")).toHaveValue("Blue-eyes");
        await expect(slotName(page, "hand", 0)).toHaveText("");
        await expectSaved(page, { hand: [null, mushroom] });
    });

    test("keeps a card picked in a slot meanwhile, whatever was saved for it", async ({ page, request }) => {
        const { elf, mushroom } = await pairIds(request);
        await seedBoard(page, savedValue({ hand: [elf, mushroom] }));
        const held = await holdRequests(page, isCardsIndex);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);
        // The names of the cards are not known yet, but the lookup by name does not need the index.
        await fillSlot(page, "hand", 0, BLUE_EYES);
        await expect(slotName(page, "hand", 0)).toHaveText(BLUE_EYES);

        await release(held[0]);

        await expect(slotName(page, "hand", 1)).toHaveText(MUSHROOM_MAN);
        await expect(slotName(page, "hand", 0)).toHaveText(BLUE_EYES);
        await expectSaved(page, { hand: [await idOf(request, BLUE_EYES), mushroom] });
    });

    test("does not put back a card whose slot was cleared meanwhile", async ({ page, request }) => {
        const { elf, mushroom } = await pairIds(request);
        await seedBoard(page, savedValue({ hand: [elf, mushroom] }));
        const held = await holdRequests(page, isCardsIndex);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);
        await fillSlot(page, "hand", 0, BLUE_EYES);
        await expect(slotName(page, "hand", 0)).toHaveText(BLUE_EYES);
        await handSlot(page, 0).locator(".clear-btn").click();

        await release(held[0]);

        await expect(slotName(page, "hand", 1)).toHaveText(MUSHROOM_MAN);
        await expect(slotName(page, "hand", 0)).toHaveText("");
        await expect(handSlot(page, 0).locator("input")).toHaveValue("");
        await expectSaved(page, { hand: [null, mushroom] });
    });

    test("does not put back the cards of a zone that was cleared meanwhile", async ({ page, request }) => {
        const { elf, mushroom } = await pairIds(request);
        await seedBoard(page, savedValue({ hand: [elf, mushroom], monsters: [mushroom, elf] }));
        const held = await holdRequests(page, isCardsIndex);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);
        await page.locator("#zone-monster .zone-clear").click();

        await release(held[0]);

        await expectBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });
        await expectSaved(page, { hand: [elf, mushroom] });
    });
});

test.describe("the card index and the autocomplete when the index cannot be had", () => {
    const failures: ReadonlyArray<readonly [string, (route: Route) => Promise<void>]> = [
        ["the request fails", (route) => route.abort()],
        [
            "the server errors",
            (route) =>
                route.fulfill({
                    status: 500,
                    contentType: "application/json",
                    body: JSON.stringify({ error: { code: "internal-error", message: "boom" } }),
                }),
        ],
    ];

    for (const [cause, answer] of failures) {
        test(`on the search page shows no suggestions and no error when ${cause}, then recovers`, async ({
            page,
        }) => {
            const problems = watchPageErrors(page);
            await page.route(isCardsIndex, answer);
            const attempts = logRequests(page, isCardsIndex);
            await page.goto("/search");
            const input = page.locator("#cardname");

            await input.fill("mushroo");
            await expect.poll(() => attempts.started.length).toBeGreaterThan(0);
            await settled(page, attempts);
            await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(0);

            // A failed list is not remembered: the next keystroke asks for it again.
            const asked = attempts.started.length;
            await input.pressSequentially("m");
            await expect.poll(() => attempts.started.length).toBeGreaterThan(asked);
            await settled(page, attempts);
            await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(0);
            expect(problems).toEqual([]);

            await page.unroute(isCardsIndex);
            await input.press("Backspace");

            await expect(page.getByRole("listbox").getByRole("option")).toHaveText(MUSHROOMS);
            expect(problems).toEqual([]);
        });
    }

    test("on the search page still runs a search typed out in full while the index is down", async ({
        page,
    }) => {
        const problems = watchPageErrors(page);
        await page.route(isCardsIndex, (route) => route.abort());
        await page.goto("/search");

        await page.locator("#cardname").fill(MYSTICAL_ELF);
        await page.locator("#cardname").dispatchEvent("change");

        await expect(page.locator("#outputcard")).toContainText(MYSTICAL_ELF);
        await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(0);
        expect(problems).toEqual([]);
    });

    test("on the calculator brings the suggestions and the saved board back with the retry", async ({
        page,
        request,
    }) => {
        const problems = watchPageErrors(page);
        const { elf, mushroom } = await pairIds(request);
        await seedBoard(page, savedValue({ hand: [elf, mushroom] }));
        await page.route(isCardsIndex, (route) => route.abort());
        await page.goto("/calculator");
        const alert = page.locator("#index-error");
        await expect(alert).toBeVisible();
        await handSlot(page, 3).locator("input").fill("Mushroo");
        await pause(page);
        await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(0);

        await page.unroute(isCardsIndex);
        await alert.getByRole("button", { name: TEXT.retry }).click();

        await expect(alert).toBeHidden();
        await expect(slotName(page, "hand", 0)).toHaveText(MYSTICAL_ELF);
        await expect(slotName(page, "hand", 1)).toHaveText(MUSHROOM_MAN);
        await expect(results(page)).toContainText(FUSION_RESULT);
        // The click on the retry button took the focus away, so the slot gets its suggestions back with it.
        await handSlot(page, 3).locator("input").focus();
        await expect(page.getByRole("option", { name: MUSHROOM_MAN, exact: true })).toBeVisible();
        expect(problems).toEqual([]);
    });

    test("on the search page still suggests when sessionStorage throws", async ({ page }) => {
        const problems = watchPageErrors(page);
        await page.addInitScript(() => {
            Object.defineProperty(window, "sessionStorage", {
                get() {
                    throw new DOMException("The operation is insecure.", "SecurityError");
                },
            });
        });
        await page.goto("/search");

        await page.locator("#cardname").fill("mushroo");

        await expect(page.getByRole("listbox").getByRole("option")).toHaveText(MUSHROOMS);
        expect(problems).toEqual([]);
    });

    test("on the calculator still suggests and restores the hand when sessionStorage throws", async ({
        page,
        request,
    }) => {
        const problems = watchPageErrors(page);
        const { elf, mushroom } = await pairIds(request);
        await seedBoard(page, savedValue({ hand: [elf, mushroom] }));
        await page.addInitScript(() => {
            const refuse = (): never => {
                throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
            };
            Object.defineProperty(window, "sessionStorage", {
                value: { getItem: refuse, setItem: refuse, removeItem: refuse },
            });
        });

        await page.goto("/calculator");

        await expectBoard(page, { hand: [MYSTICAL_ELF, MUSHROOM_MAN] });
        await expect(results(page)).toContainText(FUSION_RESULT);
        await handSlot(page, 2).locator("input").fill("Mushroo");
        await expect(page.getByRole("option", { name: MUSHROOM_MAN, exact: true })).toBeVisible();
        expect(problems).toEqual([]);
    });
});

test.describe("a search on the search page whose request fails", () => {
    const searches: ReadonlyArray<readonly [string, (page: Page) => Promise<void>]> = [
        ["typing a name and leaving the input", (page) => page.locator("#cardname").dispatchEvent("change")],
        ["the search by name button", (page) => page.locator("#search-name-btn").dispatchEvent("click")],
        [
            "the search by result button",
            (page) => page.locator("#search-results-btn").dispatchEvent("click"),
        ],
    ];

    for (const [how, search] of searches) {
        test(`says the card could not be looked up, not an unhandled error, for ${how}`, async ({
            page,
        }) => {
            const problems = watchPageErrors(page);
            await page.route(isCardLookup, (route) => route.abort());
            await page.goto("/search");
            await page.locator("#cardname").fill(MYSTICAL_ELF);

            await search(page);

            await expect(page.locator("#search-msg").getByRole("alert")).toHaveText(TEXT.lookupFailed);
            await expect(page.locator("#outputcard")).toBeEmpty();
            expect(problems).toEqual([]);
        });
    }

    test("works again once the request does", async ({ page }) => {
        await page.route(isCardLookup, (route) => route.abort());
        await page.goto("/search");
        await page.locator("#cardname").fill(MYSTICAL_ELF);
        await page.locator("#cardname").dispatchEvent("change");
        await expect(page.locator("#search-msg").getByRole("alert")).toBeVisible();

        await page.unroute(isCardLookup);
        await page.locator("#cardname").dispatchEvent("change");

        await expect(page.locator("#outputcard")).toContainText(MYSTICAL_ELF);
        await expect(page.locator("#search-msg")).toBeEmpty();
    });
});
