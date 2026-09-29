import { STATUS_CODES } from "node:http";
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

interface ErrorResponse {
    status: number;
    code: string;
    message: string;
}

interface HttpErrorFields {
    type?: unknown;
    status?: unknown;
    statusCode?: unknown;
}

// Express routes are case-insensitive, so "/API/..." reaches the API router too.
const API_PATH = /^\/api(?:\/|$)/i;

function isClientErrorStatus(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 400 && value < 500;
}

// Body-parser and the router tag the errors they raise for bad requests with an HTTP status. Those keep
// it; anything else is a 500. Neither case sends the error's own message or stack back to the client.
function toErrorResponse(err: unknown): ErrorResponse {
    const fields = (typeof err === "object" && err !== null ? err : {}) as HttpErrorFields;
    if (fields.type === "entity.parse.failed") {
        return { status: 400, code: "invalid-json", message: "Request body must be valid JSON" };
    }
    if (fields.type === "entity.too.large") {
        return { status: 413, code: "payload-too-large", message: "Request body is too large" };
    }
    const status = [fields.status, fields.statusCode].find(isClientErrorStatus);
    if (status !== undefined) {
        const reason = STATUS_CODES[status] ?? "Bad Request";
        return { status, code: reason.toLowerCase().replace(/\W+/g, "-"), message: reason };
    }
    return { status: 500, code: "internal-error", message: "Internal server error" };
}

function handleError(err: unknown, req: Request, res: Response, _next: NextFunction): void {
    const { status, code, message } = toErrorResponse(err);
    if (status >= 500) {
        req.log.error({ err }, "request failed");
    } else {
        // A client mistake is not a server fault, and the error of a rejected body holds the raw body: log
        // only its status and code.
        req.log.warn({ status, code }, "request rejected");
    }
    if (API_PATH.test(req.path)) {
        res.status(status).json({ error: { code, message } });
        return;
    }
    res.status(status).type("text/plain").send(message);
}

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

    app.use(handleError);

    return app;
}
