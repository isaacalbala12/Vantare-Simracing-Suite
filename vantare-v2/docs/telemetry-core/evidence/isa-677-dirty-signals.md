# ISA-677 / ISA-695 — dirty-signals finos para standings y relative

Fecha: 2026-08-21.

Rama: `vantareapp/isa-695-dirty-signals-standings-relative`.

Base: `origin/nightly@64a33318`.

## Objetivo

El `CachedProjector` ya tenía cadencias por tier (Fast/Mid/Slow con `DirtyCeiling`), pero `standings` y `relative` se recomputaban siempre o con una señal gruesa (solo posiciones y freshness) que impedía activar cadencias reguladas sin riesgo de servir datos rancios. Esta tanda cierra señales finas para ambas secciones sin activar cadencias nuevas por defecto: la activación regulada queda como decisión posterior del orquestador.

El frame publicado sigue siendo **completo** y byte-idéntico con los defaults. Un tick que no reconstruye una sección reutiliza el valor memoizado.

## Qué observa cada señal

### Standings (`SectionStandings`, Slow)

Fingerprint FNV-1a `standingsMark` sobre exactamente los campos que `BuildStandings` proyecta, por vehículo y en orden de observación:

- `Identity.Vehicle` (roster)
- `Position` valor + presencia + `Freshness` (decide orden y fallback `index+1`)
- `VehicleClass` valor + calidad
- `DriverName` valor + calidad
- `TimeBehindLeader` (`TimeGap`) valor + calidad (gap a líder, bit a bit; el frame v2 lo publica sin cuantización)
- `LapsBehindLeader` (`LapGap`) valor + calidad
- `InPit` valor + calidad (pit/track/empty)
- `CompletedLaps` valor + calidad
- `LastLapTime` valor + calidad

También se compara `len(Vehicles)` para detectar altas/bajas de roster. Señales no proyectadas (`EngineRPM`, `BestLapTime`, `Speed`, `WorldPosition`, `Gear`, `Fuel`, etc.) no ensucian la sección. Un `Freshness` que pasa de `fresh` a `stale` sin cambiar el valor sí ensucia, porque cambia el sort y el `ClassPosition` derivado.

Coste: una pasada lineal sobre `Observed.Vehicles` (104), sin asignaciones ni copias, `hashStandingsVehicle` por vehículo.

### Relative (`SectionRelative`, Mid)

Fingerprint `relativeMark` sobre la **ventana publicada** (`MaxRelativeAhead=8`, player, `MaxRelativeBehind=8`), no sobre todo el grid:

- Identidad del player (`Player` valor + `Freshness` + `VehicleID`); sin player la ventana es vacía.
- Mapa de `Derived.Gaps` (`GapSet.Vehicles`): por vehículo `Time` (`RelativeTime`) con presencia + `Freshness` + `Provenance` + bits, y `Laps` (`RelativeLaps`) idem. La frescura y la provenance importan porque llegan al wire como `QValue.Q` y `Authority`.
- Candidatos: `Time` usable = presente + `fresh|stale` + finito. Se ordena descendente por valor y desempate por `VehicleID` (igual que `BuildRelative`), se parte por signo y se recorta a 8/8. Vehículos con `Laps !=0` o `Time` missing quedan fuera de la ventana.
- Por cada fila dentro de la ventana (ahead far→near, player, behind near→far) se hashea: `VehicleID`, `Time` + `Laps` (gap), `DriverName` + `VehicleClass` de ese `VehicleState` (como el builder los proyecta), y `Side`. Cambiar `DriverName`/`ClassID` de un vecino dentro de la ventana ensucia; cambiarlos en un vehículo fuera de la ventana no.
- Cardinalidad de la ventana (`len(ahead)`, `len(behind)`) para distinguir vacía vs poblada.

Así, cambiar el player o cualquier vecino seleccionado ensucia aunque el resto del grid no cambie; cambiar un faro a -999 s fuera de la ventana se mantiene limpio.

Coste: map `gapsByVehicle` (cap 104) + slice de candidatos (cap 104) + `sort.Slice` O(n log n) con n ≤ 104; dos asignaciones pequeñas por tick (map + slice). Con `GOMEMLIMIT` local y `-benchtime 100x` no domina el tick.

### Otras secciones (sin cambios)

- `Session`, `Fuel`, `Spotter`, `Delta`, `Capabilities` conservan sus señales previas. `Session` observa `TrackName`, `SessionType`, `MaximumLaps` y `SessionRemaining` derivado; `Fuel` el `Fuel` del player; `Spotter` la frescura de `WorldPosition`; `Delta` la frescura del delta derivado; `Capabilities` el estado de fuente y capacidades declaradas. `Player`/`Controls` (Fast) nunca se gatean por dirty.

## Coste por frame @104

`BenchmarkOverlayV2ByCadence`, mismo harness que F11 (proyección + `json.Marshal` por tick a 60 Hz), Windows AMD Ryzen 7 3700X, `-benchtime 100x -count=1`:

| Cadencia | ns/op | builds/s | marshals/s | B/s | B/op | allocs/op |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Plana (defaults, sin regulación) | 220.963 | 480 | 60 | 1.386.895 | 232.743 | 64 |
| Regulada 20 Hz fast / 10 Hz mid / 4 Hz slow (`DirtyCeiling` 250 ms) | 181.370 | 78 | 60 | 1.386.895 | 127.626 | 38 |

Lectura:

- Con los defaults no se evita trabajo (`FullRebuilds == Ticks`) y la señal fina no añade regresión: el `TestCachedProjectorMatchesProjectV2ByteForByte` sigue byte-idéntico para 1/20/44/104 coches.
- Con regulación, las invocaciones de builder caen de 480 a 78 por segundo simulado y el coste por tick -18%, 26 allocs menos por tick. `B/s` no cambia porque el contrato sigue publicando frame completo; se ahorra CPU, no payload (igual que F11).
- El sobrecoste de las dos señales finas aislado (sin regulación) es < 5 µs por tick @104 en esta medición (una pasada lineal para standings + map+sort para relative); queda dentro del ruido del tick completo y no aumenta `allocs/op` de forma visible.

La medición regulada es suelo, no techo: con builders reales de F8 el ahorro crece porque cada `SectionStandings`/`SectionRelative` evita clonar, ordenar y formatear Quality.

## Correctitud

- `TestStandingsDirtySignalIgnoresUnprojectedChanges` y `TestRelativeDirtySignalIgnoresUnprojectedChanges`: frame idéntico → limpio; `EngineRPM`/`BestLapTime`/`Speed` solo → limpio; orden, identidad de roster, gap bit a bit, clase, pit, freshness de posición, nombre de piloto, vueltas completadas, último tiempo, switch de player y gaps de ventana → dirty.
- `TestStandingsDirtySignalMatchesTheBuiltRows` / `TestRelativeDirtySignalMatchesBuiltRows`: si `BuildStandings`/`BuildRelative` publican filas distintas, la señal no se queda limpia.
- `TestRelativeWindowFarVehicleStaysClean`: cambiar gap y clase de `vehicle-090` fuera de la ventana (104 grid, player líder) no ensucia `relative` (sí ensucia `standings` si cambia clase, que incluye todo el grid).
- `TestStandingsRelativeStayFreshUnderRegulatedCadence`: 40 ticks a 60 Hz con cadencia regulada 10 ms/10 ms/10 ms y mutaciones deterministas de standings (orden), relative (gap de `vehicle-001`), player switch a `vehicle-010` y clase. En cada tick donde hubo cambio material, `CachedProjector` regulado y uno fresco (defaults) publican `Standings` y `Relative` byte-idénticos. Ruido de `vehicle-040` fuera de ventana se mantiene limpio.
- `TestCachedProjectorMatchesProjectV2ByteForByte` y `TestDirtySlowSectionPublishesBeforeTheCeiling` siguen verdes.

## Qué falta para activar cadencias reguladas

1. Decisión de producto/orquestador sobre cadencias por defecto. Hoy `DefaultSectionCadence()` es cero (sin regulación). Bajarlo requiere medición en binario real Wails+OBS (CPU y `PublisherMetrics.BytesPerSecond` ya existen, pero `B/s` no bajará por contrato completo).
2. Cablear el `CachedProjector` en `telemetry_core_runtime.go` (carril A, fuera de este worker). Esqueleto:
   ```go
   runtime.overlayV2Projector = overlayv2.NewCachedProjector(overlayv2.DefaultSectionCadence())
   update, err := runtime.overlayV2Projector.Project(final, overlayv2.SourceContextV2{...}, overlayv2.DefaultPreferencesV2(), revision, runtime.now())
   ```
   Y retirar la excepción de `cadence.go` en `wiringGuardAllowed` (`internal/telemetry/wiring_guard_test.go`), hoy permitida solo porque el código está desconectado.
3. Ningún cambio de goldens ni de `frame.go`/contrato TS en esta tanda (prohibido por briefing; hay PRs en vuelo que los tocan).
4. Si F8 añade campos a `BuildStandings`/`BuildRelative` (p. ej., dorsal), ampliar `hashStandingsVehicle`/`hashRelativeMark` en el mismo PR que puebla el builder, o `TestCachedProjectorMatchesProjectV2ByteForByte` lo señalará.

## Gates

- `go build ./...` — solo `frontend/embed.go:8` por `dist` ausente (preexistente, ajeno a Go).
- `go vet ./internal/telemetry/...` — dos `unsafe.Pointer` heredados en `drivers/lmu` (`reader_windows.go:85`, `version_windows.go:313`).
- `go test ./internal/telemetry/... -count=1` — verde (incluye `overlayv2` 0.3s).
- `git diff --check` — limpio.

## Archivos

- `internal/telemetry/projection/overlayv2/cadence.go` — añade `relativeMark`, calcula `hashRelativeMark` y desacopla `Relative` de `standingsMark`/`gapsFreshness`.
- `internal/telemetry/projection/overlayv2/cadence_dirty.go` — `hashStandingsVehicle` fino + `hashRelativeMark` con ventana 8+1+8, `hashRelativeGap`/`Laps`, helpers de provenance/freshness.
- `internal/telemetry/projection/overlayv2/cadence_dirty_test.go` — tests finos de standings y relative + centinela `TestStandingsRelativeStayFreshUnderRegulatedCadence`.
