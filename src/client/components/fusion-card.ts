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
const BEST_FINAL_CLASS =
    "chain-final flex items-center gap-4 rounded-lg border-2 border-amber-500 bg-amber-50 text-fm-primary shadow-sm p-4";
// Stands in for the number while the translated sentence is split around it.
const ATK_MARK = "\u0000";

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

// A fusion of the calculator: what it makes comes first, large and bold, then the two cards that make it.
// `renderPair` keeps its order (inputs first) for the search page.
export function renderFusion(entry: FusionExpanded): HTMLElement {
    const div = document.createElement("div");
    div.className = `fusion-entry ${ENTRY_CLASS}`;

    const result = document.createElement("div");
    result.className = "fusion-result flex items-center gap-3 mb-3 pb-3 border-b border-fm-primary/20";
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

// The steps of a chain, each a pair card under its number.
function renderChainSteps(chain: ChainResult): HTMLElement {
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
    return steps;
}

// Each step is a pair card under its number; the card the last step makes closes the chain, highlighted.
export function renderChain(chain: ChainResult): HTMLElement {
    const div = document.createElement("div");
    div.className = "chain-entry mb-6 p-4 border border-fm-primary/20 rounded";
    div.appendChild(renderChainSteps(chain));

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

// The answer the calculator leads with: what to make and how many steps it takes, the card large with its
// final ATK as the biggest number, the gain over the best single fusion (when there is one), then the steps.
export function renderBestChain(chain: ChainResult, bestSingle: CardSummary | null): HTMLElement {
    const finalCard = chain.finalCard;
    const div = document.createElement("div");
    div.className = "chain-entry chain-best mb-6 p-4 border-2 border-fm-primary/30 rounded-lg";

    const headline = document.createElement("div");
    headline.className = "chain-headline mb-4";

    const verdict = document.createElement("p");
    verdict.className = "chain-verdict font-display text-lg md:text-xl font-bold mb-3";
    verdict.textContent =
        chain.steps.length === 1
            ? t("calculator.best.verdict-single", { card: finalCard.name })
            : t("calculator.best.verdict-steps", { steps: chain.steps.length, card: finalCard.name });
    headline.appendChild(verdict);

    const final = document.createElement("div");
    final.className = BEST_FINAL_CLASS;
    final.appendChild(
        createCardImg(finalCard.name, finalCard.imageCode, "w-28 h-40 sm:w-36 sm:h-52 flex-shrink-0")
    );
    const text = document.createElement("div");
    text.className = "min-w-0";
    const name = document.createElement("p");
    name.className = "chain-final-name font-body text-base font-bold";
    name.textContent = describeResult(finalCard);
    text.appendChild(name);
    text.appendChild(renderBigAtk(finalCard.attack));
    final.appendChild(text);
    headline.appendChild(final);

    if (bestSingle !== null && finalCard.attack > bestSingle.attack) {
        const gain = document.createElement("p");
        gain.className = "chain-gain font-body text-sm font-bold text-emerald-800 mt-3";
        gain.textContent = t("calculator.best.gain", {
            gain: finalCard.attack - bestSingle.attack,
            card: bestSingle.name,
            atk: bestSingle.attack,
        });
        headline.appendChild(gain);
    }
    div.appendChild(headline);
    div.appendChild(renderChainSteps(chain));
    return div;
}

// The label is the translated "Final ATK: {{atk}}" sentence, with the number set apart so it can be large.
function renderBigAtk(atk: number): HTMLElement {
    const [before = "", after = ""] = t("calculator.chain.final-atk", { atk: ATK_MARK }).split(ATK_MARK);
    const p = document.createElement("p");
    p.className = "chain-final-atk font-display";
    const label = document.createElement("span");
    label.className = "text-sm font-bold";
    label.textContent = before;
    const number = document.createElement("span");
    number.className = "block text-5xl font-bold leading-tight";
    number.textContent = String(atk);
    p.append(label, number);
    if (after !== "") p.append(after);
    return p;
}

// The chains after the best one, folded away: they are for comparing, not for reading first.
export function renderOtherChains(chains: readonly ChainResult[]): HTMLElement {
    const details = document.createElement("details");
    details.className = "chain-others";
    const summary = document.createElement("summary");
    summary.className =
        "cursor-pointer py-3 font-display text-sm font-bold rounded " +
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fm-primary";
    summary.textContent = t("calculator.chain.others", { count: chains.length });
    details.appendChild(summary);
    for (const chain of chains) details.appendChild(renderChain(chain));
    return details;
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

    row.appendChild(createCardImg(card.name, card.imageCode, "w-10 h-14 flex-shrink-0", { compact: true }));

    const p = document.createElement("p");
    p.className = "text-sm min-w-0";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(overrideText ?? card.name));
    row.appendChild(p);

    return row;
}
