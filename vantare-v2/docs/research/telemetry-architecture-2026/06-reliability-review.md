# 06 — Fiabilidad y consistencia (Agente E)

Fecha: 2026-08-19. Rama `vantareapp/isa-338-retirar-los-ultimos-confirm-nativos`, HEAD `08e316c1`, working tree sucio (diff local de *native delta*, no committeado).
Método: lectura del código de producción, no de la documentación. Cada afirmación lleva `archivo:línea`. `go test ./internal/telemetry/... ./internal/app/telemetrytransport/...` pasa en verde (28 paquetes, ninguno falla) — los defectos de abajo **no** son fallos de test: son estados que ningún test ejercita.

---

## 0. Hallazgo estructural previo: la arquitectura documentada no es la que corre

Antes de analizar fiabilidad hay que fijar qué se ejecuta realmente en producción. El único camino vivo es `cmd/vantare/main.go:1609` → `app.NewTelemetryCoreRuntime` → `internal/app/telemetry_core_runtime.go`.

| Componente | ¿En producción? | Evidencia |
|---|---|---|
| `lmu.Driver` → `lmu.BatchMapper` → `core.Reducer` → `core.SessionCoordinator` → `derive.Pipeline` → `projection/{overlay,strategy}` → `telemetrytransport.Hub` | **Sí** | `telemetry_core_runtime.go:612-675` |
| `core.Fanout` (latest-wins + log de facts + resync) | **No. Código muerto** | `grep NewFanout` solo aparece en `core/fanout.go` y en tests |
| `core.RecordingSink` / `recording.Coordinator` (cola asíncrona, drop-policy) | **No conectado al pipeline vivo** | `recording.NewCoordinator` solo en tests; `diagnostics_bridge.go:135` usa `recordingsqlite` **solo como backend de lectura** ("recording is never started", `diagnostics_bridge.go:120`) |
| Transporte de facts (`FactEnvelope`, `ServeWailsFacts`, `SSEFactsHandler`, `NewEngineerFact`) | **No. Código muerto** | ningún llamador fuera de `adapters.go`/`transport.go`/tests |
| Deltas RFC 7396 en el Hub | **No. Siempre `nil`** | `telemetry_core_runtime.go:789` y `:793`: `PublishSnapshot(frame, nil)` |
| Engineer | Sí, pero **por llamada Go directa síncrona**, no por transporte | `telemetry_core_runtime.go:673` → `engineer_service.go:660` |
| Hub `analysis` | No instanciado | solo existen `hub` (overlay) y `strategyHub`, `telemetry_core_runtime.go:185-198` |

Consecuencia para fiabilidad: **buena parte del aparato defensivo (fanout latest-wins, retención de facts con `FactResyncRequiredError`, cola de grabación con drop-policy, merge-patch verificado) está escrito, testeado… y no protege nada**, porque el camino real es una cadena de llamadas síncronas dentro del bucle de 60 Hz del driver.

---

## 1. Frontera transaccional: ¿dónde está el commit de un frame?

No hay una frontera. Hay **cuatro commits independientes en cascada, sin compensación**.

```
lmu.Driver.Run (60 Hz, driver.go:241-265)
 └─ sink.WriteObservation (driver.go:232)              ← síncrono
    └─ runtimeObservationSink (telemetry_core_runtime.go:612)
       └─ BatchMapper.WriteObservation (batch_mapper.go:123)
          │  candidate := clone(state)                  batch_mapper.go:140
          └─ sink.WriteBatch (batch_mapper.go:146)
             ├─ reducer.Apply     ← COMMIT 1  (reducer.go:137-139)
             ├─ coord.Apply       ← COMMIT 2  (session_coordinator.go:169-171)
             ├─ derive.Apply      ← COMMIT 3  (pipeline.go:292-295)
             ├─ ProjectV1 ×2
             ├─ publishProjections ← COMMIT 4 (status + 2 hubs, telemetry_core_runtime.go:762-798)
             └─ deliverEngineer   ← efecto lateral síncrono (:673)
          │  mapper.state = candidate                   ← COMMIT 5 (batch_mapper.go:149)
```

Cada componente es individualmente atómico y eso está bien hecho: el reducer valida y clona antes de tocar estado (`reducer.go:124-140`), el coordinador publica facts **antes** de commitear (`session_coordinator.go:166-171`, "A failed fact write leaves all coordinator state unchanged", `:102`), la pipeline commitea header+historia+snapshot juntos (`pipeline.go:292-295`), y el mapper commitea **después** de que el sink acepte (`batch_mapper.go:146-150`).

**Pero el orden de commit es inverso al orden de dependencia.** El mapper —que es el dueño del cursor canónico— commitea *el último*, mientras que el reducer —que valida ese cursor— commitea *el primero*.

### Defecto D-01 (crítico): desincronización irreversible mapper↔reducer

Si `coord.Apply` o `derive.Apply` fallan **una sola vez**:

1. `reducer.state.header.Cursor` ya avanzó a *N* (`reducer.go:137`).
2. `WriteBatch` devuelve error (`telemetry_core_runtime.go:643` o `:647`).
3. `BatchMapper` **no** commitea: `mapper.state` sigue en *N−1* (`batch_mapper.go:146-149`).
4. Frame siguiente: el mapper vuelve a emitir el cursor *N*.
5. `validateCursor` → `next.Sequence <= current.Sequence` → **`ErrStaleBatch`** (`reducer.go:228-230`).
6. Y así para siempre. El error sube al driver (`driver.go:232`), `Driver.Run` retorna.
7. `IsUnmappableFrame(ErrStaleBatch)` = false (`batch_mapper.go:105-112`) → no se absorbe (`telemetry_core_runtime.go:627`).
8. `lmu.IsRetryable(ErrStaleBatch)` = false (`driver.go:347-360`) → `DriverManager` llama `setTerminal` (`driver_manager.go:296-298`) → `StateError`.

**La telemetría queda muerta hasta reiniciar la aplicación.** No hay reset del mapper ni del reducer, no hay resincronización, no hay ruta de recuperación. El único rastro es una línea de log del monitor (`telemetry_core_runtime.go:595-600`).

Disparadores reales de `coord.Apply` fallando: `ErrVehicleHistoryOverflow` (§4), `ErrFactBatchOverflow` (>256 facts en un batch, `session_coordinator.go:333`), `ErrFactSequenceExhausted`. De `derive.Apply`: cualquier `validateInput` (`pipeline.go:367-395`) o `ctx.Err()` intermedio (`pipeline.go:264`, `:284`) — nótese que **la cancelación entre stages también deja el reducer avanzado y el mapper atrás**.

Ningún test cubre esto: los tests de mapper cubren "sink falla → mapper no avanza" (`batch_mapper_test.go:483`, `TestBatchMapperSinkFailureRollsBackSessionVacancyCursorAndOwnership`) pero con un sink de juguete que **no contiene un reducer ya commiteado**.

### Reducer single-writer: sí, pero por convención

`Reducer` protege con `atomic.Bool running` + `sync.RWMutex` (`reducer.go:97-104`). Hay dos modos: `Apply` síncrono (usado en producción, `telemetry_core_runtime.go:636`) y `Run` con goroutine y canales (`reducer.go:159`, **no usado en producción**). En producción el "single writer" lo garantiza que solo hay una goroutine de driver llamando la cadena: `DriverManager` posee exactamente un `Run` a la vez (`driver_manager.go:89`). El mutex es defensa en profundidad, no el mecanismo.

`Reducer.Run` tiene además un comportamiento fail-stop explícito: **el primer batch rechazado termina el bucle** (`reducer.go:183-186`). Si algún día se usa, un solo hueco de secuencia mata el core.

### Inmutabilidad hacia consumidores: correcta

`envelope.Snapshot` clona en construcción **y en cada lectura** (`envelope/types.go:49-64`). `cloneObservedState` copia el slice de vehículos (`reducer.go:274-278`), `cloneFinal` copia los 4 slices derivados (`pipeline.go:410-418`), `clonePayload` copia los 4 slices de la proyección (`overlay/v1.go:293-307`), `cloneEnvelope` copia el `json.RawMessage` (`transport.go:742-745`). **No encontré aliasing de slices ni de maps hacia consumidores.** Es la parte más sólida del diseño.

Coste: en el camino de 60 Hz se hace `Value()` (=clone) varias veces por frame, más `cloneSelfDeltaTracker` que clona `candidate`/`reference`/`previous` (hasta 18 000 `lapSample` cada uno, `delta.go:95-105`, `:19`) **en cada frame**. Es un problema de rendimiento, no de corrección, pero es el que hace que un `Engineer` lento y un GC agresivo compitan por el mismo bucle.

---

## 2. Mapper y reducer: qué valida cada uno

| Nivel | Valida | Errores |
|---|---|---|
| `parseWithProfile` / `readStable` | Coherencia del buffer SM, N comparaciones estables (`driver.go:186`, `stableComparisons=3`) | `ErrIncoherentSnapshot`, `ErrIncompatibleBuffer` |
| `Fusion.Merge` | TTL por regla de autoridad, conflicto SM↔REST, envejecimiento del grid | no falla; degrada a `Stale`/`Missing` (`fusion.go:406-430`) |
| `validateMapperObservation` | `Source==Canonical`, compatibilidad, track+sessionType usables, `VehicleCount == len(Vehicles)`, slots ≥0 y únicos, exactamente 0 o 1 player coherente con `PlayerPresent` | 6 errores, todos `IsUnmappableFrame` → **absorbidos** (`telemetry_core_runtime.go:627-629`) |
| `Reducer.validateBatchHeader` + `validateObservedState` | Cursor contiguo, identidad de sesión estable dentro del epoch, vehículos únicos, `VehicleCount` coherente otra vez | `ErrStaleBatch`, `ErrSequenceGap`, `ErrEpochGap`, `ErrDuplicateVehicle`, … → **no absorbidos, terminales** |

La validación de `VehicleCount` está duplicada (mapper `batch_mapper.go:260`, reducer `reducer.go:247-251`) y la de duplicados también (`batch_mapper.go:275`, `reducer.go:261`). El reducer es, en la práctica, un segundo validador del mapper más un guardián de cursor.

### Frames parciales SM/REST

El driver publica **siempre por SM**: `acquire()` a 60 Hz (`driver.go:238-264`) y adicionalmente al recibir REST (`driver.go:245-259`). `Fusion` guarda el último estado de cada fuente con su marca monotónica (`fusion.go:95-107`) y decide campo a campo (`fusion.go:406-430`) con el orden: preferido fresco → alternativo fresco (si `Equivalent`) → preferido stale → alternativo stale → cualquiera con valor → `MissingField`.

- **REST offline**: `fusion.rest.sequence == 0`, sus campos son `Missing`, se usa SM; `combinedRuntimeState` no degrada si `RESTStatusUnknown` (`driver.go:337-339`). Correcto.
- **REST parcial**: cada campo tiene su propio `TimedField.updatedMono` (`fusion.go:360-365`), así que un REST que solo trae media respuesta no envenena el resto.
- **SM stale**: `forceStale` propaga staleness de `SourceTime` a **todo el grid** (`fusion.go:207`, `:244-250`). Es conservador y correcto.
- **Missing vs stale vs invalid** son estados distintos y explícitos en `schema.Field` (`quality.go:27-34`); el valor cero nunca significa ausencia. Muy bien resuelto.

### TTL

Es **por regla de la matriz de autoridad**, no por campo individual: `PreferredTTL` = `defaultFreshnessLimit` (500 ms) para las 37 reglas SM, `AlternativeTTL` = `defaultRESTTTL` para las 5 con REST equivalente (`fusion.go:31-69`). Reloj **monotónico** (`elapsed`, `fusion.go:442-450`, `driver.go:75`), no wall-clock. Correcto y bien argumentado en `driver.go:213-218` (LMU refresca sesión a 5 Hz; 500 ms = 2,5× margen).

Detalle: `fieldAt` también trata `elapsed < updated.elapsed` como stale (`fusion.go:446`), lo que cubre un reloj monotónico que retrocede.

### Clock reset del sim

`classifyClock` en el driver (`driver.go:210`) y **otra vez** en el mapper contra su propio `lastSourceTime` (`batch_mapper.go:161-167`). `ClockReset` → `sessionBoundary` → nueva `SessionID` + reset de `active`/`generations` + nuevo epoch (`batch_mapper.go:168-183`). `ClockWrap` → solo epoch. Es la única forma de detectar "sesión nueva" junto con el cambio de firma `(track, sessionType)` (`batch_mapper.go:169-171`).

---

## 3. Fallos parciales de consumidores: ¿se detiene el Core?

| Consumidor | ¿Aísla? | Evidencia |
|---|---|---|
| **Engineer** | Sí para errores, **no para latencia** | `deliverEngineer` guarda el error en `runtime.engineerErr` y no propaga (`telemetry_core_runtime.go:686-718`); test `TestTelemetryCoreRuntimeIsolatesEngineerFailureFromBothProductHubs`. Pero la llamada es **síncrona dentro del bucle de 60 Hz** y `ConsumeObservation` toma `s.mu` y ejecuta 6 familias de monitores + scheduler + cola (`engineer_service.go:660-760`) |
| **Overlay Hub** | **No. Un fallo mata el Core** | `publishProjections` error → `failStop` (`telemetry_core_runtime.go:668`) → `cancel()` + `closeProductHubs()` + `StateError` (`:846-865`) |
| **Strategy Hub** | **No. Idéntico** | `telemetry_core_runtime.go:793` → mismo `failStop` |
| **Proyección overlay/strategy** | **No** | `:651-660`, `failStop` explícito |
| **Suscriptor SSE lento** | Sí | `pendingSnapshot` es un booleano latest-wins; `notify` es no-bloqueante (`transport.go:727-732`); un lector lento solo pierde frames intermedios |
| **Suscriptor Wails lento** | Sí | mismo mecanismo vía `ServeWails` (`adapters.go:41-57`) |
| **Recording** | N/A: no está conectado | §7 |
| **Panic de un consumidor** | **No hay `recover()` en ninguna parte del pipeline** | `grep recover(` en `internal/telemetry` e `internal/app/telemetry*`: 0 resultados. Un panic en `ConsumeObservation` de Engineer se lleva el proceso entero |

**Respuesta directa: sí, un fallo de Overlay detiene el Core**, y de forma terminal (no reintentable). Y aunque Engineer no lo detiene por error, lo detiene *de facto* por latencia: cada milisegundo que Engineer tarda es un milisegundo que el driver no lee memoria compartida.

### Defecto D-02 (crítico): `failStop` es irreversible y se dispara por causas transitorias

`failStop` marca `lifecycle = terminal`, cancela el contexto y **cierra los hubs** (`telemetry_core_runtime.go:850-860`). No hay `Start` posterior posible: `Start` devuelve `ErrClosed` si `lifecycle == terminal` (`:296-299`). Causas que lo disparan hoy: payload >256 KB (§8), hueco de secuencia en el hub, revisión de status no contigua, fallo de `json.Marshal`. Ninguna justifica matar la aplicación de telemetría hasta reiniciar.

---

## 4. Reconnects, epochs, identidad, generaciones de slot

### Qué significa hoy cada cosa

| Concepto | Significado real | Dónde se decide |
|---|---|---|
| `Epoch` | "Discontinuidad del stream canónico" — se incrementa por: cambio de sesión, clock reset, clock wrap, **y cambio de vehículo del player** | `batch_mapper.go:168-217`, `schema/time.go:40-57` |
| `Sequence` | Contador monótono dentro del epoch, +1 por frame aceptado | `schema/time.go:56` |
| `Cursor` | `(Epoch, Sequence)` | `schema/time.go:18-21` |
| `SessionID` | `lmu-session-N`, contador local del mapper | `batch_mapper.go:353-355` |
| `EventID` | **Constante literal `lmu-event-1`** | `batch_mapper.go:32` |
| `VehicleID` | `lmu-slot-<mID>-generation-<G>` | `batch_mapper.go:357-359` |
| `Team`/`Driver` en `RunIdentity` | **Nunca se rellenan en el camino LMU** | `mapVehicle` (`batch_mapper.go:299-333`) no los asigna |
| `StintID` | **No existe** | — |
| `FactSequence` | Cursor independiente del snapshot, global al coordinador | `session_coordinator.go:48`, `:417` |
| `StatusRevision` | Cursor independiente del transporte, +1 por cambio de estado | `telemetry_core_runtime.go:813` |

Epoch está **sobrecargado**: mezcla "el stream se rompió" con "cambió la sesión" con "cambió el coche del player". Los tres tienen consecuencias distintas (el primero requiere resync de transporte, el segundo requiere borrar historia de sesión, el tercero solo requiere rebasar derivaciones del player) pero se representan igual.

### Defecto D-03 (grave): la identidad de vehículo no sobrevive a un frame perdido

`state.active` se reemplaza entero cada frame por `nextActive` (`batch_mapper.go:186`, `:212`). Si una fila desaparece un solo frame, `exists` es false la siguiente vez y **se emite una identidad nueva**: `generation++` (`batch_mapper.go:191-195`). Está testeado y documentado como intencional (`batch_mapper_test.go:326` `"lmu-slot-7-generation-2"`, `strategy_signal_audit_test.go:178-196`).

Consecuencias en cadena de una desaparición de un frame:

- Si es un rival: el `SessionCoordinator` lo trata como vehículo nuevo → `trackedVehicles++` (`session_coordinator.go:296-304`) → consume presupuesto de las 104 entradas históricas; sus vueltas completadas rebasan desde cero (no se emiten facts de vuelta hasta el siguiente incremento, `:319-341`); su gap relativo se recalcula sin historia.
- Si es el player: `state.playerID != observedPlayer` → **`epochBoundary = true`** (`batch_mapper.go:206-211`) → nuevo epoch → `derive` resetea `ControlsHistory` (`pipeline.go:269-271`, `mustReset` en `:397-402`) y el `selfDeltaTracker` se reinicia entero (`delta.go:146-149`), perdiendo la vuelta de referencia y el historial de delta.

Es decir: **un microcorte de un frame en la fila del player borra el delta y el historial de inputs.** El mecanismo de generación protege contra "el slot se reutiliza para otro coche" a costa de ser hipersensible a la ausencia transitoria. La protección real ya la da el `mID` de LMU (`format.go:91-93`, leído del offset 0 de `VehicleScoringInfo`), que es estable por vehículo; la generación añade fragilidad sin añadir garantía.

### Defecto D-04 (grave): techo de 104 vehículos por sesión, acumulativo y letal

`MaxSessionVehicleHistory = 104` (`session_coordinator.go:29`) y **nunca se desalojan entradas** ("A session never evicts history silently", `:28`). Combinado con D-03, cada desconexión/reconexión de un rival, y cada frame perdido de cualquier fila, consume una entrada. En una sesión larga (enduro con cambios de piloto, servidor público con entradas y salidas) superar 104 identidades distintas es **probable**, no teórico.

Al superarlo: `ErrVehicleHistoryOverflow` → `coord.Apply` falla → **D-01** → telemetría muerta hasta reiniciar. El test `TestSessionCoordinatorVehicleHistoryBudgetIsAtomicAndRetryable` (`session_coordinator_test.go:278`) verifica que el coordinador no muta estado, pero no que el sistema completo se recupere — y no se recupera.

### Defecto D-05 (medio): `FactDriverChanged` es código muerto en el camino LMU

`session_coordinator.go:311-317` emite `FactDriverChanged` cuando `previous.identity.Driver != vehicle.Identity.Driver || .Team != .Team`. Pero `mapVehicle` nunca rellena `Driver` ni `Team` (`batch_mapper.go:299-333`), así que ambos son siempre `""`. **Los cambios de piloto en enduro no se detectan.** `coordinatorHeader` (`session_coordinator.go:380-392`) copia los mismos campos vacíos. Engineer reacciona a ese fact reseteando su ciclo de vida (`engineer_service.go:781-787`): esa ruta jamás se ejecuta.

El nombre del piloto sí viaja como *valor* (`VehicleState.DriverName`, `reducer.go:43`), pero no como *identidad*, así que el sistema no puede distinguir "mismo coche, otro piloto" de "mismo piloto".

### Ventana de overlay abierta a mitad de sesión

Resuelto y explicado en el código: `Hub.Subscribe` marca `pendingStatus`/`pendingSnapshot` con lo retenido (`transport.go:421-441`), y `ReplayStatus` existe precisamente porque el puente Wails comparte una suscripción y no repite eventos (`transport.go:522-548`, comentario extenso). El frontend pide status al arrancar (`projection-observer.ts:142`). **Sí recibe snapshot inicial completo**, siempre que `hub.latest.full.StatusRevision == hub.status.StatusRevision` (`transport.go:425-427`); si no coincide, el widget se queda en `waiting` hasta la siguiente publicación (ventana pequeña pero real; hay logging explícito para ella, `transport.go:436-438`).

### Vantare antes/después del sim, menú, pausa, garaje, pit lane, player ausente

- **Vantare antes que el sim**: `Detect` devuelve siempre `true` (`telemetry_core_runtime.go:154`), así que se construye el driver y `openSharedMemory` falla → `ErrDisconnected` → retryable → backoff exponencial con jitter, presupuesto `MaxReconnects: 1_000` (`:165`) más reset por `StableRun` (`driver_manager.go:301-306`). Robusto y bien razonado.
- **Menú / carga / garaje**: producen frames que fallan `validateMapperObservation`; se absorben como no fatales y se cuentan como rechazados (`telemetry_core_runtime.go:620-630`, comentario que documenta el bug histórico: "un unico frame de garaje dejaba la telemetria apagada hasta reiniciar"). Bien resuelto.
- **Pausa**: `SourceTime` no cambia → tras 500 ms `withFreshness(..., Stale)` (`driver.go:213-219`) → `runtimeState` → `StateStale` (`driver.go:366-368`) → `SourceStatus.Available` sigue true por decisión explícita (`telemetry_core_runtime.go:267` y comentario). Coherente.
- **Player ausente (menú, espectador)**: `state.playerID = ""` (`batch_mapper.go:204-205`), el reducer lo permite sin epoch nuevo (`reducer.go:211-216`, comentario correcto), `derive` devuelve delta `Missing` (`delta.go:156-159`), la proyección lleva `Player: ""`. Testeado (`batch_mapper_test.go:268`). Bien.
- **Pit lane**: `InPit` invalida la vuelta candidata del delta (`delta.go:174-177`) y genera facts `FactPitEntered/Exited` solo con presencia continua (`session_coordinator.go:346-358`, `continuousPresence` compara `lastSeen == previousHeader.Cursor`, `:309`). Correcto y conservador.
- **Practice→Qualifying→Race**: detectado por cambio de firma `(track, sessionType)` **solo si ambos campos están frescos** (`batch_mapper.go:169-171`, `freshSignature` en `:294-295`). Si la transición ocurre mientras SM está stale, la firma no se actualiza y **la sesión nueva se fusiona con la anterior** hasta que llegue un frame fresco con la firma nueva. No hay test de esta ventana.

### Cobertura de tests por escenario

| Escenario | Test |
|---|---|
| Slot vacante reaparece | `batch_mapper_test.go` `testVacatedSlotGeneration` |
| Cambio de generación del player | `testPlayerGenerationChange` |
| Cambio de firma de sesión | `testSessionSignatureChange` |
| Clock reset / wrap | `testClockReset`, `testClockWrap` |
| Reconnect del driver sin observación aceptada | `testReconnectPreservesState`, `TestDriverManagerReconnectReusesTheLongLivedObservationSink` |
| Player aparece / ausente | `testPlayerAppearance`, `testPlayerAbsence` |
| Presupuesto de 104 vehículos (atómico) | `TestSessionCoordinatorVehicleHistoryBudgetIsAtomicAndRetryable` |
| **Desincronización mapper↔reducer tras fallo de stage** | **ninguno** |
| **Grid de 104 coches extremo a extremo** | **ninguno** |
| **Payload > límite del transporte** | **ninguno en el runtime** (sí unitario en `transport_test.go`) |
| **Transición P→Q→R con firma stale** | **ninguno** |
| **Engineer lento (latencia, no error)** | **ninguno** |
| **Recuperación tras `failStop`** | **ninguno** (no existe la ruta) |
| **Cambio de piloto (enduro)** | **imposible: ruta muerta (D-05)** |

---

## 5. Facts (Engineer)

**Producción**: `SessionCoordinator.applySnapshot` deriva facts comparando el snapshot con su estado previo (`session_coordinator.go:267-378`).
**Orden**: `FactSequence` estrictamente creciente, asignada en `publish` (`:415-419`) y **solo commiteada si el sink acepta** (`:426`).
**Deduplicación**: no hay. El contrato exige "todo o nada" (`:62-67`).

Riesgos:

- **Duplicación por reintento**: si `WriteFacts` falla a medias (contrato incumplido), el coordinador no avanza `factSequence` y el batch se re-emite con **las mismas secuencias**. El consumidor debe deduplicar por secuencia; `EngineerService.ConsumeFact` lo hace (`engineer_service.go:775-777`, rechaza `sequence <= s.factSequence`). En producción el sink es `collectTelemetryFacts` (`telemetry_core_runtime.go:677-684`) que nunca falla, así que el riesgo está latente pero no activo.
- **Pérdida**: `deliverEngineer` proyecta y entrega fact a fact; si `ProjectFactV1` falla para uno, **se salta y continúa** (`telemetry_core_runtime.go:701-705`) → hueco de secuencia → el siguiente fact es rechazado por Engineer con "engineer fact cursor is stale or invalid"… no, es aceptado: `ConsumeFact` acepta cualquier secuencia mayor (`engineer_service.go:775`), solo rechaza retrocesos. **Los huecos de facts se aceptan silenciosamente.** El transporte muerto sí los detectaría (`fanout.go:290-306`, `adapters.go:83-86`).
- **Facts de bucle infinito acotado**: `FactLapCompleted` se emite una vez por vuelta intermedia (`session_coordinator.go:327-339`) con corte en `maxFacts` (256). Un salto de vueltas grande (replay, teleport) → `ErrFactBatchOverflow` → **D-01**.
- **Engineer lento**: no hay timeout, no hay cola, no hay goroutine. `deliverEngineer` bloquea el bucle del driver. `ConsumeObservation` toma `s.mu` que también usan el bridge de Wails y los comandos del usuario (`engineer_service.go:665`), así que una acción del usuario en la UI puede bloquear la ingesta de telemetría.

---

## 6. Stale: propagación hasta el widget

Cadena: `Fusion.fieldAt` (monotónico, TTL 500 ms) → `schema.Field.freshness` → `core.VehicleState` → `derive` → `projection.projectFreshness` → JSON `"freshness": "fresh|stale|missing|invalid"` (`contracts.go:150-161`) → `decodeField` en el frontend valida coherencia presencia/frescura (`overlay-projection-v1.ts:531-540`) → `usable` en el adaptador.

**La frescura se evalúa con el reloj correcto** (monotónico del proceso, `driver.go:75`, `fusion.go:442-450`) y **en el sitio correcto** (el driver, que es quien sabe cuándo llegó el dato).

### Defecto D-06 (grave): la frescura se congela en el momento de publicar

`Freshness` es un valor calculado una vez y serializado. **Nada la reevalúa aguas abajo.** Mientras el driver siga emitiendo a 60 Hz esto no importa (cada frame recalcula). Pero si el pipeline se detiene —`failStop` (D-02), driver terminal (D-01), driver colgado en `readStable`, o Engineer bloqueando el bucle— el último frame publicado se queda en el Hub y en el store del frontend **diciendo `"fresh"` indefinidamente**.

El único contrapeso es el `StatusEnvelope` (`stopped`/`error`), pero:
- El monitor que lo publica corre en la misma goroutine-family cancelada por `failStop` (`telemetry_core_runtime.go:580-608`, sale por `ctx.Done()`), y `failStop` **cierra los hubs antes** de que nadie pueda publicar `error`. `runtime.statusState = StateError` se escribe en memoria (`:862`) pero no se publica.
- Resultado: tras `failStop`, el frontend conserva el último status válido (p. ej. `live`) y el último snapshot marcado `fresh`. **Un widget puede mostrar datos de hace minutos como si fueran actuales.** El único síntoma es que el reloj deja de moverse.

No hay watchdog de "sin frames desde hace X" en ninguna capa: ni en el runtime, ni en el Hub, ni en el store del frontend, ni en el adaptador.

---

## 7. Recording

**No está conectado.** `recording.Coordinator` tiene un diseño de fiabilidad notablemente mejor que el pipeline vivo: cola con capacidad (`coordinator.go:64`), estados `Idle/Recording/Stopping/Complete/Incomplete`, clasificación de fallo (`classifyFailure`), rechazo por saturación con transición explícita (`coordinator.go:112-118`), y `TryAccept` que valida antes de encolar. Es exactamente el patrón asíncrono con drop-policy que el resto del sistema no usa.

- **¿Un fallo de SQLite afecta al pipeline vivo?** Hoy no, porque no hay pipeline→SQLite. Si se conectara con `TryAccept`, tampoco: devuelve error sin bloquear.
- **Paridad de replay**: sí hay tests de paridad — `recording/replay/canonical_integration_test.go` con golden `canonical-integration-v1.golden.json`, y `derive/pipeline_test.go:325` `TestPipelineReplayMatchesGolden`, `:392` `TestPipelineReplayIsDeterministicAndDriverTeamChangesPreserveHistory`. Buena base.
- **Huecos de secuencia**: `Cursor` se persiste y `pendingBatch` los ordena (`coordinator.go:31-34`), pero la validación de contigüidad al reproducir la hace el reducer/pipeline, que es fail-stop.
- La grabación real que sí existe en producción es otra cosa: `telemetryanalysis` (DuckDB) y `diagnostics.RawCapture` (`lmu/capture.go`, con `Reserve`/`Drop` no bloqueante, `driver.go:268-291`) — este último **sí** está bien desacoplado: si la captura no puede reservar, hace `Drop()` y el frame sigue.

---

## 8. Transporte

| Mecanismo | Estado real | Juicio |
|---|---|---|
| `StatusRevision` | Vivo. `+1` estricto en el Hub (`transport.go:325-328`) y en el store del frontend (`store.ts:91-93`, lanza `status-gap`) | **Frágil**: ver D-07 |
| Seal SHA-256 | Vivo pero **inútil**: `seal` es un campo **no exportado** (`transport.go:85`, `:99`, `:113`), no se serializa a JSON, nunca cruza un límite de proceso. Solo detecta mutación in-process de un struct que nadie muta | **Ceremonia**. Coste: 4 `sha256` por frame (2 productos × envelope + status) a 60 Hz |
| RFC 7396 delta | Implementado, verificado por reconstrucción (`transport.go:378-394`), y **nunca usado**: producción pasa `nil` (`telemetry_core_runtime.go:789`, `:793`). También implementado en el frontend (`merge-patch.ts`, `store.ts:163-172`) | **Código muerto en ambos lados** |
| `latest-wins` full snapshot | Vivo y correcto: `pendingSnapshot bool`, `notify` no bloqueante | **Suficiente**. Es lo único que hace falta |
| Resync tras perder secuencias | El frontend **tolera** huecos en `full`: registra diagnóstico `snapshot-resync` y sigue (`store.ts:176-183`). Solo rechaza retrocesos y `delta` sin base | **Correcto**: cada frame es full, el hueco no importa |
| Límite de payload | 256 KB (`transport.go:44`), verificado en `newFull` **antes** de publicar (`:248`) | **Peligroso**: ver D-08 |
| Facts por transporte | Código muerto | — |

### Defecto D-07 (medio): `statusRevision` estrictamente contiguo sobre un canal que coalesce

El Hub coalesce status: `subscriber.pendingStatus = true` es un booleano (`transport.go:333`). Si se publican dos revisiones entre dos `Next()` del suscriptor, este **solo ve la última**. El store del frontend exige `revision == current + 1` y **lanza** si no (`store.ts:91-93`). El error se captura en `attach.ts:24-26` y se convierte en un diagnóstico `error`, pero el store **queda con el status viejo** y todas las proyecciones siguientes fallan con `status-gap` (`store.ts:112-114`) porque su `statusRevision` no coincide. **El widget se queda congelado permanentemente.**

Ventana real: `monitor` publica cada 100 ms (`telemetry_core_runtime.go:24`) y `publishProjections` también puede cambiar status (`:770`); durante un reconnect con flapping `detecting→connecting→live` en <16 ms, o bajo carga del hilo de Wails, la coalescencia es plausible. No hay test de "dos status entre dos lecturas".

### Defecto D-08 (grave): un grid grande supera el límite de payload y mata el Core

Medición sobre el golden real (`projection/overlay/testdata/lmu-1.4-delta-overlay-v1.golden.json`, con IDs canónicos `lmu-slot-7-generation-1`): **2 526 bytes JSON compactos por vehículo**.

| Coches | Vehículos | + `controlsHistory` (120 × ~100 B) | + `deltaHistory` (120 × 144 B) | Total aprox. | vs 262 144 B |
|---|---|---|---|---|---|
| 24 | 60,6 KB | 12 KB | 17,3 KB | ~90 KB | OK |
| 62 (Le Mans 24h) | 156,6 KB | 12 KB | 17,3 KB | ~186 KB | OK, margen 1,4× |
| 80 | 202,1 KB | 12 KB | 17,3 KB | ~232 KB | **al límite** |
| **104** (`lmu13Layout.ScoringRows.Maximum`, `session_coordinator.go:27-29`) | **262,7 KB** | 12 KB | 17,3 KB | **~292 KB** | **EXCEDE** |

Con 104 coches, `newFull` devuelve `ErrPayloadTooLarge` (`transport.go:248` → `:629`) → `publishProjections` error → `failStop` → **Core muerto y hubs cerrados**. Y el Strategy Hub añade su propio payload sobre el mismo límite.

El sistema declara soportar 104 slots (`MaxSessionVehicleHistory = 104`, "matches the demonstrated LMU VehicleScoring slot budget") y a la vez tiene un transporte que no puede llevarlos. **No hay ningún test que proyecte 104 vehículos.** `full_grid_test.go` usa 2.

---

## 9. Duplicación Go ↔ frontend

| Derivación | Go | Frontend | ¿Pueden divergir? |
|---|---|---|---|
| Historial de inputs | `derive.ControlsHistory`, 120 muestras, reset por epoch/session/run/vehicle, **solo añade si las 3 ratios son `Fresh`** (`pipeline.go:312-347`) | `input-telemetry-accumulator.ts`: `Map` global de módulo por `widgetId`, 120 muestras, clave `session.key ?? session.type` + `epoch`, añade si `status` es `ready`/`stale` y `capturedAt` cambió | **Sí.** En pausa/menú el backend deja de añadir (frescura ≠ fresh) pero el frontend sigue añadiendo muestras planas porque `capturedAt` = `ReceivedUTC` siempre avanza. Dos widgets con la misma señal muestran historiales distintos |
| Delta e historial de delta | `derive.selfDelta`, referencia interpolada, 120 muestras públicas (`delta.go:19-21`) | consume `deltaHistory` de la proyección | No (bien) |
| Gaps relativos | `derive.deriveRelativeGaps` → `relativeTimeGapSeconds` | `relative-view-model.ts` lee `timeGapToPlayer` mapeado por el adaptador (`overlay-projection-adapter.ts:431`) | No, pero el adaptador introduce un renombrado que oculta la procedencia |
| Historial de combustible | no existe en Go (`fuelHistory` marcado `unsupported-by-projection`, `overlay-projection-adapter.ts:68`) | `fuel-strategy-view-model.ts` | Solo frontend: no diverge, pero tampoco se graba ni se replica en Analysis |

El caso del acumulador de inputs es el más claro: **estado mutable global de módulo en el frontend** (`const histories = new Map<...>` a nivel de módulo) que no se limpia al cambiar de epoch salvo por comparación de clave, y que no comparte política de calidad con el backend.

---

## 10. Matriz de escenarios

Leyenda de riesgo: **A** = pérdida total de telemetría hasta reiniciar · **M** = dato incorrecto o widget congelado · **B** = degradación visible y recuperable.

| # | Escenario | Comportamiento actual (evidencia) | Riesgo | Arquitectura simplificada |
|---|---|---|---|---|
| 1 | Vantare arranca antes que el sim | `Detect`=true siempre (`runtime:154`), `openSharedMemory` falla → `ErrDisconnected` retryable, backoff+jitter, 1 000 intentos + reset por `StableRun` | B | Igual o mejor: el motor publica `FinalState` vacío con `source: disconnected` desde el frame 0 |
| 2 | El sim arranca después | Se conecta en el siguiente ciclo de backoff (≤5 s, `MaxBackoff`) | B | Igual |
| 3 | Menú | Frames rechazados por `ErrInvalidSessionIdentity`, absorbidos (`runtime:627`) | B | Igual, pero el motor publicaría `session: none` en vez de no publicar |
| 4 | Pausa | `SourceTime` congelado → `Stale` a los 500 ms → `StateStale`, `Available` sigue true (`runtime:267`) | B | Igual |
| 5 | Garaje | Igual que menú; documentado como bug histórico ya corregido (`runtime:620-626`) | B | Igual |
| 6 | Pit lane | `InPit` invalida vuelta candidata (`delta.go:174`), facts pit con presencia continua (`coordinator:346-358`) | B | Igual |
| 7 | Player ausente | `playerID=""` sin epoch nuevo (`reducer:211-216`), delta `Missing` | B | Igual |
| 8 | 1 coche | Sin incidencias | — | Igual |
| 9 | **104 coches** | **Payload ~292 KB > 256 KB → `ErrPayloadTooLarge` → `failStop` → Core muerto** (D-08). Sin test | **A** | **Falla más seguro**: un publisher latest-wins sin límite artificial, o con límite → descartar frame y contar métrica, nunca matar el motor |
| 10 | SM stale | `forceStale` a todo el grid (`fusion:207`), estado `Stale`, sigue publicando | B | Igual |
| 11 | REST offline | `RESTStatusUnknown` no degrada (`driver:337`), campos SM | B | Igual |
| 12 | REST parcial | TTL por campo con `updatedMono` propio (`fusion:360`) | B | Igual |
| 13 | Reconnect del driver | `BatchMapper` es long-lived y no se resetea (`batch_mapper.go:58-64`); cursor y generaciones sobreviven; testeado | B | Igual, y `StreamEpoch` explícito lo haría legible |
| 14 | Clock reset del sim | `ClockReset` → nueva sesión + epoch (`batch_mapper:168-183`) | B | Igual |
| 15 | Practice→Qualifying→Race | Detectado por firma `(track, type)` **solo si ambos frescos** (`batch_mapper:169-171`). Con SM stale la sesión nueva se fusiona con la anterior hasta el primer frame fresco. Sin test | **M** | Igual de difícil: es un problema de la fuente, no de la arquitectura. Un `SessionID` explícito derivado por el driver con política declarada lo aísla mejor |
| 16 | **Slot desaparece un frame** | **Nueva `VehicleID` (`generation++`). Si es el player: epoch nuevo → se borran `ControlsHistory` y toda la referencia de delta** (D-03). Testeado como comportamiento deseado | **M** | **Falla más seguro**: identidad = `mID` estable + política de ausencia con ventana de gracia; la desaparición de un frame no es un evento de identidad |
| 17 | Slot reutilizado para otro coche | `SourceID` es el `mID` del sim (`format.go:91-93`), no el índice de fila, así que la reutilización dentro de sesión es improbable; si ocurriera, la identidad canónica se mantendría y `CompletedLaps` heredaría el high-water del coche anterior (`coordinator:322-325`) | M | Igual de expuesto salvo que se añada verificación por `(mID, driverName, class)` |
| 18 | Suscriptor lento (SSE/Wails/OBS) | latest-wins, `notify` no bloqueante (`transport:727`); nunca aplica contrapresión | — | Igual (es el patrón correcto y ya está) |
| 19 | Se pierden secuencias hacia el frontend | El store lo tolera en `full`: diagnóstico `snapshot-resync` y sigue (`store.ts:176-183`) | — | Igual. Con full-snapshot puro el concepto de "hueco" desaparece |
| 20 | Se pierde una **revisión de status** | El store lanza `status-gap` y **queda desincronizado permanentemente**; todas las proyecciones siguientes se rechazan (D-07) | **M** | **Falla más seguro**: el status va dentro del frame (como en `core.SnapshotFrame`, `fanout.go:40-45`), sin cursor propio ni contigüidad exigida |
| 21 | Ventana de overlay aparece a mitad de sesión | Recibe status+full retenidos (`transport:421-441`) + `ReplayStatus` (`:531`). Ventana residual si `latest.full.StatusRevision != status.StatusRevision` | B | **Falla más seguro**: un único frame atómico (estado+status) elimina la condición de coincidencia |
| 22 | **Engineer tarda demasiado** | **Bloquea el bucle de 60 Hz del driver** (`runtime:673` → `engineer_service.go:660`, bajo `s.mu` compartido con la UI). Sin timeout, sin cola, sin métrica de latencia. Sin test | **M** | **Falla más seguro**: latest-wins + facts ordenados asíncronos; Engineer lento solo se pierde frames intermedios |
| 23 | Falla la escritura de grabación | No aplica (no conectado). El diseño existente (`coordinator.go`) ya es asíncrono con drop | — | Cola asíncrona con drop-policy: correcto |
| 24 | Payload supera el límite | `ErrPayloadTooLarge` → `failStop` → hubs cerrados, terminal (D-08, D-02) | **A** | Descartar frame + contador; nunca terminal |
| 25 | Fallo de un stage post-reducer (cualquier causa) | **Desincronización permanente mapper↔reducer → `ErrStaleBatch` en bucle → `setTerminal`** (D-01). Sin test | **A** | Un único motor con un único commit: no hay dos cursores que desincronizar |
| 26 | >104 identidades de vehículo en una sesión | `ErrVehicleHistoryOverflow` → D-01 → Core muerto (D-04) | **A** | Evicción LRU o cap sin error: perder historia de un rival ≠ perder telemetría |
| 27 | Cambio de piloto (enduro) | **No se detecta**: `Driver`/`Team` nunca se rellenan (D-05) | M | Requiere `DriverID` real, independiente de la arquitectura |
| 28 | Pipeline detenido por cualquier causa | El último frame queda en el Hub y en el frontend marcado `"fresh"` para siempre; el status `error` **no llega** porque `failStop` cierra los hubs antes (D-06) | **M** | Watchdog de edad en el consumidor + frescura reevaluada al leer |
| 29 | Panic en cualquier consumidor | Sin `recover()` en todo el pipeline: cae el proceso | **A** | Un `recover` por frontera de consumidor es trivial cuando los consumidores están desacoplados |

---

## 11. Respuestas directas

**¿Debe existir un reducer single-writer?**
Sí, pero **uno solo**, no cinco propietarios de estado en cascada. Hoy hay cinco máquinas con estado y con cursor propio: `BatchMapper` (cursor canónico, generaciones), `Reducer` (header + estado observado), `SessionCoordinator` (vehículos, factSequence), `derive.Pipeline` (header + historias + tracker de delta), `Hub` (epoch/sequence/statusRevision). Cada una revalida el cursor de la anterior (`reducer.go:221`, `pipeline.go:367`, `transport.go:707`, `fanout.go:169`) y cada una puede rechazar por su cuenta. **Esa multiplicidad es la causa raíz de D-01.** Un motor canónico single-writer que consuma frames del driver y emita un `FinalState` inmutable elimina cuatro de los cinco cursores.

**¿Es necesario el `BatchMapper` actual?**
La *función* sí (traducir slots de LMU a identidad canónica y decidir fronteras). La *forma* no: es un segundo dueño de cursor fuera del motor, con estado clonado por frame (`batch_mapper.go:140`, incluidos dos maps) y con una política de identidad hipersensible (D-03). Debería ser una función pura del driver `Observation → CanonicalFrame` cuyo estado de identidad viva **dentro** del motor, con el cursor asignado por el motor en el commit.

**¿Qué debería significar `epoch`?**
Hoy significa tres cosas a la vez. Deberían separarse:

| Concepto propuesto | Cambia cuando | Consecuencia |
|---|---|---|
| `StreamEpoch` | El productor pierde continuidad (reconnect, clock wrap, reinicio del mapper) | El consumidor descarta su historia de transporte; **no** implica sesión nueva |
| `SessionID` | Nueva sesión del sim (track+tipo+clock reset) | Se borra historia de sesión, se emiten `SessionEnded`/`SessionStarted` |
| `VehicleID` | Identidad estable del vehículo (`mID` + verificación), **no** por ausencia transitoria | Persistente durante toda la sesión |
| `StintID` | Cambio de piloto o salida/entrada de boxes con cambio de conductor | Rebasa derivaciones por piloto; hoy **no existe** y por eso D-05 es invisible |

Sí, deben separarse los cuatro. Hoy `epoch` mezcla los tres primeros y el cuarto no existe.

**¿Cuál debe ser la frontera de commit?**
Una sola, dentro del motor: `aplicar frame → validar → derivar → construir FinalState inmutable → commit atómico (estado + cursor + facts pendientes)`. Todo lo posterior (proyección, transporte, Engineer, recording) es **publicación**, no commit, y **su fallo nunca puede revertir ni bloquear el commit**. Hoy la publicación está dentro de la transacción (`telemetry_core_runtime.go:662-673`) y por eso un hub roto mata el motor.

**¿Puede un fallo de Overlay detener el Core?**
Sí, hoy sí, y de forma terminal: `publishProjections` → `failStop` → `cancel()` + `closeProductHubs()` + `lifecycle = terminal`, sin ruta de reinicio (`telemetry_core_runtime.go:662-670`, `:846-865`, `:296-299`).

**¿Cómo desacoplar Engineer y Recording?**
- Engineer: `latest-wins` sobre `FinalState` (una goroutine propia con canal de capacidad 1 y drop del anterior) + un canal ordenado y acotado de facts con política explícita de resync. El mecanismo **ya existe y está testeado**: `core.Fanout` con `SnapshotSubscription` (cap 1, drena y reemplaza, `fanout.go:210-217`) y `FactSubscription` con `FactResyncRequiredError` (`fanout.go:87-100`, `:314-326`). Solo hay que conectarlo.
- Recording: `recording.Coordinator` con `TryAccept` no bloqueante y drop por saturación (`coordinator.go:96-118`). También existe. También hay que conectarlo.

**¿Hace falta stream de status separado, `statusRevision`, seal SHA-256, RFC 7396?**
- Stream de status separado: **no**. Genera la coincidencia obligatoria `snapshot.StatusRevision == status.StatusRevision` (`transport.go:363-366`, `store.ts:112`) que produce ventanas en blanco y desincronización permanente (D-07). El status debe viajar **dentro** del frame, como ya hace `core.SnapshotFrame` (`fanout.go:40-45`).
- `statusRevision` contiguo: **no**. Es un cursor sobre un canal que coalesce por diseño.
- Seal SHA-256: **no**. El campo no se serializa (`transport.go:85`), nunca cruza un proceso; solo cuesta CPU a 60 Hz.
- RFC 7396: **no**. Está implementado en Go y en TypeScript y **nunca se usa**. Con full snapshots de ~90–190 KB en local (Wails/loopback) la compresión de deltas no compra nada frente a su superficie de fallo (`ErrDeltaMismatch`, `delta-without-base`, `snapshot-gap`).

**¿Basta un latest full snapshot?**
Sí, para el estado continuo. El propio store del frontend ya demuestra que basta: tolera huecos en `full` sin más que un diagnóstico (`store.ts:176-183`). Lo que **no** basta el full snapshot es para los **facts** (ocurrencias discretas: vuelta completada, entrada a boxes): ahí sí hacen falta orden, no-pérdida y una política de resync explícita. La separación "snapshot latest-wins + facts ordenados" ya está diseñada en `core.Fanout`; el error fue no usarla y llamar a Engineer en línea.

**¿Cómo recuperarse tras perder secuencias?**
- Snapshots: no hay nada que recuperar; el siguiente full es la verdad. Basta con eliminar el rechazo por contigüidad de `Hub.PublishSnapshot` (`transport.go:367-375`) que hoy convierte un hueco en `failStop`.
- Facts: `FactResyncRequiredError` con `Previous`/`Next` y "pide un full snapshot" es el contrato correcto (`fanout.go:87-100`). Falta usarlo.
- Motor: un frame rechazado debe ser **descartado y contado**, nunca terminal. La política de hoy —"el primer rechazo mata el stream"— es exactamente al revés de lo que un consumidor de simulador necesita.

---

## 12. Puntuación

### Corrección semántica y fiabilidad (0–20)

| Arquitectura | Nota | Justificación |
|---|---|---|
| **Actual** | **11 / 20** | **A favor (+):** modelo de calidad explícito y ejemplar (`presente / fresco / stale / inválido` sin sobrecargar el cero, `quality.go:27-75`); TTL con reloj monotónico y no wall-clock (`fusion.go:442-450`); propiedad de datos rigurosa, cero aliasing hacia consumidores (`envelope/types.go:49-64`); atomicidad por componente real y testeada; facts con secuencia independiente del snapshot; absorción correcta de frames no mapeables (menú/garaje) tras un bug histórico ya arreglado. **En contra (−):** el sistema completo no tiene frontera transaccional y se desincroniza de forma irreversible ante cualquier fallo de stage (D-01, riesgo A); `failStop` irreversible por causas transitorias (D-02); techo declarado de 104 vehículos que el propio transporte no puede llevar (D-08) y que el coordinador convierte en muerte del core (D-04); identidad de vehículo destruida por un frame perdido (D-03); detección de cambio de piloto muerta (D-05); frescura congelada sin watchdog (D-06); `statusRevision` contiguo sobre canal coalescente (D-07); Engineer síncrono en el bucle de 60 Hz; sin `recover()` en ninguna frontera. Los aciertos son de grano fino; los fallos son de grano grueso y todos terminan en "reinicia la aplicación". |
| **Simplificada** (drivers → motor canónico single-writer → `FinalState` inmutable → `OverlayFrame` → un publisher latest-wins full → store; Engineer latest-wins + facts ordenados asíncronos; recording cola asíncrona con drop) | **16 / 20** | **A favor (+):** una sola frontera de commit elimina de raíz D-01, D-02, D-04 (con evicción) y la clase entera "un consumidor mata al productor"; status dentro del frame elimina D-07 y la ventana en blanco del escenario 21; full snapshot puro hace que "perder secuencias" deje de ser un concepto; Engineer y Recording desacoplados hacen que la latencia de un consumidor sea invisible para el resto; menos cursores = menos invariantes que un LLM o un humano puedan romper. **En contra (−):** no resuelve por sí sola la semántica de identidad (escenarios 15, 16, 17, 27 siguen dependiendo de una política explícita de `VehicleID`/`SessionID`/`StintID`); latest-wins hace que "el frame que se ve" no sea determinista bajo carga, lo que complica la paridad de replay que hoy sí está bien cubierta (`pipeline_test.go:325`, `:392`); mover facts a asíncrono introduce la necesidad real de un contrato de resync que hoy solo existe sobre el papel (`fanout.go`). Los −4 puntos son estos tres, no fallos de la idea. |

### Testabilidad y observabilidad (0–8)

| Arquitectura | Nota | Justificación |
|---|---|---|
| **Actual** | **5 / 8** | **A favor (+):** cobertura unitaria excepcional (tablas de transición de identidad en `batch_mapper_test.go:174-198`, matriz de backpressure en `session_coordinator_test.go:447`, soak determinista en `fanout_test.go:690`, goldens de replay, `architecture_test.go` como guardián); relojes, tickers, backoff y jitter inyectables (`driver_manager.go:39-55`, `config` en `driver.go:37-49`) — cero dependencias de wall-clock en tests; métricas sin payload y seguras para exportar (`FanoutMetrics`, `HubMetrics`, `TelemetryCoreMetrics`); logs de transporte que distinguen "nunca recibió nada" de un cierre normal (`transport.go:559-563`). **En contra (−):** los tests validan componentes, no el sistema — ninguno de los seis fallos críticos (D-01, D-02, D-04, D-06, D-08, escenario 22) tiene test, y todos son fallos *entre* componentes; no hay métrica de latencia de Engineer, ni edad del último frame, ni contador de `failStop`; el error terminal solo aparece como línea de log (`telemetry_core_runtime.go:595-600`); una porción grande de lo que está testeado (fanout, facts, merge-patch, recording) **no se ejecuta en producción**, lo que infla la sensación de cobertura. |
| **Simplificada** | **6 / 8** | **A favor (+):** un motor single-writer puro `(estado, frame) → estado'` es trivialmente testeable por tabla y por replay determinista; menos cursores = menos combinaciones de fallo que enumerar; los consumidores desacoplados se testean con dobles sin montar el pipeline; observabilidad natural en la frontera del publisher (frames publicados / descartados / edad del último frame). **En contra (−):** el desacoplamiento asíncrono introduce no-determinismo que hay que domar con relojes y colas inyectables para no perder la calidad de replay actual; y no se hereda gratis la excelente cobertura unitaria existente: hay que reescribirla. |

---

## 13. Lista priorizada de defectos y riesgos concretos

| # | ID | Severidad | Defecto | Evidencia | Corrección mínima (sin rearquitectura) |
|---|---|---|---|---|---|
| 1 | D-01 | **Crítico** | Fallo de cualquier stage post-reducer desincroniza mapper y reducer de forma **irreversible**; el bucle de `ErrStaleBatch` acaba en `setTerminal`. Telemetría muerta hasta reiniciar | `reducer.go:137` vs `batch_mapper.go:146-149`; `reducer.go:228-230`; `driver.go:347-360`; `driver_manager.go:296-298` | Que `WriteBatch` sea todo-o-nada: o el reducer soporta rollback, o el mapper commitea antes y el reducer no valida contigüidad, o ambos comparten cursor |
| 2 | D-08 | **Crítico** | Grid de 104 coches ≈292 KB > límite de 256 KB → `ErrPayloadTooLarge` → `failStop` → hubs cerrados. Sin test de grid completo | medición sobre `lmu-1.4-delta-overlay-v1.golden.json` (2 526 B/vehículo); `transport.go:44`, `:248`; `runtime:773-791` | Subir/eliminar el límite **y** convertir el fallo de publicación en "descartar frame + contador", nunca `failStop`. Añadir test de 104 vehículos extremo a extremo |
| 3 | D-02 | **Crítico** | `failStop` es terminal y sin ruta de reinicio, disparado por causas transitorias (payload, hueco de secuencia, revisión de status) | `telemetry_core_runtime.go:846-865`, `:296-299`, `:662-670` | Reservar `failStop` para fallos de programación; para el resto, contar y continuar |
| 4 | D-04 | **Crítico** | Tope duro de 104 identidades históricas por sesión, **acumulativo** (agravado por D-03) → `ErrVehicleHistoryOverflow` → D-01 | `session_coordinator.go:27-29`, `:296-304` | Evicción LRU de vehículos no vistos hace N frames, o degradar sin error |
| 5 | D-03 | **Grave** | Una fila ausente **un solo frame** genera una `VehicleID` nueva; si es el player, además fuerza epoch nuevo y **borra `ControlsHistory` y la referencia de delta** | `batch_mapper.go:186-212`; `pipeline.go:269-271`; `delta.go:146-149`; test `batch_mapper_test.go:326` | Ventana de gracia (p. ej. 30 frames) antes de considerar vacante un slot; y desacoplar "cambio de player" de "epoch nuevo" |
| 6 | D-06 | **Grave** | Frescura congelada en el frame publicado; si el pipeline se detiene el widget muestra dato viejo como `fresh` y el status `error` **no llega** porque `failStop` cierra los hubs antes de publicarlo | `quality.go:42-47`; `runtime:846-864`; sin watchdog en `store.ts` ni en el adaptador | Watchdog de edad en el frontend (`capturedAt` vs `Date.now()`) que degrade a `stale`; y publicar el status `error` **antes** de cerrar hubs |
| 7 | — | **Grave** | Engineer se ejecuta **síncrono dentro del bucle de 60 Hz** del driver, bajo un mutex compartido con la UI. Sin timeout ni métrica de latencia | `runtime:673`; `engineer_service.go:660-665` | Goroutine con canal cap 1 y drop (el patrón ya existe en `fanout.go:210-217`) |
| 8 | D-07 | **Medio** | `statusRevision` exige contigüidad estricta en el frontend sobre un canal que coalesce por diseño → widget congelado permanentemente | `transport.go:333`; `store.ts:91-93`, `:112-114` | Aceptar cualquier revisión mayor; o mover el status dentro del frame |
| 9 | D-05 | **Medio** | `FactDriverChanged` es inalcanzable: `RunIdentity.Driver`/`.Team` nunca se rellenan en el camino LMU | `batch_mapper.go:299-333` vs `session_coordinator.go:311-317`; `engineer_service.go:781-787` | Rellenar `Driver` desde `DriverName` (o un `DriverID` derivado) en `mapVehicle` |
| 10 | — | **Medio** | Huecos de facts hacia Engineer se aceptan en silencio si `ProjectFactV1` falla para uno intermedio | `runtime:701-705`; `engineer_service.go:775` | Tratar el fallo de proyección de un fact como boundary, no como "saltar y seguir" |
| 11 | — | **Medio** | Transición P→Q→R con SM stale funde la sesión nueva con la anterior (la firma solo se actualiza si ambos campos son `Fresh`) | `batch_mapper.go:169-171`, `:294-295` | Test explícito + política declarada para firma no fresca |
| 12 | — | **Medio** | Historial de inputs duplicado y divergente entre Go (`ControlsHistory`) y frontend (`input-telemetry-accumulator.ts`, estado global de módulo) | `pipeline.go:312-347` vs `input-telemetry-accumulator.ts` | Consumir `controlsHistory` de la proyección y borrar el acumulador |
| 13 | — | **Medio** | Sin `recover()` en ninguna frontera de consumidor: un panic en Engineer o en una proyección tumba el proceso | `grep recover(` = 0 en `internal/telemetry` e `internal/app/telemetry*` | `recover` por frontera de consumidor con contador |
| 14 | — | **Bajo** | `cloneSelfDeltaTracker` clona `candidate`/`reference`/`previous` (hasta 18 000 muestras cada uno) **en cada frame** a 60 Hz | `delta.go:95-105`, `:19` | Copy-on-write o versionado por índice |
| 15 | — | **Bajo** | Seal SHA-256 sobre un campo no serializado: 4 hashes por frame que no protegen nada | `transport.go:85`, `:99`, `:113`, `:752-785` | Eliminar |
| 16 | — | **Bajo** | RFC 7396 implementado y verificado en Go y TypeScript, **nunca usado** (producción pasa `nil`) | `runtime:789`, `:793`; `merge_patch.go`; `store.ts:163-172` | Eliminar de ambos lados |
| 17 | — | **Bajo** | `core.Fanout`, transporte de facts y `recording.Coordinator` están completos, testeados y **desconectados** | `grep NewFanout` / `ServeWailsFacts` / `recording.NewCoordinator` | Conectar (preferible) o borrar; mantenerlos así infla la cobertura aparente |
| 18 | — | **Bajo** | `Reducer.Run` (no usado) termina el bucle al **primer** batch rechazado | `reducer.go:183-186` | Si algún día se usa, descartar y continuar |
| 19 | — | **Bajo** | `EventID` es la constante literal `"lmu-event-1"`: la mitad de la identidad de sesión es decorativa | `batch_mapper.go:32` | Eliminar o darle significado |
| 20 | — | **Bajo** | Métricas sin latencia de Engineer, sin edad del último frame, sin contador de `failStop`; el error terminal solo aparece en log | `TelemetryCoreMetrics` (`runtime:70-83`); `runtime:595-600` | Añadir los tres contadores |

---

### Conclusión de una línea

La calidad **local** de este código es alta —presencia y frescura explícitas, relojes monotónicos, propiedad de datos rigurosa, atomicidad por componente, tests inyectables— pero la fiabilidad **global** es baja porque no existe una frontera transaccional: cinco propietarios de estado con cinco cursores independientes, publicación dentro de la transacción, y una política de error uniformemente fail-stop-terminal convierten cualquier anomalía transitoria (un frame perdido, un grid grande, un consumidor lento) en "reinicia la aplicación".
