import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/unit/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: ["src/**/*.ts"],
            exclude: [
                "src/**/*.d.ts",
                "src/shared/types.ts",
                "src/server/index.ts",
                "src/server/logger.ts",
                "src/client/**/*.ts",
            ],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
            },
        },
    },
    resolve: {
        alias: {
            "@server": path.resolve(__dirname, "src/server"),
            "@shared": path.resolve(__dirname, "src/shared"),
            "@client": path.resolve(__dirname, "src/client"),
        },
    },
});
