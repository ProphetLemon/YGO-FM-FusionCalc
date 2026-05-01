# PLAN: card-images

Estado: COMPLETADO
Fecha: 2026-05-01
Spec: `.sdd/specs/20260501-card-images.md`

---

## Resumen de cambios

| Archivo | Acción |
|---|---|
| `src/client/lib/card-image.ts` | Crear — helper `cardImageUrl` + `createCardImg` |
| `src/client/components/card-display.ts` | Modificar — imagen grande en `renderCardSummary` |
| `src/client/components/fusion-card.ts` | Modificar — thumbnails en `renderPair` |

Sin cambios en servidor, API, tests, i18n ni EJS.

---

## Commit 1 — `feat(card-images): add card-image helper`

### `src/client/lib/card-image.ts` (nuevo)

```ts
const CDN = "https://images.ygoprodeck.com/images/cards";

export function cardImageUrl(password: string): string {
    return `${CDN}/${password}.jpg`;
}

export function createCardImg(name: string, password: string, className: string): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = className;

    const img = document.createElement("img");
    img.src = cardImageUrl(password);
    img.alt = name;
    img.loading = "lazy";
    img.className = "w-full h-full object-contain";

    const fallback = document.createElement("div");
    fallback.className =
        "w-full h-full flex items-center justify-center bg-fm-primary/10 text-fm-primary/40 text-xs font-body hidden";
    fallback.textContent = "?";

    img.addEventListener("error", () => {
        img.classList.add("hidden");
        fallback.classList.remove("hidden");
    });

    wrapper.appendChild(img);
    wrapper.appendChild(fallback);
    return wrapper;
}
```

---

## Commit 2 — `feat(card-images): show card artwork in renderCardSummary`

### `src/client/components/card-display.ts`

Reescribir el archivo completo:

```ts
import type { CardSummary } from "../../shared/types.js";
import { createCardImg } from "../lib/card-image.js";
import { t } from "../lib/i18n.js";

export function renderCardSummary(card: CardSummary): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className =
        "block rounded-lg border border-fm-primary/30 bg-white text-fm-primary shadow-sm p-4 max-w-md";

    const title = document.createElement("h5");
    title.className = "font-display text-lg mb-3";
    title.textContent = card.name;
    wrapper.appendChild(title);

    const body = document.createElement("div");
    body.className = "flex gap-4";

    body.appendChild(createCardImg(card.name, card.password, "w-40 h-56 flex-shrink-0"));

    const stats = document.createElement("div");
    stats.className = "flex-1 min-w-0";

    const desc = document.createElement("p");
    desc.className = "mb-3 text-sm whitespace-pre-line";
    desc.textContent = card.description;
    stats.appendChild(desc);

    if (card.isMonster) {
        stats.appendChild(makeRow(t("card.label.atk-def"), `${card.attack} / ${card.defense}`));
    }
    stats.appendChild(makeRow(t("card.label.type"), card.typeName));
    stats.appendChild(makeRow(t("card.label.stars"), String(card.stars)));
    stats.appendChild(makeRow(t("card.label.password"), card.password));

    body.appendChild(stats);
    wrapper.appendChild(body);

    return wrapper;
}

function makeRow(label: string, value: string): HTMLParagraphElement {
    const p = document.createElement("p");
    p.className = "mb-1 text-sm";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(value));
    return p;
}
```

---

## Commit 3 — `feat(card-images): show card thumbnails in renderPair`

### `src/client/components/fusion-card.ts`

Reescribir el archivo completo:

```ts
import type { CardSummary, EquipExpanded, FusionExpanded, ResultExpanded } from "../../shared/types.js";
import { createCardImg } from "../lib/card-image.js";
import { t } from "../lib/i18n.js";

interface PairWithOptionalResult {
    card1: CardSummary;
    card2: CardSummary;
    result?: CardSummary;
}

export function renderPair(entry: FusionExpanded | EquipExpanded | ResultExpanded): HTMLElement {
    const data = entry as PairWithOptionalResult;
    const div = document.createElement("div");
    div.className =
        "block rounded-lg border border-black bg-white text-fm-primary shadow-sm p-4 mb-3 max-w-xs";

    div.appendChild(makeCardLine(t("card.label.input"), data.card1));
    div.appendChild(makeCardLine(t("card.label.input"), data.card2));
    if (data.result) {
        const detail = data.result.isMonster
            ? `${data.result.name} (${data.result.attack}/${data.result.defense})`
            : `${data.result.name} [${data.result.typeName}]`;
        div.appendChild(makeCardLine(t("card.label.result"), data.result, detail));
    }
    return div;
}

function makeCardLine(label: string, card: CardSummary, overrideText?: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "flex items-center gap-2 mb-2";

    row.appendChild(createCardImg(card.name, card.password, "w-10 h-14 flex-shrink-0"));

    const p = document.createElement("p");
    p.className = "text-sm min-w-0";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(overrideText ?? card.name));
    row.appendChild(p);

    return row;
}
```

---

## Orden de ejecución

1. Commit 1: helper (prerequisito para los otros dos)
2. Commit 2: `card-display.ts`
3. Commit 3: `fusion-card.ts`

Los commits 2 y 3 son independientes entre sí pero ambos dependen del 1.

---

## Verificación local

```bash
npm run build     # sin errores TS
npm test          # sin regresiones (22 test files, todos pasan)
```

Verificación visual: arrancar el servidor (`npm run dev` o `npm start`) y comprobar que:
- `/search` → buscar «Blue-eyes White Dragon» → imagen aparece junto a los stats.
- Los resultados de fusión muestran thumbnails.
- Buscar una carta FM sin password real (ej. «Mystical Sheep #1», id 99 aprox.) → se muestra el placeholder «?».
