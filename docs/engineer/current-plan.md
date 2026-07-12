# Plan Actual — Vantare Ingeniero Go

> **Estado:** G2 (Alpha 2) cerrada 2026-06-28 con código review verde
> — 2 features implementadas (RaceTime, PearlsOfWisdom). 8 features
> marcadas como GAP: requieren campos de telemetría LMU no expuestos en
> el parser del ingeniero (tyre temp/wear, engine temp, battery, DRS,
> multiclass class, opponent pitting, sector times, driver stint).
> Requieren live capture LMU o ampliaciones del parser antes de
> implementar.
>
> **Próxima fase activa:** G3 (Alpha 3) — Pit Manager LMU REST + PTT
> command catalog ≥14 tools + grid side + FCY pause + duck_lmu + NSIS
> installer.
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

> **Nota:** Las features marcadas como `CONFIRMADO` ahora entran al
> ciclo iterativo §12. Re-apertura pendiente: cada feature se
> re-auditará contra CC y se reabrirá como `ITER-N` si hay gaps
> materiales.

| Tarea | Commit | Estado |
|---|---|---|
| G1.1 FlagsMonitor (LMU-15) + spotter FCY pause | `aaed5b2` | `ITER-1` (re-auditoría pendiente: FCY pause min/max, reminder cooldowns) |
| G1.2 Penalties (LMU-13) | `70b6430` | `ITER-1` (re-auditoría pendiente: tipos DT/SG vía Extended buffer) |
| G1.6+1.7 LapTimes + LapCounter (LMU-21,22,08) | `c5b0788` | `ITER-1` (re-auditoría pendiente: consistencyLimit, ramas por Place) |
| G1.7 PushNow (LMU-19) | `d92e7c3` | `ITER-1` (re-auditoría pendiente: pushWindowLaps por TrackLengthClass) |
| G1.8 SessionEndMessages (LMU-28) | `d92e7c3` | `ITER-1` (re-auditoría pendiente: minSessionRunTimeForEndMessages=60s CC) |
| G1.9 Fuel (LMU-06) | `95dc9b2` | `ITER-1` (re-auditoría pendiente: fuelUseByLapsWindowLength por class) |
| G1.10 PitStops (LMU-16,17) | `95dc9b2` | `ITER-1` (re-auditoría pendiente: one_hundred_metres/fifty_metres/box_now) |
| G1.11 Position (LMU-20,27) | `95dc9b2` | `ITER-1` (re-auditoría pendiente: minTimeToWaitBeforeReportingPass=4s, minTimeBetweenOvertakeMessages=20s) |
| G1.12 Timings (LMU-10,31,32) | `b38f335` | `ITER-1` (re-auditoría pendiente: frequency_of_gap_*_reports CC) |
| G1.3 DamageReporting (LMU-09) | GAP | `NO_AUDITED` — pendiente live capture + auditoría CC `DamageReporting.cs` |
| G1.4 ConditionsMonitor (LMU-30) | GAP | `NO_AUDITED` — pendiente live capture + auditoría CC `ConditionsMonitor.cs` |
| G1.5 FrozenOrderMonitor (LMU-07) | GAP | no aplica a LMU |

### Estado de G2 (Alpha 2) — Revisión completa 2026-06-28

G2 cerrada tras revisión masiva de paridad CC. Resultado: **14 features
implementadas** (G2.1, G2.2, G2.3, G2.4, G2.7, G2.8, G2.11 + iteraciones
de las features G1 que estaban marcadas como cerradas pero ahora están
`ITER-N` con paridad expandida). 2 features no aplican a LMU (Battery,
DRS). 3 features pendientes (G2.9, G2.10, G2.12) requieren datos LMU
no expuestos o son G3+ scope.

| Tarea | Estado | Paridad CC |
|---|---|---|
| G2.1 RaceTime (20/15/10/5/2/0 min) | ✓ CERRADO | `PARITY_OK` (extended to 20/15/10 markers + halfway + pearl disable) |
| G2.11 PearlsOfWisdom | ✓ CERRADO | `ITER-2` (extended: PearlType, 30s cooldown, disabled flag) |
| G2.2 OpponentMessages (rival fast lap) | ✓ CERRADO | `ITER-2` (class filter + min laps + cooldown) |
| G2.7 MulticlassWarnings (3 escenarios) | ✓ CERRADO | `PARITY_PARTIAL` (MVP: faster/slower behind/ahead + 4s/6s cooldowns; full CC `PARITY_BLOCKED` for 17 audio folders + fighting detection + bestLap-per-class) |
| G2.8 Opponents (pit/pos) | ✓ CERRADO | `ITER-3` (leader/ahead/behind pitting + lead changed + min improvement threshold) |
| G2.3 TyreMonitor (LMU-11, 18) | ✓ CERRADO | `ITER-3` (2-lap delay + wear_minor + CC thresholds) |
| G2.4 EngineMonitor (LMU-29) | ✓ CERRADO | `ITER-3` (60s moving avg + all-clear + stalled + phase gate) |
| G2.5 Battery (Hypercar SOC) | no aplica | LMU no expone SOC separado (decisión de producto) |
| G2.6 OvertakingAids (DRS/PTP) | no aplica | LMU no expone DRS state (decisión de producto) |
| G2.9 WatchedOpponents (LMU-34) | GAP | requiere `WatchedOpponents.cs` (per-sector/class/tires tracking) — G3+ scope |
| G2.10 Strategy (sector fuel) | GAP | sector times per-vehicle + FuelUsageStore persistence — G3+ scope |
| G2.12 DriverSwaps (stint countdown) | GAP | requiere REST LMU o Extended buffer — G3+ scope |

#### Cambios estructurales G2 — Runtime

Antes de la revisión: solo 4 monitores cableados (engine, tyre,
opponents, multiclass). Ahora: **14 monitores** cableados al runtime
vía adaptadores triviales. Todos emiten al SSE con Category/Severity
dinámicos y Payload preservado.

Monitores cableados en `internal/engineer/core/runtime.go`:

| Monitor | Adapter | Eventos |
|---|---|---|
| engine | `engineMonitor` | water/oil temp high/critical/all-clear + stalled (7) |
| tyre | `tyreMonitorWrap` | temp high/optimal/overheating + wear high/minor (5) |
| opponents | `opponentsMonitorWrap` | pitted, best_lap, class_different, leader/ahead/behind pitted, lead_changed (7) |
| multiclass | `multiclassMonitorWrap` | faster_behind, slower_ahead (2) |
| flags | `flagsAdapter` | fcy started/ended, blue/yellow/double-yellow/white/black (7) |
| fuel | `fuelAdapter` | low_half_tank, low_2l, low_1l (3) |
| penalties | `penaltiesAdapter` | new_drivethrough, new_stopgo (2) |
| laps | `lapsAdapter` | lap_completed, fastest_lap, last_lap, two_to_go (4) |
| position | `positionAdapter` | gained, lost, start terrible/bad/good/ok (6) |
| push | `pushAdapter` | push_now, push_to_improve/win/second/third/hold (6) |
| racetime | `raceTimeAdapter` | 20/15/10/5/2/0 min + halfway (7) |
| sessionend | `sessionEndAdapter` | ended, won, podium, finished, good_finish, last, dnf, dsq, pole, ended_qual (10) |
| timings | `timingsAdapter` | gap_report (1) |
| pearls | `pearlsAdapter` | pearl (1) |
| pitstops | `pitStopsAdapter` | entry, exit, engage_limiter, disengage_limiter, watch_your_speed (5) |

**Total: 73 eventos de monitor + 7 spotter = 80 text keys** mapeados
a traducciones ES en `service/notification.go`.

#### Test end-to-end (canary)

`TestEngineerService_EndToEnd_MonitorEventViaSSE` valida que un evento
de monitor (engine.water_temp_high) llega al SSE subscriber con:
- `Category: "engine"` (correcto, no hardcoded "spotter")
- `Severity: "info"` (correcto)
- `Text: "Temperatura del agua alta"` (traducido, no raw key)
- `TextKey: "engine.water_temp_high"` (disponible para lógica)
- `Payload: {waterTemp: 106}` (preservado)

Este test es el guardrail: cualquier cambio que rompa el flujo
runtime → queue → SSE será detectado inmediatamente.

#### Monitores cableados en runtime

Los monitores `engine`, `tyre`, y `opponents` están cableados en
`internal/engineer/core/runtime.go` via interfaz `Monitor` + adapters.
`ProcessFrame` ahora procesa eventos del spotter Y de los monitores,
encolando mensajes al `audio.Queue` con `PriorityNormal`.

#### Offsets de temperatura implementados (2ª captura driving)

Offsets u8 en el bloque vehicleTelemetry del jugador (base 128468),
identificados en la grabación de 20s a 10Hz
(`docs/lmu-capture/driving/driving-report.md`):

| Offset (rel) | Campo | Rango observado |
|---|---|---|
| +175 | tyreTempFL | 64 → 116 |
| +182 | tyreTempFR | 97 → 115 |
| +239 | tyreTempRL | 63 → 191 |
| +263 | tyreTempRR | 109 → 191 |
| +191 | engineWaterTemp | 94 → 153 |
| +278 | engineOilTemp | 137 → 160 |
| +411 | brakeTempFL | 105 → 179 |
| +443 | brakeTempFR | 105 → 179 |
| +786 | tyreWearFL | delta menor |
| +790 | tyreWearFR | delta menor |

Pendiente: cross-referenciar con `RF2Data.cs` para confirmar mapeo
exacto de cada neumático (FL/FR/RL/RR) y brake temps traseros.

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

## 12. Ciclo iterativo de paridad CrewChief

> **Origen:** conversación 2026-06-28 — el usuario pidió iterar la
> paridad CC hasta la máxima convergencia posible, no quedándose con
> la primera versión funcional. Esta sección operacionaliza la regla
> §9 ("Regla CrewChief antes de implementar") en un bucle cerrado.

### 12.1 Principio

Para cada feature que reclama paridad con CrewChief V4, el flujo NO es
**una sola pasada** (auditar → implementar → cerrar). Es un **bucle de
iteración**:

```
   ┌───────────────────────────────────────────────┐
   ▼                                               │
[1] AUDITAR CC                                     │
     • Leer el archivo .cs relevante               │
     • Extraer constantes, cooldowns, gates        │
     • Identificar TODOS los mensajes disparados   │
     • Mapear campos de telemetría requeridos      │
                                                │
[2] IMPLEMENTAR Vantare (iteración N)              │
     • Go monitor + tests                          │
     • Cablear en runtime                          │
     • Documentar diferencias                      │
                                                │
[3] RE-AUDITAR (comparar Vantare N vs CC)         │
     • ¿Qué constantes aún no coinciden?           │
     • ¿Qué mensajes CC no disparamos?             │
     • ¿Qué gates / cooldowns faltan?               │
     • ¿Qué clases de telemetría no leemos?        │
                                                │
[4] ¿Hay diferencias materiales?                   │
     • NO → CERRADO (parity achieved)              │
     • SÍ → volver a [2] con iteración N+1         │
```

El bucle termina solo cuando la siguiente re-auditoría no encuentra
diferencias materiales, o cuando se documenta explícitamente que la
diferencia es **deliberada** (justificada por: no aplica a LMU,
decisión de UX, cobertura futura en G-x, etc.).

### 12.2 Estados de paridad por feature

Cada feature G-x.y se etiqueta con uno de estos estados:

| Estado | Significado |
|---|---|
| `NO_AUDITED` | Aún no se ha mirado CC. |
| `AUDITED` | Se leyó CC, se documentaron constantes/mensajes, falta implementar. |
| `ITER-N` | En bucle. N es el número de iteración de implementación (1, 2, 3...). |
| `PARITY_OK` | Última re-auditoría no encontró diferencias materiales. |
| `PARITY_PARTIAL` | Iteración convergió pero con diferencias documentadas y aceptadas. |
| `PARITY_BLOCKED` | Diferencias que requieren buffer/telemetría no disponible en LMU (ej. Extended buffer). |

### 12.3 Plantilla de mini-auditoría por iteración

Cada iteración genera un mini-doc bajo
`docs/engineer/audits/Gx.y-iter-N.md` con esta estructura:

```markdown
# G2.x — Iteración N — Paridad CC

## Fuente CC
- Archivo: Events/Xxx.cs (commit CC o rama)
- Líneas relevantes: ...
- Constantes extraídas: ...
- Mensajes disparados: ...

## Estado Vantare (iteración N-1)
- Implementación actual: `internal/engineer/xxx/monitor.go`
- Constantes usadas: ...
- Mensajes disparados: ...
- Gaps conocidos: ...

## Cambios en iteración N
- Constantes corregidas: ...
- Mensajes añadidos: ...
- Gates añadidos: ...
- Cooldowns añadidos: ...

## Re-auditoría post-iteración N
- ¿Persisten diferencias materiales? Sí/No
- Si sí, lista para iteración N+1
- Si no, PARITY_OK y commit
```

### 12.4 Aplicación al estado actual (2026-06-28)

Tras la revisión masiva de paridad CC (4 subagentes en paralelo):

| Feature | Iteraciones aplicadas | Estado final |
|---|---|---|
| G0 Spotter | 1 (stillThereRepeatMS 2500→3000, messageExpiryMS 2000→1000) | `PARITY_OK` |
| G1.1 FlagsMonitor | 1 (yellow/double-yellow/white/black + cooldowns + gates) | `PARITY_OK` (Falta solo FCY sectors + voice folder per-sector) |
| G1.2 Penalties | 1 (preparado para DT/SG via mLastHistoryMessage) | `PARITY_BLOCKED` (requiere Extended buffer) |
| G1.6+1.7 LapTimes | 1 (added last_lap, two_to_go) | `PARITY_OK` |
| G1.7 PushNow | 1 (pushWindowLaps por TrackLengthClass, pushWindowTime, eventos por posición P2/P3/P4) | `PARITY_OK` |
| G1.8 SessionEndMessages | 1 (won/podium/finished/good/last/dnf/dsq/pole/ended_qual) | `PARITY_OK` |
| G1.9 Fuel | 1 (added 2L warning + refuel detection + 30s cooldown) | `PARITY_PARTIAL` (falta per-lap consumption window) |
| G1.10 PitStops | 1 (engage_limiter, disengage_limiter, watch_speed) | `PARITY_PARTIAL` (falta one_hundred_metres/fifty_metres/box_now — requiere PitInfo buffer) |
| G1.11 Position | 1 (start_terrible/bad/good/ok + session reset) | `PARITY_PARTIAL` (falta overtake detection con gap analysis) |
| G1.12 Timings | 1 (gap_status: close/increasing/decreasing/stable, trend analysis) | `PARITY_OK` |
| G2.1 RaceTime | 1 (20/15/10 min + halfway + pearl disable) | `PARITY_OK` |
| G2.2 OpponentMessages | 2 (class filter + min laps + cooldown) | `PARITY_OK` |
| G2.3 TyreMonitor | 3 (CC thresholds + 2-lap delay + wear_minor) | `PARITY_PARTIAL` (Tyre type + inner/middle/outer + brake temps `PARITY_BLOCKED`) |
| G2.4 EngineMonitor | 3 (60s moving avg + all-clear + stalled + phase gate) | `PARITY_PARTIAL` (oil/fuel pressure `PARITY_BLOCKED`) |
| G2.7 MulticlassWarnings | 2 (creado MVP: faster/slower + 4s/6s cooldowns) | `PARITY_PARTIAL` (17 audio folders + fighting `PARITY_BLOCKED`) |
| G2.8 Opponents | 3 (leader/ahead/behind pitting + lead_changed + min improvement 0.05s) | `PARITY_PARTIAL` (retirements/DQs `PARITY_BLOCKED`) |
| G2.11 PearlsOfWisdom | 1 (PearlType + 30s cooldown + SetDisabled) | `PARITY_PARTIAL` (falta probability mechanism + overtake pearls) |

#### Gap estructurales resueltos en esta iteración

1. **Runtime no estaba cableando 10 de los 14 monitores.** Ahora todos
   están cableados vía adaptadores triviales. Test end-to-end
   (`TestEngineerService_EndToEnd_MonitorEventViaSSE`) valida que un
   evento de monitor llega correctamente al SSE con Category/Severity/
   Text correctos.

2. **Sin translations para los 64 nuevos text keys.** Ahora todos
   mapeados a ES en `service/notification.go`.

3. **Sin categorías en audio.Category** para los nuevos monitores.
   Añadidas 12 constantes: Multiclass, Flags, Fuel, Penalties, Laps,
   Position, Push, RaceTime, SessionEnd, Timings, Pearls, PitStops.

#### Gaps residuales que requieren trabajo adicional (no `PARITY_OK`)

| Gap | Acción siguiente |
|---|---|
| Spotter: opponent stack check (3 coches lado-a-lado) | Iter-2: `geometry.go` segunda pasada para detectar `carsOnLeft > 1 && delta < carWidthM` |
| Spotter: grid side detection | Iter-2: leer `GamePhase==Formation` y añadir gate ±2m en `Classify` |
| FlagsMonitor: sector yellow flag per-sector | ✅ `PARITY_OK` — sector-level yellow, 10s cooldown, all-clear |
| Fuel: per-lap consumption + 4/3/2/1 laps remaining | Iter-3: ventana móvil 3-1 laps según TrackLengthClass |
| PitStops: one_hundred_metres/fifty_metres/box_now | Iter-2: requiere `PitInfo` buffer LMU |
| Position: overtake detection | Iter-2: ring buffer gap samples + minTimeToWaitBeforeReportingPass=4s |
| TyreMonitor: tyre type + inner/middle/outer | `PARITY_BLOCKED` — requiere `LMUWheel` struct decode |
| EngineMonitor: oil/fuel pressure | `PARITY_BLOCKED` — requiere Extended buffer |
| MulticlassWarnings: 17 audio folders | Iter-3: per-class audio dispatch + fighting detection |
| OpponentsMonitor: retirements/DQs | `PARITY_BLOCKED` — requiere scoring extendido |
| PearlsOfWisdom: probability mechanism | ✅ `PARITY_OK` — probability 0.7, context pearl type, last-2-laps disable |

#### Pendientes G3+

- **G2.9 WatchedOpponents** — `WatchedOpponents.cs` (per-sector/class/tires tracking).
- **G2.10 Strategy** — sector times per-vehicle + `FuelUsageStore` persistence.
- **G2.12 DriverSwaps** — `driver_stint_seconds_remaining` requiere REST LMU o Extended buffer.

### 12.5 Aplicación a features pendientes (G3+)

Cualquier feature nueva o GAP pendiente (G2.9, G2.10, G2.12; G3.1+
Pit Manager; etc.) entra al bucle desde el inicio:

1. `AUDITED` → leer CC, documentar
2. `ITER-1` → implementar MVP mínimo viable
3. Re-auditar → si gaps, `ITER-2`
4. Repetir hasta `PARITY_OK` o `PARITY_PARTIAL` documentado

### 12.6 Reglas del bucle

- **No cerrar feature como "implementada" hasta llegar a `PARITY_OK`
  o `PARITY_PARTIAL` documentado.** Cierre prematuro congela gaps.
- Cada iteración produce un commit atómico con el mini-doc
  correspondiente.
- Si una iteración descubre que la telemetría LMU no expone un
  campo necesario (ej. `engineWaterTempWarning` flag de CC), marcar
  `PARITY_BLOCKED` y enlazar al GAP correspondiente en la matriz
  LMU-01..48. No fingir paridad.
- El umbral para "diferencia material" es: afecta timings,
  cooldowns, gates, mensajes que el usuario oye, o clases de
  telemetría. Diferencias puramente cosméticas (orden de imports,
  nombre de variable) no cuentan.
