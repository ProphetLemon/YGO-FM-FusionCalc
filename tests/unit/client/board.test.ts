import { describe, expect, it } from "vitest";
import {
    BOARD_SIZE,
    ZONES,
    boardPosition,
    buildBoardRequest,
    emptyZones,
    fieldPosition,
    fitsZone,
    planFusion,
    slotOfRef,
    type SlotCard,
} from "../../../src/client/lib/board.js";
import type { BoardZone, SlotRef } from "../../../src/shared/types.js";

const monster = (id: number): SlotCard => ({ id, isMonster: true });
const spell = (id: number): SlotCard => ({ id, isMonster: false });
const none = (): null[] => [null, null, null, null, null];

function board(
    parts: Partial<Record<BoardZone, Array<SlotCard | null>>>
): Record<BoardZone, Array<SlotCard | null>> {
    return { hand: none(), monster: none(), spell: none(), ...parts };
}

describe("the shape of the board", () => {
    it("has three zones of five slots, in the order the keyboard walks them", () => {
        expect(ZONES).toEqual(["hand", "monster", "spell"]);
        expect(BOARD_SIZE).toBe(15);
    });

    it("builds an empty record with a fresh list per zone", () => {
        const zones = emptyZones<number | null>(null);

        expect(zones.hand).toEqual(none());
        expect(zones.monster).toEqual(none());
        expect(zones.spell).toEqual(none());
        expect(zones.hand).not.toBe(zones.monster);
    });
});

describe("fitsZone", () => {
    it.each([
        ["hand", true, true],
        ["hand", false, true],
        ["monster", true, true],
        ["monster", false, false],
        ["spell", true, false],
        ["spell", false, true],
    ] as const)("%s zone with isMonster=%s fits: %s", (zone, isMonster, fits) => {
        expect(fitsZone(zone, isMonster)).toBe(fits);
    });
});

describe("buildBoardRequest", () => {
    it("sends the three arrays, empty when the board is", () => {
        const sent = buildBoardRequest(board({}));

        expect(sent.request).toEqual({ handIds: [], monsterIds: [], spellIds: [] });
        expect(sent.count).toBe(0);
    });

    it("leaves empty slots out and maps each sent index back to its slot", () => {
        const sent = buildBoardRequest(
            board({
                hand: [null, monster(2), null, spell(7), monster(8)],
                monster: [monster(3), null, null, monster(4), null],
                spell: [null, null, null, null, spell(9)],
            })
        );

        expect(sent.request).toEqual({ handIds: [2, 7, 8], monsterIds: [3, 4], spellIds: [9] });
        expect(sent.slots).toEqual({ hand: [1, 3, 4], monster: [0, 3], spell: [4] });
        expect(sent.count).toBe(6);
    });

    it("does not send a non-monster in a monster slot or a monster in a spell slot (D5)", () => {
        const sent = buildBoardRequest(
            board({
                monster: [spell(7), monster(3), null, null, null],
                spell: [monster(2), spell(9), null, null, null],
            })
        );

        expect(sent.request).toEqual({ handIds: [], monsterIds: [3], spellIds: [9] });
        expect(sent.slots).toEqual({ hand: [], monster: [1], spell: [1] });
    });

    it("sends any card from the hand", () => {
        const sent = buildBoardRequest(board({ hand: [monster(2), spell(7), null, null, null] }));

        expect(sent.request.handIds).toEqual([2, 7]);
    });

    it("keeps the same card in more than one slot", () => {
        const sent = buildBoardRequest(board({ hand: [monster(2), monster(2), null, null, null] }));

        expect(sent.request.handIds).toEqual([2, 2]);
        expect(sent.slots.hand).toEqual([0, 1]);
    });

    it("gives another key to the same cards in other slots, so their answers are asked for again", () => {
        const first = buildBoardRequest(board({ hand: [monster(2), monster(8), null, null, null] }));
        const moved = buildBoardRequest(board({ hand: [null, monster(2), monster(8), null, null] }));
        const same = buildBoardRequest(board({ hand: [monster(2), monster(8), null, null, null] }));

        expect(moved.request).toEqual(first.request);
        expect(moved.key).not.toBe(first.key);
        expect(same.key).toBe(first.key);
    });

    it("gives another key to the same card in another zone", () => {
        const inHand = buildBoardRequest(board({ hand: [monster(2), null, null, null, null] }));
        const onField = buildBoardRequest(board({ monster: [monster(2), null, null, null, null] }));

        expect(onField.key).not.toBe(inHand.key);
    });
});

describe("slotOfRef", () => {
    const sent = buildBoardRequest(
        board({
            hand: [null, monster(2), null, spell(7), null],
            monster: [null, null, monster(3), null, null],
        })
    );

    it("maps the index of a sent array back to the slot", () => {
        expect(slotOfRef(sent, { zone: "hand", index: 0 })).toBe(1);
        expect(slotOfRef(sent, { zone: "hand", index: 1 })).toBe(3);
        expect(slotOfRef(sent, { zone: "monster", index: 0 })).toBe(2);
    });

    it("gives null for an index nothing was sent at", () => {
        expect(slotOfRef(sent, { zone: "hand", index: 2 })).toBeNull();
        expect(slotOfRef(sent, { zone: "spell", index: 0 })).toBeNull();
    });
});

describe("the board position shown on a result tag", () => {
    // Slots 1 and 3 of the hand are filled (a monster and a non-monster both fit it) and so is slot 4 of the
    // spell zone, so the arrays sent hold fewer cards than the board has slots in front of them.
    const sent = buildBoardRequest(
        board({
            hand: [null, monster(2), null, spell(7), null],
            monster: [null, null, monster(3), null, monster(4)],
            spell: [null, null, null, spell(8), null],
        })
    );

    it("counts the slots from 1 and skips none of them, empty or not", () => {
        // The array sent has the card at index 0, but it stands in the second slot.
        expect(boardPosition(sent, { zone: "hand", index: 0 })).toBe(2);
        expect(boardPosition(sent, { zone: "hand", index: 1 })).toBe(4);
        expect(boardPosition(sent, { zone: "monster", index: 0 })).toBe(3);
        expect(boardPosition(sent, { zone: "monster", index: 1 })).toBe(5);
        expect(boardPosition(sent, { zone: "spell", index: 0 })).toBe(4);
    });

    it("is null for a reference that points at nothing sent", () => {
        expect(boardPosition(sent, { zone: "hand", index: 2 })).toBeNull();
        expect(boardPosition(sent, { zone: "spell", index: 1 })).toBeNull();
    });

    it("places the field monster of a chain by its index in the monster array sent", () => {
        expect(fieldPosition(sent, 0)).toBe(3);
        expect(fieldPosition(sent, 1)).toBe(5);
        expect(fieldPosition(sent, 2)).toBeNull();
    });

    it("keeps a card that is sent in the first slot at position 1", () => {
        const first = buildBoardRequest(board({ monster: [monster(1), null, null, null, null] }));
        expect(fieldPosition(first, 0)).toBe(1);
    });

    it("ignores a card that does not fit its zone when counting indexes, not when counting positions", () => {
        // A monster in the spell zone is not sent: the spell card after it is index 0 but position 3.
        const typed = buildBoardRequest(board({ spell: [monster(9), null, spell(5), null, null] }));
        expect(boardPosition(typed, { zone: "spell", index: 0 })).toBe(3);
    });
});

describe("planFusion", () => {
    const hand = (index: number): SlotRef => ({ zone: "hand", index });
    const field = (index: number): SlotRef => ({ zone: "monster", index });
    const free = (...taken: number[]): boolean[] => [0, 1, 2, 3, 4].map((slot) => !taken.includes(slot));

    // Hand: slot 1 holds card 2 and slot 3 holds card 8. Monster zone: slot 2 holds card 3.
    const cards = board({
        hand: [null, monster(2), null, monster(8), null],
        monster: [null, null, monster(3), null, null],
    });
    const sent = buildBoardRequest(cards);
    const now = { hand: [null, 2, null, 8, null], monster: [null, null, 3, null, null], spell: none() };

    it("puts the result in the first empty monster slot and empties both hand slots", () => {
        const plan = planFusion(
            { from: [hand(0), hand(1)], operandIds: [2, 8], resultIsMonster: true },
            sent,
            now,
            free(2)
        );

        expect(plan).toEqual({
            kind: "apply",
            place: { zone: "monster", slot: 0 },
            clear: [
                { zone: "hand", slot: 1 },
                { zone: "hand", slot: 3 },
            ],
        });
    });

    it("replaces the field monster with the result and empties only the hand slot", () => {
        const plan = planFusion(
            { from: [hand(0), field(0)], operandIds: [2, 3], resultIsMonster: true },
            sent,
            now,
            free(2)
        );

        expect(plan).toEqual({
            kind: "apply",
            place: { zone: "monster", slot: 2 },
            clear: [{ zone: "hand", slot: 1 }],
        });
    });

    it("works the same when the field monster is the first operand", () => {
        const plan = planFusion(
            { from: [field(0), hand(1)], operandIds: [3, 8], resultIsMonster: true },
            sent,
            now,
            free(2)
        );

        expect(plan).toEqual({
            kind: "apply",
            place: { zone: "monster", slot: 2 },
            clear: [{ zone: "hand", slot: 3 }],
        });
    });

    it("changes nothing when the monster zone is full and both operands are in the hand", () => {
        const plan = planFusion(
            { from: [hand(0), hand(1)], operandIds: [2, 8], resultIsMonster: true },
            sent,
            now,
            free(0, 1, 2, 3, 4)
        );

        expect(plan).toEqual({ kind: "zone-full" });
    });

    it("does not need a free monster slot when an operand is on the field", () => {
        const plan = planFusion(
            { from: [hand(0), field(0)], operandIds: [2, 3], resultIsMonster: true },
            sent,
            now,
            free(0, 1, 2, 3, 4)
        );

        expect(plan.kind).toBe("apply");
    });

    it("skips a monster slot that is taken by a name the board does not send", () => {
        const plan = planFusion(
            { from: [hand(0), hand(1)], operandIds: [2, 8], resultIsMonster: true },
            sent,
            now,
            free(0, 2)
        );

        expect(plan).toMatchObject({ kind: "apply", place: { zone: "monster", slot: 1 } });
    });

    it("keeps a result that is not a monster in the hand, where the first hand card was", () => {
        const plan = planFusion(
            { from: [hand(0), hand(1)], operandIds: [2, 8], resultIsMonster: false },
            sent,
            now,
            free(0, 1, 2, 3, 4)
        );

        expect(plan).toEqual({
            kind: "apply",
            place: { zone: "hand", slot: 1 },
            clear: [{ zone: "hand", slot: 3 }],
        });
    });

    it("puts a result that is not a monster in the hand slot and spends the field monster", () => {
        const plan = planFusion(
            { from: [field(0), hand(1)], operandIds: [3, 8], resultIsMonster: false },
            sent,
            now,
            free(2)
        );

        expect(plan).toEqual({
            kind: "apply",
            place: { zone: "hand", slot: 3 },
            clear: [{ zone: "monster", slot: 2 }],
        });
    });

    it("is stale when a slot no longer holds the card the answer was made for", () => {
        const changed = { ...now, hand: [null, 2, null, 13, null] };

        const plan = planFusion(
            { from: [hand(0), hand(1)], operandIds: [2, 8], resultIsMonster: true },
            sent,
            changed,
            free(2)
        );

        expect(plan).toEqual({ kind: "stale" });
    });

    it("is stale when a reference points at nothing that was sent", () => {
        const plan = planFusion(
            { from: [hand(0), hand(7)], operandIds: [2, 8], resultIsMonster: true },
            sent,
            now,
            free(2)
        );

        expect(plan).toEqual({ kind: "stale" });
    });

    it("is stale for operands the rules never pair: two field cards or a spell/trap card", () => {
        const twoField = planFusion(
            { from: [field(0), field(0)], operandIds: [3, 3], resultIsMonster: true },
            sent,
            now,
            free(2)
        );
        const withSpell = planFusion(
            { from: [hand(0), { zone: "spell", index: 0 }], operandIds: [2, 9], resultIsMonster: true },
            sent,
            { ...now, spell: [9, null, null, null, null] },
            free(2)
        );

        expect(twoField).toEqual({ kind: "stale" });
        expect(withSpell).toEqual({ kind: "stale" });
    });
});
