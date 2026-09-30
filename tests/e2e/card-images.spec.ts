import { expect, test, type Locator, type Page } from "@playwright/test";
import type { CardSummary } from "../../src/shared/types.js";

// Real cards, looked up in data/*.json instead of guessed.
const BLUE_EYES = "Blue-eyes White Dragon";
const MOUNTAIN_WARRIOR = "Mountain Warrior";
const THIRTEENTH_GRAVE = "The 13th Grave";
const GATE_GUARDIAN = "Gate Guardian";
const PUPPET_RITUAL = "Puppet Ritual";
const YAMADRON_RITUAL = "Yamadron Ritual";
const PSYCHO_PUPPET = "Psycho-Puppet";
const RED_EYES_B_DRAGON = "Red-eyes B. Dragon";
const METEOR_DRAGON = "Meteor Dragon";
const METEOR_B_DRAGON = "Meteor B. Dragon";
const CONTRUCT_OF_MASK = "Contruct of Mask";
const MASK_OF_SHINE_AND_DARK = "Mask of Shine & Dark";
// The Ritual card and the three materials of the recipe that makes Mask of Shine & Dark.
const MASK_HAND = [CONTRUCT_OF_MASK, "Mask of Darkness", "Masked Clown", "Masked Sorcerer"];
// Cards with no password (all zeros) that the override list does not name: they have no artwork at all.
const NO_ARTWORK = [METEOR_B_DRAGON, PSYCHO_PUPPET, MASK_OF_SHINE_AND_DARK, "Dark Magic Ritual"];

// The CDN names a file after the password of the card without its padding.
const CDN = "https://images.ygoprodeck.com/images/cards";
const FILE = {
    blueEyes: "89631139.jpg",
    mountainWarrior: "4931562.jpg",
    thirteenthGrave: "32864.jpg",
    gateGuardian: "25833572.jpg",
    puppetRitual: "1969506.jpg",
    yamadronRitual: "29089635.jpg",
    redEyesBDragon: "74677422.jpg",
    meteorDragon: "64271667.jpg",
    contructOfMask: "2304453.jpg",
    maskOfDarkness: "28933734.jpg",
    maskedClown: "77581312.jpg",
    maskedSorcerer: "10189126.jpg",
};
const MASK_MATERIAL_FILES = [FILE.maskOfDarkness, FILE.maskedClown, FILE.maskedSorcerer];

// A file name that names a card: digits with no padding. Anything else is a request the CDN can only
// answer with a 404.
const REAL_FILE_NAME = /^[1-9]\d*\.jpg$/;

// What a compact box measures (w-10 h-14) and what the large one of the search page does (w-40 h-56).
const THUMBNAIL_SIZE = { width: 40, height: 56 };
const SUMMARY_SIZE = { width: 160, height: 224 };

// One transparent pixel: what the CDN answers for a file it has.
const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
);

const only =
    (...files: string[]) =>
    (file: string): boolean =>
        files.includes(file);
const anyFile = (): boolean => true;

// The CDN is mocked: it has the files `has` accepts and answers every other name as the real one does, with a
// 404. The result lists the file names the page asked for.
async function mockCdn(page: Page, has: (file: string) => boolean): Promise<string[]> {
    const asked: string[] = [];
    await page.route(`${CDN}/**`, (route) => {
        const file = new URL(route.request().url()).pathname.split("/").pop() ?? "";
        asked.push(file);
        if (has(file)) return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
        return route.fulfill({ status: 404, contentType: "text/html", body: "Not found" });
    });
    return asked;
}

function slotAt(page: Page, index: number): Locator {
    return page.locator(".hand-slot").nth(index);
}

// The placeholders a person can see. A card with artwork keeps its own, hidden, in case the picture fails.
function shownPlaceholders(block: Locator): Locator {
    return block.locator(".card-placeholder").filter({ visible: true });
}

async function fillSlot(page: Page, index: number, name: string): Promise<void> {
    const slot = slotAt(page, index);
    await slot.locator("input").fill(name);
    await slot.locator("input").dispatchEvent("change");
    await expect(slot.locator(".slot-name")).toHaveText(name);
}

async function fillHand(page: Page, names: readonly string[]): Promise<void> {
    for (const [index, name] of names.entries()) await fillSlot(page, index, name);
}

// The search starts with the change event, as the search specs start theirs.
async function searchByName(page: Page, name: string): Promise<void> {
    await page.goto("/search");
    const input = page.locator("#cardname");
    await input.fill(name);
    await input.dispatchEvent("change");
}

function summaryOf(name: string): CardSummary {
    return {
        id: 1,
        name,
        description: "",
        type: 0,
        typeName: "Dragon",
        attack: 1000,
        defense: 1000,
        stars: 1,
        password: "00000000",
        imageCode: null,
        isMonster: true,
    };
}

async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
    const box = await locator.boundingBox();
    if (!box) throw new Error("The element has no box.");
    return box;
}

// A picture is shown as soon as it has a box, before it has loaded, so being visible proves nothing about the
// file. The one pixel of the mock is what a loaded picture measures; a picture the CDN refused measures 0.
async function expectLoaded(image: Locator): Promise<void> {
    await expect(image).toHaveJSProperty("naturalWidth", 1);
}

// Waits for the page to go quiet, so that a request still to come would show up in what was asked.
async function settle(page: Page): Promise<void> {
    await page.waitForLoadState("networkidle");
}

// The page asks for its pictures lazily, a little after it draws them. Wait for the files expected, then for
// the page to go quiet, and check that no other file followed.
async function expectAsked(page: Page, asked: readonly string[], files: readonly string[]): Promise<void> {
    const expected = [...new Set(files)].sort();
    await expect.poll(() => [...new Set(asked)].sort()).toEqual(expected);
    await settle(page);
    expect([...new Set(asked)].sort()).toEqual(expected);
}

// The artwork the page asks for, by the reason the password would or would not do as a file name.
const ARTWORK: ReadonlyArray<readonly [string, string, string]> = [
    ["a password with no padding", BLUE_EYES, FILE.blueEyes],
    ["a password padded with one zero", MOUNTAIN_WARRIOR, FILE.mountainWarrior],
    ["a password padded with three zeros", THIRTEENTH_GRAVE, FILE.thirteenthGrave],
    ["no password, named by the override list", GATE_GUARDIAN, FILE.gateGuardian],
    ["a password the CDN has no file for, named by the override list", PUPPET_RITUAL, FILE.puppetRitual],
];

test.describe("the artwork of a card in a hand slot", () => {
    for (const [reason, name, file] of ARTWORK) {
        test(`is the file of ${reason}`, async ({ page }) => {
            const asked = await mockCdn(page, only(file));
            await page.goto("/calculator");
            await fillHand(page, [name]);

            const slot = slotAt(page, 0);
            const image = slot.locator("img");
            await expectLoaded(image);
            await expect(image).toHaveAttribute("src", `${CDN}/${file}`);
            await expect(image).toHaveAttribute("alt", name);
            await expect(shownPlaceholders(slot)).toHaveCount(0);
            await expect(slot.getByRole("img", { name, exact: true })).toHaveCount(1);
            await expectAsked(page, asked, [file]);
        });
    }

    for (const name of NO_ARTWORK) {
        test(`names ${name} in its place, and asks the CDN for nothing`, async ({ page }) => {
            const asked = await mockCdn(page, anyFile);
            await page.goto("/calculator");
            await fillHand(page, [name]);

            const slot = slotAt(page, 0);
            await expect(shownPlaceholders(slot)).toHaveText(name);
            await expect(slot.locator("img")).toHaveCount(0);
            await expect(slot.getByRole("img", { name, exact: true })).toHaveCount(1);
            await settle(page);
            expect(asked).toEqual([]);
        });
    }

    test("names the card in its place when the CDN has no file for it", async ({ page }) => {
        const asked = await mockCdn(page, only());
        await page.goto("/calculator");
        await fillHand(page, [YAMADRON_RITUAL]);

        const slot = slotAt(page, 0);
        await expect(shownPlaceholders(slot)).toHaveText(YAMADRON_RITUAL);
        await expect(slot.locator("img")).toHaveCSS("display", "none");
        await expect(slot.getByRole("img", { name: YAMADRON_RITUAL, exact: true })).toHaveCount(1);
        await expectAsked(page, asked, [FILE.yamadronRitual]);
    });

    test("names the card in its place when the request fails", async ({ page }) => {
        await page.route(`${CDN}/**`, (route) => route.abort());
        await page.goto("/calculator");
        await fillHand(page, [BLUE_EYES]);

        const slot = slotAt(page, 0);
        await expect(shownPlaceholders(slot)).toHaveText(BLUE_EYES);
        await expect(slot.locator("img")).toHaveCSS("display", "none");
        await expect(slot.getByRole("img", { name: BLUE_EYES, exact: true })).toHaveCount(1);
    });

    test("gives way to the artwork, and back, as other cards take the slot", async ({ page }) => {
        const asked = await mockCdn(page, only(FILE.blueEyes));
        await page.goto("/calculator");
        const slot = slotAt(page, 0);

        await fillSlot(page, 0, METEOR_B_DRAGON);
        await expect(shownPlaceholders(slot)).toHaveText(METEOR_B_DRAGON);
        await slot.locator(".clear-btn").click();
        await fillSlot(page, 0, BLUE_EYES);
        await expectLoaded(slot.locator("img"));
        await expect(shownPlaceholders(slot)).toHaveCount(0);
        await slot.locator(".clear-btn").click();
        await fillSlot(page, 0, METEOR_B_DRAGON);
        await expect(shownPlaceholders(slot)).toHaveText(METEOR_B_DRAGON);
        await expect(slot.locator("img")).toHaveCount(0);
        await expectAsked(page, asked, [FILE.blueEyes]);
    });

    test.describe("with a long name on a narrow screen", () => {
        const LONG_NAMES: ReadonlyArray<readonly [string, string]> = [
            [
                "many words",
                "The Wicked Dragon With The Ersatz Head Of The Unbroken Silent Forgotten Mountain Kingdom Beyond",
            ],
            ["one very long word", "Pneumonoultramicroscopicsilicovolcanoconiosisandthensomemoreletters"],
        ];

        for (const [what, name] of LONG_NAMES) {
            test(`keeps a name of ${what} inside its box`, async ({ page }) => {
                await page.setViewportSize({ width: 375, height: 812 });
                await mockCdn(page, anyFile);
                // The name is made up, so the lookup that finds the card is too.
                await page.route(
                    (url) => url.pathname === "/api/cards",
                    (route) => route.fulfill({ json: { card: summaryOf(name) } })
                );
                await page.goto("/calculator");
                await fillSlot(page, 0, name);

                const placeholder = shownPlaceholders(slotAt(page, 0));
                const label = placeholder.locator("span");
                await expect(label).toHaveText(name);

                const inside = await boxOf(label);
                const box = await boxOf(placeholder);
                expect(inside.x).toBeGreaterThanOrEqual(box.x);
                expect(inside.y).toBeGreaterThanOrEqual(box.y);
                expect(inside.x + inside.width).toBeLessThanOrEqual(box.x + box.width);
                expect(inside.y + inside.height).toBeLessThanOrEqual(box.y + box.height);
                // The text stays within the label: no line runs past it, and at most five lines are shown.
                expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
                const lines = await label.evaluate(
                    (el) => el.clientHeight / parseFloat(getComputedStyle(el).lineHeight)
                );
                expect(Math.round(lines)).toBeLessThanOrEqual(5);
            });
        }
    });
});

test.describe("the thumbnails beside a label", () => {
    test("a fusion result with no artwork is a small plain box, and nothing is asked for it", async ({
        page,
    }) => {
        const asked = await mockCdn(page, only(FILE.redEyesBDragon, FILE.meteorDragon));
        await page.goto("/calculator");
        await fillHand(page, [RED_EYES_B_DRAGON, METEOR_DRAGON]);

        const entry = page.locator("#outputarealeft > div");
        await expect(entry).toHaveCount(1);
        await entry.scrollIntoViewIfNeeded();
        const images = entry.locator("img");
        await expect(images).toHaveCount(2);
        await expectLoaded(images.first());
        await expectLoaded(images.last());

        const box = shownPlaceholders(entry);
        await expect(box).toHaveCount(1);
        await expect(box).toHaveText("");
        await expect(box).toHaveAttribute("aria-label", METEOR_B_DRAGON);
        await expect(entry.getByRole("img", { name: METEOR_B_DRAGON, exact: true })).toHaveCount(1);
        expect(await boxOf(box)).toMatchObject(THUMBNAIL_SIZE);
        await expectAsked(page, asked, [FILE.meteorDragon, FILE.redEyesBDragon]);
    });

    test("a thumbnail with artwork shows it and hides its placeholder", async ({ page }) => {
        await mockCdn(page, only(FILE.redEyesBDragon, FILE.meteorDragon));
        await page.goto("/calculator");
        await fillHand(page, [RED_EYES_B_DRAGON, METEOR_DRAGON]);

        const entry = page.locator("#outputarealeft > div");
        await entry.scrollIntoViewIfNeeded();
        const first = entry.locator("img").first();
        await expectLoaded(first);
        await expect(first).toHaveAttribute("src", `${CDN}/${FILE.redEyesBDragon}`);
        await expect(first).toHaveAttribute("alt", RED_EYES_B_DRAGON);
        await expect(entry.locator(".card-placeholder").first()).toHaveCSS("display", "none");
    });

    test("a ritual shows the same box for a card the CDN lacks and for a card with no artwork", async ({
        page,
    }) => {
        const asked = await mockCdn(page, only(...MASK_MATERIAL_FILES));
        await page.goto("/calculator");
        await fillHand(page, MASK_HAND);

        const entry = page.locator("#rituals-output .ritual-entry");
        await expect(entry).toHaveCount(1);
        await entry.scrollIntoViewIfNeeded();
        const boxes = shownPlaceholders(entry);
        await expect(boxes).toHaveCount(2);
        await expect(boxes).toHaveText(["", ""]);
        await expect(boxes.nth(0)).toHaveAttribute("aria-label", CONTRUCT_OF_MASK);
        await expect(boxes.nth(1)).toHaveAttribute("aria-label", MASK_OF_SHINE_AND_DARK);
        for (const box of [boxes.nth(0), boxes.nth(1)]) {
            expect(await boxOf(box)).toMatchObject(THUMBNAIL_SIZE);
        }
        // Three materials show their picture; the Ritual card keeps one that failed, hidden, and the result
        // never had one.
        const images = entry.locator("img");
        await expect(images).toHaveCount(4);
        const shown = images.filter({ visible: true });
        await expect(shown).toHaveCount(3);
        for (const index of [0, 1, 2]) await expectLoaded(shown.nth(index));
        await expectAsked(page, asked, [FILE.contructOfMask, ...MASK_MATERIAL_FILES]);
    });
});

test.describe("the card summary of the search page", () => {
    test("names a card with no artwork in a large box, and asks for no file with no name", async ({
        page,
    }) => {
        const asked = await mockCdn(page, anyFile);
        await searchByName(page, PSYCHO_PUPPET);

        const summary = page.locator("#outputcard");
        const placeholder = shownPlaceholders(summary);
        await expect(placeholder).toHaveText(PSYCHO_PUPPET);
        await expect(summary.locator("img")).toHaveCount(0);
        expect(await boxOf(placeholder)).toMatchObject(SUMMARY_SIZE);
        // The fusions and equips of the card ask for their own artwork, and only for files that have a name.
        await expect.poll(() => asked.length).toBeGreaterThan(0);
        await settle(page);
        expect(asked.filter((file) => !REAL_FILE_NAME.test(file))).toEqual([]);
    });

    test("draws the artwork of a card with padding in its password, and shows the password padded", async ({
        page,
    }) => {
        await mockCdn(page, only(FILE.mountainWarrior));
        await searchByName(page, MOUNTAIN_WARRIOR);

        const summary = page.locator("#outputcard");
        await expectLoaded(summary.locator("img"));
        await expect(summary.locator("img")).toHaveAttribute("src", `${CDN}/${FILE.mountainWarrior}`);
        await expect(shownPlaceholders(summary)).toHaveCount(0);
        await expect(summary).toContainText("04931562");
    });

    test("draws the artwork of a card with no password, and shows the password as the game has it", async ({
        page,
    }) => {
        await mockCdn(page, only(FILE.gateGuardian));
        await searchByName(page, GATE_GUARDIAN);

        const summary = page.locator("#outputcard");
        await expectLoaded(summary.locator("img"));
        await expect(summary.locator("img")).toHaveAttribute("src", `${CDN}/${FILE.gateGuardian}`);
        await expect(summary).toContainText("00000000");
    });
});
