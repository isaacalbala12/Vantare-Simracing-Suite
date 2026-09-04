# R7b/A2 — paridad Fuel V2 cerrada (ISA-894) — 2026-09-04

Writer único en `C:\tmp\vantare-v1-retirada-r7b\vantare-v2`, rama
`vantareapp/isa-894-retirada-v1-r7b`. Base A2 `d32b56f1`
(tree limpio verificado antes de empezar). Sin push/PR/merge/promoción/
release, sin apps/LMU/browser, sin `.env*`, sin dependencias nuevas, sin
`vantare-core`. Todo determinista (unit/integration); cero runtime físico.

## Contrato cumplido

- `FuelHistoryV2 { Q Quality; Lap []int32; Consumed []float64 }`, arrays
  alineadas por construcción, máximo 64, consumo en litros canónicos.
  Conversión a preferencia solo en presentación (`buildFuelHistory`).
- `FuelViewV2` añade `History`, `SessionLaps QValue[float64]`,
  `RequiredFuel QValue[float64]`. `Basis` sigue describiendo SOLO
  `EstimatedLaps`.
- `RequiredFuel = PerLap × SessionLaps` en Go desde `SessionRemaining` +
  player `LastLapTime`, publicado incluso si la base fuel gana; base
  `SessionLaps`, quality peor-de; NUNCA de `EstimatedLaps`.
- Historia desde muestras reales del tracker canónico (mismo gate que el
  promedio), ownership/clone/reset canónicos. Sin sintéticos productivos, sin
  autoridad browser, sin sentinel, sin pérdida de calidad.
- Ventana de promedio 3/10 separada e intacta (`DefaultFuelUsageWindow=3`,
  `MaxFuelUsageWindow=10` sin tocar).
- Comentario de `builder_fuel.go` que dejaba `requiredFuel` ausente,
  DEROGADO por este corte (documentado en el propio builder).
- `fuel.sessionLaps` queda en el wire tipado para futuros consumidores: el
  widget conserva la forma v1 (`lapsRemaining` solo) y no lo decodifica.

## TDD RED → GREEN literal

- RED derive (`go test ./internal/telemetry/derive/ -run TestFuelHistory`):
  `FAIL [build failed]` — `undefined: MaxFuelHistory`,
  `usage.History undefined`, `committed.history undefined` (12+ errores).
- GREEN derive: `MaxFuelHistory=64`, `FuelLapSample{Lap, Consumed}`,
  `FuelHistory{Freshness, Samples}`, `FuelUsage.History`, append en `closeLap`
  con cap 64 (expulsa la más vieja), reset vía constructor existente,
  deep-clone en `cloneFuelUsageTracker` + `cloneFinal` (`pipeline.go`).
  Dos correcciones de fixture propias del test (capacity 300 para fuel 200;
  66 vueltas observadas cierran 65 → serie 2..65), cero cambios de diseño.
- RED projection (`go test .../overlayv2/ -run TestBuildFuel`):
  `FAIL [build failed]` — `view.History/SessionLaps/RequiredFuel undefined`.
- GREEN projection: `FuelHistoryV2` + 3 campos en `frame.go`; `BuildFuel`
  publica `History` (litros→preferencia), `SessionLaps` siempre y
  `RequiredFuel` peor-de; dirty signals nuevas en `cadence.go`
  (`fuelHistoryLen/Last`, `remaining` reusada, `playerLastLap`) para que
  `CachedProjector` no sirva Fuel memoizado obsoleto; `frame_test.go`
  `syntheticFullFrame` con historia 64 peor caso (el gate 64 KiB/@104
  NO se toca); fix de compilación `reflect.DeepEqual` en
  `cadence_projector_test.go:137` (slices ya no comparables con `!=`).
- RED decoder (vitest `fuel-strategy-fuel-history-a2.test.ts`): 3 failed /
  2 passed (history `[]`, requiredFuel `undefined` contra código A1).
- GREEN decoder: `fuel-strategy-view-model-v2.ts` decodifica history a
  `{lap, consumedLiters}` en litros, recorte `historyRows` solo presentación,
  `requiredFuel` verbatim; `DECLARED_GAPS` pasa a `["fuelPercent"]`;
  ajuste mínimo del test A1 `domain-free` (valores idénticos, solo gaps).
  Cero `Date.now`/`Math.random`/`performance.now` ejecutables (solo mención
  en comentario). `fuel-strategy/`: 4 archivos, 17/17.
- Contrato TS solo vía generador oficial (`task` CLI ausente en el worktree;
  comando exacto equivalente del Taskfile: `go run
  ./tools/telemetry-contract-gen`): `Overlayv2FuelHistoryV2` + 3 campos en
  `OverlayFuelViewV2`. `-check` verde.
- Goldens regenerados vía `UPDATE_GOLDEN=1` (mecanismo A1): 4/4 con diff
  exacto y mínimo (solo `sessionLaps` 79 fresh + `requiredFuel`/`history`
  missing; `basis: session` intacto).

## Payload stress @104 (gate intacto, sin cambios para hacerlo pasar)

- Before (`d32b56f1`): **63613 bytes** (margen 1923).
- Preflight local formato cerrado 64 peor caso: ~559 bytes estimados < 1923
  → PROCEED documentado antes de tocar producción.
- After (A2): **64208 bytes** — PASS `< 65536`.
- Delta: **+595 bytes**. Margen restante: **1328 bytes**.
- Veredicto: NO HARD STOP. Sin compresión inventada, sin pérdida.

## Checks exactos

- `gofmt -l` en `derive/` y `overlayv2/`: limpio.
- `go test ./internal/telemetry/derive/ ./internal/telemetry/projection/overlayv2/ -count=1`: ok ambos.
- `go vet` en ambos paquetes: limpio (los 3 `unsafe.Pointer` heredados
  están fuera del diff, verificado A1).
- `go run ./tools/telemetry-contract-gen -check`: verde.
- `git diff --exit-code -- frontend/src/generated/`: limpio tras regenerar.
- vitest focal `fuel-strategy/`: 17/17; shadow
  (`overlay-shadow-comparator` + `overlay-frame-v2-parity`): 33/33.
- `pnpm eslint` en los 4 archivos frontend tocados/generado: limpio.
- `pnpm typecheck` (`tsc -b --noEmit`): mismos 8 errores R7a byte-idénticos
  al baseline en los 3 módulos legacy (`overlay-projection-v1.ts`,
  `projection-observer.ts`, `telemetry-cutover-runtime-harness/main.ts`),
  cero nuevos. NO se declara verde.
- `git diff --check`: limpio (verificado al cierre).
- Sin runtime LMU/Wails: todo sintético/determinista; pendiente de Isaac.

## Commits (rutas explícitas, sin `git add .`)

1. `564016fc` derive + `pipeline.go` + test A2.
2. `97b66d05` frame/builder/cadence/copias + test A2 + goldens + fix test.
3. `0bfb7f3f` contrato TS regenerado.
4. `63bf4eec` decoder + tests frontend.
5. Evidencia + handoff (este archivo y checkpoint vivo).
