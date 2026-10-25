import { EventEmitter } from "node:events";
import { Worker } from "node:worker_threads";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DeckOptimizeRequest, DeckOptimizeResponse } from "../../../../src/shared/types.js";
import { loadStore } from "../../../../src/server/data/store.js";
import { optimizeDeck } from "../../../../src/server/domain/deck-optimizer.js";
import {
    OptimizerAbortedError,
    OptimizerBusyError,
    createWorkerRunner,
    createDeckOptimizerService,
    runInWorker,
} from "../../../../src/server/workers/deck-optimizer-runner.js";
import { deckOf, monstersByAttack } from "../helpers/deck-fixtures.js";

// These tests score hundreds of thousands of hands; coverage instrumentation and parallel files slow them down.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let request: DeckOptimizeRequest;
let answer: DeckOptimizeResponse;

beforeAll(() => {
    loadStore();
    // No spare cards: the exhaustive search has nothing to try, so the answer is quick.
    request = { deck: deckOf(monstersByAttack().slice(0, 14), 3), trunk: [] };
    answer = optimizeDeck(request);
});

// A promise a test settles by hand, so "an optimisation is running" lasts exactly as long as the test needs.
function deferred() {
    let resolve!: (value: DeckOptimizeResponse) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<DeckOptimizeResponse>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe("createDeckOptimizerService", () => {
    it("runs the optimisation and returns its answer", async () => {
        const service = createDeckOptimizerService(async () => answer);
        await expect(service.optimize(request)).resolves.toBe(answer);
    });

    it("refuses a second optimisation while one runs, then accepts one again", async () => {
        const running = deferred();
        const service = createDeckOptimizerService(() => running.promise);
        const first = service.optimize(request);
        await expect(service.optimize(request)).rejects.toBeInstanceOf(OptimizerBusyError);
        running.resolve(answer);
        await expect(first).resolves.toBe(answer);
        await expect(service.optimize(request)).resolves.toBe(answer);
    });

    it("is free again after a failed optimisation, which passes its error on", async () => {
        const failure = new Error("worker died");
        let attempts = 0;
        const service = createDeckOptimizerService(async () => {
            if (++attempts === 1) throw failure;
            return answer;
        });
        await expect(service.optimize(request)).rejects.toBe(failure);
        await expect(service.optimize(request)).resolves.toBe(answer);
    });
});

describe("runInWorker", () => {
    it("computes in a worker thread the same answer as the function does in-process", async () => {
        await expect(runInWorker(request)).resolves.toEqual(answer);
    });

    it("rejects with the worker's error when the optimisation fails", async () => {
        const broken = { ...request, deck: request.deck.slice(0, 3) };
        await expect(runInWorker(broken)).rejects.toThrow(/at least 5 cards/);
    });

    it("passes options to the worker", async () => {
        const spent = await runInWorker(request, { exhaustiveMaxDecks: 0, maxMillis: 0 });
        expect(spent.method).toBe("local-search");
        expect(spent.truncated).toBe(true);
    });
});

// A worker thread running the given JavaScript, in place of the real optimiser.
function fakeWorker(code: string): () => Worker {
    return () => new Worker(code, { eval: true });
}

describe("createWorkerRunner", () => {
    it("kills a worker that does not answer in time and fails the request", async () => {
        const worker = new Worker("setInterval(() => {}, 1000);", { eval: true });
        const run = createWorkerRunner({ timeoutMillis: 150, start: () => worker });
        await expect(run(request)).rejects.toThrow(/timed out/);
        // The promise settles only after the worker is gone.
        expect(worker.threadId).toBe(-1);
    });

    it("fails the request when the worker crashes", async () => {
        const run = createWorkerRunner({ start: fakeWorker('throw new Error("boom");') });
        await expect(run(request)).rejects.toThrow(/boom/);
    });

    it("fails the request when the worker exits without answering", async () => {
        const run = createWorkerRunner({ start: fakeWorker("process.exit(3);") });
        await expect(run(request)).rejects.toThrow(/exited with code 3/);
    });

    it("stops the worker when the request is aborted, and does not start one for a request already aborted", async () => {
        const worker = new Worker("setInterval(() => {}, 1000);", { eval: true });
        const run = createWorkerRunner({ start: () => worker });
        const abort = new AbortController();
        const running = run(request, undefined, abort.signal);
        abort.abort();
        await expect(running).rejects.toBeInstanceOf(OptimizerAbortedError);

        let started = 0;
        const never = createWorkerRunner({
            start: () => {
                started++;
                return worker;
            },
        });
        await expect(never(request, undefined, AbortSignal.abort())).rejects.toBeInstanceOf(
            OptimizerAbortedError
        );
        expect(started).toBe(0);
    });

    it("keeps the service busy until the worker has been terminated", async () => {
        const events = new EventEmitter() as EventEmitter & { terminate: () => Promise<number> };
        let finishTerminating!: () => void;
        events.terminate = () => new Promise<number>((resolve) => (finishTerminating = () => resolve(0)));
        const service = createDeckOptimizerService(
            createWorkerRunner({ start: () => events as unknown as Worker })
        );
        const abort = new AbortController();
        const first = service.optimize(request, abort.signal);
        abort.abort();
        // Aborted, but the worker is still winding down.
        await expect(service.optimize(request)).rejects.toBeInstanceOf(OptimizerBusyError);
        finishTerminating();
        await expect(first).rejects.toBeInstanceOf(OptimizerAbortedError);
    });
});

describe("createDeckOptimizerService and aborting", () => {
    it("passes the abort signal on to the optimisation", async () => {
        let received: AbortSignal | undefined;
        const service = createDeckOptimizerService(async (_request, _options, signal) => {
            received = signal;
            return answer;
        });
        const abort = new AbortController();
        await service.optimize(request, abort.signal);
        expect(received).toBe(abort.signal);
    });
});
