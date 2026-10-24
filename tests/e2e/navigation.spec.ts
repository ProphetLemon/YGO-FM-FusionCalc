import { expect, test } from "@playwright/test";

test.describe("page navigation", () => {
    test("home loads with default es and contains hero title", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator("html")).toHaveAttribute("lang", "es");
        await expect(page.locator("h1")).toContainText(/Yu-Gi-Oh!/);
    });

    test("links in navbar navigate to all pages", async ({ page }) => {
        await page.goto("/");
        await page
            .getByRole("link", { name: /Buscador/i })
            .first()
            .click();
        await expect(page).toHaveURL(/\/search$/);
        await page
            .getByRole("link", { name: /Calculadora/i })
            .first()
            .click();
        await expect(page).toHaveURL(/\/calculator$/);
        await page
            .getByRole("link", { name: /Acerca/i })
            .first()
            .click();
        await expect(page).toHaveURL(/\/about$/);
    });
});

test.describe("top bar links", () => {
    const pages = [
        { path: "/", name: /Inicio/i },
        { path: "/search", name: /Buscador/i },
        { path: "/calculator", name: /Calculadora/i },
        { path: "/about", name: /Acerca/i },
    ];

    test("lists Home first, before the other pages", async ({ page }) => {
        await page.goto("/search");
        const labels = await page.locator("#primary-navigation a").allTextContents();
        expect(labels[0]).toMatch(/Inicio/i);
        await page
            .getByRole("link", { name: /Inicio/i })
            .first()
            .click();
        await expect(page).toHaveURL(/\/$/);
    });

    for (const { path, name } of pages) {
        test(`${path} marks only its own link with aria-current="page"`, async ({ page }) => {
            await page.goto(path);
            const current = page.locator('#primary-navigation a[aria-current="page"]');
            await expect(current).toHaveCount(1);
            await expect(current).toHaveText(name);
            await expect(current).toHaveAttribute("href", path);
        });
    }

    test("the language button of the current language is pressed and disabled", async ({ page }) => {
        await page.goto("/");
        await expect(page.getByRole("button", { name: "Español" })).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("button", { name: "Español" })).toBeDisabled();
        await expect(page.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "false");
    });
});

test.describe("legacy redirects", () => {
    const cases = [
        { from: "/index.html", to: "/" },
        { from: "/fusion-search.html", to: "/search" },
        { from: "/fusion-calculator.html", to: "/calculator" },
        { from: "/about.html", to: "/about" },
    ];

    for (const { from, to } of cases) {
        test(`${from} returns 301 to ${to}`, async ({ request }) => {
            const res = await request.get(from, { maxRedirects: 0 });
            expect(res.status()).toBe(301);
            expect(res.headers().location).toBe(to);
        });
    }
});

test.describe("language switch", () => {
    test("POST /lang sets cookie and switches language", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator("html")).toHaveAttribute("lang", "es");
        await page.getByRole("button", { name: "English" }).click();
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        await page.reload();
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });
});

test.describe("mobile navbar toggle", () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test("toggling expands and collapses the menu", async ({ page }) => {
        await page.goto("/");
        const toggle = page.locator("[data-navbar-toggle]");
        const collapse = page.locator("[data-navbar-collapse]");
        await expect(collapse).toBeHidden();
        await toggle.click();
        await expect(collapse).toBeVisible();
        await toggle.click();
        await expect(collapse).toBeHidden();
    });
});
