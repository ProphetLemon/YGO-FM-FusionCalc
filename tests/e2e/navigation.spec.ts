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
