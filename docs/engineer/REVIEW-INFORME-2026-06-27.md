# Informe Técnico — Revisión Documental Vantare Ingeniero Go

> **Fecha:** 2026-06-27.
> **Tipo:** revisión documental sin implementación de código.
> **Worktree canónico:** `C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2-engineer`.
> **Submódulo de código:** `vantare-v2/` dentro del worktree.
> **Repo CC de referencia:** `https://gitlab.com/mr_belowski/CrewChiefV4`
> (clonado localmente bajo `C:\Users\isaac\.gemini\antigravity\crewchief_src\CrewChiefV4\`).

## A. Archivos modificados

> Todos los archivos estaban en estado `??` (untracked) en el worktree
> antes de este pase. No había docs comiteados en `docs/`. La
> reescritura toma el contenido existente en disco y lo reemplaza
> entero o por bloques quirúrgicos. **No se ha hecho commit.**

| Archivo | Acción | Resumen |
|---|---|---|
| `docs/master-plan-go.md` | Reescrito | Jerarquía explícita, regla CC reforzada, miniplan activo en `current-plan.md`, sin redefinir valores del plan maestro. |
| `docs/current-work-go.md` | Reescrito | Apunta al miniplan activo, marca cambios sin commit del worktree, cita `INDEX.md § 5` como mapa de estado real. |
| `docs/engineer/README.md` | Reescrito | Regla CC no negociable (§ 3), estados válidos para features CC (§ 4), árbol de archivos con aviso de paths inexistentes. |
| `docs/engineer/INDEX.md` | Reescrito | Jerarquía en 6 niveles, tabla de archivos con estado real, § 5 con claims verificados y `NO IMPLEMENTADO`, § 4 con docs históricos. |
| `docs/engineer/current-plan.md` | Reescrito | § 2 con estado verificado en código y tests, § 2.2 cambios sin commit del worktree, § 2.3 NO implementado, § 6 con 5 mini-tareas (incluyendo `cmd/spotter-debug` y `ValidityRule`). |
| `docs/engineer/vantare-go-master-plan.md` | Reescrito | Defaults corregidos: `battery_low_soc_pct 20→10` (CC `Battery.cs:77`), `push_window_laps` y `push_window_time_s` por TrackLengthClass (CC `PushNow.cs:88,96-98`), `session_start_delay_s` clarificado como decisión Vantare no paridad CC, `minSpotterSpeedMPS` clarificado como decisión Vantare, `tyre_wear_warn_pct=75` confirmado (CC usa `wornOutTyreWearPercent=75`), matriz LMU-01..48 reescrita con estados `CONFIRMADO`/`PARCIAL`/`NO_IMPLEMENTADO` y columna "Mini-auditoría CrewChief". |
| `docs/engineer/agent-workflow.md` | Reescrito | § 4 con regla CC reforzada (mini-auditoría obligatoria por feature, contenidos mínimos, cuándo no se puede usar, lo que no sustituye, stop condition automático). § 11 con checklist de auditoría durante review. |
| `docs/engineer/architecture/0001-prealpha-architecture.md` | Reescrito | Paquetes aspiracionales marcados como NO_IMPLEMENTADO, tabla final con estado real de cada path, paths de pipelines corregidos (`internal/core/runtime` → `internal/engineer/core/runtime`). |
| `docs/engineer/architecture/crewchief-parity.md` | Reescrito | Vista basada en evidencia: § 4-10 con estado CONFIRMADO/PARCIAL/NO_VERIFICADO por feature CC, § 11 lista de módulos a portar con archivos CC exactos, § 14 Open Questions NO_VERIFICADO explícitas, fuente de verdad de la matriz LMU-01..48 redirigida al plan maestro. |
| `docs/engineer/architecture/crewchief-parity-report.md` | Marcado HISTÓRICO | Cabecera que explica los 7 errores principales del informe previo (paths inexistentes, claims MATCH/PARCIAL incorrectos, tabla de telemetría desactualizada, constantes CC mal citadas, tyre wear thresholds mal copiados); contenido original conservado como referencia histórica en bloque de código. |
| `docs/engineer/architecture/crewchief-parity-audit.md` | Marcado EVIDENCIA | Cabecera añadida que advierte que el propio audit contiene errores (ej. typo `tyre_wear_warn_pct=75→30` invertido) y que la fuente de verdad es el plan maestro, no este doc. |
| `docs/engineer/architecture/spotter-geometry-findings.md` | Reescrito | § 4 separado CONFIRMADO (código + tests) vs NO_VERIFICADO (captura live pendiente), § 5 con fuentes CC exactas (`NoisyCartesianCoordinateSpotter.cs:35,51,76`, `carClassData.json:60`), § 9 con estado de cada filtro. |
| `docs/engineer/architecture/tts.md` | Marcado HISTÓRICO/ASPIRACIONAL | Cabecera añadida: `internal/tts/` no existe en el worktree; el doc es spec de diseño, no spec implementada. |
| `docs/engineer/testing/prealpha-gate.md` | Reescrito | `cmd/lmu-debug -jsonl` sustituido por `cmd/spotter-debug` (el flag `-jsonl` no existe); criterios nuevos para `ValidityRule`, `minSpotterSpeedMPS`, integración `Player.Play`, cambios sin commit del worktree; § 6 con cambios respecto a versión previa. |
| `docs/engineer/product/prealpha-next-steps.md` | Corregido | Bloque sobre `cmd/lmu-debug -jsonl` reescrito: helper existe en `spotter/debug.go:102` pero no se invoca desde CLI; sustitución por `cmd/spotter-debug` clarificada; path de fixtures corregido a `internal/engineer/replay/testdata/`; cierre prealpha reescrito con criterios actuales. |
| `docs/engineer/testing-strategy.md` | Corregido | Paths corregidos a `internal/engineer/{spotter,simulator,core,replay}`; § "Tests con fixtures externos" corregido (sustituye `cmd/lmu-debug -jsonl` por `cmd/spotter-debug`, corrige path de fixtures, marca `cmd/replay-tool` como no existente). |
| `docs/engineer/operations.md` | Corregido | Paths de tests de spotter corregidos a `internal/engineer/{spotter,simulator,core,replay}`. |
| `docs/engineer/manual-verification.md` | Corregido | `cmd/lmu-debug -jsonl` sustituido por `cmd/spotter-debug`; path `internal/replay ./internal/spotter` corregido a `internal/engineer/replay ./internal/engineer/spotter`. |
| `docs/engineer/testing/lmu-telemetry.md` | Corregido | Paths `internal/sim/lmu/` corregidos a `internal/telemetry/lmu/`; constantes de offsets actualizadas con las reales (Fuel=524, GamePhase=1740, etc.). |
| `docs/engineer/CHANGELOG.md` | Añadida entrada v1.1 | Lista completa de cambios del pase. |

## B. Resumen de cambios por archivo (cambios cualitativos)

### B.1 Jerarquía documental explícita

Antes: los docs estaban en `docs/`, `docs/engineer/`,
`docs/engineer/architecture/`, `docs/engineer/testing/` sin un mapa
claro de "cuál es canónico". El `INDEX.md` declaraba "escrito, v1"
para todos sin distinguir jerarquía.

Ahora: `INDEX.md` define 6 niveles explícitos con regla de prioridad:

```
NIVEL 1 — Raíz (canónico):  master-plan-go, current-work-go, README
NIVEL 2 — Plan y estado:   vantare-go-master-plan, current-plan, INDEX
NIVEL 3 — Reglas:           agent-workflow, go-review-checklist,
                            voice-contract, operations, manual-verification
NIVEL 4 — Arquitectura:     0001-prealpha-architecture,
                            spotter-geometry-findings, tts,
                            crewchief-parity, domain-model
NIVEL 5 — Auditorías:       crewchief-parity-audit (EVIDENCIA),
                            crewchief-parity-report (HISTÓRICO)
NIVEL 6 — Testing/producto:  prealpha-gate, lmu-telemetry,
                            spotter-bug-log, testing-strategy,
                            prealpha-next-steps
```

Regla de resolución: NIVEL 1/2 gana sobre NIVEL 4/5; auditoría no
sobreescribe plan maestro.

### B.2 Regla CC reforzada (no negociable)

Tres copias de la misma regla, con profundidad creciente:

- `README.md` § 3: definición de alto nivel, qué es una mini-auditoría
  y qué no la sustituye.
- `agent-workflow.md` § 4: operativa. Contenido obligatorio, cuándo
  no se puede usar, stop condition automático para el orquestador.
- `INDEX.md` § 5 + plan maestro § 13: tabla de filas LMU-01..48 con
  columna explícita "Mini-auditoría CrewChief" para cada fila que
  está en `GAP` o `NO_IMPLEMENTADO`.

Estados válidos para features de paridad (en `README.md` § 4):

`CONFIRMADO`, `PARCIAL`, `NO_VERIFICADO`, `NO_IMPLEMENTADO`, `GAP`,
`NOT_PORTED`, `HISTÓRICO`. Se prohíbe `MATCH` salvo evidencia fuerte.

### B.3 Defaults Locked corregidos contra fuente CC

Cambios en `vantare-go-master-plan.md` § 5:

- `battery_low_soc_pct`: `20.0` → `10.0`. CC `Battery.cs:77`
  `BatteryLowThreshold=10.0f`. LMU reusa `mFuel` como proxy de SOC
  según `RF2GameStateMapper.cs:1787`.
- `push_window_laps`: `3` → reglas por TrackLengthClass:
  `MEDIUM≤4`, `LONG≤2`, `VERY_LONG=1`. CC `PushNow.cs:96-98`.
- `push_window_time_s`: `240` → ventana `120 < remaining < 240`. CC
  `PushNow.cs:88`: `SessionTimeRemaining < 4*60 && > 2*60`.
- `minSpotterSpeedMPS`: marcado como decisión Vantare (default CC no
  verificable en este repo, requiere JSON de user settings).
- `session_start_delay_s=6.0`: marcado como decisión Vantare, no
  paridad CC directa (CC tiene `minSessionRunTimeForEndMessages=60s`
  que es un gate distinto en `SessionEndMessages.cs:33`).
- `tyre_wear_warn_pct=75.0`: confirmado y aclarado que CC usa 4
  umbrales per-wheel en `RF2GameStateMapper.cs:44-47`: `scrubbed=5`,
  `minor=20`, `major=50`, `wornOut=75`. 75% corresponde a `wornOut`
  (knackered), no a Worn.

### B.4 Matriz LMU-01..48 reescrita con evidencia

Antes: la matriz en `vantare-go-master-plan.md` § 13 usaba
`MATCH prealpha` para features que el código no tiene (ValidityRule,
IsMessageStillValid, minSpotterSpeedMPS, cmd/lmu-debug -jsonl,
fixtures persistentes). Usaba `❌ alpha X` sin columnas de evidencia.

Ahora: cada fila tiene estado real (`CONFIRMADO`, `PARCIAL`,
`NO_IMPLEMENTADO`, `GAP`, `NOT_PORTED`) y, para filas en `GAP`,
columna explícita "Mini-auditoría CrewChief" con archivo CC, función y
mecanismo. Los estados se sostienen en:

- `INDEX.md` § 5 con 17 filas verificables (paths Go + líneas y/o
  evidencia CC).
- `current-plan.md` § 2 con confirmación contra código y tests.
- `architecture/crewchief-parity.md` § 4-10 con secciones por feature.

### B.5 Paths inexistentes corregidos

| Path antiguo | Acción |
|---|---|
| `internal/spotter/` (en commands y paths) | Corregido a `internal/engineer/spotter/` en 6 docs |
| `internal/sim/lmu/` | Corregido a `internal/telemetry/lmu/` en 3 docs |
| `internal/core/runtime` | Corregido a `internal/engineer/core/runtime` |
| `internal/replay` standalone | Corregido a `internal/engineer/replay/` |
| `internal/simulator` standalone | Corregido a `internal/engineer/simulator/` |
| `internal/{tts,sim,config,persistence,cli,engineer/modules,engineer/commands}/` | Marcados como NO_IMPLEMENTADO con tabla de evidencia |
| `cmd/lmu-debug -jsonl` | Sustituido por `cmd/spotter-debug` en 7 docs |

### B.6 Cambios sin commit del worktree reconocidos

A 2026-06-27 el worktree tiene ~400 líneas modificadas y 3 archivos
nuevos sin commit:

- `vantare-v2/internal/engineer/lmu/parser.go` (parser experimental
  de geometría, sin Fuel/GamePhase/etc.).
- `vantare-v2/internal/engineer/service/engineer_service.go`
  (añadido `BufferProvider`, `dropCount`, rama `case "lmu"` con
  `OverlaysLiveAdapter`).
- `vantare-v2/internal/server/server.go` (añadido
  `/api/engineer/health`).

Reconocidos en:

- `INDEX.md` § 5 (estado real).
- `current-plan.md` § 2.2 (cambios sin commit como dato a auditar antes
  de aprobar nuevas tareas).
- `current-work-go.md` § 1 (aviso al orquestador).
- `prealpha-gate.md` § 1.7 (criterio nuevo "cambios sin commit
  auditados y reconciliados").

## C. Contradicciones importantes corregidas

| # | Contradicción detectada | Corrección |
|---|---|---|
| 1 | `cmd/lmu-debug -jsonl` citado como existente en 5 docs; el flag no existe en `cmd/lmu-debug/main.go`. | Sustituido por `cmd/spotter-debug` (binario nuevo, tarea P1.1 de `current-plan.md`). |
| 2 | Plan master decía `battery_low_soc_pct=20.0`; CC `Battery.cs:77` dice `10.0`. | Corregido a `10.0`. |
| 3 | Plan master decía `push_window_laps=3`; CC `PushNow.cs:96-98` define por TrackLengthClass. | Corregido a reglas por TrackLengthClass. |
| 4 | Plan master decía `push_window_time_s=240`; CC `PushNow.cs:88` define ventana `120<remaining<240`. | Corregido a ventana. |
| 5 | Plan master decía `minSessionParticipationTime=6s`; CC tiene `minSessionRunTimeForEndMessages=60s` que es un gate distinto. | Marcado como decisión Vantare no paridad, sin contradicción con CC. |
| 6 | Reporte previo (`crewchief-parity-report.md`) decía que la geometría X/Z del spotter estaba "Parcialmente implementado"; el código ya tenía la histéresis y el clear delay integrados. | Movido a CONFIRMADO en `spotter-geometry-findings.md` § 4. |
| 7 | Reporte previo decía "Vantare no lee Fuel/VehicleClass/Place/etc."; el parser público `internal/telemetry/lmu/parser.go` ya los lee desde 2026-06-15. | Marcado CONFIRMADO con líneas exactas (`parser.go:163,164,213,219,220,224,225,228`). |
| 8 | Reporte previo decía que el Player no interrumpe físicamente; `audio/player_windows.go:37-42` llama `stopLocked()`. | Marcado como PARCIAL (Player tiene kill; integración `queueLoop→Player.Play` NO_IMPLEMENTADO). |
| 9 | Auditoría 2026-06-27 proponía bajar `tyre_wear_warn_pct` a `30%`; CC `RF2GameStateMapper.cs:47` define `wornOutTyreWearPercent=75.0f`. | **No se aplica** esa corrección de la auditoría. Plan master mantiene `75%` con nota aclaratoria. |
| 10 | `architecture/0001-prealpha-architecture.md` describía paquetes `internal/tts`, `internal/sim`, `internal/config`, etc. como existentes; no existen en el worktree. | Marcados como NO_IMPLEMENTADO con tabla de evidencia por path. |
| 11 | `architecture/tts.md` se presenta como activo pero describe `internal/tts/*` que no existe. | Marcado HISTÓRICO/ASPIRACIONAL. |
| 12 | `architecture/crewchief-parity-report.md` describe paths y parser state inexistentes. | Marcado HISTÓRICO con cabecera que enumera los 7 errores principales. |
| 13 | `INDEX.md` declaraba "v1 escrito" para todos los docs sin distinguir canónico de histórico. | Reescrito con jerarquía de 6 niveles y tabla de estado real. |
| 14 | Varios docs usaban paths `go test ./internal/spotter`, `go test ./internal/sim/lmu`, etc. que no existen. | Corregidos en `testing-strategy.md`, `operations.md`, `manual-verification.md`, `lmu-telemetry.md`. |
| 15 | Plan master asumía que la matriz LMU-01..48 tenía `MATCH prealpha` para LMU-04/05/33/37 sin código que lo sostuviera. | Bajar a `PARCIAL` o `NO_IMPLEMENTADO` según evidencia. |

## D. Contradicciones que siguen abiertas

Estas no se han podido resolver en este pase (fuera de scope: son
trabajo de mini-auditoría específica o de captura live):

| # | Contradicción abierta | Por qué sigue abierta | Acción recomendada |
|---|---|---|---|
| 1 | Defaults exactos de `min_speed_for_spotter`, `spotter_clear_delay`, `spotter_overlap_delay` en CC. | El JSON de user settings no está en el repo fuente CC que tenemos disponible; defaults solo visibles en runtime. | Pendiente: capturar defaults desde binario CC en ejecución o revisar release notes. |
| 2 | Sub-strings vivos de `mLastHistoryMessage` en LMU real. | CC los lee de rF2; LMU podría emitir strings distintos. | Mini-auditoría LMU-13 con captura live en sesión LMU con penalty. |
| 3 | `mTicksLastHistoryMessageUpdated` en LMU. | No verificable sin captura live. | Mini-auditoría LMU-13 junto con (2). |
| 4 | `mPlayerPitStallLapDistance` en LMU. | LMU podría no exponerlo o exponerlo en otro offset. | Mini-auditoría LMU-16/17 con captura live. |
| 5 | `mElectricBatteryPercentage` separado en LMU vs proxy de `mFuel`. | CC reusa `mFuel`; LMU podría tener campo separado. | Mini-auditoría LMU-16 con captura live. |
| 6 | Per-class dimensions (LMP3, LMP2, GTE, GT3, HYPERCAR) en LMU. | LMU no expone explícitamente; `carClassData.json` lo cubre para rF2. | Pendiente alpha 2; comparar con LMU `vehicleClass` strings. |
| 7 | Funcionamiento del `engineer/lmu/parser.go` (sin commit) — compila o no. | LSP errors detectados al verificar (`undefined: vehicleTelemetryID` etc.). Constantes están en `internal/telemetry/lmu/offsets.go` y el parser engineer las reusa; falta `offsets.go` propio en engineer/lmu/. | Decisión del orquestador: mergear cambios sin commit (preferido para que los tests puedan ejecutarse) o revertir. |
| 8 | Forma final de `internal/engineer/modules/` (suite de módulos CC). | Plan master asume estructura `flags.go`, `penalties.go`, etc.; el paquete no existe. | Decisión arquitectónica cuando se empiece alpha 1. |
| 9 | Estructura del `internal/tts/` (Kokoro vs Edge vs Gemini). | No existe; el doc `tts.md` lo describe pero es aspiracional. | Decisión arquitectónica cuando se cree el paquete. |
| 10 | Forma final del `audio.Scheduler` (separado vs integrado en `queueLoop`). | El plan recomienda scheduler separado pero no decide. | Decisión de producto cuando se implemente la integración `Player.Play`. |

## E. Documentos que recomiendo archivar o fusionar

Recomendaciones **no ejecutadas** en este pase (el usuario decide):

### E.1 Archivar a `docs/historical/`

- `docs/engineer/architecture/crewchief-parity-report.md` → mover a
  `docs/historical/crewchief-parity-report-2026-06-27.md` cuando se
  confirme que el contenido histórico no se consulta. Conserva valor
  como antecedente de la auditoría 2026-06-27.
- `docs/proyecto/*` (12 archivos) → la documentación del proyecto V1
  Python. Sigue siendo histórico del trabajo previo al Go. No se ha
  tocado en este pase.
- `docs/plans/*` y `docs/superpowers/plans/*` → planes puntuales de
  sprints V1/V2 históricos. Algunos están en formatos previos a la
  convención actual. Considerar archivar los más viejos.

### E.2 Fusionar

- `docs/engineer/architecture/spotter-geometry-findings.md` y
  `docs/engineer/architecture/crewchief-parity.md` § 4 podrían
  fusionarse cuando la sección 1 de `crewchief-parity.md`
  (`Spotter Geometry`) absorba el contenido de
  `spotter-geometry-findings.md`. Pero el doc separado tiene valor
  histórico (explica por qué se corrigió la convención de signos)
  que se perdería. Recomendación: **no fusionar**, dejar ambos con
  referencias cruzadas.
- `docs/engineer/architecture/0001-prealpha-architecture.md` y
  `docs/engineer/vantare-go-master-plan.md` § 4, 8 podrían
  fusionarse (ambos describen la forma del monolito). Pero el ADR
  tiene valor histórico de decisión arquitectónica. Recomendación:
  **no fusionar**, mantener como ADR separado.

### E.3 Eliminar si están vacíos o son promesas incumplidas

- `docs/engineer/CHANGELOG.md` se mantiene con la entrada v1 y v1.1.
- `docs/proyecto/PROMPT-ORQUESTADOR.md` no se ha auditado.
- `docs/proyecto/README.md` no se ha auditado.

## F. Riesgos restantes

### F.1 Documentales

- **El worktree no tiene docs comiteados.** Todos los `docs/` y
  `docs/engineer/` son `??` untracked. La capa documental revisada
  en este pase vive en disco pero no en git. Antes de promover al
  repo canónico `C:\Users\isaac\Desktop\Vantare-Ingeniero-Go`,
  hacer commit coherente.
- **`docs/proyecto/*` no se ha auditado.** Contiene 13 docs del
  proyecto V1 que pueden tener afirmaciones obsoletas o contradictorias
  con los docs del paquete `engineer/`. Riesgo bajo porque están
  separados por scope.
- **`docs/superpowers/plans/*` no se ha auditado.** Contiene planes
  puntuales de sprints. Riesgo bajo.

### F.2 De coherencia con código

- **Cambios sin commit del worktree (~400 líneas).** Si se decide
  revertirlos, varios docs nuevos (`current-plan.md`,
  `master-plan-go.md`, `current-work-go.md`, `prealpha-gate.md`,
  `INDEX.md`) describen un estado que ya no existe. Riesgo medio:
  revertir cambios sin reescribir docs confundiría al siguiente
  agente.
- **`engineer/lmu/parser.go` tiene LSP errors** (constantes
  indefinidas). Si se commitea tal cual, no compila. Riesgo medio
  para compilación.

### F.3 De proceso

- **No hay prompt templates** (`prompts/worker-template.md`,
  `prompts/reviewer-template.md`) declarados como pendientes en
  `INDEX.md`. Sin plantillas, la regla CC reforzada en
  `agent-workflow.md` § 4 depende del orquestador copiando el texto
  a mano cada vez. Riesgo bajo: el texto está en el doc, se puede
  copiar.
- **No hay `changelog.md` separado para el paquete de docs** (lo que
  hay es `CHANGELOG.md`, OK). Riesgo bajo.

## G. Próximos pasos recomendados para el orquestador

### G.1 Inmediato (antes de aprobar cualquier tarea nueva)

1. **Decidir qué hacer con los cambios sin commit del worktree.**
   Opciones:
   - Mergearlos (preferido) → requiere arreglar el LSP errors del
     `engineer/lmu/parser.go` añadiendo `offsets.go` propio o
     importando del parser público.
   - Revertirlos → requeriría reescribir los docs nuevos para que
     reflejen el estado HEAD.
2. **Auditar y mergear el `INDEX.md` § 5** contra el código real
   después de tomar la decisión (1). Si se mergean los cambios,
   algunos items pueden pasar de "sin commit" a "CONFIRMADO".

### G.2 Corto plazo (1-2 sprints)

3. **Crear `cmd/spotter-debug`** (`current-plan.md` § 6 Tarea 1).
   Mini-auditoría: `spotter/debug.go:102` `WriteDebugRecordsJSONL` +
   flags `-hz`, `-out`, `-mock`, `-source={simulator,replay,lmu}`.
4. **Implementar `minSpotterSpeedMPS=10.0`** (`current-plan.md` § 6
   Tarea 2). Mini-auditoría:
   `NoisyCartesianCoordinateSpotter.cs:56,297`.
5. **Implementar `ValidityRule` + `Runtime.IsMessageStillValid`**
   (`current-plan.md` § 6 Tarea 3). Mini-auditoría:
   `QueuedMessage.cs` + `AbstractEvent.cs`.

### G.3 Medio plazo (3-4 sprints)

6. **Crear `internal/engineer/replay/testdata/`** con fixtures
   reproducibles (`current-plan.md` § 6 Tarea 4). No requiere
   mini-auditoría CC (es infra de tests).
7. **Integrar `Player.Play` en `queueLoop`** o crear `audio.Scheduler`
   (`current-plan.md` § 6 Tarea 5). Mini-auditoría:
   `AudioPlayer.cs:2026-2063` `playSpotterMessage`.

### G.4 Antes de alpha 1 (5-6 sprints)

8. **Capturar sesión LMU real** side-by-side con `cmd/spotter-debug`
   para validar comportamiento en pista. No automatizable desde
   agente; requiere sesión manual de Isaac.
9. **Resolver las 10 contradicciones abiertas** (sección D) con
   mini-auditorías específicas y/o captura live.

## H. Resumen de cumplimiento del criterio de aceptación

Un nuevo agente que lea la documentación puede ahora:

1. **Saber qué se está construyendo** → `vantare-go-master-plan.md`
   § 1 (Visión) + § 2 (Decisiones base).
2. **Saber cuál es el estado real** → `INDEX.md` § 5 (tabla
   CONFIRMADO/PARCIAL/NO_IMPLEMENTADO por feature) + `current-plan.md`
   § 2 (estado técnico con evidencia en código y tests).
3. **Saber qué documentos mandan** → `INDEX.md` § 2 (jerarquía de 6
   niveles) + § 8 (convención de versionado).
4. **Saber cómo se trabaja con workers** → `agent-workflow.md` (roles
   + flujo + plantilla + stop conditions + auditoría de review).
5. **Saber cómo se valida CrewChief** → `agent-workflow.md` § 4
   (regla CC con mini-auditoría obligatoria por feature) +
   `README.md` § 3 + `INDEX.md` § 5.
6. **Saber qué no se puede implementar sin auditoría previa** →
   `agent-workflow.md` § 4 + `README.md` § 3 + § 4 (estados válidos).
7. **Saber cuáles son las próximas tareas** → `current-work-go.md`
   (miniplan activo) + `current-plan.md` § 6 (5 tareas con detalle
   + mini-auditoría CC por tarea).

## I. Cambios no realizados (intencionalmente)

- **No tocar código Go, frontend, `go.mod`, `package.json`** —
  restricción explícita de la tarea. Verificado con `git status` y
  `git diff` antes y después del pase.
- **No hacer commit** — restricción explícita. Todos los docs siguen
  `??` untracked.
- **No auditar `voice-contract.md`, `domain-model.md`,
  `go-review-checklist.md`, `CHANGELOG.md` previo, ni los docs de
  V1 (`docs/proyecto/*`, `docs/plans/*`, `docs/superpowers/*`)** —
  fuera de scope declarado.
- **No eliminar archivos** — restricción explícita. Las
  recomendaciones de archivado están en § E como sugerencias para
  decisión del usuario.

---

**Fin del informe.** Cambios en disco, sin commit. El orquestador
decide cuándo promover al repo canónico y cuándo mergear los cambios
sin commit del worktree.
