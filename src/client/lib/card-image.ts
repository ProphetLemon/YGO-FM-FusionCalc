const CDN = "https://images.ygoprodeck.com/images/cards";

// A code that names no file: empty, or all zeros, the password of a card that has none.
const NO_CODE = /^0*$/;

const PLACEHOLDER_CLASS = "card-placeholder wb-art w-full h-full overflow-hidden";
const NAMED_CLASS =
    "flex items-center justify-center p-2 text-center text-xs sm:text-sm leading-tight text-wb-art-text font-body";
// The width limit lets a long word wrap, and five lines are the most a hand slot on a phone has room for.
const NAME_CLASS = "min-w-0 max-w-full break-words line-clamp-5";

export interface CardImgOptions {
    // A thumbnail sits beside a label that already names the card, so its placeholder is a plain box.
    compact?: boolean;
}

export function hasArtwork(imageCode: string | null): imageCode is string {
    return typeof imageCode === "string" && !NO_CODE.test(imageCode);
}

export function cardImageUrl(imageCode: string): string {
    return `${CDN}/${imageCode}.jpg`;
}

function createPlaceholder(name: string, compact: boolean): HTMLElement {
    const box = document.createElement("div");
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", name);
    if (compact) {
        box.className = PLACEHOLDER_CLASS;
        return box;
    }
    box.className = `${PLACEHOLDER_CLASS} ${NAMED_CLASS}`;
    const label = document.createElement("span");
    label.className = NAME_CLASS;
    label.textContent = name;
    box.appendChild(label);
    return box;
}

// The artwork of a card. A placeholder takes its place when the card has none, and then nothing is requested,
// or when the CDN cannot serve the file.
export function createCardImg(
    name: string,
    imageCode: string | null,
    className: string,
    options: CardImgOptions = {}
): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = className;

    const placeholder = createPlaceholder(name, options.compact === true);
    if (!hasArtwork(imageCode)) {
        wrapper.appendChild(placeholder);
        return wrapper;
    }

    const img = document.createElement("img");
    img.src = cardImageUrl(imageCode);
    img.alt = name;
    img.loading = "lazy";
    img.className = "w-full h-full object-contain";

    placeholder.hidden = true;
    img.addEventListener("error", () => {
        img.hidden = true;
        placeholder.hidden = false;
    });

    wrapper.appendChild(img);
    wrapper.appendChild(placeholder);
    return wrapper;
}
