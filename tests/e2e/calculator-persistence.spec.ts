import {
    expect,
    test,
    type APIRequestContext,
    type Locator,
    type Page,
    type Request as PageRequest,
    type Route,
} from "@playwright/test";
import { MAX_HAND_SIZE } from "../../src/shared/limits.js";

const START_SLOTS = 5;
const MYSTICAL_ELF = "Mystical Elf";
const MUSHROOM_MAN = "Mushroom Man";
const BLUE_EYES = "Blue-eyes White Dragon";
// The one fusion of the pair, with no equip and no ritual.
const FUSION_PAIR = [MYSTICAL_ELF, MUSHROOM_MAN];
const FUSION_RESULT = "Queen of Autumn Leaves";
const UNKNOWN_NAME = "Definitely Not A Card";
// "mushroo": the two names that start with it and nothing else.
const MUSHROOMS = [MUSHROOM_MAN, "Mushroom Man #2"];
// Twelve different cards, the most a hand takes.
const FULL_HAND = [
    BLUE_EYES,
    MYSTICAL_ELF,
    "Hitotsu-me Giant",
    "Baby Dragon",
    "Ryu-kishin",
    "Feral Imp",
    "Winged Dragon #1",
    MUSHROOM_MAN,
    "Shadow Specter",
    "Blackland Fire Dragon",
    "Sword Arm of Dragon",
    "Swamp Battleguard",
];

// What the page keeps in localStorage, spelled out here on purpose: a change to the key or to the shape
// would make every hand a user saved unreadable, so the specs have to fail when either changes.
const HAND_KEY = "ygo-fm-fusioncalc:hand:v1";
// Where the page keeps the card index once it has it (src/client/lib/api.ts).
const CARDS_INDEX_KEY = "ygo-fm:cards-index";

const TEXT = {
    lookupFailed: "No se pudo buscar la carta. Inténtalo de nuevo.",
    indexFailed: "No se pudo cargar la lista de cartas.",
    retry: "Reintentar",
    capReached: `Has alcanzado el máximo de ${MAX_HAND_SIZE} cartas en la mano.`,
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

function slotAt(page: Page, index: number): Locator {
    return page.locator(".hand-slot").nth(index);
}

function slotName(page: Page, index: number): Locator {
    return slotAt(page, index).locator(".slot-name");
}

function results(page: Page): Locator {
    return page.locator("#outputarealeft");
}

async function fillSlot(page: Page, index: number, name: string): Promise<void> {
    const input = slotAt(page, index).locator("input");
    await input.fill(name);
    await input.dispatchEvent("change");
}

async function fillHand(page: Page, names: readonly string[]): Promise<void> {
    for (const [index, name] of names.entries()) {
        await fillSlot(page, index, name);
        await expect(slotName(page, index)).toHaveText(name);
    }
}

async function addSlotsUpTo(page: Page, count: number): Promise<void> {
    while ((await page.locator(".hand-slot").count()) < count) await page.locator("#addSlotBtn").click();
}

// The hand of a page that has just opened: slots exist at once but the cards come from the card index, and
// suggestions only list once the index is there. Only for pages that start with no saved hand: typing in the
// first slot is a touch that would keep a saved card out of it.
async function openCalculator(page: Page): Promise<void> {
    await page.goto("/calculator");
    const input = slotAt(page, 0).locator("input");
    await input.fill("Mystical");
    await expect(page.getByRole("option", { name: MYSTICAL_ELF, exact: true })).toBeVisible();
    await input.fill("");
}

// The page stores the index the moment it has it, and everything that waited for it runs right after in the
// same turn of the event loop: once it is stored, the saved hand has been put back (or not).
async function waitForIndex(page: Page): Promise<void> {
    await expect
        .poll(() => page.evaluate((key) => window.sessionStorage.getItem(key) !== null, CARDS_INDEX_KEY))
        .toBe(true);
}

// The slots of the hand in order: the name of the card in each, null for a slot that is empty.
async function expectHand(page: Page, hand: ReadonlyArray<string | null>): Promise<void> {
    await expect(page.locator(".hand-slot")).toHaveCount(hand.length);
    for (const [index, name] of hand.entries()) {
        await expect(slotName(page, index)).toHaveText(name ?? "");
        await expect(slotAt(page, index).locator("input")).toHaveValue(name ?? "");
        if (name === null) await expect(slotAt(page, index).locator(".slot-filled")).toBeHidden();
        else await expect(slotAt(page, index).locator(".slot-filled")).toBeVisible();
    }
}

const noCards = (count: number): null[] => Array.from({ length: count }, () => null);

async function savedRaw(page: Page): Promise<string | null> {
    return page.evaluate((key) => window.localStorage.getItem(key), HAND_KEY);
}

async function savedHand(page: Page): Promise<unknown> {
    const raw = await savedRaw(page);
    return raw === null ? null : (JSON.parse(raw) as unknown);
}

// The value the page is expected to hold: the id in every slot in order, null for a slot that is empty.
async function expectSaved(page: Page, slots: ReadonlyArray<number | null>): Promise<void> {
    await expect.poll(() => savedHand(page)).toEqual({ v: 1, slots });
}

function savedValue(slots: ReadonlyArray<number | null>): string {
    return JSON.stringify({ v: 1, slots });
}

// Puts a value in localStorage before the calculator opens. Any page of the site reaches it, and this one
// never writes to it.
async function seedHand(page: Page, raw: string): Promise<void> {
    await page.goto("/about");
    await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [HAND_KEY, raw] as const);
}

async function idOf(request: APIRequestContext, name: string): Promise<number> {
    const response = await request.get(`/api/cards?name=${encodeURIComponent(name)}`);
    return ((await response.json()) as { card: { id: number } }).card.id;
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

function sentHandIds(request: PageRequest): number[] {
    return (request.postDataJSON() as { handIds: number[] }).handIds;
}

test.describe("saving the hand", () => {
    test("saves the id of each card in slot order, and null for a slot that is empty", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        await openCalculator(page);

        await fillSlot(page, 0, MYSTICAL_ELF);
        await fillSlot(page, 2, MUSHROOM_MAN);

        await expectSaved(page, [elf, null, mushroom, null, null]);
    });

    test("saves a card picked from the suggestions", async ({ page, request }) => {
        const { elf } = await pairIds(request);
        await openCalculator(page);

        await slotAt(page, 0).locator("input").fill("Mysti");
        await page.getByRole("option", { name: MYSTICAL_ELF, exact: true }).click();

        await expectSaved(page, [elf, null, null, null, null]);
    });

    test("saves a card typed in another case under its id", async ({ page, request }) => {
        const { elf } = await pairIds(request);
        await openCalculator(page);

        await fillSlot(page, 1, "mystical ELF");

        await expectSaved(page, [null, elf, null, null, null]);
    });

    test("leaves out a name the index does not know", async ({ page, request }) => {
        const { elf, mushroom } = await pairIds(request);
        await openCalculator(page);

        await fillSlot(page, 0, MYSTICAL_ELF);
        await fillSlot(page, 1, MUSHROOM_MAN);
        await fillSlot(page, 2, UNKNOWN_NAME);

        await expectSaved(page, [elf, mushroom, null, null, null]);
        await expect(slotAt(page, 2).locator("input")).toHaveValue(UNKNOWN_NAME);
    });

    test("saves from the names in the inputs, so failing artwork lookups do not matter", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        await openCalculator(page);
        await page.route(isCardLookup, (route) => route.abort());

        await fillSlot(page, 0, MYSTICAL_ELF);
        await fillSlot(page, 1, MUSHROOM_MAN);

        await expect(slotAt(page, 0).getByRole("alert")).toHaveText(TEXT.lookupFailed);
        await expect(slotAt(page, 1).getByRole("alert")).toHaveText(TEXT.lookupFailed);
        await expectSaved(page, [elf, mushroom, null, null, null]);
    });

    test("forgets a card once its slot is cleared", async ({ page, request }) => {
        const { elf } = await pairIds(request);
        const blueEyes = await idOf(request, BLUE_EYES);
        await openCalculator(page);
        await fillHand(page, [MYSTICAL_ELF, MUSHROOM_MAN, BLUE_EYES]);

        await slotAt(page, 1).locator(".clear-btn").click();

        await expectSaved(page, [elf, null, blueEyes, null, null]);
    });

    test("saves the slot count when a slot is added and when one is removed", async ({ page, request }) => {
        const { elf, mushroom } = await pairIds(request);
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);

        await page.locator("#addSlotBtn").click();
        await expectSaved(page, [elf, mushroom, null, null, null, null]);
        await page.locator("#addSlotBtn").click();
        await expectSaved(page, [elf, mushroom, null, null, null, null, null]);

        await slotAt(page, 1).locator(".remove-btn").click();
        await expectSaved(page, [elf, null, null, null, null, null]);
    });

    test("saves the emptied hand, with the same slot count, on reset", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await page.locator("#addSlotBtn").click();

        await page.locator("#resetBtn").click();

        await expectSaved(page, noCards(START_SLOTS + 1));
    });
});

test.describe("restoring the hand", () => {
    test("brings the cards and their results back after a reload", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await expect(results(page)).toContainText(FUSION_RESULT);

        await page.reload();

        await expectHand(page, [MYSTICAL_ELF, MUSHROOM_MAN, null, null, null]);
        await expect(page.locator("#outputarealeft h2")).toHaveCount(1);
        await expect(results(page)).toContainText(FUSION_RESULT);
        await expect(page.locator("#results-status")).toBeEmpty();
    });

    test("asks for the results of the restored hand only once, not once per card", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        const blueEyes = await idOf(request, BLUE_EYES);
        await openCalculator(page);
        await fillHand(page, [...FUSION_PAIR, BLUE_EYES]);
        await expect(results(page)).toContainText(FUSION_RESULT);
        const calculations = logRequests(page, isCalculator);

        await page.reload();
        await expect(results(page)).toContainText(FUSION_RESULT);
        await settled(page, calculations);

        expect(calculations.started).toHaveLength(1);
        expect(calculations.started.map(sentHandIds)).toEqual([[elf, mushroom, blueEyes]]);
    });

    test("puts each card back in its own slot, the empty slots between them included", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, 0, MYSTICAL_ELF);
        await fillSlot(page, 3, MUSHROOM_MAN);
        await expect(results(page)).toContainText(FUSION_RESULT);

        await page.reload();

        await expectHand(page, [MYSTICAL_ELF, null, null, MUSHROOM_MAN, null]);
    });

    test("brings the slot count back after slots were added", async ({ page }) => {
        await openCalculator(page);
        await page.locator("#addSlotBtn").click();
        await page.locator("#addSlotBtn").click();
        await expectSaved(page, noCards(START_SLOTS + 2));

        await page.reload();

        await expectHand(page, noCards(START_SLOTS + 2));
        await expect(slotAt(page, 0).locator(".remove-btn")).toBeVisible();
    });

    test("brings the slot count back after a slot was removed", async ({ page }) => {
        await openCalculator(page);
        await addSlotsUpTo(page, START_SLOTS + 3);
        await slotAt(page, 0).locator(".remove-btn").click();
        await expectSaved(page, noCards(START_SLOTS + 2));

        await page.reload();

        await expectHand(page, noCards(START_SLOTS + 2));
    });

    test("brings a full hand back, and the button that would go past it stays off", async ({ page }) => {
        expect(FULL_HAND).toHaveLength(MAX_HAND_SIZE);
        await openCalculator(page);
        await addSlotsUpTo(page, MAX_HAND_SIZE);
        await fillHand(page, FULL_HAND);
        await expect(results(page)).toContainText(FUSION_RESULT);

        await page.reload();

        await expectHand(page, FULL_HAND);
        await expect(results(page)).toContainText(FUSION_RESULT);
        await expect(page.locator("#addSlotBtn")).toBeDisabled();
        await expect(page.locator("#add-slot-hint")).toHaveText(TEXT.capReached);
    });

    test("keeps the hand when the page is left and opened again", async ({ page, request }) => {
        const { elf, mushroom } = await pairIds(request);
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await page.locator("#addSlotBtn").click();
        await expectSaved(page, [elf, mushroom, null, null, null, null]);

        await page.goto("/search");
        await page.goto("/calculator");

        await expectHand(page, [MYSTICAL_ELF, MUSHROOM_MAN, null, null, null, null]);
        await expect(results(page)).toContainText(FUSION_RESULT);
    });

    test("leaves the hand empty, and the slot count as it was, after a reset and a reload", async ({
        page,
    }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await page.locator("#addSlotBtn").click();
        await page.locator("#resetBtn").click();
        await expectSaved(page, noCards(START_SLOTS + 1));
        const lookups = logRequests(page, isCardLookup);

        await page.reload();
        await waitForIndex(page);
        await settled(page, lookups);

        await expectHand(page, noCards(START_SLOTS + 1));
        expect(lookups.started).toHaveLength(0);
        await expect(results(page)).toBeEmpty();
    });

    test("keeps the hand through the language switch, in both directions", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await expect(results(page)).toContainText(FUSION_RESULT);

        await page.getByRole("button", { name: "English" }).click();

        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        await expectHand(page, [MYSTICAL_ELF, MUSHROOM_MAN, null, null, null]);
        await expect(page.locator("#outputarealeft > div p")).toHaveText([
            `Result: ${FUSION_RESULT} (1800/1500)`,
            `Input: ${MYSTICAL_ELF}`,
            `Input: ${MUSHROOM_MAN}`,
        ]);

        await page.getByRole("button", { name: "Español" }).click();

        await expect(page.locator("html")).toHaveAttribute("lang", "es");
        await expectHand(page, [MYSTICAL_ELF, MUSHROOM_MAN, null, null, null]);
        await expect(page.locator("#outputarealeft > div p")).toHaveText([
            `Resultado: ${FUSION_RESULT} (1800/1500)`,
            `Carta: ${MYSTICAL_ELF}`,
            `Carta: ${MUSHROOM_MAN}`,
        ]);
    });

    test("keeps the names when the artwork lookups fail, and does not forget the hand", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await expectSaved(page, [elf, mushroom, null, null, null]);
        await page.route(isCardLookup, (route) => route.abort());

        await page.reload();

        await expect(slotAt(page, 0).locator("input")).toHaveValue(MYSTICAL_ELF);
        await expect(slotAt(page, 1).locator("input")).toHaveValue(MUSHROOM_MAN);
        await expect(slotAt(page, 0).getByRole("alert")).toHaveText(TEXT.lookupFailed);
        await expect(results(page)).toContainText(FUSION_RESULT);
        await expectSaved(page, [elf, mushroom, null, null, null]);
    });

    test("puts back the cards of a hand with more slots than the cap allows, up to the cap", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        await seedHand(page, savedValue([elf, mushroom, ...noCards(MAX_HAND_SIZE + 8)]));

        await page.goto("/calculator");

        await expectHand(page, [MYSTICAL_ELF, MUSHROOM_MAN, ...noCards(MAX_HAND_SIZE - 2)]);
        await expectSaved(page, [elf, mushroom, ...noCards(MAX_HAND_SIZE - 2)]);
    });

    test("gives a hand with fewer slots than the start the starting number of slots", async ({
        page,
        request,
    }) => {
        const { elf } = await pairIds(request);
        await seedHand(page, savedValue([elf]));

        await page.goto("/calculator");

        await expectHand(page, [MYSTICAL_ELF, ...noCards(START_SLOTS - 1)]);
    });
});

// Every way a value the page did not write can be wrong. The page ignores it and starts with an empty hand.
const UNUSABLE_VALUES: ReadonlyArray<readonly [string, string]> = [
    ["is not JSON", "{not json"],
    ["is a list of ids instead of a hand", "[2,8,null,null,null]"],
    ["is a newer version", JSON.stringify({ v: 2, slots: [2, 8, null, null, null] })],
    ["has no version", JSON.stringify({ slots: [2, 8, null, null, null] })],
    ["has no slots", JSON.stringify({ v: 1 })],
    ["has slots that are not a list", JSON.stringify({ v: 1, slots: "2,8" })],
    ["has an id that is not an integer", JSON.stringify({ v: 1, slots: [2, 8.5, null, null, null] })],
    ["has a negative id", JSON.stringify({ v: 1, slots: [2, -8, null, null, null] })],
    ["has an id written as a string", JSON.stringify({ v: 1, slots: [2, "8", null, null, null] })],
];

test.describe("a saved value the page cannot use", () => {
    for (const [problem, raw] of UNUSABLE_VALUES) {
        test(`is ignored when it ${problem}, and the page works with an empty hand`, async ({ page }) => {
            const problems = watchPageErrors(page);
            await seedHand(page, raw);
            const lookups = logRequests(page, isCardLookup);

            await page.goto("/calculator");
            await waitForIndex(page);
            await settled(page, lookups);

            await expectHand(page, noCards(START_SLOTS));
            expect(lookups.started).toHaveLength(0);
            await fillHand(page, FUSION_PAIR);
            await expect(results(page)).toContainText(FUSION_RESULT);
            expect(problems).toEqual([]);
        });
    }

    test("is replaced by a value the page can read once the hand is up", async ({ page }) => {
        await seedHand(page, "{not json");

        await page.goto("/calculator");

        await expectSaved(page, noCards(START_SLOTS));
    });

    test("ignores the ids the index does not know and restores the others in their places", async ({
        page,
        request,
    }) => {
        const problems = watchPageErrors(page);
        const { elf, mushroom } = await pairIds(request);
        await seedHand(page, savedValue([999_999, elf, null, mushroom, 424_242, null]));

        await page.goto("/calculator");

        await expectHand(page, [null, MYSTICAL_ELF, null, MUSHROOM_MAN, null, null]);
        await expect(results(page)).toContainText(FUSION_RESULT);
        await expectSaved(page, [null, elf, null, mushroom, null, null]);
        await expect(page.locator("[aria-invalid='true']")).toHaveCount(0);
        expect(problems).toEqual([]);
    });

    test("with only ids the index does not know gives an empty hand with the slots it asked for", async ({
        page,
    }) => {
        const lookups = logRequests(page, isCardLookup);
        await seedHand(page, savedValue([999_999, 424_242, null, null, null, null, null]));

        await page.goto("/calculator");
        await waitForIndex(page);
        await settled(page, lookups);

        await expectHand(page, noCards(7));
        expect(lookups.started).toHaveLength(0);
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
            await expect(page.locator(".hand-slot")).toHaveCount(START_SLOTS);
            await fillHand(page, FUSION_PAIR);
            await expect(results(page)).toContainText(FUSION_RESULT);
            await page.locator("#addSlotBtn").click();
            await expect(page.locator(".hand-slot")).toHaveCount(START_SLOTS + 1);
            await slotAt(page, 1).locator(".clear-btn").click();
            await expect(slotName(page, 1)).toHaveText("");
            await page.locator("#resetBtn").click();
            await expectHand(page, noCards(START_SLOTS + 1));

            // Nothing was saved, so the next visit starts from the beginning.
            await page.reload();
            await expectHand(page, noCards(START_SLOTS));
            expect(problems).toEqual([]);
        });
    }
});

test.describe("a card index that is slow or down", () => {
    test("leaves the saved value as it is while the index is pending, then puts the hand back", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        const raw = savedValue([elf, null, mushroom, null, null, null, null]);
        await seedHand(page, raw);
        const held = await holdRequests(page, isCardsIndex);

        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);

        // The slots do not wait for the index, only their cards do.
        await expect(page.locator(".hand-slot")).toHaveCount(7);
        await pause(page);
        expect(await savedRaw(page)).toBe(raw);
        await release(held[0]);

        await expectHand(page, [MYSTICAL_ELF, null, MUSHROOM_MAN, null, null, null, null]);
        await expect(results(page)).toContainText(FUSION_RESULT);
        await expectSaved(page, [elf, null, mushroom, null, null, null, null]);
    });

    test("does not save what the page does before the index is there", async ({ page, request }) => {
        const { elf, mushroom } = await pairIds(request);
        const raw = savedValue([elf, mushroom, null, null, null, null]);
        await seedHand(page, raw);
        const held = await holdRequests(page, isCardsIndex);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);

        await page.locator("#addSlotBtn").click();
        await slotAt(page, 5).locator(".remove-btn").click();
        await fillSlot(page, 2, UNKNOWN_NAME);
        await pause(page);

        expect(await savedRaw(page)).toBe(raw);
    });

    test("saves a slot added meanwhile once the hand is back, next to the restored cards", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        await seedHand(page, savedValue([elf, mushroom, null, null, null]));
        const held = await holdRequests(page, isCardsIndex);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);
        await page.locator("#addSlotBtn").click();
        await expect(page.locator(".hand-slot")).toHaveCount(START_SLOTS + 1);

        await release(held[0]);

        await expectHand(page, [MYSTICAL_ELF, MUSHROOM_MAN, null, null, null, null]);
        await expectSaved(page, [elf, mushroom, null, null, null, null]);
    });

    test("leaves the saved value untouched when the index fails, and a retry puts the hand back", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        const raw = savedValue([elf, mushroom, null, null, null, null]);
        await seedHand(page, raw);
        await page.route(isCardsIndex, (route) => route.abort());

        await page.goto("/calculator");
        const alert = page.locator("#index-error");
        await expect(alert).toBeVisible();
        await expect(alert).toContainText(TEXT.indexFailed);
        await expect(page.locator(".hand-slot")).toHaveCount(6);
        // Whatever the page does while the names cannot be resolved, the saved hand is not overwritten.
        await page.locator("#addSlotBtn").click();
        await fillSlot(page, 4, MUSHROOM_MAN);
        await pause(page);
        expect(await savedRaw(page)).toBe(raw);

        await page.unroute(isCardsIndex);
        await alert.getByRole("button", { name: TEXT.retry }).click();

        await expect(alert).toBeHidden();
        await expectHand(page, [MYSTICAL_ELF, MUSHROOM_MAN, null, null, MUSHROOM_MAN, null, null]);
        await expect(results(page)).toContainText(FUSION_RESULT);
        await expectSaved(page, [elf, mushroom, null, null, mushroom, null, null]);
    });

    test("does not bring the hand back after a reset that came before the index", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        const raw = savedValue([elf, mushroom, null, null, null, null]);
        await seedHand(page, raw);
        const held = await holdRequests(page, isCardsIndex);
        const lookups = logRequests(page, isCardLookup);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);

        await page.locator("#resetBtn").click();
        expect(await savedRaw(page)).toBe(raw);
        await release(held[0]);

        // The reset is what the page saves once it may save: the old hand is not back on the next visit.
        await expectSaved(page, noCards(6));
        await settled(page, lookups);
        await expectHand(page, noCards(6));
        expect(lookups.started).toHaveLength(0);
    });

    test("keeps what was typed in a slot meanwhile, and brings the other cards back", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        await seedHand(page, savedValue([elf, mushroom, null, null, null]));
        const held = await holdRequests(page, isCardsIndex);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);
        await slotAt(page, 0).locator("input").fill("Blue-eyes");

        await release(held[0]);

        await expect(slotName(page, 1)).toHaveText(MUSHROOM_MAN);
        await expect(slotAt(page, 0).locator("input")).toHaveValue("Blue-eyes");
        await expect(slotName(page, 0)).toHaveText("");
        await expectSaved(page, [null, mushroom, null, null, null]);
    });

    test("keeps a card picked in a slot meanwhile, whatever was saved for it", async ({ page, request }) => {
        const { elf, mushroom } = await pairIds(request);
        await seedHand(page, savedValue([elf, mushroom, null, null, null]));
        const held = await holdRequests(page, isCardsIndex);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);
        // The names of the cards are not known yet, but the lookup by name does not need the index.
        await fillSlot(page, 0, BLUE_EYES);
        await expect(slotName(page, 0)).toHaveText(BLUE_EYES);

        await release(held[0]);

        await expect(slotName(page, 1)).toHaveText(MUSHROOM_MAN);
        await expect(slotName(page, 0)).toHaveText(BLUE_EYES);
        await expectSaved(page, [await idOf(request, BLUE_EYES), mushroom, null, null, null]);
    });

    test("does not put back a card whose slot was cleared meanwhile", async ({ page, request }) => {
        const { elf, mushroom } = await pairIds(request);
        await seedHand(page, savedValue([elf, mushroom, null, null, null]));
        const held = await holdRequests(page, isCardsIndex);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);
        await fillSlot(page, 0, BLUE_EYES);
        await expect(slotName(page, 0)).toHaveText(BLUE_EYES);
        await slotAt(page, 0).locator(".clear-btn").click();

        await release(held[0]);

        await expect(slotName(page, 1)).toHaveText(MUSHROOM_MAN);
        await expect(slotName(page, 0)).toHaveText("");
        await expect(slotAt(page, 0).locator("input")).toHaveValue("");
        await expectSaved(page, [null, mushroom, null, null, null]);
    });

    test("takes the saved card of a slot away with the slot when it is removed meanwhile", async ({
        page,
        request,
    }) => {
        const { elf, mushroom } = await pairIds(request);
        await seedHand(page, savedValue([elf, mushroom, null, null, null, null]));
        const held = await holdRequests(page, isCardsIndex);
        await page.goto("/calculator");
        await expect.poll(() => held.length).toBe(1);
        await slotAt(page, 0).locator(".remove-btn").click();
        await expect(page.locator(".hand-slot")).toHaveCount(START_SLOTS);

        await release(held[0]);

        await expectHand(page, [MUSHROOM_MAN, null, null, null, null]);
        await expectSaved(page, [mushroom, null, null, null, null]);
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
            await expect(page.getByRole("option")).toHaveCount(0);

            // A failed list is not remembered: the next keystroke asks for it again.
            const asked = attempts.started.length;
            await input.pressSequentially("m");
            await expect.poll(() => attempts.started.length).toBeGreaterThan(asked);
            await settled(page, attempts);
            await expect(page.getByRole("option")).toHaveCount(0);
            expect(problems).toEqual([]);

            await page.unroute(isCardsIndex);
            await input.press("Backspace");

            await expect(page.getByRole("option")).toHaveText(MUSHROOMS);
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
        await expect(page.getByRole("option")).toHaveCount(0);
        expect(problems).toEqual([]);
    });

    test("on the calculator brings the suggestions and the saved hand back with the retry", async ({
        page,
        request,
    }) => {
        const problems = watchPageErrors(page);
        const { elf, mushroom } = await pairIds(request);
        await seedHand(page, savedValue([elf, mushroom, null, null, null]));
        await page.route(isCardsIndex, (route) => route.abort());
        await page.goto("/calculator");
        const alert = page.locator("#index-error");
        await expect(alert).toBeVisible();
        await slotAt(page, 3).locator("input").fill("Mushroo");
        await pause(page);
        await expect(page.getByRole("option")).toHaveCount(0);

        await page.unroute(isCardsIndex);
        await alert.getByRole("button", { name: TEXT.retry }).click();

        await expect(alert).toBeHidden();
        await expect(slotName(page, 0)).toHaveText(MYSTICAL_ELF);
        await expect(slotName(page, 1)).toHaveText(MUSHROOM_MAN);
        await expect(results(page)).toContainText(FUSION_RESULT);
        // The click on the retry button took the focus away, so the slot gets its suggestions back with it.
        await slotAt(page, 3).locator("input").focus();
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

        await expect(page.getByRole("option")).toHaveText(MUSHROOMS);
        expect(problems).toEqual([]);
    });

    test("on the calculator still suggests and restores the hand when sessionStorage throws", async ({
        page,
        request,
    }) => {
        const problems = watchPageErrors(page);
        const { elf, mushroom } = await pairIds(request);
        await seedHand(page, savedValue([elf, mushroom, null, null, null]));
        await page.addInitScript(() => {
            const refuse = (): never => {
                throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
            };
            Object.defineProperty(window, "sessionStorage", {
                value: { getItem: refuse, setItem: refuse, removeItem: refuse },
            });
        });

        await page.goto("/calculator");

        await expectHand(page, [MYSTICAL_ELF, MUSHROOM_MAN, null, null, null]);
        await expect(results(page)).toContainText(FUSION_RESULT);
        await slotAt(page, 2).locator("input").fill("Mushroo");
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
