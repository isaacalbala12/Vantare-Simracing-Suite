# Telemetry Core Microplan 03 Overlay Shadow and Cutover Implementation Plan

> **Estado: BORRADOR DEPENDIENTE.** No es ejecutable hasta cerrar TC-02 y aprobar su gate humano. Debe reconciliarse de nuevo contra el Overlay Studio integrado antes de iniciar ISA-29. No autoriza cambios visuales ni de renderizadores.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar Wails, SSE, Desktop, OBS y Studio al core canónico sin modificar renderizadores ni diseño.

**Architecture:** Una proyección backend mantiene el wire observable durante shadow. Un comparador registra únicamente códigos/contadores seguros. Tras paridad automatizada y humana se cambia el productor; después se simplifica el decoder frontend.

**Tech Stack:** Go JSON contracts, Wails events, SSE, TypeScript, Vitest, Playwright visual.

---

## Issue TC-03A — Overlay wire versionado y shadow comparator

**Files:**
- Create: `internal/telemetry/projection/overlay_wire.go`
- Create: `internal/telemetry/projection/overlay_wire_test.go`
- Create: `internal/telemetry/projection/shadow_compare.go`
- Create: `internal/telemetry/projection/shadow_compare_test.go`
- Create: `frontend/src/overlay/core/telemetry-wire.ts`
- Create: `frontend/src/overlay/core/telemetry-wire.test.ts`

- [ ] **Step 1: golden contractual old/new**

Crear `internal/telemetry/testdata/overlay-wire/*.golden.json` para ready, menu, garage, stale, disconnected, zero-inputs y 60 vehículos. Tests Go producen JSON; tests TS lo parsean.

```powershell
go test ./internal/telemetry/projection -count=1
pnpm --dir frontend test -- telemetry-wire
```

Expected inicial: FAIL.

- [ ] **Step 2: wire explícito**

```go
type OverlayWire struct {
    SchemaVersion int `json:"schemaVersion"`
    Sequence uint64 `json:"sequence"`
    Epoch uint64 `json:"epoch"`
    CapturedAtUnixMS int64 `json:"capturedAtUnixMs"`
    State string `json:"state"`
    Snapshot OverlaySnapshot `json:"snapshot"`
}
```

El wire representa ceros observados. No incluye geometría Engineer, payload raw, rutas ni planes.

- [ ] **Step 3: comparador**

Comparar semántica con tolerancias declaradas; contabilizar `field`, `kind`, `count`, nunca valores privados. Shadow no publica el wire nuevo a UI.

- [ ] **Step 4: commit**

```powershell
gofmt -w internal/telemetry/projection
go test ./internal/telemetry/projection -count=1
pnpm --dir frontend test -- telemetry-wire
git add internal/telemetry/projection internal/telemetry/testdata/overlay-wire frontend/src/overlay/core/telemetry-wire.ts frontend/src/overlay/core/telemetry-wire.test.ts
git commit -m "test(telemetry): characterize canonical overlay wire"
```

## Issue TC-03B — Shadow en Wails/SSE

**Files:**
- Modify: `internal/app/telemetry_bridge.go`
- Modify: `internal/app/telemetry_bridge_test.go`
- Modify: `internal/server/sse.go`
- Modify: `internal/server/sse_test.go`
- Modify: `cmd/vantare/main.go`

- [ ] **Step 1: tests de un solo core y dos transportes**

Verificar que bridge y server reciben la misma instancia `live.Service`; ninguno abre fuentes. Shadow comparison se ejecuta una vez por emisión y no cambia payload legacy.

- [ ] **Step 2: wiring mínimo**

Inyectar core desde `main`; mantener legacy producer como referencia temporal. Un flag interno no persistido selecciona shadow/canonical para tests. No exponer preferencia al usuario.

- [ ] **Step 3: checks**

```powershell
go test ./internal/app/... ./internal/server/... -run 'Telemetry|SSE' -count=1
go test ./internal/telemetry/... -count=1
git add internal/app/telemetry_bridge.go internal/app/telemetry_bridge_test.go internal/server/sse.go internal/server/sse_test.go cmd/vantare/main.go
git commit -m "refactor(telemetry): shadow canonical overlay transport"
```

**Pause:** shadow con fixtures y sesión real debe informar cero diferencias no justificadas.

## Issue TC-03C — Cutover backend y decoder frontend

**Files:**
- Modify: `internal/app/telemetry_bridge.go`
- Modify: `internal/server/sse.go`
- Modify: `frontend/src/overlay/core/telemetry-adapter.ts`
- Modify: `frontend/src/overlay/transports/wails-telemetry-adapter.ts`
- Modify: `frontend/src/overlay/transports/sse-telemetry-adapter.ts`
- Test: archivos homónimos `.test.ts`.

- [ ] **Step 1: tests de transporte idéntico**

El mismo golden produce el mismo `TelemetrySnapshot` por Wails y SSE. Stale usa `capturedAtUnixMs`; los transports no reinterpretan unidades/sesión.

- [ ] **Step 2: cutover**

Publicar `OverlayWire`; decodificar una vez en `telemetry-adapter.ts`; Wails/SSE solo parsean transporte y error de conexión. `TelemetrySnapshot` y ViewModels no cambian.

- [ ] **Step 3: gates frontend y visual**

```powershell
pnpm --dir frontend test -- telemetry-adapter wails-telemetry sse-telemetry RuntimeOverlaySurface
pnpm --dir frontend build
pnpm --dir frontend visual:overlay-studio
pnpm --dir frontend bench:overlay-studio-drag
```

Expected: tests PASS, 0% de delta en baselines no afectados y benchmark sin regresión explicada.

- [ ] **Step 4: commit**

```powershell
git add internal/app/telemetry_bridge.go internal/server/sse.go frontend/src/overlay/core/telemetry-adapter.ts frontend/src/overlay/transports
git commit -m "refactor(telemetry): cut overlays to canonical live core"
```

## Validación manual obligatoria

- LMU off/on/reconnect.
- Desktop Overlay.
- OBS Browser Source.
- Overlay Studio live/mock.
- Delta, Standings, Relative y Pedals en Original/Crystal.
- Estados ready/stale/disconnected/error.
- 15/30 Hz, 20+ widgets y drag/resize simultáneo.

No retirar legacy hasta aprobación de Isaac.
