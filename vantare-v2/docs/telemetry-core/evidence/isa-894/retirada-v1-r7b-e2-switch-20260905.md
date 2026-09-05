# ISA-894 R7b/E2 — sistema de features/rollback fuera, V2 autoridad directa

Fecha: 2026-09-05. Rama local
`vantareapp/isa-894-retirada-v1-r7b`. Base E2 `296139a3`
(E1c aprobado).

## Alcance (solo E2, sin reubicar)

Solo E2 según el orden efectivo: cae el sistema entero de
features/rollback. Sin E3/E4/E1d, roadmap público, Go, dependencias ni
evidencia histórica. Sin apps, LMU, browser, benchmark, secretos, push,
PR, merge, promoción ni release.

- Borrados del árbol (2 ficheros):
  - `frontend/src/overlay/telemetry-shadow/overlay-v2-features.ts`
    (catálogo + maquinaria mutable, 125 líneas).
  - `frontend/src/overlay/telemetry-shadow/overlay-v2-features.test.ts`
    (test exclusivo del rollback).
- Callsites V2 directos (sin generación ni suscripción):
  `CompositeApp.tsx`, `ObsOverlayApp.tsx`, `StudioRoute.tsx` (este
  conserva `useSyncExternalStore` solo para `raceSchedule`, vivo).
- Hilo muerto retirado de `widget-definition.ts`
  (`overlayV2Features?` de `WidgetRuntimeInput`), `InPlaceWidgetEditFrame`,
  `InPlaceEditOverlay`, `InPlaceEditModeBranch`, `RuntimeWidgetFrame`
  (+ comparador), `RuntimeOverlaySurface`, `ObsOverlayRuntime` y
  `DesktopOverlayRuntime`.
- Host (`WidgetVisualHost.tsx`): fuera `v2Rollback`, la rama
  diagnóstica `overlay-v2-rollback` y los 8 gates `!v2Rollback`;
  los diagnósticos V2 productivos (`source-missing`, `frame-missing`,
  `stale`…) quedan intactos.
- Registry (`overlay-v2-view-models.ts`): fuera el import del
  catálogo, el campo `feature` de `OverlayV2ViewModelEntry` y las 18
  marcas; cada entrada es `{ buildViewModelV2 }` directo.
- Tests: reescrito `overlay-v2-view-models.test.ts` a registry
  directo (18 builders, sin catálogo); retirados los 7 bloques de
  catálogo de los domain-free (cobertura productiva intacta);
  borrados los casos exclusivos de rollback
  (`InPlaceEditModeBranch`, `RuntimeOverlaySurface`,
  `WidgetVisualHost`) y reformulada la expectativa V2 por defecto;
  limpiados los `window.__vantareOverlayV2Features` /
  `localStorage['vantare:overlay-v2-features']` inertes
  (ningún código productivo los leía).
- Guard B1: el diferido E2 pasa de presencia a ausencia.

## Corrección explícita de la decisión previa

El texto anterior de E2 proponía conservar el catálogo estático
**movido** a `overlay/core/overlay-v2-feature-catalog.ts`. El
inventario real con `rg` (previo al RED) lo desmiente: `overlayV2Features`
solo llegaba a `WidgetVisualHost` para calcular `v2Rollback`
(`length === 0`); `hasOverlayV2Feature` y `entry.feature` solo
aparecían en tests y en la declaración del registry. Ningún consumidor
productivo usa el catálogo salvo el rollback, así que por Ponytail
(`full`: YAGNI, borrar antes que mover) se elimina todo el sistema:
sin copia, sin wrapper, sin factory, sin compatibilidad, sin fallback
V1. STOP no activado: no apareció ningún caller productivo real.
`OverlayV2FeatureComparison` del comparator es otro tipo (oráculo E4,
sin import del catálogo) y no se toca.

## TDD RED → GREEN

- RED `1fce8fef`: guard E2 6 failed | 1 passed (solo pasa la
  salvaguarda de diagnósticos V2 productivos, por diseño).
- GREEN `6ae800f2`: +74/−479 (neto −405). Con el RED, E2 neto −250.

## Checks (sobre `6ae800f2`)

- Guard E2: 7/7 PASS.
- Focales Composite/OBS/Host/registry/guard B1: 7 ficheros, 110/110 PASS.
- Focales StudioRoute/canvas/RuntimeSurface/Branch: 4 ficheros, 100/100 PASS.
- Focales 7 domain-free + performance: 8 ficheros, 90/90 PASS.
- `pnpm typecheck` (`tsc -b --noEmit`): verde.
- `pnpm lint` (completo): limpio.
- `pnpm build`: PASS (solo aviso preexistente de chunks > 500 kB).
- `rg` ausencia en `frontend/src`: limpio salvo los propios guards y
  `OverlayV2FeatureComparison` (E4, tipo independiente).
- `rg` ausencia en `frontend/dist` (tras build): limpio.
- `git diff --check`: limpio.
- Suite completa no ejecutada; queda para E1d/F1.

## Siguiente

E3 (testdata + entrypoints research bench) según el orden efectivo.
Sin push, PR, merge, promoción, apps ni LMU.
