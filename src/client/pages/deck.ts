import { mountNavbar } from "../components/navbar.js";
import { renderDeckResults } from "../components/deck-results.js";
import { createLockGrid, renderSpareList, type LockGrid } from "../components/deck-locks.js";
import { getCardsIndex, optimizeDeck } from "../lib/api.js";
import {
    buildDeckRequest,
    classifyDeckFailure,
    defaultLocks,
    lockedCards,
    readSaveFile,
    spareRows,
    summarizeSave,
    type CardLookup,
    type DeckFailure,
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
    // The catalog of cards, which names the cards of the save, and the lock of each slot of the chosen deck.
    let cards: CardLookup = new Map();
    let locked: boolean[] = [];
    let lockGrid: LockGrid | null = null;
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

    // Whatever was calculated, or is being, no longer matches the file or the locks once they change.
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

    const renderLockCount = (): void => {
        lockCount.textContent = t("deck.lock.count", {
            locked: locked.filter(Boolean).length,
            total: locked.length,
        });
    };

    const toggleLock = (slot: number): void => {
        locked[slot] = !locked[slot];
        lockGrid?.update(locked);
        renderLockCount();
        discardAnswer();
    };

    // The deck as tiles to lock, and the spare cards, for the chosen save. Every choice of save starts from the
    // default locks.
    const renderCards = (): void => {
        const save = saves[selected];
        if (!save) return;
        locked = defaultLocks(save.deck, cards);
        const slots = save.deck.flatMap((id) => {
            const card = cards.get(id);
            return card ? [card] : [];
        });
        lockGrid = createLockGrid(slots, locked, toggleLock);
        clear(lockHost);
        lockHost.appendChild(lockGrid.element);
        renderLockCount();

        const rows = spareRows(save, cards);
        clear(trunkList);
        renderSpareList(trunkList, rows);
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
        const lockedNow = lockedCards(save.deck, locked);
        try {
            const answer = await optimizeDeck(buildDeckRequest(save, lockedNow), controller.signal);
            if (controller.signal.aborted) return;
            const view = renderDeckResults(answer, { currentDeck: save.deck, locked: lockedNow });
            results.appendChild(view.element);
            loading.hidden = true;
            results.hidden = false;
            const count = answer.swaps.length;
            announce(
                count === 0
                    ? t("deck.results.ready-none")
                    : count === 1
                      ? t("deck.results.ready-one")
                      : t("deck.results.ready", { count })
            );
            view.heading.focus();
        } catch (error) {
            // Aborted on purpose (new file, new locks): the page already moved on.
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
