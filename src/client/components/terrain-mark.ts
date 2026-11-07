import type { TerrainId } from "../../shared/terrains.js";
import type { CardSummary } from "../../shared/types.js";
import { t } from "../lib/i18n.js";
import { markText, statOnTerrain } from "../lib/terrain-view.js";

// The marks next to the ATK and DEF a terrain changed: "+500" or "−500". They are real text, so nothing about
// them depends on colour; a screen reader gets the same fact in words after the value ("1500, terreno +500").

// Literal strings, so Tailwind sees every class.
const MARK_CLASS = "terrain-mark ml-0.5 whitespace-nowrap text-[0.75em] font-bold";
const BOOST_CLASS = "text-wb-green";
const WEAKEN_CLASS = "text-wb-red";

// The mark for a stat the terrain changed, or null when it did not. With `plain` it takes the colour of the text
// around it, for a surface that is not light (the selected chain tab).
export function createTerrainMark(mark: number, plain = false): HTMLElement | null {
    if (mark === 0) return null;
    const span = document.createElement("span");
    const colour = plain ? "" : ` ${mark > 0 ? BOOST_CLASS : WEAKEN_CLASS}`;
    span.className = MARK_CLASS + colour;
    const visible = document.createElement("span");
    visible.setAttribute("aria-hidden", "true");
    visible.textContent = markText(mark);
    const spoken = document.createElement("span");
    spoken.className = "sr-only";
    spoken.textContent = `, ${t("terrain.mark.sr", { mark: markText(mark) })}`;
    span.append(visible, spoken);
    return span;
}

export interface StatPiece {
    text: string;
    mark: HTMLElement | null;
}

// The value of a stat on the terrain and its mark, ready to append.
export function statPiece(
    printed: number,
    type: number,
    terrain: TerrainId | null,
    plain = false
): StatPiece {
    const stat = statOnTerrain(printed, type, terrain);
    return { text: String(stat.value), mark: createTerrainMark(stat.mark, plain) };
}

// Appends the value of a stat and, when the terrain changed it, its mark.
export function appendStat(
    parent: HTMLElement,
    printed: number,
    type: number,
    terrain: TerrainId | null,
    plain = false
): void {
    const { text, mark } = statPiece(printed, type, terrain, plain);
    parent.append(text);
    if (mark) parent.appendChild(mark);
}

// "ATK / DEF" of a monster on the terrain, written into `el`. Returns whether a mark was drawn, so the caller
// can let a line that grew wrap. With nothing changed the element holds exactly the printed "ATK / DEF" text.
export function fillCardStat(
    el: HTMLElement,
    card: Pick<CardSummary, "attack" | "defense" | "type">,
    terrain: TerrainId | null
): boolean {
    const atk = statPiece(card.attack, card.type, terrain);
    const def = statPiece(card.defense, card.type, terrain);
    el.textContent = atk.mark || def.mark ? "" : `${atk.text} / ${def.text}`;
    if (!atk.mark && !def.mark) return false;
    el.append(atk.text);
    if (atk.mark) el.appendChild(atk.mark);
    el.append(" / ", def.text);
    if (def.mark) el.appendChild(def.mark);
    return true;
}
