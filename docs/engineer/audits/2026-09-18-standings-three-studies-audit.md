# Auditoría: Standings Eficiencia en V1, Default y Foco

## Veredicto

**Falla la implementación actual.** No conviene corregirla añadiendo otra
versión ni seguir ajustando CSS. Las tres opciones no están comparando el mismo
contenido: `Default` modifica la proyección de datos, mientras `V1` y `Foco`
mantienen otra proyección y solo una de ellas cambia la piel visual.

## Evidencia reproducible

Con el fixture canónico de 20 filas intercaladas —Hypercar en P1/P4/P7…,
LMP2 en P2/P5… y GTE en P3/P6…— la ruta del Workshop produce:

| Estudio | Alcance declarado | Posiciones visibles |
| --- | --- | --- |
| `v1` | `player-class` | `1, 4, 7, 10, 13, 16, 19` |
| `default` | `player-class` | `1, 2, 3, 4, 5, 6, 7` |
| `v2-focus` | `player-class` | `1, 4, 7, 10, 13, 16, 19` |

Esto se obtiene directamente del DOM del Workshop con `rows=19`; no es una
interpretación de la captura.

El modelo ya recibe `position` global y `classPosition` de la fuente. Cuando
se filtra la clase del jugador, V1 y Foco conservan solo Hypercar pero el
renderer pinta `row.position`, de ahí el salto `1, 4, 7…`. Si la intención es
mostrar una tabla de la clase del jugador, debe pintarse `classPosition`; si la
intención es una clasificación normal de carrera, no debe filtrarse la clase.
La implementación actual no decide correctamente ninguna de las dos cosas.

## Causas encontradas

1. `studyStyle` se está usando como selector de comportamiento de datos. La
   ruta solo inyecta `standingsWindow` cuando el estilo es `default`, y el
   control `Pilotos alrededor` solo aparece en ese estilo. Un estilo visual no
   debería cambiar el universo de filas.

2. `standings-view-model-v2.ts` fuerza `frame.standings` cuando existe la
   ventana `default`, aunque el modelo sigue declarando
   `classScope: "player-class"`. Así `Default` devuelve filas de todas las
   clases con metadatos que dicen lo contrario.

3. La ventana se aplica antes de la presentación multiclass. Con
   `variant=standings-multiclass&study=default&around=4` aparecen bandas de
   `HYPERCAR`, `LMP2` y `GTE` con secuencias de posición reiniciadas y una
   selección que no representa ni la parrilla global ni una ventana por clase.

4. El fixture fija el jugador canónico en P1. Por tanto, los tests actuales no
   ejercitan el caso central de la petición: top 3 fijo + jugador en P9 + cuatro
   vecinos, ni los límites del final de la parrilla.

5. La prueba de Workshop comprueba únicamente que `Default` devuelve
   `1..7`. No exige paridad de filas entre las tres pieles ni cubre la
   combinación multiclass/ventana. Los 65 tests focalizados pasan, pero dejan
   pasar precisamente la regresión observada.

## Dirección recomendada

Separar explícitamente tres decisiones:

- `studyStyle`: únicamente presentación (`V1`, `Default`, `Foco`);
- clasificación: normal global o multiclass con bandas;
- ventana de filas: parrilla completa o top 3 + ventana alrededor del
  jugador.

La proyección de filas debe resolverse una sola vez antes del renderer y ser la
misma para las tres pieles. La ventana debe operar sobre la clasificación que
el usuario haya elegido, no sobre el nombre del estilo. El fixture debe poder
probar al menos jugador en P1, P9 y última posición.

La opción que encaja con las capturas y evita los saltos actuales es:

- **Normal:** clasificación global `1, 2, 3…`, sin bandas.
- **Multiclass:** todas las clases, bandas y posición de clase.
- **V1/Default/Foco:** misma selección de filas; solo cambia la piel visual.

Esta última regla necesita confirmación antes de tocar el contrato, porque la
especificación anterior había dejado V1 y Foco fuera de la ventana y esa
decisión es precisamente la que invalida la comparación actual.

## Archivos implicados

- `vantare-v2/frontend/src/overlay/widget-types/standings/standings-view-model-v2.ts`
- `vantare-v2/frontend/src/overlay/widget-types/standings/functional-standings-multiclass.ts`
- `vantare-v2/frontend/src/overlay/design-systems/vantare-functional/StandingsFunctional.tsx`
- `vantare-v2/frontend/src/overlay/authoring/OverlayWorkshopDevRoute.tsx`
- `vantare-v2/frontend/src/overlay/authoring/FunctionalStudyControls.tsx`
- `vantare-v2/frontend/src/overlay/authoring/fixtures/authoring-v2-scenario-widget.ts`
