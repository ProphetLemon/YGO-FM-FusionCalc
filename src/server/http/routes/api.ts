import { type Request, type Response, Router } from "express";
import express from "express";
import { DECK_SIZE, MAX_HAND_SIZE, MAX_TRUNK_COUNT } from "../../../shared/limits.js";
import type { DeckOptimizeRequest } from "../../../shared/types.js";
import { findCombinations } from "../../domain/calculator.js";
import { findBestChains } from "../../domain/chain-search.js";
import { optimizeDeck } from "../../domain/deck-optimizer.js";
import { getEquipsFor } from "../../domain/equips.js";
import { getFusionsFor } from "../../domain/fusions.js";
import { getResultsFor } from "../../domain/results.js";
import { findCardByExactName } from "../../domain/search.js";
import { toCardSummary } from "../../domain/cards.js";
import { getAllCards, getCardById, getCardIndex } from "../../data/store.js";

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

// Reads the body of POST /deck/optimize: sends the 400 itself and returns null when it cannot be used. The
// counts are only checked for shape and range here; the optimiser trusts nothing beyond them.
function readDeckRequest(req: Request, res: Response): DeckOptimizeRequest | null {
    const body: Record<string, unknown> = isRecord(req.body) ? req.body : {};
    const { deck, trunk, keepNonMonsters } = body;

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
    return {
        deck: deck as number[],
        trunk: (entries as Array<{ id: number; count: number }>).map(({ id, count }) => ({ id, count })),
        ...(keepNonMonsters === undefined ? {} : { keepNonMonsters }),
    };
}

export function apiRouter(): Router {
    const router = Router();
    router.use(express.json({ limit: "32kb" }));

    router.get("/cards-index", (_req: Request, res: Response): void => {
        res.json({ cards: getCardIndex() });
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

    router.post("/deck/optimize", (req: Request, res: Response): void => {
        const request = readDeckRequest(req, res);
        if (request === null) return;
        res.json(optimizeDeck(request));
    });

    return router;
}
