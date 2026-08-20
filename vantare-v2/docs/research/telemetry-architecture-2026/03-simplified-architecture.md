# 03 — Arquitectura simplificada (Agente B)

Autor: Agente B — Arquitecto de simplificación.
Fecha: 2026-08-19. Checkout: rama `vantareapp/isa-338-...`, HEAD `08e316c1`, working tree sucio.
Método: lectura directa del código en `vantare-v2/`. Toda afirmación relevante lleva `archivo:línea` o el comando `grep` que la respalda. Distingo explícitamente **committeado** de **diff local** (39 archivos, `git diff --stat -- internal/telemetry frontend/src/overlay frontend/src/hub frontend/src/i18n` → 39 archivos, +592/−76).

---

## 0. Resumen ejecutivo

El sistema actual **no es complejo por exceso de dominio**: es complejo por exceso de *mecanismo genérico sin consumidor*. La medición concreta:

| Hallazgo | Evidencia |
|---|---|
| `core.Fanout` (572 líneas + 961 de test) no tiene ningún consumidor productivo | `grep -rn "Fanout" --include=*.go` fuera de tests → **0 resultados**; sólo `core/fanout_test.go`, `derive/fanout_integration_test.go`, `engineer/service/canonical_input_test.go` |
| RFC 7396 (merge patch) nunca se usa en producción | Únicas llamadas productivas: `internal/app/telemetry_core_runtime.go:789` y `:793`, ambas `PublishSnapshot(frame, nil)`. La rama de reconstrucción `transport.go:378-394` y `merge_patch.go` (116 líneas) sólo la ejercitan tests |
| Productos Engineer y Analysis nunca cruzan el transporte | `NewEngineerFull`, `NewAnalysisFull`, `NewEngineerFact` no tienen llamador productivo (`grep` → sólo `transport_test.go`) |
| El stream ordenado de facts no está registrado | `ServeWailsFacts` y `SSEFactsHandler` (adapters.go:59, :141) sin registro; `internal/server/server.go:227,233` sólo monta `SSEHandler` para overlay y strategy |
| El `catalog` (241+54 líneas de código, 369 de test) lo consume un único archivo | `grep -rn "telemetry/catalog"` productivo → sólo `drivers/lmu/fusion.go:7` |
| El registro declarativo de derivaciones no ejecuta nada | `derive/pipeline.go:70-71` («Runtime stages are fixed in code; definitions do not contain callbacks») y `Apply` hardcodea las 4 etapas en `pipeline.go:272-283` |
| El write path de Recording está muerto en producción | `recording.NewCoordinator` sólo aparece en su propia definición (`recording/coordinator.go:42`); no hay ningún `SessionWriter`/`BeginSession` productivo fuera del paquete. Sólo el **read path** vive: `internal/app/diagnostics_bridge.go:135` → `recordingsqlite.New`, montado en `cmd/vantare/main.go:1813` |
| Engineer se entrega **síncronamente** dentro del hot path del driver | `telemetry_core_runtime.go:673` — `deliverEngineer(final, facts.values)` dentro de `runtimeBatchSink.WriteBatch`. El «aislamiento» actual es de *errores*, no de *latencia* |
| Overlay y Engineer proyectan lo mismo desde `derive.FinalState` con nombres distintos | `projection/overlay/v1.go:43-91` vs `projection/engineer/v1.go:50-97`. Engineer añade spatial y `vehicleCount/playerPresent`; Overlay añade `controlsHistory` y `deltaHistory` |
| El frontend re-deriva lo que el backend ya deriva | `frontend/src/overlay/core/derived-telemetry-store.ts:29-31` (`INPUT_LIMIT`, `DELTA_LIMIT`, `FUEL_LIMIT`) frente a `overlay/v1.go:49` (`controlsHistory`) y `:58` (`deltaHistory`) |
| El frontend hace selección de dominio | `widget-types/relative/relative-row-selection.ts:9-48` ordena y recorta ahead/behind en TS, mientras `derive.GapSet` ya existe en Go |
| Adaptador legacy de 640 líneas hacia un tipo laxo | `frontend/src/overlay/projection/overlay-projection-adapter.ts` (640) → `core/telemetry-snapshot.ts` (54), cuyo `scoring` es `readonly Record<string, unknown>[]` (telemetry-snapshot.ts:39): **el type safety muere ahí** |

Mi propuesta elimina ~40% del código de `internal/telemetry` y ~1.100 líneas del frontend sin perder ninguna garantía **efectivamente ejercida en producción**, y arregla dos defectos reales que la arquitectura actual tiene: el hot path síncrono con Engineer, y la pérdida de type safety en el borde del frontend.

---

## 1. Inventario pieza por pieza: eliminar / fusionar / conservar

Leyenda: **E** = eliminar, **F** = fusionar, **C** = conservar (posiblemente reescrito).

### 1.1 Adquisición (driver LMU)

| Pieza | Decisión | Justificación con evidencia |
|---|---|---|
| `drivers/lmu/reader*.go` (SM Windows + stub) | **C** intacto | Es el único código que toca el simulador. `driver.go:17` `defaultInterval = time.Second/60`. Sin alternativa. |
| `drivers/lmu/layout.go` + `format.go` (601) | **F** en `lmu/decode.go` | Ambos son «bytes → valores tipados». Están separados por capas conceptuales, no por necesidad. El diff local del delta nativo tocó los dos (`layout.go` +3, `format.go` +14): la separación **duplica el coste de añadir un campo**. |
| `drivers/lmu/rest.go` (605) | **C** | El REST aporta señales que la SM no da con fiabilidad y tiene su propia cadencia (`rest.go:26` 250 ms, TTL 2 s). Real y necesario. |
| `drivers/lmu/fusion.go` (483) + `AuthorityMatrix` | **C** el mecanismo, **E** el acoplamiento al catálogo | La fusión por campo con TTL es una garantía real y multi-fuente (SM 60 Hz vs REST 4 Hz con TTL 2 s). Pero `authorityMatrixV4` (fusion.go:31-69) indexa por `catalog.SignalID`, y el catálogo entero existe **sólo para esto** (`grep` → `fusion.go:7` es el único importador productivo). Sustituyo `catalog.SignalID` por una constante local del driver. |
| `drivers/lmu/batch_mapper.go` (359) | **F** dentro del driver | Es identidad de sesión/vehículo/cursor, no «mapeo de batch». Es el único sitio donde vive la continuidad de identidad LMU (`batch_mapper.go:38-52`, `sessionSignature`, `generations`). Se conserva la lógica; desaparece como paquete-concepto separado. |
| `drivers/lmu/capture.go` (1370) + `delta_trace.go` (650) | **C** fuera del núcleo | Son herramientas de diagnóstico/sanitización, sin consumidor en el hot path. No estorban si viven en `internal/diagnostics/`. **No** las cuento como parte de la arquitectura. |
| `telemetry/driver/` (Descriptor, State, Capability, SourceStatus) | **C** reducido | `driver.State` es un vocabulario real que atraviesa hasta el frontend (`frontend/src/telemetry-transport/contracts.ts:22-31`, ocho estados idénticos). Conservar. `driver.Capability` + `Descriptor.Priority` + `DriverCandidate.Detect` son mecanismo de descubrimiento para **un solo candidato** hoy (`telemetry_core_runtime.go:144-157`): reducir. |
| `core.DriverManager` (557 + 1090 de test) | **F** en un `Supervisor` de ~150 líneas | Su único trabajo productivo es reintentar. La política ya está diluida a un valor gigante (`telemetry_core_runtime.go:165`, `MaxReconnects: 1_000`) precisamente porque la sofisticación no aportaba. Conservo reintento con backoff + `StableRun` reset; elimino el registro de candidatos genérico. |

### 1.2 Vocabulario y calidad

| Pieza | Decisión | Justificación |
|---|---|---|
| `schema.Field[T]` (quality.go:42-47) | **C**, es el corazón | Presencia independiente del valor + provenance + freshness. Sin esto se pierde «false y 0 son observaciones válidas». Garantía real y barata: struct por valor, `comparable`, sin punteros. |
| `projection.Field[T]` (contracts.go:78-83) | **E** — **fusionar con `schema.Field`** | Es un **clon exacto** con tags JSON, más `FromField`/`MapField`/`projectProvenance`/`projectFreshness` (contracts.go:94-161) que existen sólo para convertir un tipo en su gemelo. Coste: cada señal nueva se escribe dos veces. Solución: `schema.Field` con `MarshalJSON`/`UnmarshalJSON` propios y campos exportados. Elimina ~120 líneas y una clase entera de errores de traducción. |
| `schema/{identity,session,standings,vehicle,energy,pit,spatial,controls,wheels,weather}` (10 subpaquetes, 1.218 líneas totales) | **F** en **un** paquete `signals` | Cada uno tiene entre 4 y 36 líneas de `type X float64`. `schema/weather/types.go` son **5 líneas**; `schema/pit/types.go`, **8**. Diez paquetes para 190 líneas de typedefs obliga a diez imports en cada archivo del pipeline (`core/reducer.go:11-19`, `overlay/v1.go:12-19`). Los tipos nominales aportan seguridad real; los **paquetes** no aportan nada. |
| `schema.Domain`, `schema.Unit`, `schema.Range`, `RangeKind` (types.go:10-172) | **E** | 172 líneas de metadatos (`UnitLiters`, `RangeNonNegative`, `Range.Validate`) sin ningún consumidor de runtime. No hay validación de rango en el reducer (`core/reducer.go:246-267` valida identidad y conteo, no rangos) ni en las proyecciones. Es documentación ejecutable con coste de mantenimiento. |
| `telemetry/catalog` (295 líneas + 369 test) | **E** | Un solo importador productivo (`lmu/fusion.go:7`). El propio código declara que está fuera del hot path (`core/reducer.go:74-76`). Su valor —«qué señales existen»— lo da mejor el tipo `CanonicalState` en Go. El diff local del delta tocó `catalog.go` +2 y `ids.go` +2 **sin ningún efecto funcional**: puro peaje. |
| `schema/envelope` (Header, Snapshot, Fact, clone) | **C** simplificado | `Snapshot[T]` con clone forzado (`envelope.NewSnapshot(..., cloneObservedState)`) evita aliasing entre etapas. Real. Pero el patrón «devuelve `(T, bool)` y si false → `ErrCloneRequired`» aparece 6 veces (`overlay/v1.go:130-132`, `strategy/v1.go:70-72`, `pipeline.go:252-255`, …) y nunca es recuperable. Sustituir por propiedad de tipo: quien construye ya posee. |
| `schema.Epoch` / `Sequence` / `Cursor` | **C** | Núcleo del determinismo y del replay parity. Innegociable. |

### 1.3 Núcleo

| Pieza | Decisión | Justificación |
|---|---|---|
| `core.Reducer` (278 + 686 test) | **C** fusionado en el Engine | Sus tres garantías son reales: cursor monótono con epoch reset (`reducer.go:221-244`), identidad de run estable sin epoch nuevo (`:200-219`), y unicidad/consistencia de vehículos (`:246-267`). Pero `Reducer.Run` con canales (`:159-194`) no lo usa nadie en producción — el runtime llama `Apply` (`telemetry_core_runtime.go:636`). Eliminar `Run`, `Running`, `atomic.Bool` de propiedad y la duplicación `Apply`/`apply`. |
| `core.SessionCoordinator` (444 + 1052 test) | **C** fusionado en el Engine | Emite facts (lap completed, pit in/out, driver change, session start/end, connection). `MaxSessionVehicleHistory = 104` (`session_coordinator.go:29`) y el high-water de vueltas (`:322-325`, «a same-session source regression cannot revoke an already emitted fact») son lógica ganada con dolor. **Conservar el comportamiento, eliminar el paquete-frontera**: hoy duplica `validateBatchHeader` y `validateObservedState` del reducer (`session_coordinator.go:150,155`) porque son vecinos que no se conocen. |
| `core.Fanout` (572 + 961 test) | **E completo** | Sin consumidor productivo. 1.533 líneas que un LLM debe leer, entender y no romper, protegiendo un comportamiento que nadie ejecuta. **Es el mayor coste unitario de mantenibilidad del repositorio.** |
| `derive.Pipeline` (426) | **C** el cómputo, **E** el registro | Las 4 derivaciones reales (`session.remaining`, `standings.relative-gaps`, `session.self-delta`, `controls.history`) son correctas y deben vivir en Go. El registro `canonicalRegistry` (pipeline.go:82-113) con `Inputs`/`Outputs`/`Reset`/`Order` y `ValidateDefinitions` (`:132-182`, 50 líneas de validación de grafo) **no ejecuta nada**: el orden real está escrito a mano en `Apply` (`:272-283`). Es un DAG declarativo sin motor. Elimínalo; conserva `AlgorithmVersion` (útil para replay parity) como constantes. |
| `derive.delta.go` (568, +109 en el diff local) | **C** | Es el ejemplo de derivación con estado (tracker, historia, referencias). Complejidad proporcional al problema. |
| `telemetry/diagnostics` (748+698+…) | **C** aparte | Read path productivo real (`main.go:1813`). No es parte del núcleo. |

### 1.4 Proyecciones

| Pieza | Decisión | Justificación |
|---|---|---|
| `projection/overlay/v1.go` (316) | **C** como **la única** proyección | Es la única con consumidor real y contrato validado en TS (`frontend/src/overlay/projection/overlay-projection-v1.ts`, 714 líneas de decoder). |
| `projection/engineer/*` (v1 385 + adapter 378 + contract 278 + boundary 94 ≈ 1.135) | **F** en la proyección única + un *view* de Engineer | `engineer.PayloadV1` (v1.go:50-62) y `overlay.PayloadV1` (v1.go:43-59) proyectan **el mismo `derive.FinalState`**. La intersección es ~90%: Engineer añade `spatial` (v1.go:95-97), `vehicleCount`, `playerPresent`, `sourceTime`; Overlay añade `controlsHistory`, `deltaHistory`. Mantener dos structs paralelos es exactamente la amplificación medida en el diff local. **Un único `OverlayFrame` con capabilities**, y Engineer consume el mismo frame en proceso. |
| `projection/strategy/v1.go` (161) | **E** por ahora | `strategy.PayloadV1` (`:38-62`) es un **subconjunto estricto** de lo que Overlay ya publica más `sourceTimeSeconds`. Se publica en un hub propio (`telemetry_core_runtime.go:793`) que duplica revisión de estado, suscriptores y goroutine (`:352`). No hay Strategy Planner productivo: `internal/strategy/live/engine.go` consume el contrato, pero el producto no existe todavía como consumidor de usuario. Cuando exista, volverá — desde el mismo `CanonicalState`, no desde un hub paralelo. |
| `projection/analysis/v1.go` (132) | **E** | Cero uso productivo: sólo `transport.go:222` declara el constructor y nadie lo llama. Analysis necesita **almacenamiento columnar**, no un stream a 60 Hz. |
| `projection/contracts.go` + `ports.go` (218) | **F** | `Projector[S,P]` genérico con un implementador por producto es indirección sin polimorfismo real. |

### 1.5 Transporte

| Pieza | Decisión | Justificación |
|---|---|---|
| `Hub` latest-wins con retención de full (transport.go:159-173, 568-576) | **C** | Es correcto y bien diseñado: no arranca goroutines, no bloquea al publicador, un suscriptor lento recibe el último full. Esta pieza es la mejor del sistema. |
| Dos hubs (overlay + strategy) | **F** en uno | `telemetry_core_runtime.go:185-198` construye dos con la misma política; `:351-352` arranca dos goroutines Wails; `:816-839` publica dos status idénticos con la misma revisión. Duplicación pura. |
| RFC 7396 merge patch (`merge_patch.go` 116 + `transport.go:378-394` + `frontend/src/telemetry-transport/merge-patch.ts` 30) | **E** | Nunca activo (ambas llamadas productivas pasan `nil`). El coste de la rama no es sólo el código: es el invariante «el patch debe reconstruir el full» que hay que preservar en todo refactor. |
| `StatusRevision` con monotonía estricta (`transport.go:325-328`, `:363-366`) | **C** pero **desacoplado del snapshot** | La revisión de estado es útil. El acoplamiento no: `PublishSnapshot` **rechaza** cualquier snapshot cuya revisión no coincida (`:363-366`), y el propio código documenta que esto dejó widgets en blanco (`transport.go:431-438` y `:522-530`, comentarios sobre el overlay abierto con hotkey que se queda a oscuras). El parche fue `ReplayStatus()` (`:531-548`). En mi diseño, status y frame viajan en **el mismo frame** — no hay dos relojes que sincronizar. |
| Sello SHA-256 (`envelopeSeal`/`statusSeal`/`factSeal`, transport.go:752-806) | **E** | El campo `seal` es **privado** (`transport.go:85`): no cruza JSON, no protege al frontend, no protege contra corrupción en tránsito. Sólo detecta que alguien construyó un `Envelope` a mano dentro del mismo proceso Go. Eso es lo que impide un tipo no exportado o un constructor obligatorio, gratis. |
| `inspectPayloadKeys` / claves prohibidas (transport.go:642-705, 64 líneas de escáner JSON manual) | **E** | Defiende contra que una proyección filtre `raw`/`observed`/`derived`. Con **un único tipo `OverlayFrame` que se serializa con `json.Marshal` de campos explícitos**, ese fallo es imposible por construcción y lo garantiza un test de golden, no un escáner de bytes en el hot path. |
| Facts stream (`FactEnvelope`, `ServeWailsFacts`, `SSEFactsHandler`) | **E del transporte**, **C en proceso** | Sin registro productivo. Los facts sí existen y sí se consumen — pero **en proceso**, vía `EngineerProjectionConsumer.ConsumeFact` (`telemetry_core_runtime.go:706`). Conservar ese camino; borrar el transporte que nadie monta. |
| `ServeWails` + `SSEHandler` (adapters.go:41,93) | **C ambos** | Wails para las ventanas nativas, SSE para OBS browser source. **Requisito de producto no negociable.** Mismo nombre de evento y mismo JSON (adapters.go:91) — mantener esa simetría. |

### 1.6 Frontend

| Pieza | Decisión | Justificación |
|---|---|---|
| `telemetry-transport/{contracts,store,attach}.ts` (866) | **C** reducido | Decodificación y validación de sobre. Quitar `merge-patch.ts` y el estado `delta`. |
| `overlay/projection/overlay-projection-v1.ts` (714) | **C** | Decoder autoritativo tipado, con golden compartido (`internal/app/telemetrytransport/typescript_contract_test.go`). Esta es la frontera correcta. |
| `overlay/projection/overlay-projection-adapter.ts` (640) | **E completo** | Convierte el contrato tipado a `TelemetrySnapshot`. Coste puro. El diff local lo tocó (+22) sólo para pasar tres campos. |
| `overlay/core/telemetry-snapshot.ts` (54) | **E** | `scoring: readonly Record<string, unknown>[]` (`:39`) **destruye el type safety** justo antes de los widgets, que luego leen con `readScoringNumber(row, "timeGapToPlayer")` (`relative-row-selection.ts:6`) — strings mágicos sin verificación de compilador. |
| `overlay/core/derived-telemetry-store.ts` (140) | **E** (histories) / **mover a Go** (fuel) | `inputHistory` y `deltaHistory` los produce ya el backend (`overlay/v1.go:49,58`). `fuelHistory` (`derived-telemetry-store.ts:107-127`, consumo por vuelta) es **la única derivación que sólo existe en TS** — debe subir a `derive`. |
| `widget-types/relative/relative-row-selection.ts` (61) | **F hacia Go** | Ordenar y recortar ahead/behind (`:35-46`) es dominio, no presentación. Con `RelativeRow[]` ya ordenado en Go, el widget sólo pinta. |
| `widget-types/*/{content,formatting,view-model,definition}.ts` | **C** | Formato, columnas, colores, layout: es exactamente lo que un widget debe hacer. |
| `telemetry-shadow/overlay-shadow-comparator.ts` (1.132) | **E** con la migración | Es andamio de la migración legacy↔proyección. Al morir el adapter, muere su comparador. |

### 1.7 Recording / Replay / Analysis

| Pieza | Decisión | Justificación |
|---|---|---|
| `recording/coordinator.go` (448 + 586 test) | **E por ahora** | Write path sin consumidor productivo (`NewCoordinator` sólo en su definición). No cierro la puerta: la reintroduciré como **cola asíncrona detrás del Engine**, ~120 líneas, cuando exista el producto Analysis. |
| `recording/sqlite/store.go` (1.068) escritura | **E por ahora** | Ídem: sin `SessionWriter` productivo. |
| `recording/sqlite/historical_reader.go` (752) | **C** | **Vivo**: `diagnostics_bridge.go:135` → `main.go:1813`. Lee sesiones ya grabadas. |
| `recording/replay/*` (357+…) | **C** | Protegido por un guard real: `architecture_test.go:42`, `TestHarnessOnlyReplayIsNotImportedByProductionAnywhere`. Es la base del determinismo/replay parity. **Reconozco esta garantía**: es un test que protege algo verdadero. |
| `recording/migration.go` (290) | **C** | Necesario mientras exista el formato en disco leído por el reader. |
| Analysis stream | **E**, sustituido por *sink* de fichero | Ya lo dice la propuesta de partida y estoy de acuerdo: un stream a 60 Hz no es un almacén analítico. |

### 1.8 Guards

| Pieza | Decisión | Justificación |
|---|---|---|
| `architecture_test.go` (578, 6 tests) | **C** | `TestLMUOverlayRuntimeChainHasNoLegacyMockOrProductUICoupling` (`:63`) y el guard de replay (`:42`) protegen invariantes reales de arquitectura y son baratos. Adaptar las listas de paquetes, no borrar. |

---

## 2. Arquitectura mínima propuesta

### 2.1 Diagrama

```
                     ┌─────────────────────────────────────────────┐
   LMU shared mem    │  SimDriver (uno por simulador)              │
   60 Hz  ──────────▶│   lmu/: reader → decode → fuse(TTL) →       │
   LMU REST 4 Hz ───▶│          identity+cursor                    │
                     │  Salida: SourceFrame (canónico, tipado)     │
                     └───────────────────┬─────────────────────────┘
                                         │ chan SourceFrame (cap 1, latest-wins)
                                         ▼
                     ┌─────────────────────────────────────────────┐
                     │  TelemetryEngine  (single-writer, sin I/O)  │
                     │   1. validate (cursor, epoch, identidad)    │
                     │   2. commit CanonicalState  ◀── FRONTERA    │
                     │   3. facts (lap/pit/driver/session/conn)    │
                     │   4. derive (remaining, gaps, relative,     │
                     │      delta, controls hist, fuel/lap)        │
                     │   5. build OverlayFrame (tipado, listo UI)  │
                     └───┬──────────────┬───────────────┬──────────┘
                         │              │               │
       (síncrono, mismo  │              │ (async,       │ (async,
        commit)          │              │  cap 1,       │  cap N,
                         ▼              │  drop-old)    │  drop-old)
              ┌────────────────────┐    ▼               ▼
              │ Publisher (1)      │  ┌──────────┐   ┌──────────────┐
              │  latest-wins       │  │ Engineer │   │ Recording    │
              │  + retiene último  │  │ worker   │   │ worker       │
              │    OverlayFrame    │  │ (frames  │   │ (append-only │
              └───┬────────────┬───┘  │ + facts  │   │  a disco)    │
                  │            │      │ ordenados)│  └──────────────┘
        Wails Emit│            │SSE   └──────────┘
     (ventanas)   ▼            ▼ (OBS browser source)
              ┌───────────────────────────────────────┐
              │  frontend: un store                   │
              │   decode(OverlayFrame) → estado       │
              │   sin adapter, sin TelemetrySnapshot, │
              │   sin histories re-derivadas          │
              └──────────────┬────────────────────────┘
                             ▼
                        widgets (formato, color, animación, layout)
```

Nota de cadencia: la adquisición sigue a 60 Hz; el **Publisher decide la cadencia de salida** (§3.5), y **regula antes de serializar**.

### 2.2 Contratos Go (pseudocódigo)

```go
// ─── signals: UN paquete con todos los tipos nominales ────────────────────
package signals

type VehicleID string; type SessionID string; type DriverName string
type LapTime float64; type TimeGap float64; type LapDistance float64
type Ratio float64;   type RPM float64;      type Gear int8
// ... (los ~40 typedefs que hoy viven en 10 subpaquetes)

// SignalState sustituye a schema.Field + projection.Field: UN solo tipo.
// Campos exportados + MarshalJSON: se serializa sin traducción intermedia.
type SignalState[T comparable] struct {
    Present    bool       `json:"present"`
    Value      T          `json:"value"`
    Provenance Provenance `json:"provenance"` // unknown|observed|derived|estimated
    Freshness  Freshness  `json:"freshness"`  // missing|fresh|stale|invalid
}

func Observed[T comparable](v T, f Freshness) SignalState[T]
func Derived[T comparable](v T) SignalState[T]
func Missing[T comparable]() SignalState[T]
func (s SignalState[T]) Usable() bool { return s.Present && s.Freshness != Invalid }

// ─── driver: contrato de simulador ───────────────────────────────────────
package sim

type Capability string // "standings" "controls" "pit" "fuel" "spatial" "weather" "native-delta"

type Capabilities struct {
    SimID    string
    Declared map[Capability]bool // lo que el sim PUEDE dar
}

// SourceFrame es lo que un driver produce. Es ya canónico: el driver
// normaliza unidades y semántica; el Engine no conoce ningún simulador.
type SourceFrame struct {
    SimID        string
    ReceivedUTC  time.Time
    Monotonic    time.Duration       // para TTL y freshness, nunca wall clock
    Capabilities Capabilities
    Session      SessionSignals
    Vehicles     []VehicleSignals    // slice propiedad del driver, cedido
    PlayerID     signals.VehicleID   // "" si no hay jugador
    RunKey       RunKey              // {Event, Session, Vehicle}: identidad canónica
}

type SimDriver interface {
    Descriptor() Descriptor                         // id, prioridad, capabilities
    Detect(context.Context) (bool, error)
    // Run emite frames hasta cancelación o error terminal. No reintenta:
    // el Supervisor es el dueño del reintento.
    Run(context.Context, chan<- SourceFrame) error
}

// ─── engine: núcleo ──────────────────────────────────────────────────────
package engine

// CanonicalState es lo observado + lo derivado, en un solo valor inmutable.
// Sustituye a core.ObservedState + derive.FinalState (dos structs hoy).
type CanonicalState struct {
    Epoch    uint64
    Sequence uint64
    Run      RunKey
    SimID    string
    Caps     sim.Capabilities
    Status   SourceStatus          // stopped|detecting|connecting|live|degraded|stale|error

    Session  SessionState
    Vehicles []VehicleState         // orden estable por posición
    PlayerIx int                    // -1 si no hay jugador

    Derived  DerivedState           // remaining, gaps, delta, standings, relative, historias
}

type Engine struct{ /* single-writer, sin goroutines, sin I/O */ }

// Apply es la ÚNICA transición de estado. O gana entera o no cambia nada.
// Devuelve el frame listo para publicar y los facts nuevos, juntos.
func (e *Engine) Apply(f sim.SourceFrame) (OverlayFrame, []Fact, error)
func (e *Engine) Current() (OverlayFrame, bool)  // para reconexión tardía

// ─── frame: EL contrato de salida ────────────────────────────────────────
// Un solo tipo serializado. Overlay, Engineer y Recording consumen el mismo.
type OverlayFrame struct {
    Version      uint16              `json:"v"`
    SimID        string              `json:"simId"`
    Epoch        uint64              `json:"epoch"`
    Sequence     uint64              `json:"seq"`
    CapturedAt   string              `json:"capturedAt"` // RFC3339Nano UTC
    Status       string              `json:"status"`     // el status VIAJA CON el frame
    Reconnect    int                 `json:"reconnectAttempt"`
    Capabilities []string            `json:"capabilities"`

    Session   SessionView            `json:"session"`
    Player    PlayerView             `json:"player"`
    Standings []StandingRow          `json:"standings"` // ordenado por posición
    Relative  []RelativeRow          `json:"relative"`  // ordenado ahead→player→behind
    Delta     DeltaView              `json:"delta"`
    History   Histories              `json:"history"`   // controls, delta, fuel/lap
}

type StandingRow struct {
    VehicleID  signals.VehicleID                      `json:"id"`
    Position   signals.SignalState[int]               `json:"position"`
    ClassName  signals.SignalState[string]            `json:"class"`
    ClassPos   signals.SignalState[int]               `json:"classPosition"`
    DriverName signals.SignalState[string]            `json:"driver"`
    CarNumber  signals.SignalState[string]            `json:"carNumber"`
    BestLap    signals.SignalState[signals.LapTime]   `json:"bestLap"`
    LastLap    signals.SignalState[signals.LapTime]   `json:"lastLap"`
    GapLeader  signals.SignalState[signals.TimeGap]   `json:"gapLeader"`
    LapsLeader signals.SignalState[int]               `json:"lapsLeader"`
    InPit      signals.SignalState[bool]              `json:"inPit"`
    IsPlayer   bool                                   `json:"isPlayer"`
}

type RelativeRow struct {
    VehicleID  signals.VehicleID                    `json:"id"`
    GapToPlayer signals.SignalState[signals.TimeGap] `json:"gap"` // + adelante, − detrás
    LapDelta   signals.SignalState[int]             `json:"lapDelta"`
    Side       string                               `json:"side"` // "ahead"|"player"|"behind"
    // resto de columnas por referencia a StandingRow via VehicleID
}

type DeltaView struct {
    Reference   string                                    `json:"reference"` // "personal-best"|"session-best"|"previous-lap"|"native"
    Seconds     signals.SignalState[float64]              `json:"seconds"`
    ByReference map[string]signals.SignalState[float64]   `json:"byReference"`
}

type Fact struct {
    Sequence uint64    `json:"seq"`   // orden propio, independiente del cursor
    Kind     string    `json:"kind"`  // lap-completed|pit-in|pit-out|driver-change|session-start|session-end|connection-*
    AtUTC    string    `json:"at"`
    Vehicle  signals.VehicleID `json:"vehicle,omitempty"`
    Lap      int       `json:"lap,omitempty"`
}

// ─── publisher: UNO ──────────────────────────────────────────────────────
package publish

type Publisher struct{ /* latest-wins, retiene último frame, sin goroutines */ }

func (p *Publisher) Publish(OverlayFrame) error       // nunca bloquea
func (p *Publisher) Subscribe(context.Context) (*Sub, error)
func (s *Sub) Next(context.Context) (OverlayFrame, error) // salta frames perdidos
func (p *Publisher) Latest() (OverlayFrame, bool)     // resync de recién llegados

func ServeWails(context.Context, *Publisher, Emitter) error
func SSEHandler(*Publisher) http.Handler              // loopback-only, OBS
```

### 2.3 Contrato TypeScript

```ts
// frontend/src/telemetry/frame.ts — generado/validado contra un golden Go.
export type Freshness = "missing" | "fresh" | "stale" | "invalid";
export type Provenance = "unknown" | "observed" | "derived" | "estimated";

export type Signal<T> =
  | { present: true;  value: T;       provenance: Provenance; freshness: Exclude<Freshness,"missing"> }
  | { present: false; value?: never;  provenance: Provenance; freshness: "missing" };

export type StandingRow = Readonly<{
  id: string;
  position: Signal<number>;  class: Signal<string>;  classPosition: Signal<number>;
  driver: Signal<string>;    carNumber: Signal<string>;
  bestLap: Signal<number>;   lastLap: Signal<number>;
  gapLeader: Signal<number>; lapsLeader: Signal<number>;
  inPit: Signal<boolean>;    isPlayer: boolean;
}>;

export type RelativeRow = Readonly<{
  id: string; gap: Signal<number>; lapDelta: Signal<number>;
  side: "ahead" | "player" | "behind";
}>;

export type OverlayFrame = Readonly<{
  v: number; simId: string; epoch: number; seq: number; capturedAt: string;
  status: "stopped"|"detecting"|"connecting"|"live"|"degraded"|"stale"|"error"|"stopping";
  reconnectAttempt: number;
  capabilities: readonly string[];
  session: SessionView; player: PlayerView;
  standings: readonly StandingRow[];
  relative:  readonly RelativeRow[];
  delta: DeltaView;
  history: Histories;
}>;

// UN store. Sin adapter, sin TelemetrySnapshot, sin histories locales.
export type TelemetryStore = {
  subscribe(fn: (frame: OverlayFrame | null) => void): () => void;
  current(): OverlayFrame | null;
};

// Los widgets reciben OverlayFrame y `can(frame, "standings")`; nada más.
export function can(frame: OverlayFrame, cap: string): boolean;
```

**Sobre `schema.Field`**: sí, se mantiene el concepto — pero como **un solo tipo** (`signals.SignalState[T]`), exportado, serializable directamente, sin gemelo en `projection`. Es la pieza que no negocio: sin ella se pierde «0 y false son observaciones válidas» y «este dato existe pero está rancio», que es la diferencia real entre un overlay honesto y uno que miente.

---

## 3. Fronteras operativas

### 3.1 Frontera de commit

**Una sola**, en `Engine.Apply`. La transición es: validar cursor/identidad → calcular estado nuevo sobre una copia → construir facts → construir `OverlayFrame` → **y sólo entonces** sustituir el estado interno. Si cualquier paso falla, el estado no cambia y el frame no existe.

Esto es lo que hoy está repartido en tres commits parciales que pueden divergir: `Reducer.apply` (reducer.go:137-140), `SessionCoordinator.Apply` (session_coordinator.go:169-172) y `Pipeline.Apply` (pipeline.go:292-296), cada uno con su propio `mu`, su propia validación de cursor duplicada y su propio clon. Tres candados en el hot path donde basta uno.

Consecuencia importante: hoy `SessionCoordinator.Apply` puede fallar **después** de que el reducer haya commiteado (`telemetry_core_runtime.go:642` retorna error tras `:636` haber commiteado), dejando reducer y coordinator desincronizados hasta el siguiente epoch. Con una sola frontera eso es imposible por construcción.

### 3.2 Aislamiento de Engineer y Recording

**Hoy no están aislados en latencia.** `deliverEngineer` corre síncronamente dentro de `WriteBatch` (`telemetry_core_runtime.go:673`), en la goroutine del driver. Un `EngineerService` lento retrasa el frame de todos los overlays. El aislamiento actual es sólo de *errores*: el error se guarda en `runtime.engineerErr` (`:716`) y no para el core — eso sí es correcto y lo conservo.

**Mi diseño:**

| Consumidor | Canal | Política | Efecto de un consumidor lento |
|---|---|---|---|
| Overlay (Wails + SSE) | `Publisher` latest-wins con retención | El publicador nunca bloquea; el suscriptor lee el último | El suscriptor lento salta frames intermedios; nunca ve un estado incoherente |
| Engineer | `chan struct{ frame; facts }` cap 1, **drop-oldest para frames, bloqueo acotado para facts** | Los frames son latest-wins; los facts son *loss-intolerant* y van en una cola aparte cap 256 | Frames: se saltan. Facts: si la cola se llena, se marca `factGap` en el frame siguiente y Engineer resincroniza con `Latest()` |
| Recording | `chan Batch` cap 512, drop-oldest con contador | Append-only asíncrono | Se pierden muestras; el contador queda en el manifiesto. **Nunca** frena la telemetría en vivo |

El principio: **el Engine emite y sigue**. Cualquier `send` que pudiera bloquear es un `select` con `default`.

### 3.3 Suscriptor lento

El `Hub` actual ya lo resuelve bien y lo copio (`transport.go:568-576`): retiene el último *full*, marca `pendingSnapshot` por suscriptor, y `Next` entrega el último estado, no una cola. Un suscriptor que tarda 3 s ve el frame de ahora, no 180 frames viejos.

Diferencia: elimino la rama de `delta`. Hoy `snapshotFor` decide entre full y patch según `subscriber.delivered == hub.latest.deltaBase` — tres estados por suscriptor para una optimización desactivada.

### 3.4 Recuperación tras perder frames

**Sí, el último full basta**, y esto es una propiedad, no una suposición:

- El `OverlayFrame` es **completo**: no hay estado incremental que el cliente deba acumular. Todo lo acumulativo (historias de controles, de delta, de combustible; high-water de vueltas) vive en Go y viaja dentro del frame.
- `epoch` + `seq` permiten al frontend detectar el salto y, si le importa, invalidar animaciones interpoladas.
- El `status` viaja **dentro** del frame. Esto elimina la clase de bug documentada en `transport.go:522-530`: un overlay abierto con hotkey a mitad de sesión hoy recibe snapshot pero no status, y se queda en blanco «hasta que algo forzara una transición, típicamente entrar y salir de boxes». Con status en el frame, el primer frame ya pinta.
- Lo único que **no** se recupera con el último full son los **facts** (por definición son discretos). Por eso los facts sí llevan cursor propio y, si hay hueco, el consumidor lo detecta y resincroniza.

### 3.5 Cadencias y regulación

| Consumidor | Cadencia necesaria | Justificación |
|---|---|---|
| Adquisición SM | 60 Hz (`driver.go:17`) | Necesaria para derivadas correctas (delta por distancia, historia de controles a resolución útil) |
| Adquisición REST | 4 Hz (`rest.go:26`, 250 ms) | Ya es lo que hace hoy |
| Overlay (pedal/delta/rpm) | **30 Hz** | Suficiente para fluidez percibida en un browser source; la interpolación la hace el widget |
| Overlay (standings/relative) | **4 Hz** | Nadie lee posiciones a 60 Hz; hoy se serializan 104 filas por frame a 60 Hz |
| Engineer | **5–10 Hz** + todos los facts | Decisiones de spotter, no de renderizado |
| Recording | **10 Hz** en vivo (+ facts íntegros) | Analysis reconstruye con interpolación; 60 Hz multiplica el disco por 6 |
| Analysis | por sesión, no en vivo | Almacén columnar, no stream |

**Sí, el backend regula antes de serializar**, y esta es la mayor ganancia de rendimiento disponible. Hoy `newFull` hace `json.Marshal(payload)` de la carga **completa** en cada batch (`transport.go:233`), 60 veces por segundo, dos veces (overlay + strategy, `telemetry_core_runtime.go:773,781`). Con 104 vehículos × ~28 campos × 4 claves JSON por `Field`, eso son ~12.000 pares clave/valor serializados 120 veces por segundo.

Mi propuesta: el `Publisher` mantiene el frame vivo en memoria y **serializa sólo cuando va a emitir**, con dos ritmos (`fast` 30 Hz para player/delta/controls, `slow` 4 Hz para el bloque de standings/relative), que se recombinan en el frame emitido. Las secciones lentas se reutilizan como `json.RawMessage` ya serializado entre emisiones. Esto no es una optimización prematura: es el único punto del sistema donde el coste crece con el tamaño de la parrilla.

---

## 4. Amplificación de cambio de MI propuesta

Referencia medida del sistema actual: el diff local del delta nativo LMU son **39 archivos, +592/−76** (`git diff --stat`), de los cuales 24 son Go y 15 frontend/i18n.

### Caso 1 — Añadir `steeringAngle` (universal, todos los sims)

| Archivo | Cambio |
|---|---|
| `sim/lmu/decode.go` | leer el offset y producir `SignalState[float64]` |
| `sim/frame.go` | 1 campo en `VehicleSignals` |
| `engine/state.go` | 1 campo en `VehicleState` (copia directa) |
| `engine/frame.go` | 1 campo en `PlayerView` |
| `frontend/src/telemetry/frame.ts` | 1 campo |
| golden Go + golden TS | 2 ficheros de datos |

**6 archivos + 2 goldens. Sin tests nuevos de lógica** (no hay lógica: es pass-through). El frontend se toca sólo para el tipo; ningún widget existente cambia. **Hoy serían ≥14**: catálogo (2), layout, format, fusion, batch_mapper, reducer, overlay/v1, strategy/v1, engineer/v1, projection adapter TS, projection v1 TS, telemetry-snapshot TS, más sus tests y goldens.

### Caso 2 — `brakeBias` opcional (LMU sí, ACC no)

Idéntico al caso 1, **más una línea**: el driver LMU declara `Capabilities["brake-bias"] = true`; el driver ACC no. `Engine` propaga capabilities sin conocerlas. El widget hace `can(frame, "brake-bias")`.

**7 archivos.** Punto clave: **no hay nada que registrar en ningún catálogo central**. La capability es una string que el driver declara y el widget consulta; nadie en medio necesita saber que existe. Esto es lo que hoy no ocurre: el catálogo (`catalog/ids.go`) y la matriz de autoridad (`fusion.go:31-69`) son registros centrales que hay que editar por señal.

### Caso 3 — Delta nativo de LMU (comparación directa con el diff real)

| | Actual (medido) | Propuesta |
|---|---|---|
| Catálogo | `catalog.go` +2, `ids.go` +2, `catalog_test.go` +10 | **0** (no hay catálogo) |
| Driver LMU | `layout.go` +3, `format.go` +14, `fusion.go` +7, `batch_mapper.go` +1, `driver.go` +1 (+4 tests, +129 líneas) | `decode.go` +12, `capabilities` +1 línea, 1 test |
| Núcleo | `reducer.go` +1 | `state.go` +1 |
| Derive | `delta.go` +109, `pipeline.go` +3, `delta_test.go` +71 | `delta.go` +~90, `delta_test.go` +~70 (**lógica real, se conserva**) |
| Proyecciones | `overlay/v1.go` +50/−? (reescritura de 50 líneas), 3 goldens | `frame.go` +0 (`DeltaView.ByReference` es un mapa: la referencia nueva es **una clave**, no un campo nuevo), 1 golden |
| Frontend | `overlay-projection-v1.ts` +21, `overlay-projection-adapter.ts` +22, `telemetry-snapshot.ts` +4, `delta-definition.ts` +37, `delta-view-model.ts` +17, 4 tests | `delta-definition.ts` +~30, `delta-view-model.ts` +~10 (opciones de referencia en el inspector: **cambio legítimo de UI**) |
| i18n | 4 locales × +4 | 4 locales × +4 (**inevitable**: es texto de usuario) |

**Total: ~14 archivos frente a 39.** Y el reparto cambia de naturaleza: de los 14, 8 son lógica real (decode + derivación + UI del selector) y 4 son traducciones. Los 25 archivos que desaparecen eran **peaje estructural puro**: catálogo, matriz de autoridad, reducer, dos proyecciones, adapter legacy, snapshot legacy.

La lección que extraigo del diff medido: el coste no viene de la derivación (109 líneas en `delta.go`, proporcionado y correcto), viene de que la señal tiene que **declararse siete veces** antes de poder usarse.

### Caso 4 — Widget nuevo Speed + RPM + Gear

`speedMps`, `engineRpm` y `gear` ya están en `PlayerView`.

**Archivos tocados: sólo frontend** — `widget-types/speedometer/{definition,content,view-model,renderer}.tsx` + registro en el catálogo de widgets + i18n. **Cero archivos Go. Cero cambios de contrato.**

Esto ya es cierto hoy y no lo empeoro; lo menciono porque es la prueba de que el problema no está en los widgets sino en el camino hasta ellos.

### Caso 5 — Simulador nuevo sin spatial de rivales, sin weather, sin delta nativo

| Trabajo | Coste |
|---|---|
| `sim/acc/` (reader UDP + decode + fusion si aplica + identidad) | **N archivos nuevos, 0 archivos existentes modificados** |
| Declarar `Capabilities`: sin `"spatial"`, sin `"weather"`, sin `"native-delta"` | 1 mapa literal |
| Registro del driver | 1 línea en la lista de candidatos |
| Engine | **0** — el Engine no menciona ningún sim |
| Derive | **0** — `delta.go` ya funciona sin delta nativo (calcula por distancia); `gaps` ya funciona sin spatial |
| Proyección/contrato | **0** — los campos ausentes son `SignalState{Present:false, Freshness:"missing"}` |
| Frontend | **0** — los widgets ya renderizan `present:false` como «—» |

**Ese es el test definitivo de la arquitectura**, y es donde la propuesta gana claramente: añadir un simulador debe ser *escribir un paquete nuevo*, nunca *editar el núcleo*. Hoy no lo es: `catalog/ids.go` y `fusion.go` están indexados por señal LMU, y `core.VehicleState` (reducer.go:40-72) tiene campos con nombres LMU (`DeltaBest`, `EstimatedLapTime`) que un sim sin esas señales tendría que dejar vacíos igualmente — pero el diseño *sugiere* que hay que tocarlos.

Riesgo honesto de este caso: si iRacing expone algo que **no cabe** en `CanonicalState` (p. ej. estado de neumáticos por esquina con compuesto), sí hay que ampliar el tipo canónico. Eso es irreducible en cualquier arquitectura con vocabulario común, y lo prefiero a un mapa `map[string]any` que destruiría el type safety.

---

## 5. Lo que pierdo, lo que arriesgo, y qué no me convence de la propuesta de partida

### 5.1 Lo que pierdo de verdad

| Pérdida | Gravedad | Mitigación |
|---|---|---|
| **Independencia de versionado por producto.** Hoy Overlay v1, Engineer v1, Strategy v1 y Analysis v1 pueden evolucionar por separado (`projection.VersionPolicy`, contracts.go:16-32). Con un frame único, cambiar el frame afecta a todos | Media | `OverlayFrame.Version` + política `MinimumSupported`. Cuando exista un segundo producto **con ciclo de release propio**, se añade una proyección. Hoy no existe. |
| **El registro declarativo de derivaciones** documentaba inputs/outputs/reset por derivación (`pipeline.go:82-113`). Es genuinamente útil como documentación | Baja | Mover a comentarios doc + el test de replay parity, que verifica lo mismo empíricamente |
| **`core.Fanout` con `FactSequence` acoplada a la cobertura del snapshot** (fanout_test.go:194-210 verifica huecos de cobertura de facts). Es un diseño pensado | Baja | Está muerto. Pero si alguna vez hace falta el fanout multi-consumidor por transporte, habrá que reescribirlo — y quien lo haga no tendrá estos 961 tests de referencia |
| **Sellado SHA-256 y escáner de claves prohibidas**: quito dos defensas en profundidad | Baja-media | Sustituidas por tipado (no hay `any` que serializar) + golden tests. Pero es real: pierdo detección en runtime, gano detección en compilación/CI |
| **Los subpaquetes `schema/*`** hacían imposible que `pit` importara `standings`. Al fusionarlos, esa barrera desaparece | Baja | Son typedefs sin métodos; no hay ciclos posibles |
| **Riesgo de migración: el frontend cambia de contrato.** El adapter legacy y `TelemetrySnapshot` los consumen todos los widgets existentes | **Alta** | Es el mayor coste real. Requiere migrar widget a widget, y `overlay-shadow-comparator.ts` (1.132 líneas) existe precisamente porque esa migración ya se hizo una vez y dolió |
| **Perder el write path de Recording sin haberlo usado** significa borrar 1.500 líneas probadas antes de saber si Analysis las necesitaba tal cual | Media | Vive en git. Y lo que Analysis necesita (columnar, por sesión) no es lo que hay (SQLite fila a fila en el hot path) |

### 5.2 Qué NO me parece correcto o suficiente de la propuesta simplificada de partida

1. **«Canonical Source Frame» como pieza separada del driver es una frontera de más.** Si el driver ya normaliza y valida, el `SourceFrame` es simplemente el tipo de retorno del driver, no una capa. Nombrarla como etapa invita a reconstruir el `BatchMapper` con otro nombre.

2. **«Sin RFC7396 inicialmente» es demasiado tímido.** No es «inicialmente»: el merge patch es incompatible con regulación por secciones y con latest-wins con salto de frames. Si el frame que recibes no es el sucesor del que tienes, el patch no aplica — y con salto de frames eso es el caso común. **Nunca**, no «todavía no».

3. **«UN publisher latest-wins (Wails y SSE)» no dice quién regula.** Sin regulación antes de serializar, un publisher único a 60 Hz serializando 104 vehículos es peor que dos hubs a cadencias distintas. La regulación es parte del contrato del publisher, no un detalle.

4. **«Ordered facts → Engineer» sin decir qué pasa cuando la cola se llena.** La propuesta dice «cola asíncrona» para Recording pero «ordered facts» para Engineer sin política de rebose. Un fact perdido silenciosamente es peor que un frame perdido: rompe el modelo de mundo del spotter. Hay que decidir explícitamente: cola acotada + marca de hueco + resincronización.

5. **«Widgets sin lógica de dominio» está bien enunciado pero la propuesta no dice dónde va `fuelHistory`.** Hoy es la única derivación que vive **sólo** en TS (`derived-telemetry-store.ts:107-127`). Si no se nombra explícitamente, se queda ahí y el principio se incumple desde el día uno.

6. **«Capabilities por sim» no basta: hacen falta capabilities por *sesión*.** LMU en una sesión offline sin rivales no da standings útiles aunque el sim los soporte. `Capabilities` debe ser el cruce de «lo que el sim declara» × «lo que esta sesión está entregando ahora» — que es, exactamente, lo que hoy calcula `overlay.capabilities()` (`overlay/v1.go:269-291`) a partir de `Available()`. Esa función es correcta y hay que conservarla.

7. **«Sin Strategy Hub hasta Strategy Planner real» es correcto, pero la propuesta no reconoce que ya hay código productivo consumiendo el contrato**: `internal/strategy/live/engine.go` y `validation.go` importan `projection/strategy`. Eliminar el hub obliga a repuntar esos consumidores al frame único. No es gratis.

8. **La propuesta no dice nada del `schema.Field` ↔ `projection.Field` duplicado**, que es el multiplicador de trabajo más caro por señal después del catálogo. Es la simplificación de mayor relación beneficio/riesgo del sistema entero y no aparece.

### 5.3 Lo que la arquitectura actual hace bien y NO cambio

Sería deshonesto no decirlo:

- El `Hub` latest-wins con retención de full (`transport.go:159-173, 568-576`) es correcto, no arranca goroutines y resuelve el suscriptor lento bien. Lo copio casi tal cual.
- `envelope.Snapshot` con clon forzado impide aliasing entre etapas. Es una garantía real, verificada.
- El high-water de vueltas del coordinator (`session_coordinator.go:322-325`) evita revocar un fact ya emitido cuando la fuente regresa. Es sutil y correcto.
- El guard de replay (`architecture_test.go:42`) protege una garantía verdadera: el reproductor no puede convertirse en fuente en vivo por accidente.
- El aislamiento de **errores** de Engineer (`telemetry_core_runtime.go:712-717`: un fallo del consumidor no para el core) es la política correcta.
- `IsUnmappableFrame` (`telemetry_core_runtime.go:627`) y su comentario documentan un bug real y caro: un frame de garaje apagaba la telemetría hasta reiniciar. Ese conocimiento debe migrarse literalmente.

---

## 6. Puntuación honesta

| Criterio | Peso | Nota /10 | Ponderado | Razón |
|---|---:|---:|---:|---|
| Corrección semántica y fiabilidad | 20 | 8,5 | 17,0 | Conservo `SignalState`, epoch/sequence, identidad canónica, facts y el high-water. **Mejoro**: una sola frontera de commit elimina la desincronización reducer↔coordinator posible hoy; el status viaja en el frame y mata la clase de bug del widget en blanco. **Pierdo**: sellado SHA y escáner de claves prohibidas (defensa en profundidad in-process) |
| Extensibilidad multi-simulador | 18 | 9,0 | 16,2 | Simulador nuevo = paquete nuevo, cero edición del núcleo (caso 5). Capabilities declaradas por driver × observadas por sesión. Riesgo residual: ampliar `CanonicalState` si un sim aporta un dominio nuevo — irreducible |
| Mantenibilidad por LLM | 18 | 9,0 | 16,2 | De 7 declaraciones por señal a 2–3. Elimino 1.533 líneas de `Fanout` muerto, 295+369 de catálogo, ~1.100 de adapter+snapshot legacy, ~250 de merge patch y sello. Un solo tipo de campo en vez de dos gemelos. **El mayor salto de la propuesta** |
| Rendimiento | 15 | 8,0 | 12,0 | Regulación por sección antes de serializar ataca el único coste que escala con la parrilla (hoy: `json.Marshal` completo × 2 productos × 60 Hz). Un candado en vez de tres en el hot path. **No mido**: sin benchmark propio, la mejora es razonada, no demostrada |
| Facilidad para widgets y señales | 10 | 9,0 | 9,0 | Widget nuevo con señales existentes = sólo frontend. Señal universal nueva = 6 archivos. `StandingRow`/`RelativeRow` ya ordenados quitan dominio del TS |
| Testabilidad y observabilidad | 8 | 7,0 | 5,6 | Conservo replay parity y los guards de arquitectura; goldens Go↔TS de un solo contrato. **Pierdo observabilidad**: hoy hay contadores por producto (`TelemetryCoreMetrics`, 10 campos) y métricas de hub separadas; con un publisher único hay menos granularidad para diagnosticar «Overlay va bien pero Engineer no» |
| Coste y riesgo de migración | 6 | 5,0 | 3,0 | **El punto más débil, sin adornos.** Migrar el frontend fuera de `TelemetrySnapshot` toca todos los widgets; ya se intentó una vez y dejó un comparador de 1.132 líneas como cicatriz. Borrar 1.500 líneas de Recording probadas antes de tener Analysis es una apuesta. La migración es incremental (el frame nuevo puede convivir con el adapter durante una fase) pero no es barata |
| Preparación de futuro | 5 | 7,5 | 3,75 | Recording y Analysis vuelven como *sinks* asíncronos limpios; Strategy vuelve como proyección cuando exista el producto. **Riesgo**: si aparecen tres productos con ciclos de release independientes en 12 meses, habré tenido que reintroducir el versionado por producto que hoy elimino |
| **Total** | **100** | | **82,75** | |

**82,75 / 100.** Redondeo honesto: **83**.

Dónde perdería puntos si me equivoco: si el Strategy Planner y Analysis llegan a producción en los próximos seis meses con contratos que divergen de Overlay, la fusión de proyecciones habrá sido prematura y tocará deshacerla — con el coste de haber borrado los tests que la protegían. Estimo esa probabilidad en torno al 30%, y aun así prefiero la apuesta: el coste diario de mantener cuatro proyecciones sin consumidor es cierto y presente, mientras que el coste de reintroducir una es puntual y acotado.

---

## 7. Orden de ejecución sugerido (por riesgo creciente)

| # | Paso | Riesgo | Líneas eliminadas (aprox.) |
|---|---|---|---|
| 1 | Borrar `core.Fanout` y sus tests | **Nulo** — sin consumidor | 1.533 |
| 2 | Borrar merge patch (Go + TS) y la rama `delta` del hub | Nulo — nunca activo | ~250 |
| 3 | Borrar `NewAnalysisFull`/`NewEngineerFull`/`NewEngineerFact`, `ServeWailsFacts`, `SSEFactsHandler`, `projection/analysis` | Nulo — sin llamador | ~450 |
| 4 | Fusionar `schema.Field` + `projection.Field` en `SignalState` | Bajo — mecánico, compilador guía | ~150 |
| 5 | Colapsar los 10 subpaquetes `schema/*` en `signals` | Bajo — mecánico | ~100 (imports) |
| 6 | Borrar `catalog` (constantes locales en el driver) y `schema.Unit/Range/Domain` | Bajo | ~660 |
| 7 | Fusionar Reducer + SessionCoordinator + Pipeline en `Engine` | **Medio** — hay que preservar cada invariante con su test | ~300 netas |
| 8 | Un publisher, un hub, status dentro del frame | Medio | ~200 |
| 9 | `StandingRow`/`RelativeRow` ordenados en Go; subir `fuelHistory` | Medio | −80 en Go, −200 en TS |
| 10 | Retirar `overlay-projection-adapter.ts`, `telemetry-snapshot.ts`, `derived-telemetry-store.ts`, el comparador shadow, widget a widget | **Alto** | ~1.960 |
| 11 | Fusionar la proyección Engineer y repuntar `internal/strategy/live` | Alto | ~1.300 |

Los pasos 1–6 son ~3.150 líneas eliminadas **sin ningún riesgo funcional demostrable**, y pueden hacerse esta semana. Ese es el argumento más fuerte de este documento: la mayor parte de la simplificación no requiere rediseñar nada, sólo borrar lo que ya nadie ejecuta.
