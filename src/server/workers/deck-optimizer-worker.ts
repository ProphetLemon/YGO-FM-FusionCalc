import { parentPort, workerData } from "node:worker_threads";
import { loadStore } from "../data/store.js";
import { optimizeDeck } from "../domain/deck-optimizer.js";
import type { DeckWorkerInput, DeckWorkerOutput } from "./deck-optimizer-runner.js";

// Entry point of the worker thread that runs one deck optimisation. It loads its own copy of the store (a
// thread shares no module state), optimises, and posts the result or the failure back.
function run(): DeckWorkerOutput {
    try {
        loadStore();
        const { request, options } = workerData as DeckWorkerInput;
        return { ok: true, result: optimizeDeck(request, options) };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
}

parentPort?.postMessage(run());
