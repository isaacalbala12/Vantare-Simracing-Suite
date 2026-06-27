# ADR 0001 — Prealpha Architecture (Vantare Ingeniero Go)

> **Estado:** Accepted (2026-06-27).
> **Auditado:** 2026-06-27 (corrección de paths inexistentes).

## Status

Accepted (2026-06-27). Este ADR define la **forma objetivo** del
monolito. Algunos paquetes listados aquí aún no existen en el
worktree; ver § "Estado real del monolito" al final.

## Context

Necesitamos construir la primera prealpha de Vantare Ingeniero Go, una
reescritura en Go del producto Python v0.7. El objetivo es establecer
una base modular, robusta y performante para adquisición de
telemetría, normalización y la lógica determinista del spotter y suite
del ingeniero, con paridad verificada contra CrewChief para LMU.

La arquitectura debe soportar las reglas no negociables del plan
maestro (20 Hz en todo, detección ≠ messaging, IA no decide datos
críticos, defaults locked, monolito sin daemon).

## Decision

Una sola app Wails en proceso conteniendo:

1. Un core Go modular con `internal/telemetry`,
   `internal/engineer/{spotter,core,audio,replay,lmu}`,
   `internal/engineer/service`.
2. Un port de telemetría que soporte shared memory LMU directo en
   Windows vía mmap + parser por byte offsets.
3. Un harness de replay y simulador (JSONL) que permita desarrollo y
   testing offline sin LMU abierto.
4. Spotter con geometría CrewChief-aligned X/Z y state machine con
   `ActiveSides`, `clearDelayMS`, `stillThereRepeatMS=2500`.
5. Suite del ingeniero (alpha 1+) con módulos deterministas evaluando
   a 20 Hz sobre el mismo `TelemetryFrame` que el spotter.
6. Audio queue con prioridad, expiración, preemption y validación de
   mensajes stale vía `ValidityRule` metadata (mini-auditoría
   pendiente, ver `current-plan.md` § 6 Tarea 3).
7. Wails shell con UI React/TypeScript mínima.

> **Nota sobre paquetes aspiracionales:** este ADR menciona
> `internal/tts`, `internal/sim`, `internal/config`,
> `internal/persistence`, `internal/cli` como paquetes objetivo. A
> 2026-06-27, **estos paquetes NO existen** en el worktree
> (`vantare-v2/internal/` solo tiene `app/ core/ engineer/ license/
> ops/ server/ telemetry/ updater/ window/`). El plan de
> implementación real está en `current-plan.md` y
> `vantare-go-master-plan.md` § 6/8.

## Principios de diseño

1. **Detección ≠ messaging.** Geometría pura, histéresis, transición
   de estado, delay de mensaje, expiración y prioridad de cola son
   paquetes distintos. Ningún módulo los mezcla.
2. **Suite a 20 Hz.** Spotter y suite del ingeniero evalúan sobre el
   mismo `TelemetryFrame`. Nada a 0.5 Hz batch. Cada módulo recibe
   `previous` y `current` para detectar flancos.
3. **IA no decide datos críticos.** LLM solo redacta sobre `facts`.
   Tools PTT devuelven `ToolResult{Facts map[string]any, Spoken
   string}`.
4. **Geometry pura.** Sin estado, sin I/O, sin audio queue, sin UI.
   Funciones puras testeables.
5. **Defaults Locked.** Constantes publicadas en
   `vantare-go-master-plan.md` § 5. Cambiar una default requiere
   actualización de plan maestro + evidencia.
6. **Idiomatic Go.** Standard library primero. Interfaces en el
   consumidor. Sin paquetes `utils` genéricos. Sin `panic` en flujo
   de producción. `context.Context` en I/O. `%w` al envolver errores.

## Forma del monolito

```
Wails desktop app
  React/TypeScript UI (capa de presentación)
  Go app bindings (Wails generated)
  Go internal core
    telemetry/           → Frame normalizado + LMU mmap + offsets
    engineer/
      spotter/           → geometry + state machine + active sides
      engineer/ (suite)  → suite determinista (alpha 1)
      audio/             → cola con prioridad, expiración, validación
      replay/            → JSONL record/playback
      simulator/         → escenarios sintéticos deterministas
      core/              → runtime a 20 Hz que conecta todo
      lmu/               → parser experimental de geometría (sin commit)
      service/           → EngineerService + OverlaysLiveAdapter (sin commit)
```

> **Paquetes aspiracionales (no implementados a 2026-06-27):**
> `tts/`, `sim/lmu` (subsistema), `config/`, `persistence/`, `cli/`,
> `engineer/modules/`, `engineer/lmu/`, `engineer/commands/`,
> `engineer/ptt_agent.go`, `lmu/{api,pit_menu,session_settings}.go`.
> Ver § "Estado real del monolito" abajo.

## Pipelines principales

### Pipeline 01 — Ingesta de telemetría

| Paso | Responsabilidad | Hz |
|------|-----------------|-----|
| Leer LMU shared memory | `internal/telemetry/lmu` mmap directo | 20 |
| Parsear por offsets | `internal/telemetry/lmu/parser.go` | 20 |
| Normalizar | `internal/telemetry` (frame) | 20 |
| Publicar | `internal/engineer/core/runtime` | 20 |

> **Estado real:** los 4 pasos existen como código en
> `internal/telemetry/` y `internal/engineer/core/`. Hay además un
> parser experimental `internal/engineer/lmu/parser.go` (sin commit,
> solo geometría) que reusa el mismo mmap.
>
> **CORRECCIÓN 2026-06-27:** el path `internal/core/runtime` citado en
> la versión previa no existe en el worktree; el runtime de Ingeniero
> vive en `internal/engineer/core/runtime.go`.

### Pipeline 02 — Spotter (CONFIRMADO prealpha)

| Capa | Paquete | Responsabilidad | Estado |
|------|---------|-----------------|--------|
| Geometry | `internal/engineer/spotter/geometry.go` | pura, sin estado | CONFIRMADO |
| Alignment | `internal/engineer/spotter/alignment.go` | yaw + X/Z alineado CrewChief | CONFIRMADO |
| Overlap | `internal/engineer/spotter/overlap.go` | dimensión del coche, histéresis | CONFIRMADO |
| State machine | `internal/engineer/spotter/state.go` | `ActiveSides`, hold, clear delay, still-there | CONFIRMADO |
| Speed gate | `internal/engineer/spotter/geometry.go` | `minSpotterSpeedMPS=10.0` | NO_IMPLEMENTADO |

### Pipeline 03 — Engineer (alpha 1, NO_IMPLEMENTADO)

| Capa | Paquete | Responsabilidad |
|------|---------|-----------------|
| Frame context | `internal/engineer/types.go` | `FrameContext{Previous, Current, Strategy, Session, NowMonotonic}` |
| Module base | `internal/engineer/base.go` | interfaz común `Evaluate(ctx) []Event` |
| Modules | `internal/engineer/modules/{flags,penalties,damage,fuel,laps,session_end,...}.go` | uno por archivo |
| Suite | `internal/engineer/suite.go` | runner ordenado de módulos |

### Pipeline 04 — Audio y TTS (PARCIAL)

| Capa | Paquete | Responsabilidad | Estado |
|------|---------|-----------------|--------|
| Message | `internal/engineer/audio/message.go` | estructura + `ValidityRule` (pendiente) | PARCIAL |
| Queue | `internal/engineer/audio/queue.go` | prioridad, expiración, FIFO | CONFIRMADO |
| Player | `internal/engineer/audio/player_windows.go` | MCI async con `stopLocked()` | CONFIRMADO |
| Integración queue→player | `internal/engineer/service/engineer_service.go` | `queueLoop` invoca `Player.Play` | NO_IMPLEMENTADO |
| Engine TTS | `internal/tts/engine.go` | synth-or-cache | NO_IMPLEMENTADO (paquete no existe) |
| Providers | `internal/tts/{kokoro,edge,gemini,voice_clone}/provider.go` | adapter por provider | NO_IMPLEMENTADO |
| Cache | `internal/tts/cache.go` | hash (lang, voice, text) → .mp3 | NO_IMPLEMENTADO |

### Pipeline 05 — PTT comandos (alpha 2+, NO_IMPLEMENTADO)

| Capa | Paquete | Responsabilidad |
|------|---------|-----------------|
| Registry | `internal/engineer/commands/registry.go` | match grammar → tool |
| Tools | `internal/engineer/commands/{fuel,tyres,gaps,...}.go` | tool → `ToolResult{Facts, Spoken}` |
| PTT agent | `internal/engineer/ptt_agent.go` | coordina LLM (beta) sobre facts |

### Pipeline 06 — LMU API REST (alpha 3, NO_IMPLEMENTADO)

| Capa | Paquete | Responsabilidad |
|------|---------|-----------------|
| Client | `internal/lmu/api.go` | HTTP a `http://localhost:6397` |
| Pit menu | `internal/lmu/pit_menu.go` | read + write con `dry_run` + `confirm` |
| Session settings | `internal/lmu/session_settings.go` | poll cada 5 s |

## Anti-fork rule

Si el Go termina emitiendo mensajes deterministas vía batch, formateados
por LLM como cifras, o con `triggers.py` legacy orquestando desde fuera
de la suite, **el producto es un wrapper fork** y no paridad. Los
tests deben fallar si eso ocurre. Verificación:

- ¿Suite evalúa a 20 Hz? (`go test ./internal/engineer -v`)
- ¿Ningún módulo importa `internal/llm`?
- ¿Voice contract matriz verde?

## Consecuencias

- Modular: telemetría, spotter, engineer, audio son paquetes
  intercambiables que comparten `TelemetryFrame`.
- El simulador y el replay permiten desarrollo offline y tests
  exhaustivos sin abrir LMU.
- Bajo overhead de telemetría leyendo el archivo mmap directamente en
  Go, sin IPC con un sidecar Python.
- La suite a 20 Hz y la separación detección/messaging permite añadir
  módulos CC sin tocar el runtime.
- El monolito evita la complejidad de un bus interno, daemon o
  microservicios locales hasta que una necesidad real lo justifique.
- Voice contract y matriz LMU-01..48 son la fuente de verdad de
  paridad con CrewChief, no las pruebas manuales.

## Cambios futuros esperados

- Adición de módulos CC en alpha 1-2 (sin cambiar forma del
  monolito).
- Adición de providers TTS (Gemini beta, voice clone 1.0) — requiere
  crear antes `internal/tts/`.
- Adición de pit menu REST (alpha 3).
- Adición de iRacing en 1.1 (segundo `sim/` provider, mismo `Frame`).

## Estado real del monolito (2026-06-27)

Esta tabla refleja lo que existe **realmente** en
`vantare-v2/internal/` del worktree. Cualquier celda marcada como
NO_IMPLEMENTADO requiere mini-auditoría específica antes de empezar
trabajo.

| Path aspiracional | Estado real | Evidencia |
|---|---|---|
| `telemetry/lmu/` (parser público) | CONFIRMADO | `parser.go`, `reader_windows.go`, `reader_stub.go`, `synthetic.go`, `offsets.go`, tests |
| `engineer/spotter/` | CONFIRMADO | `overlap.go`, `geometry.go`, `state.go`, `alignment.go`, `debug.go` + tests |
| `engineer/audio/` (queue + player) | CONFIRMADO (con gap `ValidityRule` y `queueLoop→Player.Play`) | `queue.go`, `player_windows.go`, `player.go`, `player_other.go`, `message.go`, tests |
| `engineer/replay/` (JSONL harness) | CONFIRMADO (sin fixtures persistentes) | `jsonl.go`, `source.go`, `jsonl_test.go` |
| `engineer/lmu/` (parser experimental) | PARCIAL (sin commit) | `parser.go`, `parser_test.go`, `offsets.go` solo geometría (Position, Orientation) |
| `engineer/telemetry/` (modelo interno) | CONFIRMADO | `model.go`, `vector.go`, `source.go`, `service/` |
| `engineer/simulator/` | CONFIRMADO | `scenario.go`, `source.go`, `scenario_test.go` |
| `engineer/core/` (runtime) | CONFIRMADO | `runtime.go`, `runtime_test.go` |
| `engineer/service/` (EngineerService) | CONFIRMADO + cambios sin commit (`BufferProvider`, `dropCount`, `/api/engineer/health`) | `engineer_service.go`, `engineer_service_test.go`, `notification.go`, `notification_store.go`, `overlays_live_adapter.go` (sin commit) |
| `engineer/spotter/replay/testdata/` | NO_IMPLEMENTADO | no existe directorio; tests usan `os.CreateTemp` |
| `engineer/modules/` | NO_IMPLEMENTADO | no existe directorio |
| `engineer/commands/` | NO_IMPLEMENTADO | no existe directorio |
| `engineer/ptt_agent.go` | NO_IMPLEMENTADO | no existe archivo |
| `tts/` | NO_IMPLEMENTADO | `internal/tts/` no existe |
| `sim/` (LMU como subsystem) | NO_IMPLEMENTADO | `internal/sim/` no existe (LMU vive en `internal/telemetry/lmu/`) |
| `config/` | NO_IMPLEMENTADO | no existe directorio |
| `persistence/` | NO_IMPLEMENTADO | no existe directorio |
| `cli/` | NO_IMPLEMENTADO | no existe directorio (binarios viven en `cmd/`) |
| `lmu/` (REST API) | NO_IMPLEMENTADO | `internal/lmu/` no existe |

> **Recomendación al orquestador:** antes de aprobar cualquier miniplan
> que toque paquetes NO_IMPLEMENTADOS, abrir una mini-auditoría
> específica y obtener evidencia viva de que el paquete será
> creado (no solo aspirado).
