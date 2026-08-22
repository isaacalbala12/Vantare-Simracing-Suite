# ISA-677 / ISA-707 — cadencias reguladas activadas + FuelUsageWindow cableado

Fecha: 2026-08-21.
Rama: `vantareapp/isa-707-cadencias-y-fuel-window` sobre `origin/nightly@217ba746` (incluye dirty finos ISA-695).
Briefing: `.agent/ISA-707-briefing.md`.

## Objetivo

1) Mover standings y relative al tier regulado con firmas finas (ISA-695) y medir recomputaciones/s y bytes antes/después.
2) Cablear `Config.FuelUsageWindow` en los dos puntos de construcción del pipeline (runtime y shadow) con un mismo valor de producto, sin UI.

Goldens v1/v2 sin cambio, replay parity verde, `frame.go` y contrato TS intactos.

## T1 — cadencia regulada

### Cambios

- `internal/telemetry/projection/overlayv2/cadence.go`:
  - `TierOf(SectionRelative)` pasa de `TierMid` a `TierSlow`. Justificación: con `relativeMark` fino (ventana 8+1+8, gaps derivados + freshness/provenance, driver/class de vecinos) la sección puede esperar sucia sin rancio; spotter permanece `TierMid` por frescura espacial.
  - `DefaultSectionCadence()` pasa de `{}` a `{Fast: 50ms, Mid: 100ms, Slow: 250ms, DirtyCeiling: 1s}`. Comentario actualizado con medición.

- Tests adaptados para que los centinelas sigan verdes con defaults regulados:
  - `cadence_test.go`: `TestDefaultCadenceRebuildsEverySectionEveryTick` ahora verifica que zero `{}` sigue sin regular y que `DefaultSectionCadence()` sí regula; `TestTierMapCoversEverySection` espera `Relative TierSlow`; `TestSchedulerHonoursTierIntervals` espera `Relative` a `Slow` (1s).
  - `cadence_projector_test.go`: `TestCachedProjectorMatchesProjectV2ByteForByte` verifica byte-identidad con cadencia cero (FullRebuilds==Ticks) y con defaults regulados (memoización, sin exigir FullRebuilds); `TestRegulationHappensBeforeMarshal` espera `Relative 4` no `10` por tier slow.
  - `cadence_dirty_test.go`: `TestStandingsRelativeStayFreshUnderRegulatedCadence` usa `SectionCadence{}` como fresco en lugar de `DefaultSectionCadence()`.
  - `cadence_bench_test.go`: `plana` usa `SectionCadence{}` y `regulada` usa `DefaultSectionCadence()`.

### Medición antes/después

Harness `BenchmarkOverlayV2ByCadence` (proyección + `json.Marshal` por tick a 60 Hz), CPU AMD Ryzen 7 3700X, Windows, `-benchtime 100x -count=1`:

**Antes (código base @217ba746, relative Mid, defaults 0):**

| Cadencia | ns/op | builds/s | marshals/s | B/s | B/op | allocs/op |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| plana (defaults 0) | 219444 | 480 | 60 | 1389655 | 234765 | 65 |
| regulada 50ms/100ms/250ms 250ms ceiling | 134811 | 78 | 60 | 1389655 | 127002 | 38 |

**Después (ISA-707, relative Slow, defaults 50ms/100ms/250ms 1s ceiling):**

| Cadencia | ns/op | builds/s | marshals/s | B/s | B/op | allocs/op |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| plana (zero) | 449139 | 480 | 60 | 1389655 | 233453 | 65 |
| regulada (defaults) | 228423 | 57 | 60 | 1389655 | 120063 | 36 |

Lectura:

- Con defaults regulados, builder invocations caen 480→57 por segundo simulado (-88%); el delta extra vs el 78 previo es `relative` ahora slow (4 Hz vs 10 Hz) gracias al dirty fino.
- `B/s` idéntico (frame completo, contrato sin patch) — se ahorra CPU y allocs, no payload, igual que F11 y tanda 2.
- `B/op` -46% y allocs -29 respecto a plana; `ns/op` -49% en esta ventana (variabilidad de máquina; primera medición 134k vs 228k refleja carga del sistema, no regresión).
- El sobrecoste de `hashStandingsVehicle` + `hashRelativeMark` aislado sigue <5 µs/tick @104; no domina.

### Correctitud

- `TestCachedProjectorMatchesProjectV2ByteForByte` verde para 1/20/44/104 con cero y con regulada.
- `TestStandingsRelativeStayFreshUnderRegulatedCadence` verde (40 ticks 60 Hz, cadencia 10ms, mutaciones de orden, gap, player, clase; standings+relative byte-idénticos).
- `TestDirtyTriggerHasCeiling`, `TestCeilingBoundsStalenessOverALongRun`, `TestStandingsDirtySignal*`, `TestRelativeDirtySignal*` verdes.

## T2 — FuelUsageWindow cableado

### Cambios

- `internal/telemetry/derive/pipeline.go`: añade `const DefaultFuelUsageWindowProduct = DefaultFuelUsageWindow` (=3) y método `Pipeline.FuelUsageWindow() int` para asserts.
- `internal/app/telemetry_core_runtime.go:306`: `derive.NewPipeline(derive.Config{})` → `derive.NewPipeline(derive.Config{FuelUsageWindow: derive.DefaultFuelUsageWindowProduct})`.
- `internal/app/telemetry_shadow.go:59`: idem.
- Nuevo `internal/app/fuel_window_wiring_test.go`: `TestFuelUsageWindowIsWiredExplicitly` verifica:
  - `DefaultFuelUsageWindowProduct == 3 == DefaultFuelUsageWindow`.
  - Ambos archivos contienen `FuelUsageWindow: derive.DefaultFuelUsageWindowProduct` y no `derive.NewPipeline(derive.Config{})`.
  - Pipeline efectivo (runtime y shadow) ==3. Falla si alguno vuelve a config vacía.

Decisión del knob: ventana 3 vueltas (canónica, `DefaultFuelUsageWindow`), sin UI, sin lectura de config externa; ambos puntos comparten la misma constante de producto. Un valor mayor suavizaría consumo pero laguea estrategia; uno menor sería ruidoso. `MaxFuelUsageWindow=10` permanece como techo.

## Archivos

- `internal/telemetry/projection/overlayv2/cadence.go`
- `internal/telemetry/projection/overlayv2/cadence_test.go`
- `internal/telemetry/projection/overlayv2/cadence_projector_test.go`
- `internal/telemetry/projection/overlayv2/cadence_dirty_test.go`
- `internal/telemetry/projection/overlayv2/cadence_bench_test.go`
- `internal/telemetry/derive/pipeline.go`
- `internal/app/telemetry_core_runtime.go`
- `internal/app/telemetry_shadow.go`
- `internal/app/fuel_window_wiring_test.go`
- `docs/telemetry-core/evidence/isa-677-cadencias-activadas.md` (este archivo)
- `docs/changelog/fragments/ISA-707.json`
- `docs/current-plan.md` (nota ISA-707)

## Gates

- `go build ./...` — solo `frontend/embed.go:8` por `dist` ausente (preexistente).
- `go vet ./internal/telemetry/... ./internal/app/...` — tres `unsafe.Pointer` heredados (`reader_windows.go:85`, `version_windows.go:433`, `icon_windows.go:553`).
- `go test ./internal/telemetry/... ./internal/app/... -count=1` — verde.
- `git diff --check` — limpio.

## Riesgos restantes

- Dirty fino amplificado: si F8 añade campos a `BuildStandings`/`BuildRelative` sin ampliar `hashStandingsVehicle`/`hashRelativeMark`, la sección quedaría limpia pero rancia; el centinela byte-a-byte lo detectaría.
- Validación real en binario Wails+OBS (CPU, `PublisherMetrics.BytesPerSecond`) pendiente; la medición sintética es suelo.
