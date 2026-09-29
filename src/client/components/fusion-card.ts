import type {
    CardSummary,
    EquipExpanded,
    FusionExpanded,
    ResultExpanded,
    RitualExpanded,
} from "../../shared/types.js";
import { createCardImg } from "../lib/card-image.js";
import { t } from "../lib/i18n.js";

interface PairWithOptionalResult {
    card1: CardSummary;
    card2: CardSummary;
    result?: CardSummary;
}

const ENTRY_CLASS =
    "block rounded-lg border border-black bg-white text-fm-primary shadow-sm p-4 mb-3 max-w-xs";

export function renderPair(entry: FusionExpanded | EquipExpanded | ResultExpanded): HTMLElement {
    const data = entry as PairWithOptionalResult;
    const div = document.createElement("div");
    div.className = ENTRY_CLASS;

    div.appendChild(makeCardLine(t("card.label.input"), data.card1));
    div.appendChild(makeCardLine(t("card.label.input"), data.card2));
    if (data.result) {
        div.appendChild(makeCardLine(t("card.label.result"), data.result, describeResult(data.result)));
    }
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

function makeCardLine(label: string, card: CardSummary, overrideText?: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "flex items-center gap-2 mb-2";

    row.appendChild(createCardImg(card.name, card.password, "w-10 h-14 flex-shrink-0"));

    const p = document.createElement("p");
    p.className = "text-sm min-w-0";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(overrideText ?? card.name));
    row.appendChild(p);

    return row;
}
