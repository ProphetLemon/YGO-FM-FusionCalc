import { describe, expect, it } from "vitest";
import { operandOrigins } from "../../../src/client/components/chain-panel.js";
import type { CardSummary, ChainResult } from "../../../src/shared/types.js";

function card(id: number): CardSummary {
    return { id, name: `Card ${id}` } as CardSummary;
}

function chain(steps: Array<[number, number, number]>, fieldIndex?: number): ChainResult {
    const made = steps.map(([card1, card2, result]) => ({
        card1: card(card1),
        card2: card(card2),
        result: card(result),
    }));
    const last = made[made.length - 1];
    return {
        steps: made,
        finalCard: last ? last.result : card(0),
        ...(fieldIndex === undefined ? {} : { fieldIndex }),
    } as ChainResult;
}

describe("operandOrigins", () => {
    it("reads the cards of the hand as null and the carried results as the step that made them", () => {
        // 1 + 2 = 10, then 10 + 3 = 11
        const origins = operandOrigins(
            chain([
                [1, 2, 10],
                [10, 3, 11],
            ]),
            [1, 2, 3]
        );

        expect(origins).toEqual([
            [null, null],
            [1, null],
        ]);
    });

    it("takes the first operand of a chain that starts on the field from the field, not the hand", () => {
        // The field monster 1 + hand card 2 = 10; the hand also holds a 1 that the second step uses.
        const origins = operandOrigins(
            chain(
                [
                    [1, 2, 10],
                    [10, 1, 11],
                ],
                0
            ),
            [2, 1]
        );

        expect(origins).toEqual([
            [null, null],
            [1, null],
        ]);
    });

    it("does not spend a hand copy on the field monster, so a later step still finds it there", () => {
        // Without the field start the first step would take the hand's only 1, and the second step would
        // read its 1 as a result of step 1 instead of the hand card it is.
        const origins = operandOrigins(
            chain(
                [
                    [1, 2, 10],
                    [3, 1, 11],
                ],
                0
            ),
            [2, 1, 3]
        );

        expect(origins[1]).toEqual([null, null]);
    });
});
