import {
    expect,
    test,
    type APIRequestContext,
    type Locator,
    type Page,
    type Request as PageRequest,
    type Response as PageResponse,
    type Route,
} from "@playwright/test";
import { MAX_HAND_SIZE } from "../../src/shared/limits.js";

const MYSTICAL_ELF = "Mystical Elf";
const MUSHROOM_MAN = "Mushroom Man";
// Two cards with one fusion between them and no ritual.
const FUSION_PAIR = [MYSTICAL_ELF, MUSHROOM_MAN];
// A ritual card with its three materials, three of whose pairs also fuse: both result blocks fill up.
const DANCE_HAND = ["Commencement Dance", "Water Omotics", "Dancing Elf", "Bean Soldier"];
const UNKNOWN_NAME = "Definitely Not A Card";
// Two monsters with neither a fusion nor an equip between them: no chain can start.
const NO_CHAIN_PAIR = ["Blue-eyes White Dragon", MYSTICAL_ELF];

const TEXT = {
    invalidName: "Nombre de carta inválido",
    lookupFailed: "No se pudo buscar la carta. Inténtalo de nuevo.",
    resultsFailed: "No se pudieron calcular los resultados. Inténtalo de nuevo.",
    chainFailed: "No se pudo calcular la cadena. Inténtalo de nuevo.",
    noChain: "No se encontró ninguna cadena posible con esta mano.",
    indexFailed: "No se pudo cargar la lista de cartas.",
    retry: "Reintentar",
};

const onPath =
    (path: string) =>
    (url: URL): boolean =>
        url.pathname === path;
const isCalculator = onPath("/api/calculator");
const isChainSearch = onPath("/api/chain-search");
const isCardLookup = onPath("/api/cards");
const isCardsIndex = onPath("/api/cards-index");

test.beforeEach(async ({ page }) => {
    // The specs check behaviour, not artwork, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

function slotAt(page: Page, index: number): Locator {
    return page.locator(".hand-slot").nth(index);
}

async function fillSlot(page: Page, index: number, name: string): Promise<void> {
    const input = slotAt(page, index).locator("input");
    await input.fill(name);
    await input.dispatchEvent("change");
}

async function fillHand(page: Page, names: readonly string[]): Promise<void> {
    for (const [index, name] of names.entries()) {
        await fillSlot(page, index, name);
        await expect(slotAt(page, index).locator(".slot-name")).toHaveText(name);
    }
}

// The slots exist at once but the hand is read from the card index, which arrives a little later.
// Suggestions only list once the index is there, so wait for one before touching the hand.
async function openCalculator(page: Page): Promise<void> {
    await page.goto("/calculator");
    const input = slotAt(page, 0).locator("input");
    await input.fill("Mystical");
    await expect(page.getByRole("option", { name: MYSTICAL_ELF, exact: true })).toBeVisible();
    await input.fill("");
}

// With nothing to show the results panels are hidden as a whole: no size, no space.
async function expectResultsHidden(page: Page): Promise<void> {
    const panels = page.locator("#results-panels");
    await expect(panels).toBeHidden();
    await expect(panels).toHaveCSS("display", "none");
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

// Only that many requests are still alive: the page aborted the rest instead of ignoring their answers.
async function expectAlive(log: RequestLog, count: number): Promise<void> {
    await expect.poll(() => log.pending()).toBe(count);
}

// Holds every matching request until the test lets it go, so the test decides the order of the answers.
async function holdRequests(page: Page, matches: (url: URL) => boolean): Promise<Route[]> {
    const held: Route[] = [];
    await page.route(matches, (route) => {
        held.push(route);
    });
    return held;
}

// The page drops a request it no longer wants, and then there is nothing left to let through.
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

function fulfillJson(status: number, body: unknown): (route: Route) => Promise<void> {
    return (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function apiError(code: string): unknown {
    return { error: { code, message: code } };
}

function sentHandIds(request: PageRequest): number[] {
    return (request.postDataJSON() as { handIds: number[] }).handIds;
}

function waitForCalculation(page: Page, handSize: number): Promise<PageResponse> {
    return page.waitForResponse(
        (response) =>
            isCalculator(new URL(response.url())) && sentHandIds(response.request()).length === handSize
    );
}

async function idOf(request: APIRequestContext, name: string): Promise<number> {
    const response = await request.get(`/api/cards?name=${encodeURIComponent(name)}`);
    return ((await response.json()) as { card: { id: number } }).card.id;
}

interface Calculation {
    fusions: unknown[];
    equips: unknown[];
    rituals: unknown[];
}

// What the API answers for a hand: the rendered blocks must hold exactly that, once.
async function calculateFor(request: APIRequestContext, names: readonly string[]): Promise<Calculation> {
    const handIds = await Promise.all(names.map((name) => idOf(request, name)));
    const response = await request.post("/api/calculator", { data: { handIds } });
    return (await response.json()) as Calculation;
}

test.describe("overlapping calculations", () => {
    test("render one heading per block and the newest hand, whatever order the answers arrive in", async ({
        page,
        request,
    }) => {
        const expected = await calculateFor(request, DANCE_HAND);
        expect(expected.fusions.length).toBeGreaterThan(0);
        expect(expected.rituals.length).toBeGreaterThan(0);
        await openCalculator(page);
        const held = await holdRequests(page, isCalculator);
        const calculations = logRequests(page, isCalculator);

        await fillHand(page, DANCE_HAND);
        await expect.poll(() => held.length).toBeGreaterThanOrEqual(3);
        await expectAlive(calculations, 1);
        // The answer for the whole hand goes first and those of the smaller hands after it.
        for (const route of [...held].reverse()) await release(route);
        await settled(page, calculations);

        await expect(page.locator("#fusions-title")).toBeVisible();
        await expect(page.locator("#outputarealeft .fusion-row")).toHaveCount(expected.fusions.length);
        await expect(page.locator("#rituals-title")).toBeVisible();
        await expect(page.locator("#rituals-output .ritual-entry")).toHaveCount(expected.rituals.length);
        await expect(page.locator("#results-error")).toBeEmpty();
    });

    test("render once when every answer is merely slow", async ({ page, request }) => {
        const expected = await calculateFor(request, DANCE_HAND);
        await openCalculator(page);
        await page.route(isCalculator, async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 300));
            await route.continue().catch(() => undefined);
        });
        const calculations = logRequests(page, isCalculator);

        await fillHand(page, DANCE_HAND);
        await settled(page, calculations);

        await expect(page.locator("#fusions-title")).toBeVisible();
        await expect(page.locator("#outputarealeft .fusion-row")).toHaveCount(expected.fusions.length);
        await expect(page.locator("#rituals-title")).toBeVisible();
        await expect(page.locator("#rituals-output .ritual-entry")).toHaveCount(expected.rituals.length);
        await expect(page.locator("#results-error")).toBeEmpty();
    });

    test("a repeated change event for the same hand sends one request", async ({ page }) => {
        await openCalculator(page);
        const calculations = logRequests(page, isCalculator);

        await fillHand(page, FUSION_PAIR);
        // The input is hidden once its card is recognised and that fires a change of its own; this adds one.
        await slotAt(page, 1).locator("input").dispatchEvent("change");
        await settled(page, calculations);

        expect(calculations.started).toHaveLength(1);
        await expect(page.locator("#fusions-title")).toBeVisible();
    });

    test("picking suggestions asks once per card and calculates once", async ({ page }) => {
        await openCalculator(page);
        const calculations = logRequests(page, isCalculator);
        const lookups = logRequests(page, isCardLookup);

        // One card is picked with the mouse and the other with the keyboard: both select, then blur.
        await slotAt(page, 0).locator("input").fill("Mysti");
        await page.getByRole("option", { name: MYSTICAL_ELF, exact: true }).click();
        await expect(slotAt(page, 0).locator(".slot-name")).toHaveText(MYSTICAL_ELF);
        await slotAt(page, 1).locator("input").fill("Mushroom");
        await expect(page.getByRole("option", { name: MUSHROOM_MAN, exact: true })).toBeVisible();
        await slotAt(page, 1).locator("input").press("Enter");
        await expect(slotAt(page, 1).locator(".slot-name")).toHaveText(MUSHROOM_MAN);
        await settled(page, calculations);
        await settled(page, lookups);

        expect(lookups.started).toHaveLength(FUSION_PAIR.length);
        expect(calculations.started).toHaveLength(1);
        await expect(page.locator("#fusions-title")).toBeVisible();
        await expect(page.locator("#outputarealeft")).toContainText(MYSTICAL_ELF);
    });

    test("a reset while the calculation is in flight leaves the panel empty", async ({ page }) => {
        await openCalculator(page);
        const held = await holdRequests(page, isCalculator);
        const calculations = logRequests(page, isCalculator);
        await fillHand(page, FUSION_PAIR);
        await expect.poll(() => held.length).toBeGreaterThan(0);

        await page.locator("#resetBtn").click();
        await expectAlive(calculations, 0);
        for (const route of held) await release(route);
        await settled(page, calculations);

        await expect(page.locator("#outputarealeft")).toBeEmpty();
        await expect(page.locator("#outputarearight")).toBeEmpty();
        await expectResultsHidden(page);
        await expect(page.locator("#results-error")).toBeEmpty();
    });
});

test.describe("a failed calculation", () => {
    test("shows an alert instead of the results it replaced", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await expect(page.locator("#fusions-title")).toBeVisible();

        await page.route(isCalculator, (route) => route.abort());
        await fillSlot(page, 2, "Blue-eyes White Dragon");

        const alert = page.locator("#results-error").getByRole("alert");
        await expect(alert).toHaveText(TEXT.resultsFailed);
        await expect(page.locator("#outputarealeft")).toBeEmpty();
        await expect(page.locator("#outputarearight")).toBeEmpty();
        await expectResultsHidden(page);
    });

    test("is tried again on the next change of the same hand", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await page.route(isCalculator, (route) => route.abort());
        await fillSlot(page, 2, "Blue-eyes White Dragon");
        const alert = page.locator("#results-error").getByRole("alert");
        await expect(alert).toBeVisible();

        await page.unroute(isCalculator);
        await slotAt(page, 2).locator("input").dispatchEvent("change");

        await expect(page.locator("#fusions-title")).toBeVisible();
        await expect(alert).toBeHidden();
    });

    test("also reports an error answer from the server", async ({ page }) => {
        await page.route(isCalculator, fulfillJson(500, apiError("internal-error")));
        await openCalculator(page);

        await fillHand(page, FUSION_PAIR);

        await expect(page.locator("#results-error").getByRole("alert")).toHaveText(TEXT.resultsFailed);
    });
});

test.describe("an unknown card name", () => {
    test("is kept, marked invalid and explained next to its slot", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);

        await fillSlot(page, 2, UNKNOWN_NAME);

        const slot = slotAt(page, 2);
        const input = slot.locator("input");
        await expect(input).toHaveValue(UNKNOWN_NAME);
        await expect(input).toHaveAttribute("aria-invalid", "true");
        await expect(slot.getByRole("alert")).toHaveText(TEXT.invalidName);
        await expect(input).toHaveAccessibleDescription(TEXT.invalidName);
        await expect(page.locator("[aria-invalid='true']")).toHaveCount(1);
    });

    test("is left out of the hand that gets calculated", async ({ page, request }) => {
        const ids = await Promise.all(
            [MYSTICAL_ELF, MUSHROOM_MAN, "Blue-eyes White Dragon"].map((name) => idOf(request, name))
        );
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await fillSlot(page, 2, UNKNOWN_NAME);
        await expect(slotAt(page, 2).getByRole("alert")).toBeVisible();

        const calculation = waitForCalculation(page, 3);
        await fillSlot(page, 3, "Blue-eyes White Dragon");

        expect(sentHandIds((await calculation).request())).toEqual(ids);
        await expect(page.locator("#outputarealeft")).toContainText(MYSTICAL_ELF);
        await expect(slotAt(page, 2).locator("input")).toHaveValue(UNKNOWN_NAME);
    });

    test("stops being invalid once the name is valid", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, 2, UNKNOWN_NAME);
        const slot = slotAt(page, 2);
        await expect(slot.locator("input")).toHaveAttribute("aria-invalid", "true");

        await fillSlot(page, 2, "Dark Magician");

        await expect(slot.locator(".slot-name")).toHaveText("Dark Magician");
        await expect(slot.locator("input")).not.toHaveAttribute("aria-invalid", "true");
        await expect(slot.getByRole("alert")).toHaveCount(0);
    });

    test("stops being invalid as soon as the input is emptied", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, 2, UNKNOWN_NAME);
        const slot = slotAt(page, 2);
        await expect(slot.getByRole("alert")).toBeVisible();

        await slot.locator("input").fill("");

        await expect(slot.locator("input")).not.toHaveAttribute("aria-invalid", "true");
        await expect(slot.getByRole("alert")).toHaveCount(0);
    });

    test("is cleared by reset", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, 2, UNKNOWN_NAME);
        await expect(slotAt(page, 2).getByRole("alert")).toBeVisible();

        await page.locator("#resetBtn").click();

        await expect(slotAt(page, 2).locator("input")).toHaveValue("");
        await expect(page.locator("[aria-invalid='true']")).toHaveCount(0);
        await expect(page.locator(".slot-message [role='alert']")).toHaveCount(0);
    });
});

test.describe("a failed card lookup", () => {
    const failures: ReadonlyArray<readonly [string, (route: Route) => Promise<void>]> = [
        ["the request fails", (route) => route.abort()],
        ["the server errors", fulfillJson(500, apiError("internal-error"))],
        ["a 404 is not about the card", fulfillJson(404, apiError("route-not-found"))],
    ];

    for (const [cause, answer] of failures) {
        test(`is reported, not called an invalid name, when ${cause}`, async ({ page }) => {
            await openCalculator(page);
            await page.route(isCardLookup, answer);

            await fillSlot(page, 0, MYSTICAL_ELF);

            const slot = slotAt(page, 0);
            await expect(slot.getByRole("alert")).toHaveText(TEXT.lookupFailed);
            await expect(slot.locator("input")).toHaveValue(MYSTICAL_ELF);
            await expect(slot.locator("input")).not.toHaveAttribute("aria-invalid", "true");
        });
    }

    test("is forgotten when the lookup works on the next change", async ({ page }) => {
        await openCalculator(page);
        await page.route(isCardLookup, (route) => route.abort());
        await fillSlot(page, 0, MYSTICAL_ELF);
        await expect(slotAt(page, 0).getByRole("alert")).toBeVisible();

        await page.unroute(isCardLookup);
        await slotAt(page, 0).locator("input").dispatchEvent("change");

        await expect(slotAt(page, 0).locator(".slot-name")).toHaveText(MYSTICAL_ELF);
        await expect(slotAt(page, 0).getByRole("alert")).toHaveCount(0);
    });
});

test.describe("card lookups", () => {
    test("ask once per card although the browser repeats the change event", async ({ page }) => {
        await openCalculator(page);
        const lookups = logRequests(page, isCardLookup);

        await fillHand(page, FUSION_PAIR);
        await slotAt(page, 0).locator("input").dispatchEvent("change");
        await settled(page, lookups);

        expect(lookups.started).toHaveLength(FUSION_PAIR.length);
    });
});

test.describe("a card lookup in flight", () => {
    test("does not refill a slot that was reset", async ({ page }) => {
        await openCalculator(page);
        const held = await holdRequests(page, isCardLookup);
        const lookups = logRequests(page, isCardLookup);
        await fillSlot(page, 0, MYSTICAL_ELF);
        await expect.poll(() => held.length).toBe(1);

        await page.locator("#resetBtn").click();
        await expectAlive(lookups, 0);
        for (const route of held) await release(route);
        await settled(page, lookups);

        const slot = slotAt(page, 0);
        await expect(slot.locator(".slot-name")).toHaveText("");
        await expect(slot.locator(".slot-filled")).toBeHidden();
        await expect(slot.locator("input")).toHaveValue("");
    });

    test("does not overwrite a slot whose text changed, even when it answers last", async ({ page }) => {
        await openCalculator(page);
        const held = await holdRequests(page, isCardLookup);
        const lookups = logRequests(page, isCardLookup);
        await fillSlot(page, 0, MYSTICAL_ELF);
        await fillSlot(page, 0, MUSHROOM_MAN);
        await expect.poll(() => held.length).toBe(2);
        const slot = slotAt(page, 0);
        await expectAlive(lookups, 1);

        await release(held[1]);
        await expect(slot.locator(".slot-name")).toHaveText(MUSHROOM_MAN);
        await release(held[0]);
        await settled(page, lookups);

        await expect(slot.locator(".slot-name")).toHaveText(MUSHROOM_MAN);
        await expect(slot.locator("input")).toHaveValue(MUSHROOM_MAN);
    });

    test("does not fill a slot whose text was erased", async ({ page }) => {
        await openCalculator(page);
        const held = await holdRequests(page, isCardLookup);
        const lookups = logRequests(page, isCardLookup);
        await fillSlot(page, 0, MYSTICAL_ELF);
        await expect.poll(() => held.length).toBe(1);
        const slot = slotAt(page, 0);

        await slot.locator("input").fill("");
        await expectAlive(lookups, 0);
        for (const route of held) await release(route);
        await settled(page, lookups);

        await expect(slot.locator(".slot-name")).toHaveText("");
        await expect(slot.locator(".slot-filled")).toBeHidden();
    });
});

test.describe("the chain output", () => {
    async function chainForPair(page: Page): Promise<void> {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await expect(page.locator("#chain-output")).toContainText("Paso 1");
    }

    test("is cleared by reset", async ({ page }) => {
        await chainForPair(page);

        await page.locator("#resetBtn").click();

        await expect(page.locator("#chain-output")).toBeEmpty();
        await expect(page.locator("#chain-section")).toBeHidden();
    });

    test("is cleared when a card leaves the hand", async ({ page }) => {
        await chainForPair(page);

        await slotAt(page, 1).locator(".clear-btn").click();

        await expect(page.locator("#chain-output")).toBeEmpty();
        await expect(page.locator("#chain-section")).toBeHidden();
    });

    test("is dropped when a card joins the hand, until the chain of the new hand arrives", async ({
        page,
    }) => {
        await chainForPair(page);
        const held = await holdRequests(page, isChainSearch);

        await fillSlot(page, 2, "Blue-eyes White Dragon");

        await expect.poll(() => held.length).toBe(1);
        await expect(page.locator("#chain-output")).toBeEmpty();
        await expect(page.locator("#chain-loading")).toBeVisible();
        for (const route of held) await release(route);
        await expect(page.locator("#chain-output")).toContainText("Paso 1");
        await expect(page.locator("#chain-loading")).toBeHidden();
    });

    test("is not shown for a hand that changed while its request was in flight", async ({ page }) => {
        await openCalculator(page);
        const held = await holdRequests(page, isChainSearch);
        const chains = logRequests(page, isChainSearch);
        await fillHand(page, FUSION_PAIR);
        await expect(page.locator("#chain-loading")).toBeVisible();
        await expect.poll(() => held.length).toBe(1);

        await slotAt(page, 1).locator(".clear-btn").click();

        await expect(page.locator("#chain-loading")).toBeHidden();
        await expect(page.locator("#chainBtn")).not.toHaveAttribute("aria-busy", "true");
        await expectAlive(chains, 0);
        for (const route of held) await release(route);
        await settled(page, chains);
        await expect(page.locator("#chain-output")).toBeEmpty();
        await expect(page.locator("#chain-loading")).toBeHidden();
    });

    test("is not shown after a reset while its request was in flight", async ({ page }) => {
        await openCalculator(page);
        const held = await holdRequests(page, isChainSearch);
        const chains = logRequests(page, isChainSearch);
        await fillHand(page, FUSION_PAIR);
        await expect(page.locator("#chain-loading")).toBeVisible();

        await page.locator("#resetBtn").click();

        await expect(page.locator("#chain-loading")).toBeHidden();
        await expectAlive(chains, 0);
        for (const route of held) await release(route);
        await settled(page, chains);
        await expect(page.locator("#chain-output")).toBeEmpty();
    });

    test("shows the loading text while the request is in flight and only then", async ({ page }) => {
        await openCalculator(page);
        const held = await holdRequests(page, isChainSearch);
        await expect(page.locator("#chain-loading")).toBeHidden();

        await fillHand(page, FUSION_PAIR);

        await expect(page.locator("#chain-loading")).toHaveText("Calculando…");
        await expect(page.locator("#chain-output")).toBeEmpty();
        await expect.poll(() => held.length).toBe(1);
        for (const route of held) await release(route);
        await expect(page.locator("#chain-output")).toContainText("Paso 1");
        await expect(page.locator("#chain-loading")).toBeHidden();
    });

    test("never shows a slow answer for an old hand over the newer one", async ({ page }) => {
        const answer = (finalName: string): unknown => {
            const card = (id: number, name: string): unknown => ({
                id,
                name,
                description: "",
                type: 0,
                typeName: "Warrior",
                attack: 1000,
                defense: 1000,
                stars: 1,
                password: "00000000",
                imageCode: null,
                isMonster: true,
            });
            const final = card(3, finalName);
            return {
                chains: [
                    {
                        steps: [{ card1: card(1, "In A"), card2: card(2, "In B"), result: final }],
                        finalCard: final,
                    },
                ],
                truncated: false,
            };
        };
        await openCalculator(page);
        const held = await holdRequests(page, isChainSearch);
        await fillHand(page, FUSION_PAIR);
        await expect.poll(() => held.length).toBe(1);
        await fillSlot(page, 2, "Blue-eyes White Dragon");
        await expect.poll(() => held.length).toBe(2);

        await held[1]?.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(answer("New Hand Card")),
        });
        await expect(page.locator("#chain-output .chain-verdict")).toContainText("New Hand Card");
        await held[0]
            ?.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(answer("Old Hand Card")),
            })
            .catch(() => undefined);
        await pause(page);

        await expect(page.locator("#chain-output .chain-verdict")).toContainText("New Hand Card");
        await expect(page.locator("#chain-output")).not.toContainText("Old Hand Card");
    });
});

test.describe("the chain request", () => {
    test("is sent once per committed hand change with two cards or more, and never below", async ({
        page,
    }) => {
        await openCalculator(page);
        const chains = logRequests(page, isChainSearch);

        await fillSlot(page, 0, MYSTICAL_ELF);
        await expect(slotAt(page, 0).locator(".slot-name")).toHaveText(MYSTICAL_ELF);
        await pause(page);
        expect(chains.started).toHaveLength(0);

        await fillSlot(page, 1, MUSHROOM_MAN);
        await expect(page.locator("#chain-output")).toContainText("Paso 1");
        // fill() and the dispatched event both fire a change: the same hand is not asked for twice.
        await slotAt(page, 1).locator("input").dispatchEvent("change");
        await settled(page, chains);
        expect(chains.started).toHaveLength(1);
        expect(sentHandIds(chains.started[0]!)).toHaveLength(2);

        await fillSlot(page, 2, "Blue-eyes White Dragon");
        await expect.poll(() => chains.started.length).toBe(2);
        expect(sentHandIds(chains.started[1]!)).toHaveLength(3);

        await slotAt(page, 2).locator(".clear-btn").click();
        await slotAt(page, 1).locator(".clear-btn").click();
        await settled(page, chains);
        expect(chains.started).toHaveLength(3);
        await expect(page.locator("#chain-section")).toBeHidden();
    });

    test("does not repeat the calculation of the results", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        await expect(page.locator("#chain-output")).toContainText("Paso 1");
        const calculations = logRequests(page, isCalculator);
        const chains = logRequests(page, isChainSearch);

        await page.route(isChainSearch, fulfillJson(500, apiError("internal-error")));
        await slotAt(page, 2).locator("input").fill("Blue-eyes White Dragon");
        await slotAt(page, 2).locator("input").dispatchEvent("change");
        await expect(page.locator("#chain-output").getByRole("alert")).toBeVisible();
        await page.unroute(isChainSearch);
        await settled(page, chains);
        const calculated = calculations.started.length;

        await page.locator("#chainBtn").click();
        await expect(page.locator("#chain-output")).toContainText("Paso 1");

        expect(calculations.started).toHaveLength(calculated);
    });
});

test.describe("the results and the chain are independent", () => {
    test("render the chain even when the results are slow, once they settle", async ({ page }) => {
        await openCalculator(page);
        const heldCalculations = await holdRequests(page, isCalculator);
        const chainAnswered = page.waitForResponse((response) => isChainSearch(new URL(response.url())));

        await fillHand(page, FUSION_PAIR);
        await (await chainAnswered).finished();
        await pause(page);

        // The answer waits for the results: the gain line needs their best fusion.
        await expect(page.locator("#chain-output .chain-best")).toHaveCount(0);
        await expect(page.locator("#chain-loading")).toBeVisible();
        for (const route of heldCalculations) await release(route);
        await expect(page.locator("#chain-output .chain-best")).toBeVisible();
        await expect(page.locator("#fusions-title")).toBeVisible();
    });

    test("show the results when the chain search never answers", async ({ page }) => {
        await openCalculator(page);
        await holdRequests(page, isChainSearch);

        await fillHand(page, FUSION_PAIR);

        await expect(page.locator("#fusions-title")).toBeVisible();
        await expect(page.locator("#chain-loading")).toBeVisible();
    });
});

test.describe("the chain retry button", () => {
    test("is hidden by default and while the chain works", async ({ page }) => {
        await openCalculator(page);
        await expect(page.locator("#chainBtn")).toBeHidden();
        await expect(page.locator("#chainBtn")).toHaveText(TEXT.retry);

        await fillHand(page, FUSION_PAIR);

        await expect(page.locator("#chain-output")).toContainText("Paso 1");
        await expect(page.locator("#chainBtn")).toBeHidden();
    });

    test("appears with the error, recovers on click and asks only for the chain again", async ({ page }) => {
        await page.route(isChainSearch, fulfillJson(500, apiError("internal-error")));
        await openCalculator(page);
        const calculations = logRequests(page, isCalculator);
        const chains = logRequests(page, isChainSearch);

        await fillHand(page, FUSION_PAIR);

        const retry = page.locator("#chainBtn");
        await expect(page.locator("#chain-output").getByRole("alert")).toHaveText(TEXT.chainFailed);
        await expect(retry).toBeVisible();
        await expect(retry).toBeEnabled();
        const box = await retry.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await settled(page, chains);
        const calculated = calculations.started.length;
        const asked = chains.started.length;

        await page.unroute(isChainSearch);
        await retry.click();

        await expect(page.locator("#chain-output")).toContainText("Paso 1");
        await expect(page.locator("#chain-output").getByRole("alert")).toHaveCount(0);
        await expect(retry).toBeHidden();
        await expect(page.locator("#chain-loading")).toBeHidden();
        expect(chains.started).toHaveLength(asked + 1);
        expect(calculations.started).toHaveLength(calculated);
    });

    test("is busy while the retry is in flight, and one click sends one request", async ({ page }) => {
        await page.route(isChainSearch, fulfillJson(500, apiError("internal-error")));
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        const retry = page.locator("#chainBtn");
        await expect(retry).toBeVisible();
        await page.unroute(isChainSearch);
        const held = await holdRequests(page, isChainSearch);
        const chains = logRequests(page, isChainSearch);

        await retry.dblclick();

        await expect(retry).toBeDisabled();
        await expect(retry).toHaveAttribute("aria-busy", "true");
        await expect(page.locator("#chain-loading")).toBeVisible();
        await expect.poll(() => held.length).toBeGreaterThan(0);
        for (const route of held) await release(route);
        await settled(page, chains);
        await expect(page.locator("#chain-output")).toContainText("Paso 1");
        await expect(retry).toBeHidden();
        await expect(retry).not.toHaveAttribute("aria-busy", "true");
        expect(chains.started).toHaveLength(1);
    });

    test("stays after a second failure and goes when the hand changes", async ({ page }) => {
        await page.route(isChainSearch, fulfillJson(500, apiError("internal-error")));
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        const retry = page.locator("#chainBtn");
        await expect(retry).toBeVisible();

        await retry.click();
        await expect(page.locator("#chain-output").getByRole("alert")).toHaveText(TEXT.chainFailed);
        await expect(retry).toBeVisible();
        await expect(retry).toBeEnabled();

        await slotAt(page, 1).locator(".clear-btn").click();
        await expect(retry).toBeHidden();
    });

    test("has a visible focus ring", async ({ page }) => {
        await page.route(isChainSearch, fulfillJson(500, apiError("internal-error")));
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
        const retry = page.locator("#chainBtn");
        await expect(retry).toBeVisible();

        // Any keyboard use makes the next focus a :focus-visible one.
        await page.keyboard.press("Tab");
        await retry.focus();

        await expect(retry).toBeFocused();
        await expect(retry).toHaveCSS("outline-width", "3px");
        await expect(retry).not.toHaveCSS("outline-style", "none");
    });
});

test.describe("chain search errors", () => {
    async function searchChainFor(page: Page): Promise<void> {
        await openCalculator(page);
        await fillHand(page, FUSION_PAIR);
    }

    test("name the hand limit when the server rejects the hand as too large", async ({ page }) => {
        await page.route(isChainSearch, fulfillJson(400, apiError("hand-too-large")));

        await searchChainFor(page);

        await expect(page.locator("#chain-output").getByRole("alert")).toHaveText(
            `La mano es demasiado grande para el cálculo de cadenas (máximo ${MAX_HAND_SIZE} cartas).`
        );
        await expect(page.locator("#chain-loading")).toBeHidden();
        await expect(page.locator("#chainBtn")).toBeEnabled();
    });

    const generic: ReadonlyArray<readonly [string, (route: Route) => Promise<void>]> = [
        ["a server error", fulfillJson(500, apiError("internal-error"))],
        ["a hand rejected for another reason", fulfillJson(400, apiError("invalid-hand"))],
        [
            "an answer that is not the API's",
            (route) =>
                route.fulfill({ status: 502, contentType: "text/html", body: "<h1>Bad gateway</h1>" }),
        ],
        ["a request that fails", (route) => route.abort()],
    ];

    for (const [cause, answer] of generic) {
        test(`show the generic error, not "no chain found", for ${cause}`, async ({ page }) => {
            await page.route(isChainSearch, answer);

            await searchChainFor(page);

            const output = page.locator("#chain-output");
            await expect(output.getByRole("alert")).toHaveText(TEXT.chainFailed);
            await expect(output).not.toContainText(TEXT.noChain);
            await expect(page.locator("#chain-loading")).toBeHidden();
            await expect(page.locator("#chainBtn")).toBeEnabled();
        });
    }

    test("still say so when the hand has no chain", async ({ page }) => {
        await openCalculator(page);

        await fillHand(page, NO_CHAIN_PAIR);

        await expect(page.locator("#chain-output")).toHaveText(TEXT.noChain);
        await expect(page.locator("#chainBtn")).toBeHidden();
    });
});

test.describe("a failed card index", () => {
    test("leaves the slots usable and offers a retry that brings the suggestions back", async ({ page }) => {
        const errors: Error[] = [];
        page.on("pageerror", (error) => errors.push(error));
        await page.route(isCardsIndex, (route) => route.abort());

        await page.goto("/calculator");

        await expect(page.locator(".hand-slot")).toHaveCount(5);
        const alert = page.locator("#index-error");
        await expect(alert).toBeVisible();
        await expect(alert).toContainText(TEXT.indexFailed);
        const retry = alert.getByRole("button", { name: TEXT.retry });
        await expect(retry).toBeEnabled();
        // Typing before the index exists suggests nothing and breaks nothing.
        const input = slotAt(page, 0).locator("input");
        await input.fill("Myst");
        await pause(page);
        await expect(page.getByRole("option")).toHaveCount(0);
        expect(errors).toEqual([]);

        await page.unroute(isCardsIndex);
        await retry.click();

        await expect(alert).toBeHidden();
        await input.fill("Mystical");
        await expect(page.getByRole("option", { name: MYSTICAL_ELF, exact: true })).toBeVisible();
        expect(errors).toEqual([]);
    });

    test("keeps the alert, and the retry, when the retry fails too", async ({ page }) => {
        await page.route(isCardsIndex, (route) => route.abort());
        await page.goto("/calculator");
        const alert = page.locator("#index-error");
        const retry = alert.getByRole("button", { name: TEXT.retry });
        await expect(retry).toBeVisible();
        const attempts = logRequests(page, isCardsIndex);

        await retry.click();
        await settled(page, attempts);

        expect(attempts.started).toHaveLength(1);
        await expect(alert).toBeVisible();
        await expect(retry).toBeEnabled();
    });

    test("calculates the hand typed while the index was down once a retry works", async ({ page }) => {
        await page.route(isCardsIndex, (route) => route.abort());
        await page.goto("/calculator");
        const alert = page.locator("#index-error");
        await expect(alert).toBeVisible();

        await fillHand(page, FUSION_PAIR);
        await expect(page.locator("#outputarealeft")).toBeEmpty();
        await page.unroute(isCardsIndex);
        await alert.getByRole("button", { name: TEXT.retry }).click();

        await expect(alert).toBeHidden();
        await expect(page.locator("#outputarealeft")).toContainText(MYSTICAL_ELF);
    });

    test("answers a server error the same way", async ({ page }) => {
        await page.route(isCardsIndex, fulfillJson(500, apiError("internal-error")));

        await page.goto("/calculator");

        await expect(page.locator("#index-error")).toBeVisible();
        await expect(page.locator(".hand-slot")).toHaveCount(5);
    });
});

test.describe("in English", () => {
    test.use({ locale: "en-US", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });

    test("translates the messages next to the slots and the chain", async ({ page }) => {
        await openCalculator(page);
        await fillSlot(page, 0, UNKNOWN_NAME);
        await expect(slotAt(page, 0).getByRole("alert")).toHaveText("Invalid card name");
        await page.route(isChainSearch, fulfillJson(400, apiError("hand-too-large")));
        await fillSlot(page, 1, MYSTICAL_ELF);
        await fillSlot(page, 2, MUSHROOM_MAN);
        await expect(slotAt(page, 2).locator(".slot-name")).toHaveText(MUSHROOM_MAN);

        await expect(page.locator("#chain-output").getByRole("alert")).toHaveText(
            `Hand is too large for chain calculation (max ${MAX_HAND_SIZE} cards).`
        );
        await expect(page.locator("#chainBtn")).toHaveText("Retry");

        await page.unroute(isChainSearch);
        await page.route(isChainSearch, fulfillJson(500, apiError("internal-error")));
        await page.locator("#chainBtn").click();
        await expect(page.locator("#chain-output").getByRole("alert")).toHaveText(
            "The chain could not be calculated. Please try again."
        );
    });

    test("translates the failed index alert", async ({ page }) => {
        await page.route(isCardsIndex, (route) => route.abort());

        await page.goto("/calculator");

        const alert = page.locator("#index-error");
        await expect(alert).toContainText("The card list could not be loaded.");
        await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();
    });

    test("translates the failed calculation alert", async ({ page }) => {
        await page.route(isCalculator, (route) => route.abort());
        await openCalculator(page);

        await fillHand(page, FUSION_PAIR);

        await expect(page.locator("#results-error").getByRole("alert")).toHaveText(
            "The results could not be calculated. Please try again."
        );
    });
});
