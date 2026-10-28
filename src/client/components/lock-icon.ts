const SVG_NS = "http://www.w3.org/2000/svg";

// The shackle of a closed padlock, and of one that is open.
const SHACKLE_CLOSED = "M7 11V7.5a5 5 0 0 1 10 0V11";
const SHACKLE_OPEN = "M7 11V7.5a5 5 0 0 1 9.6-1.9";

function svgPart<K extends "path" | "rect">(tag: K, attrs: Record<string, string>): SVGElement {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
}

// A padlock drawn in the colour of the text around it. It carries no name: the control or label that holds it
// says whether the card is locked.
export function createLockIcon(locked: boolean): SVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "size-4 shrink-0");
    svg.append(
        svgPart("path", {
            d: locked ? SHACKLE_CLOSED : SHACKLE_OPEN,
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "2.5",
            "stroke-linecap": "round",
            "data-part": "shackle",
        }),
        svgPart("rect", { x: "4.5", y: "11", width: "15", height: "10.5", rx: "1.5", fill: "currentColor" })
    );
    return svg;
}

export function setLockIcon(icon: SVGElement, locked: boolean): void {
    icon.querySelector('[data-part="shackle"]')?.setAttribute("d", locked ? SHACKLE_CLOSED : SHACKLE_OPEN);
}
