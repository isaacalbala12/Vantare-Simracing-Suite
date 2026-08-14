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

- [ ] Write failing tests for: nil active plan; exact revision missing; same revision ID with a different plan/variant/hash; unknown editor version; corrupt/trailing/duplicate/unknown JSON; missing or invalid stint fields; duplicate IDs; unsafe/non-positive laps; exact valid v1 mapping; `FuelTargets == nil`; input ownership; and two independent repository opens producing equal plans.
- [ ] Run `go test -count=1 ./internal/strategy/live -run 'ActiveRevision|EditorV1|Restart'` and record the RED caused by the absent resolver and sentinels.
- [ ] Add typed sentinel errors and a small `ResolveActivePlan(active *contract.ActivePlan, revisions []contract.PlanRevision[json.RawMessage]) (Plan, error)` boundary.
- [ ] Resolve by revision identity before reading the payload. Reject an ID collision with a different complete ref as an integrity mismatch.
- [ ] Decode `strategy.editor.v1` with the standard library, strict EOF/unknown-field checks and the existing contract canonical parser where needed to preserve duplicate-key and resource-limit guarantees.
- [ ] Map only `stints[].id` and `stints[].lapCount`, then call `NewPlan` with the exact active plan and `FuelTargets: nil`.
- [ ] Run the focal test, then `go test -count=20 ./internal/strategy/live` and keep production imports within Strategy contract plus the public telemetry projection already allowed.
- [ ] Commit only the Task 1 paths with the repository commit style and required co-author footer.

## Task 2 — Own the live consumer in the canonical Telemetry Core lifecycle

**Files:**

- Modify: `internal/app/telemetry_core_runtime.go`
- Modify: `internal/app/telemetry_core_strategy_test.go`
- Modify if a focused adapter regression is clearer: `internal/app/strategy_live_runtime_test.go`

- [ ] Write failing tests proving an optional real engine receives status/full from `StrategyHub`, only one Strategy subscription exists, nil keeps zero consumer subscriptions, cancellation/Stop removes the subscription, Start failure cleans it up, and an unexpected consumer failure is visible through the existing runtime fail-stop result.
- [ ] Run `go test -count=1 ./internal/app -run 'StrategyLiveConsumer|StrategyExecution|TelemetryCore.*Strategy'` and record the RED for the missing config/lifecycle wiring.
- [ ] Add one optional `StrategyLiveConsumer` to `TelemetryCoreRuntimeConfig`; construct one `StrategyLiveRuntime` against `runtime.strategyHub` when present.
- [ ] Launch its blocking `Run` method under the existing runtime context and wait group. Do not create a hub, reader, transport, endpoint, persistence layer or detached lifecycle.
- [ ] Treat context cancellation as normal teardown. Route an unexpected adapter/consumer error through the runtime’s existing contextual fail-stop path so it is observable and both hubs close coherently.
- [ ] Run the focal tests x20 and the full `internal/app` package.
- [ ] Commit only the Task 2 paths with the required footer.

## Task 3 — Composition-root bootstrap and restart proof

**Files:**

- Modify: `cmd/vantare/main.go`
- Modify: `cmd/vantare/main_test.go`
- Modify if needed for one end-to-end lifecycle test: `cmd/vantare/telemetry_lifecycle_harness_test.go`

- [ ] Write failing tests around a small bootstrap helper using a real temporary Strategy repository: valid active revision returns one engine; reopening produces the same plan; no active plan, absent revision, mismatched hash, corrupt/incompatible editor payload and repository read error return explicit errors and no engine.
- [ ] Run `go test -count=1 ./cmd/vantare -run 'StrategyLive|ActiveRevision'` and record the RED.
- [ ] Retain the already-opened `Repository[json.RawMessage]` in the composition root instead of reopening storage.
- [ ] Snapshot it once, call `live.ResolveActivePlan`, construct `live.NewEngine`, and pass the engine to `TelemetryCoreRuntimeConfig`. Log a bounded contextual reason when Strategy live is unavailable; never log payload bytes.
- [ ] Preserve the current Strategy application bridge and startup behavior. No active revision is a fail-closed Strategy state, not a process-wide startup failure.
- [ ] Prove the production root passes the same engine to the same core runtime and does not call `NewPlan`, `NewEngine` or `NewStrategyLiveRuntime` through a second path.
- [ ] Run focused tests x20 and `go test -count=1 ./cmd/vantare` after producing `frontend/dist` from the locked frontend workspace if the embed requires it.
- [ ] Commit only the Task 3 paths with the required footer.

## Task 4 — Evidence, review and closure in the issue branch

**Files:**

- Modify: `docs/current-plan.md`
- Modify: `docs/vantare-program/handoffs/strategy-planner.md`
- Modify: `docs/strategy-planner/projection-ownership.md`
- Create: `docs/strategy-planner/evidence/isa-340-active-revision-live-wiring.md`
- Modify: this plan

- [ ] Document exact startup behavior, the absence of Fuel targets, restart evidence, failure modes and the fact that runtime activation changes remain out of scope.
- [ ] Run an independent specification review, correct all findings, then run an independent code-quality/security review and correct all findings.
- [ ] Run fresh final gates:

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

- [ ] Record `go test -race` as not executed if this host still has `CGO_ENABLED=0` and no GCC. Do not imply race coverage.
- [ ] Update Linear through direct `mcp__linear__*` with branch, commits, exact checks, omissions and remaining manual proof.
- [ ] Commit/push and open or update a draft PR only after reviews and fresh gates. Do not merge or promote to Nightly, Testers or Master without Isaac’s separate authorization.

## Manual verification after automated closure

1. Create/save a `strategy.editor.v1` revision and activate it through the existing Strategy UI.
2. Restart Vantare with LMU in a session and confirm the logs report one resolved active revision without payload contents.
3. Enter the track and verify the existing sanitized live probe/read model observes the real Strategy cursor and stint boundary.
4. Confirm Fuel remains observed from Telemetry Core but deviation remains missing because the persisted editor v1 document has no explicit per-lap target series.
5. Deactivate the plan, restart, and confirm Strategy live stays disabled while Overlay/Engineer telemetry continues.

## Closure boundary

ISA-340 is technically ready only when all automated gates and both independent reviews are green and the branch evidence is current. That does not integrate or promote it. Testers are intentionally deferred until the isolated branch is completely verified and Isaac authorizes the next channel step.
