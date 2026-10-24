import { expect, test } from "@playwright/test";

test.describe("visual identity", () => {
    const PAGES = ["/", "/search", "/calculator", "/about"];

    for (const path of PAGES) {
        test.describe(path, () => {
            test("body uses Hanken Grotesk", async ({ page }) => {
                await page.goto(path);
                const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
                expect(fontFamily.toLowerCase()).toContain("hanken grotesk");
            });

            test("headings use Chakra Petch", async ({ page }) => {
                await page.goto(path);
                const heading = page.locator("main h1, main h2, main h3").first();
                const fontFamily = await heading.evaluate((el) => getComputedStyle(el).fontFamily);
                expect(fontFamily.toLowerCase()).toContain("chakra petch");
            });

            test("body has the flat page grey and no photo background", async ({ page }) => {
                await page.goto(path);
                const { backgroundColor, backgroundImage } = await page.evaluate(() => {
                    const cs = getComputedStyle(document.body);
                    return { backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage };
                });
                expect(backgroundColor).toBe("rgb(185, 185, 179)");
                expect(backgroundImage).toBe("none");
            });

            test("no element on the page uses a photo background", async ({ page }) => {
                await page.goto(path);
                const photos = await page.evaluate(() =>
                    [...document.querySelectorAll("*")]
                        .map((el) => getComputedStyle(el).backgroundImage)
                        .filter((image) => /background\.png|fusion_background|lost_memories/.test(image))
                );
                expect(photos).toEqual([]);
            });
        });
    }

    test("page headings no longer use the old fonts", async ({ page }) => {
        await page.goto("/");
        const fontFamily = await page
            .locator("h1")
            .first()
            .evaluate((el) => getComputedStyle(el).fontFamily);
        expect(fontFamily.toLowerCase()).not.toContain("jetbrains");
        expect(fontFamily.toLowerCase()).not.toContain("varela");
    });

    test.describe("no page loads Bootstrap CSS", () => {
        for (const path of ["/", "/search", "/calculator", "/about"]) {
            test(path, async ({ page }) => {
                const response = await page.goto(path);
                expect(response?.ok()).toBe(true);
                const html = await page.content();
                expect(html).not.toContain("bootstrap.min.css");
            });
        }
    });

    test("navbar computed styles match across pages", async ({ page }) => {
        const probe = async (url: string) => {
            await page.goto(url);
            const container = await page
                .locator("header > div")
                .first()
                .evaluate((el) => {
                    const cs = getComputedStyle(el);
                    return {
                        maxWidth: cs.maxWidth,
                        paddingTop: cs.paddingTop,
                        paddingRight: cs.paddingRight,
                        paddingBottom: cs.paddingBottom,
                        paddingLeft: cs.paddingLeft,
                    };
                });
            const link = await page
                .locator('header a[href="/search"]')
                .first()
                .evaluate((el) => {
                    const cs = getComputedStyle(el);
                    return { fontFamily: cs.fontFamily, minHeight: cs.minHeight, fontWeight: cs.fontWeight };
                });
            return { container, link };
        };
        const home = await probe("/");
        const search = await probe("/search");
        const calculator = await probe("/calculator");
        const about = await probe("/about");
        expect(search).toEqual(home);
        expect(calculator).toEqual(home);
        expect(about).toEqual(home);
    });

    test("top bar shows the ruler strip and a raised brand plate linking home", async ({ page }) => {
        await page.goto("/calculator");
        await expect(page.locator("header .vent")).toHaveAttribute("aria-hidden", "true");
        const brand = page.locator('header a[href="/"]').first();
        await expect(brand.locator("img")).toBeVisible();
        const background = await page
            .locator("header")
            .evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(background).toBe("rgb(207, 207, 201)");
    });
});
