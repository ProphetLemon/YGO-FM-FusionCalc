import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import type { DeckOptimizeRequest, DeckOptimizeResponse } from "../../shared/types.js";
import { MAX_SEARCH_MILLIS, type DeckOptimizeOptions } from "../domain/deck-optimizer.js";

// A worker that has not answered this long after the search budget is killed and the request fails. The
// search stops itself at the budget, so this only catches a worker that hangs or dies.
export const WORKER_GRACE_MILLIS = 10_000;
// Old-generation heap a worker may use. The search needs a few MB; the cap stops a runaway from taking the
// server's memory.
const WORKER_HEAP_MB = 256;

export interface DeckWorkerInput {
    request: DeckOptimizeRequest;
    options?: DeckWorkerOptions;
}

export type DeckWorkerOutput = { ok: true; result: DeckOptimizeResponse } | { ok: false; message: string };

// Runs one optimisation and resolves with its response. Options are for tests; the server passes none.
export type RunDeckOptimization = (
    request: DeckOptimizeRequest,
    options?: DeckWorkerOptions,
    signal?: AbortSignal
) => Promise<DeckOptimizeResponse>;

// The options that can cross to a worker: plain values (a clock function cannot).
export type DeckWorkerOptions = Omit<DeckOptimizeOptions, "now">;

// Raised when an optimisation is already running.
export class OptimizerBusyError extends Error {
    constructor() {
        super("A deck optimisation is already running");
        this.name = "OptimizerBusyError";
    }
}

export interface DeckOptimizerService {
    // Aborting `signal` (the client went away) stops the optimisation and frees the service.
    optimize(request: DeckOptimizeRequest, signal?: AbortSignal): Promise<DeckOptimizeResponse>;
}

// Rejects an optimisation that was aborted.
export class OptimizerAbortedError extends Error {
    constructor() {
        super("The deck optimisation was aborted");
        this.name = "OptimizerAbortedError";
    }
}

// Where the worker's code lives. Compiled (`dist/`), it is the `.js` file next to this one. Run from
// TypeScript (`npm run dev` with tsx, or the tests), the worker thread has no TypeScript loader of its own, so
// it starts from a small script that registers tsx and imports the `.ts` file.
export function startWorker(input: DeckWorkerInput): Worker {
    const resourceLimits = { maxOldGenerationSizeMb: WORKER_HEAP_MB };
    if (!import.meta.url.endsWith(".ts")) {
        return new Worker(new URL("./deck-optimizer-worker.js", import.meta.url), {
            workerData: input,
            resourceLimits,
        });
    }
    const tsxApi = pathToFileURL(createRequire(import.meta.url).resolve("tsx/esm/api")).href;
    const bootstrap =
        'const { workerData } = require("node:worker_threads");' +
        "import(workerData.tsxApi).then((api) => api.tsImport(workerData.entry, workerData.parent));";
    // A file URL, not a path: import() of a bare path breaks on Windows and on `#`, `?` or `%`.
    return new Worker(bootstrap, {
        eval: true,
        workerData: {
            ...input,
            tsxApi,
            entry: new URL("./deck-optimizer-worker.ts", import.meta.url).href,
            parent: import.meta.url,
        },
        resourceLimits,
    });
}

export interface WorkerRunnerOptions {
    // How long a worker may run before it is killed and the request fails.
    timeoutMillis?: number;
    // Starts the worker; replaceable so tests can start one that hangs or crashes.
    start?: (input: DeckWorkerInput) => Worker;
}

// Runs the optimisation in a worker thread, so the event loop stays free for other requests. The returned
// promise settles only once the worker has been terminated, so the service is never busy with a worker
// that is still winding down.
export function createWorkerRunner({
    timeoutMillis = MAX_SEARCH_MILLIS + WORKER_GRACE_MILLIS,
    start = startWorker,
}: WorkerRunnerOptions = {}): RunDeckOptimization {
    return (request, options, signal) =>
        new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(new OptimizerAbortedError());
                return;
            }
            const worker = start(options === undefined ? { request } : { request, options });
            let settled = false;
            const finish = (outcome: () => void): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
                void worker.terminate().then(outcome, outcome);
            };
            const onAbort = (): void => finish(() => reject(new OptimizerAbortedError()));
            const timer = setTimeout(
                () => finish(() => reject(new Error("The deck optimisation worker timed out"))),
                timeoutMillis
            );
            signal?.addEventListener("abort", onAbort, { once: true });
            worker.once("message", (output: DeckWorkerOutput) =>
                finish(() => (output.ok ? resolve(output.result) : reject(new Error(output.message))))
            );
            worker.once("error", (error) => finish(() => reject(error)));
            worker.once("exit", (code) =>
                finish(() => reject(new Error(`The deck optimisation worker exited with code ${code}`)))
            );
        });
}

export const runInWorker: RunDeckOptimization = createWorkerRunner();

// One optimisation at a time: a request that arrives while another runs gets `OptimizerBusyError`.
export function createDeckOptimizerService(run: RunDeckOptimization = runInWorker): DeckOptimizerService {
    let busy = false;
    return {
        async optimize(request, signal) {
            if (busy) throw new OptimizerBusyError();
            busy = true;
            try {
                return await run(request, undefined, signal);
            } finally {
                busy = false;
            }
        },
    };
}
