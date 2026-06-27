# Plan Actual — Vantare Ingeniero Go

> **Estado:** G2 (Alpha 2) en curso 2026-06-28 — 2 features implementadas
> (RaceTime, PearlsOfWisdom). Resto de G2 marcado como GAP: requieren
> campos de telemetría LMU no expuestos en el parser del ingeniero
> (tyre temp/wear, engine temp, battery, DRS, multiclass class, opponent
> pitting, sector times, driver stint). Requieren live capture LMU o
> ampliaciones del parser antes de implementar.
>
> **Próxima fase activa:** G3 (Alpha 3) — Pit Manager + PTT + installer.
> (TyreMonitor/EngineMonitor etc. siguen en GAP hasta validar offsets
> en pista.)
>
> **Worktree canónico:** `C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2-engineer`.
> **Submódulo de código:** `vantare-v2/` dentro del worktree.

## 1. Objetivo en lenguaje simple

Cerrar la **prealpha** del spotter LMU con paridad CrewChief confirmada en
pista. Después, portar el **ingeniero determinista** que el Python v0.7
ya validó, módulo a módulo, en alphas medidas por la matriz LMU-01..48.
La IA nunca decide datos críticos. El monolito se mantiene Go/Wails sin
daemon, sin microservicios, sin overlays in-game.

## 2. Estado técnico actual (Go, verificado)

Esta sección refleja **solo lo confirmado en código o tests** del
worktree. Para el estado aspiracional ver
`vantare-go-master-plan.md` § 13 y `INDEX.md` § 5.

### 2.1 Confirmado en código

- **Spotter lateral CrewChief X/Z.** `vantare-v2/internal/engineer/spotter/`
  - `overlap.go` con `TrackZoneToConsiderM=20.0`, `CarLengthM=4.5`,
    `CarWidthM=1.8`, `CarBehindExtraM=0.4`, `GapNeededForClearM=0.5`.
  - `geometry.go` con `Classify` y `ClassifyWithActiveSides`.
  - `state.go` con `Machine` y constantes locked:
    `detectionHoldMS=350`, `clearDelayMS=150`, `stillThereRepeatMS=2500`,
    `messageExpiryMS=2000`, `clearExpiryMS=2000`.
  - `debug.go` con `WriteDebugRecordsJSONL` (helper, no invocado desde
    CLI todavía).
  - Tests en `*_test.go` para geometry, overlap, state, alignment.

- **Audio queue.** `vantare-v2/internal/engineer/audio/queue.go`
  - Orden por `Priority` desc + `CreatedAt` asc.
  - Filtrado por `ExpiresAt`.

- **Player con kill.** `vantare-v2/internal/engineer/audio/player_windows.go`
  - `stopLocked()` mata el proceso PowerShell activo (timeout 2s).
  - `Play` siempre interrumpe lo previo.

- **Parser widgets.** `vantare-v2/internal/telemetry/lmu/parser.go`
  - Lee: Fuel, FuelCap, GamePhase, Place, VehicleClass, BestLapTime,
    LastLapTime, TimeBehindLeader, TimeBehindNext, Penalties,
    LapDistance, PitState, IsPlayer, InPits.

- **HTTP server.** `vantare-v2/internal/server/server.go`
  - Añadido `GET /api/engineer/health` (cambio sin commit).

- **Buffer provider y source lmu.**
  `vantare-v2/internal/app/lmu_enriched_source.go` añade
  `ReadEngineerFrame()` que reusa el mmap existente (sin abrir segundo
  reader). Cambio sin commit.

### 2.2 Cambios sin commit relevantes (a 2026-06-27)

Estos archivos están modificados o son nuevos pero todavía no tienen
commit. La descripción es insumo para mini-auditorías futuras, no
spec estable.

- `vantare-v2/internal/engineer/lmu/parser.go` (nuevo): lee solo
  geometría (Position, Orientation) desde el mmap; **no** lee Fuel,
  GamePhase, Penalties ni VehicleClass. Para esos campos se reusa
  `internal/telemetry/lmu/parser.go` (parser público de widgets).
- `vantare-v2/internal/engineer/service/engineer_service.go`: añade
  `BufferProvider`, `SetBufferProvider`, `dropCount`, y rama
  `case "lmu"` en `telemetryLoop` que construye `OverlaysLiveAdapter`.
- `vantare-v2/internal/server/server.go`: añade `handleEngineerHealth`.

### 2.3 NO implementado (claims del audit 2026-06-27 verificados)

Estas features faltan en el worktree. Cualquier uso como si existieran
es incorrecto.

- `ValidityRule` y `ValidationData` en `audio.Message` (no existen).
- `Runtime.IsMessageStillValid` (no existe).
- `minSpotterSpeedMPS` (gate de velocidad en spotter). `Classify` no
  consulta `frame.Player.Speed`.
- `cmd/lmu-debug -jsonl` (flag no existe; flags reales: `-once -mock -hz`).
- Replay JSONL fixtures persistentes bajo
  `internal/engineer/replay/testdata/`.
- `internal/tts/`, `internal/{sim,config,persistence,cli}/`,
  `internal/engineer/modules/`. **No existen**; cualquier doc que los
  cite como existentes está desactualizado.

### 2.4 Estado técnico actual (Python — referencia)

- v0.7.0 publicada 2026-06-15.
- 25 módulos CrewChief portados y validados en pista.
- 1194 tests backend + 304 tests frontend verdes.
- TTS pipeline Edge + Gemini con fallback.
- Frases editables, personalidades, i18n ES/EN.
- Pit menu dry-run + confirm. REST `:6397` integrado.
- Auto-update GitHub Releases funcionando.
- NSIS installer.

## 3. Objetivo actual

**Cerrar prealpha de forma segura.** Foco técnico inmediato (orden
recomendado, cada tarea con su mini-auditoría):

1. **Auditar y decidir sobre los cambios sin commit** del worktree:
   `internal/engineer/lmu/`, `OverlaysLiveAdapter`, `/api/engineer/health`.
   Sin esto, ni el plan maestro ni el gate prealpha reflejan el estado
   real.
2. **Crear `cmd/spotter-debug`** que invoque
   `WriteDebugRecordsJSONL` por frame. Sustituye la referencia rota a
   `cmd/lmu-debug -jsonl` que aparece en `current-plan.md` viejo, en
   `prealpha-gate.md` y en `prealpha-next-steps.md`.
3. **Implementar gate de velocidad** `minSpotterSpeedMPS=10.0` en
   `Classify`/`ClassifyWithActiveSides`. Mini-auditoría:
   `NoisyCartesianCoordinateSpotter.cs:56,297` (gate actual de CC =
   user setting `min_speed_for_spotter`).
4. **Implementar `ValidityRule` + `Runtime.IsMessageStillValid`** para
   validar stale antes de `Enqueue`. Mini-auditoría:
   `QueuedMessage.cs` + `AbstractEvent.cs` (CC).
5. **Integrar `Player.Play` en `queueLoop`** (o nuevo `audio.Scheduler`
   separado). Hoy `Player` interrumpe físicamente pero nadie lo llama.
6. **Crear fixtures de replay persistentes** bajo
   `internal/engineer/replay/testdata/` (left-basic, right-basic,
   three-wide, all-clear) con `simulator.Build`, ≥5 frames cada uno.
7. **Reconciliar defaults locked con código real y CC.** Ver
   `vantare-go-master-plan.md` § 5 actualizado.
8. **Capturar sesión LMU real** y validar comportamiento en pista.
   (No automatizable desde el agente.)
9. **Confirmar reconexión del reader LMU** tras arranque tardío.
10. **Confirmar comportamiento sin panic** al salir a menú.
11. **Validar `clearDelayMS=150`** con trazas reales LMU.

## 4. Dentro de alcance

- Cambios pequeños en Go en spotter, replay, runtime o audio cuando
  estén respaldados por tests.
- Debug output o registros JSONL que hagan inspeccionable el
  comportamiento live.
- Documentación que mejore el control de agentes (este paquete).
- Tests enfocados para geometría, estado, replay y mensajes stale.
- Traducción de matrices, constantes y reglas heredadas del Python v0.7.

## 5. Fuera de alcance

- Race-control modules (Flags, Penalties, Damage, ConditionsMonitor,
  FrozenOrderMonitor). Pendientes para alpha 1.
- Core race modules (LapTimes, LapCounter, PushNow, SessionEnd, Fuel,
  PitStops). Pendientes para alpha 1.
- Vehicle y opponents modules. Pendientes para alpha 2.
- LLM/IA como capa decisoria. Regla 1 del plan maestro.
- Pit Manager LMU REST write con UI. Pendiente para alpha 3.
- iRacing, AC, AC EVO. Pendiente para 1.0/1.1.
- Suite Go overlay opcional. Pendiente para 1.1.
- Voice clone. Pendiente para 1.0.
- Redesiseño de UI más allá de lo necesario para testear.
- Dependencias nuevas sin aprobación.
- Bindings Wails versionados (se regeneran).

## 6. Estado de las tareas de G0 (Prealpha)

G0 cerrada 2026-06-28. Las 5 tareas pequeñas priorizadas en este mismo
apartado (versión previa) están todas completadas:

| Tarea | Commit | Estado |
|---|---|---|
| `cmd/spotter-debug` con JSONL real | `ed1e8dc` | ✓ CONFIRMADO |
| Gate `minSpotterSpeedMPS=10.0` | `8eeb0c4` | ✓ CONFIRMADO |
| `ValidityRule` + `IsMessageStillValid` | `60d752d` | ✓ CONFIRMADO |
| Fixtures replay persistentes | `1b7f3a7` | ✓ CONFIRMADO |
| Integrar `Player.Play` en `queueLoop` | `6666654` | ✓ CONFIRMADO |

Complemento G0: `internal/tts/` (Engine + Cache + MockProvider) en
`6de7cf2`, `verify-prealpha.ps1` en `acdcfbd`.

### Pendiente para cerrar G0 (manual)

Requiere sesión de Isaac con LMU abierto — no automatizable desde
agente:

- Captura side-by-side real LMU ≥1 min tráfico (gate `prealpha-gate.md`
  § 1.2).
- Validación en ≥3 circuitos (G0.10, gate § 1.6).

### Estado de G1 (Alpha 1)

G1 cerrada 2026-06-28. 12 features implementadas con mini-auditoría CC
mínima o declarada GAP, cada una con tests table-driven y commit
atómico:

| Tarea | Commit | Estado |
|---|---|---|
| G1.1 FlagsMonitor (LMU-15) + spotter FCY pause | `aaed5b2` | ✓ CONFIRMADO |
| G1.2 Penalties (LMU-13) | `70b6430` | ✓ CONFIRMADO |
| G1.6+1.7 LapTimes + LapCounter (LMU-21,22,08) | `c5b0788` | ✓ CONFIRMADO |
| G1.7 PushNow (LMU-19) | `d92e7c3` | ✓ CONFIRMADO |
| G1.8 SessionEndMessages (LMU-28) | `d92e7c3` | ✓ CONFIRMADO |
| G1.9 Fuel (LMU-06) | `95dc9b2` | ✓ CONFIRMADO |
| G1.10 PitStops (LMU-16,17) | `95dc9b2` | ✓ CONFIRMADO |
| G1.11 Position (LMU-20,27) | `95dc9b2` | ✓ CONFIRMADO |
| G1.12 Timings (LMU-10,31,32) | `b38f335` | ✓ CONFIRMADO |
| G1.3 DamageReporting (LMU-09) | GAP | requiere live capture |
| G1.4 ConditionsMonitor (LMU-30) | GAP | requiere live capture |
| G1.5 FrozenOrderMonitor (LMU-07) | GAP | no aplica a LMU |

### Estado de G2 (Alpha 2)

G2 en curso 2026-06-28. 2 features implementadas, 8 marcadas como GAP
que requieren live capture LMU o ampliaciones del parser del ingeniero:

| Tarea | Commit | Estado |
|---|---|---|
| G2.1 RaceTime (5/2/0 min remaining) | siguiente | ✓ CONFIRMADO |
| G2.11 PearlsOfWisdom (per-race) | siguiente | ✓ CONFIRMADO |
| G2.2 OpponentMessages (rival fast lap) | GAP | BestLapTime por oponente no en `parseVehicleEngineerScoring` |
| G2.3 TyreMonitor (LMU-11, 18) | GAP | temp/wear offsets LMU no leídos |
| G2.4 EngineMonitor (LMU-29) | GAP | water/oil temp offsets LMU no leídos |
| G2.5 Battery (Hypercar SOC) | GAP | LMU reusa `mFuel` como proxy; no se lee SOC separado |
| G2.6 OvertakingAids (DRS/PTP) | GAP | DRS state offset no en parser |
| G2.7 MulticlassWarnings (3 escenarios) | GAP | `VehicleClass` por vehículo no se popula en modelo ingeniero (sí en público) |
| G2.8 Opponents (pit/pos) | GAP | `InPits` por oponente no en `parseVehicleEngineerScoring` |
| G2.9 WatchedOpponents (LMU-34) | GAP | depende de Opponents MVP |
| G2.10 Strategy (sector fuel) | GAP | sector times per-vehicle no leídos |
| G2.12 DriverSwaps (stint countdown) | GAP | `driver_stint_seconds_remaining` no en parser |

## 7. Riesgos actuales

- **Cambios sin commit sin revisar:** el worktree tiene ~400 líneas
  modificadas en `internal/{engineer,server,app}/` que no están en
  HEAD. El plan maestro y el gate prealpha no los reflejan. Cualquier
  tarea que arranque debe primero auditar esos cambios.
- **Confianza live del spotter** aún depende de trazas reales LMU.
  Ningún test cubre captura real, solo fixtures sintéticos.
- **Mensajes audio stale** pueden producir `clear` incorrecto si se
  reproducen tarde. `Runtime.IsMessageStillValid` no existe
  todavía.
- **Agentes sobreajustando tests por intuición** si saltan los docs
  de CrewChief. Mitigado con mini-auditoría obligatoria por feature.
- **Cambios en frontend/bindings generados** pueden distraer del foco
  prealpha.
- **Kokoro no instalado.** Edge TTS es el único provider funcional.
  Kokoro queda como stub hasta que se decida instalarlo.
- **`npm test` en frontend es placeholder.** No bloquea el miniplan
  activo.
- **Workspace `vantare-v2`** exige separación estricta entre
  WidgetStudio y LayoutStudio; el Ingeniero no comparte esa
  restricción pero conviene evitar cruces accidentales.

## 8. No cambiar sin aprobación

- Convención de signos del spotter (alineada con CrewChief X/Z).
- Fórmula de yaw/alignment estilo CrewChief
  (`atan2(Row2.X, Row2.Z)`).
- Bindings Wails generados.
- Dependencias en `go.mod`.
- Estructura de arquitectura grande.
- Defaults Locked del plan maestro.
- Reglas no negociables (1-10).
- Forma del monolito en `0001-prealpha-architecture.md`.

## 9. Regla CrewChief antes de implementar

> **Origen:** `agent-workflow.md` § 4, `README.md` § 3.

Antes de cualquier feature que reclame paridad CrewChief, hay que
analizar la feature concreta en el repositorio fuente
`https://gitlab.com/mr_belowski/CrewChiefV4`. El resultado debe
quedar en el miniplan o en un anexo de auditoría con archivos,
funciones, constantes/cooldowns/gates, campos de telemetría,
comportamiento actual en Go, gap exacto y tests esperados. Si no
hay evidencia fuente suficiente, la tarea se marca `NO_VERIFICADO` y
no se implementa como paridad.

## 10. Cómo actualizar este archivo

Después de cualquier tarea que cambie el estado del proyecto,
actualiza solo las secciones relevantes. Mantén los cambios cortos y
concretos. Si descubres una nueva lección heredable del Python v0.7,
propón actualizarla en plan maestro con evidencia antes de tocarla
aquí.

## 11. Reglas operativas para tareas documentales

> Esta sección sustituye una regla temporal del pase 2026-06-27 que
> limitaba el alcance a `docs/engineer/`. Esa restricción era válida
> solo para aquel pase; la regla general cubre cualquier tarea
> documental futura.

- El alcance lo define el **prompt de la tarea**, no una carpeta
  prefijada. Las tareas documentales pueden tocar
  `docs/engineer/`, `docs/master-plan-go.md`,
  `docs/current-work-go.md` u otros docs raíz según pida el usuario.
- **No** tocar código Go, frontend, `go.mod`, `package.json` ni
  tests como parte de una tarea puramente documental. Si la tarea
  documental detecta que hace falta un cambio de código, parar y
  pedir aprobación antes de tocar nada fuera de docs.
- No mezclar docs con feature, bugfix o refactor: si la limpieza
  documental obliga a tocar algo más, abrir tarea separada.
- **No** hacer commit a menos que el usuario lo pida
  explícitamente, incluso si la tarea parece puramente documental.
- Al terminar, reportar: archivos creados/modificados/movidos,
  comandos o checks ejecutados y resultado, referencias erróneas
  que queden intencionalmente dentro de docs históricos o informes
  de auditoría, y confirmación de no haber tocado código.
