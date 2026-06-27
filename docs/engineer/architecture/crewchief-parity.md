# CrewChief Parity — Vantare Ingeniero Go

> **Estado:** activo desde 2026-06-27 (revisado tras auditoría 2026-06-27).
> **Auditorías como insumo (NO spec):**
> `architecture/crewchief-parity-audit.md` (2026-06-27) +
> `architecture/crewchief-parity-report.md` (histórico).
> **Matriz de paridad canónica:** `vantare-go-master-plan.md` § 13.

## 1. Propósito

Este documento define cómo Vantare Ingeniero Go aborda la paridad con
CrewChief, **empezando por el spotter y la suite del ingeniero**.
Existe para evitar fixes incrementales basados en síntomas y para
forzar a cada sección a separar:

- Qué hace CrewChief (referencia).
- Qué hace Vantare ahora (estado Go verificado en código/tests).
- Qué podemos implementar ahora (con mini-auditoría específica
  adjunta).
- Qué sigue necesitando verificación contra código fuente de CC o
  trazas reales LMU.

El objetivo inmediato de producto **no** es un clon completo de
CrewChief. El objetivo es hacer el spotter prealpha lo suficientemente
fiable para testing en pista LMU, y luego aplicar el mismo proceso al
resto de las features de carrera.

## 2. Principios de paridad

1. **Features deterministas primero.** El spotter y suite del
   ingeniero no dependen de LLMs ni razonamiento difuso. IA puede
   explicar después, pero no decide si un coche está alongside.
2. **Preferir modelo CrewChief sobre intuición.** Si CrewChief y
   Vantare discrepan, la presunción es que CrewChief resolvió un edge
   case real, salvo evidencia LMU en contra.
3. **Auditoría por feature antes de implementar.** Ninguna feature
   de paridad CrewChief se implementa desde este resumen, desde una
   matriz general o desde memoria. Antes de cada miniplan debe existir
   una **mini-auditoría específica** contra
   `https://gitlab.com/mr_belowski/CrewChiefV4` que cite archivos,
   funciones, constantes, cooldowns, gates, campos de telemetría y el
   gap exacto frente al Go actual. Si algo no se puede confirmar en
   fuente, se marca `NO_VERIFICADO` y se bloquea la implementación o
   se documenta como decisión de producto no-paridad.
4. **Geometry pura.** Funciones puras sin cola de audio, sin estado
   UI, sin side effects runtime. Obligatorio para testabilidad.
5. **Detección ≠ messaging.** Si un coche está físicamente
   alongside **no** implica que un mensaje de voz deba sonar ahora.
   Separar:
   - Detección geométrica.
   - Histéresis de overlap.
   - Transición de estado.
   - Delay de mensaje.
   - Expiración de mensaje.
   - Prioridad de cola de audio.
6. **Tune con trazas, no con suposiciones.** Thresholds y delays se
   ajustan con:
   - Tests sintéticos de geometría.
   - Replays LMU grabados.
   - Debug output live.
   - Trazas de cola de audio.

## 3. Regla CC reforzada

Esta regla es **no negociable** y se delega operativamente en
`agent-workflow.md` § 4 y `README.md` § 3. Resumen:

1. **Mini-auditoría específica obligatoria** por feature contra el
   repo fuente. Las auditorías generales (NIVEL 5 en `INDEX.md`)
   sirven de insumo, no de permiso.
2. **Estados válidos** para la matriz: `CONFIRMADO`, `PARCIAL`,
   `NO_VERIFICADO`, `NO_IMPLEMENTADO`, `GAP`, `NOT_PORTED`, o
   `HISTÓRICO` (ver `README.md` § 4).
3. Sin evidencia, el estado es `NO_VERIFICADO` y la implementación
   queda bloqueada.
4. La matriz LMU-01..48 de
   `vantare-go-master-plan.md` § 13 es la **fuente de verdad del
   progreso**. Este doc la comenta, no la duplica.

## 4. Sección 1: Spotter Geometry

### 4.1 CrewChief — `NoisyCartesianCoordinateSpotter.cs`

Opera en coordenadas 2D del mundo usando plano X/Z. No usa
`PathLateral`, `mLapDist` como geometría principal ni lateral
track-relative.

Modelo reportado (verificable en CC):

1. Lee posición del player `(playerX, playerZ)`.
2. Lee posición del oponente `(opponentX, opponentZ)`.
3. Calcula yaw del player desde la matriz de orientación:
   `atan2(mOri[RowZ].x, mOri[RowZ].z)`.
4. Rota la posición relativa del oponente al frame alineado del
   player.
5. Signo de `alignedX` para left/right.
6. Rangos de `alignedX/Z` y dimensiones del coche para decidir
   overlap.

### 4.2 Vantare Go actual

Implementa lo anterior con tests. Estado CONFIRMADO:

- `internal/engineer/spotter/alignment.go` implementa
  `YawFromRF2Orientation` y `AlignOpponentXZ` con la convención
  `atan2(Row2.X, Row2.Z)`.
- `internal/engineer/spotter/overlap.go` define `OverlapConfig` con
  `TrackZoneToConsiderM=20.0`, `CarLengthM=4.5`, `CarWidthM=1.8`,
  `CarBehindExtraM=0.4`, `GapNeededForClearM=0.5`.
- `internal/engineer/spotter/geometry.go` implementa `Classify` y
  `ClassifyWithActiveSides`.
- Tests en `geometry_test.go`, `overlap_test.go`, `alignment_test.go`,
  `state_test.go` cubren casos straight, rotados, ambos lados.

### 4.3 Verificación restante contra CC fuente

- Exactitud de la fórmula de yaw (`atan2(Row2.X, Row2.Z)`) —
  CONFIRMADO por código y test.
- Normalización de yaw a `0..2π` — CONFIRMADO por código y test.
- Signo de `alignedX` — CONFIRMADO por test.
- Si CrewChief usa offsets ligeramente distintos en rF2 vs LMU —
  **NO_VERIFICADO live**; la fórmula matemática es la misma en ambos
  pipelines según doc rFactor2 InternalsPlugin.

### 4.4 Estado

`CONFIRMADO`. Pequeños gaps siguen en LMU-02 (3-wide con stacked-cars)
y LMU-03 (still-there con cadencia). Ver matriz en
`vantare-go-master-plan.md` § 13.

## 5. Sección 2: Overlap Detection

### 5.1 CrewChief

Decide si un oponente está en rango del spotter usando dimensiones del
coche y coordenadas alineadas. Quick range check antes de geometría
cara.

### 5.2 Vantare Go actual

`OverlapConfig` con las 5 constantes locked. `ClassifyAlignedOverlap`
implementa los casos aligned.Z<0 (delante), aligned.Z>0 (detrás), y la
rama `existingOverlap=true` con histéresis (`CarLengthM +
GapNeededForClearM`).

### 5.3 Verificación restante contra CC

- CC también considera el caso de "no overlap nuevo pero ya overlap"
  vía `longCarLength = carLength + gapNeededForClear` —
  CONFIRMADO en `NoisyCartesianCoordinateSpotter.cs:264`.
- Lógica de stacked cars en línea india —
  **NO_IMPLEMENTADO** (LMU-02 gap parcial). Mini-auditoría:
  `NoisyCartesianCoordinateSpotter.cs:414-435` calcula
  `separationDelta = maxLateralSeparation - minLateralSeparation` y si
  `< carWidth` colapsa a `carsOnLeft = 1`.

### 5.4 Estado

`CONFIRMADO` para overlap básico. Stacked cars en línea india:
`NO_IMPLEMENTADO` (mini-auditoría pendiente).

## 6. Sección 3: Side State

### 6.1 CrewChief

No trackea IDs individuales para spotter básico. Agrega `carsOnLeft` y
`carsOnRight`. Transiciones basadas en cambios de count.

### 6.2 Vantare Go actual

`SideLevel` state machine con `StateNone/Left/Right/Both`. Zones
incluyen `VehicleID` para diagnóstico. Tests cubren todas las
transiciones.

### 6.3 Verificación restante contra CC

- Transiciones `none → left → right` sin gap limpio — tests
  `state_test.go` cubren.
- Cancelación de pending clear si el lado reaparece —
  CONFIRMADO por código (`state.go:107-118`).
- Stacked cars en el mismo lado — `NO_IMPLEMENTADO` (mismo gap que
  § 5.3).

### 6.4 Estado

`CONFIRMADO` salvo stacked cars (ver § 5.3).

## 7. Sección 4: Message Policy

### 7.1 CrewChief

Conceptos separados:

- Overlap message delay (user setting `spotter_overlap_delay`,
  default NO verificable en este repo).
- Clear message delay (user setting `spotter_clear_delay`, default
  NO verificable).
- Message expiry (hard-coded 2000ms en
  `NoisyCartesianCoordinateSpotter.cs:39`).
- Message validity check en playback time.
- Cancelación cuando un stale message ya no encaja.

### 7.2 Vantare Go actual

`Machine.Process` separa:

- `detectionHoldMS=350` (debounce de detección).
- `clearDelayMS=150` (delay desde hold hasta clear audible).
- `messageExpiryMS=2000` (expiración para `car_*`).
- `clearExpiryMS=2000` (expiración específica de clears).

`pendingClearAt` cancela si el lado reaparece antes del timestamp.

### 7.3 Verificación restante contra CC

- `ValidityRule` + `Runtime.IsMessageStillValid` — **NO_IMPLEMENTADO**
  en Vantare. Mini-auditoría: `QueuedMessage.cs` +
  `AbstractEvent.cs` en CC. Estado en `current-plan.md` § 6 Tarea 3.
- Valores exactos de `spotter_clear_delay` y `spotter_overlap_delay`
  en CC — `NO_VERIFICADO` (defaults no en este repo).
- Still-there repeat (`2500` en Vantare vs 3000 en CC según
  `UserSettings.GetUserSettings().getInt("spotter_hold_repeat_frequency")`)
  — **diferencia decisión de producto**; documentar.

### 7.4 Estado

`PARCIAL` (cola + expiración + cancel de pending clear CONFIRMADO;
`ValidityRule` + `IsMessageStillValid` NO_IMPLEMENTADO).

## 8. Sección 5: Audio Queue

### 8.1 CrewChief

`PlaybackModerator.cs` evalúa validez cerca del playback. Mensaje
spotter puede volverse obsoleto mientras otro clip se reproduce.
`AudioPlayer.cs:2032` setea prioridad 20 en `playSpotterMessage()` y
`AudioPlayer.cs:2055` llama `InterruptCurrentlyPlayingSound(false)` si
`!lastSoundWasSpotter` (interrupción selectiva, no blanket).

### 8.2 Vantare Go actual

- `Queue.Next` filtra por `ExpiresAt`.
- `audio.Player.Play` llama `stopLocked()` antes de reproducir
  (interrupción blanket actual).
- `engineer_service.go:queueLoop` **NO invoca `Player.Play`**; solo
  emite `EngineerNotification` al store.

### 8.3 Verificación restante contra CC

- Integración `queueLoop → Player.Play` con selector spotter vs chief
  — **NO_IMPLEMENTADO**. Mini-auditoría: `AudioPlayer.cs:2026-2063`
  `playSpotterMessage` para el patrón selectivo.
- `verbosity {FULL:0, MED:5, LOW:10, SILENT:20}` —
  **NO_IMPLEMENTADO**. Mini-auditoría:
  `PlaybackModerator.cs:103-108`.

### 8.4 Estado

`PARCIAL` (queue con prioridad + expiración + Player con kill
CONFIRMADO; integración selectiva + verbosity NO_IMPLEMENTADO).

## 9. Sección 6: Speed and Session Gates

### 9.1 CrewChief

- `minSpeedForSpotterToOperate` user setting (`min_speed_for_spotter`).
- `timeAfterRaceStartToActivate` user setting
  (`time_after_race_start_for_spotter`).
- `InPits` excluye el spotter.
- `paused/unpause` (FCY).
- Threshold FCY: `minTimeToWaitToTurnSpotterOffInFCY=10s`,
  `maxTimeToWaitToTurnSpotterOffInFCY=30s` en `CrewChief.cs:144-145`.

### 9.2 Vantare Go actual

- `Classify` excluye oponentes en `InPits`, con `LapDistance<0`, con
  posición inválida (0,0,0).
- Si jugador en pits, `Classify` devuelve `nil`.
- Speed gate `minSpotterSpeedMPS=10.0` — **NO_IMPLEMENTADO**.
- FCY pause — **NO_IMPLEMENTADO**.

### 9.3 Verificación restante contra CC

- Mini-auditoría `NoisyCartesianCoordinateSpotter.cs:56,297` para el
  speed gate. El default exacto del user setting
  `min_speed_for_spotter` no es verificable en este repo (no se ve el
  JSON de defaults).
- Mini-auditoría `Spotter.cs:42-55` `paused/unpause` + `CrewChief.cs:838-876`
  para FCY.

### 9.4 Estado

`PARCIAL` (filtros de posición/pits CONFIRMADO; speed gate y FCY
NO_IMPLEMENTADO).

## 10. Sección 7: Debugging and Replay

### 10.1 Vantare Go actual

- `spotter/debug.go` define `DebugRecord` con
  `alignedX/alignedZ/side/inOverlap/rejectReason`.
- `WriteDebugRecordsJSONL` existe en `spotter/debug.go:102`; **NO
  invocado desde CLI** (`cmd/lmu-debug` solo tiene flags
  `-once -mock -hz`; el flag `-jsonl` citado en otros docs no existe).
- `cmd/spotter-debug` con export JSONL real — **NO_IMPLEMENTADO**.
  Pendiente en `current-plan.md` § 6 Tarea 1.
- Replay JSONL con fixtures `left-basic/right-basic/three-wide/all-clear`
  bajo `internal/engineer/replay/testdata/` — **NO_IMPLEMENTADO**
  (directorio `testdata/` no existe; tests usan `os.CreateTemp`).
  Pendiente en `current-plan.md` § 6 Tarea 4.

### 10.2 Estado

`PARCIAL` (helper y estructura CONFIRMADO; binario CLI y fixtures
persistentes NO_IMPLEMENTADO).

## 11. Sección 8: Suite del Ingeniero (Wave 1-2)

Lista canónica con estado actual. **Esta sección NO duplica la matriz
LMU-01..48**; ver `vantare-go-master-plan.md` § 13 para la fuente de
verdad.

### 11.1 Race control (alpha 1)

| Módulo CC | Archivo CC | Estado Go |
|---|---|---|
| FlagsMonitor | `Events/FlagsMonitor.cs` | NO_IMPLEMENTADO |
| Penalties | `Events/Penalties.cs` + `RF2GameStateMapper.cs:2140-2225` | NO_IMPLEMENTADO |
| DamageReporting | `Events/DamageReporting.cs` (5 componentes) | NO_IMPLEMENTADO |
| ConditionsMonitor | `Events/ConditionsMonitor.cs` | NO_IMPLEMENTADO |
| FrozenOrderMonitor | `Events/FrozenOrderMonitor.cs` (enum `FrozenOrderPhase`) | NO_IMPLEMENTADO |

### 11.2 Core race (alpha 1)

| Módulo CC | Archivo CC | Estado Go |
|---|---|---|
| LapTimes | `Events/LapTimes.cs` | NO_IMPLEMENTADO |
| LapCounter | `Events/LapCounter.cs` | NO_IMPLEMENTADO |
| PushNow | `Events/PushNow.cs` | NO_IMPLEMENTADO |
| SessionEndMessages | `Events/SessionEndMessages.cs` | NO_IMPLEMENTADO |
| Fuel | `Events/Fuel.cs` + `FuelUsageStore` | NO_IMPLEMENTADO |
| PitStops | `Events/PitStops.cs` + `Strategy.cs` | NO_IMPLEMENTADO |

### 11.3 Vehicle & opponents (alpha 2)

| Módulo CC | Archivo CC | Estado Go |
|---|---|---|
| TyreMonitor | `Events/TyreMonitor.cs` | NO_IMPLEMENTADO |
| EngineMonitor | `Events/EngineMonitor.cs` | NO_IMPLEMENTADO |
| Battery | `Events/Battery.cs` | NO_IMPLEMENTADO |
| OvertakingAids | `Events/OvertakingAidsMonitor.cs` | NO_IMPLEMENTADO |
| MulticlassWarnings | `Events/MulticlassWarnings.cs` | NO_IMPLEMENTADO |
| Opponents | `Events/Opponents.cs` | NO_IMPLEMENTADO |
| OpponentMessages | `Events/OpponentMessages.cs` | NO_IMPLEMENTADO |
| WatchedOpponents | `Events/WatchedOpponents.cs` | NO_IMPLEMENTADO |
| Strategy | `Events/Strategy.cs` | NO_IMPLEMENTADO |
| PearlsOfWisdom | `Events/PearlsOfWisdom.cs` | NO_IMPLEMENTADO |
| RaceTime | `Events/RaceTime.cs` | NO_IMPLEMENTADO |
| DriverSwaps | `Events/DriverSwaps.cs` | NO_IMPLEMENTADO |

### 11.4 Endurance y comandos (alpha 2-3)

| Módulo CC | Archivo CC | Estado Go |
|---|---|---|
| Position | `Events/Position.cs` | NO_IMPLEMENTADO |
| Timings | `Events/Timings.cs` | NO_IMPLEMENTADO |
| CommandManager | `CommandManager.cs` + `SpeechCommands.cs` | NO_IMPLEMENTADO |
| LMUPitMenu | `LMU/LMUPitMenuAPI.cs` | NO_IMPLEMENTADO |

### 11.5 Explícitamente NO portar

- `CoDriver.cs`, `AlarmClock.cs`: N/A circuit.
- `iRacingBroadcastMessageEvent.cs`, `Ratings.cs`: iRacing only.
- `OverlayController.cs`, `VROverlayController.cs`: producto
  separado.
- `*_legacy.cs`: usar módulo moderno.
- `Mqtt.cs`: opcional.
- `SubtitleOverlay.cs`: producto separado.
- Per-class message packs (LMU-41): low ROI LMU.

## 12. Matriz LMU-01..48

Ver `vantare-go-master-plan.md` § 13. Esta sección solo la apunta;
la fuente de verdad del progreso vive allí, junto con la columna
"Mini-auditoría CrewChief".

## 13. Implementation Order

Los miniplanes del Python v0.7 son la guía de orden de implementación.
El Go los traduce con la misma secuencia:

1. Infra compartida (suite, playback, templates).
2. Race control P0: flags, frozen_order, penalties, damage, rain.
3. Core race: timings, lap times, lap counter, push, session end,
   fuel, pit stops.
4. Vehicle + opponents: tyres, engine, battery, opponents, watched,
   pearls, race time.
5. Spotter polish: grid side, FCY pause, clear TTL.
6. Pit menu production: tyre compound, confirm, dry-run gate.
7. Full command catalog PTT.
8. Session start delay (decisión de producto, 6s).
9. LMU session settings gates (damage, fuel multiplier).
10. Integration checkpoint con cutover.

Cada paso requiere mini-auditoría específica por feature antes de
implementar.

## 14. Open Questions (NO_VERIFICADO)

Estas preguntas se responden contra código fuente de CC o trazas LMU
reales:

1. Stacked cars: separación lateral < carWidth colapsa a 1 coche —
   mini-auditoría pendiente.
2. Velocidad default del user setting `min_speed_for_spotter` en CC
   — no verificable sin JSON de defaults.
3. Valores exactos de `spotter_clear_delay` y `spotter_overlap_delay`
   — no verificables.
4. Sub-strings vivos de `mLastHistoryMessage` en LMU real
   (CC los lee de rF2) — pendiente de captura live.
5. `mTicksLastHistoryMessageUpdated` en LMU — pendiente de captura.
6. Mapeo exacto `mElectricBatteryPercentage` en LMU (CC reusa
   `mFuel`; LMU podría tener campo separado) — pendiente.
7. `mPlayerPitStallLapDistance` en LMU — pendiente.
8. `minSessionParticipationTime=6s` del plan maestro vs
   `minSessionRunTimeForEndMessages=60s` de CC — son cosas distintas.
9. `PitGroup` en LMU offset 480 — disponible, no leído.
10. Per-class dimensions (LMP3, LMP2, GTE, GT3, HYPERCAR) —
    `NO_VERIFICADO`.

## 15. Decisión (revisada 2026-06-27)

Desarrollo puede continuar **solo sobre features con
`CONFIRMADO`/`PARCIAL`/`GAP` con mini-auditoría adjunta**:

- CONFIRMADO: spotter lateral X/Z, ActiveSides, overlap básico,
  state machine, debug record structure, parser público widgets.
- PARCIAL: cola audio, expiración, Player con kill (falta
  integración selectiva), telemetría parser experimental.
- GAP con mini-auditoría pendiente: todo lo demás.

**No se implementa nada como "como CrewChief"** usando solo este doc,
la auditoría general o memoria. Cada feature requiere mini-auditoría
específica antes de código.
