# ISA-340 / STR-17A — Active revision live wiring implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the exact persisted active revision into a deterministic `live.Plan` and run one Strategy live consumer on the canonical Telemetry Core lifecycle without inventing Fuel targets.

**Architecture:** `internal/strategy/live` owns a strict, versioned normalization boundary from the immutable `PlanRevision[json.RawMessage]` to the existing pure `Plan`. The composition root loads one repository snapshot at startup and passes the resulting engine as an optional consumer to `TelemetryCoreRuntime`; that runtime owns the adapter goroutine with the same context, wait group, fail-stop and `StrategyHub` it already owns. Invalid or absent persisted state disables only Strategy execution and is reported explicitly.

**Tech Stack:** Go standard library, existing Strategy contract/repository/live packages, existing Telemetry Core Strategy hub and tests. No frontend or dependency changes.

---

## Locked decisions

- The active reference is authoritative only when exactly one stored revision has the same plan, variant, revision ID and content hash. A matching revision ID with a different reference is an integrity mismatch, not “not found”.
- `contract.PlanRevision` remains the hash authority. The resolver uses only decoded revisions returned by the repository; it does not hash raw storage bytes with a second algorithm.
- `strategy.editor.v1` is the only accepted editor version. The decoder rejects malformed JSON, duplicate/unknown consumed fields, missing required fields, unsafe integers, invalid stint IDs, duplicate stint IDs and non-positive lap counts before constructing a `live.Plan`.
- The v1 branches not consumed by live execution remain validation-only and are never mapped into live behavior. `fuelLitres` is not a per-lap target series, so `FuelTargets` is exactly `nil`.
- Resolution happens once at application startup. Activating a different revision while the app is running does not silently replace the running plan; automatic application remains out of scope.
- No active plan, missing revision, reference/hash mismatch, unknown editor version or incompatible payload prevents construction of the Strategy consumer. Telemetry Core, Overlay and Engineer continue without a synthetic Strategy plan.
- The optional consumer is attached to the existing `TelemetryCoreRuntime`. `Start` launches exactly one `StrategyLiveRuntime.Run` worker on the existing Strategy hub and existing context; `Stop` cancels and waits through the existing lifecycle before closing product hubs.

## Task 1 — Resolve and normalize the exact active revision

**Files:**

- Modify: `internal/strategy/live/errors.go`
- Create: `internal/strategy/live/active_revision.go`
- Create: `internal/strategy/live/active_revision_test.go`
- Modify: `internal/strategy/live/architecture_test.go`

- [x] Write failing tests for: nil active plan; exact revision missing; same revision ID with a different plan/variant/hash; unknown editor version; corrupt/trailing/duplicate/unknown JSON; missing or invalid stint fields; duplicate IDs; unsafe/non-positive laps; exact valid v1 mapping; `FuelTargets == nil`; input ownership; and two independent repository opens producing equal plans.
- [x] Run `go test -count=1 ./internal/strategy/live -run 'ActiveRevision|EditorV1|Restart'` and record the RED caused by the absent resolver and sentinels.
- [x] Add typed sentinel errors and a small `ResolveActivePlan(active *contract.ActivePlan, revisions []contract.PlanRevision[json.RawMessage]) (Plan, error)` boundary.
- [x] Resolve by revision identity before reading the payload. Reject an ID collision with a different complete ref as an integrity mismatch.
- [x] Decode `strategy.editor.v1` with the standard library, strict EOF/unknown-field checks and the existing contract canonical parser where needed to preserve duplicate-key and resource-limit guarantees.
- [x] Map only `stints[].id` and `stints[].lapCount`, then call `NewPlan` with the exact active plan and `FuelTargets: nil`.
- [x] Run the focal test, then `go test -count=20 ./internal/strategy/live` and keep production imports within Strategy contract plus the public telemetry projection already allowed.
- [x] Commit only the Task 1 paths with the repository commit style and required co-author footer.

## Task 2 — Own the live consumer in the canonical Telemetry Core lifecycle

**Files:**

- Modify: `internal/app/telemetry_core_runtime.go`
- Modify: `internal/app/telemetry_core_strategy_test.go`
- Modify if a focused adapter regression is clearer: `internal/app/strategy_live_runtime_test.go`

- [x] Write failing tests proving an optional real engine receives status/full from `StrategyHub`, only one Strategy subscription exists, nil keeps zero consumer subscriptions, cancellation/Stop removes the subscription, Start failure cleans it up, and an unexpected consumer failure is visible through the existing runtime fail-stop result.
- [x] Run `go test -count=1 ./internal/app -run 'StrategyLiveConsumer|StrategyExecution|TelemetryCore.*Strategy'` and record the RED for the missing config/lifecycle wiring.
- [x] Add one optional `StrategyLiveConsumer` to `TelemetryCoreRuntimeConfig`; construct one `StrategyLiveRuntime` against `runtime.strategyHub` when present.
- [x] Launch its blocking `Run` method under the existing runtime context and wait group. Do not create a hub, reader, transport, endpoint, persistence layer or detached lifecycle.
- [x] Treat context cancellation as normal teardown. Route an unexpected adapter/consumer error through the runtime’s existing contextual fail-stop path so it is observable and both hubs close coherently.
- [x] Run the focal tests x20 and the full `internal/app` package.
- [x] Commit only the Task 2 paths with the required footer.

## Task 3 — Composition-root bootstrap and restart proof

**Files:**

- Modify: `cmd/vantare/main.go`
- Modify: `cmd/vantare/main_test.go`
- Modify if needed for one end-to-end lifecycle test: `cmd/vantare/telemetry_lifecycle_harness_test.go`

- [x] Write failing tests around a small bootstrap helper using a real temporary Strategy repository: valid active revision returns one engine; reopening produces the same plan; no active plan, absent revision, mismatched hash, corrupt/incompatible editor payload and repository read error return explicit errors and no engine.
- [x] Run `go test -count=1 ./cmd/vantare -run 'StrategyLive|ActiveRevision'` and record the RED.
- [x] Retain the already-opened `Repository[json.RawMessage]` in the composition root instead of reopening storage.
- [x] Snapshot it once, call `live.ResolveActivePlan`, construct `live.NewEngine`, and pass the engine to `TelemetryCoreRuntimeConfig`. Log a bounded contextual reason when Strategy live is unavailable; never log payload bytes.
- [x] Preserve the current Strategy application bridge and startup behavior. No active revision is a fail-closed Strategy state, not a process-wide startup failure.
- [x] Prove the production root passes the same engine to the same core runtime and does not call `NewPlan`, `NewEngine` or `NewStrategyLiveRuntime` through a second path.
- [x] Run focused tests x20 and `go test -count=1 ./cmd/vantare` after producing `frontend/dist` from the locked frontend workspace if the embed requires it.
- [x] Commit only the Task 3 paths with the required footer.

## Task 4 — Evidence, review and closure in the issue branch

**Files:**

- Modify: `docs/current-plan.md`
- Modify: `docs/vantare-program/handoffs/strategy-planner.md`
- Modify: `docs/strategy-planner/projection-ownership.md`
- Create: `docs/strategy-planner/evidence/isa-340-active-revision-live-wiring.md`
- Modify: this plan

- [x] Document exact startup behavior, the absence of Fuel targets, restart evidence, failure modes and the fact that runtime activation changes remain out of scope.
- [x] Run independent reviews for Tasks 1, 2 and 3, correct the P1/P2 findings, and obtain `APPROVED` for all three cuts.
- [x] Run fresh final gates:

```powershell
go test -count=20 ./internal/strategy/live
go test -count=20 ./internal/app -run 'StrategyLive|StrategyExecution|TelemetryCore.*Strategy'
go test -count=20 ./cmd/vantare -run 'StrategyLive|ActiveRevision'
go test -count=1 ./internal/strategy/... ./internal/app ./internal/app/telemetrytransport ./cmd/vantare
go test -count=1 ./...
go vet ./internal/strategy/live ./internal/app ./cmd/vantare
gofmt -l internal/strategy/live internal/app cmd/vantare
git diff --check
```

- [x] Record `go test -race` as not executed: this host has `CGO_ENABLED=0` and no GCC. No race coverage is claimed.
- [x] Update Linear through direct `mcp__linear__*` with branch, commits, exact checks, omissions and remaining manual proof.
- [x] Push the issue branch (`origin/vantareapp/isa-340-str-17a-resolver-la-revision-activa-y-cablear-el-motor-live`).
- [x] Open a draft PR against `nightly` (`#280`).
- [x] Obtain CI for the pushed HEAD and review its result (`32045640679` — PASS; advisory global lint debt remains non-blocking).
- [ ] Merge or promote to Nightly, Testers or Master only with Isaac’s separate authorization.

## Estado posterior a la reconciliación (2026-08-17)

La rama se rebasó limpiamente sobre `origin/nightly@7a92241d4a1c7375106e601ce2daee36e6328758` y ya está publicada en `origin`.
El HEAD productivo verificado es `7452c8ef817535d8c3c29562ce7ece24a2092490`,
con cuatro commits de implementación y tres commits documentales posteriores;
el backup del SHA anterior queda en
`backup/isa-340-pre-reconcile-20260817`
(`abaf5f7931ef4cfe8ef19297e99aa9b6bbe2c556`). Los gates
focales x20, `go test ./...`, `go vet`, el build frontend, `wails3 build
DEV=true` y `git diff --check` pasan. El chequeo amplio de `gofmt` conserva
únicamente la deuda heredada de `internal/app/diagnostics_service.go`; los
archivos Go propios de ISA-340 están formateados.

Isaac confirmó el smoke manual aislado de persistencia Wails realizado sobre
la acumulación que contiene ISA-340: crear/guardar/activar, reiniciar y
recuperar el plan activo, desactivar y reiniciar. También confirmó el reinicio
con LMU, la resolución única sin payload y la continuidad de Overlay/Engineer
tras desactivar Strategy. La validación es manual y no se adjuntó un artefacto
de log; no hay push, PR, CI remoto, merge, promoción ni release. Linear
permanece `In Progress` mientras la revisión del PR esté pendiente. El PR
draft es `#280` hacia `nightly`; CI `32045640679` pasa sus gates bloqueantes.
No hay merge, promoción ni release.
Evidencia detallada:
`docs/strategy-planner/evidence/isa-340-active-revision-live-wiring.md`.

## Manual verification after automated closure

El primer intento quedó bloqueado por ISA-361 / TC-03C.1: con dos procesos LMU
homónimos, el detector de build abandonaba ante el primer candidato cuya ruta
no podía consultar y Telemetry Core permanecía `degraded`. La integración local
`integration/isa-340-361-local-smoke@6de086d1` combinó por cherry-pick el fix
productivo ISA-361 y los tres commits productivos ISA-340 sobre
`nightly@d45d8d8d`; build frontend, gates Go focales y suite Go global pasaron.
El primer smoke se ejecutó sin jugador y falló con cursor `0/0`. Tras la
confirmación explícita de Isaac en pista se ejecutó exactamente una vez y pasó
con source live, cursor `epoch=1/sequence=3`, vuelta completada `0` y Fuel
`98/115 L` present/fresh; la desviación siguió missing sin objetivo exacto.
La confirmación manual posterior de Isaac completa estos dos puntos; `-race`
sigue omitido por las limitaciones del host.

- [x] Create/save a `strategy.editor.v1` revision and activate it through the existing Strategy UI (smoke Wails confirmado por Isaac en la acumulación de ISA-362 que contiene ISA-340).
- [x] Restart Vantare with LMU in a session and confirm the logs report one resolved active revision without payload contents (confirmado manualmente por Isaac; no se adjuntó log).
- [x] Enter the track and verify the existing sanitized live probe/read model observes the real Strategy cursor and stint boundary.
- [x] Confirm Fuel remains observed from Telemetry Core but deviation remains missing because the persisted editor v1 document has no explicit per-lap target series.
- [x] Deactivate the plan, restart, and confirm Strategy live stays disabled while Overlay/Engineer telemetry continues (confirmado manualmente por Isaac).

## Closure boundary

ISA-340 is technically ready only when all automated gates and both independent reviews are green and the branch evidence is current. That does not integrate or promote it. Testers are intentionally deferred until the isolated branch is completely verified and Isaac authorizes the next channel step.
