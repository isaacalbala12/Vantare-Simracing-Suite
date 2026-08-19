# Plan (SDD · PLAN): Migración incremental a telemetría Go-first híbrida

Fecha: 2026-08-19. Issue madre: ISA-372. Spec: `docs/superpowers/specs/2026-08-19-isa-372-telemetry-go-first-hybrid-spec.md`. Evidencia y detalle operativo: `docs/research/telemetry-architecture-2026/11-final-recommendation.md` y `12-migration-plan.md` (rama `isa-371`, commit `9be5bf5b`). ADR: `docs/adr/0008-telemetry-engine-commit-boundary-and-overlay-frame-v2.md` (Proposed).
Flujo: cada fase = issue-madre Linear + sub-issues por PR; rama y worktree por issue; `rama → nightly → testers → master`; commits pequeños por tarea; sin push/PR/promoción sin pedirlo; orquestador Fable; workers Codex (gpt-5.6-sol, medium) u Opus según tarea.

## Overview

No es una reescritura: catorce fases entregables, verdes y reversibles por separado. Primero la **red de seguridad** (tests que hoy fallan) y el **fallo no terminal**; después la **transacción única** del engine; después el borde de producto (`OverlayFrame v2` + builders, contrato TS generado) en **shadow por feature**; retirada del legacy TS solo con paridad y gate de estabilidad; por último capabilities/multi-sim, cadencias, puertos futuros y guardarraíles.

Camino crítico: **P0 → F0 → F3 → F6 → F8 → F9**. Secuencia de arranque recomendada: **P0 → F0 → F1 → (F3 ∥ F2 ∥ F4) → F5 → F6 → (F7 ∥ F8) → F9 → (F10 ∥ F11 ∥ F12) → F13**.

## Architecture Decisions (resumen; detalle en spec §3–§8 y ADR 0008)

1. **Una frontera de commit** (`TelemetryEngine.Apply`): estado + cursor del mapper + facts visibles a la vez; fallo = descartar + contar, nunca terminal. Cierra D-01/D-02.
2. **Publicación y consumidores fuera del commit**, con `recover()` y métricas por frontera. Engineer async latest-wins + facts ordenados; Strategy sin transporte público; Recording cola acotada con gap markers.
3. **`OverlayFrame v2` compacto** con status dentro (`OverlayUpdate`), builders Go por feature, Publisher único latest-wins con `ReplaySnapshot()`. `statusRevision` contiguo, RFC 7396 y seal SHA-256 se retiran.
4. **Identidad**: ventana de gracia de slot, evicción acotada, `StintID`, "cambio de player" ≠ epoch. Cierra D-03/D-04/D-05.
5. **Contrato TS generado** desde tipos wire Go con gate de CI. El canonical **no** se genera (pospuesto con condiciones falsables, 12 §7).
6. **Paridad**: replay por digest (primaria) + shadow Go muestreado (F3) + shadow por feature en frontend (F6/F8) + gate de estabilidad (2 Nightly, 3 sesiones reales) antes de F9.
7. **Borrado de lo desconectado** con guard de wiring ejecutable (símbolo exportado solo en tests = fallo).
8. **Capabilities `Supported/Available/Modes`** cableadas de extremo a extremo; driver sintético SimX como prueba de "cero cambios en widgets".

## Fases

Tamaño: S = 1 PR · M = 2–4 PRs · L = 5–8 PRs.

### P0 — Prerrequisitos (bloqueante)

| Tarea | Contenido | Issue | Tamaño |
|---|---|---|---|
| P0.1 | Aislar el cambio local de `internal/updater/*` en su propia issue/rama | nueva (S) | S |
| P0.2 | Committear **DELTA-TELEMETRY** (`mDeltaBest` nativo: `drivers/lmu/*`, `derive/{delta,pipeline}.go`, `catalog/*`, `core/reducer.go`, `projection/overlay/v1.go`, goldens, `docs/telemetry-core/*`) en rama de issue; gate `go test ./internal/telemetry/...` + paridad de replay | nueva (M) | M |
| P0.3 | Committear **DELTA-REFERENCES** (widget Delta + inspector + i18n) detrás de P0.2 | nueva (M) | M |
| P0.4 | Promocionar ambas a `nightly`; línea base verde | — | — |
| P0.5 | Alternativa si Isaac no promociona: archivar (rama `archive/delta-native-local-2026-08`) y regenerar goldens desde HEAD limpio | nueva (S) | S |
| P0.6 | ADR 0008 Proposed → Accepted (bloquea la primera frontera, F1) | ISA-372 | S |
| P0.7 | Nota en `docs/telemetry-core/README.md:12` y `runtime-fanout.md` marcada "en revisión por ADR 0008" (corrección definitiva en F4/F13) | F4 | S |

Condición de arranque de F0: `git status --short` limpio en `internal/telemetry/**`, `internal/app/telemetry*`, `frontend/src/overlay/**`.

### F0 — Red de seguridad (M · Bajo) — depende de P0

Crear solo tests y baseline: `internal/app/telemetry_core_runtime_grid_test.go`, `internal/app/telemetrytransport/payload_ceiling_test.go`, `internal/telemetry/core/commit_boundary_test.go`, `internal/telemetry/drivers/lmu/identity_grace_test.go`, `internal/app/telemetry_core_runtime_consumer_test.go`, `internal/app/telemetry_core_runtime_watchdog_test.go`, `frontend/src/telemetry-transport/store.freshness.test.ts`, `bench/results/baseline-2026-08/*`.
Tests que deben **fallar** por la causa esperada: `TestRuntimePublishes104VehiclesEndToEnd` (D-08), `TestOverlayPayloadStaysUnderTransportLimit` (1/20/44/104), `TestPostReducerStageFailureKeepsCursorsAligned` (D-01), `TestPublishFailureIsNotTerminal` (D-02), `TestVehicleHistoryDoesNotOverflowInLongSession` (D-04), `TestSlotMissingOneFrameKeepsVehicleIdentity` (D-03), `TestSlotReusedByAnotherCarGetsNewIdentity`, `TestSessionSignatureStaleDoesNotMergeSessions`, `TestSlowEngineerDoesNotBlockDriverLoop`, `TestConsumerPanicDoesNotKillProcess`, `TestFrozenPipelineStopsReportingFresh` (D-06), `TestStatusErrorReachesSubscribersBeforeHubsClose`, `store.freshness.test.ts`, `store.test.ts` (revisión no contigua, D-07), `BenchmarkOverlayProjectionAndMarshal{1,20,44,104}`.
Los tests se marcan `t.Skip`/`test.skip` con el ID de defecto hasta que su fase los active (CI verde; el `Skip` lista el defecto). Criterio: todos existen y fallan por el motivo esperado cuando se quita el Skip.

### F1 — Fallo no terminal y publicación fuera del commit (M · Medio) — depende de F0 y ADR 0008

Modificar `internal/app/telemetry_core_runtime.go` (clasificación de errores en vez de `failStop` uniforme; publicación tras el commit; `recover()` por frontera; status `error` antes de cerrar hubs), `telemetrytransport/transport.go` (`ErrPayloadTooLarge` → descartar + contar, límite conservado como prueba de contrato), `core/driver_manager.go` (`setTerminal` solo errores de programación). Crear `telemetry_core_runtime_failure_policy.go` (tabla error → clase) y métricas (`telemetry_frames_dropped_total{reason}`, `telemetry_publish_failures_total{product}`, `telemetry_consumer_panics_total{boundary}`, `telemetry_fail_stop_total`, `telemetry_payload_bytes{product}`). Flag `telemetryFailurePolicyV2` (on en rama; rollback por flag).
Tests después: `TestFailureClassificationTable`, `TestDroppedFrameIncrementsCounterAndPublishesDegraded`, `TestRuntimeRestartsAfterTransientFailure`. Criterio: con 104 coches el runtime **degrada y sigue**; `telemetry_fail_stop_total` = 0 en 60 min reales; goldens v1 sin cambio.

### F2 — Watchdog y stale honesto (S–M · Bajo) — depende de F1

Backend: watchdog monotónico "sin frames desde hace X" que degrada el status. Transporte: `transport.go:333` deja de exigir contigüidad de `statusRevision`. Frontend: `store.ts` acepta revisión mayor no contigua; `freshness-watchdog.ts` (edad local `capturedAt` vs `Date.now()`); adapter propaga degradación sin inventar valores. Métricas `telemetry_last_frame_age_ms`, `telemetry_watchdog_degradations_total`; diagnóstico `snapshot-stale-watchdog`. Tests: `TestWatchdogDegradesWithinOneSecond`, `store.watchdog.test.ts`, `TestReconnectRecoversWithoutRestart`. Cierra D-06/D-07. Flag `telemetryWatchdogEnabled`.

### F3 — Transacción única `TelemetryEngine.Apply` (L · Alto) — depende de F0; ∥ F2/F4; **no** ∥ F1/F7

Crear `internal/telemetry/engine/{engine,commit}.go`, `internal/telemetry/identity/{slot,eviction}.go`, `schema/identity/stint.go`. Modificar `drivers/lmu/batch_mapper.go` (prepare/commit; cursor no avanza hasta el commit; player-change ≠ epoch; `RunIdentity.Driver/Team` desde `DriverName`), `core/reducer.go` (deja de commitear por su cuenta; conserva errores tipados y clones), `core/session_coordinator.go` (entra en `Apply`; sin cursor propio; evicción en vez de tope 104), `derive/pipeline.go` y `derive/delta.go` (dentro de `Apply`; `AlgorithmVersion` conservado; `cloneSelfDeltaTracker` copy-on-write), `telemetry_core_runtime.go` (llama a `Apply`), `architecture_test.go` (reglas para `engine/`, `identity/`). Borrar `Reducer.Run` y el registro DAG muerto de `derive`. Flag `telemetryEngineApply`. 5–8 PRs: fachada primero, componentes después.
Shadow Go muestreado (spec §8): `internal/app/telemetry_shadow.go` compara `Apply` contra la orquestación actual sobre la misma observación; comparador semántico; auto-disable.
Tests después: `TestApplyIsAllOrNothing` (error en cada paso × cada error tipado), `TestApplyRetryDoesNotDivergeCursors`, `TestGraceWindowExpiryReleasesSlot`, `TestPlayerReappearanceKeepsControlsHistoryAndDeltaReference`, `TestDriverChangeEmitsFactAndOpensNewStint` (D-05), `TestIdentityEvictionKeepsBoundedMemory`; paridad de replay por digest en dos pacings verde. Métricas `telemetry_engine_sequence`, `telemetry_frames_rejected_total{stage,reason}`, `telemetry_slot_grace_reopen_total`, `telemetry_identity_evicted_total`, `telemetry_apply_duration_us`. Criterio: cierra D-01/D-03/D-04/D-05; `Apply` p99 < 1 ms @104; `ErrStaleBatch` desaparece del log en 60 min.

### F4 — Borrado de lo desconectado y guard de wiring (M · Bajo) — depende de F1; ∥ F3

Guard primero: `internal/telemetry/wiring_guard_test.go` (`TestExportedSymbolsHaveProductionCaller`, allow-list comentada para replay/diagnostics) — debe fallar listando lo que se va a borrar. Rescatar `FactResyncRequiredError` y la retención acotada de facts de `core/fanout.go` al puerto de Engineer. Borrar `core/fanout.go` (+test), `telemetrytransport/merge_patch.go` (+test) y `frontend/src/telemetry-transport/merge-patch.ts` (+test), seal SHA-256 (`transport.go:85,99,113,752-785`), `projection/analysis` del transporte (`NewAnalysisFull`; contrato marcado `Deprecated` si sirve a F12), `frontend/src/overlay/core/telemetry-store.ts` si cero importadores. Ampliar `legacy-retirement.test.ts` (`mergePatch`, `applyMergePatch`, `telemetry-store`). Docs (PR separado): `docs/telemetry-core/README.md:12`, `runtime-fanout.md`. Criterio: guard verde; build y suite completas verdes; marshal mejora sin seal.

### F5 — Contrato TS generado (M · Bajo) — depende de F4; ∥ F3

Crear `tools/telemetry-contract-gen/main.go` (Go → TS de tipos wire de `projection/**` y `envelope`; no canonical), `frontend/src/generated/telemetry.ts` (`DO NOT EDIT`), `telemetry.generated.test.ts`, tareas `task telemetry:contract` / `telemetry:contract:check` y gate CI. `contracts.ts` reexporta. Test antes: `TestGeneratedContractMatchesHandwritten` (28 campos idénticos; si no, la deriva ya existía = hallazgo). Después: gate "regenerar deja el árbol limpio"; `legacy-retirement.test.ts` prohíbe editar `frontend/src/generated/**` a mano.

### F6 — Vertical slice `OverlayFrame v2` en shadow (L · Medio) — depende de F3 y F5

Crear `projection/overlayv2/{frame.go,builder_player.go}` + goldens 1/20/44/104, `telemetrytransport/publisher.go` (Publisher único latest-wins, `ReplayStatus()` + `ReplaySnapshot()`, descarta y cuenta), `frontend/src/telemetry-transport/overlay-frame-v2-store.ts`, `overlay-frame-v2-parity.test.ts`. Modificar runtime (publica v1 **y** v2), widget de instrumentos tras flag `overlayFrameV2Shadow`, `overlay-shadow-comparator.ts`. Tests: `TestOverlayV2GoldenMatchesV1SemanticsForPlayer`, `TestOverlayFrameV2StaysUnder64KiBWith104Vehicles`, `TestOverlayFrameV2ParsesUnderOneMillisecondP99` (+ medición manual WebView2 y OBS anotada), `TestPublisherIsInstantiatedOnlyForActiveConsumers`, Playwright v1/v2. Métricas `overlay_v2_payload_bytes`, `overlay_v2_build_duration_us`, `overlay_shadow_mismatches_total{field}`, `publisher_dropped_frames_total`. Criterio: mismatches = 0 en ≥5 sesiones ≥20 min (una con >40 coches); @104 < 64 KiB; parse p99 < 1 ms en WebView2 y OBS.

### F7 — Aislamiento de consumidores (M–L · Medio) — depende de F1 y F3; ∥ F6

Crear `internal/app/engineer_port.go` (latest-state cap 1 drop-oldest + facts ordenados con cursor + `FactResyncRequiredError` + timeout + recover), `projection/engineer/fact_cursor.go`. Modificar `runtime:673` (fuera de línea), `strategy_live_runtime.go` + `projection/strategy/v1.go` (builder conservado; sin transporte público hasta Planner), `recording/coordinator.go` (gap markers, `Incomplete` explícito; sigue sin conectar), `runtime:701-705` (fallo de fact = boundary). Tests: `TestEngineerLatestWinsDropsIntermediateStates`, `TestEngineerFactsAreOrderedAndNeverDropped`, `TestEngineerTimeoutIsBoundedAndCounted`, `TestFactProjectionFailureIsBoundaryNotSkip`, `TestRecordingWritesGapMarkerOnBackpressure`, `TestStrategyFailureDoesNotAffectOverlay`. Métricas `engineer_consume_latency_ms`, `engineer_states_dropped_total`, `engineer_fact_resync_total`, `engineer_timeouts_total`, `recording_gap_markers_total`, `consumer_recover_total`. Flag `engineerAsyncPort`.

### F8 — Migración por feature (L · Medio) — depende de F6

Ciclo idéntico por builder: `builder_standings.go`→`StandingsVM` (standings, multiclass-relative, broadcast-tower; orden sube a Go), `builder_relative.go`→`RelativeVM` (relative, head-to-head; selección de filas y gaps con `Authority`), `builder_delta.go`→`DeltaVM` (delta, delta-advanced, delta-trace; referencia resuelta y declarada), `builder_fuel.go`→`FuelVM` (fuel-strategy; `fuelHistory` a Go), `builder_session.go`→`SessionVM` (racing-flags, race-schedule, track-weather), `builder_controls.go`→`ControlsVM` (input-telemetry, pedals*; `ControlsHistory` autoritativa), `builder_spotter.go`→`SpotterVM(mode)`, `builder_damage.go`→`DamageVM`. Flag por feature `overlayV2Features: [...]`. Tests por builder: golden Go↔TS, `<feature>-parity.test.ts` (mocks Studio **y** fixture real), `<feature>-domain-free.test.ts` (cero dominio en `widget-types/**`), Playwright v1/v2. Criterio por builder: `overlay_shadow_mismatches_total{feature}` = 0 en N sesiones; payload agregado < 64 KiB @104.

### F9 — Retirada del legacy del frontend (M · Alto) — depende de F8 completo + OBS + gate de estabilidad

2 PRs: (1) dejar de publicar v1; (2) borrar `overlay-projection-adapter.ts`, `telemetry-snapshot.ts`, `scoring-readers.ts`, `input-telemetry-accumulator.ts`, histories de dominio de `derived-telemetry-store.ts`, `overlay-shadow-comparator.ts`/`sanitizer`, `telemetry-rate-coordinator.ts:108-117`, `overlay-projection-v1.ts` si sin consumidor; en Go `projection/overlay/v1.go` solo si ya no se publica (si no, `Deprecated` un ciclo). Ampliar `legacy-retirement.test.ts`. Tests: cero importadores de `TelemetrySnapshot`; `TestOverlayV1NoLongerPublished`; suite + Playwright de todos los widgets; parse v2 < 0,25 ms. Rollback: rama legacy etiquetada + release anterior publicable un ciclo.

### F10 — Capabilities y multi-sim (L · Medio) — depende de F8

Crear `internal/telemetry/fusion/` (promoción de `lmu.Fusion`: N slots, lista ordenada, índice por `SignalID` sin `panic`), `internal/telemetry/capability/` (`Supported/Available/Modes`; `spatial.longitudinal` vs `lateral`), `driver/registry.go` (`DriverManager` multi-candidato), `drivers/simx/` (driver sintético, test o flag diagnóstico). Modificar composition root (`ObservationMapper` genérico; `SourceStatus` del descriptor; manifiesto Engineer derivado del driver), `projection/engineer/*` + `messagepolicy/*` (alimentar `ReasonCapabilityUnavailable`), `architecture_test.go`. Tests: `TestEngineerManifestIsDerivedFromActiveDriver`, `TestSimXStartsWithoutTouchingWidgets` (ningún archivo en `widget-types/**` cambia), `TestSpotterFamilyDisabledWhenLateralUnsupported`, `TestDeltaFallbackIsResolvedInGoAndDeclared`, `TestAuthorityMatrixIsExhaustiveBySignalID`, `TestFusionSupportsNSourceSlots`. Además: taxonomía de clases como dato del frame (`ClassID`), design system indexado por id de clase (retira `HYPERCAR/LMP2` cableados).

### F11 — Cadencias y regulación antes de proyectar (M · Bajo) — depende de F6

`projection/overlayv2/cadence.go` (regulación por sección con dirty-trigger y tope; defaults = comportamiento anterior hasta medir), `publisher.go`, `telemetry-rate-coordinator.ts` (solo visual). Tests: `BenchmarkOverlayV2ByCadence`, `TestDirtyTriggerHasCeiling`, `TestCadenceDoesNotDelayFacts`, `TestRegulationHappensBeforeMarshal`. Criterio: bytes/s medidos en binario real (Wails + OBS).

### F12 — Puertos futuros (L · Medio, 3 issues independientes) — depende de F7 y F9

F12.a Recording conectado con gap markers e `Incomplete` (consumidor: UI de grabaciones). F12.b Analysis post-sesión: `internal/telemetryanalysis` + DuckDB desde SQLite y ficheros nativos LMU; `CaptureManager/captureTap` conectados para fixtures de un segundo sim (consumidor: módulo Telemetría). F12.c Strategy reexposición de transporte (consumidor: Planner). Regla `TestDuckDBIsNeverTouchedByLivePath`. Cada puerto se conecta **con** su consumidor.

### F13 — Guardarraíles definitivos y documentación (S–M · Bajo) — depende de F9 y F10

Ampliar `architecture_test.go` (engine, identity, capability, fusion, overlayv2), consolidar `legacy-retirement.test.ts`, reescribir `docs/telemetry-core/README.md`, retirar `runtime-fanout.md`, versionar `runtime-projections.md` v2, cerrar ADR 0008 (consecuencias reales), actualizar `docs/current-plan.md` y el handoff. Tests: `TestArchitectureRulesCoverEveryTelemetryPackage`, `TestDocsDoNotReferenceRetiredSymbols`.

## Trazabilidad fase → defecto

| Defecto | Fase | Prueba de cierre |
|---|---|---|
| D-01 cursores divergentes | F3 | `TestApplyIsAllOrNothing`, `TestApplyRetryDoesNotDivergeCursors` |
| D-02 `failStop` irreversible | F1 | `TestPublishFailureIsNotTerminal`, `TestRuntimeRestartsAfterTransientFailure` |
| D-03 slot gap → identidad nueva | F3 | `TestSlotMissingOneFrameKeepsVehicleIdentity` |
| D-04 tope 104 identidades | F3 | `TestVehicleHistoryDoesNotOverflowInLongSession` |
| D-05 `FactDriverChanged` inalcanzable | F3 | `TestDriverChangeEmitsFactAndOpensNewStint` |
| D-06 frescura congelada | F2 | `TestFrozenPipelineStopsReportingFresh`, `store.watchdog.test.ts` |
| D-07 statusRevision contiguo | F2 | `store.test.ts` (revisión no contigua) |
| D-08 256 KiB @104 | F1 (no terminal) + F6 (compacto) | `TestRuntimePublishes104VehiclesEndToEnd`, `TestOverlayFrameV2StaysUnder64KiBWith104Vehicles` |
| Engineer síncrono | F7 | `TestSlowEngineerDoesNotBlockDriverLoop` |
| sin `recover()` | F1 | `TestConsumerPanicDoesNotKillProcess` |
| código desconectado | F4 | `TestExportedSymbolsHaveProductionCaller` |
| histories duplicadas / adapter legacy | F8/F9 | `<feature>-domain-free.test.ts`, `legacy-retirement.test.ts` |
| manifiesto Engineer hardcodeado / root atado a LMU | F10 | `TestEngineerManifestIsDerivedFromActiveDriver`, `TestSimXStartsWithoutTouchingWidgets` |

## Carriles paralelos (un agente por worktree)

| Carril | Fases | Worktree | Propiedad |
|---|---|---|---|
| A — Núcleo Go | F1 → F3 → F7 | `C:/tmp/vantare-tc-core` | `internal/telemetry/{engine,core,identity,derive,drivers}/**`, **`internal/app/telemetry_core_runtime.go` (propietario único)** |
| B — Limpieza y contrato | F4 → F5 | `C:/tmp/vantare-tc-contract` | `core/fanout.go`, `telemetrytransport/merge_patch.go`, `tools/telemetry-contract-gen/**`, `frontend/src/generated/**` |
| C — Frontend y transporte | F2 (TS) → F6 (TS) → F8 → F9 | `C:/tmp/vantare-tc-frontend` | `frontend/src/telemetry-transport/**`, `frontend/src/overlay/**` |
| D — Multi-sim | F10 | `C:/tmp/vantare-tc-multisim` | `internal/telemetry/{fusion,capability,driver,drivers/simx}/**` |

Pares prohibidos: F1∥F3, F3∥F7 (`telemetry_core_runtime.go`); F6∥F11 (`overlayv2/**`, `publisher.go`); F2∥F6 parte TS (`store.ts`); dos builders de F8 sobre `widget-types/shared/**`. Otro carril que necesite `telemetry_core_runtime.go` abre un PR pequeño contra el carril A.

## Issue map (orden de apertura)

| # | Issue | Fase | Tamaño | Depende de |
|---|---|---|---|---|
| 1 | Aislar el cambio local de `internal/updater` en su propia rama | P0.1 | S | — |
| 2 | LMU: `mDeltaBest` nativo como señal observada (Go + goldens + docs telemetry-core) | P0.2 | M | — |
| 3 | Widget Delta: referencia seleccionable por instancia (frontend + i18n + inspector) | P0.3 | M | 2 |
| 4 | ADR 0008 — frontera única de commit, aislamiento de consumidores y `OverlayFrame v2` | P0.6 | S | ISA-372 aprobado |
| 5 | Telemetry Core: red de seguridad — tests rojos de D-01…D-08 y baseline versionada | F0 | M | 2, 3 |
| 6 | Telemetry Core: el fallo de publicación o de consumidor deja de ser terminal | F1 | M | 4, 5 |
| 7 | Telemetry Core: watchdog de frescura en backend y store | F2 | S–M | 6 |
| 8 | Telemetry Core: `TelemetryEngine.Apply` — transacción única e identidad con gracia | F3 | L | 5 |
| 9 | Telemetry Core: guard de wiring y retirada de Fanout, RFC 7396 y seal | F4 | M | 6 |
| 10 | Telemetry Core: contrato TS generado desde tipos wire Go | F5 | M | 9 |
| 11 | Overlay v2: vertical slice ControlsVM en shadow, medido en WebView2 y OBS | F6 | L | 8, 10 |
| 12 | Telemetry Core: Engineer asíncrono, Strategy sin transporte público, Recording con gap markers | F7 | M–L | 6, 8 |
| 13–20 | Overlay v2: builder <feature> con paridad (standings, relative, delta, fuel, session, controls, spotter, damage) | F8 | L | 11 |
| 21 | Overlay v2: retirada del legacy TS (2 PRs) | F9 | M | 13–20 + gate de estabilidad |
| 22 | Telemetry Core: capabilities extremo a extremo, fusion compartida y driver SimX | F10 | L | 13–20 |
| 23 | Overlay v2: cadencias y regulación antes de proyectar | F11 | M | 11 |
| 24–26 | Recording conectado / Analysis post-sesión DuckDB / Strategy transporte | F12 a/b/c | L | 12, 21 |
| 27 | Telemetry Core: guardarraíles definitivos y documentación | F13 | S–M | 21, 22 |

## Puertas de reevaluación (piezas pospuestas de la Opción D)

Activar solo si se cumple una condición falsable: registry generado del canonical (un campo del canonical sigue exigiendo > 10 sitios coordinados tras F9, o se confirma un tercer sim a 12 meses); tiers de cadencia (prototipo mide mejora material frente a v2 compacto regulado); RFC 7396 (formato apto para listas + resync demuestra ahorro material con datos vivos); Strategy Hub público (Planner consumidor); Analysis live (consumidor y necesidad demostrada); protocolo binario (JSON compacto medido insuficiente en WebView2/OBS).

## Riesgos del plan y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Migración del frontend toca todos los widgets | flag por feature, shadow y paridad por widget, Playwright v1/v2, rollback por feature |
| Agentes editando código generado | `DO NOT EDIT` + gate CI que regenera y compara + `legacy-retirement.test.ts` por ruta |
| Doble camino se eterniza | deadline por gate de estabilidad; métricas de mismatches; issue de retirada explícita |
| F3 es grande y de riesgo alto | fachada primero; 5–8 PRs; flag `telemetryEngineApply`; paridad de replay + shadow Go muestreado |
| Dos agentes sobre el mismo archivo | carriles con propietario; `telemetry_core_runtime.go` solo carril A |
| Shadow cuesta CPU | muestreo, presupuestos, auto-disable |
| Números no medidos en WebView2/OBS | medición manual obligatoria en F6 antes de F8; ningún porcentaje prometido antes |
| Diff local sin promocionar | P0 bloqueante |

## Rollback

F0–F7 y F10–F12: `git revert` de fase o flag. F8: por builder (flag + revert de 1–2 PRs). F9: 2 PRs (dejar de publicar v1 → borrar); rama legacy etiquetada; release anterior publicable un ciclo.
