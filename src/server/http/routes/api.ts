import { type NextFunction, type Request, type Response, Router } from "express";
import express from "express";
import {
    DECK_SIZE,
    MAX_HAND_SIZE,
    MAX_TRUNK_COUNT,
    MAX_COPIES_PER_CARD,
    copyLimit,
} from "../../../shared/limits.js";
import type { DeckLock, DeckOptimizeRequest, DeckTrunkEntry } from "../../../shared/types.js";
import { findCombinations } from "../../domain/calculator.js";
import { findBestChains } from "../../domain/chain-search.js";
import { getEquipsFor } from "../../domain/equips.js";
import { getFusionsFor } from "../../domain/fusions.js";
import { getResultsFor } from "../../domain/results.js";
import { findCardByExactName } from "../../domain/search.js";
import { isMonster, listCardIndex, toCardSummary } from "../../domain/cards.js";
import { getAllCards, getCardById } from "../../data/store.js";
import {
    OptimizerAbortedError,
    OptimizerBusyError,
    createDeckOptimizerService,
    type DeckOptimizerService,
} from "../../workers/deck-optimizer-runner.js";

// Seconds a client is told to wait before it asks for a deck optimisation again.
const BUSY_RETRY_SECONDS = 5;

interface ApiError {
    code: string;
    message: string;
    details?: unknown;
}

function sendError(res: Response, status: number, error: ApiError): void {
    res.status(status).json({ error });
}

function parseId(raw: string | string[] | undefined): number | null {
    if (typeof raw !== "string") return null;
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHand(value: unknown): value is number[] {
    return (
        Array.isArray(value) &&
        value.every((id: unknown) => typeof id === "number" && Number.isInteger(id) && id > 0)
    );
}

// Shared by both POST endpoints: sends the 400 itself and returns null when the hand cannot be used.
function readHandIds(req: Request, res: Response): number[] | null {
    const handIds: unknown = isRecord(req.body) ? req.body.handIds : undefined;
    if (!isHand(handIds)) {
        sendError(res, 400, {
            code: "invalid-hand",
            message: "Body must include handIds as an array of positive integers",
        });
        return null;
    }
    if (handIds.length > MAX_HAND_SIZE) {
        sendError(res, 400, {
            code: "hand-too-large",
            message: `handIds must not exceed ${MAX_HAND_SIZE} cards`,
        });
        return null;
    }
    return handIds;
}

function isCardId(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// Copies of each card the player owns: the deck's and the trunk's.
function ownedCopies(deck: readonly number[], trunk: readonly DeckTrunkEntry[]): Map<number, number> {
    const owned = new Map<number, number>();
    for (const id of deck) owned.set(id, (owned.get(id) ?? 0) + 1);
    for (const { id, count } of trunk) owned.set(id, (owned.get(id) ?? 0) + count);
    return owned;
}

// The locks of a deck request, or null when they are malformed: at most one entry per card of the deck, with
// distinct ids of known cards, and counts from 1 up to the copies the deck may hold of that card (the copies
// owned, up to the copy limit), which may be more than the deck holds now. Omitted means none.
function readLocks(
    locked: unknown,
    deck: readonly number[],
    owned: ReadonlyMap<number, number>
): DeckLock[] | null {
    if (locked === undefined) return [];
    if (!Array.isArray(locked) || locked.length > DECK_SIZE) return null;
    const inDeck = new Map<number, number>();
    for (const id of deck) inDeck.set(id, (inDeck.get(id) ?? 0) + 1);
    const seen = new Set<number>();
    const locks: DeckLock[] = [];
    for (const entry of locked as unknown[]) {
        if (!isRecord(entry) || !isCardId(entry.id) || seen.has(entry.id)) return null;
        const { id, count } = entry;
        if (getCardById(id) === undefined) return null;
        if (typeof count !== "number" || !Number.isInteger(count) || count < 1) return null;
        if (count > copyLimit(owned.get(id) ?? 0, inDeck.get(id) ?? 0)) return null;
        seen.add(id);
        locks.push({ id, count });
    }
    return locks;
}

// The forbidden cards of a deck request, or null when they are malformed: at most one entry per card the
// player owns, distinct ids of known cards the player owns, none of them locked. Omitted means none.
function readForbidden(
    forbidden: unknown,
    owned: ReadonlyMap<number, number>,
    locks: readonly DeckLock[]
): number[] | null {
    if (forbidden === undefined) return [];
    if (!Array.isArray(forbidden) || forbidden.length > owned.size) return null;
    const locked = new Set(locks.map(({ id }) => id));
    const seen = new Set<number>();
    for (const id of forbidden as unknown[]) {
        if (!isCardId(id) || seen.has(id) || locked.has(id)) return null;
        if (getCardById(id) === undefined || (owned.get(id) ?? 0) === 0) return null;
        seen.add(id);
    }
    return [...seen];
}

// Whether any deck of the deck's size obeys the rules, worked out from the store's card data so the main
// thread never loads the hand evaluator. It mirrors `buildSearchSpace`: a forbidden card holds nothing, a
// non-monster of the deck is required when non-monsters are kept, a lock requires its copies, and only cards
// that are not kept can add copies above their requirement. Reports the copies the rules require and allow.
function deckFits(
    request: DeckOptimizeRequest,
    keepNonMonsters: boolean,
    owned: ReadonlyMap<number, number>
): { fits: boolean; required: number; allowed: number } {
    const inDeck = new Map<number, number>();
    for (const id of request.deck) inDeck.set(id, (inDeck.get(id) ?? 0) + 1);
    const locks = new Map((request.locked ?? []).map(({ id, count }) => [id, count]));
    const banned = new Set(request.forbidden ?? []);
    let required = 0;
    let allowed = 0;
    for (const [id, copies] of owned) {
        if (banned.has(id)) continue;
        const card = getCardById(id);
        const kept = keepNonMonsters && card !== undefined && !isMonster(card);
        const limit = copyLimit(copies, inDeck.get(id) ?? 0);
        const minimum = Math.max(kept ? (inDeck.get(id) ?? 0) : 0, Math.min(locks.get(id) ?? 0, limit));
        required += minimum;
        allowed += kept ? minimum : limit;
    }
    return { fits: required <= DECK_SIZE && DECK_SIZE <= allowed, required, allowed };
}

// Reads the body of POST /deck/optimize: sends the 400 itself and returns null when it cannot be used. The
// counts are only checked for shape and range here; the optimiser trusts nothing beyond them.
function readDeckRequest(req: Request, res: Response): DeckOptimizeRequest | null {
    const body: Record<string, unknown> = isRecord(req.body) ? req.body : {};
    const { deck, trunk, keepNonMonsters, locked, forbidden } = body;

    if (!Array.isArray(deck) || deck.length !== DECK_SIZE || !deck.every(isCardId)) {
        sendError(res, 400, {
            code: "invalid-deck",
            message: `Body must include deck as an array of exactly ${DECK_SIZE} positive integers`,
        });
        return null;
    }
    // A save never holds more distinct cards than the game has, so a longer trunk is malformed.
    const entries: unknown[] = Array.isArray(trunk) ? trunk : [];
    const trunkIds = new Set<number>();
    const trunkOk =
        Array.isArray(trunk) &&
        entries.length <= getAllCards().length &&
        entries.every((entry) => {
            if (!isRecord(entry) || !isCardId(entry.id) || trunkIds.has(entry.id)) return false;
            trunkIds.add(entry.id);
            const { count } = entry;
            return (
                typeof count === "number" &&
                Number.isInteger(count) &&
                count >= 0 &&
                count <= MAX_TRUNK_COUNT
            );
        });
    if (!trunkOk) {
        sendError(res, 400, {
            code: "invalid-trunk",
            message: `Body must include trunk as an array of { id, count } with distinct ids and counts from 0 to ${MAX_TRUNK_COUNT}`,
        });
        return null;
    }
    if (keepNonMonsters !== undefined && typeof keepNonMonsters !== "boolean") {
        sendError(res, 400, { code: "invalid-options", message: "keepNonMonsters must be a boolean" });
        return null;
    }
    const unknown = [...deck, ...trunkIds].find((id: number) => getCardById(id) === undefined);
    if (unknown !== undefined) {
        sendError(res, 400, { code: "unknown-card", message: `No card with id ${unknown}` });
        return null;
    }
    const cards = deck as number[];
    const spare = (entries as Array<{ id: number; count: number }>).map(({ id, count }) => ({ id, count }));
    const owned = ownedCopies(cards, spare);
    const locks = readLocks(locked, cards, owned);
    if (locks === null) {
        sendError(res, 400, {
            code: "invalid-locks",
            message: `locked must be an array of at most ${DECK_SIZE} { id, count } with distinct ids of known cards, and counts from 1 up to the copies of that card the deck may hold (the copies owned, up to ${MAX_COPIES_PER_CARD})`,
        });
        return null;
    }
    const banned = readForbidden(forbidden, owned, locks);
    if (banned === null) {
        sendError(res, 400, {
            code: "invalid-forbidden",
            message: `forbidden must be an array of distinct ids of cards you own, at most ${owned.size} of them, none of them in locked`,
        });
        return null;
    }
    const request: DeckOptimizeRequest = {
        deck: cards,
        trunk: spare,
        ...(keepNonMonsters === undefined ? {} : { keepNonMonsters }),
        ...(locks.length === 0 ? {} : { locked: locks }),
        ...(banned.length === 0 ? {} : { forbidden: banned }),
    };
    const { fits, required, allowed } = deckFits(request, keepNonMonsters ?? true, owned);
    if (!fits) {
        sendError(res, 400, {
            code: "impossible-deck",
            message: `The rules leave no deck of ${DECK_SIZE} cards: they require ${required} cards and allow ${allowed}`,
            details: { required, allowed, size: DECK_SIZE },
        });
        return null;
    }
    return request;
}

export interface ApiDependencies {
    // Runs the deck optimisation; replaceable so tests need no worker thread.
    deckOptimizer?: DeckOptimizerService;
}

export function apiRouter({ deckOptimizer = createDeckOptimizerService() }: ApiDependencies = {}): Router {
    const router = Router();
    router.use(express.json({ limit: "32kb" }));

    router.get("/cards-index", (_req: Request, res: Response): void => {
        res.json({ cards: listCardIndex() });
    });

    router.get("/cards", (req: Request, res: Response): void => {
        const name = req.query.name;
        if (typeof name !== "string" || name.length === 0) {
            sendError(res, 400, { code: "missing-name", message: "Query param 'name' is required" });
            return;
        }
        const card = findCardByExactName(name);
        if (!card) {
            sendError(res, 404, { code: "card-not-found", message: `No card matches name "${name}"` });
            return;
        }
        res.json({ card });
    });

    router.get("/cards/:id", (req: Request, res: Response): void => {
        const id = parseId(req.params.id);
        if (id === null) {
            sendError(res, 400, { code: "invalid-id", message: "Card id must be a positive integer" });
            return;
        }
        const card = getCardById(id);
        if (!card) {
            sendError(res, 404, { code: "card-not-found", message: `No card with id ${id}` });
            return;
        }
        res.json({ card: toCardSummary(card) });
    });

    router.get("/fusions/:id", (req: Request, res: Response): void => {
        const id = parseId(req.params.id);
        if (id === null) {
            sendError(res, 400, { code: "invalid-id", message: "Card id must be a positive integer" });
            return;
        }
        const result = getFusionsFor(id);
        if (!result) {
            sendError(res, 404, { code: "card-not-found", message: `No card with id ${id}` });
            return;
        }
        res.json(result);
    });

    router.get("/results/:id", (req: Request, res: Response): void => {
        const id = parseId(req.params.id);
        if (id === null) {
            sendError(res, 400, { code: "invalid-id", message: "Card id must be a positive integer" });
            return;
        }
        const results = getResultsFor(id);
        if (results === null) {
            sendError(res, 404, { code: "card-not-found", message: `No card with id ${id}` });
            return;
        }
        res.json({ results });
    });

    router.get("/equips/:id", (req: Request, res: Response): void => {
        const id = parseId(req.params.id);
        if (id === null) {
            sendError(res, 400, { code: "invalid-id", message: "Card id must be a positive integer" });
            return;
        }
        const equips = getEquipsFor(id);
        if (equips === null) {
            sendError(res, 404, { code: "card-not-found", message: `No card with id ${id}` });
            return;
        }
        res.json({ equips });
    });

    router.post("/calculator", (req: Request, res: Response): void => {
        const handIds = readHandIds(req, res);
        if (handIds === null) return;
        const out = findCombinations({ handIds });
        res.json(out);
    });

    router.post("/chain-search", (req: Request, res: Response): void => {
        const handIds = readHandIds(req, res);
        if (handIds === null) return;
        const { chains, truncated } = findBestChains(handIds);
        res.json({ chains, truncated });
    });

    router.post("/deck/optimize", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const request = readDeckRequest(req, res);
        if (request === null) return;
        // The client closing the connection before the answer is sent stops the optimisation.
        const abort = new AbortController();
        res.on("close", () => {
            if (!res.writableEnded) abort.abort();
        });
        try {
            res.json(await deckOptimizer.optimize(request, abort.signal));
        } catch (error) {
            if (error instanceof OptimizerAbortedError) return;
            if (!(error instanceof OptimizerBusyError)) {
                next(error);
                return;
            }
            res.setHeader("Retry-After", String(BUSY_RETRY_SECONDS));
            sendError(res, 503, {
                code: "busy",
                message: "Another deck optimisation is running; try again in a few seconds",
            });
        }
    });

    return router;
}
