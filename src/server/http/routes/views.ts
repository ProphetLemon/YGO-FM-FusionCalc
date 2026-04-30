import { type Request, type Response, Router } from "express";
import { getCatalog } from "../../../shared/i18n/index.js";
import { assetUrl } from "../assets.js";

interface PageOptions {
    contentView: "index" | "search" | "calculator" | "about";
    pageTitle: string;
    pageStyles?: readonly string[];
    pageScripts?: readonly string[];
    bodyClass?: string;
    activeNav: "home" | "search" | "calculator" | "about";
}

function renderPage(res: Response, locals: PageOptions): void {
    res.render("layouts/main", {
        pageStyles: [],
        pageScripts: [],
        bodyClass: "",
        year: new Date().getFullYear(),
        catalog: getCatalog(res.locals.lang),
        ...locals,
    });
}

function tryAssetUrl(entry: string): string | null {
    try {
        return assetUrl(entry);
    } catch {
        return null;
    }
}

export function viewsRouter(): Router {
    const router = Router();

    router.get("/", (_req: Request, res: Response): void => {
        const homeBundle = tryAssetUrl("pages/home.ts");
        renderPage(res, {
            contentView: "index",
            pageTitle: res.locals.t("page.home.title"),
            activeNav: "home",
            pageScripts: homeBundle ? [homeBundle] : [],
        });
    });

    router.get("/search", (_req: Request, res: Response): void => {
        const searchBundle = tryAssetUrl("pages/search.ts");
        renderPage(res, {
            contentView: "search",
            pageTitle: res.locals.t("page.search.title"),
            activeNav: "search",
            bodyClass: "bg-polymerization text-fm-primary",
            pageScripts: searchBundle ? [searchBundle] : [],
        });
    });

    router.get("/calculator", (_req: Request, res: Response): void => {
        const calculatorBundle = tryAssetUrl("pages/calculator.ts");
        renderPage(res, {
            contentView: "calculator",
            pageTitle: res.locals.t("page.calculator.title"),
            activeNav: "calculator",
            bodyClass: "bg-polymerization text-fm-primary",
            pageScripts: calculatorBundle ? [calculatorBundle] : [],
        });
    });

    router.get("/about", (_req: Request, res: Response): void => {
        const aboutBundle = tryAssetUrl("pages/about.ts");
        renderPage(res, {
            contentView: "about",
            pageTitle: res.locals.t("page.about.title"),
            activeNav: "about",
            bodyClass: "bg-fm-primary text-white",
            pageScripts: aboutBundle ? [aboutBundle] : [],
        });
    });

    return router;
}
