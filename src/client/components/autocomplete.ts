import { rankNameMatches } from "../lib/name-search.js";

export interface AutocompleteOptions {
    fetchList: () => Promise<readonly string[]>;
    onSelect?: (value: string) => void;
    limit?: number;
}

const DEFAULT_LIMIT = 8;

const LIST_CLASSNAME =
    "absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white text-fm-primary rounded shadow-lg border border-fm-primary/30 hidden";
const ITEM_CLASSNAME = "px-3 py-1 cursor-pointer hover:bg-fm-search-bg";
const ITEM_ACTIVE_CLASSNAME = "px-3 py-1 cursor-pointer bg-fm-primary text-white";

export class Autocomplete {
    private input: HTMLInputElement;
    private list: HTMLUListElement;
    private wrapper: HTMLElement;
    private items: string[] = [];
    private filtered: string[] = [];
    private activeIndex = -1;
    private listLoaded: Promise<void> | null = null;

    constructor(
        input: HTMLInputElement,
        private options: AutocompleteOptions
    ) {
        this.input = input;
        const parent = input.parentElement;
        if (!parent) throw new Error("Autocomplete: input must have a parent element");
        if (getComputedStyle(parent).position === "static") {
            parent.style.position = "relative";
        }
        this.wrapper = parent;
        this.list = document.createElement("ul");
        this.list.className = LIST_CLASSNAME;
        this.list.setAttribute("role", "listbox");
        parent.appendChild(this.list);

        input.setAttribute("autocomplete", "off");
        input.setAttribute("role", "combobox");
        input.setAttribute("aria-autocomplete", "list");
        input.setAttribute("aria-expanded", "false");

        input.addEventListener("input", () => void this.onInput());
        input.addEventListener("keydown", (e) => this.onKeyDown(e));
        input.addEventListener("focus", () => void this.onInput());
        document.addEventListener("click", (e) => this.onDocumentClick(e));
    }

    private ensureLoaded(): Promise<void> {
        if (this.listLoaded === null) {
            const loading = (async () => {
                this.items = [...(await this.options.fetchList())];
            })();
            this.listLoaded = loading;
            // A failed load is forgotten, so the next input event asks for the list again.
            loading.catch(() => {
                if (this.listLoaded === loading) this.listLoaded = null;
            });
        }
        return this.listLoaded;
    }

    private async onInput(): Promise<void> {
        try {
            await this.ensureLoaded();
        } catch {
            // Without the list there is nothing to suggest; the input keeps working as a plain field.
            return;
        }
        // A slow or retried list can arrive after the user moved on: it must not open under another field.
        if (document.activeElement !== this.input) return;
        this.filtered = rankNameMatches(this.items, this.input.value, this.options.limit ?? DEFAULT_LIMIT);
        this.activeIndex = this.filtered.length > 0 ? 0 : -1;
        this.render();
    }

    private render(): void {
        while (this.list.firstChild) this.list.removeChild(this.list.firstChild);
        if (this.filtered.length === 0) {
            this.hide();
            return;
        }
        for (const [i, value] of this.filtered.entries()) {
            const li = document.createElement("li");
            li.textContent = value;
            li.className = i === this.activeIndex ? ITEM_ACTIVE_CLASSNAME : ITEM_CLASSNAME;
            li.setAttribute("role", "option");
            li.addEventListener("mousedown", (e) => {
                e.preventDefault();
                this.select(value);
            });
            this.list.appendChild(li);
        }
        this.list.classList.remove("hidden");
        this.input.setAttribute("aria-expanded", "true");
    }

    private hide(): void {
        this.list.classList.add("hidden");
        this.input.setAttribute("aria-expanded", "false");
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (this.list.classList.contains("hidden")) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            this.activeIndex = Math.min(this.activeIndex + 1, this.filtered.length - 1);
            this.render();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            this.activeIndex = Math.max(this.activeIndex - 1, 0);
            this.render();
        } else if (e.key === "Enter") {
            const value = this.filtered[this.activeIndex];
            if (value !== undefined) {
                e.preventDefault();
                this.select(value);
            }
        } else if (e.key === "Escape") {
            this.hide();
        } else if (e.key === "Tab") {
            const value = this.filtered[this.activeIndex];
            if (value !== undefined) this.select(value);
        }
    }

    private onDocumentClick(e: MouseEvent): void {
        if (!this.wrapper.contains(e.target as Node)) this.hide();
    }

    private select(value: string): void {
        this.input.value = value;
        this.hide();
        this.options.onSelect?.(value);
    }
}
