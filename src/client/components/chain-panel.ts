import type { CardSummary, ChainResult } from "../../shared/types.js";
import { t } from "../lib/i18n.js";
import { createCardTile } from "./card-tile.js";

// Stands in for the number while the translated sentence is split around it.
const ATK_MARK = "\u0000";

const TAB_CLASS =
    "chain-tab group min-h-14 px-3 py-1.5 text-left flex flex-col justify-center cursor-pointer " +
    "raise hover:bg-wb-plate-hover text-wb-ink " +
    "aria-selected:sink aria-selected:bg-wb-blue aria-selected:hover:bg-wb-blue aria-selected:text-white";
const OPERATOR_CLASS = "font-display text-3xl font-bold leading-none text-wb-ink";

let panelCount = 0;

// Where the card an operand stands for came from: the number of the step that made it, or null for a card
// of the hand. A chain does not say which it is, so the hand is replayed: an operand is taken from the
// hand while the hand still holds that card, and from the results of the earlier steps after that. When the
// same card is in both, the two readings are the same play.
export function operandOrigins(
    chain: ChainResult,
    handIds: readonly number[]
): [number | null, number | null][] {
    const inHand = new Map<number, number>();
    for (const id of handIds) inHand.set(id, (inHand.get(id) ?? 0) + 1);
    // Results not used yet, by card id: the step that made each.
    const made = new Map<number, number[]>();

    const take = (id: number): number | null => {
        const left = inHand.get(id) ?? 0;
        if (left > 0) {
            inHand.set(id, left - 1);
            return null;
        }
        return made.get(id)?.pop() ?? null;
    };

    return chain.steps.map((step, index) => {
        const origins: [number | null, number | null] = [take(step.card1.id), take(step.card2.id)];
        const list = made.get(step.result.id) ?? [];
        list.push(index + 1);
        made.set(step.result.id, list);
        return origins;
    });
}

// The chains of the answer, best first. With several, a tab per chain picks the one shown; the others stay
// in the page, hidden. The best chain also says how much better it is than the best single fusion.
export function renderChains(
    chains: readonly ChainResult[],
    bestSingle: CardSummary | null,
    handIds: readonly number[]
): HTMLElement {
    const root = document.createElement("div");
    root.className = "chain-panel";
    const id = `chain-${++panelCount}`;
    const tabbed = chains.length > 1;

    const entries = chains.map((chain, index) => {
        const entry = renderChain(chain, index === 0 ? bestSingle : null, handIds, index === 0);
        if (tabbed) {
            entry.id = `${id}-panel-${index}`;
            entry.setAttribute("role", "tabpanel");
            entry.setAttribute("aria-labelledby", `${id}-tab-${index}`);
            entry.hidden = index !== 0;
        }
        return entry;
    });

    if (tabbed) {
        const tabs = renderTabs(chains, id, (selected) => {
            entries.forEach((entry, index) => {
                entry.hidden = index !== selected;
            });
        });
        root.appendChild(tabs);
    }
    for (const entry of entries) root.appendChild(entry);
    return root;
}

// A tablist with the usual keys: arrows, Home and End move the selection, and only the selected tab is in
// the tab order.
function renderTabs(
    chains: readonly ChainResult[],
    id: string,
    onSelect: (index: number) => void
): HTMLElement {
    const list = document.createElement("div");
    list.className = "chain-tabs grid grid-cols-2 min-[701px]:grid-cols-4 gap-2 mb-4";
    list.setAttribute("role", "tablist");
    list.setAttribute("aria-label", t("calculator.chain.tabs"));

    const tabs = chains.map((chain, index) => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.id = `${id}-tab-${index}`;
        tab.className = TAB_CLASS;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", `${id}-panel-${index}`);

        const rank = document.createElement("small");
        rank.className = "text-[13px] text-wb-mute group-aria-selected:text-[#e4eafb]";
        rank.textContent = t("calculator.chain.tab", { n: index + 1 });
        const summary = document.createElement("b");
        summary.className = "text-[15px] leading-tight [overflow-wrap:anywhere]";
        summary.textContent = `${chain.finalCard.name}, ${chain.finalCard.attack} ATK`;
        tab.append(rank, summary);
        return tab;
    });

    const select = (selected: number, focus: boolean): void => {
        tabs.forEach((tab, index) => {
            tab.setAttribute("aria-selected", String(index === selected));
            tab.tabIndex = index === selected ? 0 : -1;
        });
        onSelect(selected);
        if (focus) tabs[selected]?.focus();
    };

    tabs.forEach((tab, index) => {
        tab.addEventListener("click", () => select(index, false));
        tab.addEventListener("keydown", (event) => {
            const last = tabs.length - 1;
            const target =
                event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? (index + last) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? last
                          : null;
            if (target === null) return;
            event.preventDefault();
            select(target, true);
        });
        list.appendChild(tab);
    });
    select(0, false);
    return list;
}

// The steps as equations on the left, the final card on the right, the sentence that sums the play up below.
function renderChain(
    chain: ChainResult,
    bestSingle: CardSummary | null,
    handIds: readonly number[],
    isBest: boolean
): HTMLElement {
    const entry = document.createElement("div");
    entry.className = isBest ? "chain-entry chain-best" : "chain-entry";

    const body = document.createElement("div");
    body.className =
        "sink grid grid-cols-1 min-[701px]:grid-cols-[minmax(0,1fr)_210px] gap-6 items-start " +
        "p-3.5 min-[701px]:px-5 min-[701px]:py-[18px]";
    body.appendChild(renderSteps(chain, handIds));
    body.appendChild(renderFinal(chain.finalCard, isBest ? bestSingle : null));
    entry.appendChild(body);

    const verdict = document.createElement("p");
    verdict.className = "chain-verdict font-body text-[17px] mt-3.5 mb-0";
    verdict.textContent =
        chain.steps.length === 1
            ? t("calculator.best.verdict-single", { card: chain.finalCard.name })
            : t("calculator.best.verdict-steps", { steps: chain.steps.length, card: chain.finalCard.name });
    entry.appendChild(verdict);
    return entry;
}

function renderSteps(chain: ChainResult, handIds: readonly number[]): HTMLElement {
    const origins = operandOrigins(chain, handIds);
    const steps = document.createElement("ol");
    steps.className = "m-0 p-0 list-none flex flex-col gap-[18px] min-w-0";

    for (const [i, step] of chain.steps.entries()) {
        const [origin1, origin2] = origins[i] ?? [null, null];
        const item = document.createElement("li");
        item.className = "chain-step";

        const label = document.createElement("p");
        label.className = "font-bold text-wb-blue text-base mb-1.5";
        label.textContent = t("calculator.chain.step", { n: i + 1 });
        item.appendChild(label);

        const row = document.createElement("div");
        row.className = "flex flex-wrap items-center gap-3";
        row.appendChild(operand(step.card1, origin1));
        row.appendChild(operator("+"));
        row.appendChild(operand(step.card2, origin2));
        row.appendChild(operator("="));
        row.appendChild(createCardTile(step.result, { size: "s", kind: "fusion" }));
        item.appendChild(row);
        steps.appendChild(item);
    }
    return steps;
}

// A card of the hand, or the result of an earlier step with a caption that says which.
function operand(card: CardSummary, origin: number | null): HTMLElement {
    const box = document.createElement("div");
    if (origin === null) {
        box.appendChild(createCardTile(card, { size: "s" }));
        return box;
    }
    box.appendChild(createCardTile(card, { size: "s", kind: "fusion" }));
    const caption = document.createElement("span");
    caption.className = "chain-carried block mt-1 max-w-[88px] text-center text-[13px] text-wb-mute";
    caption.textContent = t("calculator.chain.carried", { n: origin });
    box.appendChild(caption);
    return box;
}

function operator(symbol: string): HTMLElement {
    const span = document.createElement("span");
    span.className = OPERATOR_CLASS;
    span.textContent = symbol;
    return span;
}

function renderFinal(finalCard: CardSummary, bestSingle: CardSummary | null): HTMLElement {
    const final = document.createElement("div");
    final.className = "chain-final flex flex-col items-center gap-2.5 text-center min-w-0";
    final.appendChild(createCardTile(finalCard, { size: "l", kind: "fusion" }));
    final.appendChild(renderBigAtk(finalCard.attack));

    if (bestSingle !== null && finalCard.attack > bestSingle.attack) {
        const gain = document.createElement("p");
        gain.className =
            "chain-gain m-0 px-3 py-1 bg-wb-blue text-white border-2 border-wb-blue font-body text-sm font-bold";
        gain.textContent = t("calculator.best.gain", {
            gain: finalCard.attack - bestSingle.attack,
            card: bestSingle.name,
            atk: bestSingle.attack,
        });
        final.appendChild(gain);
    }
    return final;
}

// The label is the translated "Final ATK: {{atk}}" sentence, with the number set apart so it can be large.
function renderBigAtk(atk: number): HTMLElement {
    const [before = "", after = ""] = t("calculator.chain.final-atk", { atk: ATK_MARK }).split(ATK_MARK);
    const p = document.createElement("p");
    p.className = "chain-final-atk m-0 flex flex-wrap items-baseline justify-center gap-x-1.5 font-display";
    const label = document.createElement("span");
    label.className = "font-body text-[15px] font-bold text-wb-ink";
    label.textContent = before;
    const number = document.createElement("span");
    number.className = "text-[44px] font-bold leading-none text-wb-blue";
    number.textContent = String(atk);
    p.append(label, number);
    if (after !== "") p.append(after);
    return p;
}
