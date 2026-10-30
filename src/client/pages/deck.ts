import { mountNavbar } from "../components/navbar.js";
import { renderDeckResults } from "../components/deck-results.js";
import {
    createLockGrid,
    renderAddedList,
    renderSpareList,
    type LockGrid,
    type SpareList,
} from "../components/deck-locks.js";
import { getCardsIndex, optimizeDeck } from "../lib/api.js";
import {
    addCopy,
    addedCards,
    buildDeckRequest,
    canAdd,
    classifyDeckFailure,
    defaultRules,
    lockedCards,
    lowersAverage,
    readSaveFile,
    removeCopy,
    spareRows,
    summarizeSave,
    toggleForbid,
    toggleLock,
    type CardLookup,
    type DeckFailure,
    type DeckRules,
} from "../lib/deck-view.js";
import { clear, qs } from "../lib/dom.js";
import { MAX_SAVE_FILE_BYTES, type FmSave } from "../lib/fm-save.js";
import { getLang, t } from "../lib/i18n.js";

document.addEventListener("DOMContentLoaded", () => {
    mountNavbar();
    mountDeckPage();
});

function mountDeckPage(): void {
    const fileInput = qs<HTMLInputElement>("#deck-file");
    const fileMsg = qs<HTMLElement>("#deck-file-msg");
    const chooser = qs<HTMLFieldSetElement>("#deck-chooser");
    const chooserLegend = qs<HTMLElement>("#deck-chooser-legend");
    const chooserOptions = qs<HTMLElement>("#deck-chooser-options");
    const collection = qs<HTMLElement>("#deck-collection");
    const deckCount = qs<HTMLElement>("#deck-count");
    const spareCount = qs<HTMLElement>("#spare-count");
    const spareKinds = qs<HTMLElement>("#spare-kinds");
    const noSpare = qs<HTMLElement>("#deck-no-spare");
    const lockCount = qs<HTMLElement>("#lock-count");
    const lockHost = qs<HTMLElement>("#deck-lock-grid");
    const addedBox = qs<HTMLElement>("#deck-added");
    const addedList = qs<HTMLElement>("#deck-added-list");
    const trunk = qs<HTMLDetailsElement>("#deck-trunk");
    const trunkSummary = qs<HTMLElement>("#deck-trunk-summary");
    const trunkList = qs<HTMLElement>("#deck-trunk-list");
    const computeBtn = qs<HTMLButtonElement>("#deck-compute");
    const computeMsg = qs<HTMLElement>("#deck-compute-msg");
    const status = qs<HTMLElement>("#deck-status");
    const hint = qs<HTMLElement>("#deck-results-hint");
    const loading = qs<HTMLElement>("#deck-loading");
    const results = qs<HTMLElement>("#deck-results");

    if (
        !fileInput ||
        !fileMsg ||
        !chooser ||
        !chooserLegend ||
        !chooserOptions ||
        !collection ||
        !deckCount ||
        !spareCount ||
        !spareKinds ||
        !noSpare ||
        !lockCount ||
        !lockHost ||
        !addedBox ||
        !addedList ||
        !trunk ||
        !trunkSummary ||
        !trunkList ||
        !computeBtn ||
        !computeMsg ||
        !status ||
        !hint ||
        !loading ||
        !results
    ) {
        return;
    }

    let saves: FmSave[] = [];
    let selected = 0;
    // The catalog of cards, which names the cards of the save, and the rules set on the chosen save.
    let cards: CardLookup = new Map();
    let rules: DeckRules = { locked: [], added: new Map(), forbidden: [] };
    let lockGrid: LockGrid | null = null;
    let spareList: SpareList | null = null;
    // The request in flight, if any, and the timer of a "busy" countdown, if one is running.
    let running: AbortController | null = null;
    let countdown: number | null = null;

    const announce = (message: string): void => {
        status.textContent = message;
    };

    const stopCountdown = (): void => {
        if (countdown !== null) window.clearInterval(countdown);
        countdown = null;
    };

    const setComputing = (computing: boolean): void => {
        computeBtn.setAttribute("aria-disabled", String(computing));
        computeBtn.textContent = computing ? t("deck.btn.computing") : t("deck.btn.compute");
    };

    // Whatever was calculated, or is being, no longer matches the file or the rules once they change.
    const discardAnswer = (): void => {
        running?.abort();
        running = null;
        stopCountdown();
        setComputing(false);
        clear(computeMsg);
        clear(results);
        results.hidden = true;
        loading.hidden = true;
        hint.hidden = false;
        announce("");
    };

    const showMessage = (where: HTMLElement, message: string): HTMLElement => {
        clear(where);
        const box = document.createElement("div");
        box.className = "sink p-3 font-bold text-wb-red";
        box.setAttribute("role", "alert");
        box.textContent = message;
        where.appendChild(box);
        return box;
    };

    const renderSummary = (): void => {
        const save = saves[selected];
        if (!save) return;
        const summary = summarizeSave(save);
        const locale = getLang();
        deckCount.textContent = summary.deckCards.toLocaleString(locale);
        spareCount.textContent = summary.spareCards.toLocaleString(locale);
        spareKinds.textContent = summary.spareKinds.toLocaleString(locale);
        noSpare.hidden = summary.spareCards > 0;
    };

    const renderRulesCount = (): void => {
        lockCount.textContent = t("deck.rules.count", {
            locked: rules.locked.filter(Boolean).length,
            total: rules.locked.length,
            added: [...rules.added.values()].reduce((total, count) => total + count, 0),
            forbidden: rules.forbidden.length,
        });
    };

    // The copies added, one entry per copy, in the order the player added the cards.
    const addedEntries = (): number[] =>
        [...rules.added].flatMap(([id, count]) => Array<number>(count).fill(id));

    // Takes an added copy back out. The focus goes to the next added tile, or to the summary of the spare cards
    // when none is left, so it never falls back to the top of the page.
    const removeAddedAt = (index: number): void => {
        const id = addedEntries()[index];
        if (id === undefined) return;
        setRules(removeCopy(rules, id));
        const buttons = addedList.querySelectorAll<HTMLButtonElement>("button");
        (buttons[Math.min(index, buttons.length - 1)] ?? trunkSummary).focus();
    };

    const renderAdded = (): void => {
        clear(addedList);
        const entries = addedEntries().flatMap((id) => {
            const card = cards.get(id);
            return card ? [card] : [];
        });
        addedBox.hidden = entries.length === 0;
        renderAddedList(addedList, entries, removeAddedAt);
    };

    // Shows the rules everywhere in place, so the focus stays where it is, and drops the answer they outdate.
    const setRules = (next: DeckRules): void => {
        const save = saves[selected];
        if (!save) return;
        rules = next;
        lockGrid?.update(rules);
        spareList?.update(rules, (id) => canAdd(rules, save, id));
        renderAdded();
        renderRulesCount();
        discardAnswer();
    };

    // The deck as tiles to lock or forbid, and the spare cards, for the chosen save. Every choice of save starts
    // from the default rules.
    const renderCards = (): void => {
        const save = saves[selected];
        if (!save) return;
        rules = defaultRules(save.deck, cards);
        const slots = save.deck.flatMap((id) => {
            const card = cards.get(id);
            return card ? [card] : [];
        });
        lockGrid = createLockGrid(slots, rules, {
            onToggleLock: (slot) => setRules(toggleLock(rules, save.deck, slot)),
            onToggleForbid: (id) => setRules(toggleForbid(rules, save.deck, id)),
        });
        clear(lockHost);
        lockHost.appendChild(lockGrid.element);

        const rows = spareRows(save, cards);
        clear(trunkList);
        spareList = renderSpareList(trunkList, rows, {
            onAdd: (id) => setRules(addCopy(rules, save, id)),
            onRemove: (id) => setRules(removeCopy(rules, id)),
            onToggleForbid: (id) => setRules(toggleForbid(rules, save.deck, id)),
        });
        spareList.update(rules, (id) => canAdd(rules, save, id));
        renderAdded();
        renderRulesCount();
        trunkSummary.textContent = t("deck.trunk.summary", {
            count: summarizeSave(save).spareCards.toLocaleString(getLang()),
        });
        trunk.hidden = rows.length === 0;
        trunk.open = false;
    };

    const renderChooser = (): void => {
        clear(chooserOptions);
        chooser.hidden = saves.length < 2;
        if (saves.length < 2) return;
        chooserLegend.textContent = t("deck.chooser.legend", { count: saves.length });
        saves.forEach((save, index) => {
            const summary = summarizeSave(save);
            const label = document.createElement("label");
            label.className = "flex items-start gap-3 min-h-11 cursor-pointer";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "deck-save";
            radio.value = String(index);
            radio.checked = index === selected;
            radio.className = "mt-0.5 size-6 shrink-0 accent-wb-blue";
            radio.addEventListener("change", () => {
                selected = index;
                discardAnswer();
                renderSummary();
                renderCards();
            });
            const text = document.createElement("span");
            const name = document.createElement("span");
            name.className = "block font-bold";
            name.textContent = t("deck.chooser.option", { n: index + 1 });
            const detail = document.createElement("span");
            detail.className = "block text-sm text-wb-mute";
            detail.textContent = t("deck.chooser.detail", {
                deck: summary.deckCards,
                spare: summary.spareCards,
            });
            text.append(name, detail);
            label.append(radio, text);
            chooserOptions.appendChild(label);
        });
    };

    const resetFile = (): void => {
        saves = [];
        selected = 0;
        collection.hidden = true;
        chooser.hidden = true;
        clear(chooserOptions);
        clear(fileMsg);
    };

    fileInput.addEventListener("change", () => {
        discardAnswer();
        resetFile();
        const file = fileInput.files?.[0];
        if (!file) return;
        void readSaveFile(file).then(async (read) => {
            // A newer choice, or none, replaced this file while it was being read.
            if (fileInput.files?.[0] !== file) return;
            if (!read.ok) {
                const max = MAX_SAVE_FILE_BYTES / (1024 * 1024);
                showMessage(fileMsg, t(`deck.error.${read.error}`, { max }));
                return;
            }
            // The save holds only card numbers: the catalog gives them a name, a kind and an image.
            try {
                cards = new Map((await getCardsIndex()).map((card) => [card.id, card]));
            } catch {
                if (fileInput.files?.[0] === file) showMessage(fileMsg, t("deck.error.catalog"));
                return;
            }
            if (fileInput.files?.[0] !== file) return;
            saves = read.saves;
            renderChooser();
            renderSummary();
            renderCards();
            collection.hidden = false;
        });
    });

    const failureMessage = (failure: DeckFailure): string => t(`deck.error.${failure.kind}`);

    // After a busy answer the retry waits for the time the server asked for, counting down on the button.
    const showFailure = (failure: DeckFailure): void => {
        const box = showMessage(computeMsg, failureMessage(failure));
        // Asking again cannot change what the rules make impossible: the player has to change a rule.
        if (failure.kind === "impossible") return;
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "wb-btn mt-3 block text-wb-ink";
        retry.textContent = t("deck.btn.retry");
        retry.addEventListener("click", () => void compute());
        box.appendChild(retry);
        if (failure.kind !== "busy" || failure.retryAfter === undefined) return;
        let left = failure.retryAfter;
        retry.disabled = true;
        retry.textContent = t("deck.btn.retry-in", { seconds: left });
        countdown = window.setInterval(() => {
            left -= 1;
            if (left > 0) {
                retry.textContent = t("deck.btn.retry-in", { seconds: left });
                return;
            }
            stopCountdown();
            retry.disabled = false;
            retry.textContent = t("deck.btn.retry");
        }, 1000);
    };

    const compute = async (): Promise<void> => {
        const save = saves[selected];
        if (!save || running) return;
        stopCountdown();
        clear(computeMsg);
        results.hidden = true;
        clear(results);
        hint.hidden = true;
        loading.hidden = false;
        setComputing(true);
        announce(t("deck.results.loading"));

        const controller = new AbortController();
        running = controller;
        const request = buildDeckRequest(save, rules);
        try {
            const answer = await optimizeDeck(request, controller.signal);
            if (controller.signal.aborted) return;
            const view = renderDeckResults(answer, {
                currentDeck: save.deck,
                locked: lockedCards(save.deck, rules.locked),
                added: addedCards(rules),
                hasRules: request.locked!.length > 0 || request.forbidden!.length > 0,
            });
            results.appendChild(view.element);
            loading.hidden = true;
            results.hidden = false;
            const count = answer.swaps.length;
            const ready =
                count === 0
                    ? t("deck.results.ready-none")
                    : count === 1
                      ? t("deck.results.ready-one")
                      : t("deck.results.ready", { count });
            // The rules can leave a deck below the current one, and the announcement must not hide that.
            announce(
                lowersAverage(answer.current, answer.recommended)
                    ? `${ready} ${t("deck.verdict.loss")}`
                    : ready
            );
            view.heading.focus();
        } catch (error) {
            // Aborted on purpose (new file, new rules): the page already moved on.
            if (controller.signal.aborted) return;
            loading.hidden = true;
            hint.hidden = false;
            announce("");
            showFailure(classifyDeckFailure(error));
        } finally {
            if (running === controller) {
                running = null;
                setComputing(false);
            }
        }
    };

    computeBtn.addEventListener("click", () => {
        // aria-disabled keeps the button focusable while a calculation runs, so the click is ignored here.
        if (computeBtn.getAttribute("aria-disabled") === "true") return;
        void compute();
    });
}
