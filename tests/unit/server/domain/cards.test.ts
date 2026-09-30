import { beforeAll, describe, expect, it } from "vitest";
import type { Card } from "../../../../src/shared/types.js";
import imageOverrides from "../../../../src/shared/card-image-overrides.json" with { type: "json" };
import { isMonster, toCardSummary } from "../../../../src/server/domain/cards.js";
import { getAllCards, loadStore } from "../../../../src/server/data/store.js";

const UNKNOWN_ID = 999_999;
// Two cards with an override: Gate Guardian has no password, Puppet Ritual has one the CDN has no file for.
const GATE_GUARDIAN_ID = 374;
const PUPPET_RITUAL_ID = 695;
// The cards with no password and no override: Meteor B. Dragon, Psycho-Puppet, Mask of Shine & Dark and Dark
// Magic Ritual.
const NO_ARTWORK_IDS = [713, 715, 720, 721];

function cardWith(fields: Partial<Card>): Card {
    return {
        Id: UNKNOWN_ID,
        Name: "Sample",
        Description: "Sample",
        Type: 0,
        Attack: 0,
        Defense: 0,
        Stars: 0,
        CardCode: "89631139",
        Equip: null,
        Fusions: [],
        ...fields,
    };
}

describe("cards domain", () => {
    beforeAll(() => {
        loadStore();
    });

    it("isMonster recognises monsters and non-monsters", () => {
        expect(isMonster({ Type: 0 } as Card)).toBe(true);
        expect(isMonster({ Type: 19 } as Card)).toBe(true);
        expect(isMonster({ Type: 20 } as Card)).toBe(false);
        expect(isMonster({ Type: 23 } as Card)).toBe(false);
    });

    it("toCardSummary maps fields and resolves type name", () => {
        const summary = toCardSummary({
            Id: 1,
            Name: "Blue-eyes White Dragon",
            Description: "Sample",
            Type: 0,
            Attack: 3000,
            Defense: 2500,
            Stars: 999_999,
            CardCode: "89631139",
            Equip: null,
            Fusions: [],
        });
        expect(summary).toEqual({
            id: 1,
            name: "Blue-eyes White Dragon",
            description: "Sample",
            type: 0,
            typeName: "Dragon",
            attack: 3000,
            defense: 2500,
            stars: 999_999,
            password: "89631139",
            imageCode: "89631139",
            isMonster: true,
        });
    });

    describe("the artwork code of a summary", () => {
        it("is the password when it has no padding", () => {
            expect(toCardSummary(cardWith({ CardCode: "89631139" })).imageCode).toBe("89631139");
        });

        it.each([
            ["04931562", "4931562"],
            ["00062121", "62121"],
            ["00000001", "1"],
        ])("drops the padding of password %s", (password, imageCode) => {
            expect(toCardSummary(cardWith({ CardCode: password })).imageCode).toBe(imageCode);
        });

        it("leaves the password as the game spells it", () => {
            expect(toCardSummary(cardWith({ CardCode: "04931562" })).password).toBe("04931562");
        });

        it("is null for the all-zero password, which the password keeps", () => {
            const summary = toCardSummary(cardWith({ CardCode: "00000000" }));
            expect(summary.imageCode).toBeNull();
            expect(summary.password).toBe("00000000");
        });

        it("is null for a password that is not a number", () => {
            expect(toCardSummary(cardWith({ CardCode: "ABCDEFGH" })).imageCode).toBeNull();
            expect(toCardSummary(cardWith({ CardCode: "" })).imageCode).toBeNull();
        });

        it("comes from the override of a card that has no password", () => {
            const summary = toCardSummary(cardWith({ Id: GATE_GUARDIAN_ID, CardCode: "00000000" }));
            expect(summary.imageCode).toBe("25833572");
            expect(summary.password).toBe("00000000");
        });

        it("comes from the override before the password is looked at", () => {
            const padded = toCardSummary(cardWith({ Id: PUPPET_RITUAL_ID, CardCode: "05783166" }));
            expect(padded.imageCode).toBe("1969506");
            expect(padded.password).toBe("05783166");
            const plain = toCardSummary(cardWith({ Id: GATE_GUARDIAN_ID, CardCode: "89631139" }));
            expect(plain.imageCode).toBe("25833572");
        });

        it.each(Object.entries(imageOverrides))("applies the override of card %s", (id, imageCode) => {
            expect(toCardSummary(cardWith({ Id: Number(id), CardCode: "00000000" })).imageCode).toBe(
                imageCode
            );
        });

        it("ignores an id without an override", () => {
            expect(toCardSummary(cardWith({ Id: UNKNOWN_ID, CardCode: "00000000" })).imageCode).toBeNull();
            expect(toCardSummary(cardWith({ Id: UNKNOWN_ID, CardCode: "04931562" })).imageCode).toBe(
                "4931562"
            );
        });
    });

    describe("the artwork codes of the game's cards", () => {
        const overridden = new Set(Object.keys(imageOverrides));
        const cards = (): readonly Card[] => getAllCards();

        it("are the password as a number for every card that has no override", () => {
            for (const card of cards()) {
                if (overridden.has(String(card.Id)) || card.CardCode === "00000000") continue;
                expect(toCardSummary(card).imageCode, `${card.Name} (${card.CardCode})`).toBe(
                    String(Number(card.CardCode))
                );
            }
        });

        it("never change a password that has no padding", () => {
            for (const card of cards()) {
                if (overridden.has(String(card.Id)) || card.CardCode.startsWith("0")) continue;
                expect(toCardSummary(card).imageCode, card.Name).toBe(card.CardCode);
            }
        });

        it("are a number without padding or null, for every card", () => {
            for (const card of cards()) {
                const { imageCode } = toCardSummary(card);
                if (imageCode !== null) expect(imageCode, card.Name).toMatch(/^[1-9]\d*$/);
            }
        });

        it("are missing only for the cards that have neither a password nor an override", () => {
            const without = cards()
                .filter((card) => toCardSummary(card).imageCode === null)
                .map((card) => card.Id);
            expect(without).toEqual(NO_ARTWORK_IDS);
        });

        it("keep every password as the data has it", () => {
            for (const card of cards()) expect(toCardSummary(card).password).toBe(card.CardCode);
        });
    });
});
