# ISA-893 — inventario de autoridad V2 por widget

Base auditada: `origin/nightly@f2e73d3aec1cadb47586cdea07fdbc54effea58f`.

`frontend/src/overlay/widget-types` contiene 21 carpetas. `shared` alberga
lectores comunes y no es un widget; las otras 20 coinciden con el catálogo de
`WidgetTypeV3`. Este inventario describe el estado previo al cutover: que exista
un builder V2 no significa todavía que `WidgetVisualHost` lo seleccione como
autoridad.

## Catálogo completo

| Widget | ¿VM V2 existe? | Lectura V1 actual | Fuente auxiliar externa |
| --- | --- | --- | --- |
| `broadcast-tower` | Sí — `broadcast-tower-view-model-v2.ts:30` | Estado, scoring, sesión y vueltas del jugador en `broadcast-tower-view-model.ts:11-14`. | Ninguna. |
| `car-damage-numbers` | Sí — `car-damage-numbers-view-model-v2.ts:29` | `TelemetrySnapshot.damage` mediante `shared/damage-reader.ts`, invocado en `car-damage-numbers-view-model.ts:1`. | Ninguna. |
| `car-damage-visual` | Sí — `car-damage-visual-view-model-v2.ts:8` | `TelemetrySnapshot.damage` mediante `shared/damage-reader.ts`, invocado en `car-damage-visual-view-model.ts:1`. | Ninguna. |
| `delta` | Sí — `delta-view-model-v2.ts:34` | Estado, scoring del jugador, vuelta, tiempos y referencias delta en `delta-view-model.ts:63-137`. | Ninguna. |
| `delta-advanced` | Sí — `delta-advanced-view-model-v2.ts:41` | Estado y `snapshot.player.deltaSeconds` en `delta-advanced-view-model.ts:7`. | Ninguna. |
| `delta-trace` | Sí — `delta-trace-view-model-v2.ts:83` | Estado y `snapshot.derived.deltaHistory` en `delta-trace-view-model.ts:6`. | Ninguna; el historial V2 procede del frame canónico. |
| `engineer-radio` | No aplica — veredicto auxiliar | `_snapshot: TelemetrySnapshot` se recibe pero no se lee en `engineer-radio-definition.ts:23-30`. | Sí: `runtime.engineerPresentation`, producido por `engineer-presentation-store`, en `engineer-radio-definition.ts:1-30`. |
| `fuel-strategy` | Sí — `fuel-strategy-view-model-v2.ts:36` | Estado, historial derivado, fuel, última vuelta y tiempo restante en `fuel-strategy-view-model.ts:18-41`. | Ninguna. |
| `head-to-head` | Sí — `head-to-head-view-model-v2.ts:19` | Estado y scoring ordenado en `head-to-head-view-model.ts:10-12`. | Ninguna. |
| `input-telemetry` | Sí — `input-telemetry-view-model-v2.ts:37` | Estado y controles instantáneos del jugador en `input-telemetry-view-model.ts:8`. | Historial efímero de controles mantenido por el host; no es otra fuente de telemetría. |
| `multiclass-relative` | Sí — `multiclass-relative-view-model-v2.ts:26` | Estado y scoring completo para jugador, clases y gaps en `multiclass-relative-view-model.ts:8`. | Ninguna. |
| `pedals` | Sí — `pedals-view-model-v2.ts:46` | Estado y throttle/brake/clutch del jugador en `pedals-view-model.ts:44-63`. | Ninguna. |
| `pedals-telemetry` | Sí — `pedals-telemetry-view-model-v2.ts:14` | Estado, scoring del jugador, controles, velocidad, RPM y marcha en `pedals-telemetry-view-model.ts:44-89`. | Ninguna. |
| `pedals-telemetry-compact` | Sí — `pedals-telemetry-compact-view-model-v2.ts:47` | Estado, controles, velocidad, RPM y marcha en `pedals-telemetry-compact-view-model.ts:55-69`. | Ninguna. |
| `race-schedule` | Sí, como veredicto auxiliar — `race-schedule-view-model-v2.ts:16` | `snapshot.auxiliary.scheduleEvents` y estado V1 en `race-schedule-view-model.ts:1`. | Sí: calendario local/remoto. `OverlayFrameV2` no contiene eventos de agenda; el builder V2 no los inventa. |
| `racing-flags` | Sí — `racing-flags-view-model-v2.ts:20` | Estado, bandera global y banderas de sector en `racing-flags-view-model.ts:19-25`. | Ninguna. |
| `relative` | Sí — `relative-view-model-v2.ts:31` | Estado y scoring completo para seleccionar la vecindad del jugador en `relative-view-model.ts:112-129`. | Ninguna. |
| `standings` | Sí — `standings-view-model-v2.ts:29` | Estado, sesión, scoring, vueltas del jugador y tiempo restante en `standings-view-model.ts:152-219`. | Ninguna. |
| `track-map` | Sí — `track-map-view-model-v2.ts:25,49` | Estado, nombre de circuito y scoring con posiciones en `track-map-view-model.ts:55-144`. | Geometría estática versionada de `track-geometry/track-geometry-pack`; solo da forma al circuito, no inventa posiciones (`track-map-view-model.ts:12,62,84`). |
| `track-weather` | Sí — `track-weather-view-model-v2.ts:29` | Estado y `snapshot.environment` en `track-weather-view-model.ts:1`. | Ninguna. |

## Veredictos de autoridad

- **18 widgets telemétricos** deben cortar a su builder V2: todos los de la
  tabla salvo `engineer-radio` y `race-schedule`.
- **`engineer-radio` es fuente auxiliar Engineer**. No lee V1 hoy y no debe
  conectarse artificialmente a `OverlayFrameV2`.
- **`race-schedule` es fuente auxiliar Calendar**. Su builder V2 actual expresa
  ausencia sin fabricar eventos; el cutover debe sacar el calendario del
  contenedor `TelemetrySnapshot.auxiliary`, no convertirlo en telemetría V2.
- La geometría de `track-map` y el historial efímero de `input-telemetry` son
  insumos de presentación: la posición y los controles siguen teniendo
  autoridad telemétrica V2.

## Consecuencia para los siguientes hitos

`WidgetVisualHost` puede seleccionar V2 para los 18 widgets telemétricos y
recibir por runtime los dos auxiliares explícitos. El contexto mínimo de
visibilidad/layout debe derivarse directamente de V2 y no puede reutilizar
`TelemetrySnapshot` como atajo. V1 permanece en este corte solo para el
comparador y el rollback observable hasta la retirada física de #894.
