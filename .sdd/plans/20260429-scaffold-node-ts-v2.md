# PLAN: scaffold-node-ts (v2)

SPEC: [.sdd/specs/20260429-scaffold-node-ts.md](../specs/20260429-scaffold-node-ts.md)
Versión anterior: [20260429-scaffold-node-ts.md](20260429-scaffold-node-ts.md) (APROBADO)
Estado: BORRADOR

## Motivo de la ampliación

Durante el Paso 2, `npm run typecheck` falló con `TS18003: No inputs were found` al ejecutar `tsconfig.client.json`. La ruta `src/client/` no contiene aún ningún archivo TS (`tailwind.css` es CSS y no cuenta como input de TypeScript). Sin un archivo TS bajo `src/client/**` o `src/shared/**`, el typecheck del cliente no puede pasar, lo que viola el criterio 2 de la SPEC.

El PLAN v1 no contemplaba crear ningún archivo bajo `src/shared/`. Esta v2 añade un único archivo nuevo (`src/shared/types.ts`) como placeholder mínimo. Se elige `src/shared/` en lugar de `src/client/` porque:

1. Está incluido por **ambos** tsconfigs (server y client), por lo que cubre cualquier futuro problema simétrico en el server cuando la situación se invierta.
2. La estructura aprobada en `.sdd/context/structure.md` ya prevé este archivo como ubicación de los tipos compartidos del proyecto. Adelantar su creación con contenido vacío no introduce código operativo ni decisiones nuevas.

## Cambios respecto a v1

Solo se añade un archivo y un paso. El resto del PLAN v1 se mantiene íntegro y sigue vigente.

### Archivos nuevos (delta v1 → v2)

- `src/shared/types.ts` — placeholder con contenido `export {};`. Se rellenará con los tipos reales (`Card`, `Fusion`, `FusionChain`, etc.) en una SPEC posterior cuando se implemente la capa de dominio.

### Pasos de implementación (inserción en v2)

Se inserta un paso nuevo entre el actual Paso 2 y el actual Paso 3:

#### Paso 2-bis — Placeholder de tipos compartidos

2-bis.1. Crear `src/shared/types.ts` con contenido `export {};` (un solo archivo, una sola línea).
2-bis.2. Ejecutar `npm run typecheck`. Debe pasar sin errores tanto para el config server como para el config client.

Los pasos 3 a 9 del PLAN v1 quedan renumerados como 4 a 10 si se quiere mantener orden estricto, o pueden dejarse con su numeración original si tratamos 2-bis como subpaso de 2. A efectos prácticos: la única diferencia operativa es la creación de un archivo y la verificación.

## Validación adicional

Sin cambios respecto a v1: los criterios de aceptación de la SPEC siguen siendo los mismos. El criterio 2 (`npm run typecheck` pasa sin errores) ahora pasa a ser cubrible gracias al placeholder.

## Rollback

Sin cambios respecto a v1. Eliminar `src/shared/types.ts` no tiene impacto en ningún otro archivo (no hay imports todavía).
