# ISA-372 / F3 — `TelemetryEngine.Apply` e identidad con gracia

Fecha: 2026-08-19.

Rama: `vantareapp/isa-372-tc-f3-engine-apply`.

Base: `tc-integration@c52d6c1d72858b9578836461c5e4b567b452519c`
(Nightly + F0 + F1 + F4 + F5 + F2).

## Resultado

- `TelemetryEngine.Apply` prepara reducer, coordinator y derive antes del
  primer commit. Un error de cualquier stage deja estado, cursor y facts en el
  último commit completo. `TelemetryEngineApply` está on por defecto y conserva
  el camino anterior como rollback de un ciclo.
- El mapper conserva su cursor hasta que el sink acepta la transacción. El
  reducer ya no tiene loop propio y el derive ejecuta su cadena fija dentro de
  `Apply`; se retiró el registro DAG que no gobernaba ejecución. Las cuatro
  `AlgorithmVersion` siguen presentes sin cambiar sus valores.
- El coordinator mantiene hasta 512 identidades por defecto y expulsa por LRU
  determinista solo identidades inactivas. Los coches activos nunca se
  expulsan para hacer pasar el límite.
- Un slot ausente hasta 30 frames conserva `VehicleID` al reabrir si coinciden
  `(sourceKey, driverName, class)`. Un fingerprint distinto o el vencimiento de
  la gracia incrementa la generación. La desaparición del player no abre epoch
  ni borra controles/delta.
- `StintID` cambia dentro de la misma sesión/vehículo cuando cambia piloto o
  equipo, y `FactDriverChanged` lleva el nuevo stint. LMU aporta `DriverName`;
  no se inventa `TeamID` porque la observación no contiene una fuente fiable.
- El shadow Go no tiene Wails, SSE, store, Engineer ni Recording. Mantiene una
  orquestación legacy privada sobre todos los batches para no romper cursores e
  historiales, compara semánticamente uno de cada 30 por defecto y se
  auto-desactiva al superar 2 ms. Una divergencia o fallo solo incrementa
  métricas; nunca cambia el resultado autoritativo.
- Métricas payload-free: `EngineSequence`, `FramesRejected{stage,reason}`,
  `SlotGraceReopen`, `SlotGenerationBumps`, `IdentityEvicted`,
  `ApplyDurationUs{Count,P50,P99}`, `ShadowMismatches{field}` y
  `ShadowDisabled`.

Los contratos y goldens de proyección v1 no cambiaron.

## Tests de F0 activados y regresiones nuevas

Activados sin relajar aserciones:

- `TestPostReducerStageFailureKeepsCursorsAligned`.
- `TestVehicleHistoryDoesNotOverflowInLongSession`.
- `TestSlotMissingOneFrameKeepsVehicleIdentity`.
- `TestSessionSignatureStaleDoesNotMergeSessions`.

Regresiones principales añadidas:

- fachada y rollback: `TestEngineFacadeMatchesLegacyOrchestration` y
  `TestTelemetryEngineApplyFlagDefaultsOnAndCanRollback`;
- atomicidad/reintento: `TestApplyIsAllOrNothing` y
  `TestApplyRetryDoesNotDivergeCursors`;
- arquitectura: ausencia de `Reducer.Run`, del registro DAG y de imports LMU
  desde engine;
- identidad: `TestIdentityEvictionKeepsBoundedMemory` (500 identidades),
  `TestGraceWindowExpiryReleasesSlot`, reutilización de slot, reaparición del
  player y `TestDriverChangeEmitsFactAndOpensNewStint`;
- copy-on-write: el candidato delta no puede mutar las historias commiteadas;
- shadow: `TestShadowHasNoExternalEffects`, `TestShadowReportsMismatch` y
  auto-disable por presupuesto;
- métricas: secuencia, rechazo tipado, percentiles, gracia, bumps y expulsión.

## Benchmark `Apply`

Comando reproducible para percentiles:

```text
go test ./internal/telemetry/engine -run '^$' -bench 'BenchmarkEngineApply(20|64|104)$' -benchtime=200x -benchmem -count=3
```

En Windows/amd64, Ryzen 7 3700X, tres repeticiones con ventana fija de 200
operaciones @104 dieron medias de 185,8–236,9 µs y p99 de 578,8–777,8 µs. Sin
embargo, el benchmark adaptativo sostenido dio medias de 418,9–534,0 µs y p99
de 10,5–12,1 ms. Por tanto, el objetivo p99 < 1 ms se cumple en la ventana
acotada, pero **no queda demostrado bajo carga sostenida**. @104 conserva unas
650 KiB y 344 allocs/op, dominadas por clones defensivos de snapshots y pausas
de GC; retirarlos queda fuera de F3 porque protegen ownership y exige un plan
de rendimiento separado. Ninguna cifra local acredita LMU, Wails, WebView2 ni
OBS real.

## Gates locales

- `pnpm --dir frontend install --frozen-lockfile`: PASS; materializó
  dependencias ignoradas del worktree.
- `pnpm --dir frontend build`: PASS; materializó `frontend/dist` ignorado para
  el embed Go. No se modificó código frontend.
- `go build` de paquetes productivos, excluyendo solo `build/ios`: PASS.
- `go vet ./internal/telemetry/... ./internal/app/...`: exit 1 únicamente por
  los tres `unsafe.Pointer` preexistentes en `reader_windows.go`,
  `version_windows.go` e `icon_windows.go`.
- `go test` de `./internal/telemetry/... ./internal/app/... -count=1`,
  excluyendo `internal/app/launcher` por el panic preexistente de
  `TestDiscoverIconsSmoke`: PASS.
- Replay canónico con Core, Derive y todas las proyecciones: PASS; el mismo
  test calcula el digest bajo pacing escalonado y temporizado.
- `git diff --check`: PASS.

## Commits por tarea

- F3.1 `53b4b4b6` — fachada transaccional.
- F3.2 `56617459` — prepare/commit atómico.
- F3.3 `1351d51c` — retirada del loop del reducer.
- F3.4 `b4b903b5` — LRU de identidades.
- F3.5 `c319aa57` — ventana de gracia.
- F3.6 `88f98730` — stint y cambio de piloto.
- F3.7 `f35a7885` — derive, COW y benchmark.
- F3.8 `179a1904` — shadow muestreado.
- F3.9 — métricas y documentación en el commit final de esta rama.

## Verificación manual pendiente y límites

1. Ejecutar una sesión LMU real con desaparición/reaparición breve de un rival
   y comprobar que `SlotGraceReopen` aumenta sin cambiar su `VehicleID`.
2. Provocar una sustitución de piloto y comprobar `FactDriverChanged` y un
   `StintID` nuevo sin cambio de session/vehicle/epoch.
3. Mantener el shadow durante sesiones reales y revisar cero mismatches antes
   de retirar el legacy en F13; el gate de estabilidad sigue siendo 2 Nightly
   y 3 sesiones reales.
4. Verificar latencia y auto-disable en runtime instalado; el benchmark local
   no sustituye esa prueba.
5. Reducir y volver a medir las asignaciones de snapshots antes de considerar
   cumplido el objetivo p99 sostenido @104.

No se ejecutaron LMU, Wails/OBS instalados, CI remoto ni el gate de estabilidad
real. Trabajo local: sin push, PR, merge, promoción ni release.
