import { mountNavbar } from "../components/navbar.js";
import { Autocomplete } from "../components/autocomplete.js";
import { renderCardSummary } from "../components/card-display.js";
import { renderEquip, renderPair } from "../components/fusion-card.js";
import { getCardByName, getCardsIndex, getFusions, getResults } from "../lib/api.js";
import { clear, qs } from "../lib/dom.js";
import { t } from "../lib/i18n.js";

document.addEventListener("DOMContentLoaded", () => {
    mountNavbar();
    void mountSearchPage();
});

async function mountSearchPage(): Promise<void> {
    const input = qs<HTMLInputElement>("#cardname");
    const outputCard = qs<HTMLElement>("#outputcard");
    const outputLeft = qs<HTMLElement>("#output-area-left");
    const outputRight = qs<HTMLElement>("#output-area-right");
    const searchMsg = qs<HTMLElement>("#search-msg");
    const searchNameBtn = qs<HTMLButtonElement>("#search-name-btn");
    const searchResultsBtn = qs<HTMLButtonElement>("#search-results-btn");
    const resetBtn = qs<HTMLButtonElement>("#reset-btn");

    if (!input || !outputCard || !outputLeft || !outputRight || !searchMsg) {
        return;
    }

    new Autocomplete(input, {
        fetchList: async () => (await getCardsIndex()).map((c) => c.name),
        onSelect: () => run(runByName),
    });

    const clearAll = (): void => {
        clear(outputCard);
        clear(outputLeft);
        clear(outputRight);
        clear(searchMsg);
    };

    const showError = (message: string): void => {
        clear(searchMsg);
        const div = document.createElement("div");
        div.className = "sink p-3 font-bold text-wb-red";
        div.setAttribute("role", "alert");
        div.textContent = message;
        searchMsg.appendChild(div);
    };

    // The result list is itself the panel, so its entries stay direct children; the header is its title bar.
    const renderHeader = (where: HTMLElement, label: string, barClass: string): void => {
        const h2 = document.createElement("h2");
        h2.className = `win-bar win-title ${barClass}`;
        h2.textContent = label;
        where.appendChild(h2);
    };

    const runByName = async (): Promise<void> => {
        clearAll();
        const value = input.value.trim();
        if (value === "") {
            showError(t("search.error.empty"));
            return;
        }
        const card = await getCardByName(value);
        if (!card) {
            showError(t("search.error.not-found", { name: value }));
            return;
        }
        outputCard.appendChild(renderCardSummary(card));
        const data = await getFusions(card.id);
        if (!data) return;
        renderHeader(outputLeft, t("search.results.fusions"), "win-bar-green");
        for (const fusion of data.fusions) outputLeft.appendChild(renderPair(fusion));
        renderHeader(outputRight, t("search.results.equips"), "win-bar-red");
        for (const equip of data.equips) outputRight.appendChild(renderEquip(equip));
    };

    const runByResult = async (): Promise<void> => {
        clearAll();
        const value = input.value.trim();
        if (value === "") {
            showError(t("search.error.empty"));
            return;
        }
        const card = await getCardByName(value);
        if (!card) {
            showError(t("search.error.not-found", { name: value }));
            return;
        }
        outputCard.appendChild(renderCardSummary(card));
        const results = await getResults(card.id);
        if (!results || results.length === 0) return;
        renderHeader(outputLeft, t("search.results.fusions"), "win-bar-green");
        for (const entry of results) outputLeft.appendChild(renderPair(entry));
    };

    // A search whose request fails says so instead of ending as an unhandled rejection.
    const run = (search: () => Promise<void>): void => {
        search().catch(() => showError(t("card.label.lookup-failed")));
    };

    searchNameBtn?.addEventListener("click", () => run(runByName));
    searchResultsBtn?.addEventListener("click", () => run(runByResult));
    resetBtn?.addEventListener("click", () => {
        input.value = "";
        clearAll();
    });
    input.addEventListener("change", () => run(runByName));
}
