# SPEC: dynamic-slots-calculator

Estado: COMPLETADO
Fecha: 2026-05-01
Slug: `dynamic-slots-calculator`

---

## Contexto y motivación

La calculadora de fusiones muestra siempre cinco ranuras de carta, que es el tamaño máximo de mano en YGO:FM. Sin embargo, los jugadores a menudo trabajan con menos cartas y rellenar huecos vacíos con nada es incómodo. Además, el SPEC `scaffold-node-ts` ya identificó «slots dinámicos» como objetivo futuro.

El cambio es **solo cliente**: el endpoint `POST /api/calculator` ya acepta cualquier número de IDs (incluyendo lista vacía), así que el servidor no necesita modificarse.

---

## Objetivo

Reemplazar la cuadrícula estática de cinco inputs por una lista dinámica que empiece con dos ranuras y permita al usuario añadir o eliminar ranuras dentro del rango `[2, 5]`.

---

## Alcance

### Incluye

- **Vista `calculator.ejs`**: eliminar el bucle `for i=1..5` estático. Generar el contenedor de ranuras vacío (`#hand-slots`) y los botones «Añadir carta» (`#addSlotBtn`) y «Reiniciar» (`#resetBtn`).
- **`calculator.ts`**: lógica de gestión dinámica de ranuras (añadir, eliminar, actualizar info, recalcular).
- **i18n**: claves nuevas en `es.json` y `en.json` para los nuevos textos de UI.
- **Test unitario** (Vitest): cubrir el módulo de gestión de ranuras.
- **Test E2E** (Playwright): flujo añadir ranura → rellenar → ver resultado; eliminar ranura → recalcular.

### Excluye

- Cambios en el servidor (`/api/calculator`, dominio, store).
- Persistencia de la mano entre recargas (posible SPEC futura).
- Arrastrar/reordenar ranuras (posible SPEC futura).
- Cambiar el límite de 5 ranuras (constante del juego).

---

## Comportamiento esperado

### Ranuras

| Estado | Mínimo | Máximo |
|---|---|---|
| Al cargar la página | 2 ranuras vacías | — |
| Tras añadir | `min + n` | sin límite |
| Tras eliminar | 2 ranuras | `actual - 1` |

**Enmienda 2026-05-01:** se elimina el límite superior de 5 ranuras. El botón «Añadir carta» nunca se deshabilita.

### Botón «Añadir carta»

- Visible siempre, nunca deshabilitado.
- Al pulsar: añade una nueva ranura al final de la lista.

### Botón «×» por ranura

- Cada ranura tiene un botón de eliminación a la derecha.
- **Deshabilitado / oculto** cuando el número de ranuras es 2 (no se puede bajar de 2).
- Al pulsar: elimina esa ranura, limpia su autocomplete si estaba activo, recalcula.

### Botón «Reiniciar»

- Vacía todos los inputs de las ranuras actuales.
- **No** reduce el número de ranuras (solo limpia valores).

### Recálculo automático

- Cada vez que se añade o elimina una ranura, o cambia el valor de cualquier input, se recalcula inmediatamente (igual que ahora).
- El mínimo para lanzar el cálculo sigue siendo 2 IDs válidos.

---

## Estructura de datos internos (cliente)

El módulo `calculator.ts` gestiona un array de objetos `SlotState`:

```ts
interface SlotState {
    input: HTMLInputElement;
    info: HTMLSpanElement;
    removeBtn: HTMLButtonElement;
    autocomplete: Autocomplete;
}
```

Los IDs del DOM pasan de `#hand1..#hand5` fijos a un `data-slot-index` en cada fila, y los nodos se crean y destruyen programáticamente.

---

## i18n

Claves nuevas (paridad obligatoria en `es` y `en`):

| Clave | es | en |
|---|---|---|
| `calculator.btn.add-slot` | «Añadir carta» | «Add card» |
| `calculator.btn.remove-slot` | «Eliminar ranura» | «Remove slot» |
| `calculator.slot.label` | «Carta {{n}}» | «Card {{n}}» |

---

## Accesibilidad

- El botón «×» lleva `aria-label` igual al valor de `calculator.btn.remove-slot` más el número de ranura.
- El input de cada ranura lleva `aria-label` de `calculator.slot.label` con `n` interpolado.
- El botón «Añadir carta» lleva `aria-disabled="true"` cuando está deshabilitado (además de `disabled`).

---

## Tests

### Vitest (unitarios)

Extraer la lógica de ranuras a un módulo `src/client/lib/slots.ts` que maneje el estado de forma testable (recibe el contenedor como parámetro en lugar de leer el DOM globalmente). Cubrir:

- Añadir ranura hasta el máximo → botón añadir deshabilitado.
- Eliminar ranura hasta el mínimo → botón eliminar deshabilitado/oculto.
- Recalcular IDs válidos desde el estado actual.

### Playwright (E2E)

Añadir casos a `tests/e2e/calculator-functional.spec.ts`:

- Página carga con 2 ranuras.
- Añadir ranura → 3 ranuras visibles.
- Añadir hasta 5 → botón añadir deshabilitado.
- Eliminar una ranura desde 3 → 2 ranuras, botones eliminar ocultos.
- Rellenar 3 ranuras válidas → resultado aparece.

---

## Criterios de aceptación

1. La página `/calculator` carga con exactamente 2 ranuras visibles.
2. El usuario puede añadir hasta 5 ranuras pulsando «Añadir carta».
3. El botón «Añadir carta» se deshabilita visiblemente al llegar a 5 ranuras.
4. Cada ranura tiene un botón «×» que la elimina y recalcula.
5. Con 2 ranuras, los botones «×» están ocultos o deshabilitados.
6. «Reiniciar» limpia los inputs pero mantiene el número actual de ranuras.
7. Autocomplete funciona en todas las ranuras, sean estáticas o añadidas dinámicamente.
8. El recálculo automático funciona exactamente igual que antes para cualquier número de ranuras.
9. Paridad i18n: `es.json` y `en.json` tienen las mismas claves (test de paridad pasa).
10. `npm test` pasa (unit + E2E) sin regresiones en el resto de la suite.
