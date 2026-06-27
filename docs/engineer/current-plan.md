# Plan Actual — Vantare Ingeniero Go

> **Estado:** activo.
> **Última revisión:** 2026-06-27 (pase editorial: § 11 reescrita como
> regla general para tareas documentales; referencias a
> `cmd/lmu-debug -jsonl` y paths de fixtures siguen marcadas como
> NO_IMPLEMENTADO hasta que `cmd/spotter-debug` exista).
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

## 6. Próximas 5 tareas pequeñas (concreto)

> Cada tarea respeta el contrato del miniplan definido en
> `agent-workflow.md` § 5. Para features CrewChief, mini-auditoría
> específica en el prompt (ver `agent-workflow.md` § 4).

### Tarea 1 — Crear `cmd/spotter-debug`

- **Objetivo:** sustituir `cmd/lmu-debug -jsonl` por un binario que sí
  existe y exporta JSONL spotter real.
- **Alcance:**
  - Nuevo `vantare-v2/cmd/spotter-debug/main.go`.
  - Banderas: `-hz -out -mock -source={simulator,replay,lmu}`.
  - Reutiliza `spotter.WriteDebugRecordsJSONL`.
- **Archivos prohibidos:** cambiar `cmd/lmu-debug`, frontend, `go.mod`.
- **Criterios de aceptación:**
  - `go run ./cmd/spotter-debug -mock -out /tmp/out.jsonl` produce
    ≥1 línea por frame con
    `alignedX/alignedZ/side/inOverlap/rejectReason`.
  - Tests `go test ./cmd/spotter-debug/... -v` verdes.
- **Verificación:** `go run ./cmd/spotter-debug -mock -out out.jsonl` +
  inspección manual.
- **Rollback:** borrar `cmd/spotter-debug/` y restaurar docs.

### Tarea 2 — Gate `minSpotterSpeedMPS=10.0`

- **Objetivo:** silenciar spotter si el jugador está parado.
- **Alcance:**
  - `vantare-v2/internal/engineer/spotter/geometry.go` (gate en
    `Classify` y `ClassifyWithActiveSides`).
  - `vantare-v2/internal/engineer/spotter/geometry_test.go` (test
    nuevo).
- **Mini-auditoría CrewChief:** `NoisyCartesianCoordinateSpotter.cs:56`
  (`minSpeedForSpotterToOperate`, user setting `min_speed_for_spotter`).
  Estado: `CONFIRMADO` para el gate; el valor exacto del default no
  es verificable en este repo (default user setting no presente).
- **Archivos prohibidos:** tipos exportados, defaults locked distintos
  al 10.0 (cambio de default requiere evidencia live), audio.
- **Criterios:** frame con `Player.Speed=0` → `[]Zone`; con
  `Player.Speed>=10.0` → comportamiento normal.
- **Verificación:** `go test ./internal/engineer/spotter -v`.

### Tarea 3 — `ValidityRule` + `Runtime.IsMessageStillValid`

- **Objetivo:** validar stale antes de `Enqueue`.
- **Alcance:**
  - `vantare-v2/internal/engineer/audio/message.go` (añadir
    `ValidityRule string`, `ValidationData map[string]any`).
  - `vantare-v2/internal/engineer/core/runtime.go` (nuevo
    `IsMessageStillValid(msg, frame) bool`).
  - `runtime_test.go` (test nuevo).
- **Mini-auditoría:** `QueuedMessage.cs` + `AbstractEvent.cs` en CC;
  método `isMessageStillValid(eventSubType, currentGameState,
  validationData)`. Estado: `PARCIAL` (decisión de producto sobre
  enum cerrado vs string libre; valores iniciales a confirmar).
- **Archivos prohibidos:** parser LMU, frontend, `go.mod`.
- **Criterios:** mensaje con `ValidityRule=ActiveLeft` se descarta
  si `ActiveSides.Left=false` al momento del drain.
- **Verificación:** `go test ./internal/engineer -v`.

### Tarea 4 — Fixtures replay persistentes

- **Objetivo:** mover JSONL validado a fixtures reproducibles.
- **Alcance:**
  - `vantare-v2/internal/engineer/replay/testdata/{left-basic,
    right-basic, three-wide, all-clear}.jsonl` (nuevo).
  - `replay_test.go` (cargar fixtures desde disco).
- **Mini-auditoría:** N/A (no es feature CrewChief, es infra).
- **Archivos prohibidos:** parser LMU, audio, frontend, `go.mod`.
- **Criterios:** `go test ./internal/engineer/replay -v` carga y
  reproduce los 4 fixtures sin mensajes stale.
- **Verificación:** `go test ./internal/engineer/replay -v`.

### Tarea 5 — Integrar `Player.Play` en `queueLoop`

- **Objetivo:** que el audio queue no sea decorativo.
- **Alcance:**
  - `vantare-v2/internal/engineer/service/engineer_service.go`
    (llamar a `audio.Player.Play(textKey → cache.mp3)`).
  - O crear `audio.Scheduler` separado (decisión de producto).
- **Mini-auditoría:** `AudioPlayer.cs:2055`
  `InterruptCurrentlyPlayingSound` selectivo (no blanket kill).
  Estado: `PARCIAL` — el Player ya interrumpe físicamente; falta
  integración en queueLoop y selector "spotter vs chief".
- **Archivos prohibidos:** parser LMU, frontend, `go.mod`, tipos
  exportados.
- **Criterios:** `queueLoop` reproduce audio; test con spy Player
  verde.
- **Verificación:** `go test ./internal/engineer/service -v`.

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
