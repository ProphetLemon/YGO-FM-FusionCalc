import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

const LEGACY_PAGES: Readonly<Record<string, string>> = {
    "/": "index.html",
    "/index.html": "index.html",
    "/fusion-search.html": "fusion-search.html",
    "/fusion-calculator.html": "fusion-calculator.html",
    "/about.html": "about.html",
};

export function createApp(): Express {
    const app = express();

    app.disable("x-powered-by");
    app.use(pinoHttp({ logger }));

    app.use("/public", express.static(path.join(projectRoot, "public")));
    app.use("/data", express.static(path.join(projectRoot, "data")));

    for (const [route, file] of Object.entries(LEGACY_PAGES)) {
        app.get(route, (_req: Request, res: Response) => {
            res.sendFile(path.join(projectRoot, file));
        });
    }

    app.use((_req: Request, res: Response) => {
        res.status(404).type("text/plain").send("Not found");
    });

    app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
        req.log.error({ err }, "request failed");
        res.status(500).type("text/plain").send("Internal server error");
    });

    return app;
}
