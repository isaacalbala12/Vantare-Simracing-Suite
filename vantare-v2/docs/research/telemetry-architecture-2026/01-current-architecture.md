# 01 — Arquitectura real de la telemetría (reconstruida desde código)

> **Agente 0 — Reconstructor del sistema real.**
> Todo lo que sigue está verificado leyendo código en el árbol de trabajo actual.
> Rama `vantareapp/isa-338-retirar-los-ultimos-confirm-nativos`, HEAD `08e316c1`,
> **working tree sucio**: 51 ficheros modificados sin committear
> (`git diff --stat`), de los que 47 son el *native delta* de LMU y 4 son un
> cambio independiente en `internal/updater`.
> Los documentos de `docs/telemetry-core/*` y `docs/adr/*` se han usado solo para
> orientarse; **ninguna afirmación de este documento depende de ellos**.
>
> Convención de marcado usada en todo el documento:
>
> | Marca | Significado |
> |---|---|
> | **[ACTIVO]** | En el camino de ejecución del binario `cmd/vantare` |
> | **[DESCONECTADO]** | Código productivo compilado que ningún camino productivo invoca |
> | **[SOLO TESTS]** | Únicamente referenciado desde `_test.go` / `*.test.ts` |
> | **[LOCAL]** | Existe solo en el diff no committeado |

---

# FASE 1 — Reconstrucción del sistema real

## 1. Flujo real, extremo a extremo

### 1.1 Diagrama del camino de datos

```
┌─────────────────────────────────────────── PROCESO Vantare (cmd/vantare) ────────────────────────────────────────────┐
│                                                                                                                       │
│  ╔══════════════════════ goroutine: Driver.Run (propiedad de core.DriverManager) ══════════════════════╗              │
│  ║                                                                                                      ║              │
│  ║  LMU_Data (shared memory, 324820 B)          HTTP 127.0.0.1:6397                                     ║              │
│  ║         │ [ACTIVO] 60 Hz                            │ [ACTIVO] 4 Hz  (goroutine hija runREST)        ║              │
│  ║         │ driver.go:17 defaultInterval=1/60s        │ rest.go:26 defaultRESTInterval=250ms           ║              │
│  ║         v                                           v  /rest/watch/standings, /rest/watch/sessionInfo║              │
│  ║   readStable(x3 comparaciones)                 fetchREST + decode                                    ║              │
│  ║   reader_windows.go:~40                        rest.go:232/254                                       ║              │
│  ║         │                                           │                                                ║              │
│  ║         v                                           │                                                ║              │
│  ║   parseWithProfile  format.go                       │                                                ║              │
│  ║   → lmu.Observation (+VehicleObservation[104])      │                                                ║              │
│  ║         │                                           │                                                ║              │
│  ║         v  driver.go:209-222 clasificación stale (limite 500 ms)                                     ║              │
│  ║         └──────────────► Fusion.Merge ◄─────────────┘   fusion.go:105                                ║              │
│  ║                          matriz de autoridad v4 (committeado) / v5 [LOCAL]                           ║              │
│  ║                                  │ Observation canónica (Source=canonical, REST vacío)               ║              │
│  ║                                  v  driver.go:232 sink.WriteObservation                              ║              │
│  ║   ┌──────────────────────────────┴─────────────────────────────────────────────────────────┐        ║              │
│  ║   │  TODO LO DE ABAJO CORRE SÍNCRONO EN ESTA MISMA GOROUTINE, A ~60 Hz                      │        ║              │
│  ║   │                                                                                         │        ║              │
│  ║   │  runtimeObservationSink.WriteObservation   telemetry_core_runtime.go:612                │        ║              │
│  ║   │        v                                                                                │        ║              │
│  ║   │  lmu.BatchMapper.WriteObservation          batch_mapper.go:120                          │        ║              │
│  ║   │    · identidad de sesión/vehículo, generación de slot, Cursor.Advance                   │        ║              │
│  ║   │    · frames no mapeables → IsUnmappableFrame → descartados (no fatales)                 │        ║              │
│  ║   │        v  core.Batch{Header{Source,Cursor,Clock,Identity}, ObservedState}               │        ║              │
│  ║   │  runtimeBatchSink.WriteBatch               telemetry_core_runtime.go:635                │        ║              │
│  ║   │        ├─► core.Reducer.Apply              reducer.go:112   → Snapshot[ObservedState]   │        ║              │
│  ║   │        ├─► core.SessionCoordinator.Apply   session_coordinator.go:128 → []Fact          │        ║              │
│  ║   │        │      (sink = collectTelemetryFacts, en memoria, mismo frame)                   │        ║              │
│  ║   │        ├─► derive.Pipeline.Apply           pipeline.go:245  → Snapshot[FinalState]      │        ║              │
│  ║   │        │      4 derivaciones fijas: controls.history, session.remaining,                │        ║              │
│  ║   │        │      standings.relative-gaps, session.self-delta                               │        ║              │
│  ║   │        ├─► overlay.ProjectV1               projection/overlay/v1.go:168  [ACTIVO]       │        ║              │
│  ║   │        ├─► strategy.ProjectV1              projection/strategy/v1.go:142 [ACTIVO*]      │        ║              │
│  ║   │        ├─► publishProjections              :762 → NewOverlayFull/NewStrategyFull        │        ║              │
│  ║   │        │      json.Marshal + sello SHA-256 (transport.go:227/752)                       │        ║              │
│  ║   │        │      Hub.PublishSnapshot(frame, **nil**)  transport.go:344                     │        ║              │
│  ║   │        └─► deliverEngineer                 :686  engineer.ProjectObservationV1 + Facts  │        ║              │
│  ║   │               → EngineerService.ConsumeObservation/ConsumeFact  (INTERFAZ EN PROCESO)   │        ║              │
│  ║   └─────────────────────────────────────────────────────────────────────────────────────────┘        ║              │
│  ╚══════════════════════════════════════════════════════════════════════════════════════════════════════╝              │
│                                                                                                                       │
│  ╔═ goroutine: monitor ═══════════════╗   ╔═ goroutine: serveWails × 2 ═══════════════════════════════════════════╗   │
│  ║ ticker 100 ms                      ║   ║ ServeWails(ctx, hub, emitter)   adapters.go:41                        ║   │
│  ║ telemetry_core_runtime.go:24/582   ║   ║   Subscription.Next  transport.go:477  (latest-wins, sin cola)        ║   │
│  ║ manager.Status() → setStatus()     ║   ║   emitter.Emit("telemetry:<producto>:<kind>", json)                   ║   │
│  ║ → PublishStatus (statusRevision++) ║   ╚═══════════════════════════════════════════════════════════════════════╝   │
│  ╚════════════════════════════════════╝                                                                               │
│                                                                                                                       │
│  Hub Overlay ──┬──► Wails Events  "telemetry:overlay:projection" / ":status"    [ACTIVO]                              │
│                └──► SSE GET /telemetry/overlay/projection   server.go:226       [ACTIVO, solo loopback]               │
│  Hub Strategy ─┬──► Wails Events  "telemetry:strategy:projection" / ":status"   [ACTIVO, SIN CONSUMIDOR]              │
│                └──► SSE GET /telemetry/strategy/projection  server.go:232       [ACTIVO, SIN CONSUMIDOR]              │
│  Engineer ────────► Wails "engineer:stream"/"engineer:status" + SSE /engineer/stream                                  │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
        │ Wails Event / EventSource
        v
┌────────────────────────────────── FRONTEND (React/TS) ────────────────────────────────────┐
│  telemetry-transport/attach.ts:23  ── suscribe 3 kinds: projection | status | fact         │
│        v                                                                                   │
│  telemetry-transport/store.ts:111 applyProjection   [ACTIVO]                              │
│    · valida statusRevision (+1 exacto), epoch/sequence, contigüidad                       │
│    · applyMergePatch (RFC 7396)  store.ts:166  → [DESCONECTADO: nunca llega un delta]     │
│        v                                                                                   │
│  overlay/transports/projection-observer.ts:95  decodeOverlayProjectionV1                   │
│        v      (exige kind === "full")                                                      │
│  overlay/projection/overlay-projection-adapter.ts:74  adaptOverlayProjectionToSnapshot     │
│        v      ← ***FRONTERA DURA***: aquí muere la proyección v1                           │
│  TelemetrySnapshot (modelo LEGACY)  overlay/core/telemetry-snapshot.ts                     │
│        v                                                                                   │
│  TelemetryRateCoordinator.publish  telemetry-rate-coordinator.ts:108                       │
│    · derived.publish(snapshot) → RECALCULA localmente delta/input/fuel history             │
│    · SOBRESCRIBE snapshot.derived con el suyo (línea 110-117)  ← duplicación               │
│    · buckets por Hz con setInterval(1000/hz)                                               │
│        v                                                                                   │
│  RuntimeWidgetFrame.tsx:23 useRateLimitedTelemetry(widget.behavior.updateHz)               │
│        v                                                                                   │
│  WidgetVisualHost.tsx:83-95 buildViewModel → 19 widgets, TODOS sobre el modelo legacy      │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

`ACTIVO*` = se produce y se publica en cada frame, pero nadie lo lee (§7).

### 1.2 Qué está desconectado (resumen; detalle en §7)

| Componente | Estado | Evidencia |
|---|---|---|
| `core.Fanout` (572 líneas) | **[SOLO TESTS]** | único uso: `derive/fanout_integration_test.go:18` |
| `projection/analysis` | **[SOLO TESTS]** | `analysis.ProjectV1` (`analysis/v1.go:113`) sin ningún llamante, ni siquiera en tests |
| `telemetrytransport.NewAnalysisFull/NewEngineerFull/NewEngineerFact` | **[DESCONECTADO]** | sin llamantes fuera de `transport_test.go` |
| `ServeWailsFacts`, `SSEFactsHandler`, `FactsRoute` | **[DESCONECTADO]** | ninguna ruta `/telemetry/*/facts` registrada en `server.go:219-241` |
| Delta RFC 7396 (Go y TS) | **[DESCONECTADO]** | los dos `PublishSnapshot` productivos pasan `nil` |
| `app.StrategyLiveRuntime` + `internal/strategy/live` | **[SOLO TESTS]** | `NewStrategyLiveRuntime` solo en `*_test.go` |
| `recording.Coordinator` + escritura SQLite | **[SOLO TESTS]** | `recording.NewCoordinator` solo en tests |
| `recording/replay` | **[SOLO TESTS]** | prohibido en producción por `architecture_test.go:42-61` |
| `diagnostics.CaptureManager` + `lmu.CaptureTap` | **[DESCONECTADO]** | `config.captureTap` es no exportado y `lmu.New()` nunca lo pone |
| `internal/telemetryanalysis` (DuckDB) | **[DESCONECTADO]** | ningún importador en `cmd/` ni `internal/app` |
| `internal/core/deadband.go` | **[DESCONECTADO]** | cero importadores |
| `overlay/core/telemetry-store.ts` (frontend) | **[SOLO TESTS]** | sin llamante productivo |
| `src/lib/telemetry-ref.ts` (frontend) | **[DESCONECTADO]** salvo demo | solo `useDemoMode.ts:21` y `lib/visibility.ts:42` |

### 1.3 Qué es LOCAL (no committeado)

El diff local añade una única señal de simulador — el delta nativo de LMU
(`mDeltaBest`, offset `telemetry.delta_best` = 696) — y tres referencias de
delta derivadas de ella. Fichero por fichero en §Fase 2/Caso 3.
Lo relevante para la reconstrucción del sistema:

- `core.VehicleState.DeltaBest` **[LOCAL]** (`core/reducer.go:68`)
- `derive.SelfDelta.{PersonalBest,SessionBest,PreviousLap}` **[LOCAL]** (`derive/delta.go:42-45`)
- `overlay.PayloadV1.{PlayerDeltaPersonalBest,PlayerDeltaSessionBest,PlayerDeltaPreviousLap}` **[LOCAL]** (`projection/overlay/v1.go:54-56`)
- `lmu.MatrixVersion` 4 → 5 **[LOCAL]** (`drivers/lmu/fusion.go:18`)
- `catalog.SignalSessionNativeDeltaBest`, `catalog.SignalSessionPreviousLapDelta` **[LOCAL]** (`catalog/ids.go:52-53`)
- Widget `delta` con selector de referencia (`personal-best|session-best|previous-lap`) **[LOCAL]**

---

## 2. Diagrama de llamadas y ciclo de vida

### 2.1 Quién arranca qué

| Orden | Acción | Sitio |
|---|---|---|
| 1 | `live := flag.Bool("live", true, …)` | `cmd/vantare/main.go:991` |
| 2 | pasos de apagado registrados (telemetría = paso 3 de 14) | `cmd/vantare/main.go:1040-1128`, telemetría en `:1057-1062` |
| 3 | `engineerservice.NewEngineerService(emitter)` | `cmd/vantare/main.go:1589` |
| 4 | `app.NewEngineerBridge(...).Start()` | `cmd/vantare/main.go:1606-1607` |
| 5 | **`app.NewTelemetryCoreRuntime({Enabled:*live, Emitter:emitter, Engineer:engSvc})`** | `cmd/vantare/main.go:1609-1613` |
| 6 | `server.New({OverlayProjection: rt.Hub(), StrategyProjection: rt.StrategyHub()})` + `Start()` | `cmd/vantare/main.go:1651-1670` |
| 7 | handlers de replay de estado (`telemetry:*:status:get`) | `cmd/vantare/main.go:1922-1928`, impl `:510-557` |
| 8 | **`telemetryCoreRuntime.Start(ctx)`** | `cmd/vantare/main.go:2290` |
| 9 | `ops.NewRuntimeSampler(telemetrySourceStatus)` (1 s) | `cmd/vantare/main.go:2296-2298` |

`cmd/vantare/lifecycle.go` **no construye nada de telemetría**: es solo un helper
de apagado ordenado (`runShutdown`). `internal/startup` es autoarranque Windows.

Construcción interna, toda en `internal/app/telemetry_core_runtime.go:142-207`
(libre de efectos secundarios; `Start` es quien crea goroutines):

| Componente | Línea |
|---|---|
| `core.NewDriverManager[lmu.Observation]` con **un solo candidato** (`ID:"lmu"`, `Priority:100`, `Detect` = `return true,nil`) | `:143-166` |
| `engineer.NewManifest([7 capacidades, todas `CapabilitySupported`])` | `:170-178` |
| `telemetrytransport.NewHub(ProductOverlay)` | `:185-191` |
| `telemetrytransport.NewHub(ProductStrategy)` | `:192-198` |
| `lmu.NewBatchMapper()` | `:200` |
| `core.NewReducer()` | `:201` |
| `core.NewSessionCoordinator({})` (defaults: 256 facts/batch, 104 vehículos) | `:202` |
| `derive.NewPipeline({})` (120 muestras de controles) | `:203` |

### 2.2 Goroutines y propietarios

| Goroutine | Creada en | Propietario | Qué hace |
|---|---|---|---|
| `monitor` | `telemetry_core_runtime.go:347` | `runtime.wg` + `cancel` | ticker 100 ms → `manager.Status()` → `setStatus` → `PublishStatus` en ambos hubs; también `deliverEngineerStatus` |
| `serveWails` (Overlay) | `:351` | `runtime.wg` | `ServeWails` bloqueante → `emitter.Emit` |
| `serveWails` (Strategy) | `:352` | `runtime.wg` | ídem |
| `DriverManager` supervisor | `core/driver_manager.go` (`Start`) | `manager.done`/`cancel` | detección, construcción del driver, reconexión con backoff |
| `Driver.Run` | invocada por el supervisor | ciclo del manager | bucle `select{ctx.Done, restOutput, ticker}` (`driver.go:241-265`) |
| `runREST` | `drivers/lmu/driver.go:163-165` | `runContext` + `restDone` | polling 250 ms de dos endpoints |
| SSE por petición | `net/http` | contexto de la request | `SSEHandler` (`adapters.go:93`) |

**No hay más.** Reducer, SessionCoordinator, derive, proyecciones, hubs y
Engineer **no arrancan ninguna goroutine** — está escrito como contrato en los
comentarios de `core/reducer.go:96`, `core/session_coordinator.go:100-102` y
`telemetrytransport/transport.go:157-158` ("Hub is bounded and starts no
goroutines").

### 2.3 Canales y mutexes

| Primitiva | Sitio | Nota |
|---|---|---|
| `chan Observation` (REST → Run) | `driver.go:159` | sin buffer; el productor bloquea hasta que el bucle lo consume |
| `chan error` (fin de REST) | `driver.go:160` | buffer 1 |
| `Reducer.mu` `sync.RWMutex` + `running atomic.Bool` | `reducer.go:98-104` | un único dueño activo (`ErrReducerRunning`) |
| `SessionCoordinator.mu` + `running atomic.Bool` | `session_coordinator.go:104-109` | copia-modifica-publica-commit; un fallo del sink deja el estado intacto |
| `Pipeline.mu` `sync.RWMutex` | `pipeline.go:226` | |
| `BatchMapper.mu` `sync.Mutex` | `batch_mapper.go:63` | estado de identidad long-lived, sobrevive a reconexiones del driver |
| `Hub.mu` `sync.Mutex` | `transport.go:160` | |
| `pendingSubscriber.signal chan struct{}` cap 1 | `transport.go:143` | señal no bloqueante (`notify`, `transport.go:727-732`) |
| `TelemetryCoreRuntime.mu` / `.lifecycleMu` | `:101-102` | estado de status vs ciclo de vida |
| `Fusion` | `fusion.go:98-103` | **sin mutex**: single-writer, propiedad de un solo `Driver.Run` |

### 2.4 Cadencias reales medidas en el código

| Etapa | Constante | Valor |
|---|---|---|
| Lectura shared memory | `drivers/lmu/driver.go:17` `defaultInterval = time.Second/60` | **60 Hz** |
| Comparaciones estables por lectura | `driver.go:19` `defaultStableComparisons = 3` | 3 |
| Límite de frescura (→ `stale`) | `driver.go:18` `defaultFreshnessLimit = 500ms` | 500 ms |
| Refresco real del bloque de sesión de LMU 1.4 | comentario medido en `driver.go:214-218` | **5 Hz (200 ms)** |
| Polling REST | `drivers/lmu/rest.go:26` `defaultRESTInterval = 250ms` | **4 Hz** |
| Deadline / TTL / backoff REST | `rest.go:27-29` | 750 ms / 2 s / 2 s |
| Publicación Overlay | *sin ticker*, una por batch aceptado | **~60 Hz** (+ los frames extra que dispara REST) |
| Publicación Strategy | *sin ticker*, misma llamada | **~60 Hz** |
| Entrega Engineer | *sin ticker*, síncrona en `WriteBatch` | **~60 Hz** |
| Monitor de estado del driver | `telemetry_core_runtime.go:24` `telemetryCoreStatusInterval = 100ms` | **10 Hz** |
| Muestreo interno self-delta | `derive/delta.go:23` `selfDeltaSampleInterval = 100ms` | 10 Hz |
| Traza de delta LMU | `drivers/lmu/delta_trace.go:26` | 10 Hz |
| Reconexión driver | `core/driver_manager.go:507-531`: `InitialBackoff 250ms`, `MaxBackoff 5s`, `StableRun 30s`; override productivo `MaxReconnects: 1_000` (`telemetry_core_runtime.go:165`) | |
| Keep-alive SSE Engineer | `internal/server/engineer_sse.go:34` | 15 s |
| Checkpoint de grabación | `recording/ports.go:11` `DefaultCheckpointInterval = 1500ms` | **nunca corre** |
| Coordinador de tasa (frontend) | `telemetry-rate-coordinator.ts:35` `setInterval(1000/hz)` | por bucket de Hz |
| Superficie de runtime (frontend) | `RuntimeOverlaySurface.tsx:25` `RUNTIME_SURFACE_VISIBILITY_HZ = 15` | 15 Hz |
| Widget individual | `widget.behavior.updateHz` (delta por defecto 30) | 1..30 |
| Inspector del Studio | `StudioTelemetryProvider.tsx:15` `INSPECTOR_TELEMETRY_HZ = 30` | 30 Hz |

### 2.5 Backpressure, latest-wins y suscriptores lentos

- **Dentro del proceso, no hay backpressure: hay acoplamiento rígido.** Toda la
  cadena reducer → coordinator → derive → 2 proyecciones → 2 `json.Marshal` +
  2 SHA-256 → 2 publicaciones → proyección Engineer + entrega Engineer corre
  **síncrona en la goroutine de adquisición del driver**
  (`telemetry_core_runtime.go:635-674`). Un consumidor Engineer lento frena
  literalmente la lectura de memoria compartida. El comentario del contrato lo
  admite: "Callbacks are synchronous to preserve source order: they must return
  promptly" (`telemetry_core_runtime.go:47-49`).
- **Hub = latest-wins puro.** `PublishSnapshot` sustituye `hub.latest` y marca
  `pendingSnapshot=true` en cada suscriptor (`transport.go:399-405`).
  Un suscriptor lento **no ralentiza al productor**: simplemente se salta frames
  intermedios y recibe el último full. `notify` es un `select` con `default`
  (`transport.go:727-732`). La métrica `SnapshotReplacements` cuenta los
  reemplazos (`transport.go:397`).
- **Facts sí serían loss-intolerant** (`FactBatchSink`, `session_coordinator.go:62-68`;
  `RecordingSink` en `core/ports.go:46-54`) pero en producción el sink es
  `collectTelemetryFacts` (`telemetry_core_runtime.go:677-684`), un `append` en
  memoria dentro del mismo frame: no puede fallar ni encolar.
- **Continuidad de cursor como cortafuegos**: `Hub.PublishSnapshot` rechaza
  cualquier salto (`ErrSequenceGap`, `transport.go:372`) y cualquier snapshot
  cuya `StatusRevision` no coincida con el status actual (`:363-366`). El
  frontend replica exactamente las mismas reglas en
  `telemetry-transport/store.ts:111-185`.
- **Frames no mapeables**: `IsUnmappableFrame` (`batch_mapper.go:104-110`)
  clasifica seis errores (menú, garaje, carga, cambio de sesión) como
  descartables; sin esa clasificación un solo frame de garaje mataba la
  telemetría hasta reiniciar (comentario en `telemetry_core_runtime.go:618-630`).

---

## 3. Propietarios de estado

| Verdad de… | Struct dueño | Fichero:línea | Escribe | Lee |
|---|---|---|---|---|
| Última observación por fuente (SM/REST) + TTL | `lmu.Fusion` | `drivers/lmu/fusion.go:98-103` | `Driver.Run` (única goroutine) | `Fusion.Merge` |
| Identidad canónica: epoch, sequence, sessionID, playerID, generación de slot | `lmu.batchMapperState` | `drivers/lmu/batch_mapper.go:43-63` | `BatchMapper.WriteObservation` (mutex) | idem |
| **Estado observado canónico** | `core.ObservedState` dentro de `core.Reducer` | `core/reducer.go:77-104` | `Reducer.apply` | `Reducer.Current()`, y el snapshot devuelto |
| Historia de sesión: high-water de vueltas por vehículo, pit, `factSequence`, conexión | `core.coordinatorState` | `core/session_coordinator.go:90-98` | `SessionCoordinator.Apply/SetConnected/EndSession` | `Current()` |
| Estado derivado: `SessionRemaining`, `GapSet`, `SelfDelta`, `ControlsHistory` | `derive.FinalState` en `derive.Pipeline` | `derive/pipeline.go:206-233` | `Pipeline.Apply` | `Pipeline.Current()` |
| Historia interna de vueltas para el self-delta (18 000 muestras) | `derive.selfDeltaTracker` | `derive/delta.go:55-82` | `tracker.Apply` | nunca sale: solo la ventana pública de 120 |
| Último full + delta opcional + status por producto | `telemetrytransport.Hub` | `transport.go:159-173` | `PublishSnapshot`/`PublishStatus` | `Subscription.Next`, `ReplayStatus` |
| `statusRevision`, `statusState`, `statusAttempt` | `TelemetryCoreRuntime` | `telemetry_core_runtime.go:125-131` | `setStatusLocked` (`:806`) | `SourceStatus()`, publicaciones |
| Cursor de transporte del cliente (status/epoch/sequence/factCursor) | `ProjectionTransportStore` | `frontend/src/telemetry-transport/store.ts:54-274` | `attach.ts:23 ingest` | `projection-observer.ts:87` |
| Snapshot legacy vigente + buckets por Hz | `TelemetryRateCoordinator` | `frontend/src/overlay/core/telemetry-rate-coordinator.ts:62-134` | `publish()` | `useRateLimitedTelemetry` |
| Historias derivadas del cliente (delta/input/fuel) | `DerivedTelemetryStore` | `frontend/src/overlay/core/derived-telemetry-store.ts:55-140` | `coordinator.publish` | `coordinator.publish` |
| Historia de input por widget | `Map<widgetId, …>` a nivel de módulo | `frontend/src/overlay/widget-types/input-telemetry/input-telemetry-accumulator.ts:6` | `WidgetVisualHost.tsx:90` **durante el render** | `:93` |

Nota de ownership: `envelope.Snapshot[T]` clona en construcción **y en cada
lectura** (`schema/envelope/types.go:49-64`), de modo que ningún slice o mapa se
comparte entre etapas. Es la razón de que `cloneObservedState`,
`cloneFinal` y `clonePayload` aparezcan en cada capa.

---

## 4. Secuencia exacta de publicación de un frame de overlay

| # | Qué | Fichero:línea |
|---|---|---|
| 1 | tick 16,67 ms | `internal/telemetry/drivers/lmu/driver.go:260` `case <-ticker.C()` |
| 2 | `readStable(ctx, reader, buffer, scratch, 3)` | `driver.go:186` → `reader.go` / `reader_windows.go` |
| 3 | `parseWithProfile(buffer, now, profile)` → `lmu.Observation` | `driver.go:202`, `format.go` (`parsePlayerTelemetry`, `parseScoring`) |
| 4 | clasificación de reloj y frescura (límite 500 ms → `withFreshness(stale)`) | `driver.go:209-222`, `driver.go:372` |
| 5 | `fusion.Merge(now, elapsed, observation)` (matriz de autoridad) | `driver.go:231` → `fusion.go:105` |
| 6 | `sink.WriteObservation(ctx, canonical)` | `driver.go:232` |
| 7 | `runtimeObservationSink.WriteObservation` | `internal/app/telemetry_core_runtime.go:612` |
| 8 | `mapper.WriteObservation(ctx, obs, runtimeBatchSink{})` | `:614` → `batch_mapper.go:120` |
| 9 | validación + `state.cursor.Advance(transition)` + `core.Batch` | `batch_mapper.go:218-247` |
| 10 | `runtimeBatchSink.WriteBatch` | `telemetry_core_runtime.go:635` |
| 11 | `reducer.Apply(batch)` → `envelope.Snapshot[ObservedState]` | `:636` → `core/reducer.go:112` |
| 12 | `coord.Apply(ctx, observed, facts)` → facts en memoria | `:642` → `core/session_coordinator.go:128` |
| 13 | `derive.Apply(ctx, observed)` → `envelope.Snapshot[FinalState]` | `:645` → `derive/pipeline.go:245` |
| 14 | `overlayprojection.ProjectV1(final)` → `overlay.SnapshotV1` | `:649` → `projection/overlay/v1.go:168` |
| 15 | `publishProjections(...)` → `setStatusLocked` primero | `:662` → `:762`, `:806` |
| 16 | `NewOverlayFull(metadata, statusRev, payload)` → `json.Marshal` + `envelopeSeal` SHA-256 + `validateEnvelope` | `:773` → `telemetrytransport/transport.go:195,227-252,752` |
| 17 | `hub.PublishSnapshot(overlayFrame, nil)` | `:789` → `transport.go:344` |
| 18 | `pendingSnapshot = true` + `notify(subscriber)` | `transport.go:402-405`, `:727` |
| 19 | `subscription.Next(ctx)` devuelve el evento | `transport.go:477-514` → `adapters.go:51` |
| 20 | `emitter.Emit("telemetry:overlay:projection", data)` | `adapters.go:55`, nombre en `adapters.go:20-22` |
| 21 | `wailsEmitter.Emit` → `wailsApp.Event.Emit` | `cmd/vantare/main.go:502-504` |
| 22 | (ruta OBS alternativa) `SSEHandler` escribe `event:/data:` y `Flush()` | `adapters.go:128-136`, ruta registrada en `internal/server/server.go:226-229` |
| 23 | frontend: `attachProjectionTransport` → `store.ingest` | `frontend/src/telemetry-transport/attach.ts:23` |
| 24 | `applyProjection` valida statusRevision/epoch/sequence y (si hiciera falta) aplica merge-patch | `frontend/src/telemetry-transport/store.ts:111-185`, `:166` |
| 25 | `decodeOverlayProjectionV1(state.snapshot)` (exige `kind === "full"`) | `frontend/src/overlay/transports/projection-observer.ts:95`, `overlay-projection-v1.ts:164,173` |
| 26 | `adaptOverlayProjectionToSnapshot(projection, {transportState})` → `TelemetrySnapshot` legacy | `projection-observer.ts:96` → `overlay-projection-adapter.ts:74` |
| 27 | `coordinator.publish(adaptation.snapshot)` | `projection-telemetry-adapter.ts:84` |
| 28 | `derived.publish()` + **sobrescritura de `snapshot.derived`** + notificación por bucket de Hz | `telemetry-rate-coordinator.ts:108-124` |
| 29 | `useRateLimitedTelemetry(widget.behavior.updateHz)` | `RuntimeWidgetFrame.tsx:23` |
| 30 | `buildViewModel(snapshot, content)` del tipo de widget | `WidgetVisualHost.tsx:83-95` → p.ej. `delta-view-model.ts:97` |
| 31 | render del componente del design system | p.ej. `design-systems/vantare-original/delta/DeltaOriginal.tsx` |

Latencia estructural mínima: 1 tick de SM (≤16,7 ms) + procesado síncrono +
emisión Wails + 1 tick del bucket de Hz del widget (33 ms a 30 Hz). El paso 28
significa además que **el snapshot se publica sin throttle pero se notifica con
throttle**: el widget siempre ve el último snapshot, nunca una cola.

---

## 5. Contratos reales

### 5.1 Entrada del simulador — `lmu.Observation`

`internal/telemetry/drivers/lmu/format.go:58-85`. Campos de nivel sesión/jugador
(`SourceTime`, `EndTime`, `MaximumLaps`, `TrackName`, `SessionType`,
`VehicleCount`, `PlayerPresent`, `Gear`, `EngineRPM`, `SpeedMPS`, `Throttle`,
`Brake`, `Clutch`, `Fuel`, …) más `Vehicles []VehicleObservation` y metadatos de
procedencia (`Source`, `Compatibility`, `Fingerprint`, `ClockChange`,
`MatrixVersion`, `Decisions`, `Conflicts`).

`VehicleObservation` (`format.go:94-129`): 29 campos, todos
`schema.Field[T]`, más `SourceID VehicleSourceID` (el slot crudo de LMU, que el
comentario `:87-89` declara explícitamente **no** identidad durable).
**[LOCAL]** añade `DeltaBest schema.Field[session.DeltaSeconds]` en `:125`.

Constantes de layout: `MemoryName = "LMU_Data"`, `ObjectOutSize = 324820`,
`telemetryOffset = 128468`, `telemetryStride = 1888`, `scoringOffset = 2192`,
`scoringStride = 584`, `maxVehicles = 104` (`format.go:22-33`).
Los offsets están declarados en una tabla explícita `lmu13Layout`
(`drivers/lmu/layout.go:180-202`) con `admittedFields()` como lista blanca
(`layout.go:210-250`).

### 5.2 Canónico — `core.ObservedState` y `schema.Field`

- `schema.Field[T comparable]` (`schema/quality.go:42-47`): valor + `present` +
  `Provenance` + `Freshness`. **`comparable` excluye slices y mapas del camino
  caliente por diseño.**
  - `Provenance`: `Unknown|Observed|Derived|Estimated` (`quality.go:14-19`).
  - `Freshness`: `Missing|Fresh|Stale|Invalid` (`quality.go:29-34`), `Missing` es
    el cero seguro.
  - `NewField` **rechaza** construir un campo con `FreshnessMissing`
    (`ErrMissingValue`, `quality.go:56-58`): la ausencia se expresa solo con
    `MissingField[T]()`.
- `core.VehicleState` (`core/reducer.go:40-72`): 30 campos (31 **[LOCAL]** con
  `DeltaBest`), todos `schema.Field`.
- `core.ObservedState` (`core/reducer.go:77-86`): 7 campos de sesión + `Vehicles []VehicleState`.
- `core.Batch` (`core/reducer.go:90-93`) = `envelope.Header` + `ObservedState`.

### 5.3 Envelope canónico y encabezado

`internal/telemetry/schema/envelope/types.go`:

```go
type Header struct {                     // :17-22
    Source   SourceID                    // "lmu-canonical" (batch_mapper.go:31)
    Cursor   schema.Cursor               // {Epoch, Sequence} uint64 (schema/time.go:15-18)
    Clock    schema.Clock                // source/monotonic/ReceivedUTC
    Identity identity.RunIdentity        // {Event, Session, Vehicle, Team, Driver}
}
type Snapshot[T any] struct { header; value T; clone Clone[T] }   // :43-47
type Fact[T comparable] struct { header; value T }                 // :67-70
```

Reglas de cursor, todas verificadas en tres sitios independientes:

| Regla | Reducer | Derive | Hub |
|---|---|---|---|
| primer batch: `Epoch != 0 && Sequence == 1` | `reducer.go:222-227` | `pipeline.go:368-372` | `transport.go:581` (rechaza ceros) |
| mismo epoch: `Sequence == prev+1` | `reducer.go:231-235` | `pipeline.go:378-386` | `transport.go:707-716` |
| nuevo epoch: `prev+1` y `Sequence == 1` | `reducer.go:237-242` | `pipeline.go:388-393` | `transport.go:715` |
| identidad estable dentro del epoch | `reducer.go:207-217` | `pipeline.go:382-385` | — |

**Identidad de sesión y vehículo**: `identity.RunIdentity`.
El `EventID` es una constante literal `"lmu-event-1"` (`batch_mapper.go:32`) —
no existe hoy el concepto de eventos múltiples.
La `SessionID` la genera el mapper por firma `{track, sessionType}`
(`batch_mapper.go:34-37`), y la identidad de vehículo se deriva del slot LMU
más una **generación** (`batchMapperState.generations`, `batch_mapper.go:53`)
para que un slot reutilizado no herede la historia del anterior.

**No existe `revision`, `seal` ni `generation` en el envelope canónico**: son
estrictamente de transporte.

### 5.4 Proyecciones

Base común: `internal/telemetry/projection/contracts.go`.

```go
type Metadata struct {                                  // :36-42
    CanonicalVersion  schema.Version  `json:"canonicalVersion"`
    ProjectionVersion Version         `json:"projectionVersion"`
    Epoch             schema.Epoch    `json:"epoch"`
    Sequence          schema.Sequence `json:"sequence"`
    CapturedAt        string          `json:"capturedAt"`   // RFC3339Nano UTC
}
type Field[T comparable] struct {                       // :78-83
    Present    bool       `json:"present"`
    Value      T          `json:"value"`
    Provenance Provenance `json:"provenance"`   // "unknown|observed|derived|estimated"
    Freshness  Freshness  `json:"freshness"`    // "missing|fresh|stale|invalid"
}
```

`MissingField[T]()` (`:87-92`) es la forma canónica de "no disponible": la clave
JSON **siempre viaja**, con `present:false`. Nunca se omite un campo.

#### Overlay v1 — `projection/overlay/v1.go` (**la única proyección con consumidor real**)

`SnapshotV1 = Metadata + PayloadV1` (`:38-41`).

`PayloadV1` (`:43-59`, estado **con el diff local aplicado**):

| Campo JSON | Tipo | Origen |
|---|---|---|
| `capabilities` | `[]Capability` | inferido en runtime, `v1.go:269-291` |
| `trackName`, `sessionType` | `Field[string]` | observado |
| `playerVehicleId` | `identity.VehicleID` (desnudo, sin `Field`) | `Header.Identity.Vehicle` |
| `vehicles` | `[]VehicleV1` | uno por vehículo observado |
| `controlsHistory` | `ControlHistoryV1` | derivado (`derive.ControlsHistory`) |
| `endTimeSeconds`, `remainingSeconds`, `maximumLaps` | `Field` | obs. / derivado / obs. |
| `playerDeltaSeconds` | `Field[session.DeltaSeconds]` | `derive.SelfDelta.Seconds` |
| `playerDeltaPersonalBestSeconds` **[LOCAL]** | `Field` | `SelfDelta.PersonalBest` |
| `playerDeltaSessionBestSeconds` **[LOCAL]** | `Field` | `SelfDelta.SessionBest` |
| `playerDeltaPreviousLapSeconds` **[LOCAL]** | `Field` | `SelfDelta.PreviousLap` |
| `playerDeltaReference` | `Field[string]` (siempre `"best-completed-player-lap"`) | `v1.go:152-154` |
| `deltaHistory` | `DeltaHistoryV1` (≤120 muestras) | `SelfDelta.History` |

`VehicleV1` (`:61-91`): 28 miembros — `id` desnudo + 27 `Field`, incluidos
`relativeTimeGapSeconds` y `relativeLapDelta` que vienen de `derive.GapSet`.

`ControlSampleV1` (`:100-107`) lleva `epoch/sequence/vehicleId/throttle/brake/clutch`
— **no lleva timestamp**, y ese es exactamente el motivo por el que el frontend
lo descarta (§6.2).
`DeltaSampleV1` (`:116-123`) sí lleva `capturedAt` (ms), `sourceTimeSeconds` y
`lapDistanceMeters`.

`Capability` (`:30-36`): `session|standings|controls|controls.history|pit`,
**calculadas a partir de los valores realmente disponibles**, no declaradas.

#### Engineer v1 — `projection/engineer/v1.go` (**consumidor en proceso, activo**)

`PayloadV1` (`v1.go:50-61`): las mismas señales de sesión que Overlay más
`vehicleCount`, `playerPresent`, `player PlayerV1` y `vehicles []PlayerV1`.
`PlayerV1` (`:64-97`) tiene 33 campos, incluidos `worldPosition`,
`localVelocity` y `orientation` que Overlay no expone.

Engineer es el único producto con un **manifiesto explícito de capacidades**:
`Capability{ID, State}` con `CapabilityUnknown|Supported|Degraded|…`
(`projection/engineer/contract.go:22-42`), construido en
`telemetry_core_runtime.go:170-178` con 7 capacidades todas `Supported`.
Su `Field` (`contract.go:106,210,219`) lleva además `capabilityState`, de modo
que distingue "el sim no lo soporta" de "ahora mismo falta". **Es el único sitio
del sistema donde esa distinción existe.**

`ProjectFactV1` (`projection/engineer/v1.go:342`) proyecta los facts del
coordinator; `engineer.ProjectV1` (`:148`) — la proyección "full" — **no tiene
llamante productivo**: el camino vivo es `ProjectObservationV1`.

#### Strategy v1 — `projection/strategy/v1.go` (**producida, no leída**)

`PayloadV1` (`:39-47`): `capabilities`, `trackName`, `sessionType`,
`sourceTimeSeconds`, `endTimeSeconds`, `remainingSeconds`, `maximumLaps`,
`player PlayerV1`. `PlayerV1` (`:52-62`) tiene 9 campos: lap, sector,
distancia, pit, fuel. El comentario `:49-51` es explícito: sin Virtual Energy,
sin neumáticos, sin meteorología.

#### Analysis v1 — `projection/analysis/v1.go` (**muerta**)

`PayloadV1` (`:36-41`): `capabilities`, `trackName`, `sessionType`,
`player PlayerV1` (8 campos: lap, gear, rpm, speed, throttle, brake, clutch).
`analysis.ProjectV1` (`:113`) no tiene **ningún** llamante, ni siquiera en tests.

### 5.5 Transporte

`internal/app/telemetrytransport/transport.go`.

```go
type Envelope struct {                                      // :76-86
    Product           ProductID          `json:"product"`          // overlay|engineer|strategy|analysis
    ProjectionVersion projection.Version `json:"projectionVersion"`
    Epoch             schema.Epoch       `json:"epoch"`
    Sequence          schema.Sequence    `json:"sequence"`
    Kind              SnapshotKind       `json:"kind"`             // "full" | "delta"
    CapturedAt        string             `json:"capturedAt"`
    StatusRevision    uint64             `json:"statusRevision"`
    Payload           json.RawMessage    `json:"payload"`
    seal              [sha256.Size]byte  // NO exportado, NO serializado
}
```

- **Sello SHA-256**: `envelopeSeal` (`:752-763`), `statusSeal` (`:765-772`),
  `factSeal` (`:774-785`). Alimentación delimitada por longitud vía `sealBytes`
  (`:797-800`). Se recalcula y compara en `validateEnvelope` (`:579`). **Es un
  control de manipulación en proceso, no de red**: al no tener tag JSON nunca
  cruza el cable, y el frontend no lo verifica (no existe la palabra `seal` en
  `frontend/src`).
- **`statusRevision`**: generada en `setStatusLocked`
  (`telemetry_core_runtime.go:806-844`), monótona, solo avanza cuando cambia
  estado o intento (`:810-812`). `PublishStatus` exige exactamente `+1`
  (`transport.go:325-328`); `PublishSnapshot` exige igualdad estricta con el
  status vigente (`:363-366`).
- **Cortafuegos de payload**: `inspectPayloadKeys` (`:642-675`) escanea nombres
  de miembro JSON y rechaza fugas canónicas — `raw`, `source`, `clock`,
  `observed`, `derived`, `finalstate`, `canonicalversion` (`:684-685`, `:699-700`).
  Límite duro `DefaultMaxPayloadBytes = 256 KiB` (`:44`).
- **Delta RFC 7396**: implementado (`merge_patch.go:11` `ApplyMergePatch`,
  aceptado solo si reconstruye exactamente el full, `transport.go:378-394`) y
  **nunca ejercido**: los dos llamantes productivos pasan `nil`
  (`telemetry_core_runtime.go:789` y `:793`). En consecuencia
  `metrics.DeltasRetained` es siempre 0 y `snapshotFor` (`:568-576`) siempre
  devuelve el full. El espejo TypeScript
  (`frontend/src/telemetry-transport/merge-patch.ts:3`, consumido en
  `store.ts:166`) es igualmente inalcanzable.
- **Nombres y rutas** (`adapters.go:12-22`):
  `EventName(product,kind) = "telemetry:<product>:<kind>"`,
  `ProjectionRoute = "/telemetry/<product>/projection"`,
  `FactsRoute = "/telemetry/<product>/facts"` (nunca registrada).
  `StatusRequestEventName = "telemetry:<product>:status:get"` (`transport.go:518`).

### 5.6 Contratos TypeScript

- `frontend/src/telemetry-transport/contracts.ts`: espejo literal del envelope,
  `PROJECTION_VERSION = 1` (`:21`), `MAX_PAYLOAD_BYTES = 256*1024` (`:20`),
  regex de nombre de evento (`:140`), lista negra de claves ampliada con
  `__proto__|prototype|constructor` (`:335-363`).
  Hay un test de contrato cruzado Go↔TS:
  `internal/app/telemetrytransport/typescript_contract_test.go` +
  `frontend/src/telemetry-transport/contracts.test.ts`.
- `frontend/src/overlay/projection/overlay-projection-v1.ts` (715 líneas):
  decodificador estricto. Constantes `MAX_VEHICLES = 104`,
  `MAX_CONTROL_SAMPLES = 120`, `MAX_DELTA_SAMPLES = 120` (`:5-7`).
  Invariante `present:false ⇒ freshness:"missing"` (`:558-568`).
  **Exige `kind === "full"`** (`:173`, código `full-snapshot-required`).
  13 campos de vehículo son obligatorios; el resto pasa por
  `decodeOptionalField` (`:409-418`), que **sintetiza un campo `missing` si la
  clave no está** — es lo que hace que añadir un campo nuevo en Go no rompa un
  frontend viejo.
- `frontend/src/overlay/core/telemetry-snapshot.ts` (**modelo legacy**, 54
  líneas): `status`, `capturedAt:number`, `session`, `player` (todos opcionales
  salvo `inPit`), `scoring: readonly Record<string, unknown>[]` (**bolsa sin
  tipar**), `derived`, `auxiliary`, `environment`, `damage`, `errorMessage`.
- `overlay-projection-adapter.ts` (641 líneas): la conversión.
  - Transforma: `capturedAt` → número (`:78`), `speedMps × 3,6` → `speedKph`
    (`:213-221`), estado de transporte → `status` legacy (`:615-630`:
    `live→ready`, `degraded|stale→stale`, `error→error`, resto `→disconnected`).
  - Renombra en `scoring[]` (`:415-436`): `position→place`, `inPit→inPits`,
    `completedLaps→totalLaps`, `relativeTimeGapSeconds→timeGapToPlayer`,
    `lastLapSeconds→lastLapTime`, etc.
  - **Descarta explícitamente** (`UNSUPPORTED_FIELDS`, `:60-71`):
    `session.key`, `session.globalFlag`, `session.sectorFlags`,
    `scoring[].driverNumber/teamName/tireCompound`,
    `derived.inputHistory` (motivo literal: `history-without-timestamps`),
    `derived.fuelHistory`, `environment`, `damage`.
  - **Descarta en silencio** (solo anota calidad): `endTimeSeconds`,
    `maximumLaps`, `playerDeltaReference`, `fuelCapacityLiters`,
    `controlsHistory` (las muestras nunca llegan al snapshot),
    `capabilities` (nunca se inspecciona), y `session.epoch` (nunca se escribe).
  - Bloquea el frame con cuatro códigos (`:143-154`): `captured-at-invalid`,
    `session-type-unavailable`, `player-unavailable`, `player-in-pit-unavailable`.

---

## 6. Consumidores reales y duplicaciones

### 6.1 Quién consume qué

| Producto | Consumidor real | Camino |
|---|---|---|
| **Overlay v1** | ventana Desktop (`overlay/CompositeApp.tsx:44`, Wails), OBS (`overlay/ObsOverlayApp.tsx:40`, SSE), preview del Studio (`hub/overlay-studio/StudioRoute.tsx:378`, Wails) | proyección → adapter → legacy → 19 widgets |
| **Engineer v1** | `internal/engineer/service/engineer_service.go:614,660,771` (`ConsumeSourceStatus/Observation/Fact`) en proceso; después Wails `engineer:stream`/`engineer:status` y SSE `/engineer/stream` | no pasa por `telemetrytransport` |
| **Strategy v1** | **ninguno.** Se publica en Wails y SSE; el frontend solo crea un store `"overlay"` (`projection-observer.ts:72`); el consumidor Go previsto (`app.StrategyLiveRuntime`) nunca se construye | — |
| **Analysis v1** | **ninguno**, ni siquiera se proyecta | — |
| `driver.SourceStatus` | Topbar del Hub y puerta LIVE del Studio, vía `telemetry-core:source-status` (`StudioRoute.tsx:425-429`) | `telemetry_core_runtime.go:249` |

Los 19 tipos de widget (`frontend/src/overlay/widget-types/`) leen **todos** el
`TelemetrySnapshot` legacy. **Cero widgets leen la proyección v1.** Los únicos
cuatro ficheros no-test que importan `overlay-projection-v1.ts` son:
`projection-observer.ts:95`, el propio adapter (`:75,476`),
`overlay/telemetry-shadow/overlay-shadow-comparator.ts:20` y
`telemetry-overlay-shadow-harness/evidence.ts:8` (herramientas de evidencia).

Cinco widgets están **estructuralmente muertos de hambre** porque su única
entrada está en `UNSUPPORTED_FIELDS` o nunca se escribe: `car-damage-numbers`,
`car-damage-visual` (`snapshot.damage`), `track-weather` (`snapshot.environment`),
`racing-flags` (`session.globalFlag`/`sectorFlags`), `race-schedule`
(`auxiliary.scheduleEvents`).

### 6.2 Duplicación de derivaciones e historiales Go ↔ frontend

Esta es la duplicación más costosa del sistema, y es **verificable línea a línea**.

**(a) El coordinador de tasa sobrescribe lo que Go ya calculó.**
`frontend/src/overlay/core/telemetry-rate-coordinator.ts:108-117`:

```ts
publish(snapshot) {
  derived.publish(snapshot);
  latest = { ...snapshot, derived: {
    fuelHistory: derived.getFuelHistory(),
    inputHistory: derived.getInputHistory(),
    deltaHistory: derived.getDeltaHistory(),   // ← pisa lo que el adapter mapeó
  }};
```

El adapter había puesto ahí la `deltaHistory` que llega de Go
(`overlay-projection-adapter.ts:171-178`). Una línea después se descarta.
**La `DeltaHistoryV1` de Go viaja en cada frame por el cable y nunca se pinta.**

**(b) Tres historiales recalculados en cliente** — `derived-telemetry-store.ts`:

| Historial | Frontend | Go equivalente | Veredicto |
|---|---|---|---|
| `inputHistory` (`:95-101`, límite 120 `:29`) | recalculado | `overlay.ControlHistoryV1` (≤120, `derive.MaxControlsHistory = 120`, `pipeline.go:31`) | duplicado; el de Go se descarta por `history-without-timestamps` (`adapter:67`) |
| `deltaHistory` (`:102-108`, límite 120 `:30`) | recalculado | `overlay.DeltaHistoryV1` (≤120, `derive.MaxSelfDeltaHistory = 120`, `delta.go:21`) | duplicado; el de Go se pisa en (a) |
| `fuelHistory` (`:110-129`, límite 64 `:31`) | derivación **exclusiva** de cliente | no existe en Go | no duplicado, pero es lógica de dominio fuera del núcleo |

**Consecuencia de segundo orden**: el reset por sesión de ese store
(`:48-53`, `:79-84`) depende de `snapshot.session.key` o `session.epoch`. El
adapter **nunca escribe ninguno de los dos** (`session.key` está en
`UNSUPPORTED_FIELDS:61`; `epoch` no se escribe nunca, ver `adapter:156-162`).
`sessionIdentity()` devuelve `undefined` siempre ⇒ **las historias del cliente
no se reinician al cambiar de sesión**, solo al pasar a `disconnected`.
El acumulador de `input-telemetry` tiene el mismo defecto
(`input-telemetry-accumulator.ts:8`).

**(c) Un cuarto historial, paralelo y global.**
`widget-types/input-telemetry/input-telemetry-accumulator.ts:6-11`: un `Map` a
nivel de módulo, por `widgetId`, de 120 muestras, alimentado **desde el cuerpo
del render** (`WidgetVisualHost.tsx:90-94`).

**(d) Standings, relative y gaps recalculados en widgets** pese a que la
proyección ya trae `position`, `timeBehindLeaderSeconds`, `lapsBehindLeader`,
`timeBehindNextSeconds`, `relativeTimeGapSeconds` y `relativeLapDelta`:

| Cálculo | Fichero:línea |
|---|---|
| Orden de standings por `place` | `widget-types/standings/standings-view-model.ts:67-71` |
| Líder de clase + base de gap por clase | `standings-view-model.ts:73-77,180-195` |
| **Aritmética de gap al líder**: `row.lapsBehindLeader − leader.lapsBehindLeader`, `row.timeBehindLeader − leader.timeBehindLeader` | `standings/standings-formatting.ts:91-111` |
| Selección ahead/behind + orden + slice del relative | `relative/relative-row-selection.ts:9-50` |
| Ventana centrada en el jugador (multiclass) | `multiclass-relative/multiclass-relative-view-model.ts:8` |
| Vecinos `playerIndex ± 1` | `head-to-head/head-to-head-view-model.ts:12-20` |
| Orden + slice de la torre de broadcast | `broadcast-tower/broadcast-tower-view-model.ts:13` |
| Fuel: media/vuelta, vueltas restantes, combustible requerido | `fuel-strategy/fuel-strategy-view-model.ts:23-35` |
| Tendencia de delta por ventanas móviles (±0,01 s) | `delta-trace/delta-trace-view-model.ts:5-6` |
| **Cadenas de fallback de nombres de campo** (`timeGapToPlayer → timeBehindLeader → gapSeconds`) | `widget-types/shared/scoring-readers.ts:21-63` |

La última fila merece énfasis: `scoring[]` es `Record<string, unknown>` sin
tipar (`telemetry-snapshot.ts:39`), así que existe una capa entera de lectores
defensivos por nombre — el síntoma clásico de un contrato perdido en la
frontera.

**(e) Lo que no se duplica**: no hay cálculo de desgaste de neumáticos, stints ni
tiempos por sector en ninguna de las dos capas. `sectorDeltas` es `[]` fijo
(`delta-trace-view-model.ts:6`) y `delta-advanced` declara
`availability:false` para sector/teórica/última (`delta-advanced-view-model.ts:7`).

---

## 7. Código desconectado — evidencia

| Símbolo | ¿En el binario? | Evidencia |
|---|---|---|
| `core.Fanout` / `core.NewFanout` (`core/fanout.go:131`, 572 líneas) | **NO** | Únicos usos fuera del propio paquete: `derive/fanout_integration_test.go:18,77`. `grep -rn "Fanout" --include=*.go` fuera de `core/fanout*` devuelve solo tests. Es además la única implementación de `telemetrytransport.FactSource`. |
| `projection/strategy` | **Se produce, no se lee** | Producida `telemetry_core_runtime.go:655`, publicada `:793`, servida por Wails (`:352`) y SSE (`server.go:230-235`). Consumidor Go previsto `app.StrategyLiveRuntime`: solo tests. Consumidor frontend: ninguno (`projection-observer.ts:72` crea únicamente `"overlay"`). |
| `app.StrategyLiveRuntime` (`internal/app/strategy_live_runtime.go:43`) | **NO** | `NewStrategyLiveRuntime` referenciado en `strategy_live_runtime_test.go` (×8) y `strategy_live_lmu_windows_test.go:51`. Cero llamantes productivos. Arrastra a `internal/strategy/live/{engine,validation}.go`. |
| `projection/analysis` | **NO** | `analysis.ProjectV1` (`analysis/v1.go:113`) sin llamantes. El paquete solo lo importa `telemetrytransport/transport.go:22` para `NewAnalysisFull` (`:219`), que tampoco tiene llamantes. |
| Delta RFC 7396 | **NO (ruta inalcanzable)** | `ApplyMergePatch` (`merge_patch.go:11`) solo se llama en `transport.go:380`, dentro de `if len(delta) > 0 && contiguous` (`:378`). Los dos sitios productivos pasan `nil`: `telemetry_core_runtime.go:789,793`. Espejo TS igualmente inalcanzable (`store.ts:166`). |
| Transporte de facts (`NewEngineerFact`, `ServeWailsFacts`, `SSEFactsHandler`, `FactsRoute`, `ProductEngineer`, `ProductAnalysis`) | **NO** | Ninguna ruta `/telemetry/*/facts` en `internal/server/server.go:219-241`; sin llamantes productivos. Los facts llegan a Engineer por la interfaz en proceso `ConsumeFact`. |
| `recording.Coordinator` | **NO** | `recording.NewCoordinator` solo en `internal/app/telemetry_core_hardening_test.go:47`, `recording/coordinator_test.go:526,540`, `recording/sqlite/store_test.go:446,774`. |
| `recording/sqlite` | **Sí, solo lectura** | `recordingsqlite.New(...)` en `internal/app/diagnostics_bridge.go:135`, inyectado en `diagnostics.NewCatalog` (`:133`). Lee un directorio que **nada del binario escribe**. |
| `recording/replay` | **NO** | `architecture_test.go:42-61` (`TestHarnessOnlyReplayIsNotImportedByProductionAnywhere`) lo prohíbe activamente en todo el repositorio. |
| `diagnostics.CaptureManager` + `lmu.CaptureTap` | **NO** | `NewCaptureManager` solo en `raw_capture_test.go`. `driver.config.captureTap` (`drivers/lmu/driver.go:48`) es un campo no exportado que `lmu.New()` (`driver.go:64`) nunca rellena; no hay constructor público que lo permita. |
| `internal/telemetryanalysis` (+ adaptador DuckDB) | **NO** | Solo importadores internos al propio subárbol; ningún `cmd/` ni `internal/app`. |
| `internal/core/deadband.go` | **NO** | Cero importadores, ni de test. |
| `engineer.ProjectV1` (`projection/engineer/v1.go:148`) | **NO** | El camino vivo es `ProjectObservationV1` (`telemetry_core_runtime.go:693`). |
| `internal/engineer/lmu` `ExtendedReader` | **NO** | `SetExtendedReader` definido (`engineer/engine/monitor.go:132`, `engineer/penalties/monitor.go:81`) y nunca llamado fuera de tests; el propio doc-comment de `extended_decoder.go:17` lo llama "fixture-backed". |
| `overlay/core/telemetry-store.ts` (frontend) | **NO** | Sin llamante productivo; solo `telemetry-store.test.ts`. |
| `src/lib/telemetry-ref.ts` (frontend) | **NO en la ruta viva** | Singleton mutable con su propio manejo de diff/epoch (`:198-293`); solo lo tocan `useDemoMode.ts:21` y `lib/visibility.ts:42`. |
| Transportes legacy del overlay | **RETIRADOS y vigilados** | `overlay/transports/legacy-retirement.test.ts:9-33` prohíbe por nombre `wails-telemetry-adapter.ts`, `sse-telemetry-adapter.ts`, `projection-shadow-adapter.ts` y las cadenas `telemetry:update`, `telemetry:source-status`, `/telemetry/stream`. |

**Coste medible de lo anterior**: en cada frame (~60 Hz) el proceso ejecuta
`strategyprojection.ProjectV1`, un `json.Marshal` completo, un SHA-256 y una
publicación en un hub que nadie lee, más la emisión Wails correspondiente.

---

## 8. Frontend: productivo vs legacy

**Camino productivo hoy** (uno solo, tres puntos de entrada):

```
Wails Events / EventSource
  → telemetry-transport/attach.ts:8-46
  → telemetry-transport/store.ts (valida cursor, aplicaría merge-patch)
  → overlay/transports/projection-observer.ts:95  decodeOverlayProjectionV1
  → overlay/projection/overlay-projection-adapter.ts:74   ← FRONTERA
  → TelemetrySnapshot legacy
  → overlay/core/telemetry-rate-coordinator.ts:108
  → RuntimeWidgetFrame.tsx:23 / StudioWidgetFrame
  → widget-types/*/​*-view-model.ts
```

Puntos de entrada:

| Runtime | Fichero:línea | Transporte |
|---|---|---|
| `"desktop"` | `overlay/CompositeApp.tsx:44` | Wails (`Events.On`, `Events.Emit(statusRequestEventName("overlay"))` en `:51`) |
| `"obs"` | `overlay/ObsOverlayApp.tsx:40` | SSE `/telemetry/overlay/projection` |
| `"studio"` | `hub/overlay-studio/StudioRoute.tsx:378` | Wails |

**Qué queda del modelo legacy**: el tipo `TelemetrySnapshot` entero es legacy y
es lo único que ven los widgets. Sobrevive por tres razones concretas:

1. `scoring: readonly Record<string, unknown>[]` — bolsa sin tipar con
   renombres históricos (`place`, `inPits`, `totalLaps`, `timeGapToPlayer`).
2. Campos que la proyección v1 no cubre: `environment`, `damage`,
   `session.globalFlag`, `session.sectorFlags`, `auxiliary.scheduleEvents`.
3. `derived.*` recalculado en cliente (§6.2).

**Ningún widget lee la proyección v1.** La migración se detuvo exactamente en
`overlay-projection-adapter.ts`.

**Reconexión y resincronización**:
- SSE: al `error` del `EventSource` el observer se para y **se reconstruye el
  store entero** (`projection-observer.ts:210-216`), descartando
  epoch/sequence/factCursor para re-sembrar con un par status+full nuevo.
- Wails: no hay reconexión; hay un *pull* — `telemetry:overlay:status:get`
  (`projection-observer.ts:142`, emitido en `CompositeApp.tsx:51` y
  `StudioRoute.tsx:383`), servido por `Hub.ReplayStatus`
  (`transport.go:531-548`) desde `cmd/vantare/main.go:533`. El motivo está
  documentado en `transport.go:522-530`: el puente Wails comparte una única
  suscripción y no repite eventos ya emitidos, así que una ventana abierta a
  media sesión se quedaba en blanco.

---

## 9. Grabación real

| Pieza | Estado | Detalle |
|---|---|---|
| `recording.Coordinator` (`coordinator.go:42`) | **[SOLO TESTS]** | cola con `QueueCapacity`, checkpoint cada 1,5 s (`ports.go:11`, ticker `coordinator.go:219`), lote máximo 64 batches por transacción (`coordinator.go:363`) |
| `recording/sqlite` writer (`store.go`) | **[SOLO TESTS]** como escritor | `schemaVersion = 1` (`:27`), `PRAGMA application_id = 1447120468`, `journal_mode = WAL`, `synchronous = FULL`, `foreign_keys = ON`, `busy_timeout = 5000` (`:476-481`); tablas `recording_meta`, `chunks`, `observed_records`, `facts`, `algorithm_sets` (`:995-1037`) |
| `recording/sqlite` reader | **[ACTIVO]** | `recordingsqlite.New({})` en `internal/app/diagnostics_bridge.go:135` → `diagnostics.NewCatalog` (`:133`); expone `HandlePrepare/List/Inspect/Cancel` por Wails (`diagnostics_bridge.go:175-318`) |
| `recording/replay` (canonical, raw, historical, player) | **[SOLO TESTS]**, prohibido en producción | `architecture_test.go:42-61` |
| `recording.HistoricalStore` / `SessionWriter` / `SessionReader` | interfaces, `ports.go:55-88` | sin implementación productiva conectada |
| Captura raw de frames LMU | **[DESCONECTADO]** | `diagnostics/raw_capture.go` (5 Hz máx., `:28-29`) + `drivers/lmu/capture.go` (5 Hz, ventana 250 ms, `:28-31`); el `CaptureTap` del driver nunca se inyecta |

**Conclusión honesta**: el binario que se distribuye **no graba nada**. Toda la
infraestructura de grabación (coordinador, SQLite, manifiestos, migración,
recuperación, replay) está escrita, testeada y desconectada. El puente de
diagnósticos lee un catálogo de sesiones que el producto nunca puebla.
No puedo determinar desde el código cuál era la cadencia o el tamaño reales en
producción, porque nunca se ha ejercido; lo único medible es el diseño:
checkpoint 1,5 s, ≤64 batches por transacción, un fichero SQLite por sesión.

---

## 10. Inventario de tests

### 10.1 Go — `internal/telemetry`

| Paquete | Ficheros `_test.go` | `Test*` | `Benchmark*` | `Fuzz*` |
|---|---|---|---|---|
| `internal/telemetry` (raíz, arquitectura) | 1 | 6 | 0 | 0 |
| `catalog` | 2 | 8 | **2** | 0 |
| `core` | 5 | 72 | 5 | 2 |
| `derive` | 5 | 34 | 3 | 3 |
| `diagnostics` | 3 | 30 | 0 | 0 |
| `driver` | 1 | 2 | 0 | 0 |
| `drivers/lmu` | 18 | **152** | 7 | 4 |
| `projection` | 2 | 9 | 0 | 0 |
| `projection/analysis` | 1 | 2 | 0 | 0 |
| `projection/engineer` | 6 | 22 | 0 | 0 |
| `projection/overlay` | 1 | 5 | 0 | 0 |
| `projection/strategy` | 1 | 6 | 0 | 0 |
| `recording` | 5 | 27 | 0 | 2 |
| `recording/replay` | 5 | 17 | 0 | 0 |
| `recording/sqlite` | 3 | 33 | 2 | 0 |
| `schema` + subpaquetes | 10 | 28 | 0 | 0 |
| **Total** | **69** | **453** | **19** | **11** |

Benchmarks concretos: `catalog/catalog_bench_test.go` (2), `core` (5, en
`reducer_test.go`/`fanout_test.go`/`session_coordinator_test.go`), `derive` (3),
`drivers/lmu` (7), `recording/sqlite` (2).

### 10.2 Goldens (17)

```
derive/testdata/controls_history_v1.golden.json
derive/testdata/lmu-1.4-self-delta-trace-v1.golden.json
derive/testdata/overlay_timing_v1.golden.json
drivers/lmu/testdata/driver_to_batch_v1.golden.json
drivers/lmu/testdata/grid_v1.golden.json
drivers/lmu/testdata/menu_track_pit_disconnect_v1.golden.json     ← modificado [LOCAL]
drivers/lmu/testdata/strategy_live_signals_v1.golden.json
projection/analysis/testdata/analysis_v1.golden.json
projection/engineer/testdata/engineer_v1.golden.json
projection/overlay/testdata/lmu-1.4-delta-overlay-v1.golden.json  ← nuevo [LOCAL]
projection/overlay/testdata/overlay_v1.golden.json                ← modificado [LOCAL]
projection/overlay/testdata/overlay_v1_pre_d7.golden.json
projection/strategy/testdata/strategy_v1.golden.json
projection/strategy/testdata/strategy_v1_pre_tc10b.golden.json
recording/replay/testdata/canonical-integration-v1.golden.json    ← modificado [LOCAL]
recording/replay/testdata/canonical-v1.golden.json
recording/replay/testdata/raw-v1.golden.json
```

Los ficheros `*_pre_*.golden.json` son goldens de compatibilidad hacia atrás:
congelan la forma anterior de la proyección para demostrar que un cambio es
puramente aditivo.

### 10.3 `architecture_test.go` — las reglas que impone

`internal/telemetry/architecture_test.go` (578 líneas) es un test de
dependencias que parsea los `import` de **todos** los ficheros no-test y
no-generados bajo `internal/telemetry` (`scanProductionImports`, `:243`).

Tres tests de verdad, uno de tabla:

1. `TestTelemetryProductionImportsFollowADR0004` (`:24`) — aplica
   `validateImport` a cada arista real.
2. `TestHarnessOnlyReplayIsNotImportedByProductionAnywhere` (`:42`) — escanea
   **todo el repositorio** buscando importaciones de
   `internal/telemetry/recording/replay`. Incluye ficheros generados.
3. `TestLMUOverlayRuntimeChainHasNoLegacyMockOrProductUICoupling` (`:63`) —
   sobre seis ficheros concretos (`drivers/lmu/driver.go`,
   `drivers/lmu/batch_mapper.go`, `core/reducer.go`,
   `core/session_coordinator.go`, `derive/pipeline.go`,
   `projection/overlay/v1.go`) prohíbe por **texto** las cadenas
   `internal/telemetry/lmu`, `BuildSyntheticBuffer`, `createMockSource`,
   `internal/app`, `internal/server`, `internal/overlay`.
4. `TestValidateImport` (`:100`) — 62 casos de tabla que documentan el grafo.

Reglas efectivas (`validateImport`, `:361-487`):

| Paquete | Solo puede importar (dentro de telemetría) | Prohibiciones extra |
|---|---|---|
| `schema/**` | su propio árbol | sin `reflect`, sin terceros |
| `catalog/**` | `schema` | sin `reflect`, sin terceros |
| `driver/**` | `schema` | |
| `drivers/<sim>/**` | `schema`, `driver`, `core`, `catalog`, su propio árbol | **no otro simulador**, no `projection` |
| `core/**` | `schema`, `driver` | no `catalog`, no `drivers/*`, no `replay` |
| `derive/**` | `schema`, `core`, su árbol | no `driver`, no `projection` |
| `projection/**` | `schema`, `core`, `derive`, raíz `projection`, su propio producto | **no otro producto** |
| `recording/**` | `schema`, `core`, su árbol | `database/sql` y `modernc.org/sqlite` **solo** en `recording/sqlite` |
| `diagnostics/**` | `recording`, su árbol | no `core`, no `derive`, no `projection`, no `driver` |
| **todos** | | nunca `internal/app`, `internal/server`, `internal/overlay`, `internal/engineer`, `internal/strategy`, `pkg/overlay`, Wails, DuckDB; `replay` nunca desde producción |

**Lo que este test no puede ver**: que una arista permitida jamás se recorra en
runtime. Es exactamente por eso que la estructura parece limpia estáticamente
mientras Strategy, Analysis, Fanout y recording están muertos.

### 10.4 Frontend

Tests co-ubicados (`*.test.ts` / `*.test.tsx`) junto a cada módulo. Los
relevantes para telemetría:

- Contrato de transporte: `telemetry-transport/contracts.test.ts`,
  `store.test.ts`, `attach.test.ts`, `harness.test.ts`,
  `projection-golden.test.ts`.
- Contrato cruzado Go↔TS: `internal/app/telemetrytransport/typescript_contract_test.go`
  + `telemetrytransport/testdata/`.
- Proyección: `overlay/projection/overlay-projection-v1.test.ts`,
  `overlay-projection-adapter.test.ts`.
- Retirada de legacy: `overlay/transports/legacy-retirement.test.ts`.
- Un `*.test.ts` por view-model de widget.

### 10.5 Cómo se ejecutan

`Taskfile.yml` en la raíz de `vantare-v2`. Go: `go test ./internal/telemetry/...`
(los tests de `drivers/lmu` con sufijo `_windows_test.go` y `live_windows_test.go`
solo compilan/corren en Windows). Frontend: vitest desde `frontend/`.
No he verificado ejecutando (regla de solo lectura), únicamente inventariado.

---
---

# FASE 2 — Amplificación de cambio medida

Metodología: para cada caso se sigue el camino real del código, no el camino
ideal. El **Caso 3 es medición directa** sobre el diff local; los demás son
enumeración de los puntos de contacto obligatorios que ese diff revela.

## Los siete puntos de contacto obligatorios de una señal

El diff del native delta demuestra que **una sola señal escalar de vehículo**
atraviesa siete capas, cada una con su propio struct que hay que ampliar a mano:

1. `catalog/ids.go` + `catalog/catalog.go` — ID e inventario canónico
2. `drivers/lmu/layout.go` — offset + `admittedFields()` (lista blanca)
3. `drivers/lmu/format.go` — campo en `VehicleObservation` + parseo + validación
4. `drivers/lmu/fusion.go` — `AuthorityRule`, `ageVehicleGrid`, `inferredDecision`, bump de `MatrixVersion`
5. `drivers/lmu/driver.go` — `withFreshness` (marcado stale)
6. `drivers/lmu/batch_mapper.go` — `mapVehicle`
7. `core/reducer.go` (`VehicleState`) → [`derive/*` si hay derivación] → `projection/*/v1.go` (una por producto que la quiera) → `frontend/overlay-projection-v1.ts` (tipo + decode) → `overlay-projection-adapter.ts` (mapeo) → `telemetry-snapshot.ts` (campo legacy) → view-model del widget

No existe ninguna generación de código, ni registro por reflexión (está
prohibida por `architecture_test.go:402,414`), ni tabla declarativa que
sustituya a esos siete pasos.

---

## Caso 1 — Señal escalar universal nueva: *steering angle*

Señal presente en todos los simuladores, un valor por vehículo, sin derivación,
sin widget nuevo.

| Capa | Ficheros | Cambio |
|---|---|---|
| schema | `schema/controls/types.go` (+ `types_test.go` si se añade tipo `SteeringAngle`) | alias de tipo + validación |
| catalog | `catalog/ids.go`, `catalog/catalog.go`, `catalog/catalog_test.go` | nuevo `SignalID` + `Definition` (unidad, rango, notas) |
| driver LMU | `drivers/lmu/layout.go` (+`_test`), `format.go` (+`_test`), `fusion.go` (+`_test`), `driver.go` (+`_test`), `batch_mapper.go` (+`_test`) | offset, parseo, regla de autoridad, envejecimiento, `withFreshness`, `mapVehicle` |
| core | `core/reducer.go` | campo en `VehicleState` |
| derive | — | ninguno (no hay derivación) |
| proyección | `projection/overlay/v1.go` (+`_test`); opcional `engineer/v1.go`, `strategy/v1.go`, `analysis/v1.go` | `VehicleV1` + `projectVehicle` (+ `capabilities` si aplica) |
| goldens | `drivers/lmu/testdata/{driver_to_batch_v1,grid_v1,menu_track_pit_disconnect_v1,strategy_live_signals_v1}.golden.json`, `projection/overlay/testdata/overlay_v1.golden.json`, `projection/engineer/testdata/engineer_v1.golden.json`, `recording/replay/testdata/canonical-*.golden.json` | regeneración |
| frontend | `overlay-projection-v1.ts` (+`_test`), `overlay-projection-adapter.ts` (+`_test`), `overlay/core/telemetry-snapshot.ts` | tipo + `decodeOptionalField` + `assignIfPresent` + campo legacy |

**Totales**

| Métrica | Valor |
|---|---|
| Paquetes Go tocados | 6 (`schema/controls`, `catalog`, `drivers/lmu`, `core`, `projection/overlay`, +N por producto) |
| Ficheros Go de producción | **10–13** |
| Ficheros Go de test | 7–9 |
| Goldens a regenerar | 5–8 |
| Ficheros frontend | 3 producción + 2 test |
| **Total ficheros** | **≈ 27–35** |
| Tipos Go tocados | `catalog.SignalID`, `lmu.telemetryLayout`, `lmu.VehicleObservation`, `lmu.AuthorityRule` (tabla), `core.VehicleState`, `overlay.VehicleV1` |
| Frontend sí/no | **Sí** (obligatorio, si no la señal no sale del proceso) |
| Widgets sí/no | Solo si hay widget que la pinte |
| Riesgo para otros consumidores | **Bajo**. Añadir un campo es aditivo: `decodeOptionalField` (`overlay-projection-v1.ts:409`) sintetiza `missing` si falta, y `validateSafeExtensions` (`contracts.ts:386`) acepta claves nuevas. **Trampas reales**: (a) el nombre JSON no puede ser `raw/source/clock/observed/derived/finalstate/canonicalversion` — `inspectPayloadKeys` (`transport.go:684`) rechazaría el payload entero; (b) el payload tiene tope de 256 KiB con 104 vehículos; (c) todos los goldens rompen y hay que revisarlos uno a uno. |

---

## Caso 2 — Señal opcional no disponible en todos los sims: *brake bias*

### ¿Cómo se expresa hoy "no disponible"?

Hay **tres mecanismos distintos y ninguno cubre el caso**:

| Mecanismo | Sitio | Qué expresa | Qué NO expresa |
|---|---|---|---|
| `schema.MissingField[T]()` | `schema/quality.go:67` | "este frame no trae valor" | no distingue *nunca lo traerá* de *ahora no* |
| `projection.MissingField[T]()` → `{present:false, freshness:"missing", provenance:"unknown"}` | `projection/contracts.go:87` | idem, en JSON | idem |
| `overlay.Capability` calculada | `projection/overlay/v1.go:269-291` | grupos gruesos (`session`, `standings`, `controls`, `pit`, `controls.history`) inferidos de los valores presentes en **este** frame | granularidad de señal; y es inferencia, no declaración |
| `driver.Descriptor.Capabilities` / `RuntimeSnapshot.Capabilities` | `driver/descriptor.go:12-24` | facilidad de **adquisición** (`shared-memory`, `rest`) | nada sobre señales |
| **`engineer.Capability{ID, State}`** | `projection/engineer/contract.go:22-42` | `Unknown / Supported / Degraded`; además `engineer.Field.capabilityState` (`:106,210`) | **es el único sitio del sistema con la distinción correcta**, y solo lo usa Engineer |

Adicionalmente, la matriz de autoridad LMU (`drivers/lmu/fusion.go:31-69`) es de
facto un declarativo de "qué señales soporta LMU" — pero vive **dentro** de
`drivers/lmu`, no la ve nadie fuera, y una señal ausente de la matriz
simplemente nunca se puebla.

**Veredicto medido**: para Overlay, Strategy y Analysis, "el simulador no lo
soporta" es hoy **indistinguible** de "falta en este frame". Y en el frontend la
distinción se pierde del todo: el adapter convierte los `Field` en
`number | undefined` (`overlay-projection-adapter.ts`, `assignIfPresent`), de
modo que el widget solo ve `undefined`.

### Amplificación

Todo lo del Caso 1, **más** la decisión de contrato:

| Trabajo adicional | Ficheros |
|---|---|
| Extender el vocabulario de disponibilidad al resto de productos (portar `CapabilityState` de Engineer a `projection/contracts.go`) | `projection/contracts.go` (+`_test`), y cada `projection/*/v1.go` |
| Declarar soporte por driver (hoy no existe la interfaz) | `driver/descriptor.go` o nuevo `driver/signals.go` (+`_test`), `drivers/lmu/fusion.go` |
| Propagar al JSON y al decoder | `overlay-projection-v1.ts` (+`_test`), `contracts.ts` |
| Que el widget distinga "no soportado" de "sin dato" | `telemetry-snapshot.ts`, cada view-model afectado, i18n × 4 |

| Métrica | Valor |
|---|---|
| Ficheros | **Caso 1 + 8–14** ⇒ **≈ 35–49** |
| Tipos nuevos | `projection.CapabilityState` (o equivalente), extensión de `driver.Descriptor` |
| Frontend sí/no | **Sí** |
| Widgets sí/no | **Sí** (hay que pintar un estado terciario) |
| Riesgo para otros consumidores | **Medio-alto**. Cambiar la forma de `projection.Field` afecta a **las cuatro** proyecciones, a todos los goldens y al decoder TS. Alternativa de bajo riesgo: dejarlo como `MissingField` y aceptar que la UI no puede diferenciar — que es la situación actual. |

---

## Caso 3 — Señal específica de un simulador: *LMU native delta* (MEDIDO)

Fuente: `git diff --stat` del árbol de trabajo. 51 ficheros en total, de los que
`internal/updater/{updater.go,updater_test.go,version.go,version_test.go}` son
un cambio independiente. **El native delta son 47 ficheros, +≈730/−≈75 líneas.**

### Desglose exacto

**Go — producción (11)**

| Fichero | Cambio |
|---|---|
| `internal/telemetry/catalog/ids.go` | +2 `SignalID` (`SignalSessionNativeDeltaBest`, `SignalSessionPreviousLapDelta`) |
| `internal/telemetry/catalog/catalog.go` | +2 `Definition` |
| `internal/telemetry/drivers/lmu/layout.go` | +`DeltaBest layoutField` en `telemetryLayout`, offset 696, +entrada en `admittedFields()` |
| `internal/telemetry/drivers/lmu/format.go` | +campo en `VehicleObservation`, +14 líneas de parseo con la heurística de validez (LMU no tiene flag `LapDeltaToBestLap_OK`) |
| `internal/telemetry/drivers/lmu/fusion.go` | `MatrixVersion 4→5`, +`AuthorityRule`, +`ageVehicleGrid`, +`case` en `inferredDecision`, +import de `schema/session` |
| `internal/telemetry/drivers/lmu/driver.go` | +línea en `withFreshness` |
| `internal/telemetry/drivers/lmu/batch_mapper.go` | +línea en `mapVehicle` |
| `internal/telemetry/core/reducer.go` | +`DeltaBest` en `VehicleState` |
| `internal/telemetry/derive/pipeline.go` | +`SignalObservedDeltaBest`, +entrada en `Inputs` de `DerivationSelfDelta` |
| `internal/telemetry/derive/delta.go` | **+109/−7**: `SelfDelta` +3 campos, `selfDeltaTracker` +3 campos, `Apply` reescrito para preferir el nativo, nuevo `applySelf`, nuevo `recordSelectedDelta`, `completeCandidate`/`clearReference`/`output`/`currentDelta` tocados |
| `internal/telemetry/projection/overlay/v1.go` | +3 campos en `PayloadV1` + 3 líneas en `Project` |

**Go — tests (9)**: `catalog_test.go`, `derive/delta_test.go` (+71),
`drivers/lmu/{batch_mapper,driver,format,fusion,layout,strategy_signal_audit}_test.go`,
`projection/overlay/v1_test.go`.

**Go — goldens (4)**: `drivers/lmu/testdata/menu_track_pit_disconnect_v1.golden.json`,
`projection/overlay/testdata/overlay_v1.golden.json`,
`projection/overlay/testdata/lmu-1.4-delta-overlay-v1.golden.json` (nuevo),
`recording/replay/testdata/canonical-integration-v1.golden.json`.

**Frontend — producción (9)**: `overlay/projection/overlay-projection-v1.ts`
(+21), `overlay/projection/overlay-projection-adapter.ts` (+22),
`overlay/core/telemetry-snapshot.ts` (+4),
`overlay/widget-types/delta/delta-definition.ts` (+37/−12, selector nuevo en el
inspector), `overlay/widget-types/delta/delta-view-model.ts` (+17/−6),
`i18n/locales/studio-v3/{en,es,it,pt}.ts` (+4 cada uno).

**Frontend — tests (6)**: `overlay-projection-v1.test.ts`,
`overlay-projection-adapter.test.ts`, `delta-definition.test.ts`,
`delta-view-model.test.ts`, `hub/overlay-studio/inspector/StudioInspector.test.tsx`,
`hub/overlay-studio/inspector/inspector-sections.test.ts`.

**Docs (8)**: `changelog.md`, `current-plan.md`, y seis matrices de
`docs/telemetry-core/` (`domain-inventory`, `lmu-authority-matrix`,
`lmu-overlay-signal-provenance`, `overlay-shadow-matrix`, `runtime-derivations`,
`signal-catalog`) que se mantienen a mano en paralelo al código.

| Métrica | Valor medido |
|---|---|
| Paquetes Go | **6** (`catalog`, `drivers/lmu`, `core`, `derive`, `projection/overlay`, + goldens de `recording/replay`) |
| Ficheros Go | **24** (11 producción + 9 test + 4 golden) |
| Ficheros frontend | **15** (9 producción + 6 test) |
| Ficheros docs | **8** |
| **Total** | **47** |
| Tipos Go | `catalog.SignalID`, `lmu.telemetryLayout`, `lmu.VehicleObservation`, `lmu.authorityMatrixV4`, `core.VehicleState`, `derive.SelfDelta`, `derive.selfDeltaTracker`, `overlay.PayloadV1` |
| Frontend sí/no | **Sí** |
| Widgets sí/no | **Sí** — 1 widget (`delta`), con inspector, contenido persistido (`DeltaContent`) e i18n × 4 |
| Riesgo para otros consumidores | **Medio.** (1) `MatrixVersion 4→5` es un cambio de contrato observable en `Observation.MatrixVersion` y en la matriz exportada por `AuthorityMatrix()`. (2) `DeltaContent` pasa de `Record<string,never>` a `{reference?}` y `parseContent` cambia de "debe estar vacío" a "acepta `reference`": **perfiles guardados con el contenido antiguo siguen validando**, pero un perfil nuevo abierto por una versión antigua fallaría. (3) `derive/delta.go` cambia el significado de `SelfDelta.Seconds` cuando el nativo está disponible → afecta también a `deltaHistory` y por tanto al widget `delta-trace`. (4) 4 goldens tocados, uno de ellos de `recording/replay`, que ni siquiera es un consumidor vivo. |

### Lecturas de calibración

- **Ratio doc/código**: 8 ficheros de documentación para 20 de código de
  producción. La documentación de telemetría se mantiene a mano y en paralelo.
- **El coste no está en la señal, está en la travesía**: 11 ficheros de
  producción Go para transportar un `float64` desde un offset de memoria hasta
  un JSON.
- **La derivación es lo caro**: `derive/delta.go` concentra el 15 % del diff él
  solo, porque preferir la señal nativa exigió reestructurar el tracker.
- **La frontera legacy se paga dos veces**: hay que añadir el campo a
  `overlay-projection-v1.ts` *y* a `telemetry-snapshot.ts` *y* escribir el
  mapeo entre ambos.

---

## Caso 4 — Widget nuevo con señales ya disponibles: *Speed + RPM + Gear*

Las tres señales ya viajan en `overlay.VehicleV1` (`speedMps`, `engineRpm`,
`gear`, `v1.go:65-67`) y ya llegan al snapshot legacy
(`player.speedKph/rpm/gear`, `telemetry-snapshot.ts:22-24`).

**Cambios en Go: cero.**

| Capa frontend | Ficheros |
|---|---|
| Tipo de widget | `overlay/core/profile-document.ts:16-61` (unión `WidgetType` + `ALL_WIDGET_TYPES`) |
| Definición | `overlay/widget-types/<nuevo>/<nuevo>-definition.ts` (layout por defecto, `capabilities.inspectorSections`, `inspector`, `createDefault`, `parseContent`, `buildViewModel`) |
| View-model | `overlay/widget-types/<nuevo>/<nuevo>-view-model.ts` (+`.test.ts`) |
| Registro | `overlay/core/widget-registry.ts:70-88` (import + `register`) |
| Renderer por design system | `design-systems/vantare-original/<nuevo>/*.tsx` + `manifest.ts`; `design-systems/vantare-crystal/<nuevo>/*.tsx` + `manifest.ts`; (`vantare-endurance` solo cubre 4 widgets, opcional) | 
| Catálogo de diseños oficiales | `design-systems/official-designs.ts` (+`.test.ts`) |
| i18n | `i18n/locales/studio-v3/{en,es,it,pt}.ts` (etiqueta + controles del inspector) |
| Tests del Studio | `hub/overlay-studio/inspector/inspector-sections.test.ts`, `StudioInspector.test.tsx`, `overlay/core/widget-registry.test.ts`, `widget-aspect-contract.test.ts` |

| Métrica | Valor |
|---|---|
| Paquetes Go | **0** |
| Ficheros Go | **0** |
| Ficheros frontend producción | **≈ 10–14** (definición, view-model, 2–3 renderers, 2–3 manifiestos, `widget-registry`, `profile-document`, `official-designs`, 4 i18n) |
| Ficheros frontend test | **4–6** |
| **Total** | **≈ 14–20** |
| Frontend sí/no | **Sí, exclusivamente** |
| Widgets sí/no | **Sí** (es el caso) |
| Riesgo para otros consumidores | **Bajo.** El registro es explícito y `assertCompleteWidgetDefinition` (`widget-registry.ts:50-67`) falla en arranque si la definición está incompleta. Ampliar la unión `WidgetType` es aditivo; los perfiles antiguos no contienen el tipo nuevo. El único riesgo real es el **presupuesto de render**: cada widget añade un bucket de Hz propio en `TelemetryRateCoordinator` (`:76-91`). |

**Este es el caso barato del sistema, y es la prueba de que la arquitectura de
proyección funciona cuando la señal ya está.**

---

## Caso 5 — Simulador nuevo (player telemetry, standings, fuel; sin spatial de rivales, sin meteorología, sin delta nativo)

### Qué hay que implementar

| Contrato | Fichero:línea | Obligatorio |
|---|---|---|
| `core.Driver[T]` — `Run(ctx, driver.ObservationSink[T]) error` + `RuntimeSnapshot() driver.RuntimeSnapshot` | `core/ports.go:22-25` | **Sí** |
| `driver.ObservationSink[T]` (lo consume el driver, lo provee el manager) | `driver/state.go:81-88` | provisto |
| `driver.Descriptor{ID, Priority, Capabilities}` | `driver/descriptor.go:12-16` | **Sí** |
| `driver.RuntimeSnapshot{State, Capabilities}` + máquina de estados `driver.State.CanTransitionTo` | `driver/descriptor.go:21-24`, `driver/state.go:14-88` | **Sí** |
| `core.DriverCandidate[T]{Descriptor, Detect, New, Retryable, DetectionRetryable}` | `core/driver_manager.go:26-34` | **Sí** |
| Tipo `Observation` propio + un **BatchMapper propio** que produzca `core.Batch` | no hay interfaz: `lmu.BatchMapper` es concreto; el único contrato es `core.BatchSink` (`core/ports.go:36-38`) | **Sí, y hay que escribirlo desde cero** |
| `driver.SourceStatus` | `driver/source_status.go:6-13` | lo construye el runtime, hoy con literales |

### Qué está acoplado a LMU fuera de `drivers/lmu`

**🔴 Acoplamiento duro — bloquea un segundo simulador.** Todo en
`internal/app/telemetry_core_runtime.go`:

| Línea | Código | Por qué bloquea |
|---|---|---|
| `:117` | `manager *telemetrycore.DriverManager[lmu.Observation]` | el parámetro genérico del runtime **es** el tipo de observación de LMU |
| `:118` | `mapper *lmu.BatchMapper` | campo concreto, sin interfaz |
| `:144-157` | lista literal de **un** `DriverCandidate[lmu.Observation]`, con `Detect: func(ctx) (bool,error) { return true, nil }` | el `DriverManager` es multi-candidato por diseño; el composition root lo desperdicia |
| `:612` | `func (sink runtimeObservationSink) WriteObservation(ctx, observation lmu.Observation)` | firma del sink tipada a LMU |
| `:627` | `if lmu.IsUnmappableFrame(err) { return nil }` | la taxonomía de errores que mantiene viva la tubería es específica de LMU |
| `:256-257` | `Kind: "lmu"`, `Name: "Le Mans Ultimate"` | `SourceStatus()` fija la identidad del sim como literal, sea cual sea el driver activo. Lo leen el Topbar y la puerta LIVE del Studio |
| `:150-151` | `lmu.CapabilitySharedMemory`, `lmu.CapabilityREST` | vocabulario de capacidades propiedad del paquete del driver, no de `internal/telemetry/driver` |

**🟠 Acoplamiento blando — constantes de LMU en capas sim-neutras**

| Sitio | Contenido |
|---|---|
| `core/session_coordinator.go:27-29` | `const MaxSessionVehicleHistory = 104` — "matches the demonstrated LMU VehicleScoring slot"; se aplica en `:122-123` |
| `catalog/catalog.go:68` | `Range: ClosedRange(1,104)` + nota "demonstrated LMU vehicle bound" |
| `catalog/catalog.go:79` | `Range: ClosedRange(0,104)` idem |
| `catalog/catalog.go:102` | ejes espaciales de LMU documentados en la definición canónica |
| `schema/spatial/types.go:14` | "The canonical LMU driver uses +X left, +Y up and +Z rearward" — convención de coordenadas asumida en el schema neutro |
| `schema/pit/types.go:6` | "InPit is the observed LMU VehicleScoring boolean" |
| `schema/vehicle/types.go:6` | "LMU gear semantics remain deferred" |
| `schema/weather/types.go:4` | temperatura sin alias de unidad "until the LMU source contract is demonstrated" |
| `diagnostics/raw_capture.go:66-68`, `:658-661` | `CaptureSimulatorLMU`, `CapturePayloadLMUSharedMemory`; **rechaza activamente** cualquier captura no-LMU |

**🟢 Ya sim-agnóstico**: `internal/server` (cero referencias a LMU),
`diagnostics/catalog.go:715` (allow-list `"lmu","iracing","assetto-corsa","assetto-corsa-evo"`),
`internal/app/diagnostics_service.go:277`, y todo `frontend/src/telemetry-transport`
(cero ocurrencias de `lmu`). Las apariciones de LMU en el frontend son de
launcher, calendario o **temas visuales** (`design-systems/vantare-endurance/standings/StandingsLmuTemplate.tsx`,
paleta de clases; `templateId: "standings-lmu"`), nunca de telemetría.

### Amplificación

| Trabajo | Ficheros |
|---|---|
| Paquete driver nuevo `internal/telemetry/drivers/<sim>/` | **≈ 8–12 producción** (reader, layout/format o cliente de API, fusion o equivalente, driver, batch_mapper, version) + **≈ 8–15 test** + 2–4 goldens |
| Genericizar el composition root | `internal/app/telemetry_core_runtime.go` — reescritura sustancial: introducir una interfaz `ObservationMapper` o mover el mapper detrás de `core.BatchSink`; convertir el `DriverManager` en multi-candidato; sacar `IsUnmappableFrame` a `internal/telemetry/driver`; derivar `SourceStatus.Kind/Name` del `Descriptor` activo |
| Neutralizar `driver.Capability` | `driver/descriptor.go` + `drivers/lmu/driver.go` |
| Diagnósticos | `diagnostics/raw_capture.go` (aceptar más simuladores) |
| Constantes 104 | `core/session_coordinator.go`, `catalog/catalog.go` (2 rangos) |
| Declarar señales no soportadas | ver Caso 2 — sin eso, "este sim no tiene spatial de rivales" es indistinguible de "falta el dato" |
| Tests de arquitectura | `architecture_test.go` ya cubre `drivers/<sim>` genéricamente (`concreteDriverRoot`, `:527-537`) y ya tiene un caso `drivers/iracing` (`:130`) — **no requiere cambios** |
| Frontend | ninguno para el transporte; sí para el indicador de fuente si deja de ser "LMU" (`hub/components/Topbar.tsx:66-67`, `EmptyActivity.tsx:11`, `HeroSection.tsx:29`) |

| Métrica | Valor |
|---|---|
| Paquetes Go nuevos | 1 (`drivers/<sim>`) |
| Paquetes Go modificados | **5–7** (`internal/app`, `driver`, `core`, `catalog`, `diagnostics`, +`projection/*` si el sim aporta señales nuevas) |
| Ficheros Go | **≈ 30–45** |
| Ficheros frontend | **0–5** (solo cosmética de fuente) |
| Widgets sí/no | **No** — los 19 widgets funcionan sin tocar nada si el sim puebla las mismas señales |
| Riesgo para otros consumidores | **Alto en el composition root, bajo aguas abajo.** Reescribir `telemetry_core_runtime.go` toca el único fichero por el que pasa el 100 % de la telemetría productiva, con 3 goroutines, 2 mutexes y una máquina de estados de ciclo de vida de 4 estados. Aguas abajo el riesgo es bajo: reducer, derive, proyecciones y transporte ya son genéricos. |

### Veredicto de sim-agnosticismo

La **mitad inferior** del stack (schema, envelope, core, derive, projection,
transport) es genuinamente agnóstica *en forma*: genéricos, `driver.Descriptor`,
listas de capacidades, un `DriverManager` multi-candidato, y un
`architecture_test.go` que ya contempla `drivers/iracing`.
La **mitad superior la colapsa**: `internal/app/telemetry_core_runtime.go`
instancia `DriverManager[lmu.Observation]` con una lista de un elemento, un
`*lmu.BatchMapper` concreto, un sink tipado a LMU, un predicado de error de LMU
y un `Kind:"lmu" / Name:"Le Mans Ultimate"` literal.
**La abstracción existe pero nunca se ha ejercido**, y el test de arquitectura no
puede detectarlo porque solo mira aristas de importación, no si se recorren.

---

## Tabla comparativa de amplificación

| Caso | Paquetes Go | Ficheros Go | Ficheros frontend | Docs | Total | Frontend | Widgets | Riesgo |
|---|---|---|---|---|---|---|---|---|
| 1 — escalar universal (steering) | 6 | 22–30 | 5 | 2–6 | **27–35** | Sí | Opcional | Bajo |
| 2 — opcional por sim (brake bias) | 7–8 | 28–40 | 7–9 | 2–6 | **35–49** | Sí | Sí | Medio-alto |
| 3 — específica de sim (native delta) **[MEDIDO]** | **6** | **24** | **15** | **8** | **47** | Sí | Sí (1) | Medio |
| 4 — widget con señales existentes | **0** | **0** | 14–20 | 0–1 | **14–20** | Sí | Sí | Bajo |
| 5 — simulador nuevo | 6–8 | 30–45 | 0–5 | 3–8 | **33–58** | Casi no | **No** | Alto (composition root) |

---

## Anexo — Afirmaciones que NO he podido determinar desde el código

1. **Tamaño y cadencia reales de una grabación**: la infraestructura nunca se ha
   ejercido en producción; solo puedo citar el diseño (checkpoint 1,5 s,
   ≤64 batches por transacción, SQLite WAL con `synchronous=FULL`).
2. **Latencia extremo a extremo real**: he reconstruido la cadena de llamadas y
   las cadencias declaradas, pero no he ejecutado nada (regla de solo lectura).
   El coste del `json.Marshal` + SHA-256 a 60 Hz con 104 vehículos es
   estructuralmente relevante pero no está medido aquí.
3. **Si `overlay_v1_pre_d7.golden.json` y `strategy_v1_pre_tc10b.golden.json`
   siguen vivos como guardias de compatibilidad** o son residuos: existen y los
   consumen tests de su paquete, pero no he verificado qué aserción concreta
   hacen.
4. **Por qué `SnapshotV1` de Engineer coexiste con `ObservationSnapshotV1`**: hay
   dos formas de proyección en `projection/engineer` y solo la segunda tiene
   consumidor; no he determinado si la primera es un residuo o una API prevista.
5. **Intención del `MatrixVersion`**: se incrementa a 5 en el diff local y viaja
   en `Observation.MatrixVersion`, pero no he encontrado ningún consumidor que
   lo compare contra un valor esperado fuera de los tests de `drivers/lmu`.
