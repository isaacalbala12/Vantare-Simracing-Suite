# Telemetry Core Microplan 05 Retirement and Hardening Implementation Plan

> **Estado: SUPERSEDED.** Sustituido por `2026-07-19-telemetry-core-microplan-09-retirement-hardening.md`. ISA-87 es ahora TC-09E e ISA-117 el gate final; no ejecutar este microplan histórico.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirar exclusivamente infraestructura sustituida, cerrar seguridad/rendimiento/lifecycle y dejar un único camino productivo de telemetría sin perder funcionalidad de Overlay ni Engineer.

**Architecture:** La eliminación se guía por un inventario de consumidores y pruebas de arquitectura. Los monitores y comportamientos del Engineer se conservan; solo desaparecen readers, modelos, servicios, shims y fallbacks que hayan quedado sin consumidores después del cutover.

**Tech Stack:** Go, Wails v3, React/TypeScript, SSE, Vitest, Playwright, PowerShell.

---

## Issue TC-05A — Auditoría de consumidores y decisión de retirada

**Files:**
- Create: `docs/telemetry-core/retirement-audit.md`
- Modify: `docs/telemetry-core/engineer-rescue-matrix.md`
- Modify: `docs/telemetry-core/overlay-parity.md`

- [ ] **Step 1: generar inventario reproducible**

Ejecutar y pegar en `retirement-audit.md` los consumidores de:

```powershell
rg -n "internal/engineer/telemetry|engineer/telemetry|telemetry-ref|useDemoMode|lib/visibility|simulator.New|NewLMUSource|NewEnrichedLMUSource" . --glob '!docs/**' --glob '!**/*_test.go' --glob '!**/*.test.ts*'
rg -n "NewReader|NewClient|OpenFileMapping|CreateFileMapping" internal cmd --glob '*.go'
rg -n "telemetry:update|/telemetry/stream|engineer:" frontend/src internal cmd
```

Clasificar cada candidato como `ACTIVE`, `TEST_ONLY`, `REPLACED_ZERO_CONSUMERS` o `FUNCTIONAL_KEEP`.

- [ ] **Step 2: test de arquitectura rojo**

**Files:**
- Create: `internal/telemetry/architecture_test.go`
- Create: `frontend/src/overlay/core/telemetry-architecture.test.ts`

El test Go inspecciona imports y wiring para exigir un solo owner productivo de shared memory y REST. El test TS impide imports productivos desde `lib/telemetry-ref`, `lib/useDemoMode` o el shell legacy. Deben fallar antes de retirar los últimos consumidores.

- [ ] **Step 3: revisión humana de cualquier lógica funcional**

Si `engineer-rescue-matrix.md` contiene `REPLACE` o `DELETE` sobre monitor, comando, audio, Pit Manager, spotter o política de mensajes, parar. Adjuntar motivo y pedir decisión a Isaac. No continuar esa eliminación con una inferencia del worker.

- [ ] **Step 4: gates y commit**

```powershell
git diff --check
go test ./internal/telemetry -run Architecture -count=1
pnpm --dir frontend test -- telemetry-architecture
git add docs/telemetry-core/retirement-audit.md docs/telemetry-core/engineer-rescue-matrix.md docs/telemetry-core/overlay-parity.md internal/telemetry/architecture_test.go frontend/src/overlay/core/telemetry-architecture.test.ts
git commit -m "test(telemetry): inventory legacy consumers before retirement"
```

## Issue TC-05B — Retirar backend duplicado

**Files:**
- Delete when classified `REPLACED_ZERO_CONSUMERS`: `internal/engineer/telemetry/service/`
- Delete when classified `REPLACED_ZERO_CONSUMERS`: `internal/engineer/telemetry/model.go`
- Delete when classified `REPLACED_ZERO_CONSUMERS`: `internal/engineer/simulator/`
- Modify: `internal/engineer/replay/source.go`
- Modify: `internal/app/telemetry_source_manager.go`
- Modify: `internal/app/engineer_bridge.go`
- Modify: `cmd/vantare/main.go`
- Modify: `internal/telemetry/architecture_test.go`

- [ ] **Step 1: tests rojos del contrato final**

Exigir que producción construya `telemetry/live.Service` una vez, que Engineer solo se suscriba y que simulator/replay no puedan seleccionarse desde configuración productiva. Replay continúa disponible por inyección en tests y harnesses.

- [ ] **Step 2: retirar en dos commits mecánicos**

Primer commit elimina wiring/fallbacks. Segundo commit borra únicamente directorios que el inventario marca sin consumidores. No mover ni reescribir monitores en esta issue.

- [ ] **Step 3: lifecycle y fugas**

Añadir pruebas que repitan start/stop/reconnect y comprueben cierre de contextos, subscribers, timers y handles. Ninguna goroutine productiva queda sin cancelación.

- [ ] **Step 4: gates y commits**

```powershell
gofmt -w internal/app internal/engineer internal/telemetry cmd/vantare
go test ./internal/telemetry/... ./internal/engineer/... ./internal/app/... ./cmd/vantare/... -count=1
go test -race ./internal/telemetry/live ./internal/engineer/service -count=1
git add internal/app/telemetry_source_manager.go internal/app/engineer_bridge.go internal/engineer/replay/source.go internal/telemetry/architecture_test.go cmd/vantare/main.go
git commit -m "refactor(telemetry): remove duplicate production wiring"
git add -u -- internal/engineer/telemetry internal/engineer/simulator
git commit -m "refactor(engineer): retire superseded telemetry infrastructure"
```

## Issue TC-05C — Retirar frontend y transporte muertos

**Files:**
- Delete when zero-consumer: `frontend/src/lib/telemetry-ref.ts`
- Delete when zero-consumer: `frontend/src/lib/telemetry-ref.test.ts`
- Delete when zero-consumer: `frontend/src/lib/useDemoMode.ts`
- Delete when zero-consumer: `frontend/src/lib/useDemoMode.test.ts`
- Delete when zero-consumer: `frontend/src/lib/visibility.ts`
- Delete when zero-consumer: `frontend/src/lib/visibility.test.ts`
- Modify: `frontend/src/overlay/transports/wails-telemetry-adapter.ts`
- Modify: `frontend/src/overlay/transports/sse-telemetry-adapter.ts`
- Modify: `frontend/src/overlay/core/telemetry-architecture.test.ts`

- [ ] **Step 1: demostrar sustitución**

Los tests de Desktop, OBS, Studio y Engineer deben usar el contrato versionado. Los datos mock se importan desde fixtures de test, nunca desde un singleton mutable productivo.

- [ ] **Step 2: borrar por grupos**

Eliminar un módulo, ejecutar sus consumidores y continuar solo en verde. Si aparece un consumidor funcional no documentado, restaurar el archivo y actualizar la auditoría.

- [ ] **Step 3: contrato de transporte final**

Wails y SSE transportan la misma proyección y semántica de `epoch/sequence/quality/capabilities`. No conservar dos normalizadores de negocio en TypeScript.

- [ ] **Step 4: gates y commit**

```powershell
pnpm --dir frontend test -- src/overlay src/hub/overlay-studio EngineerPage telemetry-architecture
pnpm --dir frontend build
pnpm --dir frontend visual:overlay-studio
git add -u -- frontend/src/lib frontend/src/overlay
git add frontend/src/overlay/transports/wails-telemetry-adapter.ts frontend/src/overlay/transports/sse-telemetry-adapter.ts frontend/src/overlay/core/telemetry-architecture.test.ts
git commit -m "refactor(frontend): retire legacy telemetry state and adapters"
```

## Issue TC-05D — Seguridad, rendimiento y observabilidad

**Files:**
- Create: `internal/telemetry/live/metrics.go`
- Create: `internal/telemetry/live/metrics_test.go`
- Create: `internal/telemetry/live/bench_test.go`
- Modify: `internal/server/telemetry_sse.go`
- Modify: `internal/server/engineer_sse.go`
- Create: `docs/telemetry-core/operations.md`

- [ ] **Step 1: tests de presión y backpressure**

Cubrir subscriber lento, reconexión, epoch nuevo, ráfaga REST, reader stale, cancelación y cierre. La política debe ser acotada y documentada: sustituir snapshot pendiente por el más nuevo para telemetría; no perder eventos Engineer de seguridad.

- [ ] **Step 2: seguridad**

Verificar bind local, CORS/nonce existentes, ausencia de rutas locales completas, memoria raw y PII en logs. Rechazar payloads incompatibles por versión/tamaño sin bloquear el loop.

- [ ] **Step 3: métricas acotadas**

Exponer contadores internos para source status, reconnects, dropped snapshots, subscriber lag, projection errors y event queue pressure. No usar cardinalidad por piloto/vehículo/sesión.

- [ ] **Step 4: benchmark con presupuesto**

Registrar baseline y resultado en `operations.md`. Medir allocs/op y tiempo/op del ciclo fusion+fanout con 1, 5 y 20 subscribers; si empeora más de 15% sin explicación, parar y perfilar.

- [ ] **Step 5: gates y commit**

```powershell
gofmt -w internal/telemetry/live internal/server
go test ./internal/telemetry/live ./internal/server -count=1
go test -race ./internal/telemetry/live ./internal/server -count=1
go test -bench . -benchmem ./internal/telemetry/live
git add internal/telemetry/live internal/server/telemetry_sse.go internal/server/engineer_sse.go docs/telemetry-core/operations.md
git commit -m "perf(telemetry): harden lifecycle backpressure and diagnostics"
```

## Issue TC-05F — Gate final y handoff

**Files:**
- Modify: `docs/current-plan.md`
- Create: `docs/telemetry-core/final-verification.md`
- Modify: `docs/manual-verification.md`

- [ ] **Step 1: checks automatizados completos**

```powershell
git diff --check
go test ./... -count=1
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend visual:overlay-studio
pnpm --dir frontend bench:overlay-studio-drag
```

Reproducir cualquier fallo preexistente contra el SHA base; no declararlo preexistente sin evidencia.

- [ ] **Step 2: validación Playwright/manual**

- Studio, Desktop y OBS simultáneos con LMU real.
- Engineer y Spotter simultáneos con Overlay.
- Desconectar/reconectar LMU y REST.
- Reiniciar sesión/coche/circuito y confirmar epoch limpio.
- Audio, mute, cooldown, flags, fuel, pits, timing y spotter.
- Sin selector simulator/replay en producción ni fallback ficticio.
- Uso estable durante al menos 30 minutos; registrar CPU, memoria, reconnects y dropped snapshots.

- [ ] **Step 3: revisión de código independiente**

Revisar ownership, cancelación, data races, unidades, availability, logs, compatibilidad wire y lista de archivos borrados. Cada borrado debe enlazar su evidencia `REPLACED_ZERO_CONSUMERS`.

- [ ] **Step 4: documentación y commit**

```powershell
git add docs/current-plan.md docs/telemetry-core/final-verification.md docs/manual-verification.md
git commit -m "docs(telemetry): record final cutover verification"
```

Abrir PR hacia `develop` sin merge. Isaac debe validar manualmente el producto completo y aprobar de forma explícita antes de integrar.

## Stop conditions

- Se pierde o cambia un aviso real del Engineer sin aprobación.
- Un archivo candidato conserva consumidor productivo.
- Hay más de un owner de shared memory/REST.
- Aparece data race, fuga de handle/goroutine o crecimiento no acotado.
- Se requiere dependencia nueva o cambio del formato público sin ADR.
- Overlay, Engineer o Spotter no pueden funcionar simultáneamente.
