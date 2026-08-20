# 02 — Defensa de la arquitectura actual de telemetría

**Agente A — Auditor y defensor.** Rama `vantareapp/isa-338-...`, HEAD `08e316c1`.
Todas las citas son `archivo:línea` verificadas en código. Se distingue explícitamente
**[COMMITTEADO]** de **[LOCAL]** (diff de 51 ficheros sin commitear).

Estado de verificación: `go test ./internal/telemetry/...` **verde completo** (26 paquetes).
453 funciones `Test`, 19 `Benchmark`, 17.734 líneas de producción contra 22.715 de test
(ratio **1,28:1**).

---

## 0. Tesis de la defensa

La arquitectura actual **no es compleja por capas: es compleja por andamiaje no conectado**.

Esa distinción lo es todo. La alternativa simplificadora ataca la *estratificación*
(driver → fusion → mapper → reducer → coordinator → derive → projection → hub → frontend)
cuando el desperdicio real medido está en **productos especulativos sin consumidor y en un
transporte superseded**, no en las fronteras entre capas:

| Peso muerto real | Líneas | ¿Toca alguna frontera de capa? |
|---|---|---|
| `core.Fanout` (transporte superseded) | 572 + 961 test | No: es un peer de `telemetrytransport.Hub` |
| RFC 7396 merge-patch (Go + TS) | 116 + ~60 TS | No: rama opcional dentro del Hub |
| `recording.Coordinator` + SQLite (nunca arrancado) | ~1.700 | No: paquete hoja |
| `StrategyLiveRuntime` + `strategy/live` | ~400 | No: consumidor hoja |
| `internal/telemetryanalysis` + DuckDB (isla) | ~35 ficheros | No: isla sin importadores |

Borrar **todo** eso no mueve una sola frontera arquitectónica ni cambia una firma del
camino vivo. Es `git rm`. La alternativa propone rediseñar el espinazo para curar una
enfermedad que está en las extremidades.

El espinazo vivo, en cambio, está **medido, probado y justificado por incidentes reales**.
Eso es lo que defiendo. Lo que no puedo defender está en §9 y en las Concesiones.

---

## 1. El argumento más fuerte: un incidente que esta arquitectura hace imposible

`docs/delta-best-live-inventory.md` documenta el bug de la arquitectura **anterior**
(paquetes `internal/telemetry/lmu` y `internal/telemetry/fusion`, hoy ambos eliminados —
verificado: `ls` devuelve *No such file or directory*, y `grep -rn "isValidTime" internal/`
devuelve **cero**):

> `func isValidTime(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v,0) && v >= 0 }`

usada para validar `deltaBest`. Consecuencias documentadas en ese informe:

1. **Todo delta negativo se descartaba** (el piloto va más rápido → `v < 0` → inválido).
2. Un delta positivo **sobrescribía** el dato nativo de shared memory a 60 Hz con una
   estimación de Go a 250 ms.

Es el arquetipo del bug que mata un producto de simracing: el widget estrella miente
exactamente en el caso que importa. Y su causa raíz es **inferir presencia a partir del
valor**.

La arquitectura actual hace ese bug **estructuralmente inexpresable**:

`internal/telemetry/schema/quality.go:42-47`
```go
type Field[T comparable] struct {
	value      T
	present    bool
	provenance Provenance
	freshness  Freshness
}
```

`quality.go:56-58` prohíbe además construir un `Field` presente pero `FreshnessMissing`
(`ErrMissingValue`). Y `quality.go:71` obliga a `Value() (T, bool)`: **no existe un camino
en el que un `0` o un `-0.150` se lea sin consultar la presencia**. El comentario de
`projection/contracts.go:75-76` lo declara para el cable: *"presence independent from the
value, so false, zero and empty strings remain valid observations in JSON"*.

**El coste de esa garantía es exactamente `Field[T]`: cuatro campos y un constructor
validante.** Todo lo demás (matriz de autoridad, provenance, TTL) son consecuencias
disciplinadas de la misma idea. Una arquitectura que "simplifica" a un `FinalState` con
escalares desnudos reintroduce esa clase de bug el primer día que un sim publique un
centinela.

**Prueba de que la lección está internalizada [LOCAL]** — `drivers/lmu/format.go:359-370`:
```go
default:
	// LMU has no companion validity flag like iRacing's
	// LapDeltaToBestLap_OK. A zero before any completed best lap means the
	// native comparison is not available yet, rather than a real 0.000 s.
	row.DeltaBest = schema.MissingField[session.DeltaSeconds]()
```
El mismo campo, el mismo sim, el mismo cero ambiguo — y ahora se resuelve declarándolo
ausente en lugar de inventar un `0.000`. Además nombra la diferencia con iRacing: es
literalmente código escrito pensando en el segundo simulador.

### 1.b Segundo incidente documentado: el frame de garaje

`drivers/lmu/batch_mapper.go:94-104` (comentario en producción, no en test):

> *"Un unico frame de garaje apagaba la telemetria hasta reiniciar la aplicacion."*

Repetido en `internal/app/telemetry_core_runtime.go:618-626`. La causa: seis errores de
validación del mapper subían hasta `DriverManager`, que los clasificaba como no
reintentables y llamaba a `setTerminal`. La cura no fue quitar validación, sino **tipificarla**:

`batch_mapper.go:105-112` — `IsUnmappableFrame(err)` distingue *"este frame no describe una
sesión mapeable"* de *"el mapper está mal construido"*. El consumidor decide
(`telemetry_core_runtime.go:627-629` → `return nil`) y **lo sigue contando como rechazado**
(`:616`) para que el descarte no sea invisible.

Ese es el patrón que justifica una capa de mapeo separada: *clasificar* estados intermedios
(menús, boxes, pantallas de carga, cambios de sesión) es un trabajo real, y sin un sitio
donde vivir se convierte en `if` dispersos o en apagones.

---

## 2. Qué problema real resuelve cada capa

| Capa | Fichero clave | Problema real que resuelve | Evidencia |
|---|---|---|---|
| `schema` (Field/Freshness/Provenance) | `schema/quality.go:42-69` | Presencia ≠ valor; cero/negativo/vacío son observaciones válidas | Incidente §1; `catalog_test.go` |
| `catalog` | `catalog/catalog.go:58+`, `ids.go` | IDs estables append-only; señales *declaradas pero no producidas* | `LedgerExistingUnproduced` ×3 (`catalog.go:65,69,73`) |
| `driver` (contratos) | `driver/state.go:55-79`, `descriptor.go:21-24` | Ciclo de vida explícito; capabilities de runtime ≠ compiladas | `CanTransitionTo` como grafo cerrado |
| `drivers/lmu` fusion | `drivers/lmu/fusion.go:31-69` | SM vs REST por **campo**, con TTL y preferencia declarada | 37 reglas; `MatrixVersion` versionada |
| `drivers/lmu` layout | `drivers/lmu/layout.go:199+` | Offsets binarios como contrato auditable | `admittedFields()` = superficie explícita |
| BatchMapper | `batch_mapper.go:58-60` | Identidad canónica que **sobrevive a reconexiones del driver** | §5 |
| Reducer | `core/reducer.go:200-267` | Orden, epoch/sequence, identidad, unicidad de vehículo | 9 errores tipados `:23-34` |
| SessionCoordinator | `core/session_coordinator.go` | Hechos discretos ordenados (vuelta, pit, driver change) | §6 |
| derive | `derive/pipeline.go:82-113` | Derivaciones deterministas, ordenadas, versionadas | `ValidateDefinitions` detecta ciclos `:170-180` |
| projection/* | `projection/*/v1.go` | Contrato por producto, versionado independiente | §7 |
| `telemetrytransport.Hub` | `internal/app/telemetrytransport/transport.go:159` | latest-wins acotado, sin goroutines, status contiguo | §8 |

### 2.a La matriz de autoridad no es ceremonia: es la forma del problema

`drivers/lmu/fusion.go:22-29` declara por señal: preferido, alternativo, si son
equivalentes, y **dos TTL distintos**. LMU expone las mismas magnitudes por dos caminos con
frecuencias y latencias distintas (SM ~60 Hz, REST 250 ms). Elegir "el más reciente" es
incorrecto: `SignalStandingsPosition` prefiere SM pero acepta REST
(`fusion.go:41`), mientras `SignalPitInPit` **solo** admite SM (`fusion.go:42`,
`Alternative: SourceUnknown`).

Y hay una regla de envejecimiento en cascada que ningún diseño plano expresa —
`fusion.go:207`:
```go
forceStale := fieldAt(elapsed, updated, defaultFreshnessLimit, sourceTime).Freshness() == schema.FreshnessStale
```
Si el reloj de la sesión está stale, **toda la parrilla se marca stale**, campo por campo
(`:209-233`). Sin `Freshness` por campo eso es imposible de expresar; con escalares desnudos
el overlay seguiría pintando posiciones congeladas como si fueran vivas.

---

## 3. Determinismo y paridad de replay: la garantía que desaparecería

`recording/replay/canonical_integration_test.go:42-70` es la prueba más valiosa del
repositorio. Reproduce una sesión canónica **por los cuatro productos a la vez** (overlay,
engineer, strategy, analysis — imports `:18-21`), en dos modos de pacing, y compara
digests SHA-256:

```go
if stepDigest != timedDigest {
	t.Fatalf("digest differs by pacing: step=%s timed=%s", stepDigest, timedDigest)
}
```

Esto demuestra una propiedad fuerte: **el resultado no depende del ritmo de llegada**. Es
consecuencia directa de que ninguna capa del núcleo lea el reloj del sistema: el Reducer no
hace I/O ni lanza goroutines (`reducer.go:96-97`), el Pipeline tampoco
(`pipeline.go:243-244`), y el Fanout *"does not read a clock in the hot path"*
(`fanout.go:56-58`). El tiempo entra como dato (`schema.NewClock`, `batch_mapper.go:234`).

Añádase el trazado sobre captura real: `derive/testdata/lmu-1.4-self-delta-trace-v1.jsonl`
contiene **1.846 muestras reales de LMU 1.4** consumidas por
`TestSelfDeltaRealLMUTraceMatchesMeasuredSameDistanceSign`
(`derive/delta_test.go:356`). No es un mock: es el simulador.

Y tres tests que solo existen porque el simulador real se comporta mal:

| Test (`derive/delta_test.go`) | Rareza de LMU que cubre |
|---|---|
| `:284` `...AcceptsBoundedLMULapNumberDistanceResetSkew` | `lapNumber` y `lapDistance` no resetean en el mismo frame |
| `:306` `...DistanceResetBeforeLapNumber` | …y a veces en el orden inverso |
| `:342` `...IgnoresIdenticalRepeatedLMUFrames` | SM republica frames idénticos |

**Esto es exactamente "soportar diferencias reales entre sims".** Un `Telemetry Engine`
monolítico tendría que albergar la misma casuística, pero sin una frontera donde aislarla
por simulador: cada rareza de LMU quedaría mezclada con las de iRacing.

---

## 4. Mantenibilidad por agentes LLM: las reglas son ejecutables

Este es el argumento decisivo dada la prioridad declarada del producto.

`internal/telemetry/architecture_test.go` (578 líneas) **parsea el AST de todo el árbol** y
falla el build si un import cruza una frontera. No es documentación: es un test.

- `:243-298` `scanProductionImports` — recorre `internal/telemetry`, ignora `_test.go`,
  ficheros generados y `tools/`, y valida cada arista.
- `:361-487` `validateImport` — reglas explícitas. Ejemplos verificados:
  - `schema` no puede importar `reflect` (`:402-404`) ni nada de terceros (`:405-407`).
  - `core` **no puede importar `catalog`** (`:133`) — el catálogo queda fuera del hot path
    por construcción.
  - un driver concreto **no puede importar otro simulador** (`:130`) ni una projection (`:129`).
  - una projection no puede importar otro producto (`:141-142`).
  - `database/sql` y `modernc.org/sqlite` solo dentro de `recording/sqlite` (`:392-399`).
  - DuckDB y Wails **prohibidos en todo `internal/telemetry`** (`:383-391`).
- `:42-61` `TestHarnessOnlyReplayIsNotImportedByProductionAnywhere` — escanea **el repo
  entero**, incluidos ficheros generados (`:210-241`), para garantizar que el replay nunca
  entra en producción.
- `:63-98` prohíbe por *substring* que los seis ficheros del camino vivo mencionen
  `BuildSyntheticBuffer`, `createMockSource` o paquetes de producto/transporte.

Para un agente LLM esto vale más que cualquier `CLAUDE.md`: **la regla se comprueba sola y
el error dice qué frontera se cruzó y en qué línea** (`:291`
`fmt.Sprintf("%s:%d: %v", relFile, line, err)`). Un agente que intente el atajo obvio
("importo el driver desde la projection y ya") recibe un fallo determinista con la
explicación. Ninguna arquitectura monolítica puede ofrecer esto, porque no hay fronteras que
comprobar.

Complemento: las derivaciones se validan como grafo. `derive/pipeline.go:132-182`
`ValidateDefinitions` rechaza IDs duplicados, órdenes no contiguos, **múltiples productores
del mismo output** (`:159-161`) y **ciclos** (`:176-178`: un input `derived.*` debe tener
productor con `Order` estrictamente menor). Añadir una derivación mal ordenada no compila
conceptualmente: falla el test.

---

## 5. ¿Es necesario el BatchMapper? Sí, y es la respuesta a la reconexión

`batch_mapper.go:58-60` lo declara:

> *"deliberately separate from Driver instances so a transient driver reconnect cannot reset
> event, session, cursor, or source-slot generations."*

El `Driver` es transitorio (se recrea al reconectar); la identidad canónica no puede serlo.
Si el mapper viviera dentro del driver, cada reconexión reiniciaría `epoch` y `sequence`, y
el Reducer rechazaría el primer batch posterior con `ErrStaleBatch`
(`reducer.go:228-230`) — o peor, aceptaría un epoch 1 nuevo y todos los consumidores
tirarían su estado como si hubiera cambiado la sesión.

Además resuelve un peligro **multi-simulador genuino**: la reutilización de slots.
`batch_mapper.go:189-196`:
```go
generation := state.generations[source.SourceID] + 1
mapped = mappedSlot{ vehicleID: vehicleID(source.SourceID, generation) }
```
LMU reutiliza el índice de `VehicleScoring`. Sin generaciones, el coche que entra en el slot
7 heredaría la historia del que salió: sus vueltas completadas, su high-water de pits, su
delta. Con generaciones, `slot7#1` y `slot7#2` son identidades distintas y el
SessionCoordinator no puede confundirlas. **Todo sim con parrilla por slots (iRacing,
rFactor, ACC) tiene este problema.**

Y el commit es transaccional (`batch_mapper.go:140-150`): se clona el estado, se mapea, se
escribe al sink, y **solo si el sink acepta** se promueve `mapper.state = candidate`. Un
fallo aguas abajo no deja identidad huérfana.

**Frontera de commit — respuesta.** Está bien colocada y es consistente en cinco sitios:
mapper (`:149`), reducer (`reducer.go:137-139`, tras validar), coordinator
(`session_coordinator.go:166-171`: publica los facts **antes** de promover el estado, de
modo que un fallo de escritura no pierde el hecho), pipeline (`pipeline.go:292-295`) y hub
(`transport.go:399`). El invariante es uniforme: **validar → producir salida → promover
estado**, nunca al revés.

---

## 6. ¿Reducer single-writer necesario? Sí — y el Coordinator más aún

El Reducer aporta lo que ningún `FinalState` plano da gratis:

| Invariante | Línea | Por qué importa |
|---|---|---|
| Primer batch debe ser epoch≠0, sequence=1 | `reducer.go:222-226` | No hay estado "medio inicializado" |
| Rechazo de duplicado/desorden | `:228-230` | SM republica frames (§3) |
| Gap de sequence detectado, no silenciado | `:231-235` | Un salto es un error, no un dato |
| Epoch solo +1 y reinicia en sequence 1 | `:237-243` | Los consumidores pueden confiar en el reset |
| Identidad no cambia sin nuevo epoch | `:207-217` | Un cambio de sesión no puede colarse |
| `VehicleCount` debe cuadrar con la parrilla | `:247-251` | Detecta parseos truncados |
| Vehículo duplicado / ID vacío | `:252-265` | Detecta corrupción de slots |

El detalle que revela madurez está en `:212-216`: perder al jugador activo **no** es sesión
nueva ni epoch nuevo (se limpia el vehículo para que nadie trate una fila stale como el
jugador), pero **asignar otro vehículo no vacío sí exige epoch nuevo**. Esa distinción es
producto de haber vivido el caso.

El **SessionCoordinator** es aún menos prescindible, porque los hechos discretos no se pueden
reconstruir desde snapshots latest-wins. Dos ejemplos:

- **High-water de vueltas**, `session_coordinator.go:322-325`:
  ```go
  // A same-session source regression cannot revoke an
  // already emitted fact. Preserve the high-water mark.
  current.completedLaps = previous.completedLaps
  ```
  Si LMU regresa el contador, un hecho "vuelta 12 completada" ya emitido **no se revoca**. Un
  motor latest-wins sin memoria de hechos emitiría "vuelta 11" otra vez.
- **Presencia continua para pits**, `:309` + `:348`: `FactPitEntered/Exited` solo se emite si
  `previous.lastSeen == previousHeader.Cursor`. Un coche que reaparece tras desaparecer de la
  parrilla no genera un pit-in falso.

Y el fallo es *fail-closed*: `:166-171` — si el sink de facts rechaza, `coordinator.state`
**no se promueve**, así que un reintento del mismo snapshot reproduce exactamente los mismos
hechos. Es la propiedad que hace posible reintentar sin duplicar.

### ¿Qué debe significar `epoch`? — respuesta

Hoy significa, según `batch_mapper.go:168-172` y `:204-211`, exactamente esto:

> **Epoch = "tira tu estado derivado; la continuidad temporal o de identidad se rompió."**

Avanza en tres casos y solo tres: (a) frontera de sesión (`ClockReset` o cambio de
track/tipo), (b) `ClockWrap` del reloj de fuente, (c) **cambio del vehículo del jugador**.

Es la definición correcta y debe conservarse, porque es la única que hace seguras las
derivaciones con historia: `pipeline.go:397-402` `mustReset` y
`delta.go` (`applySelf`, primera línea) la usan para descartar la vuelta de referencia. Si
`epoch` significara "reconexión" o "cambio de driver", el delta se resetearía en cada
microcorte de shared memory. El diseño lo dice explícitamente en
`session_coordinator.go:176-177`: *"Brief disconnect/recovery never changes epoch or session
identity."*

---

## 7. Projections por producto: la prueba de que Engineer necesita otra semántica

Este es el punto donde un `OverlayFrame` único falla, y se demuestra con código.

`projection/engineer/boundary.go:36-52`:
```go
// Boundary describes the state that consumers must discard before processing
// the next projection. Driver/team swaps cancel pending decisions even when
// Telemetry Core legitimately keeps the same run epoch.
```
`ClassifyBoundary` (`:56-94`) devuelve `BoundaryDriverChanged` / `BoundaryTeamChanged`
**dentro del mismo epoch** (`:72-77`), sin error, y `CancelsPending()` es `true` (`:50-52`).

Traducido al dominio: en Le Mans hay **cambios de piloto**. Cuando el piloto cambia, una
decisión pendiente del Engineer ("entra en boxes en 2 vueltas") debe cancelarse — pero para
el Overlay no ha pasado nada: mismo coche, misma sesión, mismo epoch, el widget de standings
no debe parpadear.

**Una sola proyección no puede servir a ambos**: o bien fuerza un epoch (y el Overlay tira su
historia sin motivo), o bien no lo señala (y el Engineer ejecuta una orden dirigida al piloto
anterior). La frontera por producto no es simetría de diseño: es un requisito de corrección
de un producto que el otro no comparte.

Segundo argumento, cuantitativo — **la proyección es una reducción, no una copia**:

| Estado | Muestras | Referencia |
|---|---|---|
| Historia privada de interpolación del delta | **18.000** (30 min a 10 Hz) | `derive/delta.go:16-19` `MaxSelfDeltaSamples` |
| Historia expuesta al consumidor | **120** | `delta.go:20-21` `MaxSelfDeltaHistory` |

`delta.go:27-28`: *"The private interpolation samples used to build the reference lap are
never exposed."* Un diseño "un `FinalState` → un store frontend" tiene que elegir entre
enviar 18.000 muestras por frame o perder la vuelta de referencia. La projection es el único
sitio donde esa decisión tiene nombre.

Tercer argumento: `capabilities` calculadas del contenido real
(`projection/overlay/v1.go:269-291`). El frontend no pregunta "¿qué sim es?", pregunta "¿hay
capability `controls.history`?". Eso es negociación multi-sim en el contrato, no en el
widget.

Coste real de las cuatro projections: overlay 316 líneas, engineer 385, strategy 161,
analysis 132. **994 líneas para cuatro contratos versionados independientes.** Es barato.

### Versionado de contratos
`projection/contracts.go:16-33` — `VersionPolicy{Current, MinimumSupported}` con `Validate`
y `Deprecated`. `Metadata` (`:37-43`) versiona **el input canónico y la projection por
separado**: `CanonicalVersion` + `ProjectionVersion`. Eso permite evolucionar el núcleo sin
romper un overlay desplegado en OBS, y viceversa. En una arquitectura de un solo frame
tipado esa distinción desaparece y toda evolución es *breaking*.

---

## 8. Transporte: lo que sí está bien resuelto

`telemetrytransport.Hub` (`transport.go:159`) es pequeño y correcto:
- *"bounded and starts no goroutines"* (`:158`); el dueño de la composición decide dónde
  corre (`adapters.go:39-40`).
- Snapshots **latest-wins** (`:399`), notificación no bloqueante (`:727-732`, `select` con
  `default`). Un suscriptor lento nunca frena al publicador.
- **Status con revisión estrictamente contigua** (`:325-328`), no latest-wins. Y el snapshot
  debe referenciar la revisión vigente (`:363-366`), si no se rechaza.

**¿Es necesaria la status revision?** Sí, y hay un incidente que lo prueba.
`transport.go:525-530` documenta el bug que arregla `ReplayStatus`:

> *"El resultado era un widget en blanco."*

Un overlay que se abre a mitad de sesión no había recibido nunca un status, y sin status el
Hub no le entrega snapshot (`:425-427`). El replay bajo demanda lo cura; el frontend lo
dispara desde `overlay/CompositeApp.tsx:51` y `hub/overlay-studio/StudioRoute.tsx:384`. El
acoplamiento snapshot↔revisión también evita el estado mixto "datos nuevos, estado de
conexión viejo" (`:334-336` invalida el snapshot pendiente desincronizado).

Y una defensa de privacidad que merece mención: `transport.go:697` `forbiddenPayloadKey`
rechaza claves `raw`, `source`, `clock`, `observed`, `derived`, `finalstate`,
`canonicalversion` en **cualquier** payload de los cuatro productos. Es un cortafuegos
estructural contra filtrar estado interno al cable.

---

## 9. Rendimiento: medido, no argumentado

Benchmarks ejecutados en este repo (Ryzen 7 3700X, `-benchtime 200x`; direccional, no
riguroso):

| Etapa | ns/op | B/op | allocs/op |
|---|---|---|---|
| `ParseObjectOut44Vehicles` | 33.417 (**9,7 GB/s**) | 29.574 | 155 |
| `Fusion` | 3.456 | 656 | 6 |
| `ReducerApply64Vehicles` | 19.988 | 85.416 | 5 |
| `SessionCoordinatorApply64Vehicles` | 24.020 | 62.749 | 9 |
| `PipelineApply64Vehicles` | 34.268 | 223.262 | 12 |
| `FanoutPublishSnapshot64Vehicles` | 12.912 | 40.986 | 1 |
| `SelfDeltaTracker` | 5.108 | 9.812 | 2 |
| `GapDerivation44Vehicles` | 5.190 | 1.808 | 1 |
| **Cadena completa, parrilla de 64** | **≈128 µs** | ≈450 KB | ≈190 |

Presupuesto a 60 Hz: **16.667 µs**. La cadena canónica íntegra —parseo binario, fusión,
reducción, hechos, derivación y publicación— consume **≈0,8 % de un core**.

**Esto liquida el argumento de que las capas cuestan rendimiento.** Lo que cuesta es el
parseo (26 % del total) y sería idéntico en cualquier arquitectura. Las capas "de ceremonia"
(reducer + coordinator + fanout) suman 57 µs: 0,34 % del presupuesto.

El punto débil honesto es la **asignación**: ~450 KB/frame × 60 Hz ≈ 27 MB/s de churn, por
el clonado defensivo (`cloneObservedState`, `cloneFinal`, `clonePayload`). Es el precio de
"snapshots que poseen todas sus colecciones mutables" (`reducer.go:96-97`) y es lo que hace
seguro el fan-out sin copias en el consumidor. Go lo absorbe, pero es la partida optimizable
si algún día aprieta — y se optimiza **sin tocar fronteras** (pooling en `derive`).

Sobre "adquisición a 60 Hz sin transportar todo a 60 Hz": la preocupación es legítima pero ya
está resuelta aguas abajo, no en el núcleo. El frontend hace fan-out por buckets de Hz
(`telemetry-rate-coordinator.ts:28-46`) con propagación inmediata solo para estados urgentes
(`:48-50`).

---

## 10. Los cinco casos de amplificación de cambio

Baseline empírico: el diff **[LOCAL]** del delta nativo de LMU es un caso real y completo
de "añadir una señal de simulador con derivación". Recuento verificado:

| Fichero | Naturaleza del cambio | Líneas |
|---|---|---|
| `catalog/ids.go` | +2 constantes | 2 |
| `catalog/catalog.go` | +2 definiciones declarativas | 2 |
| `drivers/lmu/layout.go` | struct + offset + `admittedFields` | 3 |
| `drivers/lmu/format.go` | struct + parseo con validez | 15 |
| `drivers/lmu/fusion.go` | `MatrixVersion` 4→5, regla, aging, decision | 7 |
| `drivers/lmu/batch_mapper.go` | 1 asignación | 1 |
| `core/reducer.go` | 1 campo | 1 |
| `derive/delta.go` | **lógica real** (tracker de previous-lap) | 109 |
| `projection/overlay/v1.go` | 3 campos + mapeo | ~20 |
| **Subtotal Go productivo** | | **≈160, de las cuales 124 son lógica irreducible** |
| `frontend` v1.ts + adapter.ts + snapshot.ts | **re-tipado puro, 3 saltos** | 47 |
| `frontend` delta-definition + view-model | lógica de presentación | 54 |
| i18n ×4 locales | traducciones | 16 |
| Goldens + tests | | ~250 |

**Lectura honesta:** el backend se comporta bien (36 líneas declarativas + 124 de lógica
inevitable). **El frontend es donde está la amplificación real**: tres saltos de re-tipado
(`overlay-projection-v1.ts` → `overlay-projection-adapter.ts` → `telemetry-snapshot.ts`)
para transportar un `number`.

| # | Caso | Veredicto | Evidencia / coste |
|---|---|---|---|
| 1 | **Steering angle universal** | **Bien** | No existe hoy (`grep -i steering internal/telemetry` → 0). Sigue la plantilla: ~36 líneas declarativas Go + offset en `layout.go:199+`. **Cero lógica derivada**: es un escalar observado. El impuesto es el frontend (3 saltos + adapter). |
| 2 | **Brake bias opcional (algunos sims)** | **Muy bien — es el caso para el que se diseñó** | `catalog.go:65,69,73` ya tiene tres señales `LedgerExistingUnproduced` ("Existing contract; not produced by ISA-129"). Un sim sin brake bias simplemente no la produce → `MissingField` → `capabilities` no la anuncia (`overlay/v1.go:269-291`) → el widget se oculta. **Sin `if simulator == …` en ningún sitio.** |
| 3 | **Delta nativo LMU específico** | **Aceptable, con impuesto frontend** | Ver tabla arriba. El backend aisló bien lo específico de LMU (la heurística del cero ambiguo vive en `format.go:359-370`, dentro del driver) y dejó lo canónico en `derive`. Es exactamente la separación prometida. |
| 4 | **Widget nuevo Speed+RPM+Gear** | **Excelente — coste cero de backend** | Las tres ya están en `projection/overlay/v1.go:65-68` y en `capabilities` como `CapabilityControls` (`:278-282`). Solo se añade un `widget-type` en el frontend. |
| 5 | **Sim nuevo sin spatial/weather/delta nativo** | **Bien en diseño, no probado** | `architecture_test.go:130` prohíbe que un driver importe otro. `driver.Descriptor` + `RuntimeSnapshot` (`descriptor.go:12-24`) separan capabilities compiladas de disponibles. Ausencia = `MissingField` = capability no anunciada. **Riesgo real:** ningún segundo driver existe todavía; el diseño es correcto pero la prueba está pendiente. |

**Conclusión de los cinco casos:** la arquitectura *Go* soporta bien la amplificación de
cambio. El impuesto medible y repetible está en la cadena frontend, no en las capas del
núcleo — que es precisamente lo que la §11 propone amputar.

---

## 11. Lo que NO puedo defender

Un defensa que no concede no es creíble. Esto es peso muerto verificado.

| Elemento | Estado verificado | Líneas |
|---|---|---|
| **`core.Fanout`** | `grep NewFanout` → **cero llamadores no-test**. Superseded por `telemetrytransport.Hub`. Tiene retención de facts y resync (`fanout.go:87-93`) que el Hub *no* tiene, así que ni siquiera es un duplicado limpio. | 572 + 961 test |
| **RFC 7396** | `merge_patch.go` + rama `transport.go:378-394` + TS `merge-patch.ts` + `store.ts:166`. Los **dos** `PublishSnapshot` productivos pasan `nil` (`telemetry_core_runtime.go:789,793`). `DeltasRetained` nunca incrementa. | ~180 |
| **Seal SHA-256** | `transport.go:85` `seal [sha256.Size]byte` es **campo no exportado y sin tag JSON** → nunca se serializa. `grep seal frontend/src` → 0. Es un guard in-process contra construir envelopes por struct literal, **no** integridad de transporte. Defendible como lo primero, indefendible como lo segundo. | ~40 |
| **`recording.Coordinator` + SQLite** | `grep NewCoordinator` → solo tests. **No hay grabación en el binario.** El diseño asíncrono (`coordinator.go:67` cola acotada, `TryAccept` no bloqueante) es correcto… y no se ejecuta. | ~1.700 |
| **`StrategyLiveRuntime`** | 0 instanciaciones fuera de tests. `strategyHub` publica y `ServeWails` emite `telemetry:strategy:projection`… **y nadie escucha**. El Strategy Planner real (`StrategyPlannerPage.tsx`) no importa `telemetry-transport` en absoluto. | ~400 |
| **`projection/analysis`** | `NewAnalysisFull` (`transport.go:219`) sin llamadores. `internal/telemetryanalysis` + DuckDB: **isla sin importadores externos**. | ~35 ficheros |
| **`Metrics()`** | `TelemetryCoreRuntime.Metrics()` y `HubMetrics` sin llamadores productivos. Contadores que se incrementan y nadie lee. | — |
| **Aislamiento roto** | `telemetry_core_runtime.go:668` → `failStop(err)` **cancela todo el runtime y cierra los hubs** (`:846-865`) si falla la projection o la publicación de **Strategy**. Un producto sin consumidores puede matar al Overlay. Engineer sí está aislado (`:711-718`, error registrado y contado). **Es una inconsistencia, no un principio.** |
| **Frontend: la deuda real** | `overlay-projection-adapter.ts` (640 líneas) computa `freshness`/`provenance` y los **descarta**: `:583-587` `fieldIsUsable` colapsa cuatro estados a un booleano. `fresh` y `stale` son indistinguibles para todo widget. | 640 |
| **Frontend: lógica de dominio en TS** | ~1.500 líneas recalculando lo que Go ya tiene: líder de clase (`standings-view-model.ts:180-188`), gaps (`standings-formatting.ts:91-111`), ventanas relativas (`relative-row-selection.ts:9-50`), proyección de combustible (`fuel-strategy-view-model.ts:23-35`), media móvil de tendencia (`delta-trace-view-model.ts:5-6`), detección de cruce de vuelta (`derived-telemetry-store.ts:110-129`). **Contradice frontalmente la intención declarada.** |
| **Frontend: histórico autoritativo tirado** | `telemetry-rate-coordinator.ts:108-117` **sobrescribe entero** `derived.deltaHistory` con el acumulado en TS. La historia que Go calcula, versiona y acota nunca llega a un widget. Y hay **dos** acumuladores independientes (`derived-telemetry-store.ts` y `input-telemetry-accumulator.ts`, este con `Map` global de módulo). |
| **`telemetry-store.ts`** | 44 líneas, 0 consumidores fuera de su test; además clona en cada `getSnapshot()` (`:25`), lo que rompería la igualdad referencial de `useSyncExternalStore`. |

**Total amputable sin tocar una frontera: ≈3.500 líneas de Go + ~700 de TS.**

Nótese `architecture_test.go` es el único fichero que importa a la vez `recording`,
`diagnostics`, `projection/analysis` y `telemetryanalysis`: el guardián de fronteras es lo
único que mantiene vivo (a ojos del compilador) todo lo desconectado.

---

## 12. Respuestas directas a las preguntas clave

| Pregunta | Respuesta | Fundamento |
|---|---|---|
| **¿Reducer single-writer necesario?** | **Sí.** Es el único punto donde orden, epoch, identidad y consistencia de parrilla se validan de una vez y de forma reintentable. | `reducer.go:200-267`, 9 errores tipados |
| **¿BatchMapper necesario?** | **Sí, y separado del Driver.** Es el dueño de identidad que sobrevive a reconexiones, y las generaciones de slot evitan alias entre coches. | `batch_mapper.go:58-60`, `:189-196` |
| **¿Qué debe significar `epoch`?** | *"Descarta tu estado derivado."* Solo tres causas: frontera de sesión, wrap de reloj, cambio de vehículo del jugador. **No** reconexión, **no** cambio de piloto. | `batch_mapper.go:168-172`, `session_coordinator.go:176-177` |
| **¿Frontera de commit?** | Correcta y uniforme: validar → emitir salida → promover estado. Cinco capas la respetan. | `:149`, `reducer.go:137`, `session_coordinator.go:166-171`, `pipeline.go:292`, `transport.go:399` |
| **¿Status stream/revision?** | **Sí, necesarios.** Curan un bug real (widget en blanco al abrir a media sesión) e impiden el estado mixto datos-nuevos/conexión-vieja. | `transport.go:525-530`, `:334-336`, `:363-366` |
| **¿Seal?** | **Sí como guard in-process, no como integridad de transporte.** Hoy se vende como lo segundo y no lo es: no se serializa. Renombrar o exportar. | `transport.go:85` |
| **¿RFC 7396?** | **No.** Borrar de Go y de TS. Se paga complejidad por una optimización que nadie activa y cuyo beneficio (payloads de ~40 KB a 60 Hz en loopback) no está demostrado. | `telemetry_core_runtime.go:789,793` |
| **¿Dos fanouts?** | **No.** `telemetrytransport.Hub` ganó. Borrar `core.Fanout` — pero **rescatar antes** su retención de facts con resync explícito (`fanout.go:87-100`), que el Hub no tiene y que Engineer necesitará. | §11 |
| **¿Strategy projection/hub productivos ahora?** | **La projection sí (161 líneas, barata, congela el contrato). El hub no.** Publicar a cero suscriptores no es preparación: es un fallo que puede matar el Overlay vía `failStop`. | `strategy/v1.go`, `telemetry_core_runtime.go:668` |
| **¿Analysis por snapshots JSON o columnar?** | **Columnar, sin discusión.** Un stream JSON latest-wins es el transporte equivocado para análisis post-sesión: pierde muestras por diseño. `projection/analysis` (132 líneas) sirve como *live preview*, no como fuente de análisis. | `analysis/v1.go:1-2` ya lo dice: *"Historical files and recording formats remain separate concerns"* |
| **¿SQLite recording y DuckDB analysis distintos?** | **Sí, correcto.** Cargas opuestas: SQLite para escritura secuencial durante la sesión (append, baja latencia, un escritor); DuckDB para lectura analítica columnar después. `architecture_test.go:162-170` ya prohíbe ambos fuera de su adaptador. El error no es tener dos: es que **ninguno de los dos está conectado**. | `architecture_test.go:392-399`, `:168-170` |

---

## 13. ¿Es la complejidad proporcional al alcance a 6 meses / 2 años?

**A 6 meses (segundo simulador, Engineer en producción): sí, y con margen.**
La inversión ya hecha —contratos neutrales de driver, matriz de autoridad por campo, catálogo
append-only con señales no producidas, guardias de import— es exactamente lo que se necesita
para meter iRacing sin tocar LMU. Nada de eso se puede "añadir después" barato: son fronteras,
y las fronteras se ponen al principio o no se ponen.

**A 2 años (Strategy Planner real, Analysis, replay): condicionalmente sí**, pero solo si el
andamiaje se borra ahora y se reintroduce cuando exista el consumidor. Mantener `Fanout`,
`recording`, `analysis` y `StrategyLiveRuntime` conectados a nada durante dos años tiene un
coste que un equipo de agentes LLM paga cada sesión: son ~3.500 líneas que parecen el camino
vivo y no lo son. **Un agente que lea `core.Fanout` concluirá razonablemente que es el
transporte del producto.** Ese es el daño real del código muerto en este proyecto concreto,
por encima del coste de mantenimiento.

---

## Puntuación honesta

| Criterio | Peso | Nota | Puntos | Razón |
|---|---|---|---|---|
| Corrección semántica / fiabilidad | 20 | 7,5 | **15,0** | Backend sobresaliente (`Field[T]` hace inexpresable el bug de §1; reducer y coordinator con invariantes fuertes). Penalizado porque el último kilómetro lo destruye: `fieldIsUsable` colapsa freshness a booleano y el `deltaHistory` autoritativo se sobrescribe en TS. |
| Extensibilidad multi-simulador | 18 | 7,8 | **14,0** | `driver.Descriptor`/`Capability`, matriz de autoridad versionada, catálogo con `LedgerExistingUnproduced`, guardias de import que prohíben acoplar drivers. Diseño correcto y explícitamente pensado para iRacing (`format.go:361`). Descontado por no estar probado con un segundo driver. |
| Mantenibilidad por agentes LLM | 18 | 7,2 | **13,0** | `architecture_test.go` es un activo excepcional: las reglas son ejecutables y el error señala línea y frontera. Fuertemente descontado por ~3.500 líneas de andamiaje que un agente confundirá con el camino vivo, y por la cadena de 3 saltos del frontend. |
| Rendimiento | 15 | 8,7 | **13,0** | ≈128 µs/frame a 64 coches = 0,8 % del presupuesto a 60 Hz; parseo a 9,7 GB/s. Descontado por ~27 MB/s de churn de asignación por clonado defensivo. |
| Facilidad de añadir widgets/señales | 10 | 5,0 | **5,0** | Widget nuevo sobre señales existentes: coste cero de backend (caso 4). Señal nueva: 36 líneas declarativas en Go —aceptable— pero **tres saltos de re-tipado en TS** más 4 locales i18n. El impuesto es real y repetible. |
| Testabilidad / observabilidad | 8 | 7,5 | **6,0** | 453 tests, ratio 1,28:1, goldens, paridad de replay por digest en dos pacings, trazas reales de LMU (1.846 muestras), 19 benchmarks. Observabilidad floja: `Metrics()` sin lectores, `log.Printf` en cada suscripción (`transport.go:436`). |
| Coste / riesgo de migración | 6 | 8,3 | **5,0** | El núcleo está terminado y verde. Sustituirlo tira trabajo probado y reintroduce clases de bug ya cerradas. La limpieza propuesta es `git rm` de bajo riesgo, no una migración. |
| Preparación futura | 5 | 6,0 | **3,0** | La frontera de Engineer (§7) es genuinamente previsora y correcta. Strategy/Analysis/recording son especulación no conectada, que es *deuda* disfrazada de preparación. |
| **TOTAL** | **100** | | **74,0** | |

**74/100.** La arquitectura *diseñada* puntúa cerca de 88; la arquitectura *cableada* pierde
14 puntos en andamiaje muerto y en un frontend que ha derivado de la intención declarada.
Es una diferencia recuperable sin rediseño.

---

## Concesiones — lo que sí cambiaría

**Borrar ya (≈3.500 líneas Go + ~700 TS, cero cambios de frontera):**
1. `core.Fanout` completo — **rescatando antes** `FactResyncRequiredError` y la retención
   acotada de facts (`fanout.go:87-100`, `:314-321`) hacia el Hub, porque Engineer los
   necesitará y el Hub hoy no los tiene.
2. RFC 7396 en Go y TS (`merge_patch.go`, `transport.go:378-394`, `merge-patch.ts`,
   `store.ts:158-172`). Reintroducir solo con una medición que lo justifique.
3. `StrategyLiveRuntime` + `internal/strategy/live`, y **dejar de publicar al `strategyHub`**
   hasta que exista un suscriptor. Conservar `projection/strategy` (161 líneas) para congelar
   el contrato.
4. `NewAnalysisFull` y el import de `projection/analysis` en el transporte. Conservar el
   paquete de projection.
5. `frontend/src/overlay/core/telemetry-store.ts` (muerto, y con `getSnapshot` clonante).

**Arreglar (correcciones, no rediseño):**
6. **`failStop` selectivo.** Un fallo de Strategy no puede cancelar el runtime del Overlay.
   Aplicar a Overlay/Strategy el mismo aislamiento que ya tiene Engineer
   (`telemetry_core_runtime.go:711-718`). Es un bug de aislamiento, no una decisión.
7. **Renombrar el seal** a lo que es (`integrityGuard` in-process) o exportarlo y verificarlo
   en el cliente. Hoy la documentación promete integridad de transporte que el código no da.
8. **Unificar los dos acumuladores de histórico del frontend** y **dejar de sobrescribir**
   `derived.deltaHistory` (`telemetry-rate-coordinator.ts:108-117`): consumir el de Go, que
   ya está acotado, versionado y probado contra traza real.
9. **Propagar `freshness` al widget.** `fieldIsUsable` (`overlay-projection-adapter.ts:583-587`)
   debe distinguir `fresh` de `stale`: un dato stale debe poder pintarse atenuado, no como
   vivo. Es la razón de ser de toda la capa `schema/quality.go` y hoy se tira en la última
   línea.
10. **Repatriar a Go la lógica de dominio del frontend** por orden de riesgo: gaps y líder de
    clase (`standings-formatting.ts:91-111`, `standings-view-model.ts:180-188`), selección de
    filas relativas (`relative-row-selection.ts:9-50`), proyección de combustible
    (`fuel-strategy-view-model.ts:23-35`), detección de cruce de vuelta
    (`derived-telemetry-store.ts:110-129`). Son ~1.500 líneas de aritmética de carrera en el
    lenguaje sin tests de traza real.
11. **Colapsar un salto del frontend.** `overlay-projection-v1.ts` → `adapter` →
    `telemetry-snapshot.ts` son tres re-tipados; el `TelemetrySnapshot` legacy —con
    `scoring: Record<string, unknown>[]` sin tipar (`telemetry-snapshot.ts:39`), que obliga a
    `scoring-readers.ts`— debe retirarse. Es el impuesto medido en los cinco casos.

**Conservar sin tocar (lo que la alternativa querría quitar y no debe):**
`schema.Field[T]` y su triple cualidad; el Reducer y sus invariantes; el SessionCoordinator y
sus facts ordenados con high-water; el BatchMapper separado del Driver con generaciones de
slot; la matriz de autoridad por campo con TTL; las cuatro projections por producto —muy en
especial `engineer/boundary.go`, que codifica un requisito de corrección que ningún frame
único puede expresar—; el versionado independiente canónico/projection; y por encima de todo
`architecture_test.go`, que es el mecanismo que hace este repositorio mantenible por agentes.
