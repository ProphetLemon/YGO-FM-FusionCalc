import { Router } from "express";

const REDIRECTS: Readonly<Record<string, string>> = {
    "/index.html": "/",
    "/fusion-search.html": "/search",
    "/fusion-calculator.html": "/calculator",
    "/about.html": "/about",
};

export function legacyRedirectsRouter(): Router {
    const router = Router();
    for (const [from, to] of Object.entries(REDIRECTS)) {
        router.get(from, (_req, res) => {
            res.redirect(301, to);
        });
    }
    return router;
}
