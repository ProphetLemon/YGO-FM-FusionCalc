import type {
    CardSummary,
    ChainResult,
    EquipExpanded,
    FusionExpanded,
    ResultExpanded,
    RitualExpanded,
} from "../../shared/types.js";
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

// A fusion of the calculator: what it makes comes first, large and bold, then the two cards that make it.
// `renderPair` keeps its order (inputs first) for the search page.
export function renderFusion(entry: FusionExpanded): HTMLElement {
    const div = document.createElement("div");
    div.className = `fusion-entry ${ENTRY_CLASS}`;

    const result = document.createElement("div");
    result.className = "fusion-result flex items-center gap-3 mb-3 pb-3 border-b border-wb-rule";
    result.appendChild(
        createCardImg(entry.result.name, entry.result.imageCode, "w-16 h-24 flex-shrink-0", {
            compact: true,
        })
    );
    const text = document.createElement("p");
    text.className = "min-w-0 text-base font-bold";
    const label = document.createElement("strong");
    label.textContent = `${t("card.label.result")}: `;
    text.appendChild(label);
    text.appendChild(document.createTextNode(describeResult(entry.result)));
    result.appendChild(text);
    div.appendChild(result);

    div.appendChild(makeCardLine(t("card.label.input"), entry.card1));
    div.appendChild(makeCardLine(t("card.label.input"), entry.card2));
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

export function renderRitual(entry: RitualExpanded): HTMLElement {
    const div = document.createElement("div");
    div.className = `ritual-entry ${ENTRY_CLASS}`;

    div.appendChild(makeCardLine(t("card.label.ritual"), entry.ritualCard));
    for (const material of entry.materials) {
        div.appendChild(makeCardLine(t("card.label.material"), material));
    }
    div.appendChild(makeCardLine(t("card.label.result"), entry.result, describeResult(entry.result)));
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
