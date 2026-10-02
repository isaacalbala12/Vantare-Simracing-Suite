# Auditoría de banderas — Horizontal Standings / Broadcast Tower

Fecha: 2026-09-17
Rama: `vantareapp/isa-1221-workshop-study-unico`
HEAD inspeccionado: `9485ecd071ea1b6e73f4c45e2c03792cd1f39920`

## Veredicto

El recorrido productivo de la bandera sí está cableado:

`frame.session.flag` → `buildBroadcastTowerViewModelV2` → `model.flag` → `data-flag` de `BroadcastTowerFunctional` → franjas CSS.

La ausencia no se convierte en verde: `missing`, `invalid`, una calidad distinta de `fresh`, y una fuente `stale/degraded` quedan en `unknown` y usan el acento neutro `177 180 188`.

Se corrigió una omisión del widget: el ViewModel aceptaba `black` y `checkered`, pero Broadcast Tower no tenía reglas CSS específicas. Ahora negro usa una franja oscura con borde gris visible y a cuadros usa un patrón explícito.

## Qué representa cada estado

| Estado | Token/render | Lectura honesta |
| --- | --- | --- |
| `unknown` / sin señal | `177 180 188`, neutro | Golden V2 actual y ausencia de evidencia positiva |
| `green` | `41 195 111` | Vocabulario de consumidor; probado, no afirmado hoy por el productor LMU |
| `yellow` | `255 208 61` | Único positivo que el productor LMU puede afirmar hoy mediante el mapeo candidato `yellowFlagState` 2–5 |
| `blue` | `67 145 255` | Consumidor preparado; sin emisión LMU demostrada |
| `red` | `239 48 62` | Consumidor preparado; sin emisión LMU demostrada |
| `white` | `255 255 255` | Consumidor preparado; sin emisión LMU demostrada |
| `black` | `12 12 14` + borde gris | Regla añadida y verificada |
| `checkered` | patrón `repeating-conic-gradient` | Regla añadida y verificada |

## Evidencia visual

- `horizontal-standings-unknown.png`: `session.flag q=missing`; franjas neutras grises.
- `horizontal-standings-yellow.png`: `session.flag q=fresh`; franjas amarillas.
- `horizontal-standings-green.png`: `session.flag q=fresh`; franjas verdes. Es una prueba del consumidor, no una captura LMU.
- `horizontal-standings-black.png`: estado negro, con contraste gris visible.
- `horizontal-standings-checkered.png`: estado a cuadros, con patrón visible.

La sonda de navegador midió en los cinco estados `data-flag`, `--vf-flag`, el pseudo-elemento y una raíz completa de 1280×71.

## Fuente real y bloqueo

El productor Go recorre `REST sessionInfo → parseRESTSessionFlag → Fusion → ObservedState.SessionFlag → BuildSession.Flag`. Su allowlist candidata solo afirma amarillo para enteros 2, 3, 4 y 5; no afirma verde por ausencia. Los golden Overlay V2 inspeccionados tienen `session.flag.q=missing`. La equivalencia REST/SDK y la captura física en una sesión activa LMU siguen pendientes.

Además, el Workshop fija `session.flag=green` en su demo genérica y la sonda de URL `flag` no es un canal general para este widget; por eso las PNG de esta entrega usan un contrato V2 determinista aislado del renderer, no una falsa captura de bandera real.

## Cambios focales

- `src/overlay/design-systems/vantare-functional/tokens.css:467-469`: reglas `black`/`checkered` solo para Broadcast Tower.
- `src/overlay/widget-types/broadcast-tower/broadcast-tower-view-model-v2.test.ts:42-70`: regresiones de ausencia, frescura, stale y vocabulario.
- `work/horizontal-standings-flags.visual.test.tsx`: sonda visual reproducible y generadora de PNG.

## Checks

- Focales Overlay/renderer: 4 ficheros, 75 tests PASS.
- Sonda visual: 5/5 PASS.
- `pnpm run typecheck`: PASS.
- `pnpm run build`: PASS.
- `pnpm run lint`: PASS.
- `git diff --check` del alcance: PASS.
- `go test ./internal/telemetry/projection/overlayv2 ./internal/telemetry/drivers/lmu`: PASS.
- Suite global con almacenamiento temporal: 3682 PASS, 2 skipped y 5 fallos preexistentes fuera de este lote. La ejecución estándar sin `--localstorage-file` provoca 355 fallos de setup porque Node deja `localStorage` indefinido.

No se hizo commit, merge, promoción ni release. El worktree ya contenía cambios concurrentes y se preservó.
