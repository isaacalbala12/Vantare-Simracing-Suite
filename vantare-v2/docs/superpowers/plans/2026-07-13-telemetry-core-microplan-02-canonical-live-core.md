# Telemetry Core Microplan 02 Canonical Live Core Implementation Plan

> **Estado: BORRADOR NO EJECUTABLE.** El contenido siguiente procede de ISA-21 y todavía no está reconciliado a nivel de contrato con el código actual. ISA-26 permanece en Backlog. No crear rama, no escribir tests y no implementar hasta revisar con Isaac identidad, tiempo, calidad, capabilities, ownership de campos y compatibilidad. ISA-100 no valida ni modifica esas decisiones.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introducir contratos y servicio canónicos sobre las dos fuentes LMU sin cambiar todavía consumidores de producción.

**Architecture:** Shared memory y REST producen observaciones parciales con procedencia/frescura. `fusion.Engine` crea un snapshot inmutable; `live.Service` asigna epoch/secuencia, aplica lifecycle y publica a suscriptores acotados. Overlay/Engineer legacy continúan funcionando durante este microplan.

**Tech Stack:** Go estándar, tests table-driven, context.Context, race detector focalizado.

---

## Issue TC-02A — Identidad, tiempo, calidad y capabilities

**Files:**
- Create: `internal/telemetry/model/identity.go`
- Create: `internal/telemetry/model/value.go`
- Create: `internal/telemetry/model/observation.go`
- Create: `internal/telemetry/model/model_test.go`
- Create: `docs/adr/0004-telemetry-core-live-contract.md`

- [ ] **Step 1: escribir tests rojos**

Tests table-driven obligatorios:

```go
func TestSessionIdentityStableWhenVehicleCountChanges(t *testing.T) {}
func TestObservedZeroIsAvailable(t *testing.T) {}
func TestUnavailableDiffersFromObservedZero(t *testing.T) {}
func TestObservationCloneDoesNotShareSlices(t *testing.T) {}
func TestFutureSchemaVersionRejected(t *testing.T) {}
```

Run:

```powershell
go test ./internal/telemetry/model -count=1
```

Expected: FAIL porque el paquete no existe.

- [ ] **Step 2: implementar contrato mínimo completo**

```go
package model

type Source string
const (
    SourceSharedMemory Source = "lmu-shared-memory"
    SourceREST Source = "lmu-rest-local"
    SourceReplay Source = "replay"
)

type Quality string
const (
    QualityObserved Quality = "observed"
    QualityDerived Quality = "derived"
    QualityMissing Quality = "missing"
    QualityStale Quality = "stale"
)

type Value[T any] struct {
    Value T `json:"value"`
    Available bool `json:"available"`
    Quality Quality `json:"quality"`
    Source Source `json:"source"`
    CapturedAtUnixMS int64 `json:"capturedAtUnixMs"`
}

type SessionIdentity struct {
    Simulator string `json:"simulator"`
    TrackKey string `json:"trackKey"`
    SessionType string `json:"sessionType"`
    SessionName string `json:"sessionName"`
    StartMarker string `json:"startMarker"`
}

type Envelope struct {
    SchemaVersion int `json:"schemaVersion"`
    Sequence uint64 `json:"sequence"`
    Epoch uint64 `json:"epoch"`
    CapturedAtUnixMS int64 `json:"capturedAtUnixMs"`
    State string `json:"state"`
    Session SessionIdentity `json:"session"`
}
```

`Observation` se divide en `Session`, `Player`, `Scoring`, `Spatial`, `Resources`, `Damage`, `Wheels` y `Pit`. La matriz TC-01 debe demostrar que cada campo consumido por los monitores aparece una sola vez. No copiar JSON tags legacy por intuición.

- [ ] **Step 3: tests verdes y commit**

```powershell
gofmt -w internal/telemetry/model
go test ./internal/telemetry/model -count=1
git diff --check
git add internal/telemetry/model docs/adr/0004-telemetry-core-live-contract.md
git commit -m "feat(telemetry): define canonical live contracts"
```

## Issue TC-02B — Adapters y fusión shared memory + REST

**Files:**
- Create: `internal/telemetry/lmu/shared_observation.go`
- Create: `internal/telemetry/lmu/shared_observation_test.go`
- Create: `internal/telemetry/lmuapi/rest_observation.go`
- Create: `internal/telemetry/lmuapi/rest_observation_test.go`
- Modify: `internal/telemetry/fusion/fusion.go`
- Modify: `internal/telemetry/fusion/fusion_test.go`

- [ ] **Step 1: tests rojos de autoridad y frescura**

Cubrir:

- inputs/dinámica/espacial desde shared memory;
- scoring/session/pit desde REST cuando fresco;
- fallback a shared memory si REST está stale;
- cero observado no se pierde;
- cada salida conserva source/capturedAt;
- ninguna heurística convierte missing en observed.

```powershell
go test ./internal/telemetry/lmu ./internal/telemetry/lmuapi ./internal/telemetry/fusion -count=1
```

- [ ] **Step 2: implementar adapters sin abrir nuevos readers**

`SharedObservation(buf []byte, capturedAt int64)` y `RESTObservation(rows, session, capturedAt)` son funciones puras. `fusion.Engine.Merge(shared, rest, now)` aplica una tabla explícita de ownership documentada en `docs/telemetry-core/source-field-matrix.md`.

- [ ] **Step 3: verificar y commit**

```powershell
gofmt -w internal/telemetry/lmu internal/telemetry/lmuapi internal/telemetry/fusion
go test ./internal/telemetry/lmu ./internal/telemetry/lmuapi ./internal/telemetry/fusion -count=1
git add internal/telemetry/lmu internal/telemetry/lmuapi internal/telemetry/fusion docs/telemetry-core/source-field-matrix.md
git commit -m "feat(telemetry): fuse LMU primary live sources"
```

## Issue TC-02C — Servicio live único

**Files:**
- Create: `internal/telemetry/live/service.go`
- Create: `internal/telemetry/live/service_test.go`
- Create: `internal/telemetry/live/lifecycle_test.go`
- Create: `internal/telemetry/live/benchmark_test.go`

- [ ] **Step 1: tests rojos**

```go
func TestServiceDropsOldSequence(t *testing.T) {}
func TestServiceEpochIgnoresVehicleCount(t *testing.T) {}
func TestServiceEpochChangesOnRealSessionChange(t *testing.T) {}
func TestSlowSubscriberCannotBlockPublisher(t *testing.T) {}
func TestDisconnectPublishesImmediately(t *testing.T) {}
func TestStopClosesEverySubscriber(t *testing.T) {}
```

- [ ] **Step 2: implementar lifecycle cancelable**

Una goroutine posee ticks/read/fusion. Suscriptores tienen buffer 1 y política latest-wins. No crear goroutines por frame. `Run(ctx)` devuelve `ctx.Err()` al cerrar; `Subscribe` entrega último snapshot clonado.

- [ ] **Step 3: race/performance y commit**

```powershell
gofmt -w internal/telemetry/live
go test ./internal/telemetry/live -count=1
go test -race ./internal/telemetry/live -count=1
go test ./internal/telemetry/live -run '^$' -bench . -benchmem
git add internal/telemetry/live
git commit -m "feat(telemetry): add canonical live service"
```

## Gate del microplan

El core existe en shadow y no cambia Wails/SSE/Overlay/Engineer. Ejecutar suites globales focalizadas. Pausa para revisión de contratos antes de cualquier cutover.
