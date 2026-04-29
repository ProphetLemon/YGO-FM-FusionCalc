import { expect, test } from "@playwright/test";

test.describe("visual identity", () => {
    test("body uses Varela Round font on home", async ({ page }) => {
        await page.goto("/");
        const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
        expect(fontFamily.toLowerCase()).toContain("varela round");
    });

    test("home hero section has the vrains background image", async ({ page }) => {
        await page.goto("/");
        const heroSection = page.locator("section.bg-vrains").first();
        const backgroundImage = await heroSection.evaluate((el) => getComputedStyle(el).backgroundImage);
        expect(backgroundImage).toContain("background.png");
    });

    test("hero h1 uses JetBrains Mono", async ({ page }) => {
        await page.goto("/");
        const h1 = page.locator("h1").first();
        const fontFamily = await h1.evaluate((el) => getComputedStyle(el).fontFamily);
        expect(fontFamily.toLowerCase()).toContain("jetbrains mono");
    });

    test("search page body has polymerization background", async ({ page }) => {
        await page.goto("/search");
        const backgroundImage = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
        expect(backgroundImage).toContain("fusion_background.jpg");
    });

    test("calculator page body has polymerization background", async ({ page }) => {
        await page.goto("/calculator");
        const backgroundImage = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
        expect(backgroundImage).toContain("fusion_background.jpg");
    });

    test("about page body has fm-primary background colour", async ({ page }) => {
        await page.goto("/about");
        const backgroundColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(backgroundColor).toBe("rgb(30, 35, 55)");
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
                    return { color: cs.color, fontFamily: cs.fontFamily };
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
});
