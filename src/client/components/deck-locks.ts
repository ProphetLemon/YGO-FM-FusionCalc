import type { CardIndexEntry } from "../../shared/types.js";
import { getLang, t } from "../lib/i18n.js";
import type { SpareRow } from "../lib/deck-view.js";
import { createCardTile } from "./card-tile.js";
import { createLockIcon, setLockIcon } from "./lock-icon.js";

export interface LockGrid {
    element: HTMLElement;
    // Shows the given locks on the tiles that already exist, so the focus stays where it is.
    update(locked: readonly boolean[]): void;
}

const LOCKED_MARK = "bg-wb-blue text-white";
const UNLOCKED_MARK = "bg-white/90 text-wb-ink";
const MARK_CLASS =
    "absolute -top-1.5 -right-1.5 z-10 grid place-items-center size-6 border-2 border-solid border-wb-ink";

function lockLabel(card: CardIndexEntry, locked: boolean): string {
    return t(locked ? "deck.lock.card-locked" : "deck.lock.card-unlocked", { name: card.name });
}

// The cards of the deck, one tile per slot, the same grid as the deck in the results. Each tile is a toggle
// button: pressed means the optimiser may not take that card out of the deck.
export function createLockGrid(
    slots: readonly CardIndexEntry[],
    locked: readonly boolean[],
    onToggle: (slot: number) => void
): LockGrid {
    const list = document.createElement("ul");
    list.className =
        "m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-2.5 gap-y-3 justify-items-center";
    const buttons = slots.map((card, slot) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "relative block p-0 border-0 bg-transparent cursor-pointer";
        button.appendChild(createCardTile(card, { size: "s" }));
        const mark = document.createElement("span");
        mark.className = MARK_CLASS;
        mark.appendChild(createLockIcon(false));
        button.appendChild(mark);
        button.addEventListener("click", () => onToggle(slot));
        item.appendChild(button);
        list.appendChild(item);
        return button;
    });

    const update = (next: readonly boolean[]): void => {
        buttons.forEach((button, slot) => {
            const card = slots[slot];
            if (!card) return;
            const isLocked = next[slot] === true;
            button.setAttribute("aria-pressed", String(isLocked));
            button.setAttribute("aria-label", lockLabel(card, isLocked));
            button.dataset.locked = String(isLocked);
            const mark = button.lastElementChild as HTMLElement;
            mark.className = `${MARK_CLASS} ${isLocked ? LOCKED_MARK : UNLOCKED_MARK}`;
            setLockIcon(mark.firstElementChild as SVGElement, isLocked);
        });
    };
    update(locked);
    return { element: list, update };
}

// The spare cards as a compact list: name, ATK or card type, and how many copies.
export function renderSpareList(list: HTMLElement, rows: readonly SpareRow[]): void {
    const locale = getLang();
    for (const { card, count } of rows) {
        const item = document.createElement("li");
        item.className = "flex items-baseline gap-x-3 px-2 py-1.5 border-t border-wb-rule first:border-t-0";
        const name = document.createElement("span");
        name.className = "min-w-0 flex-1 font-bold [overflow-wrap:anywhere]";
        name.textContent = card.name;
        const stat = document.createElement("span");
        stat.className = "text-sm text-wb-mute tabular-nums whitespace-nowrap";
        stat.textContent = card.isMonster
            ? t("deck.trunk.atk", { value: card.attack.toLocaleString(locale) })
            : card.typeName;
        const copies = document.createElement("span");
        copies.className = "font-bold tabular-nums";
        copies.textContent = `×${count}`;
        item.append(name, stat, copies);
        list.appendChild(item);
    }
}
