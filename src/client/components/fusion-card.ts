import type { CardSummary, EquipExpanded, FusionExpanded, ResultExpanded } from "../../shared/types.js";
import { createCardImg } from "../lib/card-image.js";
import { t } from "../lib/i18n.js";

interface PairWithOptionalResult {
    card1: CardSummary;
    card2: CardSummary;
    result?: CardSummary;
}

export function renderPair(entry: FusionExpanded | EquipExpanded | ResultExpanded): HTMLElement {
    const data = entry as PairWithOptionalResult;
    const div = document.createElement("div");
    div.className =
        "block rounded-lg border border-black bg-white text-fm-primary shadow-sm p-4 mb-3 max-w-xs";

    div.appendChild(makeCardLine(t("card.label.input"), data.card1));
    div.appendChild(makeCardLine(t("card.label.input"), data.card2));
    if (data.result) {
        const detail = data.result.isMonster
            ? `${data.result.name} (${data.result.attack}/${data.result.defense})`
            : `${data.result.name} [${data.result.typeName}]`;
        div.appendChild(makeCardLine(t("card.label.result"), data.result, detail));
    }
    return div;
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
