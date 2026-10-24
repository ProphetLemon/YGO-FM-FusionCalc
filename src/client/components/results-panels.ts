import type { CardSummary, EquipExpanded, FusionExpanded, RitualExpanded } from "../../shared/types.js";
import { t } from "../lib/i18n.js";
import { createCardTile, isEquipCard } from "./card-tile.js";

// The rows of the calculator results as the Workbench draws them (D9): the fusions table, the equips and
// the rituals. The containers (`#outputarealeft`, `#outputareaother`, `#outputarearight`, `#rituals-output`)
// live in views/calculator.ejs; these functions only build what goes inside them.

// Literal strings, so Tailwind sees every class. Columns: result (tile + name), ATK / DEF, input chips.
const GRID_CLASS =
    "grid items-center gap-4 grid-cols-[56px_minmax(0,1.2fr)_120px_minmax(0,1.5fr)] " +
    "max-[700px]:grid-cols-[56px_1fr] max-[700px]:gap-x-3 max-[700px]:gap-y-1.5 " +
    "max-[700px]:[&>:nth-child(3)]:col-start-2 max-[700px]:[&>:nth-child(4)]:col-start-2";
const HEAD_CLASS = `${GRID_CLASS} mb-1 text-sm font-bold text-wb-mute max-[700px]:hidden`;
const ROW_CLASS = `fusion-row ${GRID_CLASS} py-2.5 border-t-2 border-wb-rule`;
// The best row gets its own box: the fill and a green outline reach 10px (8px on a phone) past the column.
const BEST_ROW_CLASS =
    "bg-wb-best outline outline-2 outline-wb-green px-2.5 -mx-2.5 border-t-transparent " +
    "max-[700px]:px-2 max-[700px]:-mx-2";
const TAG_CLASS = "inline-block ml-2 px-2 py-px bg-wb-green text-white text-xs font-bold align-[2px]";
const CHIP_CLASS = "fusion-input sink px-2.5 py-1 text-sm";
const CAPTION_CLASS = "card-caption text-sm font-bold";

function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    role?: string
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    el.className = className;
    if (role) el.setAttribute("role", role);
    return el;
}

function cell(className = "", role = "cell"): HTMLElement {
    return element("div", className, role);
}

function headerRow(srOnly: boolean): HTMLElement {
    const row = element("div", srOnly ? `sr-only ${HEAD_CLASS}` : HEAD_CLASS, "row");
    // "Result" covers the tile and the name, the first two columns of every row.
    const result = cell("col-span-2", "columnheader");
    result.setAttribute("aria-colspan", "2");
    result.textContent = t("card.label.result");
    const stat = cell("", "columnheader");
    stat.textContent = t("card.label.atk-def");
    const input = cell("", "columnheader");
    input.textContent = t("calculator.results.col.input");
    row.append(result, stat, input);
    return row;
}

function fusionRow(entry: FusionExpanded, best: boolean): HTMLElement {
    const result = entry.result;
    const row = element("div", best ? `${ROW_CLASS} ${BEST_ROW_CLASS}` : ROW_CLASS, "row");
    if (best) row.dataset.best = "true";

    const tileCell = cell();
    tileCell.appendChild(createCardTile(result, { size: "xs", kind: "fusion" }));

    const nameCell = cell("min-w-0");
    const name = element("div", "fusion-name text-[17px] font-bold leading-tight [overflow-wrap:anywhere]");
    name.append(result.name);
    if (best) {
        const tag = element("span", `best-tag ${TAG_CLASS}`);
        tag.textContent = t("calculator.results.best");
        name.appendChild(tag);
    }
    const type = element("div", "fusion-type text-sm text-wb-mute");
    type.textContent = result.typeName;
    nameCell.append(name, type);

    const statCell = result.isMonster
        ? cell("fusion-stat font-display text-2xl leading-none text-wb-green")
        : cell("fusion-stat text-sm text-wb-mute");
    if (result.isMonster) {
        statCell.append(`${result.attack} `);
        const defense = element("small", "font-body text-sm font-normal text-wb-mute");
        defense.textContent = `/ ${result.defense}`;
        statCell.appendChild(defense);
    } else {
        statCell.textContent = t("calculator.results.no-atk");
    }

    const inputs = cell("flex flex-wrap items-center gap-1.5");
    const first = element("span", CHIP_CLASS);
    first.textContent = entry.card1.name;
    const plus = element("span", "");
    plus.textContent = "+";
    const second = element("span", CHIP_CLASS);
    second.textContent = entry.card2.name;
    inputs.append(first, plus, second);

    row.append(tileCell, nameCell, statCell, inputs);
    return row;
}

// A table of fusions: a header row, then one row per fusion. With `highlightFirst` the first row is the best
// single fusion (the server sorts the monsters by the ATK of what they make). `label` names the table.
export function renderFusionTable(
    fusions: readonly FusionExpanded[],
    options: { highlightFirst: boolean; label: string }
): HTMLElement {
    const table = element("div", "fusion-table", "table");
    table.setAttribute("aria-label", options.label);
    table.appendChild(headerRow(!options.highlightFirst));
    fusions.forEach((fusion, index) => {
        table.appendChild(fusionRow(fusion, options.highlightFirst && index === 0));
    });
    return table;
}

function arrow(): SVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 40 16");
    svg.setAttribute("width", "40");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "shrink-0 text-wb-red");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M2 8 H36 M29 2 L37 8 L29 14");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "3");
    svg.appendChild(path);
    return svg;
}

// A tile with its caption under it.
function captioned(card: CardSummary, caption: string, kind?: "fusion"): HTMLElement {
    const column = element("div", "flex flex-col items-center gap-1.5");
    column.appendChild(createCardTile(card, { size: "s", kind }));
    const label = element("span", CAPTION_CLASS);
    label.textContent = caption;
    column.appendChild(label);
    return column;
}

// The Equip card goes first whatever the hand order was. A pair that is not one Equip and one other card
// cannot be told apart by role, so both cards get the neutral caption.
export function renderEquipRow(entry: EquipExpanded): HTMLElement {
    const row = element("div", "equip-entry flex flex-wrap items-center gap-3.5");
    const equipFirst = isEquipCard(entry.card1);
    const byRole = equipFirst !== isEquipCard(entry.card2);
    const [from, to] = equipFirst || !byRole ? [entry.card1, entry.card2] : [entry.card2, entry.card1];
    row.append(
        captioned(from, t(byRole ? "card.label.equip" : "card.label.input")),
        arrow(),
        captioned(to, t(byRole ? "card.label.monster" : "card.label.input"))
    );
    return row;
}

export function renderRitualRow(entry: RitualExpanded): HTMLElement {
    const row = element(
        "div",
        "ritual-entry flex flex-wrap items-start gap-3 py-3 border-t-2 border-wb-rule first:border-t-0 first:pt-0"
    );
    row.appendChild(captioned(entry.ritualCard, t("card.label.ritual")));
    for (const material of entry.materials) row.appendChild(captioned(material, t("card.label.material")));
    const to = arrow();
    to.classList.add("self-center");
    row.appendChild(to);
    row.appendChild(captioned(entry.result, t("card.label.result"), "fusion"));
    return row;
}
