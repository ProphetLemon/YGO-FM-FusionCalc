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

interface PairWithOptionalResult {
    card1: CardSummary;
    card2: CardSummary;
    result?: CardSummary;
}

// How the API names the Equip card type (`cardTypes` in types-and-stars.json).
const EQUIP_TYPE_NAME = "Equip";

const ENTRY_CLASS =
    "block rounded-lg border border-black bg-white text-fm-primary shadow-sm p-4 mb-3 max-w-xs";
const FINAL_CLASS =
    "chain-final rounded-lg border-2 border-amber-500 bg-amber-50 text-fm-primary shadow-sm p-4 max-w-xs";

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

// Each step is a pair card under its number; the card the last step makes closes the chain, highlighted.
export function renderChain(chain: ChainResult): HTMLElement {
    const div = document.createElement("div");
    div.className = "chain-entry mb-6 p-4 border border-fm-primary/20 rounded";

    const steps = document.createElement("ol");
    steps.className = "flex flex-wrap gap-x-3";
    for (const [i, step] of chain.steps.entries()) {
        const item = document.createElement("li");
        item.className = "chain-step";
        const label = document.createElement("p");
        label.className = "font-display text-sm font-bold mb-1";
        label.textContent = t("calculator.chain.step", { n: i + 1 });
        item.appendChild(label);
        item.appendChild(renderPair(step));
        steps.appendChild(item);
    }
    div.appendChild(steps);

    const final = document.createElement("div");
    final.className = FINAL_CLASS;
    final.appendChild(
        makeCardLine(t("card.label.result"), chain.finalCard, describeResult(chain.finalCard))
    );
    const summary = document.createElement("p");
    summary.className = "font-display text-sm font-bold";
    summary.textContent = t("calculator.chain.final-atk", { atk: String(chain.finalCard.attack) });
    final.appendChild(summary);
    div.appendChild(final);
    return div;
}

function isEquipCard(card: CardSummary): boolean {
    return card.typeName === EQUIP_TYPE_NAME;
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
