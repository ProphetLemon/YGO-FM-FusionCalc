// Reads Yu-Gi-Oh! Forbidden Memories saves from the raw bytes of a PlayStation save file. The layout was
// checked on a real save: a block is 0x2000 bytes and starts with the ASCII magic "SC", and the game data is
// stored twice inside it. Only the deck and the trunk are read; the player name is never touched.

import { DECK_SIZE } from "../../shared/limits.js";

// Largest file accepted. A memory card is 128 KB and a DexDrive or emulator dump adds a small header, so
// 1 MB leaves room while refusing anything that is clearly not a save.
export const MAX_SAVE_FILE_BYTES = 1024 * 1024;

// Cards in the game; ids run from 1 to this number.
export const CARD_COUNT = 722;

const BLOCK_SIZE = 0x2000;
const MAGIC_0 = 0x53; // "S"
const MAGIC_1 = 0x43; // "C"
// The game data is stored twice in a block: the trunk follows the deck by 0x50 bytes in each copy.
const COPY_OFFSETS = [0x200, 0x880] as const;
const TRUNK_DELTA = 0x50;

export interface SaveTrunkEntry {
    id: number;
    count: number;
}

export interface FmSave {
    // The 40 card ids of the deck, in the order the game stores them.
    deck: number[];
    // Spare cards, sorted by id, only those owned. They exclude the cards in the deck.
    trunk: SaveTrunkEntry[];
}

export type ParseSavesResult =
    | { ok: true; saves: FmSave[] }
    | { ok: false; error: "not-a-save" | "too-large" };

function readCopy(view: DataView, bytes: Uint8Array, base: number): FmSave | null {
    const deck: number[] = [];
    for (let i = 0; i < DECK_SIZE; i++) {
        const id = view.getUint16(base + i * 2, true);
        if (id < 1 || id > CARD_COUNT) return null;
        deck.push(id);
    }
    const trunkStart = base + TRUNK_DELTA;
    const trunk: SaveTrunkEntry[] = [];
    for (let i = 0; i < CARD_COUNT; i++) {
        const count = bytes[trunkStart + i];
        if (count !== undefined && count > 0) trunk.push({ id: i + 1, count });
    }
    return { deck, trunk };
}

function readBlock(view: DataView, bytes: Uint8Array, blockStart: number): FmSave | null {
    for (const copy of COPY_OFFSETS) {
        const save = readCopy(view, bytes, blockStart + copy);
        if (save) return save;
    }
    return null;
}

// Finds every Forbidden Memories save in a file. The block is located by its magic instead of by the file
// extension or a fixed offset, so a single block, an .mcs or .gme export and a raw memory card all work.
export function parseFmSaves(bytes: Uint8Array): ParseSavesResult {
    if (bytes.length > MAX_SAVE_FILE_BYTES) return { ok: false, error: "too-large" };
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const saves: FmSave[] = [];
    for (let offset = 0; offset + BLOCK_SIZE <= bytes.length; offset++) {
        if (bytes[offset] !== MAGIC_0 || bytes[offset + 1] !== MAGIC_1) continue;
        const save = readBlock(view, bytes, offset);
        if (!save) continue;
        saves.push(save);
        // The block is consumed, so the same save is not found again from inside its own data.
        offset += BLOCK_SIZE - 1;
    }
    return saves.length > 0 ? { ok: true, saves } : { ok: false, error: "not-a-save" };
}
