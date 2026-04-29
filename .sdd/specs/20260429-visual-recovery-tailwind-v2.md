# SPEC: visual-recovery-tailwind (v2)

Fecha: 2026-04-29
Versión anterior: [20260429-visual-recovery-tailwind.md](20260429-visual-recovery-tailwind.md) (APROBADO, sustituida)
Estado: COMPLETADO

Commits: c08d1ea (implementación), c283cea (estado APROBADO).
Despliegue verificado: https://ygo-fm-fusion-calc.onrender.com/

## Motivo de la ampliación

Durante la implementación del PLAN v1 se descubrió que Bootstrap 4 (cargado en `/search` y `/calculator` para el markup dinámico) define con `!important` las mismas utilidades que usa Tailwind (`.px-4`, `.py-3`, `.mx-auto`, `.text-white`, etc.). Por especificación CSS, las reglas `!important` de una capa de menor prioridad ganan a las reglas `!important` de una capa de mayor prioridad — y a las no-important sin discusión. Mover Bootstrap a `@layer legacy` no resuelve el conflicto cuando los nombres de clase colisionan.

Resultado: el navbar y otros elementos compartidos se renderizan diferente en `/search`/`/calculator` que en `/`. Esto rompe los criterios visuales de la SPEC v1 (paleta y espaciado consistentes).

La mitigación original ("verificar visualmente y mantener Bootstrap") era insuficiente. Se reemplaza por la eliminación total de Bootstrap CSS y la sustitución de las clases Bootstrap embebidas en los strings HTML que generan los scripts legacy.

## Cambios respecto a v1

### Alcance ampliado

- **Eliminar `bootstrap.min.css`** del set de hojas cargadas en `/search` y `/calculator`. Ya no se referencia en el HTML servido.
- **Sustituir clases Bootstrap por equivalentes Tailwind** dentro de las strings HTML de [public/javascripts/fusionSearch.js](../../public/javascripts/fusionSearch.js) y [public/javascripts/fusionCalc.js](../../public/javascripts/fusionCalc.js). El comportamiento JS no cambia; solo cambian los nombres de clase en los HTML que se inyectan.
- **Eliminar el `<style>` con `@import url(...) layer(legacy)`** que añadimos en [views/partials/head.ejs](../../views/partials/head.ejs) durante la implementación de v1: ya no hace falta scoping de capas porque no hay Bootstrap que escapar.
- **Mantener `awesomplete.css`, `fusioncustom.css` y `normalize.css`** cargados; no colisionan con Tailwind. Estos siguen cargándose como `<link>` directos.

### Fuera de alcance (sin cambios respecto a v1)

- **No** se reescriben `fusionSearch.js`/`fusionCalc.js` a TypeScript modular. Solo se cambian las strings HTML que generan, dejando la lógica jQuery + TaffyDB + Awesomplete intacta.
- **No** se elimina jQuery, TaffyDB ni Awesomplete (paso 3 completo).
- **No** se reescribe `data/*.js` ni los scripts Ruby.

### Criterios de aceptación (delta v2)

Sustituir los criterios 11 y siguientes con:

- **11. Sin Bootstrap en ninguna página**: ninguna de las cuatro páginas carga `bootstrap.min.css`. Verificable inspeccionando el HTML servido.
- **11-bis. Identidad visual uniforme entre páginas**: el navbar y el footer renderizan con `max-width`, `padding`, `font-family` y `color` idénticos en `/`, `/search`, `/calculator` y `/about` (test E2E con `expect(home).toEqual(calc)` sobre computed styles).
- **12. Funcionalidad legacy preservada**: `/search` y `/calculator` siguen funcionando — autocompletar, búsqueda por nombre, búsqueda por resultado, cálculo de fusiones desde la mano. Verificación manual.
- **13. Tarjetas de resultados con apariencia razonable**: el HTML inyectado por `fusionSearch.js` y `fusionCalc.js` se ve consistente con el resto del sitio (Tailwind classes), no roto.
- **14. Render deployment**: tras push, Render reconstruye y la URL pública muestra la identidad recuperada y consistente.

Los criterios 1-10 de la v1 se conservan tal cual.

## Riesgos y supuestos (delta v2)

**Riesgos nuevos**

1. Las strings HTML que generan los scripts pueden ser más largas/distintas y romper algún flujo de búsqueda/cálculo si una clase Tailwind no se aplica correctamente. Mitigación: probar manualmente search y calculator tras la migración.
2. La apariencia de las tarjetas de resultados cambia (deja de ser Bootstrap card). Aceptable: estética consistente con el resto del sitio.

**Supuestos**

- Awesomplete CSS sigue siendo necesario para el desplegable de autocompletado y no colisiona con Tailwind (clases `.awesomplete`, no clases utilitarias).
- `normalize.css` no colisiona con Tailwind. Si lo hace en algún detalle menor, se acepta el efecto.
