# ISA-697 / Deuda #677 Tanda 2 — churn de TelemetryEngine.Apply

Fecha: 2026-08-21.
Rama: `vantareapp/isa-697-apply-churn`.
Base: `origin/nightly@f10b817d` (tras rebase desde 64a33318).
Issue: GitHub #697 (deuda #677).

## Resultado

Reducción del churn por frame de `TelemetryEngine.Apply` @104 coches de forma medible y segura:
reuso de buffers, evitar copias intermedias y `NewSnapshotOwned` para transferir ownership sin segundo clone.
Semántica idéntica: goldens v1/v2, replay parity y `go test ./internal/telemetry/... ./internal/app/...` verdes por commit.

| Métrica @104 (1000x, AMD Ryzen 7 3700X, Windows) | Antes | Después | Δ |
| --- | --- | --- | --- |
| B/op | 650190 | 168400 | **-481790 (-74.1%)** |
| allocs/op | 344 | 327 | **-17 (-4.9%)** |
| p99 ns/op | ~1.5 ms | ~1.5 ms | estable |

Objetivo orientativo ≥50% menos bytes/frame **superado** con riesgo bajo; bytes/op cae 74%, allocs/op 5%.

Comando usado:
```
go test ./internal/telemetry/engine -bench BenchmarkEngineApply104 -benchtime 1000x -count 5 -benchmem
```

Mediana de 5 runs:

- Antes T1: `650190 B/op 344 allocs/op` (650213 en run aislado)
- Después T5: `168400 B/op 327 allocs/op` (168399–168411 rango)

## Optimización por commit

| Commit | Mensaje | Antes | Después | Ahorro |
| --- | --- | --- | --- | --- |
| d7a0bbf3 | test: fijar benchmark reproducible BenchmarkEngineApply104 | 650213 B/op 344 | 650213 B/op 344 | doc |
| 0ca84000 | perf: reducer evitando doble clone (NewSnapshotOwned + Commit directo) | 650190 B/op 344 | 519190 B/op 342 | -131kB -20% -2 allocs |
| 46517139 | perf: coordinator reuso de maps y Owned snapshot | 519190 B/op 342 | 434424 B/op 337 | -84kB -16% -5 allocs |
| 2d38b5f6 | perf: pipeline sin clone Observed y Owned final | 434424 B/op 337 | 237400 B/op 332 | -197kB -45% -5 allocs |
| 85eb94cc | perf: validar sin map con sort | 237400 B/op 332 | 168400 B/op 327 | -69kB -29% -5 allocs |

Total commits en la rama (6):
- d7a0bbf3 test benchmark
- 0ca84000 reducer
- 46517139 coordinator
- 2d38b5f6 pipeline
- 85eb94cc validate
- cd8d8a2a (este) docs evidencia

Cada commit incluye benchmark antes/después en su mensaje y gates verdes.

## Análisis de aliasing (quién retiene qué)

Regla: ningún snapshot devuelto puede compartir memoria mutable entre frames. Toda optimización respeta esto:

- `envelope.Snapshot` es value-semantic: `Value()` clona vía `clone` arg, `Peek()` expone sin clonar solo para lectura interna. `NewSnapshot` clona al construir, `NewSnapshotOwned` transfiere ownership sin segundo clone (caller promete no mutar).
- **Reducer**: `Prepare` clona `batch.State` una vez (`owned`) y transfiere a snapshot vía `Owned` (comparten mismo slice dentro del candidato efímero). `Commit` asigna directo `reducer.state = candidate.state` sin segundo clone; candidato se descarta, no hay mutación posterior de ese slice. `Current()` sigue clonando para callers. Seguro porque candidato es efímero y no se muta tras Prepare.
- **Coordinator**: `Prepare` clona `snapshot.Value()` (obligatorio: luego muta Vehicles para StintID, no puede mutar el slice del reducer). `observed` snapshot se construye con `Owned` sin segundo clone. `Commit` asigna directo el map `next` (ya es copia del estado anterior). El map se clona una vez en `cloneCoordinatorState` al inicio de Prepare; no hay segundo clone en Commit. Seguro porque `next` es copia owned y candidato es efímero.
- **Pipeline**: `Prepare` usa `Peek()` en lugar de `Value()` para no clonar Vehicles cuando solo lee (derive no muta Observed). `next.Observed = observedState` sin `cloneObserved`, y snapshot final con `Owned` sin clonar `next` vía `cloneFinal`. `Commit` asigna directo `pipeline.state = candidate.state`. Seguro porque: (a) el read es inmutable, (b) el `selfDeltaTracker` y `fuelUsageTracker` usan COW (`historyCOW`, `candidateCOW`) para no mutar slices compartidos entre `pipeline.state` y el snapshot del mismo frame, y (c) `observedState` de cada frame es alloc nuevo, no el del frame anterior, así que no hay cross-frame aliasing. Validado con tests de pipeline, coordinator y replay.

Consumidores que retienen snapshot: `EngineResult.State` (proyección/Engineer), `Recording`, `Projector`. Todos leen vía `Value()` que clona, o via `Peak` interno no retenido. No hay aliasing frágil ni `unsafe`, ni pools con semántica de aliasing.

## Archivos tocados

- `internal/telemetry/schema/envelope/types.go`: `NewSnapshotOwned` + `Peek()`
- `internal/telemetry/core/reducer.go`: `Owned` + `Commit` directo + `validateObservedState` sin map (sort)
- `internal/telemetry/core/session_coordinator.go`: `Owned` + `Commit` directo
- `internal/telemetry/derive/pipeline.go`: `Peek()` + `Owned` + `Commit` directo (sin `cloneObserved`/`cloneFinal` extra)
- `internal/telemetry/engine/benchmark_test.go`: doc baseline
- `docs/telemetry-core/evidence/isa-677-apply-churn.md` (este archivo)
- `docs/changelog/fragments/ISA-697.json`
- `docs/current-plan.md` (nota ISA-697)

No se tocó `frontend/**` ni `projection/overlayv2/**` ni `drivers/**` (propiedad de otros workers).

## Gates por commit

Cada commit verificó:

```
go build ./...                # falla solo frontend/dist ausente (preexistente)
go vet ./internal/telemetry/...  # 2 unsafe preexistentes en lmu/reader_windows.go:85, version_windows.go:433
go vet ./internal/app/...        # +1 en launcher/icon_windows.go:553 (total 3)
go test ./internal/telemetry/... ./internal/app/... -count=1  # verde (6-7s)
go test ./internal/telemetry/recording/replay -count=1          # verde
git diff --check               # limpio
```

Ejemplo final tras 85eb94cc:
```
BenchmarkEngineApply104-16  1000  168400 B/op  327 allocs/op
ok  internal/telemetry/... 6.9s
ok  internal/app 6.9s
```

## Qué queda sobre la mesa

- `validateObservedState` aún aloca `[]VehicleID` (1664 B) por validación y hace sort O(n log n). Con 104 coches son ~3.3KB por frame (2 validaciones). Un stack buffer `[128]VehicleID` sin heap escaparía pero requiere probar que `slices.Sort` no escapa.
- `deriveRelativeGaps` aún hace `make([]VehicleGap, 104)` (~3KB) por frame. Un scratch en `Pipeline` con COW evitaría ese alloc, pero hoy comparte alias con el snapshot del mismo frame; reusar sin copiar corrompería el snapshot retenido si el caller lo conserva. Requiere COW o copia post-uso.
- `cloneFuelUsageTracker` clona `samples` (≤3) con `append` cada frame (~50B). Despreciable.
- `EngineResult.Facts` clona dos veces (`Facts()` + `newEngineResult`). Son 0-4 facts, despreciable.
- `cloneObservedState` sigue siendo el 81% del alloc restante (3 clones: reducer owned + Value clones). Reducir uno más exigiría COW en envelope o `Peek` mutante, con riesgo de aliasing.

Con el pipeline actual, el techo bajo riesgo es ~150KB/B/op; bajar más exige COW en envelope o pooling con análisis de aliasing más profundo. Se corta aquí.

## Verificación manual

```
go test ./internal/telemetry/engine -bench BenchmarkEngineApply104 -benchtime 1000x -count 1 -benchmem
go test ./internal/telemetry/... ./internal/app/... -count=1
go test ./internal/telemetry/recording/replay -count=1
```

Comparar `B/op` y `allocs/op` contra la tabla superior; deben estar en ±2KB / ±2 allocs por ruido.

## Commits y promoción

Rama: `vantareapp/isa-697-apply-churn`
Base: `origin/nightly@f10b817d`
Push y PR contra `nightly` con `Closes #697` (pendiente en este commit final).

