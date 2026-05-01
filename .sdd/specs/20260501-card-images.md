# SPEC: card-images

Estado: COMPLETADO
Fecha: 2026-05-01
Slug: `card-images`

---

## Contexto y motivación

Los componentes de carta (`renderCardSummary`, `renderPair`) muestran solo texto. Añadir la imagen de la carta mejora significativamente la legibilidad y el reconocimiento visual, especialmente en los resultados de búsqueda y calculadora donde aparecen hasta 10-20 cartas a la vez.

El campo `password` del tipo `CardSummary` (= `CardCode` del JSON, ej. `"89631139"`) es el número de carta Konami y coincide con el identificador usado por el CDN público de YGOProDeck:

```
https://images.ygoprodeck.com/images/cards/{password}.jpg
```

No se necesita API key. Las cartas exclusivas de FM con passwords genéricos (ej. `"00000008"`) producirán un 404 → se muestra un placeholder visual.

---

## Objetivo

Mostrar la imagen de la carta (artwork) en los dos componentes de renderizado existentes:

1. **`renderCardSummary`** — vista detalle de carta en la página de búsqueda.
2. **`renderPair`** — cada tarjeta compacta de par (fusiones, equips, resultados).

---

## Alcance

### Incluye

- Nuevo helper `src/client/lib/card-image.ts` con la función `createCardImg`.
- Modificar `src/client/components/card-display.ts` — añadir imagen grande en `renderCardSummary`.
- Modificar `src/client/components/fusion-card.ts` — añadir thumbnail en `renderPair`.
- Sin cambios en servidor, API, EJS ni i18n (el `alt` usa `card.name` que ya existe).

### Excluye

- Caché local de imágenes.
- Imágenes en la sección de cadena óptima (`renderChain` en `calculator.ts`) — puede hacerse en una iteración futura.
- Cambiar el CDN ni alojar imágenes propias.

---

## Fuente de imágenes

**CDN**: `https://images.ygoprodeck.com/images/cards/{password}.jpg`

- Gratuito, sin autenticación, accesible públicamente.
- Imágenes de 177×254 px (relación de aspecto de carta TCG).
- Las cartas FM con password placeholder (8 dígitos todos cero salvo el ID) darán 404 → el `error` handler del `<img>` muestra el fallback.

---

## Helper `src/client/lib/card-image.ts`

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
    fallback.className = "w-full h-full flex items-center justify-center bg-fm-primary/10 text-fm-primary/40 text-xs font-body hidden";
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

## Cambios en `renderCardSummary`

Layout resultante: imagen a la izquierda (160×224 px, proporciones de carta), stats a la derecha.

```
┌─────────────────────────────────────────┐
│  [imagen]   Nombre de la carta           │
│  160×224    Descripción del efecto       │
│             ATK / DEF: 3000 / 2500       │
│             Tipo: Dragon                 │
│             Estrellas: 999999            │
│             Contraseña: 89631139         │
└─────────────────────────────────────────┘
```

Clase del contenedor de imagen: `w-40 h-56 flex-shrink-0` (160×224 px).

---

## Cambios en `renderPair`

Cada línea de carta (card1, card2, result) lleva un thumbnail de 40×56 px a la izquierda del texto.

```
┌──────────────────────────────────┐
│ [thumb] Input: Mystical Elf      │
│ [thumb] Input: Mushroom Man      │
│ [thumb] Result: Dark Sage (2800) │
└──────────────────────────────────┘
```

Clase del thumbnail: `w-10 h-14 flex-shrink-0`.

---

## Accesibilidad

- `alt` = nombre de la carta (siempre disponible en `CardSummary.name`).
- `loading="lazy"` en todas las imágenes de carta.
- El fallback es `aria-hidden` implícito (es decorativo; el nombre ya aparece en el texto).

---

## Tests

No se añaden tests unitarios (la lógica de `cardImageUrl` es trivial y los componentes de renderizado DOM no se testean en Vitest). Los tests E2E existentes no comprueban la presencia de imágenes y no se rompen.

Si en el futuro se introduce lógica de selección de URL (p.ej. fallback a otro CDN), se añadirá test entonces.

---

## Criterios de aceptación

1. Al buscar una carta conocida (ej. «Blue-eyes White Dragon»), la vista detalle muestra su imagen junto a los stats.
2. En los resultados de fusión/equip de la búsqueda, cada tarjeta compacta muestra el thumbnail de las dos cartas de entrada y del resultado.
3. En la calculadora, los resultados de fusiones y equips muestran los thumbnails.
4. Cartas sin imagen real en el CDN muestran el placeholder «?» sin errores en consola.
5. `npm run build` pasa sin errores TypeScript.
6. Los tests existentes (unit + E2E) no se rompen.
