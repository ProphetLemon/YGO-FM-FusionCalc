# SPEC: calculator-card-grid

Estado: APROBADO
Fecha: 2026-05-01
Slug: `calculator-card-grid`

---

## Contexto y motivación

La sección "Tu mano" de la calculadora muestra una lista de inputs de texto. Ya tenemos el helper `createCardImg` y las imágenes del CDN de YGOProDeck. La mejora lógica es mostrar la mano como una cuadrícula de cartas con su artwork, igual que un mazo real.

---

## Objetivo

Reemplazar la lista de text inputs por una cuadrícula de celdas de carta. Cada celda tiene dos estados:

- **Vacío**: borde discontinuo, icono «+», label y el input de autocomplete visible.
- **Relleno**: artwork de la carta, nombre debajo, botón «×» para limpiar (vuelve a vacío).

La lógica de fusiones (`refresh`, `getValidIds`, `chainSearch`) no cambia.

---

## Alcance

### Incluye

- Rediseño visual de `#hand-slots` en `views/calculator.ejs` (sin cambio de IDs).
- Reescritura de `addSlot()` y `SlotState` en `src/client/pages/calculator.ts`.
- Nueva clave i18n `calculator.slot.empty` («Buscar carta» / «Search card»).
- Actualizar tests que dependen de la estructura DOM del slot.

### Excluye

- Cambios en la API, dominio, o componentes de fusión.
- Drag & drop para reordenar cartas.
- Animaciones de carta.

---

## Layout

```
┌────────────────────────────────────────────────────────┐
│  Tu mano                                               │
│                                                        │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐   │
│  │  +   │  │[img] │  │[img] │  │[img] │  │  +   │   │
│  │      │  │      │  │      │  │      │  │      │   │
│  │[____]│  │Name  │  │Name  │  │Name  │  │[____]│   │
│  └──────┘  └──×───┘  └──×───┘  └──×───┘  └──────┘   │
│                                                        │
│  [Añadir carta]  [Reiniciar]                           │
└────────────────────────────────────────────────────────┘
```

Grid: `grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3`  
Tamaño de celda: `w-full` en el grid, imagen con aspecto de carta (~2:3).

---

## Estructura DOM de cada celda

```html
<div class="hand-slot relative flex flex-col items-center">

    <!-- Estado vacío -->
    <div class="slot-empty w-full aspect-[2/3] border-2 border-dashed border-fm-primary/40
                rounded flex flex-col items-center justify-center gap-1 p-2 cursor-text">
        <span class="text-2xl text-fm-primary/40 select-none">+</span>
        <span class="text-xs text-fm-primary/40 font-body">{{ calculator.slot.empty }}</span>
        <input type="text" class="w-full text-xs px-2 py-1 border border-fm-primary/30 rounded
                                   font-body bg-white/80" aria-label="{{ calculator.slot.label n }}">
    </div>

    <!-- Estado relleno (oculto por defecto) -->
    <div class="slot-filled hidden w-full">
        <div class="w-full aspect-[2/3] relative">
            <!-- aquí va createCardImg con w-full h-full -->
            <button type="button"
                    class="clear-btn absolute top-1 right-1 w-5 h-5 bg-rose-600 text-white
                           rounded-full text-xs flex items-center justify-center hover:bg-rose-500
                           leading-none"
                    aria-label="{{ calculator.btn.remove-slot }} n">×</button>
        </div>
        <p class="slot-name text-xs text-center font-body mt-1 leading-tight line-clamp-2"></p>
    </div>

    <!-- Botón eliminar ranura (solo visible cuando canRemoveSlot) -->
    <button type="button"
            class="remove-btn hidden mt-1 text-xs text-rose-600 hover:text-rose-500 font-body"
            aria-label="{{ calculator.btn.remove-slot }} n">
        − eliminar
    </button>

</div>
```

---

## SlotState actualizado

```ts
interface SlotState {
    cell: HTMLElement;
    input: HTMLInputElement;
    emptyState: HTMLElement;   // .slot-empty
    filledState: HTMLElement;  // .slot-filled
    nameLabel: HTMLElement;    // .slot-name
    clearBtn: HTMLButtonElement;
    removeBtn: HTMLButtonElement;
}
```

Helpers internos:
- `setSlotCard(slot, card: CardSummary | null)` — gestiona la transición vacío↔relleno.
- `updateRemoveBtns()` — sin cambio de semántica, sigue usando `canRemoveSlot`.

---

## Flujo de interacción

1. El usuario hace clic en el input del estado vacío → autocomplete se despliega.
2. El usuario selecciona un nombre → `setSlotCard(slot, card)`:
   - Crea `createCardImg(card.name, card.password, "w-full h-full object-contain")` dentro de `.slot-filled > div`.
   - Rellena `.slot-name` con `card.name`.
   - Oculta `.slot-empty`, muestra `.slot-filled`.
3. Pulse «×» → `setSlotCard(slot, null)`:
   - Limpia `.slot-filled`, oculta, muestra `.slot-empty`, hace focus al input.
4. Pulse «− eliminar» → elimina la celda del grid (igual que antes).
5. `refresh()` sigue leyendo `slot.input.value` para calcular fusiones.

---

## Cambios en i18n

| Clave | ES | EN |
|---|---|---|
| `calculator.slot.empty` | `Buscar carta` | `Search card` |

---

## Tests a actualizar

- `tests/e2e/calculator-functional.spec.ts`: cambiar selectores `.hand-slot input` → `.hand-slot .slot-empty input` o `nth(n)`. Añadir test: slot relleno muestra imagen.
- `tests/unit/server/http/views-route.test.ts`: sin cambio (sigue comprobando `#hand-slots`).

---

## Criterios de aceptación

1. La mano arranca con 2 celdas vacías en cuadrícula.
2. Escribir un nombre en un slot vacío muestra el autocomplete.
3. Seleccionar una carta muestra su artwork en la celda; desaparece el input.
4. Pulsar «×» limpia la carta y vuelve al estado vacío.
5. «Añadir carta» añade una nueva celda vacía.
6. «Reiniciar» pone todas las celdas en estado vacío.
7. Con ≥ 2 cartas válidas, los resultados de fusión se actualizan automáticamente.
8. Cartas sin imagen real muestran el placeholder «?».
9. `npm run build` sin errores. Tests existentes pasan.
