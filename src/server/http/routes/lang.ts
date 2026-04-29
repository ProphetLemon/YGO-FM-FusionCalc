import { type Request, type Response, Router } from "express";
import { isLang } from "../../../shared/i18n/index.js";
import { config } from "../../config.js";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function langRouter(): Router {
    const router = Router();

    router.post("/lang", (req: Request, res: Response): void => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const lang = body.lang;
        if (!isLang(lang)) {
            res.status(400).type("text/plain").send("Invalid lang");
            return;
        }
        res.cookie("lang", lang, {
            maxAge: ONE_YEAR_MS,
            httpOnly: false,
            sameSite: "lax",
            secure: config.nodeEnv === "production",
            path: "/",
        });
        const referer = req.header("referer");
        const target = referer && referer.length > 0 ? referer : "/";
        res.redirect(303, target);
    });

    return router;
}
