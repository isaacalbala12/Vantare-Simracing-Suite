# Plan Maestro — Vantare Ingeniero Go

> **Estado:** v1. **Reemplaza** a la versión histórica de Python
> `Vantare-Ingeniero/docs/ROADMAP-1.0.md`. La reescritura en Go es
> obligatoria; este documento define el producto vendible final.
>
> **Última revisión:** 2026-06-27 (corrección de defaults contradictorios
> tras auditoría de paridad y verificación contra
> `https://gitlab.com/mr_belowski/CrewChiefV4`).
>
> **Base estable (Python):** v0.7.0 (2026-06-15). El Go hereda el producto
> validado en pista y reescribe monolito + suite de eventos con la misma
> semántica, conservando paridad con CrewChief.

---

## 1. Visión

Vantare Ingeniero es un **ingeniero de carrera** para simracing:
spotter fiable, ingeniero determinista, comandos de voz, Pit Manager,
TTS natural y una capa de IA premium solo cuando la base determinista
ya es robusta.

**El objetivo no es reconstruir CrewChief entero.** CrewChief se usa
como referencia funcional para entender qué debe ocurrir en pista.
Vantare prioriza una experiencia más simple, moderna, vendible y fácil
de mantener con ayuda de LLMs.

El producto **funciona sin IA**. La IA es una capa premium para
explicar, conversar y ampliar decisiones calculadas por el core
determinista.

## 2. Decisiones base

| Área | Decisión |
|---|---|
| Lenguaje | Go |
| App desktop | Wails + React + TypeScript |
| Runtime | Una sola app, sin daemon, sin IPC interno, sin microservicios locales |
| Core | Librería interna modular en Go, ejecutada dentro de la app Wails |
| Sim principal | Le Mans Ultimate (LMU) |
| Sims 1.0 | LMU + Assetto Corsa + Assetto Corsa EVO |
| Multi-sim | Interfaz común desde el inicio; implementación real LMU en prealpha |
| Spotter | Primer hito crítico; al cerrarse empieza alpha |
| Replay/simulación | JSONL, desde el día 1 |
| TTS local | Kokoro como proceso local separado (default; stub hasta instalar) |
| TTS fallback | Edge TTS |
| TTS premium | Gemini cloud (beta), voice clone (1.0) |
| Cache audio | Permanente en `.mp3` |
| IA/LLM | Fuera de prealpha/alpha temprana; exclusiva de suscripción |
| Monetización | Freemium + packs + suscripción |
| Backend comercial | Prohibido antes de 1.0 salvo bloqueo crítico |
| Distribución | GitHub Releases; web pública recomendada pero no bloqueante |
| Updates | Auto-update funcional desde alpha pública |
| Installer | NSIS Windows x64 (heredado de Python) |
| Duck sim | `duck_lmu` (Rust helper) en bundle desde beta |
| Reconocimiento de voz | Comandos estructurados (grammar-like) en alpha 2; free-form PTT solo LLM |
| Cifrado muestra voz | Consentimiento obligatorio + borrado a petición |

## 3. Reglas no negociables (heredadas de Python v0.7)

Estas reglas son el suelo del producto. Cualquier plan, feature o PR
que las contradiga se considera roto y se revierte.

1. **La IA nunca decide datos críticos.** Combustible, daños, gaps,
   flags, posiciones y tiempos son `facts` extraídos de
   telemetría/estrategia. La IA solo redacta sobre esos `facts`. Si un
   dato falta, la respuesta es "no tengo ese dato", no un número
   inventado.
2. **Spotter y suite del ingeniero evalúan a 20 Hz** sobre el mismo
   `TelemetryFrame`. Nada a 0.5 Hz en batch.
3. **Detección ≠ messaging.** Geometría pura, histéresis de overlap,
   transición de estado, delay de mensaje, expiración y prioridad de
   cola son **paquetes distintos**. Ningún módulo los mezcla.
4. **Defaults Locked.** Las constantes publicadas en este documento no
   se debaten en cada cambio. Cambiar una default requiere actualizar
   este doc, evidencia live y PR separado.
5. **i18n + NumberProcessing.** ES por defecto. EN desde beta con
   formateo de números/tiempos local.
6. **Sin overlays in-game en Vantare.** La capa visual de telemetría
   vive en una app aparte. Vantare solo voz, spotter e ingeniero.
7. **Tests antes que código.** Cualquier cambio de comportamiento
   lleva test que falla antes y pasa después. Tests de spotter y suite
   CC son la fuente de verdad de paridad con CrewChief.
8. **Sin daemon, sin bus, sin microservicios locales** hasta que una
   necesidad real lo justifique.
9. **Wails UI solo capa de presentación.** Toda lógica de carrera vive
   en Go. La UI invoca bindings, muestra estado, configura opciones.
10. **Solo LMU en prealpha y alpha temprana.** AC/AC EVO entran en 1.0.

**Regla de paridad CrewChief por feature.** Las auditorías generales
de CrewChief sirven como contexto, no como permiso de implementación.
Antes de cualquier feature que reclame paridad CrewChief, el miniplan
debe incluir una **mini-auditoría específica** contra
`https://gitlab.com/mr_belowski/CrewChiefV4` con archivos, funciones,
constantes/cooldowns/gates, campos de telemetría, comportamiento actual
de Vantare, gap exacto y tests esperados. Sin esa evidencia, la tarea
queda bloqueada o se marca explícitamente como decisión de producto
no-paridad. Detalle operativo en `agent-workflow.md` § 4.

## 4. Forma general de la arquitectura

```
Wails desktop app
  React/TypeScript UI
  Go app bindings
  Go internal core
    sim providers (LMU primero)
    telemetry normalization
    spotter (geometría + state machine)
    engineer suite (módulos CC deterministas)
    audio queue (prioridad, expiración, preemption)
    TTS providers (Kokoro / Edge / Gemini / voice clone)
    replay/simulator
    config / logging / updater
    PTT command registry (grammar + LLM fallback)
```

La UI no contiene lógica de carrera. El core Go decide qué ocurre en
pista.

## 5. Defaults Locked (verificados en Python v0.7 o fuente CC)

> **Regla:** cualquier cambio requiere entrada en este doc, evidencia
> live y aprobación explícita. Defaults marcados con `NO_VERIFICADO`
> requieren mini-auditoría específica antes de cualquier feature que
> los use como paridad.

### 5.1 Spotter

| Constante | Default | Notas |
|---|---|---|
| `detectionHoldMS` | `350` | evita flicker por drop de telemetría |
| `clearDelayMS` | `150` | delay desde hold hasta clear audible |
| `stillThereRepeatMS` | `2500` | cadencia del "still there" (antes 2000) |
| `messageExpiryMS` | `2000` | expiración mensajes no críticos |
| `clearExpiryMS` | `2000` | expiración específica de clears |
| `minSpotterSpeedMPS` | `10.0` (decisión Vantare; default CC es user setting `min_speed_for_spotter` no verificable en este repo) | gate global: jugador parado silencia spotter |
| `trackZoneToConsiderM` | `20.0` | radio de búsqueda lateral (CC `NoisyCartesianCoordinateSpotter.cs:76`) |
| `carLengthM` | `4.5` | longitud conservadora (GT/LMP). CC `carClassData.json:60` confirma default 4.5 |
| `carWidthM` | `1.8` | anchura conservadora (CC `carClassData.json:60`) |
| `gapNeededForClearM` | `0.5` | gap mínimo para emitir clear (CC `NoisyCartesianCoordinateSpotter.cs:51`) |
| `carBehindExtraM` | `0.4` | holgura longitudinal detrás (CC `NoisyCartesianCoordinateSpotter.cs:35`) |
| `spotter_fcy_pause_min_s` | `10.0` | pausa proximidad bajo FCY/SC (CC `CrewChief.cs:144`) |
| `spotter_fcy_pause_max_s` | `30.0` | idem, random dentro del rango (CC `CrewChief.cs:145`) |
| `spotter_clear_ttl_ms` | `2000` | expiración payload clear en frontend |

> **Pendiente mini-auditoría antes de cerrar prealpha:** confirmar
> `clearMessageDelay` y `overlapMessageDelay` exactos en CC
> (`spotter_clear_delay`, `spotter_overlap_delay`) con captura live;
> valores por defecto no verificables sin el JSON de user settings.

### 5.2 Race-control y core race

| Constante | Default | Notas |
|---|---|---|
| `session_start_delay_s` | `6.0` (decisión de producto Vantare; **NO** es paridad CC directa) | LMU-47. CC tiene `minSessionRunTimeForEndMessages=60s` en `SessionEndMessages.cs:33` que es un gate distinto (mensajes de fin de sesión, no delay de inicio). |
| `fuel_status_check_interval_s` | `5.0` | periodicidad revisión fuel |
| `push_window_laps` | `MEDIUM≤4`, `LONG≤2`, `VERY_LONG==1` | `PushNow.cs:96-98` (CC). NO usar valor único global `3`. |
| `push_window_time_s` | ventana: `120 < remaining < 240` | `PushNow.cs:88`: `SessionTimeRemaining < 4*60 && SessionTimeRemaining > 2*60`. NO usar `240` como valor único. |
| `race_time_report_laps_normal` | `5` | anuncio cada 5 vueltas normal |
| `race_time_report_laps_detailed` | `2` | anuncio cada 2 vueltas detallado |
| `multiclass_settle_s` | `6.0` | CC `MulticlassWarnings.cs:91` `timeToWaitForOtherClassWarningToSettle=6s` |
| `multiclass_check_interval_s` | `4.0` | CC `MulticlassWarnings.cs:90` `timeBetweenOtherClassChecks=4s` |
| `frozen_order_stability_s` | `2.0` | instrucción estable antes de emitir |

### 5.3 Vehículo y oponentes

| Constante | Default | Notas |
|---|---|---|
| `tyre_hot_c` | `105.0` | umbral temp hot por rueda (°C) |
| `tyre_cooking_c` | `120.0` | umbral temp cooking eje delantero |
| `tyre_wear_warn_pct` | `75.0` | avg wear dispara `tyre_wear_high`. CC usa 4 umbrales per-wheel en `RF2GameStateMapper.cs:44-47`: `scrubbed=5`, `minor=20`, `major=50`, `wornOut=75`. 75% corresponde al umbral `wornOut` (knackered). |
| `brake_wear_warn_pct` | `80.0` | max wear dispara `brake_wear_high` |
| `engine_temp_warn_c` | `105.0` | water u oil |
| `battery_low_soc_pct` | `10.0` | **CORREGIDO 2026-06-27**. Versión anterior decía 20.0. CC `Battery.cs:77` `BatteryLowThreshold=10.0f`. LMU reusa `mFuel` como proxy de SOC (CC `RF2GameStateMapper.cs:1787`). |
| `opponent_message_cooldown_s` | `45` | por `(driver_index, event_type)` |
| `pearl_max_normal` | `2` | per carrera modo normal |
| `pearl_max_detailed` | `4` | per carrera modo detallado |
| `pearl_standard_lap_interval` | `12` | perla STANDARD cada 12 vueltas detailed |

### 5.4 Session settings LMU

| Constante | Default | Notas |
|---|---|---|
| `lmu_session_settings_poll_s` | `5.0` | CC cache ~5 s |
| `pit_menu_dry_run` | `true` | producción solo con flag explícito |
| `pit_menu_confirm_writes` | `true` | segunda confirmación vía tool PTT |

## 6. Módulos CrewChief a portar

El Python v0.7 ya implementó 25 módulos CC. El Go los traduce. Lista
canónica con su estado en Go.

Regla de implementación: cada módulo o subfeature de esta sección
requiere **mini-auditoría fuente propia** antes de tocar código
(`agent-workflow.md` § 4). No basta con que el módulo aparezca en una
tabla como `MATCH`, `PARTIAL` o `GAP`; el worker debe citar la
evidencia concreta de CrewChief y la evidencia concreta del Go actual.

### 6.1 Spotter (en cierre de prealpha)

| Módulo CC | Archivo CC | Estado Go |
|---|---|---|
| Spotter lateral | `Events/Spotter.cs` + `NoisyCartesianCoordinateSpotter.cs` | geometría X/Z y ActiveSides CONFIRMADO (`spotter/overlap.go`, `geometry.go`, `state.go`). Speed gate `minSpotterSpeedMPS` NO_IMPLEMENTADO. Stacked-cars check NO_IMPLEMENTADO. |
| Pit limiter | `Events/Spotter.cs` callbacks | NO_IMPLEMENTADO (offset `mSpeedLimiter=330` no leído por engineer parser) |
| Grid side | `Events/Spotter.cs:84,89` con threshold ±2 m y enum `GridSide` | NO_IMPLEMENTADO (alpha 1 con Position) |
| FCY pause | `Spotter.cs:42-55` (`pause/unpause`) + `CrewChief.cs:144-145` (10-30s) | NO_IMPLEMENTADO (alpha 1) |

### 6.2 Race control (alpha 1)

| Módulo CC | Archivo CC | Estado Go |
|---|---|---|
| FlagsMonitor | `Events/FlagsMonitor.cs` | NO_IMPLEMENTADO |
| Penalties | `Events/Penalties.cs` + `RF2GameStateMapper.cs:2140-2225` (Extended buffer) | NO_IMPLEMENTADO. CC mapea `mLastHistoryMessage` con whitelist de sub-strings. LMU emite los mismos strings (NO_VERIFICADO live) |
| DamageReporting | `Events/DamageReporting.cs` (5 componentes) | NO_IMPLEMENTADO |
| ConditionsMonitor (rain) | `Events/ConditionsMonitor.cs` | NO_IMPLEMENTADO |
| FrozenOrderMonitor | `Events/FrozenOrderMonitor.cs` (enum `FrozenOrderColumn`) | NO_IMPLEMENTADO |

### 6.3 Core race (alpha 1)

| Módulo CC | Archivo CC | Estado Go |
|---|---|---|
| LapTimes | `Events/LapTimes.cs` (`consistencyLimit=0.5f`, `lapTimesWindowSize=5`) | NO_IMPLEMENTADO |
| LapCounter | `Events/LapCounter.cs` ramas `Place==1`/`Place<=3` | NO_IMPLEMENTADO |
| PushNow | `Events/PushNow.cs` (`minTimeToBeInThisPosition=60`, ventanas por TrackLengthClass) | NO_IMPLEMENTADO |
| SessionEndMessages | `Events/SessionEndMessages.cs` (`minSessionRunTimeForEndMessages=60`) | NO_IMPLEMENTADO |
| Fuel (con persistencia) | `Events/Fuel.cs` + `FuelUsageStore` | NO_IMPLEMENTADO. CC `fuelUseByLapsWindowLength{1..5}` por TrackLengthClass |
| PitStops (window/entry/exit/prediction) | `Events/PitStops.cs` + `Strategy.cs` | NO_IMPLEMENTADO |

### 6.4 Vehículo y oponentes (alpha 2)

| Módulo CC | Archivo CC | Estado Go |
|---|---|---|
| TyreMonitor (hot/cooking/wear/brake) | `Events/TyreMonitor.cs` | NO_IMPLEMENTADO |
| EngineMonitor (water/oil temp) | `Events/EngineMonitor.cs` | NO_IMPLEMENTADO |
| Battery (Hypercar SOC) | `Events/Battery.cs` | NO_IMPLEMENTADO. LMU no expone SOC separado; CC reusa `mFuel` |
| OvertakingAids (DRS/PTP) | `Events/OvertakingAidsMonitor.cs` | NO_IMPLEMENTADO |
| MulticlassWarnings | `Events/MulticlassWarnings.cs` (3 escenarios MVP) | NO_IMPLEMENTADO |
| Opponents (pit/pos) | `Events/Opponents.cs` | NO_IMPLEMENTADO |
| OpponentMessages (rival fast lap) | `Events/OpponentMessages.cs` | NO_IMPLEMENTADO |
| WatchedOpponents | `Events/WatchedOpponents.cs` + Snip | NO_IMPLEMENTADO |
| Strategy (sector fuel) | `Events/Strategy.cs` | NO_IMPLEMENTADO |
| PearlsOfWisdom | `Events/PearlsOfWisdom.cs` | NO_IMPLEMENTADO |
| RaceTime | `Events/RaceTime.cs` | NO_IMPLEMENTADO |

### 6.5 Endurance y comandos (alpha 2-3)

| Módulo CC | Archivo CC | Estado Go |
|---|---|---|
| DriverSwaps (stint countdown PARTIAL) | `Events/DriverSwaps.cs` | NO_IMPLEMENTADO |
| Position (overtake/lost) | `Events/Position.cs` (constantes 4s/7s/20s/0.15s) | NO_IMPLEMENTADO |
| Timings (gaps) | `Events/Timings.cs` | NO_IMPLEMENTADO |
| CommandManager (grammar PTT) | `CommandManager.cs` + `SpeechCommands.cs` | NO_IMPLEMENTADO catalog base en alpha 2, expansión en alpha 3 |
| LMUPitMenu (REST `:6397`) | `LMU/LMUPitMenuAPI.cs` | NO_IMPLEMENTADO alpha 3 |

### 6.6 Infra compartida (alpha 1-2)

| Pieza | Archivo CC | Estado Go |
|---|---|---|
| PlaybackModerator | `Audio/PlaybackModerator.cs` | PARCIAL (cola + expiración); priority/preemption y `verbosity {FULL:0, MED:5, LOW:10, SILENT:20}` NO_IMPLEMENTADOS |
| Delayed queue | `Audio/PlaybackModerator.cs` (delayed) | NO_IMPLEMENTADO alpha 1 |
| NumberProcessing multi-idioma | `NumberProcessing/*.cs` | NO_IMPLEMENTADO beta |
| Driver name helper | `DriverNameHelper.cs` | NO_IMPLEMENTADO alpha 2 |

### 6.7 Explícitamente NO portar

Decisión heredada del Python:

- `CoDriver.cs`, `AlarmClock.cs`: N/A circuit.
- `iRacingBroadcastMessageEvent.cs`, `Ratings.cs`: iRacing only.
- `OverlayController.cs`, `VROverlayController.cs`: producto
  separado (app Go aparte en 1.1).
- `*_legacy.cs`: usar módulo moderno.
- `Mqtt.cs`: opcional, no portado por defecto.
- `SubtitleOverlay.cs`: producto separado.
- Per-class message packs (LMU-41): low ROI LMU.

## 7. Mapa de versiones

| Versión | Eje | Paridad CC mínima |
|---|---|---|
| **0.0.x (prealpha)** | Spotter MVP | Geometría X/Z lateral CONFIRMADO. Resto del spotter (speed gate, ValidityRule, fixtures, interrupt, stacked-cars) NO_IMPLEMENTADO. |
| **0.1.x (alpha 1)** | Ingeniero determinista básico | Flags, penalties, damage, rain, fuel, laps, session end, pit stops (sin write), position, timings |
| **0.2.x (alpha 2)** | Vehicle + opponents | Tyre monitor, engine, battery, DRS, multiclass, frozen, pearls, race time, driver swaps, watched opponents, frases editables, EN |
| **0.3.x (alpha 3)** | Pit Manager LMU + PTT | REST `:6397` read + write, command catalog PTT, grid side, duck LMU, NSIS installer |
| **0.9 (beta)** | Hardening LMU ship | ≥3 circuitos × ≥2 condiciones, auto-update, duck LMU bundle, smoke checklist |
| **1.0 (commercial)** | Voice clone | Clonación timbre por perfil + fallback, release stable |
| **1.1** | iRacing + Suite Go opcional | iRSDK read, spotter iRacing, suite launcher opt-in |
| **2.0 (futuro)** | Strategy platform | Monte Carlo maduro, SDK/plugin system |

## 8. Arquitectura por era

### 8.1 Prealpha — solo LMU

Una app Wails monolítica. Telemetry normalizado a 20 Hz alimenta
spotter y suite CC. Audio queue con prioridad, expiración y
validación de mensajes stale.

**Fuera de scope:**

- Overlays telemetría in-game
- iRacing, AC, AC EVO
- LLM/IA como capa decisoria
- Auto-update (sí para alpha)
- Installer NSIS (sí para alpha)
- duck_lmu (sí para beta)
- Voice clone (sí para 1.0)

> **Estado real a 2026-06-27:** algunos paquetes descritos en
> `architecture/0001-prealpha-architecture.md` (TTS, sim, config,
> persistence, cli) **NO existen** aún en el worktree. Ver
> `INDEX.md` § 5 y `current-plan.md` § 2.3.

### 8.2 Alpha — voz más amplia

Mismo monolito. Se añade la suite CC de race control y core race. PTT
con commands estructurados. Frases con variantes por perfil. Idioma
EN.

### 8.3 Beta — ship quality

Duck LMU. Auto-update E2E. Installer NSIS. Hardening con evidencia
multi-circuito.

### 8.4 1.0 — voice clone

Sample del usuario, consentimiento explícito, fallback. Mismo
monolito.

### 8.5 1.1 — iRacing + Suite opcional

Segundo sim con `shared-telemetry` común. Suite launcher opt-in para
convivencia con Go overlay. Regla heredada: Go **nunca** requiere
`backend.exe` para arrancar.

## 9. TTS y voz

Tres providers encadenados:

1. **Voice clone** (1.0+) — sample del usuario, fallback si falla.
2. **Gemini** (beta+) — voces cloud premium.
3. **Edge** — default estable.
4. **Kokoro** (local, stub hasta instalar) — proceso separado.

Cache permanente `.mp3` por hash `(language, voice, text)`. Pre-cache
de 7 frases críticas en arranque. Ver
`architecture/tts.md` (estado: HISTÓRICO/ASPIRACIONAL, los paquetes
`internal/tts/*` no existen aún en el worktree).

Contrato normativo de voz en `voice-contract.md` con matriz
VC-A01..VC-R04. Cualquier cambio que afecte prioridad, expiración,
preemption o gates pasa por matriz testeable.

## 10. Pit Manager LMU

REST API LMU en `http://localhost:6397`. Endpoints relevantes
documentados en Python `lmu_api.py` y `pit_menu_client.py`.

P0 comandos:

- Fuel: add litres, fill to X, fuel to end
- Tyres: change all/front/rear/left/right
- Repairs: fix none/body/all
- Virtual energy % (LMU-specific)
- Fuel ration % (LMU-specific)
- Penalty serve / don't serve
- Tearoff / windscreen

**Guard obligatorio:** `pit_menu_dry_run=true` por defecto,
confirmación explícita por voz antes de write, solo en pit lane o menú
abierto.

## 11. Telemetría

LMU se lee vía **Windows mmap directo** sobre `LMU_Data`. Go no mapea
el struct C++ completo; parsea por byte offsets generados del layout
ctypes. Ver `testing/lmu-telemetry.md`.

Reglas de preferencia de fuente cuando hay duplicación entre scoring y
telemetry:

1. `frame.Player` (telemetría) si tiene pose válida.
2. `VehicleScoring` del player como fallback.
3. Telemetría preferida para yaw y posición; scoring puede ir
   retrasada.

> **Estado real a 2026-06-27:** existe un parser público de Ingeniero
> en `internal/telemetry/lmu/parser.go` (Fuel, FuelCap, GamePhase,
> Place, VehicleClass, BestLapTime, LastLapTime, TimeBehind*,
> Penalties, LapDistance). Existe además un parser experimental
> `internal/engineer/lmu/parser.go` (sin commit) que reusa el mmap de
> widgets para exponer Position/Orientation al spotter. NO es un
> reemplazo del parser público; ambos coexisten.

## 12. Interfaz mínima de paquetes Go

```go
// internal/telemetry
type Frame struct {
    Connected bool
    Player *PlayerTelemetry
    Session *SessionInfo
    Vehicles []VehicleScoring
    TimestampUnixMS int64
}

// internal/engineer/spotter
type Side string  // SideLeft, SideRight
type Zone struct { Side Side; VehicleID int32; LateralM, ForwardM float64 }
type ActiveSides struct { Left, Right bool }

// internal/engineer
type Event struct { EventID, Text string; Priority Priority; TTLMS int64; Channel Channel }
type FrameContext struct { Previous, Current Frame; Strategy map; Session map; NowMonotonic float64 }

// internal/engineer/audio
type Priority int  // PrioritySpotter=100, PriorityEngineer=50, PriorityNormal=10, PriorityLow=1
type Message struct {
    ID        string   `json:"id"`
    TextKey   string   `json:"textKey"`
    Text      string   `json:"text"`
    Priority  Priority `json:"priority"`
    CreatedAt int64    `json:"createdAt"`
    ExpiresAt int64    `json:"expiresAt"`
    // ValidityRule y ValidationData están en mini-auditoría
    // (ver `agent-workflow.md` § 4 y `current-plan.md` § 6 Tarea 3)
}

// internal/tts (PROYECTADO, no implementado)
type Provider interface {
    Name() string
    Synthesize(ctx context.Context, req Request) (Result, error)
    Health(ctx context.Context) error
}

// internal/engineer/replay
type Source interface { Next() (*telemetry.Frame, bool, error); Info() sim.Info; Close() error }
```

Interfaces solo donde reducen acoplamiento real. Sin `utils/` genérico.

## 13. CrewChief Parity Matrix LMU-01..48

> **Estado:** basada en evidencia real a 2026-06-27. Esta matriz es
> la **fuente de verdad del progreso de paridad**, no la auditoría
> general. La auditoría de 2026-06-27 en
> `architecture/crewchief-parity-audit.md` es insumo para
> mini-auditorías futuras, no spec.
>
> **Estados válidos:** `CONFIRMADO`, `PARCIAL`, `NO_VERIFICADO`,
> `NO_IMPLEMENTADO`, `GAP`, `NOT_PORTED`. Ver `README.md` § 4.

| LMU ID | Tópico | Estado Go | Mini-auditoría CrewChief |
|---|---|---|---|
| 01 | Spotter lateral X/Z | CONFIRMADO | `NoisyCartesianCoordinateSpotter.cs` + tests Go |
| 02 | Spotter clear + 3-wide | CONFIRMADO | `state.go:107-118` `scheduleClear` + tests |
| 03 | Spotter still-there | CONFIRMADO | `state.go` + tests |
| 04 | Pit limiter entrada | NO_IMPLEMENTADO | `mSpeedLimiter=330` offset no leído |
| 05 | Pit limiter salida | NO_IMPLEMENTADO | idem |
| 06 | Fuel básico remaining | PARCIAL | `mFuel`/`mFuelCapacity` leídos por `internal/telemetry/lmu/parser.go:163-164`. Engineer runtime no los usa todavía |
| 07 | Frozen order | NO_IMPLEMENTADO | `FrozenOrderMonitor.cs:24-72` (enum `FrozenOrderPhase`) |
| 08 | Last lap | NO_IMPLEMENTADO | `LapCounter.cs:514-535` ramas `Place==1`/`Place<=3` |
| 09 | Damage 5 componentes | NO_IMPLEMENTADO | `DamageReporting.cs:76-78` (engine/tranny/suspension/brakes/aero) |
| 10 | Timings / gaps | NO_IMPLEMENTADO | `Timings.cs:55-58` `frequency_of_gap_*_reports` |
| 11 | Tyre temps | NO_IMPLEMENTADO | `TyreMonitor.cs:240,285` |
| 12 | Multiclass warnings | NO_IMPLEMENTADO | `MulticlassWarnings.cs:23,90-91,172` |
| 13 | Penalty type (DT/SG) | NO_IMPLEMENTADO | `Penalties.cs` + Extended buffer sub-strings |
| 14 | Fuel crítico + persistencia | NO_IMPLEMENTADO | `Fuel.cs:132-137` ventana móvil + `FuelUsageStore` |
| 15 | FCY/flags | NO_IMPLEMENTADO | `FlagsMonitor.cs:31-49` 19 carpetas EU/US FCY |
| 16 | Pit window open/closing | NO_IMPLEMENTADO | `PitStops.cs:23-54` |
| 17 | Pit entry/exit | NO_IMPLEMENTADO | `PitStops.cs:60-90` (`engage_limiter`/`disengage_limiter`/`one_hundred_metres`/`fifty_metres`/`box_now`) |
| 18 | Tyre wear | NO_IMPLEMENTADO | umbrales CC: `scrubbed=5, minor=20, major=50, wornOut=75` (`RF2GameStateMapper.cs:44-47`) |
| 19 | Push now (undercut) | NO_IMPLEMENTADO | `PushNow.cs:38,88,96-98` |
| 20 | Position overtake/lost | NO_IMPLEMENTADO | `Position.cs:26-29,128` (4s/7s/20s/0.15s) |
| 21 | Lap counter announce | NO_IMPLEMENTADO | `LapCounter.cs:514-535` |
| 22 | Lap time messages | NO_IMPLEMENTADO | `LapTimes.cs:148,839-872` |
| 23 | Session laps remaining | NO_IMPLEMENTADO | `LapCounter.cs:514` |
| 24 | Pearls of wisdom | NO_IMPLEMENTADO | `PearlsOfWisdom.cs` |
| 25 | Driver stint countdown | NO_IMPLEMENTADO | LMU sin `driver_stint_seconds_remaining` directo; vía REST/standing |
| 26 | Opponent pit/pos | NO_IMPLEMENTADO | `Opponents.cs:462-475,1100-1202` |
| 27 | Standing position messages | NO_IMPLEMENTADO | `Position.cs:14-22` |
| 28 | Session end messages | NO_IMPLEMENTADO | `SessionEndMessages.cs:33` (gate 60s) |
| 29 | Engine temp warnings | NO_IMPLEMENTADO | `EngineMonitor.cs:208-210` |
| 30 | Weather / conditions | NO_IMPLEMENTADO | `ConditionsMonitor.cs:79-99` |
| 31 | Sector delta reports | NO_IMPLEMENTADO | `LapTimes.cs:14` `frequencyOfRaceSectorDeltaReports` |
| 32 | Sector splits nativos | NO_IMPLEMENTADO | `mCurrentSectorTime1/2` offsets 176/184 disponibles, no leídos |
| 33 | Sub-100ms critical latency | PARCIAL | Player con kill CONFIRMADO; integración `queueLoop→Player.Play` NO_IMPLEMENTADO |
| 34 | Watched opponents | NO_IMPLEMENTADO | `WatchedOpponents.cs:74` |
| 35 | PTT command catalog ≥80% | NO_IMPLEMENTADO | `CommandManager.cs` + `SpeechCommands.cs` |
| 36 | Grid side @ race start | NO_IMPLEMENTADO | `Spotter.cs:67-94` con threshold ±2m |
| 37 | WAV SoundCache | PARCIAL | `WriteDebugRecordsJSONL` existe en `spotter/debug.go:102`; no invocado desde CLI (no hay `-jsonl`) |
| 38 | Beeps (radio) | NO_IMPLEMENTADO | `PlaybackModerator.cs:48,427-489` opcional alpha 3 |
| 39 | Background ambiance | NOT_PORTED | fuera de scope producto |
| 40 | FCY spotter pause 10-30s | NO_IMPLEMENTADO | `Spotter.cs:42-55` `pause/unpause` + `CrewChief.cs:144-145` (10-30s) |
| 41 | Per-class message packs | NOT_PORTED | low ROI LMU |
| 42 | NumberReading | NO_IMPLEMENTADO | `NumberReaderEn.cs`, `NumberReaderEs.cs` no en repo CC; auditar al implementar |
| 43 | Subtitle overlay | NOT_PORTED | producto separado |
| 44 | Perla/filtro per-class | NOT_PORTED | — |
| 45 | Fuel usage persistence | NO_IMPLEMENTADO | `FuelUsageStore` (CC) persiste por circuito |
| 46 | NumberReader multi-idioma | NO_IMPLEMENTADO | idem LMU-42 |
| 47 | minSessionParticipationTime 6s | NO_VERIFICADO | CC tiene `minSessionRunTimeForEndMessages=60s` (`SessionEndMessages.cs:33`); son cosas distintas. El default `6s` en el plan maestro es decisión de producto, no paridad |
| 48 | Pit menu write | NO_IMPLEMENTADO | CC usa `rF2HWControl` mmap; LMU expone REST `:6397`. Decisión arquitectónica pendiente |

## 14. Criterios "done" por versión

### Prealpha (0.0.x) — spotter MVP

- [ ] Geometría CrewChief X/Z confirmada en pista real
- [ ] Replay JSONL con fixtures left/right/three-wide/all-clear
- [ ] `cmd/spotter-debug` (NO `cmd/lmu-debug -jsonl`) con
      `alignedX/alignedZ/side/inOverlap/rejectReason`
- [ ] Captura side-by-side real LMU con al menos 1 minuto de tráfico
- [ ] `verify-prealpha.ps1` pasa
- [ ] Sin mensajes stale en tests
- [ ] Speed gate `minSpotterSpeedMPS=10.0` implementado y testeado
- [ ] `ValidityRule` + `Runtime.IsMessageStillValid` implementados y
      testeados
- [ ] `Player.Play` integrado en `queueLoop` (o `audio.Scheduler`)
- [ ] Spotter lateral audible y consistente en ≥3 circuitos

### Alpha 1 — ingeniero determinista básico

- [ ] Flags, penalties, damage, rain, fuel, laps, session end, push
      now, pit stops básicos
- [ ] Todos los módulos a 20 Hz (no batch 0.5 Hz)
- [ ] Cutover de `triggers.py` legacy completado
- [ ] Voice contract VC-A* sin regresión
- [ ] ≥80% matriz LMU-01..48 en `CONFIRMADO` o `PARCIAL` con
      mini-auditoría adjunta

### Alpha 2 — vehicle, opponents, multiclase

- [ ] Tyre monitor (temp + wear + brake)
- [ ] Engine monitor, battery, DRS
- [ ] Multiclass 3 escenarios
- [ ] Opponents, watched, pearls, race time
- [ ] Driver swaps con `NO_VERIFICADO` documentado
- [ ] Frases editables (PhraseStore + import/export)
- [ ] Idioma EN con NumberProcessing

### Alpha 3 — Pit Manager + PTT + installer

- [ ] REST LMU `:6397` write con `dry_run + confirm`
- [ ] Command catalog PTT ≥14 tools
- [ ] Grid side @ race start
- [ ] FCY pause spotter 10-30s
- [ ] `duck_lmu.exe` en bundle
- [ ] NSIS installer Windows x64
- [ ] Auto-update GitHub Releases E2E

### Beta (0.9) — hardening

- [ ] `verify-release.ps1` + `verify_beta_gate.ps1` green
- [ ] Evidencia ≥3 circuitos × ≥2 condiciones
- [ ] ≥85% matriz LMU-01..48 en `CONFIRMADO` o `PARCIAL` con
      mini-auditoría adjunta

### 1.0 — voice clone

- [ ] Sample timbre del usuario + consentimiento
- [ ] Fallback chain clone → gemini → edge
- [ ] ≥90% matriz LMU-01..48 en `CONFIRMADO` o `PARCIAL` con
      mini-auditoría adjunta
- [ ] Release stable (no pre-release)

### 1.1 — iRacing + Suite

- [ ] iRSDK read
- [ ] Spotter iRacing
- [ ] Triggers endurance iRacing
- [ ] Suite launcher opt-in
- [ ] Go standalone con `shared-telemetry` CGO
- [ ] Companion API v1 documentado
- [ ] LMU sin regresión

## 15. Anti-fork rule (heredada)

Si el Go termina emitiendo mensajes deterministas vía batch 0.5 Hz,
formateados por LLM como cifras, o con `triggers.py` y `commentary`
orquestando desde fuera de la suite, **el producto es un wrapper
fork** y no paridad. Los tests deben fallar si eso ocurre.

Verificación rápida en cada cambio:

- ¿Suite evalúa a 20 Hz? (`go test ./internal/engineer -v`)
- ¿Ningún módulo importa `internal/llm`?
- ¿Voice contract matriz verde?

## 16. Monitoreo de salud por versión

Cada versión expone:

- `GET /health` — estado general
- `GET /version` — versión + commit
- `GET /spotter/state` — estado del spotter (side, lastSeen, clearDelay pendiente)
- `GET /engineer/recent` — últimos N eventos del ingeniero con TTL
- `GET /engineer/health` — snapshot del servicio de ingeniero
  (`/api/engineer/health`, CONFIRMADO en worktree)
- `GET /tts/cache/stats` —命中率 del cache TTS
- Export ZIP de logs + JSONL con un click (alpha 3)

## 17. Roadmap técnico

### Prealpha (1-2 sprints)

Plan: `architecture/0001-prealpha-architecture.md`.

### Alpha 1 (3-4 sprints)

Suite CC race-control + core race. Cutover de triggers legacy.

### Alpha 2 (3-4 sprints)

Suite CC vehicle + opponents. Frases editables. i18n EN.

### Alpha 3 (2-3 sprints)

Pit Manager LMU + PTT + grid side + FCY pause + duck LMU + NSIS.

### Beta (2 sprints)

Hardening + checklist ≥3 circuitos × ≥2 condiciones.

### 1.0 (2 sprints)

Voice clone + sample + consentimiento + fallback.

### 1.1 (3-4 sprints)

iRacing + suite launcher + Companion API.

## 18. Forbidden global

- ❌ Overlays telemetría in-game en Vantare (nunca; van a app Go
  aparte en 1.1)
- ❌ Launcher Suite obligatorio (opt-in en 1.1)
- ❌ Go integration / Companion API antes de 1.1
- ❌ iRacing mapper antes de 1.1
- ❌ Refactor masivo `engineer/` salvo wiring mínimo por versión
- ❌ CrewChiefV4 como runtime (es referencia, no dependencia)
- ❌ 2 exe + supervisor WS
- ❌ Microservicios / daemon local
- ❌ Bindings Wails versionados en git (regenerados)
- ❌ LLM decidiendo datos críticos (regla 1)

## 19. Relación con otros documentos

| Documento | Rol |
|---|---|
| [`README.md`](README.md) | Visión del paquete de docs, regla CC |
| [`INDEX.md`](INDEX.md) | Mapa canónico y estado real por archivo |
| [`current-plan.md`](current-plan.md) | Estado actual, próxima tarea, riesgos |
| [`master-plan-go.md`](../master-plan-go.md) | Segmentación global; este doc se posiciona dentro |
| [`current-work-go.md`](../current-work-go.md) | Plan general activo y 5 tareas siguientes |
| [`voice-contract.md`](voice-contract.md) | Contrato normativo voz/TTS |
| [`architecture/0001-prealpha-architecture.md`](architecture/0001-prealpha-architecture.md) | Forma técnica del monolito |
| [`architecture/spotter-geometry-findings.md`](architecture/spotter-geometry-findings.md) | Convención X/Z confirmada |
| [`architecture/tts.md`](architecture/tts.md) | Proveedores TTS, cache, pre-cache (HISTÓRICO) |
| [`architecture/crewchief-parity.md`](architecture/crewchief-parity.md) | Detalle de la matriz LMU-01..48 |
| [`architecture/crewchief-parity-audit.md`](architecture/crewchief-parity-audit.md) | Auditoría 2026-06-27 (EVIDENCIA, no verdad) |
| [`architecture/crewchief-parity-report.md`](architecture/crewchief-parity-report.md) | Informe previo (HISTÓRICO) |
| [`product/prealpha-next-steps.md`](product/prealpha-next-steps.md) | Prioridades inmediatas prealpha |
| [`testing/prealpha-gate.md`](testing/prealpha-gate.md) | Criterios para cerrar prealpha |
| [`testing/spotter-bug-log.md`](testing/spotter-bug-log.md) | Bugs conocidos y estado |
| [`testing/lmu-telemetry.md`](testing/lmu-telemetry.md) | Offsets y parser LMU |
| [`agent-workflow.md`](agent-workflow.md) | Roles orquestador / worker / reviewer |
| [`go-review-checklist.md`](go-review-checklist.md) | Checklist de revisión Go |
| [`manual-verification.md`](manual-verification.md) | Pasos para usuario no-programador |
| [`operations.md`](operations.md) | Runbook del repo |
| [`testing-strategy.md`](testing-strategy.md) | Estrategia y orden de tests |
| [`domain-model.md`](domain-model.md) | Vocabulario canónico |

## 20. Resumen ejecutivo

Vantare Ingeniero Go es la **reescritura en Go obligatoria** del
producto que en Python v0.7 ya validó su producto en pista. La
reescritura **conserva** paridad con CrewChief, las reglas de diseño
(IA no decide, 20 Hz, detección ≠ messaging, defaults locked) y el
comportamiento verificado del spotter LMU. La principal diferencia es
la **lista explícita** de 25+ módulos CC a portar en alphas, y la
**matriz de paridad LMU-01..48** que es la fuente de verdad del
progreso. Voice contract VC-A01..VC-R04 y los tests de suite CC son
el segundo anillo de seguridad para no degradar la calidad durante la
reescritura.

**La paridad con CrewChief no se implementa desde la matriz ni desde
la auditoría general. Cada feature exige mini-auditoría específica
contra `https://gitlab.com/mr_belowski/CrewChiefV4` antes de tocar
código. Sin evidencia, la feature es `NO_VERIFICADO` y se bloquea.**
