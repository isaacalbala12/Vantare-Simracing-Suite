# Índice del paquete — `docs/engineer/`

> **Última actualización:** 2026-06-27 (pase editorial: alineación de
> rutas y comandos en `operations.md`, `manual-verification.md`,
> `testing-strategy.md`, `master-plan-go.md`, `current-work-go.md`).
> **Worktree canónico:** `C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2-engineer`.
> **Submódulo de código:** `vantare-v2/` dentro del worktree.

## 1. Propósito de este índice

Este índice es el **mapa canónico** del paquete `docs/engineer/`. Cualquier
agente que abra el worktree debe poder:

1. Saber qué documento es la **fuente de verdad** de cada cosa.
2. Saber qué documento es **evidencia** (auditorías, capturas) y por tanto
   no se debe tomar como verdad absoluta.
3. Saber qué documento es **histórico** (explica el pasado, no manda).
4. Ver el **estado real** del paquete de docs (no claims `MATCH`/`OK`
   sin evidencia; ver §5).

## 2. Jerarquía documental

La capa documental sigue un orden estricto. Un agente nuevo debe leer en
este orden para no caer en contradicciones:

```
NIVEL 1 — Raíz (canónico, fuente de verdad)
├── docs/master-plan-go.md
├── docs/current-work-go.md
└── docs/engineer/README.md

NIVEL 2 — Plan y estado (operación diaria)
├── docs/engineer/vantare-go-master-plan.md
├── docs/engineer/current-plan.md
└── docs/engineer/INDEX.md  (este archivo)

NIVEL 3 — Reglas de operación
├── docs/engineer/agent-workflow.md
├── docs/engineer/go-review-checklist.md
├── docs/engineer/voice-contract.md
├── docs/engineer/operations.md
└── docs/engineer/manual-verification.md

NIVEL 4 — Arquitectura y dominio
├── docs/engineer/architecture/0001-prealpha-architecture.md
├── docs/engineer/architecture/spotter-geometry-findings.md
├── docs/engineer/architecture/tts.md
├── docs/engineer/architecture/crewchief-parity.md
└── docs/engineer/domain-model.md

NIVEL 5 — Auditorías y evidencia (NO son verdad absoluta)
├── docs/engineer/architecture/crewchief-parity-audit.md     (auditoría 2026-06-27)
└── docs/engineer/architecture/crewchief-parity-report.md    (informe previo, histórico)

NIVEL 6 — Testing y producto
├── docs/engineer/testing/prealpha-gate.md
├── docs/engineer/testing/lmu-telemetry.md
├── docs/engineer/testing/spotter-bug-log.md
├── docs/engineer/testing-strategy.md
└── docs/engineer/product/prealpha-next-steps.md
```

### Regla de uso

- Si un documento de NIVEL 4 contradice a uno de NIVEL 1/2, gana el
  NIVEL 1/2 (son la fuente de verdad).
- Si un documento de NIVEL 5 contradice a uno de NIVEL 1/2, gana el
  NIVEL 1/2. La auditoría sirve para pedir aclaración al orquestador,
  no para sobreescribir reglas.
- Si dos documentos del mismo nivel se contradicen, gana el más reciente
  en fecha y se abre tarea de alineación.

## 3. Tabla de archivos

| Archivo | Nivel | Rol | Estado real |
|---------|-------|-----|-------------|
| `docs/master-plan-go.md` (raíz) | 1 | Segmentación global del producto en 8 secciones × planes G0–G7. | Corregido parcialmente 2026-06-27 (enlaces relativos al paquete `engineer/` prefijados; contenido no auditado). |
| `docs/current-work-go.md` (raíz) | 1 | Plan general activo + miniplan activo + 5 tareas siguientes. | Corregido parcialmente 2026-06-27 (enlaces relativos al paquete `engineer/` prefijados; contenido no auditado). |
| `docs/engineer/README.md` | 1 | Visión del paquete, reglas heredadas, orden de lectura. | OK (revisado 2026-06-27) |
| `docs/engineer/INDEX.md` | 2 | Este mapa. | OK |
| `docs/engineer/current-plan.md` | 2 | Estado del paquete `engineer/` día a día. | Corregido parcialmente 2026-06-27 (§ 11 "Reglas operativas para esta tarea de docs" reemplazada por regla general de tareas documentales; resto del contenido no auditado en este pase). |
| `docs/engineer/vantare-go-master-plan.md` | 2 | Reglas, defaults locked, matriz LMU-01..48, mapa de versiones. | PARCIAL — contiene defaults contradictorios con código real y con CC. Ver §5. |
| `docs/engineer/agent-workflow.md` | 3 | Roles orquestador/worker/reviewer + plantilla de tarea. | OK (revisado 2026-06-27; regla CC reforzada). |
| `docs/engineer/go-review-checklist.md` | 3 | Checklist de revisión Go. | Sin auditar en este pase. |
| `docs/engineer/voice-contract.md` | 3 | Contrato VC-* voz/TTS. | Sin auditar en este pase. |
| `docs/engineer/operations.md` | 3 | Runbook del repo. | Corregido parcialmente 2026-06-27 (eliminado `cmd/lmu-debug -jsonl` y `cmd/replay-tool`; nota de sustitución por `cmd/spotter-debug` y por tests de `internal/engineer/replay`); pendiente de auditoría completa de contenido. |
| `docs/engineer/manual-verification.md` | 3 | Pasos de verificación usuario no-programador. | Corregido parcialmente 2026-06-27 (link roto `../current-plan.md` → `current-plan.md`; sección "Export JSONL" reescrita para no prometer `cmd/lmu-debug -jsonl`); pendiente de auditoría completa de contenido. |
| `docs/engineer/architecture/0001-prealpha-architecture.md` | 4 | Forma técnica del monolito. | PARCIAL — cita paquetes inexistentes (`internal/tts`, `internal/sim`, `internal/config`, `internal/persistence`, `internal/cli`). Corregido en este pase. |
| `docs/engineer/architecture/spotter-geometry-findings.md` | 4 | Convención X/Z confirmada. | PARCIAL — varias aserciones `MATCH`/`OK` sin evidencia live. Separado confirmado vs `NO_VERIFICADO` en este pase. |
| `docs/engineer/architecture/tts.md` | 4 | TTS, cache, pre-cache, providers. | HISTÓRICO/ASPIRACIONAL — describe `internal/tts/*` que NO existe en el worktree. Marcado como tal. |
| `docs/engineer/architecture/crewchief-parity.md` | 4 | Matriz LMU-01..48 y módulos a portar. | PARCIAL — claims `MATCH prealpha` para features no implementadas (ValidityRule, IsMessageStillValid, minSpotterSpeedMPS, Fixtures persistentes, cmd/lmu-debug -jsonl). Reemplazado por vista basada en evidencia. |
| `docs/engineer/architecture/crewchief-parity-audit.md` | 5 | Auditoría adversarial 2026-06-27. | EVIDENCIA — útil como insumo; contiene afirmaciones incorrectas (ver §5). |
| `docs/engineer/architecture/crewchief-parity-report.md` | 5 | Informe de paridad previo. | HISTÓRICO — describe paquetes inexistentes y parser state que ya cambió. Conservar solo como referencia histórica. |
| `docs/engineer/architecture/spotter-geometry-findings.md` | 4 | (ver arriba) | |
| `docs/engineer/testing/prealpha-gate.md` | 6 | Criterios para cerrar prealpha. | PARCIAL — cita `-jsonl` flag inexistente. Corregido. |
| `docs/engineer/testing/lmu-telemetry.md` | 6 | Offsets LMU, parser, gates. | Sin auditar en este pase. |
| `docs/engineer/testing/spotter-bug-log.md` | 6 | Bugs conocidos. | Sin auditar en este pase. |
| `docs/engineer/testing-strategy.md` | 6 | Estrategia de tests. | Corregido parcialmente 2026-06-27 (sección "Fixtures replay" reescrita con path `internal/engineer/replay/testdata/`; sección "Tests con fixtures externos" reemplazada por procedimiento provisional hasta `cmd/spotter-debug`; pendiente de auditoría completa de contenido). |
| `docs/engineer/product/prealpha-next-steps.md` | 6 | Prioridades prealpha. | PARCIAL — cita `-jsonl` flag inexistente. Corregido. |

## 4. Documentos HISTÓRICOS (no se usan para decidir)

Estos documentos se conservan por valor histórico pero **no** deben
usarse como guía de implementación actual:

- `docs/engineer/architecture/crewchief-parity-report.md` — informe de
  paridad previo a la auditoría 2026-06-27; describe paths y parser
  state que ya no existen. Conservar como antecedente; en caso de duda,
  leer la auditoría de 2026-06-27 que la corrige.
- `docs/proyecto/*` — docs del proyecto V1 (no del Go).
- `docs/plans/*` y `docs/superpowers/plans/*` — planes de sprints
  históricos; no usar como spec actual.
- `docs/architecture/0001-prealpha-architecture.md` (versión Python) —
  el Go vive en `docs/engineer/architecture/0001-prealpha-architecture.md`.

## 5. Estado real del paquete Go vs claims de los docs

A 2026-06-27, **NO** se da por cierto ningún claim `MATCH` o `OK` que
no tenga evidencia concreta en código o test. Estado verificado:

| Claim | Evidencia real | Estado |
|---|---|---|
| Spotter lateral X/Z | `internal/engineer/spotter/{overlap,geometry,alignment}.go` + tests `geometry_test.go`, `overlap_test.go` | CONFIRMADO |
| `ClassifyWithActiveSides` con `ActiveSides` | `spotter/geometry.go:51` + tests | CONFIRMADO |
| `clearDelayMS=150`, `detectionHoldMS=350`, `stillThereRepeatMS=2500`, `messageExpiryMS=2000`, `clearExpiryMS=2000` | `spotter/state.go:47-57` | CONFIRMADO |
| `ValidityRule` en `audio.Message` | `grep "ValidityRule" internal/engineer/audio/*.go` → 0 coincidencias | NO IMPLEMENTADO |
| `Runtime.IsMessageStillValid` | `grep "IsMessageStillValid" internal/engineer/` → 0 coincidencias | NO IMPLEMENTADO |
| `minSpotterSpeedMPS=10.0` (gate velocidad) | `grep "minSpotterSpeedMPS\|Speed\|MPS" internal/engineer/spotter/*.go` → 0; `Classify` no consulta velocidad | NO IMPLEMENTADO |
| `cmd/lmu-debug -jsonl` | `cmd/lmu-debug/main.go:23-27` solo define `-once -mock -hz` | NO IMPLEMENTADO |
| Replay JSONL fixtures left/right/three-wide/all-clear | `internal/engineer/replay/` solo tiene `jsonl.go`, `jsonl_test.go`, `source.go`; no hay `testdata/` | NO IMPLEMENTADO |
| `internal/engineer/lmu/parser.go` (parser de ingeniero) | Existe en el worktree como **cambio sin commit**; solo lee geometría (Position, Orientation), NO fuel/flag/penalty | PARCIAL (sin commit) |
| `internal/telemetry/lmu/parser.go` lee Fuel, VehicleClass, Penalties, BestLapTime, LastLapTime, TimeBehind* | `parser.go:163,164,213,219,220,224,225,228` | CONFIRMADO |
| `internal/tts/` | `Get-ChildItem internal/tts` → no existe | NO IMPLEMENTADO |
| `internal/{sim,config,persistence,cli}/` | `Get-ChildItem internal` → solo `app/ core/ engineer/ license/ ops/ server/ telemetry/ updater/ window/` | NO IMPLEMENTADO |
| `internal/engineer/modules/` | No existe | NO IMPLEMENTADO |
| Spotter override `minSpotterSpeedMPS` configurable | No existe | NO IMPLEMENTADO |
| Audio queue con prioridad | `audio/queue.go` ordena por `Priority` desc + `CreatedAt` asc | CONFIRMADO |
| Audio queue con `stopLocked` (interrupción) | `audio/player_windows.go:37-42` → `stopLocked()` antes de `Play` | CONFIRMADO (Player tiene kill) |
| `queueLoop` invoca `Player.Play` | `engineer_service.go:359-394` solo emite `EngineerNotification`; NO llama a `Player.Play` | PARCIAL (Player listo, no integrado) |
| `/api/engineer/health` | `internal/server/server.go` añade `handleEngineerHealth` | CONFIRMADO (cambio sin commit) |
| `BufferProvider` + `OverlaysLiveAdapter` (`source="lmu"`) | `engineer_service.go` añade `SetBufferProvider` y rama `case "lmu"` | CONFIRMADO (cambio sin commit) |
| CC `BatteryLowThreshold=10.0f` | `Battery.cs:77` | CONFIRMADO |
| CC `wornOutTyreWearPercent=75.0f` (knackered) | `RF2GameStateMapper.cs:47` | CONFIRMADO |
| CC `minSessionRunTimeForEndMessages=60` (segundos, no 6) | `SessionEndMessages.cs:33` | CONFIRMADO (el plan master dice 6s, sin paridad directa con CC) |

## 6. Cómo se mantiene este índice

- Cuando se cree o mueva un archivo, actualizar §3 y §4.
- Cuando un claim pase de `NO IMPLEMENTADO` a `CONFIRMADO`, actualizar §5
  con la evidencia concreta.
- Cuando un doc entre en estado `HISTÓRICO`, marcarlo en §4 y
  redirectar al canónico.
- Cambios a este índice son cambios quirúrgicos: solo se reescribe §5
  cuando hay nueva evidencia real. No se reordena la jerarquía sin
  acuerdo del orquestador.

## 7. Convención de versionado

- `v1` cuando se publica la primera versión coherente.
- `v2` cuando hay un cambio incompatible (raro en docs).
- Cambios incrementales se numeran en el CHANGELOG.

## 8. Convención de nombres

- `xxx.md` (minúsculas, guiones) para documentos.
- `yyy_test.go` (snake_case con sufijo `_test`) para tests.
- Sin espacios, sin acentos, sin mayúsculas en nombres de archivo.
