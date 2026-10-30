import type { CardSummary, DeckFinal, DeckLock, DeckOptimizeResponse } from "../../shared/types.js";
import {
    formatNumber,
    lowersAverage,
    markAddedSlots,
    markLockedSlots,
    statRows,
    verdictOf,
    type StatRow,
} from "../lib/deck-view.js";
import { getLang, t } from "../lib/i18n.js";
import { createCardTile } from "./card-tile.js";
import { createLockIcon, createPlusIcon } from "./lock-icon.js";

export interface DeckResultsContext {
    // The ids of the deck that was sent, in the slots the answer's deck uses, to mark the cards that are new.
    currentDeck: readonly number[];
    // The cards the request asked to keep, to mark them in the recommended deck.
    locked: readonly DeckLock[];
    // The copies the player added from the trunk, marked after the locked copies of the same card.
    added: readonly DeckLock[];
    // Whether the request carried any rule, which changes what the verdict may claim.
    hasRules: boolean;
}

export interface DeckResults {
    element: HTMLElement;
    // The heading that takes focus when the results appear.
    heading: HTMLElement;
}

const DIRECTION_CLASS: Record<StatRow["direction"], string> = {
    better: "text-wb-green",
    worse: "text-wb-red",
    same: "text-wb-mute",
};
// The arrow follows the number (up when it grew, down when it fell); the word and the colour say whether
// that is good, since fewer dead hands is an improvement.
function changeSymbol(delta: number): string {
    if (delta === 0) return "=";
    return delta > 0 ? "▲" : "▼";
}

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className = "",
    text?: string
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function panel(
    barClass: string,
    title: string,
    titleId: string
): { section: HTMLElement; body: HTMLElement; heading: HTMLElement } {
    const section = el("section", "win");
    section.setAttribute("aria-labelledby", titleId);
    const bar = el("div", `win-bar ${barClass}`);
    const heading = el("h2", "win-title", title);
    heading.id = titleId;
    bar.appendChild(heading);
    section.appendChild(bar);
    const body = el("div", "win-body");
    section.appendChild(body);
    return { section, body, heading };
}

function srOnly(text: string): HTMLElement {
    return el("span", "sr-only", text);
}

function renderVerdict(answer: DeckOptimizeResponse, context: DeckResultsContext): DeckResults {
    // The player's rules can leave a deck that scores below the one they have: the bar is not green then.
    const loses = lowersAverage(answer.current, answer.recommended);
    const { section, body, heading } = panel(
        loses ? "win-bar-red" : answer.swaps.length > 0 ? "win-bar-green" : "win-bar-grey",
        t("deck.results.title"),
        "deck-result-title"
    );
    heading.tabIndex = -1;
    const verdict = verdictOf(answer, context.hasRules);
    body.appendChild(el("p", "m-0 font-bold", t(`deck.verdict.${verdict.claim}`)));
    if (loses) body.appendChild(el("p", "m-0 mt-2 font-bold text-wb-red", t("deck.verdict.loss")));
    if (verdict.noSwaps) {
        const key = verdict.claim.startsWith("certified")
            ? "deck.verdict.no-swaps-certified"
            : "deck.verdict.no-swaps";
        body.appendChild(el("p", "m-0 mt-2", t(key)));
    }
    return { element: section, heading };
}

// Below 560 px a row stacks: the measure on its own line, then its three numbers side by side, each with its
// column name above it. The roles keep the table a table for assistive technology once its display changes.
const NARROW_CELL =
    "max-[560px]:text-left max-[560px]:before:block max-[560px]:before:text-xs max-[560px]:before:font-normal " +
    "max-[560px]:before:text-wb-mute max-[560px]:before:content-[attr(data-label)]";

function statCell(className: string, label: string, text: string): HTMLTableCellElement {
    const cell = el("td", `px-1.5 py-2 text-right align-top tabular-nums ${NARROW_CELL} ${className}`, text);
    cell.dataset.label = label;
    cell.setAttribute("role", "cell");
    return cell;
}

function renderStats(answer: DeckOptimizeResponse): HTMLElement {
    const locale = getLang();
    const { section, body } = panel("win-bar-blue", t("deck.stats.title"), "deck-stats-title");
    body.appendChild(el("p", "m-0 mb-3 text-sm text-wb-mute", t("deck.stats.caption")));

    const table = el("table", "sink w-full border-collapse text-sm max-[560px]:block");
    table.setAttribute("role", "table");
    table.setAttribute("aria-labelledby", "deck-stats-title");
    const thead = el("thead", "max-[560px]:sr-only");
    thead.setAttribute("role", "rowgroup");
    const head = el("tr");
    head.setAttribute("role", "row");
    thead.appendChild(head);
    const columns = ["metric", "current", "recommended", "change"] as const;
    for (const column of columns) {
        const th = el(
            "th",
            `px-1.5 py-2 font-bold align-bottom ${column === "metric" ? "text-left" : "text-right"}`,
            t(`deck.stats.col.${column}`)
        );
        th.scope = "col";
        th.setAttribute("role", "columnheader");
        head.appendChild(th);
    }
    table.appendChild(thead);

    const tbody = el("tbody", "max-[560px]:block");
    tbody.setAttribute("role", "rowgroup");
    for (const row of statRows(answer.current, answer.recommended)) {
        const tr = el(
            "tr",
            "border-t border-wb-rule max-[560px]:grid max-[560px]:grid-cols-3 max-[560px]:gap-x-2 max-[560px]:p-1"
        );
        tr.setAttribute("role", "row");
        const label = el(
            "th",
            "px-1.5 py-2 text-left font-normal align-top max-[560px]:col-span-3 max-[560px]:pb-1",
            t(statLabelKey(row.key))
        );
        label.scope = "row";
        label.setAttribute("role", "rowheader");
        tr.appendChild(label);
        const show = (value: number): string =>
            row.unit === "percent" ? `${formatNumber(value, locale)}%` : formatNumber(value, locale);
        tr.appendChild(statCell("", t("deck.stats.col.current"), show(row.current)));
        tr.appendChild(statCell("font-bold", t("deck.stats.col.recommended"), show(row.recommended)));

        const change = statCell(
            `font-bold whitespace-nowrap ${DIRECTION_CLASS[row.direction]}`,
            t("deck.stats.col.change"),
            ""
        );
        const amount = formatNumber(row.delta, locale, true);
        const symbol = el("span", "", `${changeSymbol(row.delta)} `);
        symbol.setAttribute("aria-hidden", "true");
        change.appendChild(symbol);
        change.appendChild(srOnly(`${t(`deck.stats.${row.direction}`)}: `));
        change.appendChild(
            document.createTextNode(
                row.unit === "percent" ? t("deck.stats.points", { value: amount }) : amount
            )
        );
        tr.appendChild(change);
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    body.appendChild(table);
    return section;
}

function statLabelKey(key: StatRow["key"]): string {
    switch (key) {
        case "averageBestAtk":
            return "deck.stats.row.average";
        case "share1500":
            return "deck.stats.row.share1500";
        case "share2000":
            return "deck.stats.row.share2000";
        case "shareDead":
            return "deck.stats.row.dead";
    }
}

function tileWithLabel(label: string, card: CardSummary): HTMLElement {
    const box = el("div", "flex flex-col items-start gap-1");
    box.appendChild(el("span", "text-sm font-bold text-wb-mute", label));
    box.appendChild(createCardTile(card, { size: "s" }));
    return box;
}

function renderSwaps(answer: DeckOptimizeResponse): HTMLElement {
    const { section, body } = panel("win-bar-red", t("deck.swaps.title"), "deck-swaps-title");
    const list = el("ol", "m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4");
    for (const swap of answer.swaps) {
        const item = el("li", "flex flex-wrap items-center gap-x-4 gap-y-2");
        item.appendChild(tileWithLabel(t("deck.swaps.out"), swap.out));
        const arrow = el("span", "font-display text-2xl text-wb-mute", "→");
        arrow.setAttribute("aria-hidden", "true");
        item.appendChild(arrow);
        item.appendChild(tileWithLabel(t("deck.swaps.in"), swap.in));
        list.appendChild(item);
    }
    body.appendChild(list);
    return section;
}

function renderFinals(finals: readonly DeckFinal[]): HTMLElement {
    const locale = getLang();
    const { section, body } = panel("win-bar-pink", t("deck.finals.title"), "deck-finals-title");
    body.appendChild(el("p", "m-0 mb-3 text-sm text-wb-mute", t("deck.finals.intro")));
    // The bars share one scale, the largest share of the list; the number beside each bar is the exact value.
    const widest = Math.max(...finals.map((final) => final.share));
    const list = el("ul", "m-0 p-0 list-none flex flex-col gap-3");
    for (const final of finals) {
        const item = el("li", "flex items-center gap-3");
        item.appendChild(createCardTile(final.card, { size: "xs" }));
        const text = el("div", "min-w-0 flex-1");
        text.appendChild(el("div", "font-bold [overflow-wrap:anywhere]", final.card.name));
        const percent = `${formatNumber(final.share * 100, locale)}%`;
        text.appendChild(el("div", "text-sm", t("deck.finals.share", { pct: percent })));
        const track = el("div", "sink h-3 mt-1");
        track.setAttribute("aria-hidden", "true");
        const fill = el("div", "h-full bg-wb-blue");
        fill.style.width = `${widest > 0 ? (final.share / widest) * 100 : 0}%`;
        track.appendChild(fill);
        text.appendChild(track);
        item.appendChild(text);
        list.appendChild(item);
    }
    body.appendChild(list);
    return section;
}

function renderDeck(answer: DeckOptimizeResponse, context: DeckResultsContext): HTMLElement {
    const { section, body } = panel("win-bar-grey", t("deck.grid.title"), "deck-grid-title");
    const list = el(
        "ul",
        "m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-2.5 gap-y-3 justify-items-center"
    );
    const lockedSlots = markLockedSlots(answer.deck, context.locked);
    const addedSlots = markAddedSlots(answer.deck, context.locked, context.added);
    answer.deck.forEach((card, slot) => {
        const isNew = context.currentDeck[slot] !== card.id;
        const item = el("li", "flex flex-col items-center gap-1");
        item.appendChild(createCardTile(card, { size: "s" }));
        if (lockedSlots[slot]) {
            item.dataset.locked = "true";
            const badge = el(
                "span",
                "inline-flex items-center gap-1 px-1.5 text-sm font-bold text-white bg-wb-blue"
            );
            badge.append(createLockIcon(true), t("deck.grid.locked"));
            item.appendChild(badge);
        }
        if (addedSlots[slot]) {
            item.dataset.added = "true";
            const badge = el(
                "span",
                "inline-flex items-center gap-1 px-1.5 text-sm font-bold text-white bg-wb-green"
            );
            badge.append(createPlusIcon(), t("deck.grid.added"));
            item.appendChild(badge);
        }
        if (isNew) {
            item.dataset.new = "true";
            // An added copy is new by definition: its own badge says so, and the plain one would repeat it.
            if (!addedSlots[slot]) {
                item.appendChild(
                    el("span", "px-1.5 text-sm font-bold text-white bg-wb-green", t("deck.grid.new"))
                );
            }
        }
        list.appendChild(item);
    });
    body.appendChild(list);
    return section;
}

// The whole answer: the claim first, then the numbers, the swaps, the fusions behind them and the 40 cards.
export function renderDeckResults(answer: DeckOptimizeResponse, context: DeckResultsContext): DeckResults {
    const root = el("div", "flex flex-col gap-5");
    const verdict = renderVerdict(answer, context);
    root.appendChild(verdict.element);
    root.appendChild(renderStats(answer));
    if (answer.swaps.length > 0) root.appendChild(renderSwaps(answer));
    if (answer.topFinals.length > 0) root.appendChild(renderFinals(answer.topFinals));
    root.appendChild(renderDeck(answer, context));
    return { element: root, heading: verdict.heading };
}
