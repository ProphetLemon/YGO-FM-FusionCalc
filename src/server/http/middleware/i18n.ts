import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
    DEFAULT_LANG,
    type Lang,
    type TranslateVars,
    type TranslationKey,
    isLang,
    parseAcceptLanguage,
    translate,
} from "../../../shared/i18n/index.js";
import { config } from "../../config.js";

export type Translator = (key: TranslationKey, vars?: TranslateVars) => string;

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Locals {
            lang: Lang;
            t: Translator;
        }
    }
}

function resolveLang(req: Request): Lang {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const cookieLang = cookies?.lang;
    if (isLang(cookieLang)) return cookieLang;
    const headerLang = parseAcceptLanguage(req.header("accept-language") ?? undefined);
    if (headerLang !== null) return headerLang;
    return DEFAULT_LANG;
}

export const i18nMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
    const lang = resolveLang(req);
    res.locals.lang = lang;
    res.locals.t = (key: TranslationKey, vars?: TranslateVars): string =>
        translate(key, lang, vars, { strict: config.nodeEnv === "development" });
    next();
};
