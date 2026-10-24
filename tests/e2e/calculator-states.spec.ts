import {
    expect,
    test,
    type Locator,
    type Page,
    type Request as PageRequest,
    type Response as PageResponse,
    type Route,
} from "@playwright/test";
import { MAX_HAND_SIZE } from "../../src/shared/limits.js";
import type {
    CalculatorResponse,
    CardSummary,
    ChainResult,
    ChainSearchResponse,
} from "../../src/shared/types.js";

const START_SLOTS = 5;
const MYSTICAL_ELF = "Mystical Elf";
const MUSHROOM_MAN = "Mushroom Man";
// One fusion (Queen of Autumn Leaves) and no equip.
const FUSION_ONLY = [MYSTICAL_ELF, MUSHROOM_MAN];
// Two monsters with neither a fusion nor an equip between them (looked up in data/*.json, not guessed).
const NOTHING = ["Blue-eyes White Dragon", MYSTICAL_ELF];
// An Equip card and a monster it fits; the two do not fuse.
const EQUIP_CARD = "Legendary Sword";
const MONSTER = "Flame Swordsman";
// Tyhone + Flame Swordsman make Crimson Sunbird (2300); Machine Conversion Factory, an Equip, fits Tyhone.
const CHAIN_HAND = ["Tyhone", MONSTER, "Machine Conversion Factory"];
// Twelve different cards, the most a hand takes. Mystical Elf and Mushroom Man fuse.
const FULL_HAND = [
    "Blue-eyes White Dragon",
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
// Artwork file names of the cards whose images the specs check.
const PASSWORD = {
    legendarySword: "61854111",
    flameSwordsman: "45231177",
    tyhone: "72842870",
    crimsonSunbird: "46696593",
};

const TEXT = {
    hint: "Añade al menos 2 cartas para ver fusiones y equipos. Los rituales necesitan la carta de ritual y sus tres materiales.",
    loading: "Calculando resultados…",
    noFusions: "No hay fusiones posibles con esta mano.",
    noEquips: "No hay equipos posibles con esta mano.",
    resultsFailed: "No se pudieron calcular los resultados. Inténtalo de nuevo.",
    truncated:
        "Búsqueda parcial: la mano tiene demasiadas combinaciones y solo se exploró una parte, así que puede haber una cadena mejor.",
    noChain: "No se encontró ninguna cadena posible con esta mano.",
    capReached: `Has alcanzado el máximo de ${MAX_HAND_SIZE} cartas en la mano.`,
};

const onPath =
    (path: string) =>
    (url: URL): boolean =>
        url.pathname === path;
const isCalculator = onPath("/api/calculator");
const isChainSearch = onPath("/api/chain-search");
const isCardsIndex = onPath("/api/cards-index");

test.beforeEach(async ({ page }) => {
    // The specs check the markup, so they do not need the third-party CDN to answer.
    await page.route("https://images.ygoprodeck.com/**", (route) => route.abort());
});

function slotAt(page: Page, index: number): Locator {
    return page.locator(".hand-slot").nth(index);
}

function statusRegion(page: Page): Locator {
    return page.locator("#results-status");
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

async function addSlotsUpTo(page: Page, count: number): Promise<void> {
    while ((await page.locator(".hand-slot").count()) < count) await page.locator("#addSlotBtn").click();
}

// An empty block has no size and Playwright would call it hidden too, so also check it takes no space.
async function expectRitualsHidden(block: Locator): Promise<void> {
    await expect(block).toBeHidden();
    await expect(block).toHaveCSS("display", "none");
}

// Holds every matching request until the test lets it go, so the test decides when the answer comes.
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

function fulfillJson(status: number, body: unknown): (route: Route) => Promise<void> {
    return (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function sentHandIds(request: PageRequest): number[] {
    return (request.postDataJSON() as { handIds: number[] }).handIds;
}

// Resolves when the page gets the calculator answer for a hand of that size.
function waitForCalculation(page: Page, handSize: number): Promise<PageResponse> {
    return page.waitForResponse(
        (response) =>
            isCalculator(new URL(response.url())) && sentHandIds(response.request()).length === handSize
    );
}

// The real answer of the chain search with only its `truncated` flag decided by the test.
function chainSearchTruncated(truncated: boolean): (route: Route) => Promise<void> {
    return async (route) => {
        const response = await route.fetch();
        const body = (await response.json()) as ChainSearchResponse;
        await route.fulfill({ response, json: { ...body, truncated } });
    };
}

function backgroundOf(block: Locator): Promise<string> {
    return block.evaluate((element) => getComputedStyle(element).backgroundColor);
}

function summary(id: number, name: string, typeName: string): CardSummary {
    return {
        id,
        name,
        description: "",
        type: 0,
        typeName,
        attack: 1000,
        defense: 1000,
        stars: 1,
        password: "00000000",
        imageCode: null,
        isMonster: typeName !== "Equip",
    };
}

test.describe("the results status region", () => {
    test("is a polite live region outside both result columns", async ({ page }) => {
        await page.goto("/calculator");

        const region = statusRegion(page);
        await expect(region).toHaveAttribute("role", "status");
        await expect(region).toHaveAttribute("aria-live", "polite");
        await expect(page.locator("#outputarealeft #results-status")).toHaveCount(0);
        await expect(page.locator("#outputarearight #results-status")).toHaveCount(0);
    });

    test("is written once, not again when the card index arrives", async ({ page }) => {
        await page.addInitScript(() => {
            const counter = window as Window & { statusChanges?: number };
            counter.statusChanges = 0;
            document.addEventListener("DOMContentLoaded", () => {
                const region = document.querySelector("#results-status");
                if (!region) return;
                new MutationObserver((records) => {
                    counter.statusChanges = (counter.statusChanges ?? 0) + records.length;
                }).observe(region, { childList: true });
            });
        });

        await openCalculator(page);

        await expect(statusRegion(page)).toHaveText(TEXT.hint);
        const changes = await page.evaluate(
            () => (window as Window & { statusChanges?: number }).statusChanges
        );
        expect(changes).toBe(1);
    });
});

test.describe("the hint", () => {
    test("shows on first load and leaves both columns empty", async ({ page }) => {
        await openCalculator(page);

        await expect(statusRegion(page)).toHaveText(TEXT.hint);
        await expect(page.locator("#outputarealeft")).toBeEmpty();
        await expect(page.locator("#outputarearight")).toBeEmpty();
    });

    test("does not wait for the card index", async ({ page }) => {
        await page.route(isCardsIndex, (route) => route.abort());

        await page.goto("/calculator");

        await expect(page.locator("#index-error")).toBeVisible();
        await expect(statusRegion(page)).toHaveText(TEXT.hint);
    });

    test("stays with one card in the hand", async ({ page }) => {
        await openCalculator(page);

        await fillHand(page, [MYSTICAL_ELF]);

        await expect(statusRegion(page)).toHaveText(TEXT.hint);
        await expect(page.locator("#outputarealeft")).toBeEmpty();
    });

    test("goes once two cards are in the hand", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, [MYSTICAL_ELF]);
        await expect(statusRegion(page)).toHaveText(TEXT.hint);

        await fillSlot(page, 1, MUSHROOM_MAN);

        await expect(page.locator("#outputarealeft h2")).toHaveCount(1);
        await expect(statusRegion(page)).toBeEmpty();
    });

    test("comes back when a card leaves the hand", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_ONLY);
        await expect(page.locator("#outputarealeft h2")).toHaveCount(1);

        await slotAt(page, 1).locator(".clear-btn").click();

        await expect(statusRegion(page)).toHaveText(TEXT.hint);
        await expect(page.locator("#outputarealeft")).toBeEmpty();
    });

    test("comes back after a reset", async ({ page }) => {
        await openCalculator(page);
        await fillHand(page, FUSION_ONLY);
        await expect(page.locator("#outputarealeft h2")).toHaveCount(1);
        await expect(statusRegion(page)).toBeEmpty();

        await page.locator("#resetBtn").click();

        await expect(statusRegion(page)).toHaveText(TEXT.hint);
        await expect(page.locator("#outputarealeft")).toBeEmpty();
        await expect(page.locator("#outputarearight")).toBeEmpty();
    });
});

test.describe("the loading text", () => {
    test("shows while the calculation is in flight and goes with the results", async ({ page }) => {
        await openCalculator(page);
        const held = await holdRequests(page, isCalculator);

        await fillHand(page, FUSION_ONLY);

        await expect(statusRegion(page)).toHaveText(TEXT.loading);
        await expect(page.locator("#outputarealeft")).toBeEmpty();
        for (const route of held) await release(route);
        await expect(page.locator("#outputarealeft h2")).toHaveCount(1);
        await expect(statusRegion(page)).toBeEmpty();
    });

    const failures: ReadonlyArray<readonly [string, (route: Route) => Promise<void>]> = [
        ["the request fails", (route) => route.abort()],
        ["the server errors", fulfillJson(500, { error: { code: "internal-error", message: "boom" } })],
    ];

    for (const [cause, answer] of failures) {
        test(`goes when ${cause}`, async ({ page }) => {
            await openCalculator(page);
            // Requests wait at the gate, so the loading text can be seen. Once it opens every request fails,
            // the retry that a failed hand gets on its next change event included.
            let openGate: () => void = () => undefined;
            const gate = new Promise<void>((resolve) => {
                openGate = resolve;
            });
            await page.route(isCalculator, async (route) => {
                await gate;
                await answer(route).catch(() => undefined);
            });
            await fillHand(page, FUSION_ONLY);
            await expect(statusRegion(page)).toHaveText(TEXT.loading);

            openGate();

            await expect(page.locator("#results-error").getByRole("alert")).toHaveText(TEXT.resultsFailed);
            await expect(statusRegion(page)).toBeEmpty();
            await expect(page.locator("#results-error").getByRole("alert")).toHaveText(TEXT.resultsFailed);
        });
    }

    test("goes when a newer hand answers first and the older one late", async ({ page }) => {
        await openCalculator(page);
        const held = await holdRequests(page, isCalculator);
        await fillHand(page, FUSION_ONLY);
        await expect.poll(() => held.length).toBe(1);
        await fillSlot(page, 2, "Blue-eyes White Dragon");
        await expect.poll(() => held.length).toBe(2);
        await expect(statusRegion(page)).toHaveText(TEXT.loading);

        await release(held[1]);
        await expect(page.locator("#outputarealeft h2")).toHaveCount(1);
        await expect(statusRegion(page)).toBeEmpty();
        await release(held[0]);
        await pause(page);

        await expect(page.locator("#outputarealeft h2")).toHaveCount(1);
        await expect(statusRegion(page)).toBeEmpty();
    });

    test("gives way to the hint when the hand drops below two cards", async ({ page }) => {
        await openCalculator(page);
        const held = await holdRequests(page, isCalculator);
        await fillHand(page, FUSION_ONLY);
        await expect(statusRegion(page)).toHaveText(TEXT.loading);

        await slotAt(page, 1).locator(".clear-btn").click();
        await expect(statusRegion(page)).toHaveText(TEXT.hint);
        for (const route of held) await release(route);
        await pause(page);

        await expect(statusRegion(page)).toHaveText(TEXT.hint);
        await expect(page.locator("#outputarealeft")).toBeEmpty();
    });

    test("gives way to the hint on a reset", async ({ page }) => {
        await openCalculator(page);
        const held = await holdRequests(page, isCalculator);
        await fillHand(page, FUSION_ONLY);
        await expect(statusRegion(page)).toHaveText(TEXT.loading);

        await page.locator("#resetBtn").click();
        await expect(statusRegion(page)).toHaveText(TEXT.hint);
        for (const route of held) await release(route);
        await pause(page);

        await expect(statusRegion(page)).toHaveText(TEXT.hint);
        await expect(page.locator("#outputarealeft")).toBeEmpty();
        await expect(page.locator("#outputarearight")).toBeEmpty();
    });
});

test.describe("a column without entries", () => {
    test("says there are no fusions and no equips for a hand with neither", async ({ page }) => {
        await openCalculator(page);
        const calculated = waitForCalculation(page, NOTHING.length);

        await fillHand(page, NOTHING);
        await (await calculated).finished();

        await expect(
            page.locator("#outputarealeft").getByRole("heading", { name: "Fusiones" })
        ).toBeVisible();
        await expect(page.locator("#outputarealeft > p")).toHaveText(TEXT.noFusions);
        await expect(
            page.locator("#outputarearight").getByRole("heading", { name: "Se puede equipar a" })
        ).toBeVisible();
        await expect(page.locator("#outputarearight > p")).toHaveText(TEXT.noEquips);
        await expect(page.locator("#outputarealeft > div")).toHaveCount(0);
        await expect(page.locator("#outputarearight > div")).toHaveCount(0);
        await expectRitualsHidden(page.locator("#rituals-output"));
    });

    test("says so only for the fusions when the hand has just an equip pair", async ({ page }) => {
        await openCalculator(page);

        await fillHand(page, [EQUIP_CARD, MONSTER]);

        await expect(page.locator("#outputarearight > div")).toHaveCount(1);
        await expect(page.locator("#outputarealeft > p")).toHaveText(TEXT.noFusions);
        await expect(page.locator("#outputarealeft > div")).toHaveCount(0);
        await expect(page.locator("#outputarearight > p")).toHaveCount(0);
    });

    test("says so only for the equips when the hand has just a fusion", async ({ page }) => {
        await openCalculator(page);

        await fillHand(page, FUSION_ONLY);

        await expect(page.locator("#outputarealeft > div")).toHaveCount(1);
        await expect(page.locator("#outputarearight > p")).toHaveText(TEXT.noEquips);
        await expect(page.locator("#outputarearight > div")).toHaveCount(0);
        await expect(page.locator("#outputarealeft > p")).toHaveCount(0);
    });

    test("says nothing when both columns have entries", async ({ page }) => {
        await openCalculator(page);

        await fillHand(page, CHAIN_HAND);

        await expect(page.locator("#outputarealeft > div")).toHaveCount(1);
        await expect(page.locator("#outputarearight > div")).toHaveCount(1);
        await expect(page.locator("#outputarealeft > p")).toHaveCount(0);
        await expect(page.locator("#outputarearight > p")).toHaveCount(0);
    });
});

test.describe("an equip pair", () => {
    const orders: ReadonlyArray<readonly [string, readonly string[]]> = [
        ["the Equip card first", [EQUIP_CARD, MONSTER]],
        ["the monster first", [MONSTER, EQUIP_CARD]],
    ];

    for (const [order, names] of orders) {
        test(`names the Equip card and the monster with ${order} in the hand`, async ({ page }) => {
            await openCalculator(page);

            await fillHand(page, names);

            const entry = page.locator("#outputarearight > div");
            await expect(entry).toHaveCount(1);
            await expect(entry.locator("p")).toHaveText([`Equipo: ${EQUIP_CARD}`, `Monstruo: ${MONSTER}`]);
            const images = entry.locator("img");
            await expect(images).toHaveCount(2);
            await expect(images.nth(0)).toHaveAttribute(
                "src",
                new RegExp(`/${PASSWORD.legendarySword}\\.jpg$`)
            );
            await expect(images.nth(1)).toHaveAttribute(
                "src",
                new RegExp(`/${PASSWORD.flameSwordsman}\\.jpg$`)
            );
        });
    }

    test("puts the Equip card first even when it is the last card of a bigger hand", async ({ page }) => {
        await openCalculator(page);

        await fillHand(page, CHAIN_HAND);

        await expect(page.locator("#outputarearight > div p")).toHaveText([
            "Equipo: Machine Conversion Factory",
            "Monstruo: Tyhone",
        ]);
    });

    test("keeps the neutral labels for a fusion", async ({ page }) => {
        await openCalculator(page);

        await fillHand(page, FUSION_ONLY);

        await expect(page.locator("#outputarealeft > div p")).toHaveText([
            `Carta: ${MYSTICAL_ELF}`,
            `Carta: ${MUSHROOM_MAN}`,
            "Resultado: Queen of Autumn Leaves (1800/1500)",
        ]);
    });

    test("keeps the neutral labels, in order, when it is not one Equip and one other card", async ({
        page,
    }) => {
        const answer: CalculatorResponse = {
            fusions: [],
            equips: [
                {
                    card1: summary(1, "First Monster", "Warrior"),
                    card2: summary(2, "Second Monster", "Beast"),
                },
                { card1: summary(3, "First Equip", "Equip"), card2: summary(4, "Second Equip", "Equip") },
            ],
            rituals: [],
        };
        await page.route(isCalculator, fulfillJson(200, answer));
        await openCalculator(page);

        await fillHand(page, FUSION_ONLY);

        const entries = page.locator("#outputarearight > div");
        await expect(entries).toHaveCount(2);
        await expect(entries.nth(0).locator("p")).toHaveText([
            "Carta: First Monster",
            "Carta: Second Monster",
        ]);
        await expect(entries.nth(1).locator("p")).toHaveText(["Carta: First Equip", "Carta: Second Equip"]);
    });
});

test.describe("the chain", () => {
    // The chain comes by itself once the hand has two cards: there is nothing to click.
    async function calculateChain(page: Page, names: readonly string[]): Promise<Locator> {
        await openCalculator(page);
        await fillHand(page, names);
        return page.locator("#chain-output .chain-entry");
    }

    test("shows each step as a card with artwork and ends in a highlighted result", async ({ page }) => {
        const chains = await calculateChain(page, CHAIN_HAND);

        await expect(chains).toHaveCount(1);
        const steps = chains.locator(".chain-step");
        await expect(steps).toHaveCount(1);
        await expect(steps.first().locator("p")).toHaveText([
            "Paso 1",
            "Carta: Tyhone",
            `Carta: ${MONSTER}`,
            "Resultado: Crimson Sunbird (2300/1800)",
        ]);
        const stepImages = steps.first().locator("img");
        await expect(stepImages).toHaveCount(3);
        for (const [index, password] of [
            PASSWORD.tyhone,
            PASSWORD.flameSwordsman,
            PASSWORD.crimsonSunbird,
        ].entries()) {
            await expect(stepImages.nth(index)).toHaveAttribute("src", new RegExp(`/${password}\\.jpg$`));
        }
        const final = chains.locator(".chain-final");
        await expect(final).toHaveCount(1);
        await expect(final.locator("p")).toHaveText(["Crimson Sunbird (2300/1800)", "ATK final: 2300"]);
        await expect(final.locator("img")).toHaveCount(1);
        await expect(final.locator("img")).toHaveAttribute(
            "src",
            new RegExp(`/${PASSWORD.crimsonSunbird}\\.jpg$`)
        );
        // The result opens the best play, before the steps that lead to it.
        await expect(chains.locator(":scope > *").first()).toHaveClass(/chain-headline/);
        await expect(chains.locator(":scope > *").first().locator(".chain-final")).toHaveCount(1);
        await expect(chains.locator(":scope > ol")).toHaveCount(1);
    });

    test("does not end in a card the hand merely holds", async ({ page }) => {
        const chains = await calculateChain(page, CHAIN_HAND);

        await expect(chains).toHaveCount(1);
        await expect(page.locator("#chain-output")).not.toContainText("Harpie's Feather Duster");
        await expect(page.locator("#chain-output")).not.toContainText("ATK final: 0");
    });

    test("sets the final result apart from the steps", async ({ page }) => {
        const chains = await calculateChain(page, CHAIN_HAND);

        const final = chains.locator(".chain-final");
        await expect(final).toBeVisible();
        await expect(final).toHaveCSS("border-top-width", "2px");
        const highlighted = await backgroundOf(final);
        expect(highlighted).not.toBe("rgba(0, 0, 0, 0)");
        expect(highlighted).not.toBe(await backgroundOf(chains.locator(".chain-step > div").first()));
    });

    test("numbers every step of a chain that needs several", async ({ page }) => {
        const chains = await calculateChain(page, [
            "Hard Armor",
            "Wicked Dragon with the Ersatz Head",
            "Hoshiningen",
            "Eyearmor",
            "Dragon Piper",
        ]);

        const best = chains.first();
        await expect(best.locator(".chain-step")).toHaveCount(3);
        await expect(best.locator(".chain-step > p")).toHaveText(["Paso 1", "Paso 2", "Paso 3"]);
        await expect(best.locator(".chain-final p").first()).toHaveText("Vermillion Sparrow (1900/1500)");
        await expect(best.locator(".chain-verdict")).toHaveText(
            "Fusiona en 3 pasos para obtener Vermillion Sparrow."
        );
        await expect(chains.locator(".chain-final")).toHaveCount(await chains.count());
    });

    test("says nothing about a partial search when the search was complete", async ({ page }) => {
        await page.route(isChainSearch, chainSearchTruncated(false));

        const chains = await calculateChain(page, CHAIN_HAND);

        await expect(chains).toHaveCount(1);
        await expect(page.locator("#chain-output").getByRole("note")).toHaveCount(0);
    });

    test("says the search was partial, above the chains, when the search was cut short", async ({
        page,
    }) => {
        await page.route(isChainSearch, chainSearchTruncated(true));

        const chains = await calculateChain(page, CHAIN_HAND);

        await expect(chains).toHaveCount(1);
        const note = page.locator("#chain-output").getByRole("note");
        await expect(note).toHaveText(TEXT.truncated);
        await expect(page.locator("#chain-output > *").first()).toHaveAttribute("role", "note");
    });

    test("says both that no chain was found and that the search was partial", async ({ page }) => {
        await page.route(isChainSearch, chainSearchTruncated(true));
        await openCalculator(page);
        await fillHand(page, NOTHING);

        await expect(page.locator("#chain-output")).toContainText(TEXT.noChain);
        await expect(page.locator("#chain-output").getByRole("note")).toHaveText(TEXT.truncated);
        await expect(page.locator("#chain-output .chain-entry")).toHaveCount(0);
    });

    test("drops the partial note with the chain when the hand changes", async ({ page }) => {
        await page.route(isChainSearch, chainSearchTruncated(true));
        const chains = await calculateChain(page, CHAIN_HAND);
        await expect(page.locator("#chain-output").getByRole("note")).toBeVisible();

        await slotAt(page, 1).locator(".clear-btn").click();

        await expect(chains).toHaveCount(0);
        await expect(page.locator("#chain-output")).toBeEmpty();
    });
});

// A card that is a monster with the ATK the test wants; the rest of its data is irrelevant to the chain.
function monster(id: number, name: string, attack: number): CardSummary {
    return { ...summary(id, name, "Warrior"), attack };
}

// A chain of `steps` fusions that ends in `finalCard`, with made-up intermediate cards.
function chainTo(finalCard: CardSummary, steps = 1): ChainResult {
    const made = Array.from({ length: steps }, (_, i) =>
        i === steps - 1 ? finalCard : monster(900 + i, `Intermediate ${i + 1}`, 800)
    );
    return {
        steps: made.map((result, i) => ({
            card1: i === 0 ? monster(801, "Input A", 500) : made[i - 1]!,
            card2: monster(802 + i, `Input ${i + 2}`, 500),
            result,
        })),
        finalCard,
    };
}

function calculatorAnswer(...results: CardSummary[]): CalculatorResponse {
    return {
        fusions: results.map((result) => ({
            card1: monster(801, "Input A", 500),
            card2: monster(802, "Input B", 500),
            result,
        })),
        equips: [],
        rituals: [],
    };
}

test.describe("the best play", () => {
    const BEST_SINGLE = monster(701, "Best Single", 1750);

    async function showBestPlay(
        page: Page,
        calculation: CalculatorResponse,
        chains: ChainResult[]
    ): Promise<Locator> {
        await page.route(isCalculator, fulfillJson(200, calculation));
        await page.route(isChainSearch, fulfillJson(200, { chains, truncated: false }));
        await openCalculator(page);
        await fillHand(page, FUSION_ONLY);
        const best = page.locator("#chain-output .chain-best");
        await expect(best).toBeVisible();
        return best;
    }

    test("says to fuse once when the best chain has a single step", async ({ page }) => {
        const best = await showBestPlay(page, calculatorAnswer(BEST_SINGLE), [
            chainTo(monster(702, "One Step Card", 1750)),
        ]);

        await expect(best.locator(".chain-verdict")).toHaveText(
            "Fusiona una vez para obtener One Step Card."
        );
        await expect(best.locator(".chain-final-atk")).toHaveText("ATK final: 1750");
    });

    test("counts the steps in the verdict and shows the gain over the best single fusion", async ({
        page,
    }) => {
        const best = await showBestPlay(page, calculatorAnswer(BEST_SINGLE), [
            chainTo(monster(702, "Two Step Card", 1900), 2),
        ]);

        await expect(best.locator(".chain-verdict")).toHaveText(
            "Fusiona en 2 pasos para obtener Two Step Card."
        );
        await expect(best.locator(".chain-gain")).toHaveText(
            "150 de ATK más que tu mejor fusión simple, Best Single (1750)."
        );
        await expect(best.locator(".chain-gain")).toHaveCount(1);
    });

    test("shows no gain when the chain only matches the best single fusion", async ({ page }) => {
        const best = await showBestPlay(page, calculatorAnswer(BEST_SINGLE), [
            chainTo(monster(702, "Same ATK", 1750), 2),
        ]);

        await expect(best.locator(".chain-final-atk")).toHaveText("ATK final: 1750");
        await expect(best.locator(".chain-gain")).toHaveCount(0);
    });

    test("shows no gain when the chain makes less than the best single fusion", async ({ page }) => {
        const best = await showBestPlay(page, calculatorAnswer(BEST_SINGLE), [
            chainTo(monster(702, "Weaker Card", 1200), 2),
        ]);

        await expect(best.locator(".chain-gain")).toHaveCount(0);
    });

    test("compares with the first fusion that makes a monster, not with a non-monster result", async ({
        page,
    }) => {
        const spell = { ...summary(703, "Strong Spell", "Equip"), attack: 3000 };
        const best = await showBestPlay(page, calculatorAnswer(spell, BEST_SINGLE), [
            chainTo(monster(702, "Two Step Card", 1900), 2),
        ]);

        await expect(best.locator(".chain-gain")).toContainText("Best Single (1750)");
    });

    test("shows no gain line when the hand has no fusion that makes a monster", async ({ page }) => {
        const best = await showBestPlay(page, calculatorAnswer(), [
            chainTo(monster(702, "Two Step Card", 1900), 2),
        ]);

        await expect(best.locator(".chain-gain")).toHaveCount(0);
    });

    test("folds the other chains into one details element after the best play", async ({ page }) => {
        await showBestPlay(page, calculatorAnswer(BEST_SINGLE), [
            chainTo(monster(702, "First Card", 1900), 2),
            chainTo(monster(703, "Second Card", 1800)),
            chainTo(monster(704, "Third Card", 1700)),
        ]);

        const output = page.locator("#chain-output");
        await expect(output.locator(".chain-entry")).toHaveCount(3);
        await expect(output.locator(":scope > .chain-best")).toHaveCount(1);
        const others = output.locator(":scope > details.chain-others");
        await expect(others).toHaveCount(1);
        await expect(others.locator("summary")).toHaveText("Otras cadenas (2)");
        await expect(others).not.toHaveAttribute("open", "");
        await expect(others.locator(".chain-entry")).toHaveCount(2);
        await expect(others.locator(".chain-entry.chain-best")).toHaveCount(0);
        await expect(others.locator(".chain-entry").first().locator(".chain-final p").first()).toContainText(
            "Second Card"
        );
        // After the best play, in the DOM order.
        await expect(output.locator(":scope > *").last()).toHaveClass(/chain-others/);
    });

    test("has no details element when there is only one chain", async ({ page }) => {
        await showBestPlay(page, calculatorAnswer(BEST_SINGLE), [chainTo(monster(702, "Only Card", 1900))]);

        await expect(page.locator("#chain-output details")).toHaveCount(0);
    });

    test("opens the other chains with the keyboard", async ({ page }) => {
        await showBestPlay(page, calculatorAnswer(BEST_SINGLE), [
            chainTo(monster(702, "First Card", 1900)),
            chainTo(monster(703, "Second Card", 1800)),
        ]);
        const summaryOfOthers = page.locator("#chain-output details.chain-others summary");

        await summaryOfOthers.focus();
        await expect(summaryOfOthers).toBeFocused();
        await page.keyboard.press("Enter");

        await expect(page.locator("#chain-output details.chain-others")).toHaveAttribute("open", "");
        await expect(page.locator("#chain-output details .chain-entry")).toBeVisible();
        const box = await summaryOfOthers.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
    });

    test("is hidden together with the chain section below two cards, and shown from two", async ({
        page,
    }) => {
        await openCalculator(page);
        const section = page.locator("#chain-section");
        await expect(section).toBeHidden();

        await fillHand(page, [MYSTICAL_ELF]);
        await expect(section).toBeHidden();

        await fillSlot(page, 1, MUSHROOM_MAN);
        await expect(section).toBeVisible();
        await expect(section.getByRole("heading", { name: "Cadena óptima de fusiones" })).toBeVisible();
        await expect(page.locator("#chain-output .chain-best")).toBeVisible();

        await slotAt(page, 1).locator(".clear-btn").click();
        await expect(section).toBeHidden();
        await expect(page.locator("#chain-output")).toBeEmpty();

        await fillSlot(page, 1, MUSHROOM_MAN);
        await expect(section).toBeVisible();
        await page.locator("#resetBtn").click();
        await expect(section).toBeHidden();
    });

    test("keeps the results when the chain search fails", async ({ page }) => {
        await page.route(
            isChainSearch,
            fulfillJson(500, { error: { code: "internal-error", message: "x" } })
        );
        await openCalculator(page);

        await fillHand(page, FUSION_ONLY);

        await expect(page.locator("#chain-output").getByRole("alert")).toBeVisible();
        await expect(page.locator("#outputarealeft > div")).toHaveCount(1);
        await expect(page.locator("#results-error")).toBeEmpty();
    });

    test("keeps the best play, without the gain line, when the calculation fails", async ({ page }) => {
        await page.route(isCalculator, (route) => route.abort());
        await openCalculator(page);

        await fillHand(page, FUSION_ONLY);

        await expect(page.locator("#chain-output .chain-best")).toBeVisible();
        await expect(page.locator("#chain-output .chain-gain")).toHaveCount(0);
        await expect(page.locator("#results-error").getByRole("alert")).toHaveText(TEXT.resultsFailed);
    });
});

test.describe("the add card button", () => {
    test("is disabled at the cap, with a hint that says why", async ({ page }) => {
        await page.goto("/calculator");
        const add = page.locator("#addSlotBtn");
        const hint = page.locator("#add-slot-hint");
        await expect(add).toBeEnabled();
        await expect(hint).toBeEmpty();

        for (let count = START_SLOTS; count < MAX_HAND_SIZE; count++) {
            await expect(add).toBeEnabled();
            await add.click();
        }

        await expect(page.locator(".hand-slot")).toHaveCount(MAX_HAND_SIZE);
        await expect(add).toBeDisabled();
        await expect(hint).toHaveText(TEXT.capReached);
        await expect(hint).toHaveAttribute("role", "status");
        await expect(add).toHaveAccessibleDescription(TEXT.capReached);
    });

    test("is enabled again once a slot is removed, and disabled again when it is refilled", async ({
        page,
    }) => {
        await page.goto("/calculator");
        await addSlotsUpTo(page, MAX_HAND_SIZE);
        const add = page.locator("#addSlotBtn");
        await expect(add).toBeDisabled();

        await page.locator(".remove-btn").first().click();

        await expect(page.locator(".hand-slot")).toHaveCount(MAX_HAND_SIZE - 1);
        await expect(add).toBeEnabled();
        await expect(page.locator("#add-slot-hint")).toBeEmpty();
        await expect(add).toHaveAccessibleDescription("");
        await add.click();
        await expect(page.locator(".hand-slot")).toHaveCount(MAX_HAND_SIZE);
        await expect(add).toBeDisabled();
        await expect(page.locator("#add-slot-hint")).toHaveText(TEXT.capReached);
    });

    test("cannot grow the hand past the cap even when the button is forced on", async ({ page }) => {
        await page.goto("/calculator");
        await addSlotsUpTo(page, MAX_HAND_SIZE);
        const add = page.locator("#addSlotBtn");
        await expect(add).toBeDisabled();

        await add.evaluate((button: HTMLButtonElement) => {
            button.disabled = false;
            button.click();
            button.click();
        });

        await expect(page.locator(".hand-slot")).toHaveCount(MAX_HAND_SIZE);
    });

    test("stays enabled through a reset below the cap", async ({ page }) => {
        await page.goto("/calculator");
        await addSlotsUpTo(page, MAX_HAND_SIZE - 1);

        await page.locator("#resetBtn").click();

        await expect(page.locator(".hand-slot")).toHaveCount(MAX_HAND_SIZE - 1);
        await expect(page.locator("#addSlotBtn")).toBeEnabled();
    });

    test("leaves room for a hand the server accepts", async ({ page }) => {
        expect(FULL_HAND).toHaveLength(MAX_HAND_SIZE);
        await openCalculator(page);
        await addSlotsUpTo(page, MAX_HAND_SIZE);
        const calculated = waitForCalculation(page, MAX_HAND_SIZE);

        await fillHand(page, FULL_HAND);

        expect((await calculated).status()).toBe(200);
        await expect(page.locator("#outputarealeft h2")).toHaveCount(1);
        await expect(page.locator("#results-error")).toBeEmpty();
        await expect(statusRegion(page)).toBeEmpty();
    });
});

test.describe("in English", () => {
    test.use({ locale: "en-US", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });

    test("translates the hint, the loading text and the empty columns", async ({ page }) => {
        await openCalculator(page);
        await expect(statusRegion(page)).toHaveText(
            "Add at least 2 cards to see fusions and equips. Rituals need the ritual card and its three materials."
        );
        const held = await holdRequests(page, isCalculator);

        await fillHand(page, NOTHING);
        await expect(statusRegion(page)).toHaveText("Calculating results…");
        for (const route of held) await release(route);

        await expect(page.locator("#outputarealeft > p")).toHaveText(
            "No fusions are possible with this hand."
        );
        await expect(page.locator("#outputarearight > p")).toHaveText(
            "No equips are possible with this hand."
        );
        await expect(statusRegion(page)).toBeEmpty();
    });

    test("translates the equip labels", async ({ page }) => {
        await openCalculator(page);

        await fillHand(page, [MONSTER, EQUIP_CARD]);

        await expect(page.locator("#outputarearight > div p")).toHaveText([
            `Equip: ${EQUIP_CARD}`,
            `Monster: ${MONSTER}`,
        ]);
    });

    test("translates the chain and its partial search note", async ({ page }) => {
        await page.route(isChainSearch, chainSearchTruncated(true));
        await openCalculator(page);
        await fillHand(page, CHAIN_HAND);

        const chain = page.locator("#chain-output .chain-entry");
        await expect(chain.locator(".chain-step > p")).toHaveText("Step 1");
        await expect(chain.locator(".chain-final p").last()).toHaveText("Final ATK: 2300");
        await expect(page.locator("#chain-output").getByRole("note")).toHaveText(
            "Partial search: this hand has too many combinations and only part of them was explored, so a better chain may exist."
        );
    });

    test("translates the hint at the cap", async ({ page }) => {
        await page.goto("/calculator");

        await addSlotsUpTo(page, MAX_HAND_SIZE);

        await expect(page.locator("#add-slot-hint")).toHaveText(
            `You have reached the limit of ${MAX_HAND_SIZE} cards in your hand.`
        );
    });
});
