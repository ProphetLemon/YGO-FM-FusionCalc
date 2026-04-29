export function mountNavbar(root: ParentNode = document): void {
    const toggle = root.querySelector<HTMLButtonElement>("[data-navbar-toggle]");
    const collapse = root.querySelector<HTMLElement>("[data-navbar-collapse]");
    if (!toggle || !collapse) return;

    toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        const next = !expanded;
        toggle.setAttribute("aria-expanded", String(next));
        collapse.classList.toggle("hidden", !next);
    });
}
