import type { BoardZone, SlotRef } from "../../shared/types.js";
import { boardPosition, fieldPosition, type SentBoard } from "../lib/board.js";
import { t } from "../lib/i18n.js";

// The tag of a result (D10): the board slot a card was taken from, such as "Mano 1" or "Monstruo 2". It is
// plain text, so a screen reader says it next to the card and it does not rely on colour. The fill echoes the
// bar of the zone (grey, blue, pink); each pairs with white text well above 4.5:1.

// Literal strings, so Tailwind sees every class.
const ZONE_CLASS: Record<BoardZone, string> = {
    hand: "bg-wb-grey",
    monster: "bg-wb-blue",
    spell: "bg-wb-pink",
};

const TAG_CLASS = "slot-tag inline-block shrink-0 px-1.5 py-px text-xs font-bold leading-snug text-white";

export function createSlotTag(zone: BoardZone, position: number): HTMLElement {
    const tag = document.createElement("span");
    tag.className = `${TAG_CLASS} ${ZONE_CLASS[zone]}`;
    tag.dataset.zone = zone;
    tag.textContent = t(`calculator.tag.${zone}`, { n: position });
    return tag;
}

// The tag of the slot a reference of the answer points at, or null in legacy mode (no references) and when
// the reference points at nothing that was sent.
export function slotTag(sent: SentBoard | null, ref: SlotRef | undefined): HTMLElement | null {
    if (!sent || !ref) return null;
    const position = boardPosition(sent, ref);
    return position === null ? null : createSlotTag(ref.zone, position);
}

// The tag of the field monster a chain starts from.
export function fieldTag(sent: SentBoard | null, fieldIndex: number | undefined): HTMLElement | null {
    if (!sent || fieldIndex === undefined) return null;
    const position = fieldPosition(sent, fieldIndex);
    return position === null ? null : createSlotTag("monster", position);
}
