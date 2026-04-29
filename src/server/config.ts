import { config as loadDotenv } from "dotenv";

loadDotenv();

const VALID_LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"] as const;
export type LogLevel = (typeof VALID_LOG_LEVELS)[number];

const VALID_NODE_ENVS = ["development", "production", "test"] as const;
export type NodeEnv = (typeof VALID_NODE_ENVS)[number];

export interface Config {
    port: number;
    nodeEnv: NodeEnv;
    logLevel: LogLevel;
}

function readPort(raw: string | undefined): number {
    if (raw === undefined || raw === "") return 3000;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid PORT: ${raw}`);
    }
    return parsed;
}

function readNodeEnv(raw: string | undefined): NodeEnv {
    const value = raw ?? "development";
    if (!(VALID_NODE_ENVS as readonly string[]).includes(value)) {
        throw new Error(`Invalid NODE_ENV: ${value}`);
    }
    return value as NodeEnv;
}

function readLogLevel(raw: string | undefined): LogLevel {
    const value = raw ?? "info";
    if (!(VALID_LOG_LEVELS as readonly string[]).includes(value)) {
        throw new Error(`Invalid LOG_LEVEL: ${value}`);
    }
    return value as LogLevel;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    return {
        port: readPort(env.PORT),
        nodeEnv: readNodeEnv(env.NODE_ENV),
        logLevel: readLogLevel(env.LOG_LEVEL),
    };
}

export const config: Config = loadConfig();
