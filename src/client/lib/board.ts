import { ZONE_SIZE } from "../../shared/limits.js";
import type { TerrainId } from "../../shared/terrains.js";
import type { BoardZone, SlotRef } from "../../shared/types.js";

// The board of the calculator: a hand, a monster zone and a spell/trap zone with ZONE_SIZE slots each. These
// helpers hold the rules the page applies (what a zone takes, what a request carries, where a fusion goes)
// so they can be tested without a browser.

// Visual order, which is also the order the keyboard walks and the order requests and saved boards use.
export const ZONES: readonly BoardZone[] = ["hand", "monster", "spell"];

export const BOARD_SIZE = ZONE_SIZE * ZONES.length;

// What a slot holds as far as the calculator is concerned: a card the index knows, or nothing.
export interface SlotCard {
    id: number;
    isMonster: boolean;
}

export type ZoneRecord<T> = Record<BoardZone, T[]>;

// The hand takes any card (R6), the monster zone only monsters and the spell/trap zone only the rest.
export function fitsZone(zone: BoardZone, isMonster: boolean): boolean {
    if (zone === "monster") return isMonster;
    if (zone === "spell") return !isMonster;
    return true;
}

export function emptyZones<T>(fill: T): ZoneRecord<T> {
    const make = (): T[] => Array.from({ length: ZONE_SIZE }, () => fill);
    return { hand: make(), monster: make(), spell: make() };
}

export interface BoardRequest {
    handIds: number[];
    monsterIds: number[];
    spellIds: number[];
    // The field terrain the answer is ranked on; left out when there is none.
    terrain?: TerrainId;
}

// What was sent for a board. The server numbers cards by their place in the arrays it receives, which hold
// only the cards sent, so `slots[zone][i]` is the slot that sent index i stands for.
export interface SentBoard {
    request: BoardRequest;
    slots: Record<BoardZone, number[]>;
    // Cards sent in all.
    count: number;
    // Names this exact request, slot positions and terrain included: the same ids in other slots, or on another
    // terrain, give another key.
    key: string;
}

// A card that does not fit its zone, an empty slot and a name the index lacks are all `null` and are not
// sent (D5): the server takes no empty entries, and the slot map keeps the positions of the ones it takes. The
// terrain goes in the request only when there is one (E14).
export function buildBoardRequest(
    cards: Record<BoardZone, ReadonlyArray<SlotCard | null>>,
    terrain: TerrainId | null = null
): SentBoard {
    const ids: Record<BoardZone, number[]> = { hand: [], monster: [], spell: [] };
    const slots: Record<BoardZone, number[]> = { hand: [], monster: [], spell: [] };
    for (const zone of ZONES) {
        cards[zone].forEach((card, slot) => {
            if (card === null || !fitsZone(zone, card.isMonster)) return;
            ids[zone].push(card.id);
            slots[zone].push(slot);
        });
    }
    const cardsKey = ZONES.map((zone) => ids[zone].map((id, i) => `${slots[zone][i]}:${id}`).join(",")).join(
        "|"
    );
    return {
        request: {
            handIds: ids.hand,
            monsterIds: ids.monster,
            spellIds: ids.spell,
            ...(terrain === null ? {} : { terrain }),
        },
        slots,
        count: ids.hand.length + ids.monster.length + ids.spell.length,
        key: terrain === null ? cardsKey : `${cardsKey}@${terrain}`,
    };
}

// The slot a reference of the answer points at, or null when it points at nothing that was sent.
export function slotOfRef(sent: SentBoard, ref: SlotRef): number | null {
    return sent.slots[ref.zone][ref.index] ?? null;
}

// Where the user sees a slot: its place in the zone from 1 to 5, counting the empty slots before it. It is not
// the index in the array that was sent, which skips them. Null when the reference points at nothing sent.
export function boardPosition(sent: SentBoard, ref: SlotRef): number | null {
    const slot = slotOfRef(sent, ref);
    return slot === null ? null : slot + 1;
}

// The same for the field monster a chain starts from, which the answer names by its index in `monsterIds`.
export function fieldPosition(sent: SentBoard, fieldIndex: number): number | null {
    return boardPosition(sent, { zone: "monster", index: fieldIndex });
}

export interface SlotAddress {
    zone: BoardZone;
    slot: number;
}

// What applying a fusion does to the board: the result lands in `place` and every slot in `clear` is emptied.
export type FusionPlan =
    | { kind: "apply"; place: SlotAddress; clear: SlotAddress[] }
    | { kind: "zone-full" }
    | { kind: "stale" };

export interface FusionToApply {
    from: readonly [SlotRef, SlotRef];
    // The ids of the two operands, in the order of `from`.
    operandIds: readonly [number, number];
    resultIsMonster: boolean;
}

// D6. The operands come from the answer's `from` references, mapped back through what was sent, and are
// checked against the board as it is now: an answer for a board that has changed applies nothing.
//   - One operand on the field: the result replaces it there and the hand slot is emptied.
//   - Both in the hand: the result goes to the first empty monster slot and both hand slots are emptied; with
//     the zone full nothing changes.
// A result that is not a monster cannot go to the monster zone (R6), so it takes the place of the hand card
// instead and the other operand is spent.
export function planFusion(
    fusion: FusionToApply,
    sent: SentBoard,
    now: Record<BoardZone, ReadonlyArray<number | null>>,
    monsterSlotFree: ReadonlyArray<boolean>
): FusionPlan {
    const operands: SlotAddress[] = [];
    for (const [i, ref] of fusion.from.entries()) {
        const slot = slotOfRef(sent, ref);
        const expected = fusion.operandIds[i];
        if (slot === null || ref.zone === "spell" || now[ref.zone][slot] !== expected)
            return { kind: "stale" };
        operands.push({ zone: ref.zone, slot });
    }
    const [first, second] = operands;
    if (!first || !second) return { kind: "stale" };
    const handOperands = operands.filter((operand) => operand.zone === "hand");
    const fieldOperands = operands.filter((operand) => operand.zone === "monster");
    const handFirst = handOperands[0];
    if (handOperands.length === 0 || fieldOperands.length === 2 || !handFirst) return { kind: "stale" };

    if (!fusion.resultIsMonster)
        return { kind: "apply", place: handFirst, clear: operands.filter((o) => o !== handFirst) };

    const field = fieldOperands[0];
    if (field) return { kind: "apply", place: field, clear: handOperands };

    const free = monsterSlotFree.findIndex((isFree) => isFree);
    if (free === -1) return { kind: "zone-full" };
    return { kind: "apply", place: { zone: "monster", slot: free }, clear: handOperands };
}
