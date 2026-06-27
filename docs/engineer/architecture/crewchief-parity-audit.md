# Auditoría 2 — CrewChiefV4 Paridad Real

> **Estado del documento:** **EVIDENCIA** desde 2026-06-27. **No es
> spec.** Su valor es mostrar el contraste entre los docs previos y
> el código/CC real. Para tomar decisiones de implementación, abrir
> la mini-auditoría específica por feature
> ([`agent-workflow.md`](../agent-workflow.md) § 4) y verificar contra
> código fuente de CC.

> **Fecha:** 2026-06-27.
> **Auditor:** ANALISTA TÉCNICO SENIOR (auditoría documental, no implementación).
> **Fuentes primarias:**
> - `docs/engineer/architecture/crewchief-parity-report.md` (informe a auditar).
> - `docs/engineer/architecture/crewchief-parity.md` (doc matriz LMU-01..48).
> - `docs/engineer/vantare-go-master-plan.md` §5 (defaults locked).
> - Código Vantare Go real bajo `vantare-v2/internal/`.
> - CrewChiefV4 fuente bajo `C:\Users\isaac\.gemini\antigravity\crewchief_src\CrewChiefV4\`.
>
> **Reglas de la auditoría:** ningún "MATCH" sin evidencia de test o código
> que lo sostenga; toda afirmación sin código se marca `NO CONFIRMADO` o
> `INCORRECTA`.

## Lectura segura de esta auditoría

- Lo que **corrige** sobre el informe previo está confirmado contra
  código real o fuente CC. Estas correcciones se han incorporado a
  `vantare-go-master-plan.md` § 5, 6 y 13.
- Lo que la auditoría propone como **corrección** debe leerse con
  cuidado: el propio documento contiene errores (ej. recomienda
  bajar `tyre_wear_warn_pct` a 30% cuando CC define
  `wornOutTyreWearPercent=75`). El orquestador ya ha corregido esas
  correcciones erróneas en la versión actual de
  `vantare-go-master-plan.md`.
- Las **filas de matriz LMU-01..48** en este doc son un punto de
  partida, no spec. La fuente de verdad del progreso es
  `vantare-go-master-plan.md` § 13.
- Las **mini-auditorías que la auditoría sugiere como P1/P2/P3** se
  han reorganizado en `current-plan.md` § 6 y
  `master-plan-go.md` § 4 (G0..G7). No se toman tal cual de aquí.

Si encuentras una contradicción entre este doc y
`vantare-go-master-plan.md` actual, gana el plan maestro.

---

## A. Veredicto ejecutivo

**Insuficiente y parcialmente incorrecto.**

El informe `crewchief-parity-report.md` da por sentado (con etiqueta `GAP` o
`MATCH`) varios componentes que **ya están implementados** en Go, y al
mismo tiempo da por implementado algo que **no existe** (la integración
`cmd/lmu-debug -jsonl`). La auditoría contra código real muestra que:

- 4 de 16 fichas describen estado desactualizado (1, 4, 6, 11).
- 2 de 16 fichas contradicen evidencia de Vantare (Feature 4 asume que el
  spotter no interrumpe físicamente; `audio/player_windows.go:37-42` ya
  lo hace).
- 9 de 16 fichas describen como `GAP` cosas que **son CC completas**, pero
  el "GAP" en Vantare es razonable: el módulo Go no existe.
- 1 ficha (Feature 14) tiene fórmula incorrecta: `LapTimes.cs:148` define
  `consistencyLimit=0.5f` pero la fórmula `consistencyRange =
  (lastButOneLap * 0.5) / 100` significa 0.5 **por ciento**, no "0.5%"
  ambiguo.

El informe **no audita** módulos críticos de CrewChief que faltan
explícitamente:

- `FrozenOrderMonitor.cs` y `FullCourseYellowPhase` enum.
- `DamageReporting.cs` con sus 5 componentes (engine/tranny/suspension/
  brakes/aero).
- `EngineMonitor.cs` (water/oil/pressure), `ConditionsMonitor.cs` (rain),
  `Battery.cs` con `BatteryLowThreshold=10.0%` y `BatteryLowLapsFactor=1.8`
  (incompatibles con el plan maestro que dice `battery_low_soc_pct=20.0`).
- `PitStops.cs` con `engage_limiter`/`disengage_limiter`,
  `one_hundred_metres`/`fifty_metres`/`box_now`, `PitStallOccupied`,
  `playerTimeLostForStop`.
- `OvertakingAidsMonitor.cs` (DRS/PTP) y `Penalties.cs` con su enum
  `PenatiesData.DetailedPenaltyCause`.
- `MulticlassWarnings.cs` con sus constantes
  `maxSeparateToBeConsideredFighting=30`,
  `timeBetweenOtherClassChecks=4s`,
  `timeToWaitForOtherClassWarningToSettle=6s`.
- `Position.cs` con `minTimeToWaitBeforeReportingPass=4s`,
  `maxSecondsToWaitBeforeReportingPass=7s`,
  `minTimeBetweenOvertakeMessages=20s`,
  `numberOfLapsInLastPlace>5`.
- `LapCounter.cs` con `GridSide`, `FrozenOrderColumn`, two-to-go / last-lap
  con ramas por `Place==1` y `Place<=3`.

Además, la tabla de telemetría del informe (sección 2.A) mezcla valores
"ausentes" con valores ya leídos por el parser público de widgets
(`internal/telemetry/lmu/parser.go`), y omite campos críticos que SÍ están
en el offset table pero que ningún parser engineer actual lee.

---

## B. Errores o afirmaciones prematuras del informe actual

### B.1 Falsa afirmación sobre `cmd/lmu-debug -jsonl`

| Campo | Valor |
|---|---|
| Documentos que lo afirman | `crewchief-parity.md` §7; `current-plan.md` líneas 22-23 y 79; `prealpha-gate.md` línea 73 |
| Evidencia CrewChief | N/A |
| Evidencia Vantare | `cmd/lmu-debug/main.go:23-27`: flags reales son solo `-once`, `-mock`, `-hz`. `-jsonl` no existe. `WriteDebugRecordsJSONL` en `internal/engineer/spotter/debug.go:102` existe pero nadie lo invoca desde CLI. |
| Veredicto | `INCORRECTA` |
| Corrección | Crear `cmd/spotter-debug` o añadir flag `-jsonl` a `cmd/lmu-debug` que invoque `WriteDebugRecordsJSONL` por frame. Hasta entonces, eliminar la línea del gate prealpha. |

### B.2 Falsa afirmación sobre `ValidityRule` en `audio.Message`

| Campo | Valor |
|---|---|
| Documentos que lo afirman | `crewchief-parity.md` §4 ("`ValidityRule` en `audio.Message` se valida vía `Runtime.IsMessageStillValid`"); `vantare-go-master-plan.md` §12 interfaz pública |
| Evidencia CrewChief | `QueuedMessage.cs` + `AbstractEvent.cs`: `isMessageStillValid(eventSubType, currentGameState, validationData)` se evalúa **antes de reproducir** y compara posición, penalizaciones, estado de pista. |
| Evidencia Vantare | `grep -r "ValidityRule\|Validity" vantare-v2/` → 0 coincidencias. `audio/Message` solo tiene `ID`, `TextKey`, `Text`, `Priority`, `CreatedAt`, `ExpiresAt` (`message.go:10-17`). `Runtime.IsMessageStillValid` no existe. |
| Veredicto | `INCORRECTA` |
| Corrección | Añadir `ValidityRule string` y `ValidationData map[string]any` a `audio.Message`, exponer `Runtime.IsMessageStillValid(msg, frame) bool` y llamarlo desde `Runtime.ProcessFrame` antes de `Enqueue`. |

### B.3 `minSpotterSpeedMPS` no implementado

| Campo | Valor |
|---|---|
| Documentos que lo afirman | `vantare-go-master-plan.md` §5.1 (default locked `10.0`); `spotter-geometry-findings.md` §"Filtros activos" (`Jugador < minSpotterSpeedMPS (10 m/s) gate global`); `crewchief-parity.md` §6 |
| Evidencia CrewChief | `RF2Spotter.cs:79` y `NoisyCartesianCoordinateSpotter.cs`: gate `currentGameState.PositionAndMotionData.CarSpeed > 5` y `minSpeed` configurable. |
| Evidencia Vantare | `grep -r "minSpotterSpeedMPS\|Speed\|MPS" internal/engineer/spotter/geometry.go` → 0. El `Classify` (líneas 47-147) NO consulta velocidad del jugador. |
| Veredicto | `NO CONFIRMADO` (en el código); sí documentado como locked default |
| Corrección | Implementar en `geometry.go`: `if frame.Player != nil && frame.Player.Speed < 10.0 { return nil }`. Crear test `TestClassify_PlayerBelowMinSpeed_NoZones`. |

### B.4 Falsa afirmación sobre Feature 1 (histéresis longitudinal)

| Campo | Valor |
|---|---|
| Informe | "**Estado en Vantare Go:** Parcialmente implementado... **Tarea:** Integrar histéresis longitudinal (`0.5m`) para clear y tolerancia extra trasera (`0.4m`)" |
| Evidencia Vantare | `internal/engineer/spotter/overlap.go:5-29` define literalmente `GapNeededForClearM=0.5` y `CarBehindExtraM=0.4` como defaults; `ClassifyAlignedOverlap` (líneas 31-69) los aplica cuando `existingOverlap=true` y cuando `aligned.Z > 0`. |
| Veredicto | `YA IMPLEMENTADA EN VANTARE` |
| Corrección | Cerrar la ficha. Eliminar la tarea. |

### B.5 Falsa afirmación sobre preemption en Feature 4

| Campo | Valor |
|---|---|
| Informe | "**Estado en Vantare Go:** **GAP**. La cola en Go reproduce audios de forma secuencial y no puede detener físicamente un clip en reproducción." |
| Evidencia Vantare | `internal/engineer/audio/player_windows.go:37-42`: `func (p *Player) Play(path string) error` llama `p.stopLocked()` al inicio, lo que mata el proceso PowerShell activo y espera `killTimeout=2s`. El player **sí interrumpe físicamente** clips en reproducción. |
| Evidencia CC | `AudioPlayer.cs:2055` `SoundCache.InterruptCurrentlyPlayingSound(false)` solo si `!lastSoundWasSpotter`; selectiva, no blanket. |
| Veredicto | `PARCIAL` (player tiene kill, pero `EngineerService.queueLoop` **no invoca** `Player.Play`; solo emite `EngineerNotification` al store) |
| Corrección | Es un gap distinto del que dice el informe: hay que **integrar** `Player.Play` en `queueLoop`. `queueLoop` debe pasar `TextKey → .mp3` resuelto por TTS cache y llamar `p.Play(path)`. |

### B.6 Falsa afirmación sobre Feature 6 (Penalties)

| Campo | Valor |
|---|---|
| Informe | "Vantare no lee el canal extendido de LMU ni realiza análisis sintáctico de strings" |
| Evidencia CrewChief | `RF2GameStateMapper.cs:2120-2268` lee `rF2Extended.mLastHistoryMessage` y `mTicksLastHistoryMessageUpdated`, hace match con sub-strings ("Stop/Go Penalty", "Drive-Thru") y descarta mensajes ignorados durante 5s con `timeHistoryMessageIgnored`. |
| Evidencia Vantare | `internal/engineer/lmu/parser.go` no toca Extended buffer; `internal/telemetry/lmu/parser.go` tampoco; `cmd/lmu-debug` solo abre `LMU_Data` (Telemetry+Scoring). |
| Veredicto | `CORRECTA` la afirmación del GAP, pero la ficha infravalora la complejidad: hay que **abrir `MM_EXTENDED_FILE_NAME = "$rFactor2SMMP_Extended$"`** como nuevo buffer (segundo reader, igual que `internal/telemetry/lmu/reader_windows.go`), no basta con un offset nuevo. |

### B.7 Feature 14: error de fórmula

| Campo | Valor |
|---|---|
| Informe | `consistencyRange = (LapTime × 0.5) / 100` con comentario "0.5% del tiempo de vuelta" |
| Evidencia CrewChief | `LapTimes.cs:148` `private Single consistencyLimit = 0.5f;` y línea 839-840: `consistencyRange = (lastButOneLap * consistencyLimit) / 100`. Es decir, `consistencyLimit` está en `Single` y se divide por 100 para pasarlo a fracción. La ficha lo invierte: dice "0.5%" cuando realmente la fórmula es `(LapTime * 0.5) / 100` = 0.005·LapTime. |
| Veredicto | `INCORRECTA` en la explicación |
| Corrección | Reescribir como: `consistencyRange = LapTime × 0.005` (es 0.5% del tiempo). Añadir la nota: `consistencyLimit` es un factor configurable en `UserSettings`, no necesariamente 0.5. |

### B.8 Gap declarado como `MATCH` que no existe

`crewchief-parity.md` §4: "Estado: MATCH prealpha con cancel de stale.
Interrupción de audio diferida a alpha 2."

| Campo | Valor |
|---|---|
| Evidencia Vantare | (a) `Runtime.IsMessageStillValid` **no existe**; (b) la única validación stale es por `ExpiresAt` en `audio.Queue.Next`; (c) la interrupción física sí existe en `Player.Play` pero no se invoca desde `queueLoop`. |
| Veredicto | `DOCS_TOO_OPTIMISTIC` |
| Corrección | Bajar la ficha a `PARTIAL` con tres gaps explícitos: ValidityRule, IsMessageStillValid, integración Player↔queueLoop. |

### B.9 Gap declarado como `MATCH` sobre replay fixtures

`crewchief-parity.md` §7: "Replay JSONL con fixtures
`left-basic/right-basic/three-wide/all-clear` bajo `internal/replay/testdata/`."

| Campo | Valor |
|---|---|
| Evidencia Vantare | `Get-ChildItem internal/engineer/replay -Recurse` solo devuelve `jsonl.go`, `jsonl_test.go`, `source.go`. **No hay directorio `testdata/`**. Los tests crean `os.CreateTemp("", "replay-test-*.jsonl")`. |
| Veredicto | `INCORRECTA` |
| Corrección | Crear `internal/engineer/replay/testdata/{left-basic,right-basic,three-wide,all-clear}.jsonl` con frames sintéticos generados por `simulator.Build(...)`. Cada fixture debe tener ≥5 frames para validar transiciones de estado. |

### B.10 Falsa arquitectura declarada

`0001-prealpha-architecture.md` declara:

> `internal/spotter/`, `internal/engineer`, `internal/audio`, `internal/tts`,
> `internal/replay`, `internal/sim/`, `internal/config/`, `internal/persistence/`,
> `internal/cli/`.

| Campo | Valor |
|---|---|
| Evidencia Vantare | `Get-ChildItem internal` solo tiene `app/`, `core/`, `engineer/`, `license/`, `ops/`, `server/`, `telemetry/`, `updater/`, `window/`. NO existen `tts/`, `config/`, `persistence/`, `cli/`, `sim/`. `spotter/` está dentro de `engineer/`, no en la raíz. `internal/engineer/modules/` no existe. |
| Veredicto | `DOCS_TOO_OPTIMISTIC` |

---

## C. Tabla de auditoría de las 16 fichas

| # | Feature | Veredicto | Problema | Evidencia CrewChief | Evidencia Vantare | Corrección recomendada |
|---|---|---|---|---|---|---|
| 1 | Spotter Hold/Clear/3-Wide | `PARCIAL` | Ficha dice "integrar histéresis 0.5m y 0.4m" — ya integrado. | `NoisyCartesianCoordinateSpotter.cs` (`gapNeededForClear`, `carBehindExtraLength`). | `spotter/overlap.go:5-29` `GapNeededForClearM=0.5`, `CarBehindExtraM=0.4`; `state.go:107-118` `scheduleClear` con `clearDelayMS=150`; tests en `state_test.go`. | Cerrar la tarea. Mover focus a `minSpotterSpeedMPS` (B.3) y `ValidityRule` (B.2). |
| 2 | Stacked Cars Check | `CORRECTA` (GAP confirmado) | No existe delta lateral entre oponentes en mismo lado. | `NoisyCartesianCoordinateSpotter.cs` líneas 600-650: `carsOnLeft > 1 && carsOnRight == 0` y `maxLateralSeparation - minLateralSeparation < carWidth`. | `geometry.go` no compara oponentes entre sí; `ActiveSides` solo cuenta presencia por lado. | Implementar segunda pasada en `ClassifyWithActiveSides`: trackear `minAlignedX`, `maxAlignedX` por lado; si `delta < carWidthM`, colapsar a 1 coche. Test: tres oponentes a izda en línea india no debe disparar `three_wide`. |
| 3 | Grid Side Math | `CORRECTA` (GAP confirmado) | No existe `gridSide` ni gate `GamePhase==Formation`. | `Spotter.cs:67-94` `getGridSideInternal` con umbral ±2m; `LapCounter.cs:96,608` `gridSide GridSide`. | `geometry.go` no consulta `GamePhase`; el parser engineer ni siquiera lee `GamePhase`. | Requiere primero que el parser engineer exponga `GamePhase` (P1). Después añadir gate en `Classify`. |
| 4 | Preemption Audio | `PARCIAL` | Player tiene `stopLocked()` pero `queueLoop` no lo invoca. | `AudioPlayer.cs:2055` `SoundCache.InterruptCurrentlyPlayingSound` solo si `!lastSoundWasSpotter`. | `audio/player_windows.go:37` llama `stopLocked` en cada `Play`; pero `service/engineer_service.go:400-449` no llama `Play`, solo emite `EngineerNotification`. | Integrar `Player.Play(textKey → cache.mp3)` en `queueLoop`. Crear `Player.PlaySpotter(path)` que también mate procesos en curso. |
| 5 | Auto-Verbosity | `CORRECTA` (GAP confirmado) | Sin verbosity dinámica. | `PlaybackModerator.cs:136-167`: umbrales 1.5s/1s/3s/2s por delta delante/detrás; `minPriorityForEachVerbosity{FULL=0, MED=5, LOW=10, SILENT=20}`. | No existe lógica de verbosity; `audio.Message.Priority` solo tiene `PriorityNormal=10, PrioritySpotter=100`. | Añadir `Verbosity` por nivel de tráfico al runtime y filtrar mensajes no críticos en `Runtime.ProcessFrame`. |
| 6 | Penalties parse | `CORRECTA` (GAP confirmado), pero subestima trabajo | Requiere abrir buffer `MM_EXTENDED`, no solo agregar offset. | `RF2GameStateMapper.cs:2120-2268` Extended buffer + `Penalties.cs` con enum `PenatiesData.DetailedPenaltyCause`. | `internal/engineer/lmu/parser.go` solo lee `LMU_Data`; `internal/telemetry/lmu/reader_windows.go` tampoco. | Crear `internal/engineer/lmu/extended_reader.go` para `MM_EXTENDED_FILE_NAME`. Mapear sub-strings con whitelist de mensajes. Cooldown 10s entre mensajes ignorados. |
| 7 | Fuel windowed | `CORRECTA` (GAP confirmado), fórmula del informe OK pero ventana NO es "3 fijas" | CC tiene ventana variable por track length class (1-5 laps). | `Fuel.cs:132-137` `fuelUseByLapsWindowLength{1..5}` por TrackLengthClass; `getConsumptionPerLap` retorna maxConsumption o averageUsagePerLap según FCY/oval. | `runtime.go` no modela combustible. | Implementar ventana móvil `[]float64` por clase de circuito y `lapsForLowFuelRun` por track length class. Tests con `FuelUsageStore` fake. |
| 8 | Pit Box Countdown | `CORRECTA` (GAP confirmado) | No se lee `mPlayerPitStallLapDistance` y el pit prediction usa heurística de "500m past start line". | `PitStops.cs` carpetas `mandatory_pit_stops/one_hundred_metres`/`fifty_metres`/`box_now`; `PitStallOccupied` bool; `Strategy.cs:120,1322` `playerPitBoxLapDistance` con tracking per-circuit. | Parser engineer no expone `PitStallOccupied` ni nada de pit prediction. | P1. Requiere también `PitInfo` buffer para confirmar stall. |
| 9 | Lap differentiated last-lap | `CORRECTA` (GAP confirmado) | Una sola rama "two_to_go" sin ramificar por `Place`. | `LapCounter.cs:514-535` ramas `Place==1`/`Place<=3`/resto. | `runtime.go` no evalúa `Place`. | P1. Requiere parser con `Place` (offset 199 en scoring, ya disponible). |
| 10 | Multiclass class speed | `CORRECTA` (GAP confirmado) | No hay tracking de `bestLap` por clase. | `MulticlassWarnings.cs:101,640-665` `bestTimesByClass` y comparación `bestClassLap < bestClassLapPlayer`. | No existe módulo. | P2. Requiere `VehicleClass` por scoring (offset 200, disponible). |
| 11 | Multiclass "fighting" | `CORRECTA` (GAP confirmado), umbral REAL es 30m no "30 metros" sin matiz | CC tiene `maxSeparateToBeConsideredFighting=30` además de slow zone end por track class. | `MulticlassWarnings.cs:172` `maxSeparateToBeConsideredFighting=30`. | Sin módulo. | P2. |
| 12 | Pit Exit prediction | `CORRECTA` (GAP confirmado) | Sin simulación de reincorporación. | `Strategy.cs:506-790` calcula `playerTimeLostForStop` y proyecta `expectedPlayerTimeLoss` con `bestLapTime`. | No existe. | P2. |
| 13 | Shared Pitbox | `CORRECTA` (GAP confirmado) | No lee `mPitGroup` (offset 480 en scoring). | `Strategy.cs:1344-1356` `checkIfOpponentSharesPlayerPitBox` con tolerancia 3m. | `internal/telemetry/lmu/offsets.go:77` define `vehicleScoringPitGroup=480` pero ningún parser lo lee. | P2. |
| 14 | Consistency analyser | `CORRECTA` (GAP confirmado), fórmula de la ficha es **incorrecta** | Sin ventana de 3 vueltas. | `LapTimes.cs:148,839-872` ventana variable por TrackLengthClass, `consistencyLimit=0.5%` (Single 0.5f / 100 = 0.005·LapTime). | Sin módulo. | P2. Reescribir fórmula en la ficha como `consistencyRange = LapTime × 0.005`. |
| 15 | Tyre monitor | `CORRECTA` (GAP confirmado) | No lee `mTyreWear`, `mTyreTemp`, `mBrakeTemp`. | `TyreMonitor.cs:285` `lapsIntoSessionBeforeTempMessage=2`; umbrales `Knackered>30%`, `Worn 15-30%`; `defaultTargetIODifference={3,6}`. | No existe. | P2. Requiere decodificar `LMUWheel` (260 bytes por rueda, 4 ruedas). |
| 16 | Battery/KERS | `PARCIAL` con datos incorrectos | CC **NO tiene `mElectricBatteryPercentage` separado** — reusa `mFuel` (línea 1786 RF2 mapper). El plan maestro dice `battery_low_soc_pct=20.0`, CC dice `BatteryLowThreshold=10.0` y `BatteryLowLapsFactor=1.8`. | `Battery.cs:77-80,394-403`. `RF2GameStateMapper.cs:1787` `cgs.BatteryData.BatteryPercentageLeft = (float)playerTelemetry.mFuel`. | No existe. | P2. Reconciliar defaults: bajar a `battery_low_soc_pct=10.0` o documentar que Vantare usa fuel como proxy de SOC en LMU. |

---

## D. Constantes y cooldowns extraídos (CrewChief real vs Vantare)

### D.1 Spotter (Vantare `overlap.go` y `state.go`)

| Constante | Valor CrewChief | Fuente | Valor Vantare | Estado |
|---|---|---|---|---|
| `TrackZoneToConsiderM` | `20.0f` | `NoisyCartesianCoordinateSpotter.cs` | `20.0` | `MATCH_CONFIRMED` |
| `CarLengthM` | `4.5f` (def. conservative) | idem | `4.5` (Normal); `4.8` Conservative; `4.2` Aggressive | `MATCH_CONFIRMED` con variantes por sensibilidad |
| `CarWidthM` | `1.8f` | idem | `1.8`; `1.6`/`2.0` por sens. | `MATCH_CONFIRMED` |
| `CarBehindExtraLength` | `0.4m` | idem | `CarBehindExtraM=0.4` | `MATCH_CONFIRMED` |
| `GapNeededForClear` | `0.5m` | idem | `GapNeededForClearM=0.5` | `MATCH_CONFIRMED` |
| `gridSide threshold` | `±2.0m` | `Spotter.cs:84-93` | n/a | `MISSING` (Feature 3) |
| `detectionHoldMS` | n/a en CC; concepto "min time over zone" | derivado | `350` | `PARTIAL_CONFIRMED` |
| `clearDelayMS` | 150ms implícito (`cancelPendingClear`) | CC flow | `150` | `PARTIAL_CONFIRMED` |
| `stillThereRepeatMS` | variable en CC (no constante) | implícito | `2500` | `PARTIAL` (decisión producto) |
| `messageExpiryMS` | variable en CC | depende de SoundType | `2000` | `PARTIAL` |
| `clearExpiryMS` | variable | depende | `2000` | `PARTIAL` |
| `minSpotterSpeedMPS` | CC `CarSpeed > 5` | `PlaybackModerator.cs:136` | n/a (FALTA) | `MISSING` |
| `minSessionRunTimeForEndMessages` | `60s` | `SessionEndMessages.cs:42` | n/a | `MISSING` |

### D.2 Race-control

| Constante | Valor CC | Fuente | Valor Vantare | Estado |
|---|---|---|---|---|
| FCY pause min | n/a directo (FCY en spotter via `paused=true`) | `Spotter.cs:42-55` | n/a | `MISSING` (LMU-40) |
| FCY pause max | 30s | plan maestro | n/a | `DOCS_TOO_OPTIMISTIC` |
| `fcyStatusReminderMinTime` | configurable (CC user setting) | `FlagsMonitor.cs:139` | n/a | `MISSING` |
| `maxFCYGetInvolvedInIncidentAttempts` | `5` | `FlagsMonitor.cs:161` | n/a | `MISSING` |
| `maxDistanceMovedForYellowAnnouncement` | configurable | `FlagsMonitor.cs:117` | n/a | `MISSING` |
| `minTimeBetweenNewYellowFlagMessages` | `10s` | `FlagsMonitor.cs:127` | n/a | `MISSING` |
| `minTimeBetweenGreenFlagLuckyDogMessages` | `2min` | `FlagsMonitor.cs:109` | n/a | `MISSING` |
| Penalty type detection | sub-string match sobre `mLastHistoryMessage` | `RF2GameStateMapper.cs:2126+` | n/a | `MISSING_BUFFER` (requiere Extended) |

### D.3 Core race

| Constante | Valor CC | Fuente | Valor Vantare | Estado |
|---|---|---|---|---|
| `consistencyLimit` | `0.5f` (Single → 0.5%) | `LapTimes.cs:148` | n/a | `MISSING` |
| `outlierPaceLimits[VERY_SHORT..VERY_LONG]` | `{2,2,3,8,15}` seg | `LapTimes.cs:189-194` | n/a | `MISSING` |
| `lapsBeforeAnnouncingGaps[...]` | `{4,3,2,1,0}` | `LapTimes.cs:198-203` | n/a | `MISSING` |
| `minLapsForTrackLengthClass[...]` | `{5,4,3,2,2}` | `MulticlassWarnings.cs:140-144` | n/a | `MISSING` |
| `minTimeForTrackLengthClass[...]` | `{60,90,120,210,390}s` | `MulticlassWarnings.cs:148-152` | n/a | `MISSING` |
| `fuelUseByLapsWindowLength[...]` | `{5,4,3,2,1}` | `Fuel.cs:132-137` | n/a | `MISSING` |
| `lapsForLowFuelRun` | `4f` (ajustado por class) | `Fuel.cs:210,370-377` | n/a | `MISSING` |
| `minTimeToBeInThisPosition` | `60s` | `PushNow.cs:38` | n/a | `MISSING` |
| `pushWindowLaps` por TrackLengthClass | `MEDIUM≤4, LONG≤2, VERY_LONG==1` | `PushNow.cs:96-98` | n/a | `MISSING` |
| `pushWindowTime` | `>2min && <4min` | `PushNow.cs:88` | n/a | `MISSING` |
| `gapAheadReportFrequency` | configurable (CC user setting) | `Timings.cs:55` | n/a | `MISSING` |

### D.4 Vehicle

| Constante | Valor CC | Fuente | Valor Vantare | Estado |
|---|---|---|---|---|
| `lapsIntoSessionBeforeTempMessage` | `2` | `TyreMonitor.cs:285` | n/a | `MISSING` |
| `defaultTargetIODifference` | `{3,6}` °C | `TyreMonitor.cs:240` | n/a | `MISSING` |
| `Knackered threshold` | `>30%` wear | `TyreMonitor.cs` carpetas | n/a (plan maestro dice 75% — **incorrecto**) | `DOCS_TOO_OPTIMISTIC` |
| `Worn threshold` | `15-30%` wear | idem | n/a | `MISSING` |
| `BatteryLowThreshold` | `10.0%` | `Battery.cs:77` | plan maestro dice 20% | `DOCS_TOO_OPTIMISTIC` |
| `BatteryCriticalThreshold` | `5.0%` | `Battery.cs:79` | n/a | `MISSING` |
| `BatteryLowLapsFactor` | `1.8` | `Battery.cs:78` | n/a | `MISSING` |
| `BatteryCriticaLapsFactor` | `0.8` | `Battery.cs:80` | n/a | `MISSING` |
| Major damage msg delay | `random(3,6)s` | `DamageReporting.cs:893` | n/a | `MISSING` |
| Major damage msg expiration | `delay+10s` | `DamageReporting.cs:894` | n/a | `MISSING` |
| Engine warning flags | `engineWaterTempWarning`, `engineOilPressureWarning` (bits) | `EngineData` flags | n/a | `MISSING_BUFFER` |

### D.5 Opponents / Position

| Constante | Valor CC | Fuente | Valor Vantare | Estado |
|---|---|---|---|---|
| `minTimeToWaitBeforeReportingPass` | `4s` | `Position.cs:26` | n/a | `MISSING` |
| `maxSecondsToWaitBeforeReportingPass` | `7s` | `Position.cs:27` | n/a | `MISSING` |
| `minTimeBetweenOvertakeMessages` | `20s` | `Position.cs:128` | n/a | `MISSING` |
| `minTimeDeltaForPassToBeCompleted` | `0.15s` | `Position.cs:83` | n/a | `MISSING` |
| `numberOfLapsInLastPlace` | `>5` | `Position.cs:590` | n/a | `MISSING` |
| `lapForPositionReminder` | `random(2,5)` | `Position.cs:107` | n/a | `MISSING` |
| `minTimeBetweenAttackOrDefendByDriver` | `3min` | `Timings.cs:128` | n/a | `MISSING` |
| `timeBetweenOtherClassChecks` | `4s` | `MulticlassWarnings.cs:90` | n/a | `MISSING` |
| `timeToWaitForOtherClassWarningToSettle` | `6s` | `MulticlassWarnings.cs:91` | n/a | `MISSING` |
| `maxSeparateToBeConsideredFighting` | `30m` | `MulticlassWarnings.cs:172` | n/a | `MISSING` |
| `slowerCarWarningZoneStart` | `-15m` | `MulticlassWarnings.cs:156` | n/a | `MISSING` |
| `fasterCarWarningZoneStartMin` | `100m` | `MulticlassWarnings.cs:165` | n/a | `MISSING` |
| `fasterCarWarningZoneEnd` | `15m` | `MulticlassWarnings.cs:169` | n/a | `MISSING` |
| `classSeparationAdjustment` | `10m` | `MulticlassWarnings.cs:23` | n/a | `MISSING` |
| `targetWarningTimeForFasterClassCar` | configurable (CC user setting) | `MulticlassWarnings.cs:27` | n/a | `MISSING` |

### D.6 Audio

| Constante | Valor CC | Fuente | Valor Vantare | Estado |
|---|---|---|---|---|
| Spotter priority | `20` | `AudioPlayer.cs:2032` | `PrioritySpotter=100` (incompatible con CC `minPriorityForEachVerbosity`) | `MISMATCH` |
| Regular priority | `10` | default | `PriorityNormal=10` | `MATCH_CONFIRMED` |
| Verbosity `{FULL, MED, LOW, SILENT}` | `{0, 5, 10, 20}` | `PlaybackModerator.cs:103-108` | n/a | `MISSING` |
| Spotter interrupt rule | `InterruptCurrentlyPlayingSound` si `!lastSoundWasSpotter` | `AudioPlayer.cs:2055` | `Player.Play` ya hace kill, pero selectivo no | `PARTIAL` |
| `pauseBetweenMessages` | configurable | `AudioPlayer.cs:79` | n/a (pero `Queue` no tiene pausa) | `MISSING` |
| `minTimeBetweenPearlsOfWisdom` | configurable | `AudioPlayer.cs:102` | n/a | `MISSING` |
| `maxTimeToHoldEmptyChannelOpen` | `spotter_hold_repeat_frequency + 1s` | `AudioPlayer.cs:96` | n/a | `MISSING` |
| `insertBeepOutBetweenSpotterAndChief` | configurable bool | `PlaybackModerator.cs:48` | n/a | `MISSING` (LMU-38) |

### D.7 Track length class (CrewChief)

| Clase | m | Comentario |
|---|---|---|
| `VERY_SHORT` | `<1000` | LMU no entra aquí (Spa ~7km, Monza ~5.8km, Le Mans ~13.6km) |
| `SHORT` | `<2400` | Idem |
| `MEDIUM` | `2400–10000` | Monza, Spa, Barcelona |
| `LONG` | `10000–20000` | Le Mans, Nürburgring Nordschleife |
| `VERY_LONG` | `>20000` | Nordschleife 24h combo |

(`TrackData.cs:1009-1028`). Vantare **no clasifica** por longitud de
circuito; todas las constantes globales del plan maestro asumen
"medium" implícito. Necesario para fuel window, lapsBeforeAnnouncingGaps,
outlierPaceLimits, etc.

---

## E. Data mapping LMU/rF2 — buffers y campos

Buffers rF2/LMU que CC conecta:

| Buffer | Nombre CC | ¿Existe en Vantare? | ¿Leído? |
|---|---|---|---|
| Telemetry | `$rFactor2SMMP_Telemetry$` | sí (`internal/telemetry/lmu/reader_windows.go`) | sí, parcialmente por `internal/telemetry/lmu/parser.go`; muy poco por `internal/engineer/lmu/parser.go` |
| Scoring | `$rFactor2SMMP_Scoring$` | sí (en el mismo buffer unificado) | sí por `internal/telemetry/lmu/parser.go`; muy poco por engineer parser |
| Extended | `$rFactor2SMMP_Extended$` | **no** | **no** |
| PitInfo | `$rFactor2SMMP_PitInfo$` | **no** | **no** |
| Rules | `$rFactor2SMMP_Rules$` | **no** | **no** |
| Weather | `$rFactor2SMMP_Weather$` | **no** | **no** |
| HWControl | `$rFactor2SMMP_HWControl$` | **no** | **no** (P3) |
| ForceFeedback | `$rFactor2SMMP_ForceFeedback$` | **no** | **no** |

REST API LMU en `:6397` existe y Vantare tiene `cmd/lmu-api-probe`. CC NO usa REST para Pit Menu, usa `MM_HWCONTROL`. Ambos enfoques son válidos; documentar cuál se elige.

### E.1 Campos disponibles — scoring (offset table de `internal/telemetry/lmu/offsets.go`)

| Campo CC | Offset LMU | Estado widgets | Estado engineer |
|---|---|---|---|
| `mGamePhase` | 1740 | `AVAILABLE` (`ParseSession` lo lee) | `MISSING_PARSED_FOR_ENGINEER` |
| `mYellowFlagState` | sbyte (offset no en tabla) | `UNKNOWN` | `MISSING_OFFSET` |
| `mSectorFlag[3]` | sbyte[3] (no en tabla) | `UNKNOWN` | `MISSING_OFFSET` |
| `mInRealtime` | 1747 (`mInRealtimeFC`) | `AVAILABLE` no | `MISSING_PARSED_FOR_ENGINEER` |
| `mNumPenalties` | 194 (per-vehicle) | `PARSED_FOR_WIDGETS_ONLY` (`Penalties` int32) | `MISSING_PARSED_FOR_ENGINEER` |
| `mPitGroup` (per-vehicle) | 480 | `MISSING_BUFFER` (offset existe en tabla pero no se lee) | `MISSING_PARSED_FOR_ENGINEER` |
| `mPitStallOccupied` (per-vehicle) | `PitState==3/4` (StopInProgress) | `PARSED_FOR_WIDGETS_ONLY` (vía `PitState`) | `MISSING_PARSED_FOR_ENGINEER` |
| `mPlayerPitStallLapDistance` | n/a en mmap público | `MISSING_BUFFER` (en CC viene vía scoring/track) | `MISSING_BUFFER` |
| `mPlace` (per-vehicle) | 199 | `PARSED_FOR_WIDGETS_ONLY` | `MISSING_PARSED_FOR_ENGINEER` |
| `mBestLapTime` | 144 | `PARSED_FOR_WIDGETS_ONLY` | `MISSING_PARSED_FOR_ENGINEER` |
| `mLastLapTime` | 168 | `PARSED_FOR_WIDGETS_ONLY` | `MISSING_PARSED_FOR_ENGINEER` |
| `mTimeBehindLeader` | 244 | `PARSED_FOR_WIDGETS_ONLY` | `MISSING_PARSED_FOR_ENGINEER` |
| `mTimeBehindNext` | 232 | `PARSED_FOR_WIDGETS_ONLY` | `MISSING_PARSED_FOR_ENGINEER` |
| `mVehicleClass` | 200 | `PARSED_FOR_WIDGETS_ONLY` | `MISSING_PARSED_FOR_ENGINEER` |
| `mLapDistance` | 104 | `PARSED_FOR_WIDGETS_ONLY` | `PARSED_FOR_ENGINEER` (en `parseVehicleEngineerScoring`) |

### E.2 Campos disponibles — telemetría (offset table de `internal/telemetry/lmu/offsets.go`)

| Campo CC | Offset LMU | Estado widgets | Estado engineer |
|---|---|---|---|
| `mFuel` | 524 | `PARSED_FOR_WIDGETS_ONLY` | `MISSING_PARSED_FOR_ENGINEER` (engineer parser no lo lee) |
| `mFuelCapacity` | 608 | `PARSED_FOR_WIDGETS_ONLY` | `MISSING_PARSED_FOR_ENGINEER` |
| `mEngineWaterTemp` | 285 (per-vehicle, en `LMUVehicleTelemetry`) | `UNKNOWN` (no en tabla) | `MISSING_OFFSET` |
| `mEngineOilTemp` | 286 | `UNKNOWN` | `MISSING_OFFSET` |
| `mEngineOilPressure` | n/a | `UNKNOWN` | `MISSING_OFFSET` |
| `mElectricBatteryPercentage` | **no existe en rF2/LMU** — CC reusa `mFuel` | n/a | n/a (revisar B.16) |
| `mPos` (player) | 160 | `AVAILABLE` | `PARSED_FOR_ENGINEER` |
| `mOri` (player) | 232 | `AVAILABLE` | `PARSED_FOR_ENGINEER` |
| `mLocalVel` (player) | 184 | `AVAILABLE` | `PARSED_FOR_ENGINEER` |
| `mScheduledStops` | 317 | `UNKNOWN` (no en tabla) | `MISSING_OFFSET` |
| `mSpeedLimiter` | 330 | `UNKNOWN` | `MISSING_OFFSET` |
| `mGear` | 283 | `AVAILABLE` | `MISSING_PARSED_FOR_ENGINEER` |
| `mEngineRPM` | 284 | `AVAILABLE` | `MISSING_PARSED_FOR_ENGINEER` |
| `mRearFlapActivated` | 336 (DRS) | `UNKNOWN` | `MISSING_OFFSET` |
| `mOvertakingAids` (custom LMU) | n/a directo | `MISSING_BUFFER` | `MISSING_BUFFER` |

### E.3 Ruedas — `LMUWheel` (260 bytes × 4)

| Campo CC | Offset dentro de wheel | Estado engineer |
|---|---|---|
| `mWear` (0.0–1.0) | ~235 | `MISSING_OFFSET` (no en tabla engineer) |
| `mPressure` (kPa) | ~232 | `MISSING_OFFSET` |
| `mBrakeTemp` (°C) | ~218 | `MISSING_OFFSET` |
| `mTireCarcassTemperature` (K) | ~247 | `MISSING_OFFSET` |
| `mSurfaceType` (0=dry, 1=wet, 2=grass…) | ~239 | `MISSING_OFFSET` |
| `mFlat` | ~239 (desplazamiento) | `MISSING_OFFSET` |
| `mDetached` | ~239 | `MISSING_OFFSET` |

La tabla pública de Vantare **no incluye** offsets de rueda. Hay que
generarlos con `tools/generate-lmu-offsets.py` (citado en
`testing/lmu-telemetry.md` §"Generador de offsets").

### E.4 Extended buffer (`MM_EXTENDED`)

| Campo | Estado |
|---|---|
| `mInRealtimeFC` | `MISSING_BUFFER` (no leemos Extended) |
| `mLastHistoryMessage[128]` | `MISSING_BUFFER` |
| `mTicksLastHistoryMessageUpdated` | `MISSING_BUFFER` |
| `mPhysics.mFuelMult` | `MISSING_BUFFER` (CC lo usa para `FuelUseActive`/`BatteryUseActive`) |
| `mRules.mTrackRulesParticipant` | `MISSING_BUFFER` |

### E.5 PitInfo buffer (`MM_PITINFO`)

| Campo | Estado |
|---|---|
| `rF2PitMenu.mPitMneu` (categorías y opciones) | `MISSING_BUFFER` |
| `mPitGroup` actualizado | `MISSING_BUFFER` |
| `mPitStopActive` | `MISSING_BUFFER` |

---

## F. Matriz LMU-01..48 corregida

Comparo el estado actual del master plan contra la evidencia real de
esta auditoría.

| LMU ID | Tópico | Estado doc actual | Estado recomendado | Motivo | Evidencia |
|---|---|---|---|---|---|
| 01 | Spotter lateral | MATCH | `MATCH_CONFIRMED` | `geometry.go` usa CC X/Z y ActiveSides | tests `geometry_test.go` |
| 02 | Spotter clear + 3-wide | MATCH | `MATCH_CONFIRMED` | `state.go:scheduleClear` con clearDelayMS | tests `state_test.go` |
| 03 | Spotter still-there | MATCH | `MATCH_CONFIRMED` | `state.go:260-261` `stillThereRepeatMS=2500` | tests |
| 04 | Pit limiter entrada | MATCH prealpha | `PARTIAL_CONFIRMED` (gate falta en geometry.go) | `SpeedLimiter` no se lee en engineer parser | B.3 |
| 05 | Pit limiter salida | MATCH prealpha | `PARTIAL_CONFIRMED` | idem LMU-04 | idem |
| 06 | Fuel básico remaining | ❌ alpha 1 | `PARTIAL_CONFIRMED` (parser público ya lo lee) | `internal/telemetry/lmu/parser.go:163-164` lee Fuel+Cap; falta reexponer en engineer | `parser.go` widget |
| 07 | Frozen order | ❌ alpha 1 | `MISSING` | `FrozenOrderMonitor.cs` con `FrozenOrderColumn` y `FrozenOrderPhase` enums | `FrozenOrderMonitor.cs:24-72` |
| 08 | Last lap | ❌ alpha 1 | `MISSING` | `LapCounter.cs:514-535` con ramas por Place | idem |
| 09 | Damage 5 componentes | ❌ alpha 1, PARTIAL LMU | `MISSING` | `DamageReporting.cs:76-78` con 5 componentes | Damage reporting |
| 10 | Timings / gaps | ❌ alpha 1 | `MISSING` | `Timings.cs:55-58` configurable `frequency_of_gap_*_reports`; no es "cada 5 vueltas" como sugiere plan | `Timings.cs` |
| 11 | Tyre temps | ❌ alpha 2 | `MISSING` | `TyreMonitor.cs:240,285` lapsIntoSession=2, IODiff={3,6} | idem |
| 12 | Multiclass warnings | ❌ alpha 2 | `MISSING` | `MulticlassWarnings.cs:23,90-91,172` con cooldowns específicos | idem |
| 13 | Penalty type (DT/SG) | ❌ alpha 1, PARTIAL mNumPenalties | `MISSING` (no solo por número) | `Penalties.cs:18,34-39` carpetas por tipo + `DetailedPenaltyCause` enum | idem |
| 14 | Fuel crítico + persistencia | ❌ alpha 2 | `MISSING` | ventana móvil + `FuelUsageStore` | Fuel |
| 15 | FCY/flags | ❌ alpha 1 | `MISSING` | `FlagsMonitor.cs:31-49` carpetas EU/US FCY + 6 fases | idem |
| 16 | Pit window open/closing | ❌ alpha 1 | `MISSING` | `PitStops.cs:23-54` carpetas `pit_window_*` | idem |
| 17 | Pit entry/exit | ❌ alpha 1 | `MISSING` | `PitStops.cs:60-90,87-90` carpetas `engage_limiter`/`disengage_limiter`/`one_hundred_metres`/`fifty_metres`/`box_now` | idem |
| 18 | Tyre wear | ❌ alpha 2 | `MISSING` (plan dice 75%, CC dice 30%) | `TyreMonitor.cs` carpetas `knackered_*`/`worn_*` con umbral 30%/15% | B.16 |
| 19 | Push now (undercut) | ❌ alpha 1 | `MISSING` | `PushNow.cs:38,88,96-98` | idem |
| 20 | Position overtake/lost | ❌ alpha 1 | `MISSING` | `Position.cs:26-29,128` | idem |
| 21 | Lap counter announce | ❌ alpha 1 | `MISSING` | `LapCounter.cs:514-535` | idem |
| 22 | Lap time messages | ❌ alpha 1 | `MISSING` | `LapTimes.cs:148,839-872` | idem |
| 23 | Session laps remaining | ❌ alpha 1 | `MISSING` | `LapCounter.cs:514` ya implementado en CC, falta Vantare | idem |
| 24 | Pearls of wisdom | ❌ alpha 2 | `MISSING` | `PearlsOfWisdom.cs:11` + `Position.cs:499-563` ligan pearls a posición | idem |
| 25 | Driver stint countdown | ❌ alpha 2, PARTIAL | `MISSING` | `DriverSwaps.cs` no audita `driver_stint_seconds_remaining`; LMU no expone directamente | requiere REST LMU + `mNumStops` |
| 26 | Opponent pit/pos | ❌ alpha 2 | `MISSING` | `Opponents.cs:462-475,1100-1202` con deltas | idem |
| 27 | Standing position messages | ❌ alpha 1 | `MISSING` | `Position.cs:14-22` carpetas leading/pole/last | idem |
| 28 | Session end messages | ❌ alpha 1 | `MISSING` | `SessionEndMessages.cs:18-29,42` carpetas con `minSessionRunTimeForEndMessages=60` | idem |
| 29 | Engine temp warnings | ❌ alpha 2, PARTIAL water/oil sin pressure | `MISSING` (faltan offsets de EngineTelemetry) | `EngineMonitor.cs:208-210` | E.2 |
| 30 | Weather / conditions | ❌ alpha 1 | `MISSING` | `ConditionsMonitor.cs:79-99` carpetas light/mid/heavy rain + forecast | idem |
| 31 | Sector delta reports | ❌ alpha 1 | `MISSING` | `LapTimes.cs:14` `frequencyOfRaceSectorDeltaReports` configurable | idem |
| 32 | Sector splits nativos | ❌ alpha 1 | `MISSING` | `mCurrentSectorTime1/2` offset 176/184 (no en tabla engineer) | offsets.go |
| 33 | Sub-100ms critical latency | MATCH prealpha, PARTIAL TTS+network | `PARTIAL_CONFIRMED` (TTS aún stub) | edge_tts real, Kokoro no instalado | `TTSCacheCount=0` en `getStatusLocked` |
| 34 | Watched opponents | ❌ alpha 2 | `MISSING` | `WatchedOpponents.cs:74` con tracking por sector/clase/tires | idem |
| 35 | PTT command catalog ≥80% | ❌ alpha 3 | `MISSING` | `CommandManager.cs` + `SpeechCommands.cs` con 80+ tools | idem |
| 36 | Grid side @ race start | ❌ alpha 1 | `MISSING` | `Spotter.cs:67-94` con threshold ±2m | B.4 |
| 37 | WAV SoundCache | MATCH prealpha, PARTIAL TTS | `MATCH_CONFIRMED` (TTS vía .mp3) | edge_tts + cache | infra |
| 38 | Beeps (radio) | ❌ alpha 3 | `MISSING` | `PlaybackModerator.cs:48,427-489` InjectBeepOutIn + alternate bleeps | idem |
| 39 | Background ambiance | NOT_PORTED | `NOT_PORTED` | idem | OK |
| 40 | FCY spotter pause 10-30s | ❌ alpha 1 | `MISSING` (sin `paused/unpause`) | `Spotter.cs:42-55` `pause()` / `unpause()` | idem |
| 41 | Per-class message packs | NOT_PORTED | `NOT_PORTED` | idem | OK |
| 42 | NumberReading | ❌ beta | `MISSING` | `NumberReaderEn.cs`, `NumberReaderEs.cs` (no en repo CC; auditar) | investigar |
| 43 | Subtitle overlay | NOT_PORTED | `NOT_PORTED` | idem | OK |
| 44 | Perla/filtro per-class | NOT_PORTED | `NOT_PORTED` | idem | OK |
| 45 | Fuel usage persistence | ❌ alpha 2 | `MISSING` | `FuelUsageStore` (CC) persiste por circuito | idem |
| 46 | NumberReader multi-idioma | ❌ beta | `MISSING` | idem LMU-42 | idem |
| 47 | minSessionParticipationTime 6s | ❌ alpha 1 | `MISSING` (plan dice 6s, no auditado contra CC) | `minSessionRunTimeForEndMessages=60s` en `SessionEndMessages.cs:42`. **Discrepancia**: plan maestro dice 6s, CC dice 60s. Probablemente plan confundió dos constantes distintas. | idem + B.6 |
| 48 | Pit menu write | ❌ alpha 3 | `MISSING` (canal de write no decidido: REST vs HWControl mmap) | `PitMenuAPI.cs` usa `rF2HWControl` mmap; LMU expone REST `:6397`. Plan maestro dice REST. | `cmd/lmu-api-probe/main.go` confirma REST |

---

## G. Plan priorizado

### P0 — Corregir documentación falsa (1 mini-tarea de docs)

**Objetivo:** que el `current-plan.md`, `prealpha-gate.md` y
`crewchief-parity.md` reflejen realidad, para que los workers no trabajen
sobre ficción.

**Fuentes:** todas las del informe (este documento).

**Tareas:**

1. Eliminar de `current-plan.md` y `prealpha-gate.md` cualquier referencia
   a `cmd/lmu-debug -jsonl` como si existiera; documentar el flag como
   pendiente de P1.
2. Bajar `LMU-01..02 MATCH` solo si `minSpotterSpeedMPS` y `ValidityRule`
   siguen faltando (status `PARTIAL_CONFIRMED`).
3. Reconciliar en `vantare-go-master-plan.md`:
   - `battery_low_soc_pct=20.0` → `10.0` (alineado con CC `BatteryLowThreshold`).
   - `tyre_wear_warn_pct=75.0` → `30.0` (CC `knackered`).
   - `push_window_laps=3` → reglas por TrackLengthClass.
   - `push_window_time_s=240` → `<240s && >120s` (CC `SessionTimeRemaining < 4*60 && > 2*60`).
   - `minSessionParticipationTime=6s` → investigar; CC no tiene un único
     "6s" sino `minSessionRunTimeForEndMessages=60s`. Probablemente plan
     maestro confundió dos constantes.
4. Crear `docs/engineer/architecture/crewchief-parity-audit.md` (este
   mismo informe) como evidencia.
5. Reemplazar el árbol de paquetes de `0001-prealpha-architecture.md`
   para reflejar que `spotter/` está en `internal/engineer/spotter/` y
   que `tts/`, `config/`, `persistence/`, `cli/`, `sim/`, `modules/` aún
   no existen.

**Criterio de aceptación:** los 4 documentos editados pasan `git diff
--check` y la línea `-jsonl` desaparece de los ejemplos de comando.

### P1 — Cerrar prealpha spotter real (3 tareas pequeñas)

**Objetivo:** que `prealpha-gate.md` pase sin trampas.

**Fuentes:** `spotter/geometry.go`, `spotter/state.go`,
`audio/player_windows.go`, `cmd/lmu-debug/main.go`,
`internal/engineer/lmu/parser.go`.

**Tarea P1.1 — Speed gate + ValidityRule + integración Player↔queueLoop**

- **Archivos:** `internal/engineer/spotter/geometry.go` (speed gate);
  `internal/engineer/audio/message.go` (añadir `ValidityRule` y
  `ValidationData`); `internal/engineer/core/runtime.go`
  (`IsMessageStillValid`); `internal/engineer/service/engineer_service.go`
  (integrar `audio.Player.Play` en `queueLoop`).
- **Tests obligatorios:**
  - `TestClassify_PlayerBelowMinSpeed_NoZones`
  - `TestRuntime_IsMessageStillValid_SideMismatch`
  - `TestEngineerService_QueueLoopPlaysAudio`
- **Datos requeridos:** ya están en `engineer/telemetry/model.go`
  (`PlayerTelemetry.Speed`).
- **Criterio de aceptación:** un frame spotter con `Speed=0` no produce
  ningún evento; un mensaje spotter encolado con `ValidityRule=ActiveLeft`
  no se reproduce si el `ActiveSides.Left=false` al momento del drain.

**Tarea P1.2 — `cmd/spotter-debug` con export JSONL real**

- **Archivos:** nuevo `cmd/spotter-debug/main.go` que use
  `WriteDebugRecordsJSONL` por frame, con flags `-hz`, `-out`,
  `-mock`, `-source={simulator,replay,lmu}`.
- **Tests obligatorios:** `TestSpotterDebug_CLI_ProducesValidJSONL`.
- **Datos:** mismos que `lmu-debug`.
- **Criterio de aceptación:** ejecutar `go run ./cmd/spotter-debug -mock -out out.jsonl`
  produce ≥1 línea por frame con campos `alignedX/alignedZ/side/inOverlap/rejectReason`.

**Tarea P1.3 — Fixtures replay persistentes**

- **Archivos:** `internal/engineer/replay/testdata/{left-basic,
  right-basic, three-wide, all-clear}.jsonl`. Generar con
  `simulator.Build` ≥5 frames cada uno.
- **Tests obligatorios:** uno por fixture que valida la transición de
  estado esperada.
- **Criterio de aceptación:** `go test ./internal/engineer/replay -v` los
  carga desde disco y verifica `Machine.Process` emite los eventos
  esperados.

### P2 — Alpha 1 CrewChief core (suite race-control + core race)

**Objetivo:** implementar los módulos mínimos para llegar al 50% de
matriz LMU-01..48.

**Tarea P2.1 — Parser engineer extendido (game-phase, fuel, position)**

- **Archivos:** `internal/engineer/lmu/parser.go` y
  `internal/engineer/lmu/offsets.go`. Añadir constantes y leer:
  `mGamePhase`, `mInRealtime`, `mFuel`, `mFuelCapacity`, `mPlace`,
  `mBestLapTime`, `mLastLapTime`, `mTimeBehindLeader`,
  `mTimeBehindNext`, `mVehicleClass`, `mNumPenalties`,
  `mCurrentSector`, `mPitGroup`, `mPitStallOccupied`,
  `mYellowFlagState`, `mSectorFlag[3]`.
- **Tests:** fixtures con bytes crípticos en `parser_test.go`.
- **Criterio de aceptación:** cada campo nuevo tiene test que lee y
  decodifica correctamente desde el buffer.

**Tarea P2.2 — Buffer Extended para Penalties y FuelUseActive**

- **Archivos:** nuevo `internal/engineer/lmu/extended_reader.go`
  (paralelo a `internal/telemetry/lmu/reader_windows.go`);
  `internal/engineer/lmu/extended_offsets.go`.
- **Tests:** sintéticos; uno por sub-string match ("Stop/Go Penalty",
  "Drive-Thru", "Cut Track").
- **Criterio de aceptación:** un string sintético en
  `mLastHistoryMessage` se traduce a un evento `penalty_new_*` en el
  bus.

**Tarea P2.3 — Módulos deterministas**

Crear `internal/engineer/modules/{flags,penalties,damage,fuel,laps,
lap_times,multiclass,frozen_order,push_now,strategy,session_end,
position}.go`. Cada módulo implementa:

```go
type Module interface {
    Evaluate(ctx *core.FrameContext) []audio.Message
    Reset()
}
```

Cada módulo debe tener:

- `Evaluate` que consulta `FrameContext.Current` (parsed en P2.1) y
  devuelve mensajes con `Priority`, `ExpiresAt`, `ValidityRule`,
  `TextKey` apuntando al catálogo ES.
- `Reset` para fin de sesión.
- Tests table-driven por umbral.

Cobertura mínima:

- **Fuel**: ventana móvil configurable; `lapsForLowFuelRun` por track length
  class; dispara `fuel/laps_remaining` cuando `estimatedFuelLapsLeft <= 4`.
- **LapTimes**: `consistencyRange = lapTime × 0.005`; dispara
  `lap_times/consistent|improving|worsening` con cooldown 5s.
- **LapCounter**: ramas `Place==1`/`Place<=3`/resto a `SessionLapsRemaining==2` y `==1`.
- **FlagsMonitor**: switch por `mYellowFlagState` a `FolderFCYellow*`
  (EU/US configurable). Implementar `paused/unpause` en spotter.
- **Penalties**: traduce tipos a carpetas CC; cooldown 10s entre
  mensajes.
- **PushNow**: `minTimeToBeInThisPosition=60s`; ramas por
  TrackLengthClass.

**Criterio de aceptación:** `go test ./internal/engineer/...` cubre
≥80% de los módulos con tests sintéticos; suite evalúa a 20 Hz (no
batch).

### P3 — Alpha 2/3 (vehicle, opponents, pit manager, commands)

**Tarea P3.1 — TyreMonitor + EngineMonitor + Battery**

- Decodificar `LMUWheel` (260 bytes × 4) en
  `internal/engineer/lmu/wheel_offsets.go`.
- Implementar `TyreMonitor` con umbrales `Knackered>30%`, `Worn 15-30%`,
  `lapsIntoSessionBeforeTempMessage=2`, `defaultTargetIODifference={3,6}`.
- Implementar `EngineMonitor` con `mEngineWaterTemp`/`mEngineOilTemp`
  y warning flags (`mOverheating`).
- Implementar `Battery` reutilizando `mFuel` como proxy de SOC (con
  umbrales CC `LowThreshold=10`, `CriticalThreshold=5`, `LowLapsFactor=1.8`).

**Tarea P3.2 — Opponents + WatchedOpponents + PearlsOfWisdom**

- `OpponentMessages` con cooldown configurable (similar a CC
  `minTimeBetweenAttackOrDefendByDriver=3min`).
- `MulticlassWarnings` con `timeBetweenOtherClassChecks=4s`,
  `timeToWaitForOtherClassWarningToSettle=6s`,
  `maxSeparateToBeConsideredFighting=30m`.
- `Position` con `minTimeToWaitBeforeReportingPass=4s`,
  `maxSecondsToWaitBeforeReportingPass=7s`,
  `minTimeBetweenOvertakeMessages=20s`.

**Tarea P3.3 — Pit menu: decidir REST vs HWControl mmap**

Decisión arquitectónica obligatoria. CC usa `rF2HWControl` mmap
(`MM_HWCONTROL_FILE_NAME`). LMU expone REST `:6397`. Recomiendo:

- **Read:** REST `:6397` (`/rest/watch/standings`, `/rest/watch/sessionInfo`).
- **Write:** HWControl mmap (`$rFactor2SMMP_HWControl$`) para no añadir
  un cliente HTTP y conservar latencia baja. Documentar en ADR 0002.

Implementar `internal/lmu/pitmenu/client.go` con `dry_run=true` por
defecto, `confirm=true` por defecto, gate `InPitlane || PitMenuOpen`.

**Tarea P3.4 — Command catalog (PTT)**

- Migrar el catálogo del Python v0.7 a `internal/engineer/commands/`.
- ≥14 tools en alpha 3, ≥80% en 1.0.
- Grammar-like con `delayResponses` configurable (CC lo hace vía
  `delayBetweenMessages`).

**Tarea P3.5 — Beeps + alternates (LMU-38)**

- Implementar `PlaybackModerator` equivalente: `start_bleep`,
  `alternate_start_bleep`, `end_bleep`, `alternate_end_bleep` con
  `insertBeepOutBetweenSpotterAndChief` configurable.
- `enable_radio_beeps` user setting.

---

## H. Preguntas abiertas

### H.1 Bloquean prealpha

1. **`cmd/spotter-debug -jsonl` o añadir flag `-jsonl` a `cmd/lmu-debug`?**
   Recomiendo crear `cmd/spotter-debug` separado (responsabilidad más
   limpia). Decisión de producto.
2. **¿`minSpotterSpeedMPS=10.0` se queda o se cambia a `5.0`?**
   Plan maestro dice `10.0` (CC dice `5.0`). El plan es la fuente de
   verdad, pero la métrica CC viene de `PlaybackModerator.cs:136` y
   arrastra también sesgo de juegos con physics diferente. Recomiendo
   `5.0` para LMU.
3. **¿`ValidityRule` como enum cerrado o string libre?**
   El plan maestro propone enum (`ValidityAlways`, `ValiditySpotterLeft`,
   `ValiditySpotterRight`, `ValiditySpotterNoLeft`,
   `ValiditySpotterNoRight`, `ValiditySpotterAllClear`,
   `ValiditySpotterBoth`). Recomiendo enum.
4. **¿`Player.Play` se invoca desde `queueLoop` o se introduce un nuevo
   `audio.Scheduler` separado?**
   Recomiendo un `Scheduler` dedicado con su propio loop, fuera del
   service, para que el `queueLoop` quede libre para notificaciones.

### H.2 Bloquean alpha 1

5. **¿Extended buffer se abre desde `internal/engineer/lmu/` o desde
   `internal/telemetry/lmu/`?**
   Recomiendo engineer (es uso casi exclusivo del suite).
6. **¿`mNumPenalties` como proxy del historial o se lee Extended siempre?**
   CC usa ambos. Recomiendo leer ambos: `mNumPenalties` para conteo
   rápido, Extended para tipo.
7. **¿Cómo se sincroniza `mLastHistoryMessage` con el ciclo de vida de
   la sesión?**
   CC resetea `lastEffectiveHistoryMessage` en `clearState()`. Necesario
   acordar el reset en Vantare.
8. **¿`Fuel.cs` se reinicia por stint o persiste por sesión?**
   CC tiene `FuelUsageStore` persistente. Plan maestro dice alpha 2.
   Confirmar decisión: persistir SQLite o JSON local.

### H.3 Puede esperar

9. **¿Per-class dimensions (LMP3, LMP2, GTE, GT3, HYPERCAR) en alpha 2
   o beta?** Plan maestro dice alpha 2; CC tiene
   `CarData.getCarClass().carLength`.
10. **¿`PearlsOfWisdom` con probability 0.8 o 0.5?**
    CC mezcla. Decisión de UX.
11. **¿`PearlOfWisdom` se desactiva en últimas 2 vueltas / 3 minutos?**
    CC sí (`disablePearlsOfWisdom=true` cuando `CompletedLaps>` X).
    Confirmar comportamiento.
12. **¿`Battery.cs` se implementa como módulo separado o se funde con
    Fuel?**
    CC los mantiene separados pero comparten `windowedAverageChargeLeft`
    para fuel y battery. Recomiendo separar.
13. **¿`DriverSwaps` con `driver_stint_seconds_remaining` viene del
    REST LMU `/rest/watch/standings` o de `mNumPitstops`/`mScheduledStops`?**
    Requiere verificación live.
14. **¿`minSessionParticipationTime` aplica al spotter o solo al suite
    proactivo?**
    Plan maestro ambiguo; CC usa 60s para SessionEndMessages.

---

## I. Qué debe hacer el orquestador después

### I.1 Mini-tareas inmediatas (orden sugerido)

1. **Mini-tarea DOCS-001**: aplicar las correcciones de P0 (sección G.0)
   en los 4 documentos afectados. Tarea pura de docs, sin código. Riesgo
   bajo.
2. **Mini-tarea SPOTTER-001**: P1.1 (speed gate + ValidityRule + integración
   Player↔queueLoop). Tocar `geometry.go`, `message.go`, `runtime.go`,
   `engineer_service.go`. Estimación: 2 PRs pequeños.
3. **Mini-tarea CLI-001**: P1.2 (`cmd/spotter-debug`). Tarea nueva, no
   toca código existente.
4. **Mini-tarea REPLAY-001**: P1.3 (fixtures persistentes). Generar con
   `simulator.Build` y commitear.

### I.2 Mini-tareas alpha 1

5. **Mini-tarea PARSER-001**: P2.1 (parser engineer extendido). Trabajo
   mecánico con offsets.
6. **Mini-tarea EXT-001**: P2.2 (Extended buffer). Tarea nueva con riesgo
   de IPC/reconexión.
7. **Mini-tarea MODULES-001..N**: P2.3 (un PR por módulo). Recomendado
   Fuel primero (consume parser P2.1), luego LapTimes, LapCounter,
   FlagsMonitor, Penalties, PushNow.

### I.3 Reglas para los miniplanes

- Cada mini-tarea debe incluir su `Evidence` (path exacto del archivo CC
  citado) y sus tests antes del código.
- Antes de tocar `engineer/lmu/parser.go`, abrir un PR que **solo**
  añade offsets nuevos sin cambiar la lógica; luego otro PR que los usa.
- No tocar el paquete `spotter` durante alpha 1 salvo para P1.1.
- Documentar cada override de un default locked en
  `vantare-go-master-plan.md` §5 antes del PR.

### I.4 Riesgos abiertos que el orquestador debe vigilar

- **Riesgo de regresión silenciosa**: `internal/telemetry/lmu/parser.go`
  ya lee Fuel/GamePhase; si el engineer parser empieza a leer también,
  puede haber doble fuente de verdad. Definir un único `engineer.Frame`
  con campos rellenos por `lmu.ParseEngineerFrame` y consumido por
  suite.
- **Riesgo de scope creep**: la tentación de implementar `Multiclass`,
  `TyreMonitor`, `Penalties` antes de cerrar `FlagsMonitor`+`Penalties`
  + `Fuel` es alta. Resistir.
- **Riesgo de pit menu**: LMU REST y rF2 HWControl son canales
  distintos. Si se elige REST para write, hay que confirmar que la latencia
  cumple `<500ms`; si no, usar HWControl.

### I.5 Métricas de "prealpha cerrada"

Aplican las de `prealpha-gate.md` con dos correcciones:

- Reemplazar el comando `go run ./cmd/lmu-debug -jsonl` por
  `go run ./cmd/spotter-debug -mock -out logs/spotter-prealpha.jsonl`.
- Añadir un test que verifique `minSpotterSpeedMPS` bloquea el spotter
  cuando el jugador está parado.

### I.6 Métricas de "alpha 1 cerrada"

- ≥50% de LMU-01..48 en `MATCH_CONFIRMED` o `PARTIAL_CONFIRMED`.
- Parser engineer expone ≥15 campos nuevos sobre los actuales 4
  (Position, InPits, LapDistance, ID, Name).
- Extended buffer abierto y al menos un evento `penalty_new_stopgo`
  emitido en replay sintético.

---

## Anexo — Inventario de archivos tocados por la auditoría (solo lectura)

```
docs/engineer/architecture/crewchief-parity-report.md       (auditado)
docs/engineer/architecture/crewchief-parity.md              (referencia cruzada)
docs/engineer/architecture/spotter-geometry-findings.md      (referencia cruzada)
docs/engineer/architecture/0001-prealpha-architecture.md    (referencia cruzada)
docs/engineer/vantare-go-master-plan.md                     (referencia cruzada)
docs/engineer/current-plan.md                               (referencia cruzada)
docs/engineer/testing/prealpha-gate.md                      (referencia cruzada)
docs/engineer/testing/lmu-telemetry.md                      (referencia cruzada)

vantare-v2/internal/engineer/spotter/overlap.go             (verificado MATCH)
vantare-v2/internal/engineer/spotter/alignment.go           (verificado MATCH)
vantare-v2/internal/engineer/spotter/geometry.go            (gap minSpotterSpeedMPS)
vantare-v2/internal/engineer/spotter/state.go               (verificado MATCH)
vantare-v2/internal/engineer/spotter/types.go               (verificado)
vantare-v2/internal/engineer/spotter/debug.go               (WriteDebugRecordsJSONL existe, no usado)
vantare-v2/internal/engineer/audio/queue.go                 (verificado: sin preemption)
vantare-v2/internal/engineer/audio/message.go               (verificado: sin ValidityRule)
vantare-v2/internal/engineer/audio/player_windows.go        (verificado: stopLocked funciona)
vantare-v2/internal/engineer/audio/player_other.go          (stub)
vantare-v2/internal/engineer/core/runtime.go                (verificado: solo spotter events)
vantare-v2/internal/engineer/service/engineer_service.go    (verificado: source="lmu" OK, sin Player.Play)
vantare-v2/internal/engineer/service/notification.go        (verificado: ES translations)
vantare-v2/internal/engineer/lmu/parser.go                  (gap: solo geometry, sin fuel/flag/penalty)
vantare-v2/internal/engineer/lmu/offsets.go                 (verificado: subset de telemetría)
vantare-v2/internal/engineer/replay/jsonl.go                (verificado: sin fixtures persistentes)
vantare-v2/internal/telemetry/lmu/parser.go                 (referencia: ya lee Fuel/GamePhase)
vantare-v2/internal/telemetry/lmu/offsets.go                (referencia: 87 offsets públicos)
vantare-v2/cmd/lmu-debug/main.go                            (FALSO: -jsonl no existe)

C:\Users\isaac\.gemini\antigravity\crewchief_src\CrewChiefV4\Audio\PlaybackModerator.cs
C:\Users\isaac\.gemini\antigravity\crewchief_src\CrewChiefV4\Audio\AudioPlayer.cs
C:\Users\isaac\.gemini\antigravity\crewchief_src\CrewChiefV4\Events\{Spotter,Fuel,LapTimes,LapCounter,
  LapCounter,MulticlassWarnings,TyreMonitor,EngineMonitor,Battery,Penalties,FlagsMonitor,
  FrozenOrderMonitor,ConditionsMonitor,PearlsOfWisdom,Position,Strategy,OvertakingAidsMonitor,
  PushNow,SessionEndMessages,DamageReporting,DriverSwaps,WatchedOpponents,Opponents}.cs
C:\Users\isaac\.gemini\antigravity\crewchief_src\CrewChiefV4\RF2\{RF2Data,RF2GameStateMapper,
  RF2Spotter,PitMenuAPI,PitMenuAbstractionLayer,PitMenuController,rF2HWControl}.cs
C:\Users\isaac\.gemini\antigravity\crewchief_src\CrewChiefV4\TrackData.cs
```

No se modificó ningún archivo durante esta auditoría.
