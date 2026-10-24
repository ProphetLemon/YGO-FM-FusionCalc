import type { CardSummary } from "../../shared/types.js";
import { createCardImg } from "../lib/card-image.js";
import { t } from "../lib/i18n.js";

export function renderCardSummary(card: CardSummary): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "win max-w-md";

    const bar = document.createElement("div");
    bar.className = "win-bar win-bar-grey";
    const title = document.createElement("h5");
    title.className = "win-title";
    title.textContent = card.name;
    bar.appendChild(title);
    wrapper.appendChild(bar);

    const body = document.createElement("div");
    body.className = "win-body flex gap-4";

    body.appendChild(
        createCardImg(
            card.name,
            card.imageCode,
            `w-40 h-56 flex-shrink-0 ring-2 ring-wb-ink ${summaryFrame(card)}`
        )
    );

    const stats = document.createElement("div");
    stats.className = "flex-1 min-w-0";

    const desc = document.createElement("p");
    desc.className = "mb-3 text-sm whitespace-pre-line";
    desc.textContent = card.description;
    stats.appendChild(desc);

    if (card.isMonster) {
        stats.appendChild(makeRow(t("card.label.atk-def"), `${card.attack} / ${card.defense}`));
    }
    stats.appendChild(makeRow(t("card.label.type"), card.typeName));
    stats.appendChild(makeRow(t("card.label.stars"), String(card.stars)));
    stats.appendChild(makeRow(t("card.label.password"), card.password));

    body.appendChild(stats);
    wrapper.appendChild(body);

    return wrapper;
}

// The frame colour by kind (a searched card is never a fusion result): Equip, other non-monsters, monsters.
function summaryFrame(card: CardSummary): string {
    if (card.isMonster) return "bg-card-monster";
    return card.typeName === "Equip" ? "bg-card-equip" : "bg-card-magic";
}

function makeRow(label: string, value: string): HTMLParagraphElement {
    const p = document.createElement("p");
    p.className = "mb-1 text-sm";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(value));
    return p;
}
