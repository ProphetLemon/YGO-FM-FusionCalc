import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

const app = createApp();

const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, "server listening");
});

function shutdown(signal: string): void {
    logger.info({ signal }, "shutting down");
    server.close(() => {
        process.exit(0);
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
