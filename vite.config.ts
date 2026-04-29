import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    root: path.resolve(__dirname, "src/client"),
    build: {
        outDir: path.resolve(__dirname, "public/dist"),
        emptyOutDir: false,
        manifest: true,
        rollupOptions: {
            input: {
                home: path.resolve(__dirname, "src/client/pages/home.ts"),
                search: path.resolve(__dirname, "src/client/pages/search.ts"),
                calculator: path.resolve(__dirname, "src/client/pages/calculator.ts"),
                about: path.resolve(__dirname, "src/client/pages/about.ts"),
            },
        },
    },
    resolve: {
        alias: {
            "@shared": path.resolve(__dirname, "src/shared"),
            "@client": path.resolve(__dirname, "src/client"),
        },
    },
});
