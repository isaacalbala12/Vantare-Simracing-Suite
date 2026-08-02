# Telemetry Core Microplan 04 Engineer Preservation and Cutover Implementation Plan

> **Estado: SUPERSEDED.** Sustituido por `2026-07-19-telemetry-core-microplan-08-engineer-cutover.md`. La matriz de rescate sigue siendo evidencia vigente; no ejecutar este microplan histórico.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conservar la funcionalidad real de Engineer Release y sustituir únicamente su infraestructura paralela por una proyección de Telemetry Core.

**Architecture:** Los monitores continúan recibiendo un `EngineerObservation` estable. Un adapter temporal permite migrarlos por grupos; replay ejecuta old/new sobre las mismas grabaciones y compara eventos. La fuente productiva es siempre Telemetry Core.

**Tech Stack:** Go, LMU shared memory/REST, replay JSONL, audio/TTS, Wails/SSE Engineer.

---

## Issue TC-04A — Auditoría de capabilities por monitor

**Files:**
- Modify: `docs/telemetry-core/engineer-rescue-matrix.md`
- Create: `docs/telemetry-core/engineer-capability-matrix.md`
- Create: `docs/telemetry-core/engineer-event-baseline.md`
- Create: `docs/telemetry-core/lmu-spatial-validation.md`

- [ ] **Step 1: inventariar todos los monitores**

Incluir `spotter`, `flags`, `penalties`, `laps`, `fuel`, `pitstops`, `position`, `timings`, `push`, `sessionend`, `racetime`, `tyre`, `engine`, `damage`, `conditions`, `multiclass`, `opponents`, `watchedopponents`, `driverswaps`, `pearls` y `strategy`.

Para cada uno registrar fields, source real, test/replay, eventos, audio y clasificación.

- [ ] **Step 2: prohibir heurística como observado**

Ejemplos:

- lluvia inferida por temperatura: `DISABLE` o `QualityDerived`, nunca observed;
- wheel lock/spin sin captura real: capability missing;
- estrategia existente: `ADAPT/HARDEN`, no canónica para Product C sin auditoría.

- [ ] **Step 3: validar espacial real antes del Spotter**

Con LMU real o una captura raw autorizada, documentar sistema de coordenadas, handedness, ejes, unidades, orientación/heading, player/opponent identity, discontinuidades de pit/garage y frecuencia. Reproducir al menos car left, car right, three wide, overtake, pit entry y cambio de sesión. `lmu-spatial-validation.md` debe enlazar fixtures/replay y declarar cada campo `VERIFIED`, `DERIVED` o `MISSING`. Si no puede verificarse un dato, el monitor dependiente queda capability-disabled; no se rellena con heurística.

- [ ] **Step 4: gates y commit**

```powershell
git diff --check
rg -n "REPLACE|DELETE" docs/telemetry-core/engineer-rescue-matrix.md
git add docs/telemetry-core/engineer-rescue-matrix.md docs/telemetry-core/engineer-capability-matrix.md docs/telemetry-core/engineer-event-baseline.md docs/telemetry-core/lmu-spatial-validation.md
git commit -m "docs(engineer): classify preserved functionality and capabilities"
```

Cada `REPLACE/DELETE` funcional debe enlazar aprobación de Isaac.

## Issue TC-04B — Proyección canónica Engineer

**Files:**
- Create: `internal/engineer/projection/observation.go`
- Create: `internal/engineer/projection/from_live.go`
- Create: `internal/engineer/projection/from_live_test.go`
- Create: `internal/engineer/projection/golden_test.go`
- Create: `internal/engineer/projection/testdata/*.golden.json`

- [ ] **Step 1: tests rojos de cobertura**

Los goldens cubren jugador, oponentes, posición/orientación, ruedas, recursos, daños, flags, pit, timing y missing capabilities. Cada campo consumido por un monitor tiene test de mapping.

```powershell
go test ./internal/engineer/projection -count=1
```

- [ ] **Step 2: implementar proyección pura**

`FromLive(model.Observation) EngineerObservation` no lee LMU, REST, disco, Wails ni settings. `EngineerObservation` se declara en `internal/engineer/projection/observation.go`. Los valores conservan availability/quality. El DTO puede mantener temporalmente nombres que minimicen cambios de monitores, pero no duplica lifecycle/epoch.

- [ ] **Step 3: commit**

```powershell
gofmt -w internal/engineer/projection
go test ./internal/engineer/projection -count=1
git add internal/engineer/projection
git commit -m "feat(engineer): project canonical LMU observations"
```

## Issue TC-04C — Replay parity de monitores

**Files:**
- Modify: `internal/engineer/replay/source.go`
- Create: `internal/engineer/replay/canonical_source.go`
- Create: `internal/engineer/replay/parity_test.go`
- Create: `internal/engineer/testdata/event-parity/*.json`

- [ ] **Step 1: capturar baseline de eventos**

Para cada fixture guardar orden, type, priority, payload, expiry y dedup key. Audio path no forma parte del dominio; textKey sí.

- [ ] **Step 2: ejecutar old/new**

El mismo fixture pasa por pipeline legacy y `Telemetry Core -> EngineerProjection`. Comparar secuencia exacta salvo diferencias aprobadas en `engineer-event-baseline.md`.

- [ ] **Step 3: tests y commit**

```powershell
go test ./internal/engineer/replay ./internal/engineer/... -count=1
git add internal/engineer/replay internal/engineer/testdata/event-parity
git commit -m "test(engineer): prove monitor parity on canonical telemetry"
```

## Issue TC-04D — Separar runtime monolítico sin cambiar eventos

**Files:**
- Modify: `internal/engineer/core/runtime.go`
- Create: `internal/engineer/core/monitor_registry.go`
- Create: `internal/engineer/core/message_policy.go`
- Create: `internal/engineer/core/monitor_registry_test.go`
- Modify: `internal/engineer/core/runtime_test.go`

- [ ] **Step 1: tests de caracterización**

Fijar orden de monitores, prioridad de seguridad, cooldown, stale suppression y lifecycle por epoch.

- [ ] **Step 2: extracción mecánica**

`runtime.go` conserva orquestación; registry llama monitores; message policy decide prioridad/dedup/expiry. No cambiar fórmulas ni text keys en esta issue.

- [ ] **Step 3: tests y commit**

```powershell
gofmt -w internal/engineer/core
go test ./internal/engineer/core ./internal/engineer/... -count=1
git add internal/engineer/core
git commit -m "refactor(engineer): separate monitor orchestration and policy"
```

## Issue TC-04E — Cutover productivo

**Files:**
- Modify: `internal/engineer/service/engineer_service.go`
- Modify: `internal/engineer/service/engineer_service_test.go`
- Modify: `internal/app/engineer_bridge.go`
- Modify: `cmd/vantare/main.go`
- Modify: `frontend/src/hub/pages/EngineerPage.tsx`
- Modify: `frontend/src/hub/pages/EngineerPage.test.tsx`

- [ ] **Step 1: tests rojos**

Verificar source único `lmu`, disconnected honesto, no simulator fallback, replay no visible, shutdown, slow subscribers y audio/notification preservation.

- [ ] **Step 2: wiring**

`EngineerService` se suscribe a `live.Service`; no crea reader/service. UI conserva enabled/spotter/sensitivity y elimina selector normal simulator/replay/lmu. Replay se inyecta solo en tests/debug.

- [ ] **Step 3: gates**

```powershell
go test ./internal/engineer/... ./internal/app/... ./internal/server/... -count=1
go test -race ./internal/engineer/service ./internal/telemetry/live -count=1
pnpm --dir frontend test -- EngineerPage
pnpm --dir frontend build
```

- [ ] **Step 4: commit**

```powershell
git add internal/engineer/service internal/app/engineer_bridge.go cmd/vantare/main.go frontend/src/hub/pages/EngineerPage.tsx frontend/src/hub/pages/EngineerPage.test.tsx
git commit -m "refactor(engineer): run complete suite on canonical LMU telemetry"
```

## Validación manual obligatoria

- LMU conectado/desconectado/reconectado.
- Car left/right/three wide real o replay controlado.
- Flags, fuel, laps, pit stops, position y timing.
- Monitores con capability missing no inventan mensajes.
- Audio, prioridad, cooldown y mute.
- Pit Manager permanece dry-run/confirmable.
- Overlay continúa funcionando simultáneamente.

No retirar pipeline Engineer legacy hasta aprobación de Isaac.
