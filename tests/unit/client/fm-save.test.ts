import { describe, expect, it } from "vitest";
import { CARD_COUNT, MAX_SAVE_FILE_BYTES, parseFmSaves } from "../../../src/client/lib/fm-save.js";
import { DECK_SIZE } from "../../../src/shared/limits.js";

const BLOCK = 0x2000;
const FIRST_COPY = 0x200;
const SECOND_COPY = 0x880;

interface BlockOptions {
    deck?: number[];
    trunk?: Record<number, number>;
    // Writes only the second copy, leaving the first one as zeros (invalid).
    secondCopyOnly?: boolean;
    // A name-like marker written where the game keeps the player name, which must never be read.
    marker?: string;
}

function defaultDeck(seed = 0): number[] {
    return Array.from({ length: DECK_SIZE }, (_, i) => ((i * 7 + seed) % CARD_COUNT) + 1);
}

function writeCopy(block: Uint8Array, base: number, deck: number[], trunk: Record<number, number>): void {
    const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
    deck.forEach((id, i) => view.setUint16(base + i * 2, id, true));
    for (const [id, count] of Object.entries(trunk)) block[base + 0x50 + Number(id) - 1] = count;
}

function makeBlock(options: BlockOptions = {}): Uint8Array {
    const block = new Uint8Array(BLOCK);
    block[0] = 0x53;
    block[1] = 0x43;
    if (options.marker) block.set(new TextEncoder().encode(options.marker), 0x60);
    const deck = options.deck ?? defaultDeck();
    const trunk = options.trunk ?? { 296: 1, 397: 2, 722: 255 };
    if (!options.secondCopyOnly) writeCopy(block, FIRST_COPY, deck, trunk);
    writeCopy(block, SECOND_COPY, deck, trunk);
    return block;
}

// A raw card of `blocks` blocks of 8 KB, with the given blocks placed at their index.
function makeCard(placed: Record<number, Uint8Array>, blocks = 16): Uint8Array {
    const card = new Uint8Array(blocks * BLOCK);
    for (const [index, block] of Object.entries(placed)) card.set(block, Number(index) * BLOCK);
    return card;
}

function withPrefix(prefix: number, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(prefix + data.length);
    out.fill(0x11, 0, prefix);
    out.set(data, prefix);
    return out;
}

describe("parseFmSaves", () => {
    it("reads the deck and the sorted nonzero trunk of a single 8 KB block", () => {
        const result = parseFmSaves(makeBlock());
        expect(result).toEqual({
            ok: true,
            saves: [
                {
                    deck: defaultDeck(),
                    trunk: [
                        { id: 296, count: 1 },
                        { id: 397, count: 2 },
                        { id: 722, count: 255 },
                    ],
                },
            ],
        });
    });

    it("finds a save in block 3 of a raw 128 KB memory card", () => {
        const card = makeCard({ 3: makeBlock() }, 16);
        expect(card.length).toBe(128 * 1024);
        const result = parseFmSaves(card);
        expect(result.ok && result.saves).toHaveLength(1);
        expect(result.ok && result.saves[0]?.deck).toEqual(defaultDeck());
    });

    it("handles a 256 KB raw card", () => {
        const result = parseFmSaves(makeCard({ 20: makeBlock() }, 32));
        expect(result.ok && result.saves).toHaveLength(1);
    });

    it("handles a DexDrive-like header prefix of an unaligned size", () => {
        const result = parseFmSaves(withPrefix(0xf40, makeCard({ 1: makeBlock() }, 16)));
        expect(result.ok && result.saves).toHaveLength(1);
        expect(result.ok && result.saves[0]?.deck).toEqual(defaultDeck());
    });

    it("handles a 128-byte .mcs header", () => {
        const result = parseFmSaves(withPrefix(128, makeBlock()));
        expect(result.ok && result.saves).toHaveLength(1);
        expect(result.ok && result.saves[0]?.trunk).toHaveLength(3);
    });

    it("returns both saves of a card holding two, in file order", () => {
        const card = makeCard({
            2: makeBlock({ deck: defaultDeck(1) }),
            5: makeBlock({ deck: defaultDeck(2) }),
        });
        const result = parseFmSaves(card);
        expect(result.ok && result.saves.map((s) => s.deck)).toEqual([defaultDeck(1), defaultDeck(2)]);
    });

    it("does not report the same block twice", () => {
        const result = parseFmSaves(makeBlock());
        expect(result.ok && result.saves).toHaveLength(1);
    });

    it("falls back to the second copy when the first one is corrupted", () => {
        const result = parseFmSaves(makeBlock({ secondCopyOnly: true }));
        expect(result.ok && result.saves[0]?.deck).toEqual(defaultDeck());
        expect(result.ok && result.saves[0]?.trunk).toHaveLength(3);
    });

    it("falls back when the first copy has an id out of range", () => {
        const block = makeBlock();
        new DataView(block.buffer).setUint16(FIRST_COPY + 6, CARD_COUNT + 1, true);
        const result = parseFmSaves(block);
        expect(result.ok && result.saves[0]?.deck).toEqual(defaultDeck());
    });

    it("rejects a block whose two copies are both invalid", () => {
        const block = makeBlock();
        new DataView(block.buffer).setUint16(FIRST_COPY, 0, true);
        new DataView(block.buffer).setUint16(SECOND_COPY, 0, true);
        expect(parseFmSaves(block)).toEqual({ ok: false, error: "not-a-save" });
    });

    it("ignores a magic that leaves no room for a whole block", () => {
        const block = makeBlock();
        expect(parseFmSaves(block.subarray(0, BLOCK - 1))).toEqual({ ok: false, error: "not-a-save" });
    });

    it("reports an empty trunk as an empty list", () => {
        const result = parseFmSaves(makeBlock({ trunk: {} }));
        expect(result.ok && result.saves[0]?.trunk).toEqual([]);
    });

    it("never exposes the bytes where the player name lives", () => {
        const result = parseFmSaves(makeBlock({ marker: "SECRETNAME" }));
        expect(JSON.stringify(result)).not.toContain("SECRETNAME");
    });

    it("gives not-a-save for random bytes", () => {
        let seed = 7;
        const noise = new Uint8Array(BLOCK * 4).map(
            () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 8) & 0xff
        );
        expect(parseFmSaves(noise)).toEqual({ ok: false, error: "not-a-save" });
    });

    it("gives not-a-save for an empty file", () => {
        expect(parseFmSaves(new Uint8Array(0))).toEqual({ ok: false, error: "not-a-save" });
    });

    it("gives too-large for a file over the limit", () => {
        expect(parseFmSaves(new Uint8Array(MAX_SAVE_FILE_BYTES + 1))).toEqual({
            ok: false,
            error: "too-large",
        });
    });

    it("accepts a file of exactly the limit", () => {
        const result = parseFmSaves(new Uint8Array(MAX_SAVE_FILE_BYTES));
        expect(result).toEqual({ ok: false, error: "not-a-save" });
    });

    it("reads a view that does not start at the start of its buffer", () => {
        const padded = withPrefix(33, makeBlock());
        const result = parseFmSaves(padded.subarray(33));
        expect(result.ok && result.saves[0]?.deck).toEqual(defaultDeck());
    });
});
