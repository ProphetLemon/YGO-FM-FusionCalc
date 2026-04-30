import { mountNavbar } from "../components/navbar.js";
import { Autocomplete } from "../components/autocomplete.js";
import { renderPair } from "../components/fusion-card.js";
import { calculate, getCardByName, getCardsIndex } from "../lib/api.js";
import { clear, qs } from "../lib/dom.js";
import { t } from "../lib/i18n.js";

const HAND_SIZE = 5;

document.addEventListener("DOMContentLoaded", () => {
    mountNavbar();
    void mountCalculatorPage();
});

async function mountCalculatorPage(): Promise<void> {
    const outputLeft = qs<HTMLElement>("#outputarealeft");
    const outputRight = qs<HTMLElement>("#outputarearight");
    if (!outputLeft || !outputRight) return;

    const inputs: HTMLInputElement[] = [];
    const infos: HTMLElement[] = [];
    for (let i = 1; i <= HAND_SIZE; i++) {
        const input = qs<HTMLInputElement>(`#hand${i}`);
        const info = qs<HTMLElement>(`#hand${i}-info`);
        if (!input || !info) return;
        inputs.push(input);
        infos.push(info);
    }

    const cardsIndex = await getCardsIndex();
    const namesById = new Map(cardsIndex.map((c) => [c.id, c.name]));
    const idsByNameLower = new Map(cardsIndex.map((c) => [c.name.toLowerCase(), c.id]));

    const refresh = async (): Promise<void> => {
        clear(outputLeft);
        clear(outputRight);
        const handIds: number[] = [];
        for (const input of inputs) {
            const id = idsByNameLower.get(input.value.trim().toLowerCase());
            if (id !== undefined) handIds.push(id);
        }
        if (handIds.length < 2) return;
        const result = await calculate(handIds);
        appendHeader(outputLeft, t("search.results.fusions"));
        for (const fusion of result.fusions) outputLeft.appendChild(renderPair(fusion));
        appendHeader(outputRight, t("search.results.equips"));
        for (const equip of result.equips) outputRight.appendChild(renderPair(equip));
    };

    const updateInfo = async (input: HTMLInputElement, info: HTMLElement): Promise<void> => {
        info.textContent = "";
        const value = input.value.trim();
        if (value === "") return;
        const card = await getCardByName(value);
        if (!card) {
            info.textContent = t("card.label.invalid");
            return;
        }
        info.textContent = card.isMonster
            ? `(${card.attack}/${card.defense}) [${card.typeName}]`
            : `[${card.typeName}]`;
    };

    for (const [i, input] of inputs.entries()) {
        const info = infos[i];
        if (!info) continue;
        new Autocomplete(input, {
            fetchList: () => Promise.resolve([...namesById.values()].sort((a, b) => a.localeCompare(b))),
            onSelect: () => {
                void updateInfo(input, info).then(refresh);
            },
        });
        input.addEventListener("change", () => {
            void updateInfo(input, info).then(refresh);
        });
    }

    const resetBtn = qs<HTMLButtonElement>("#resetBtn");
    resetBtn?.addEventListener("click", () => {
        for (const [i, input] of inputs.entries()) {
            input.value = "";
            const info = infos[i];
            if (info) info.textContent = "";
        }
        clear(outputLeft);
        clear(outputRight);
    });
}

function appendHeader(where: HTMLElement, label: string): void {
    const h2 = document.createElement("h2");
    h2.className = "text-center my-4 font-display text-2xl";
    h2.textContent = label;
    where.appendChild(h2);
}
