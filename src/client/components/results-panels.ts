import type { CardSummary, EquipExpanded, FusionExpanded, RitualExpanded } from "../../shared/types.js";
import type { TerrainId } from "../../shared/terrains.js";
import { t } from "../lib/i18n.js";
import type { SentBoard } from "../lib/board.js";
import { createCardTile, isEquipCard } from "./card-tile.js";
import { slotTag } from "./slot-tag.js";
import { appendStat } from "./terrain-mark.js";

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
// A row that can be applied to the hand: the whole row takes the pointer and shows it on hover. The button
// that does it for keyboard and screen readers is stretched over the row (which is `relative`), so a click
// anywhere on the row is a click on the button and its focus ring outlines the whole row.
const ACTION_ROW_CLASS = "relative cursor-pointer hover:bg-wb-plate-hover";
const BEST_ACTION_ROW_CLASS = "relative cursor-pointer hover:bg-wb-best-hover";
const APPLY_BUTTON_CLASS = "absolute inset-0 w-full h-full p-0 bg-transparent border-0 cursor-pointer";
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

// An input of a fusion: its chip, then the tag of the slot it comes from. The tag is a sibling of the chip, so
// the chip keeps the card name alone.
function operandChip(card: CardSummary, tag: HTMLElement | null): HTMLElement {
    const group = element("span", "fusion-operand inline-flex min-w-0 max-w-full items-center gap-1.5");
    const chip = element("span", `${CHIP_CLASS} min-w-0 [overflow-wrap:anywhere]`);
    chip.textContent = card.name;
    group.appendChild(chip);
    if (tag) group.appendChild(tag);
    return group;
}

function fusionRow(
    entry: FusionExpanded,
    best: boolean,
    sent: SentBoard | null,
    terrain: TerrainId | null,
    onApply?: (entry: FusionExpanded) => void
): HTMLElement {
    const result = entry.result;
    let className = best ? `${ROW_CLASS} ${BEST_ROW_CLASS}` : ROW_CLASS;
    if (onApply) className += ` ${best ? BEST_ACTION_ROW_CLASS : ACTION_ROW_CLASS}`;
    const row = element("div", className, "row");
    if (best) row.dataset.best = "true";

    const tileCell = cell();
    tileCell.appendChild(createCardTile(result, { size: "xs", kind: "fusion" }));
    if (onApply) {
        // The real control: the row keeps its table semantics and the button lives in a cell.
        const apply = element("button", APPLY_BUTTON_CLASS);
        apply.type = "button";
        apply.setAttribute(
            "aria-label",
            t("calculator.results.apply", {
                card1: entry.card1.name,
                card2: entry.card2.name,
                result: result.name,
            })
        );
        apply.addEventListener("click", () => onApply(entry));
        tileCell.appendChild(apply);
    }

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
        appendStat(statCell, result.attack, result.type, terrain);
        statCell.append(" ");
        const defense = element("small", "inline-block font-body text-sm font-normal text-wb-mute");
        defense.append("/ ");
        appendStat(defense, result.defense, result.type, terrain);
        statCell.appendChild(defense);
    } else {
        statCell.textContent = t("calculator.results.no-atk");
    }

    const inputs = cell("flex flex-wrap items-center gap-1.5");
    const plus = element("span", "");
    plus.textContent = "+";
    inputs.append(
        operandChip(entry.card1, slotTag(sent, entry.from?.[0])),
        plus,
        operandChip(entry.card2, slotTag(sent, entry.from?.[1]))
    );

    row.append(tileCell, nameCell, statCell, inputs);
    return row;
}

// A table of fusions: a header row, then one row per fusion. With `highlightFirst` the first row is the best
// single fusion (the server sorts the monsters by the ATK of what they make). `label` names the table. With
// `onApply` every row can be chosen, by pointer or by the button inside it. With `sent`, the board the answer
// was made for, every input carries the tag of its slot. With a `terrain`, the ATK and DEF of the results are the
// ones they have there, each changed value with its mark (the order is the server's, made for the same terrain).
export function renderFusionTable(
    fusions: readonly FusionExpanded[],
    options: {
        highlightFirst: boolean;
        label: string;
        onApply?: (fusion: FusionExpanded) => void;
        sent?: SentBoard | null;
        terrain?: TerrainId | null;
    }
): HTMLElement {
    const table = element("div", "fusion-table", "table");
    table.setAttribute("aria-label", options.label);
    table.appendChild(headerRow(!options.highlightFirst));
    fusions.forEach((fusion, index) => {
        table.appendChild(
            fusionRow(
                fusion,
                options.highlightFirst && index === 0,
                options.sent ?? null,
                options.terrain ?? null,
                options.onApply
            )
        );
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

// A tile with its caption under it, and under that the tag of its slot when it has one.
function captioned(
    card: CardSummary,
    caption: string,
    kind?: "fusion",
    tag?: HTMLElement | null,
    terrain: TerrainId | null = null
): HTMLElement {
    const column = element("div", "flex flex-col items-center gap-1.5");
    column.appendChild(createCardTile(card, { size: "s", kind, terrain }));
    const label = element("span", CAPTION_CLASS);
    label.textContent = caption;
    column.appendChild(label);
    if (tag) column.appendChild(tag);
    return column;
}

// The Equip card goes first whatever the hand order was. A pair that is not one Equip and one other card
// cannot be told apart by role, so both cards get the neutral caption.
export function renderEquipRow(
    entry: EquipExpanded,
    sent: SentBoard | null = null,
    terrain: TerrainId | null = null
): HTMLElement {
    const row = element("div", "equip-entry flex flex-wrap items-center gap-3.5");
    const equipFirst = isEquipCard(entry.card1);
    const byRole = equipFirst !== isEquipCard(entry.card2);
    // `entry.from` follows card1 and card2, so a swapped pair swaps its slots with it.
    const swapped = !(equipFirst || !byRole);
    const [from, to] = swapped ? [entry.card2, entry.card1] : [entry.card1, entry.card2];
    const [fromRef, toRef] = swapped
        ? [entry.from?.[1], entry.from?.[0]]
        : [entry.from?.[0], entry.from?.[1]];
    row.append(
        captioned(
            from,
            t(byRole ? "card.label.equip" : "card.label.input"),
            undefined,
            slotTag(sent, fromRef),
            terrain
        ),
        arrow(),
        captioned(
            to,
            t(byRole ? "card.label.monster" : "card.label.input"),
            undefined,
            slotTag(sent, toRef),
            terrain
        )
    );
    return row;
}

export function renderRitualRow(
    entry: RitualExpanded,
    sent: SentBoard | null = null,
    terrain: TerrainId | null = null
): HTMLElement {
    const row = element(
        "div",
        "ritual-entry flex flex-wrap items-start gap-3 py-3 border-t-2 border-wb-rule first:border-t-0 first:pt-0"
    );
    row.appendChild(
        captioned(
            entry.ritualCard,
            t("card.label.ritual"),
            undefined,
            slotTag(sent, entry.from?.ritualCard),
            terrain
        )
    );
    entry.materials.forEach((material, i) => {
        const tag = slotTag(sent, entry.from?.materials[i]);
        row.appendChild(captioned(material, t("card.label.material"), undefined, tag, terrain));
    });
    const to = arrow();
    to.classList.add("self-center");
    row.appendChild(to);
    row.appendChild(captioned(entry.result, t("card.label.result"), "fusion", null, terrain));
    return row;
}
