import { describe, expect, it } from "vitest";
import { createLatest } from "../../../src/client/lib/latest.js";

interface Deferred {
    promise: Promise<void>;
    resolve: () => void;
}

function deferred(): Deferred {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

describe("createLatest", () => {
    it("treats a run as current until something replaces it", () => {
        const latest = createLatest();
        const run = latest.begin();
        expect(run.isCurrent()).toBe(true);
        expect(run.signal.aborted).toBe(false);
    });

    it("makes the earlier run stale and aborts its signal when a newer one begins", () => {
        const latest = createLatest();
        const first = latest.begin();
        const second = latest.begin();
        expect(first.isCurrent()).toBe(false);
        expect(first.signal.aborted).toBe(true);
        expect(second.isCurrent()).toBe(true);
        expect(second.signal.aborted).toBe(false);
    });

    it("only keeps the last of several runs current", () => {
        const latest = createLatest();
        const runs = [latest.begin(), latest.begin(), latest.begin()];
        expect(runs.map((run) => run.isCurrent())).toEqual([false, false, true]);
    });

    it("cancel makes the running run stale and aborts its signal", () => {
        const latest = createLatest();
        const run = latest.begin();
        latest.cancel();
        expect(run.isCurrent()).toBe(false);
        expect(run.signal.aborted).toBe(true);
    });

    it("cancel with nothing running does nothing", () => {
        const latest = createLatest();
        expect(() => latest.cancel()).not.toThrow();
        expect(latest.begin().isCurrent()).toBe(true);
    });

    it("cancelling twice keeps working", () => {
        const latest = createLatest();
        latest.begin();
        latest.cancel();
        expect(() => latest.cancel()).not.toThrow();
    });

    it("does not affect a run that begins after a cancel", () => {
        const latest = createLatest();
        const before = latest.begin();
        latest.cancel();
        const after = latest.begin();
        expect(before.isCurrent()).toBe(false);
        expect(after.isCurrent()).toBe(true);
        expect(after.signal.aborted).toBe(false);
    });

    it("keeps guards independent from each other", () => {
        const lookups = createLatest();
        const refreshes = createLatest();
        const lookup = lookups.begin();
        const refresh = refreshes.begin();
        refreshes.begin();
        lookups.cancel();
        expect(lookup.isCurrent()).toBe(false);
        expect(refresh.isCurrent()).toBe(false);
        expect(refreshes.begin().isCurrent()).toBe(true);
        expect(lookups.begin().isCurrent()).toBe(true);
    });

    it("lets only the newest of overlapping async runs apply, whatever order they settle in", async () => {
        const latest = createLatest();
        const applied: string[] = [];
        const gates = { first: deferred(), second: deferred() };
        const runWith = async (label: keyof typeof gates): Promise<void> => {
            const run = latest.begin();
            await gates[label].promise;
            if (run.isCurrent()) applied.push(label);
        };

        const first = runWith("first");
        const second = runWith("second");
        gates.second.resolve();
        gates.first.resolve();
        await Promise.all([first, second]);

        expect(applied).toEqual(["second"]);
    });

    it("drops the answer of a run cancelled while it waited", async () => {
        const latest = createLatest();
        const applied: string[] = [];
        const gate = deferred();
        const pending = (async (): Promise<void> => {
            const run = latest.begin();
            await gate.promise;
            if (run.isCurrent()) applied.push("late");
        })();

        latest.cancel();
        gate.resolve();
        await pending;

        expect(applied).toEqual([]);
    });
});
