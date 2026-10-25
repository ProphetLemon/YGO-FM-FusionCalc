import { describe, expect, it } from "vitest";
import { ApiError } from "../../../src/client/lib/api.js";
import {
    buildDeckRequest,
    classifyDeckFailure,
    formatNumber,
    parseRetryAfter,
    readSaveFile,
    statRows,
    summarizeSave,
    verdictOf,
} from "../../../src/client/lib/deck-view.js";
import { MAX_SAVE_FILE_BYTES, type FmSave } from "../../../src/client/lib/fm-save.js";
import type { DeckStats } from "../../../src/shared/types.js";

const SAVE: FmSave = {
    deck: Array.from({ length: 40 }, (_, i) => i + 1),
    trunk: [
        { id: 100, count: 2 },
        { id: 200, count: 1 },
    ],
};

function fileOf(bytes: Uint8Array): { size: number; arrayBuffer(): Promise<ArrayBuffer> } {
    return {
        size: bytes.length,
        arrayBuffer: async () =>
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    };
}

describe("readSaveFile", () => {
    it("refuses a file over the limit without reading it", async () => {
        let read = false;
        const file = {
            size: MAX_SAVE_FILE_BYTES + 1,
            arrayBuffer: async () => {
                read = true;
                return new ArrayBuffer(0);
            },
        };

        await expect(readSaveFile(file)).resolves.toEqual({ ok: false, error: "too-large" });
        expect(read).toBe(false);
    });

    it("says not-a-save for a file that holds no save", async () => {
        await expect(readSaveFile(fileOf(new Uint8Array(100)))).resolves.toEqual({
            ok: false,
            error: "not-a-save",
        });
    });

    it("says unreadable when the browser cannot read the file", async () => {
        const file = { size: 10, arrayBuffer: () => Promise.reject(new Error("denied")) };

        await expect(readSaveFile(file)).resolves.toEqual({ ok: false, error: "unreadable" });
    });

    it("finds the saves of a file that has them", async () => {
        const block = new Uint8Array(0x2000);
        block[0] = 0x53;
        block[1] = 0x43;
        const view = new DataView(block.buffer);
        for (let i = 0; i < 40; i++) view.setUint16(0x200 + i * 2, i + 1, true);
        block[0x250 + 99] = 3;

        const result = await readSaveFile(fileOf(block));

        expect(result).toEqual({
            ok: true,
            saves: [{ deck: SAVE.deck, trunk: [{ id: 100, count: 3 }] }],
        });
    });
});

describe("summarizeSave", () => {
    it("counts the deck, every spare copy and the different spare cards", () => {
        expect(summarizeSave(SAVE)).toEqual({ deckCards: 40, spareCards: 3, spareKinds: 2 });
    });

    it("counts an empty trunk as nothing", () => {
        expect(summarizeSave({ ...SAVE, trunk: [] })).toEqual({
            deckCards: 40,
            spareCards: 0,
            spareKinds: 0,
        });
    });
});

describe("buildDeckRequest", () => {
    it("carries only the deck, the trunk and the option", () => {
        const withExtra = { ...SAVE, name: "PLAYER", trunk: [{ id: 100, count: 2, name: "x" }] };

        const request = buildDeckRequest(withExtra as FmSave, false);

        expect(request).toEqual({ deck: SAVE.deck, trunk: [{ id: 100, count: 2 }], keepNonMonsters: false });
        expect(JSON.stringify(request)).not.toContain("PLAYER");
    });

    it("sends keepNonMonsters at the top level, true when asked", () => {
        expect(buildDeckRequest(SAVE, true).keepNonMonsters).toBe(true);
    });

    it("copies the arrays, so the save cannot change under a request", () => {
        const request = buildDeckRequest(SAVE, true);
        request.deck[0] = 999;
        expect(SAVE.deck[0]).toBe(1);
    });
});

describe("verdictOf", () => {
    const swaps = [{}] as never[];

    it.each([
        ["certified", { certified: true, truncated: false, swaps }, false, "certified"],
        [
            "certified with the keep option on",
            { certified: true, truncated: false, swaps },
            true,
            "certified-keep",
        ],
        ["a local search that finished", { certified: false, truncated: false, swaps }, true, "local"],
        ["a search that ran out of time", { certified: false, truncated: true, swaps }, true, "truncated"],
        [
            "an answer that is both certified and truncated",
            { certified: true, truncated: true, swaps },
            false,
            "truncated",
        ],
    ] as const)("%s says %s", (_label, answer, keep, claim) => {
        expect(verdictOf(answer, keep)).toEqual({ claim, noSwaps: false });
    });

    it("marks an answer without swaps", () => {
        expect(verdictOf({ certified: false, truncated: false, swaps: [] }, true)).toEqual({
            claim: "local",
            noSwaps: true,
        });
    });
});

describe("statRows", () => {
    const current: DeckStats = {
        averageBestAtk: 1316.29,
        share1500: 0.3313,
        share2000: 0.1199,
        shareDead: 0.281,
    };
    const recommended: DeckStats = {
        averageBestAtk: 1420.9,
        share1500: 0.443,
        share2000: 0.186,
        shareDead: 0.203,
    };

    it("turns shares into percentages and the change into points", () => {
        const [average, share1500, , dead] = statRows(current, recommended);

        expect(average).toMatchObject({ unit: "atk", direction: "better", delta: 104.6 });
        expect(share1500).toMatchObject({ unit: "percent", direction: "better" });
        expect(share1500?.current).toBeCloseTo(33.13, 5);
        expect(share1500?.delta).toBe(11.2);
        expect(dead).toMatchObject({ direction: "better", delta: -7.8 });
    });

    it("counts a rise in dead hands as worse", () => {
        const [, , , dead] = statRows(current, { ...current, shareDead: 0.35 });
        expect(dead?.direction).toBe("worse");
    });

    it("calls a change that rounds to zero the same", () => {
        const rows = statRows(current, { ...current, averageBestAtk: current.averageBestAtk + 0.04 });
        expect(rows[0]).toMatchObject({ delta: 0, direction: "same" });
    });
});

describe("formatNumber", () => {
    it("uses one decimal and the locale's separator", () => {
        expect(formatNumber(1420.84, "en")).toBe("1,420.8");
        expect(formatNumber(1420.84, "es")).toBe("1420,8");
    });

    it("signs a change only when asked", () => {
        expect(formatNumber(4.5, "en", true)).toBe("+4.5");
        expect(formatNumber(-4.5, "en", true)).toBe("-4.5");
        expect(formatNumber(4.5, "en")).toBe("4.5");
    });
});

describe("parseRetryAfter", () => {
    it.each([
        ["5", 5],
        [" 12 ", 12],
        ["0", 1],
        ["900", 60],
        [undefined, 5],
        ["soon", 5],
        ["Wed, 21 Oct 2026 07:28:00 GMT", 5],
        ["-3", 5],
    ])("reads %j as %i seconds", (header, seconds) => {
        expect(parseRetryAfter(header)).toBe(seconds);
    });
});

describe("classifyDeckFailure", () => {
    it("tells a busy answer apart and keeps its wait", () => {
        const error = new ApiError(503, "busy", "busy", "7");
        expect(classifyDeckFailure(error)).toEqual({ kind: "busy", retryAfter: 7 });
    });

    it("falls back to the default wait when a busy answer has no header", () => {
        expect(classifyDeckFailure(new ApiError(503, "busy", "busy"))).toEqual({
            kind: "busy",
            retryAfter: 5,
        });
    });

    it.each([
        [400, "invalid-deck"],
        [400, "unknown-card"],
        [413, "payload-too-large"],
    ])("calls a %i %s a rejected deck", (status, code) => {
        expect(classifyDeckFailure(new ApiError(status, "x", code))).toEqual({ kind: "rejected" });
    });

    it.each([
        ["a 500", new ApiError(500, "x", "internal-error")],
        ["a 503 that is not busy", new ApiError(503, "x")],
        ["a network failure", new TypeError("Failed to fetch")],
    ])("calls %s a failure to try again", (_label, error) => {
        expect(classifyDeckFailure(error)).toEqual({ kind: "failed" });
    });
});
