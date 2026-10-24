import type { CardSummary, EquipExpanded, FusionExpanded, ResultExpanded } from "../../shared/types.js";
import { createCardImg } from "../lib/card-image.js";
import { t } from "../lib/i18n.js";
import { cardKind, isEquipCard, KIND_FRAME_CLASS, type CardKind } from "./card-tile.js";

interface PairWithOptionalResult {
    card1: CardSummary;
    card2: CardSummary;
    result?: CardSummary;
}

// A pair, an equip or a ritual: a raised Workbench plate with square corners.
const ENTRY_CLASS = "block raise text-wb-ink p-3 mb-3 max-w-xs";
export function renderPair(entry: FusionExpanded | EquipExpanded | ResultExpanded): HTMLElement {
    const data = entry as PairWithOptionalResult;
    const div = document.createElement("div");
    div.className = ENTRY_CLASS;

    div.appendChild(makeCardLine(t("card.label.input"), data.card1));
    div.appendChild(makeCardLine(t("card.label.input"), data.card2));
    if (data.result) {
        div.appendChild(
            makeCardLine(t("card.label.result"), data.result, describeResult(data.result), "fusion")
        );
    }
    return div;
}

// The Equip card goes first whatever the hand order was. A pair that is not one Equip and one other card
// cannot be told apart by role, so it keeps the neutral labels of renderPair.
export function renderEquip(entry: EquipExpanded): HTMLElement {
    const equipFirst = isEquipCard(entry.card1);
    if (equipFirst === isEquipCard(entry.card2)) return renderPair(entry);

    const div = document.createElement("div");
    div.className = ENTRY_CLASS;
    div.appendChild(makeCardLine(t("card.label.equip"), equipFirst ? entry.card1 : entry.card2));
    div.appendChild(makeCardLine(t("card.label.monster"), equipFirst ? entry.card2 : entry.card1));
    return div;
}

function describeResult(card: CardSummary): string {
    return card.isMonster
        ? `${card.name} (${card.attack}/${card.defense})`
        : `${card.name} [${card.typeName}]`;
}

function makeCardLine(
    label: string,
    card: CardSummary,
    overrideText?: string,
    kind: CardKind = cardKind(card)
): HTMLElement {
    const row = document.createElement("div");
    row.className = "flex items-center gap-3 mb-2";

    row.appendChild(
        createCardImg(
            card.name,
            card.imageCode,
            `w-10 h-14 flex-shrink-0 m-0.5 ring-2 ring-wb-ink ${KIND_FRAME_CLASS[kind]}`,
            { compact: true }
        )
    );

    const p = document.createElement("p");
    p.className = "text-sm min-w-0";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(overrideText ?? card.name));
    row.appendChild(p);

    return row;
}
