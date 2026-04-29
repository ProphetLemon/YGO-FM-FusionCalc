import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;

export default defineConfig({
    testDir: "tests/e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? "list" : "list",
    use: {
        baseURL: `http://localhost:${PORT}`,
        locale: "es-ES",
        extraHTTPHeaders: {
            "accept-language": "es-ES,es;q=0.9",
        },
        trace: "on-first-retry",
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
    webServer: {
        command: "npm run start",
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: {
            PORT: String(PORT),
            NODE_ENV: "production",
            LOG_LEVEL: "error",
        },
    },
});
