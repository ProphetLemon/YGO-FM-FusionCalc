import type { CardSummary, EquipExpanded, FusionExpanded, ResultExpanded } from "../../shared/types.js";
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

    div.appendChild(makeLine(t("card.label.input"), data.card1.name));
    div.appendChild(makeLine(t("card.label.input"), data.card2.name));
    if (data.result) {
        const detail = data.result.isMonster
            ? `${data.result.name} (${data.result.attack}/${data.result.defense})`
            : `${data.result.name} [${data.result.typeName}]`;
        div.appendChild(makeLine(t("card.label.result"), detail));
    }
    return div;
}

function makeLine(label: string, value: string): HTMLParagraphElement {
    const p = document.createElement("p");
    p.className = "mb-1 text-sm";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(value));
    return p;
}
