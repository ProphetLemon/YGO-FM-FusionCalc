import type { CardSummary } from "../../shared/types.js";
import { createCardImg } from "../lib/card-image.js";

// How the API names the Equip card type (`cardTypes` in types-and-stars.json).
const EQUIP_TYPE_NAME = "Equip";

// The frame colour of a card tile (D7): a card a fusion made is `fusion`; otherwise a monster, an Equip or
// any other spell-like card gets its own.
export type CardKind = "monster" | "fusion" | "equip" | "magic";

// Literal strings, so Tailwind sees every class.
export const KIND_FRAME_CLASS: Record<CardKind, string> = {
    monster: "bg-card-monster",
    fusion: "bg-card-fusion",
    equip: "bg-card-equip",
    magic: "bg-card-magic",
};

// xs: 56px, artwork only (the name is the image's); s: 88px; l: 150px.
export type TileSize = "xs" | "s" | "l";

const SIZE_CLASS: Record<TileSize, string> = {
    xs: "w-14 p-[3px] border-2",
    s: "w-[88px] p-1 border-2",
    l: "w-[150px] p-1 border-[3px]",
};
const NAME_SIZE_CLASS: Record<Exclude<TileSize, "xs">, string> = {
    s: "min-h-8 text-xs",
    l: "min-h-[42px] text-[15px]",
};
const STAT_SIZE_CLASS: Record<Exclude<TileSize, "xs">, string> = {
    s: "text-xs py-px",
    l: "text-[15px] py-[3px]",
};

const TILE_CLASS =
    "card-tile relative flex flex-col aspect-[2/3] shrink-0 border-wb-ink text-wb-ink " +
    "shadow-[inset_1px_1px_0_#fff,inset_-1px_-1px_0_rgb(0_0_0/0.25)]";

export function isEquipCard(card: CardSummary): boolean {
    return card.typeName === EQUIP_TYPE_NAME;
}

// The kind of a card that was not made by a fusion; pass `fusion` explicitly for one that was.
export function cardKind(card: CardSummary): CardKind {
    if (card.isMonster) return "monster";
    return isEquipCard(card) ? "equip" : "magic";
}

// "ATK / DEF" for a monster, the card type for anything else.
export function cardStat(card: CardSummary): string {
    return card.isMonster ? `${card.attack} / ${card.defense}` : card.typeName;
}

export interface CardTileOptions {
    size: TileSize;
    // Defaults to the kind the card has by itself.
    kind?: CardKind;
}

// A card as the Workbench draws it: frame by kind, a name strip, the real artwork in a dark well (a
// placeholder when it has none) and a stat strip. Independent from the tiles of the hand slots.
export function createCardTile(card: CardSummary, options: CardTileOptions): HTMLElement {
    const { size } = options;
    const kind = options.kind ?? cardKind(card);

    const tile = document.createElement("div");
    tile.className = `${TILE_CLASS} ${SIZE_CLASS[size]} ${KIND_FRAME_CLASS[kind]}`;
    tile.dataset.kind = kind;
    tile.dataset.size = size;

    if (size !== "xs") {
        const name = document.createElement("div");
        name.className =
            `card-tile-name ${NAME_SIZE_CLASS[size]} px-1 py-0.5 bg-white/70 font-body font-bold leading-tight ` +
            "flex items-center [overflow-wrap:anywhere] line-clamp-2";
        name.textContent = card.name;
        tile.appendChild(name);
    }

    const art = document.createElement("div");
    art.className = `wb-art relative flex-1 min-h-0 overflow-hidden ${size === "xs" ? "" : "my-[3px]"}`;
    art.appendChild(createCardImg(card.name, card.imageCode, "absolute inset-0", { compact: true }));
    tile.appendChild(art);

    if (size !== "xs") {
        const stat = document.createElement("div");
        stat.className =
            `card-tile-stat ${STAT_SIZE_CLASS[size]} px-1 bg-white/70 font-body font-bold text-center ` +
            "whitespace-nowrap overflow-hidden";
        stat.textContent = cardStat(card);
        tile.appendChild(stat);
    }
    return tile;
}
