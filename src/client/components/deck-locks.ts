import type { CardIndexEntry } from "../../shared/types.js";
import { getLang, t } from "../lib/i18n.js";
import type { DeckRules, SpareRow } from "../lib/deck-view.js";
import { createCardTile } from "./card-tile.js";
import {
    createForbidIcon,
    createLockIcon,
    createPlusIcon,
    setForbidIcon,
    setLockIcon,
} from "./lock-icon.js";

export interface LockGrid {
    element: HTMLElement;
    // Shows the given rules on the tiles that already exist, so the focus stays where it is.
    update(rules: DeckRules): void;
}

export interface LockGridHandlers {
    onToggleLock(slot: number): void;
    onToggleForbid(id: number): void;
}

const LOCKED_MARK = "bg-wb-blue text-white";
const UNLOCKED_MARK = "bg-white/90 text-wb-ink";
const FORBIDDEN_MARK = "bg-wb-red text-white";
const ALLOWED_MARK = "bg-white/90 text-wb-ink";
const ADDED_MARK = "bg-wb-green text-white";
// The marks sit on the bottom corners of the artwork, just above the stat strip, so they never hide a card
// name, however many lines the name takes. The lock is on the right, the forbid on the left.
const MARK_BASE =
    "absolute bottom-7 z-10 grid place-items-center size-6 border-2 border-solid border-wb-ink";
const LOCK_MARK_CLASS = `${MARK_BASE} right-1.5`;
const FORBID_MARK_CLASS = `${MARK_BASE} left-1.5 p-0 cursor-pointer`;
// A locked tile is also ringed, so the locked cards stand out at a glance and not only by their mark. A
// forbidden one is ringed in red and its artwork dimmed; its name strip is left alone, so it stays readable.
const RING_TILE = "ring-4";
const LOCKED_TILE = "ring-wb-blue";
const FORBIDDEN_TILE = "ring-wb-red";
const DIMMED_ART = "[&_.wb-art]:opacity-40";

function lockLabel(card: CardIndexEntry, locked: boolean): string {
    return t(locked ? "deck.lock.card-locked" : "deck.lock.card-unlocked", { name: card.name });
}

// The cards of the deck, one tile per slot, the same grid as the deck in the results. Each tile is a toggle
// button: pressed means the optimiser may not take that card out of the deck. Beside it, as a sibling and never
// inside it, a second toggle forbids the card.
export function createLockGrid(
    slots: readonly CardIndexEntry[],
    rules: DeckRules,
    handlers: LockGridHandlers
): LockGrid {
    const list = document.createElement("ul");
    list.className =
        "m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-2.5 gap-y-3 justify-items-center";
    const controls = slots.map((card, slot) => {
        const item = document.createElement("li");
        item.className = "relative";
        const lock = document.createElement("button");
        lock.type = "button";
        lock.dataset.action = "lock";
        lock.className = "relative block p-0 border-0 bg-transparent cursor-pointer";
        lock.appendChild(createCardTile(card, { size: "s" }));
        const lockMark = document.createElement("span");
        lockMark.appendChild(createLockIcon(false));
        lock.appendChild(lockMark);
        lock.addEventListener("click", () => handlers.onToggleLock(slot));

        const forbid = document.createElement("button");
        forbid.type = "button";
        forbid.dataset.action = "forbid";
        forbid.setAttribute("aria-label", t("deck.rule.forbid-card", { name: card.name }));
        forbid.appendChild(createForbidIcon(false));
        forbid.addEventListener("click", () => handlers.onToggleForbid(card.id));

        item.append(lock, forbid);
        list.appendChild(item);
        return { card, lock, lockMark, forbid };
    });

    const update = (next: DeckRules): void => {
        controls.forEach(({ card, lock, lockMark, forbid }, slot) => {
            const isLocked = next.locked[slot] === true;
            const isForbidden = next.forbidden.includes(card.id);
            lock.setAttribute("aria-pressed", String(isLocked));
            lock.setAttribute("aria-label", lockLabel(card, isLocked));
            lock.dataset.locked = String(isLocked);
            lock.dataset.forbidden = String(isForbidden);
            lock.classList.toggle(RING_TILE, isLocked || isForbidden);
            lock.classList.toggle(LOCKED_TILE, isLocked);
            lock.classList.toggle(FORBIDDEN_TILE, isForbidden);
            lock.classList.toggle(DIMMED_ART, isForbidden);
            lockMark.className = `${LOCK_MARK_CLASS} ${isLocked ? LOCKED_MARK : UNLOCKED_MARK}`;
            setLockIcon(lockMark.firstElementChild as SVGElement, isLocked);

            forbid.setAttribute("aria-pressed", String(isForbidden));
            forbid.dataset.forbidden = String(isForbidden);
            forbid.className = `${FORBID_MARK_CLASS} ${isForbidden ? FORBIDDEN_MARK : ALLOWED_MARK}`;
            setForbidIcon(forbid.firstElementChild as SVGElement, isForbidden);
        });
    };
    update(rules);
    return { element: list, update };
}

// The copies added from the trunk, one tile each, in the order given. A tile is a button: pressing it takes
// that copy back out. The buttons come back in order, so the page can move the focus to one.
export function renderAddedList(
    list: HTMLElement,
    cards: readonly CardIndexEntry[],
    onRemove: (index: number) => void
): HTMLButtonElement[] {
    return cards.map((card, index) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = "remove-added";
        button.className = `relative block p-0 border-0 bg-transparent cursor-pointer ${RING_TILE} ring-wb-green`;
        button.setAttribute("aria-label", t("deck.added.card", { name: card.name }));
        button.appendChild(createCardTile(card, { size: "s" }));
        const mark = document.createElement("span");
        mark.className = `${LOCK_MARK_CLASS} ${ADDED_MARK}`;
        mark.appendChild(createPlusIcon());
        button.appendChild(mark);
        button.addEventListener("click", () => onRemove(index));
        item.appendChild(button);
        list.appendChild(item);
        return button;
    });
}

export interface SpareHandlers {
    onAdd(id: number): void;
    onRemove(id: number): void;
    onToggleForbid(id: number): void;
}

export interface SpareList {
    // Shows the rules on the rows that already exist; `canAdd` says whether a card can take another copy.
    update(rules: DeckRules, canAdd: (id: number) => boolean): void;
}

const ROW_BUTTON = "wb-btn !min-h-8 !px-3 text-sm";

function rowButton(label: string, action: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.className = ROW_BUTTON;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

// The spare cards as a compact list: name, ATK or card type, the copies still left, and the rules the player
// can set on the card. The buttons wrap onto their own line under the name, so a narrow screen never scrolls.
export function renderSpareList(
    list: HTMLElement,
    rows: readonly SpareRow[],
    handlers: SpareHandlers
): SpareList {
    const locale = getLang();
    const parts = rows.map(({ card, count }) => {
        const item = document.createElement("li");
        item.className =
            "flex flex-wrap items-baseline gap-x-3 gap-y-2 px-2 py-1.5 border-t border-wb-rule first:border-t-0";
        const name = document.createElement("span");
        name.className = "min-w-0 flex-1 basis-32 font-bold [overflow-wrap:anywhere]";
        name.textContent = card.name;
        const stat = document.createElement("span");
        stat.className = "text-sm text-wb-mute tabular-nums whitespace-nowrap";
        stat.textContent = card.isMonster
            ? t("deck.trunk.atk", { value: card.attack.toLocaleString(locale) })
            : card.typeName;
        const copies = document.createElement("span");
        copies.className = "font-bold tabular-nums";
        const state = document.createElement("span");
        state.className = "basis-full text-sm font-bold text-wb-red";
        state.textContent = t("deck.rule.forbidden");

        const buttons = document.createElement("div");
        buttons.className = "basis-full flex flex-wrap gap-2";
        const add = rowButton(t("deck.rule.add"), "add", () => handlers.onAdd(card.id));
        add.setAttribute("aria-label", t("deck.rule.add-card", { name: card.name }));
        const remove = rowButton(t("deck.rule.remove"), "remove", () => handlers.onRemove(card.id));
        remove.setAttribute("aria-label", t("deck.rule.remove-card", { name: card.name }));
        const forbid = rowButton(t("deck.rule.forbid"), "forbid", () => handlers.onToggleForbid(card.id));
        forbid.setAttribute("aria-label", t("deck.rule.forbid-card", { name: card.name }));
        forbid.className = `${ROW_BUTTON} aria-pressed:!bg-wb-red aria-pressed:!text-white`;
        buttons.append(add, remove, forbid);

        item.append(name, stat, copies, state, buttons);
        list.appendChild(item);
        return { card, count, item, copies, state, add, remove, forbid };
    });

    const update = (rules: DeckRules, canAdd: (id: number) => boolean): void => {
        for (const { card, count, item, copies, state, add, remove, forbid } of parts) {
            const added = rules.added.get(card.id) ?? 0;
            const forbidden = rules.forbidden.includes(card.id);
            const hadFocus = document.activeElement;
            copies.textContent = `×${count - added}`;
            item.dataset.forbidden = String(forbidden);
            state.hidden = !forbidden;
            forbid.setAttribute("aria-pressed", String(forbidden));
            remove.hidden = added === 0;
            add.disabled = !canAdd(card.id);
            // A button that hides or turns off while it holds the focus would drop it on the page: hand it to
            // the one that takes over, so the keyboard keeps its place.
            if (hadFocus === remove && remove.hidden) add.focus();
            else if (hadFocus === add && add.disabled && !remove.hidden) remove.focus();
        }
    };
    return { update };
}
