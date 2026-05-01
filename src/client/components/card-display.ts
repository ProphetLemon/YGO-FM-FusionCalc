import type { CardSummary } from "../../shared/types.js";
import { createCardImg } from "../lib/card-image.js";
import { t } from "../lib/i18n.js";

export function renderCardSummary(card: CardSummary): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className =
        "block rounded-lg border border-fm-primary/30 bg-white text-fm-primary shadow-sm p-4 max-w-md";

    const title = document.createElement("h5");
    title.className = "font-display text-lg mb-3";
    title.textContent = card.name;
    wrapper.appendChild(title);

    const body = document.createElement("div");
    body.className = "flex gap-4";

    body.appendChild(createCardImg(card.name, card.password, "w-40 h-56 flex-shrink-0"));

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

function makeRow(label: string, value: string): HTMLParagraphElement {
    const p = document.createElement("p");
    p.className = "mb-1 text-sm";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(value));
    return p;
}
