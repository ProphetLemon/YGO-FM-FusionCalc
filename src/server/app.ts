import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { pinoHttp } from "pino-http";
import { loadStore } from "./data/store.js";
import { i18nMiddleware } from "./http/middleware/i18n.js";
import { apiRouter } from "./http/routes/api.js";
import { langRouter } from "./http/routes/lang.js";
import { legacyRedirectsRouter } from "./http/routes/legacy.js";
import { viewsRouter } from "./http/routes/views.js";
import { logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

export function createApp(): Express {
    loadStore();

    const app = express();

    app.disable("x-powered-by");
    app.set("view engine", "ejs");
    app.set("views", path.join(projectRoot, "views"));

    app.use(pinoHttp({ logger }));
    app.use(express.urlencoded({ extended: false }));
    app.use(cookieParser());
    app.use(i18nMiddleware);

    app.use("/public", express.static(path.join(projectRoot, "public")));
    app.use("/data", express.static(path.join(projectRoot, "data")));

    app.use("/api", apiRouter());
    app.use(legacyRedirectsRouter());
    app.use(langRouter());
    app.use(viewsRouter());

    app.use((_req: Request, res: Response) => {
        res.status(404).type("text/plain").send("Not found");
    });

    app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
        req.log.error({ err }, "request failed");
        res.status(500).type("text/plain").send("Internal server error");
    });

    return app;
}
