const CDN = "https://images.ygoprodeck.com/images/cards";

export function cardImageUrl(password: string): string {
    return `${CDN}/${password}.jpg`;
}

export function createCardImg(name: string, password: string, className: string): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = className;

    const img = document.createElement("img");
    img.src = cardImageUrl(password);
    img.alt = name;
    img.loading = "lazy";
    img.className = "w-full h-full object-contain";

    const fallback = document.createElement("div");
    fallback.className =
        "w-full h-full flex items-center justify-center bg-fm-primary/10 text-fm-primary/40 text-xs font-body hidden";
    fallback.textContent = "?";

    img.addEventListener("error", () => {
        img.classList.add("hidden");
        fallback.classList.remove("hidden");
    });

    wrapper.appendChild(img);
    wrapper.appendChild(fallback);
    return wrapper;
}
