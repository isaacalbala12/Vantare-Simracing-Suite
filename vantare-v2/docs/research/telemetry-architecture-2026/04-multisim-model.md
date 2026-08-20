# 04 — Modelo multi-simulador

**Agente C — Experto en normalización multi-simulador.**
Fecha: 2026-08-19. Rama `vantareapp/isa-338-retirar-los-ultimos-confirm-nativos`, HEAD `08e316c1`, working tree sucio (diff local DELTA no committeado).
Método: lectura directa del código en `internal/telemetry/**` y `frontend/src/overlay/**`; APIs externas verificadas con fuentes públicas citadas. Toda ruta es relativa a `vantare-v2/` salvo indicación.

---

## 0. Veredicto en una página

| Pregunta | Respuesta corta |
|---|---|
| ¿Debe existir un modelo canónico interno? | **Sí, y ya existe.** `core.ObservedState` + `schema/*` + `catalog` es un modelo canónico real, no un passthrough. Es el activo más valioso del sistema y hay que conservarlo. |
| ¿MCD o superset? | **Ni uno ni otro: núcleo universal + módulos por capability.** El MCD amputa LMU/ACC; el superset convierte cada `Field` ausente en ruido permanente. |
| ¿Structs, catálogo o ambos? | **Ambos, con roles distintos**: structs tipados = runtime (hot path); catálogo = metadatos (id estable, unidad, rango, dominio). Es lo que ya hace Vantare y es correcto. Nunca `map[string]any` en Go. |
| ¿Está el Core sesgado a LMU? | **Parcialmente, y de forma corregible.** 9 fugas concretas identificadas (§1.3). Ninguna es estructural; todas son constantes, comentarios o rangos "demostrados con LMU". |
| ¿Dónde está el problema real? | **No en Go: en la frontera Go→TS.** El adaptador del frontend *destruye* el contrato tipado y lo convierte en `Record<string, unknown>` con nombres heredados de rFactor2 (`place`, `inPits`). Ahí es donde un segundo simulador rompe widgets. |
| ¿Qué falta para multi-sim? | Un **`Capabilities` explícito por sesión** que viaje en `OverlayFrame`, y **modos declarados** (`spatial.mode`, `delta.reference`, `standings.source`) en vez de campos paralelos sin declarar. |
| Nota extensibilidad multi-sim (0–18) | Arquitectura actual: **9/18**. Arquitectura simplificada propuesta: **15/18**. |
| Nota facilidad de añadir señales/widgets (0–10) | Arquitectura actual: **3/10**. Arquitectura simplificada propuesta: **7/10**. |

---

## 1. Cómo modela hoy Vantare las señales comunes

### 1.1 Las cuatro capas del vocabulario

Vantare no tiene *un* modelo canónico: tiene **cuatro representaciones paralelas de la misma señal**, y las cuatro deben cambiarse a la vez.

| # | Capa | Artefacto | Naturaleza |
|---|---|---|---|
| 1 | **Valor** | `schema/<dominio>/types.go` | Tipos nominales (`standings.LapTime`, `energy.Fuel`, `spatial.Position`) |
| 2 | **Calidad** | `schema.Field[T]` (`schema/quality.go:42`) | Valor + `present` + `Provenance` + `Freshness`, genérico sobre `comparable` |
| 3 | **Catálogo** | `catalog/ids.go` + `catalog/catalog.go` | ID `uint16` estable, `Key` string, `Domain`, `Unit`, `Range`, `LedgerAction`, `Notes` |
| 4 | **Runtime** | `core.VehicleState` / `core.ObservedState` (`core/reducer.go:40-86`) | Structs planos con un `schema.Field[T]` por señal |

La separación 2/3 es genuinamente buena y poco común:

```go
// internal/telemetry/schema/quality.go:42-47
type Field[T comparable] struct {
	value      T
	present    bool
	provenance Provenance
	freshness  Freshness
}
```

`Freshness` distingue `Missing / Fresh / Stale / Invalid` (`quality.go:29-34`) y `Provenance` distingue `Observed / Derived / Estimated` (`quality.go:15-19`). **Esto es exactamente lo que un modelo multi-sim necesita**: permite decir "iRacing no publica esto" (`Missing`) sin confundirlo con "vale 0" ni con "el REST se cayó" (`Stale`). Muy pocos proyectos de simracing lo tienen.

El catálogo es un ledger append-only con validación estructural (`catalog/catalog.go:127-189`): IDs nunca reutilizados, claves únicas, conceptos semánticos únicos, notas obligatorias, tombstones. Hoy tiene **45 señales** (`catalog/ids.go:6-54`).

**El problema estructural**: el catálogo *no se usa en runtime*. Su propio comentario lo admite:

```go
// internal/telemetry/core/reducer.go:76-77
// ObservedState is the complete state replaced by one atomic batch. The
// catalog remains outside the runtime hot path by architecture; these typed
// fields are the runtime counterparts of its canonical signal definitions.
```

Es decir: el catálogo es documentación ejecutable, y el struct es la verdad. Nada obliga a que coincidan salvo tests y disciplina. Añadir una señal exige tocar los dos, más el driver, más `derive`, más las cuatro proyecciones, más el frontend (§9).

### 1.2 El pipeline completo (una sola sucursal hoy)

```
LMU SharedMemory (~60 Hz)  ─┐
                            ├─► lmu.Fusion (matriz de autoridad por señal + TTL)
LMU REST (1–2 Hz)          ─┘        │
                                      ▼
                            lmu.Observation (formato propio del driver)
                                      │  lmu.BatchMapper (identidad, epoch, slots)
                                      ▼
                            core.Batch{Header, ObservedState}
                                      │  core.Reducer (valida cursor/identidad)
                                      ▼
                            envelope.Snapshot[core.ObservedState]
                                      │  derive.Pipeline (4 derivaciones fijas)
                                      ▼
                            derive.FinalState{Observed, Derived}
                                      │
        ┌──────────────┬──────────────┼───────────────┬──────────────┐
        ▼              ▼              ▼               ▼              ▼
   overlay.PayloadV1  engineer.PayloadV1  strategy.PayloadV1  analysis.PayloadV1  recording
        │
        ▼ Wails event / HTTP route (telemetrytransport, RFC-7396 merge patch)
   decodeOverlayProjectionV1  (TS, escrito a mano, verificado por fixture)
        │
        ▼ adaptOverlayProjectionToSnapshot  ◄── AQUÍ SE PIERDE EL TIPADO
   TelemetrySnapshot { scoring: readonly Record<string, unknown>[] }
        │
        ▼ widget view-models (ordenan, formatean, deciden color, recalculan)
```

`derive.FinalState` (`derive/pipeline.go:214-217`) es el único estado "completo" del sistema. Las derivaciones son **cuatro, fijas y ordenadas** en un registro estático (`derive/pipeline.go:82-113`): `controls.history`, `session.remaining`, `standings.relative-gaps`, `session.self-delta`. No son plugins: `Definition` no lleva callbacks y el propio comentario lo declara (`pipeline.go:70-71`).

### 1.3 Acoplamientos a LMU fuera de `drivers/lmu` (evidencia)

Busqué `lmu|rfactor|rf2|mDelta|slot` en todo `internal/` excluyendo el driver. Resultado: **el Core no importa nada de LMU, pero sí ha absorbido su semántica**.

| # | Archivo:línea | Fuga | Gravedad |
|---|---|---|---|
| 1 | `schema/spatial/types.go:14` | `// The canonical LMU driver uses +X left, +Y up and +Z rearward.` — el **frame de coordenadas canónico se define por referencia a LMU**, no por convención propia | **Alta** |
| 2 | `catalog/catalog.go:102` | `Notes: "…LMU axes are +X left, +Y up and +Z rearward."` para `spatial.local_velocity` | **Alta** |
| 3 | `schema/pit/types.go:6` | `// InPit is the observed LMU VehicleScoring boolean.` — la semántica de `pit.in_pit` es literalmente "lo que dice rF2" | **Alta** |
| 4 | `catalog/catalog.go:68` | `standings.position` con `ClosedRange(1, 104)`, nota `"demonstrated LMU vehicle bound"` | Media |
| 5 | `catalog/catalog.go:79` | `session.vehicle_count` con `ClosedRange(0, 104)`, misma nota | Media |
| 6 | `core/session_coordinator.go:27-29` | `MaxSessionVehicleHistory = 104` — *"matches the demonstrated LMU VehicleScoring slot"* | Media |
| 7 | `schema/vehicle/types.go:6` | `// LMU gear semantics remain deferred.` — `Gear` no tiene semántica canónica | Media |
| 8 | `schema/weather/types.go:4` | `// Temperature has no physical-unit alias until the LMU source contract is demonstrated.` → `weather.ambient_temperature` tiene `Unit: schema.UnitUnknown` (`catalog.go:69`) | Media |
| 9 | `internal/app/telemetry_core_runtime.go:170-177` | El **manifiesto de capabilities de Engineer está hardcodeado a `CapabilitySupported` para las 7 capabilities**, sin consultar al driver activo | **Crítica** |

Y una fuga estructural en el **wiring**, que merece mención aparte:

| # | Archivo:línea | Fuga | Gravedad |
|---|---|---|---|
| 9b | `internal/app/telemetry_core_runtime.go:117-118` | `manager *telemetrycore.DriverManager[lmu.Observation]` y `mapper *lmu.BatchMapper` — **el runtime genérico está instanciado sobre el tipo del driver LMU**. `DriverManager[T]` es genérico, pero el runtime fija `T = lmu.Observation`, así que **dos drivers con tipos de observación distintos no pueden coexistir** en el mismo manager | **Crítica** |
| 9c | `internal/app/telemetry_core_runtime.go:612`, `:627` | `WriteObservation(ctx, observation lmu.Observation)`, `lmu.IsUnmappableFrame(err)` — el sink y la clasificación de errores del runtime hablan LMU | Alta |
| 9d | `internal/engineer/engine/monitor.go:24,111,132` | `internal/engineer/lmu.ExtendedReader` — existe un **segundo lector de LMU fuera de `internal/telemetry/drivers/lmu`**, consumido directamente por Engineer | Alta |
| 9e | `internal/engineer/damage/monitor.go:8` | `// LMU provides mDentSeverity[8] (8 bytes) in PlayerTelemetry` — nomenclatura `m*` de rFactor2 documentada en un monitor de dominio | Media |
| 9f | `internal/calendar/*` | `calendar-lmu.json`, `BundledSource = "vantare-bundled-lmu"`, `Sim: "lmu"` hardcodeado | Baja (dominio de producto, no telemetría) |

Fugas en el **frontend**, más graves que todas las anteriores juntas:

| # | Archivo:línea | Fuga |
|---|---|---|
| 10 | `frontend/src/overlay/core/telemetry-snapshot.ts:39` | `scoring: readonly Record<string, unknown>[]` — el contrato tipado se destruye |
| 11 | `frontend/src/overlay/projection/overlay-projection-adapter.ts:405-413` | `assignIfPresent(row, "place", …vehicle.position…)` — el campo canónico `position` se renombra a **`place`**, nombre nativo de `VehicleScoringInfo` de rFactor2 |
| 12 | mismo archivo, `~458-467` | `inPit` → **`inPits`**, `completedLaps` → `totalLaps` (nomenclatura rF2/legacy) |
| 13 | `frontend/src/overlay/widget-types/shared/scoring-readers.ts:34` | `readScoringNumber(record, "place") ?? readScoringNumber(record, "position")` — el widget *adivina* entre dos nombres |
| 14 | `widget-types/relative/relative-renderer-helpers.ts:~66-80`, `standings/standings-renderer-helpers.ts:6-10,22-34` | Clases **`HYPERCAR` / `LMP2` / `LMP3` / `GT3` / `LMGT3` cableadas** con sus colores en la capa de presentación |
| 15 | `widget-types/standings/standings-view-model.ts:76` | `?? "HYPERCAR"` como **clase por defecto** cuando falta el dato |
| 16 | `design-systems/vantare-endurance/standings/standings-endurance-shared.ts:8` | `const CLASS_HIERARCHY = ["HYPERCAR","LMP2","LMP3","GT3"]` — jerarquía WEC usada para ordenar bloques |
| 17 | `design-systems/vantare-endurance/standings/StandingsLmuTemplate.tsx` | Un **design system entero llamado LMU**: `LMU_CLASS_COLORS`, `lmuColors()`, `formatLmuGap()`, clases CSS `ven-lmu-*`, vars `--lmu-chip`. Registrado como `standings-endurance-lmu` en `design-systems/official-designs.ts:241` |
| 18 | `widget-types/shared/input-readers.ts` | `readNormalizedInput`: `number > 1 ? number / 100 : number` — **adivina la unidad** de los pedales, aunque el contrato ya garantiza 0..1 (`requireRatio`) |

**Conclusión de §1**: el modelo canónico Go es reutilizable para multi-sim con retoques cosméticos (fugas 1–8) más dos cambios reales (9, 9b). El modelo de datos que realmente ven los widgets (fugas 10–18) **no es canónico en absoluto**: es un `map` con nombres de rFactor2, con la taxonomía de clases del WEC cableada en la presentación. Cualquier afirmación de que "los widgets no saben qué sim corre" es falsa hoy: leen `place` e `inPits`, y pintan por `HYPERCAR`/`LMP2`.

Nota de matiz honesta: `mDelta`, `rfactor`, `rf2` y `sourceSlot` tienen **cero ocurrencias** en `frontend/src` y en `internal/` fuera del driver. La contaminación no es por nombres de la API de rF2, sino por **conceptos**: `place`, `inPits`, y la taxonomía de clases del WEC. Es una contaminación más sutil y más difícil de detectar con grep.

---

## 2. MCD vs superset canónico vs "core + capability modules"

### 2.1 Las tres opciones

| Estrategia | Qué implica | Coste al añadir iRacing | Coste al añadir ACC |
|---|---|---|---|
| **Mínimo común denominador** | El canónico solo contiene lo que *todos* los sims exponen | Barato | Barato |
| **Superset canónico** | El canónico contiene la unión de todo; ausencias = `Field` missing | Caro (crece el struct) | Caro |
| **Core + capability modules** | Núcleo universal obligatorio + módulos opcionales declarados | Medio | Medio |

El MCD se descarta de inmediato. La intersección real de LMU/iRacing/ACC/AC EVO es: tiempo de sesión, tipo de sesión, posición, vueltas completadas, mejor vuelta, última vuelta, en boxes, combustible, marcha, rpm, velocidad, pedales. **Fuera quedan**: XYZ mundial de rivales (LMU sí, iRacing no), incidentes (iRacing sí, LMU no), niveles TC/ABS (ACC sí, LMU no en SM), delta nativo (LMU y ACC sí, iRacing sí con tres variantes), meteorología (ACC/iRacing sí, LMU no mapeado hoy). Un MCD borraría el Relative con radar espacial, el Spotter, y todo el valor diferencial de Vantare.

El superset puro tampoco: hoy `core.VehicleState` ya tiene **31 campos** (`core/reducer.go:40-72`) y solo cubre un simulador. Con cuatro sims sería ~80 campos por vehículo, la mayoría `Missing` en cualquier sesión concreta, y `cloneObservedState` (`reducer.go:274-278`) copia el slice completo por frame.

### 2.2 La opción correcta: núcleo + módulos por capability

Propongo tres anillos:

**Anillo 0 — Núcleo universal (obligatorio, todo driver debe producirlo o el driver no es válido)**

`session.type`, `session.source_time`, `session.track_name`, `vehicle.player_present`, `standings.position`, `standings.completed_laps`, `standings.best_lap_time`, `standings.last_lap_time`, `pit.in_pit`, `identity.driver_name`, `vehicle.name`.

Los cuatro sims lo cumplen. Verificado externamente: iRacing publica `CarIdxPosition`, `CarIdxLap`, `CarIdxOnPitRoad`, `SessionNum`, `SessionTime` ([iRacing SDK docs, telemetría](https://sajax.github.io/irsdkdocs/telemetry/), consultado 2026-08-19). ACC publica `Position`, `Laps`, `CarLocation`, `BestSessionLap`, `LastLap`, `SessionType`, `SessionTime` en `RealtimeCarUpdate`/`RealtimeUpdate` ([BroadcastingNetworkProtocol.cs](https://github.com/angel-git/acc-broadcasting/blob/master/BroadcastingNetworkProtocol.cs), consultado 2026-08-19).

**Anillo 1 — Módulos por capability (opcionales, declarados explícitamente)**

| Módulo | Contenido | LMU | iRacing | ACC | AC EVO |
|---|---|---|---|---|---|
| `progress.lap-distance` | distancia/porcentaje de vuelta por vehículo | metros | `CarIdxLapDistPct` (0–1) | `SplinePosition` (0–1) | sí |
| `spatial.xyz` | posición mundial 3D de todos los vehículos | **sí** | **no** | **parcial** (X, Y, Yaw; sin Z) | sí (player) |
| `spatial.orientation` | matriz/heading | sí (3×3) | solo player (`Yaw/Pitch/Roll`) | `Yaw` por coche | sí |
| `gaps.official` | gaps publicados por el sim | `TimeBehindLeader/Next` | `CarIdxF2Time`, `CarIdxEstTime` | `Delta` (a mejor de sesión) | ? |
| `delta.native` | delta nativo del sim | `mDeltaBest` | `LapDeltaToBestLap`, `LapDeltaToSessionBestLap`, `LapDeltaToOptimalLap` | `Delta` (Int32 ms) | ? |
| `weather` | ambiente/pista/lluvia | **no mapeado** | `AirTemp`, `TrackTempCrew` | `AmbientTemp`, `TrackTemp`, `RainLevel`, `Wetness` | sí |
| `energy.fuel` | combustible | litros | `FuelLevel` (litros) | sí | sí |
| `energy.virtual` | energía virtual (LMH/GT3 híbridos) | pendiente | no | no | ? |
| `controls` | pedales, marcha, rpm | sí | sí | sí (player) | sí |
| `tyres`, `brakes` | temps/presiones | pendiente | sí | sí | sí |
| `penalties.count` | contador | sí | — | sí | ? |
| `incidents` | contador de incidentes | **no** | `PlayerCarMyIncidentCount`, `PlayerCarTeamIncidentCount` | no | no |
| `assists.levels` | TC/ABS activos | no (SM) | parcial | **sí** | sí |
| `standings.multiclass` | clase por vehículo, posición en clase | `VehicleClass` | `CarIdxClassPosition` | `CupPosition`, `CupCategory` | sí |

**Anillo 2 — Extensiones nativas del simulador** (§3).

El criterio de corte entre anillo 0 y 1: **una capability es anillo 0 si su ausencia haría que Vantare no arrancara**; es anillo 1 si su ausencia debe degradar widgets concretos, no todo.

### 2.3 Cómo se declaran hoy las capabilities (tres sistemas incompatibles)

Vantare tiene **tres nociones distintas de "capability" que no se hablan entre sí**:

1. **`driver.Capability`** (`driver/descriptor.go:8-16`, `driver/state.go`): describe **canales de adquisición**, no señales. En LMU vale `"shared-memory"` y `"rest"` (`drivers/lmu/driver.go:16`, `driver.go:293-304`). Nunca sale del `DriverManager`.
2. **`engineer.Manifest`** (`projection/engineer/contract.go:39-75`): el más maduro. Capabilities con estado explícito `Unknown / Supported / Unsupported / Degraded`, inmutable, con `Manifest.State(id)` que devuelve `Unknown` (no `Unsupported`) para ids desconocidos. Es exactamente el diseño correcto. **Pero está hardcodeado a `Supported` en el wiring** (`internal/app/telemetry_core_runtime.go:170-177`), sin consultar al driver.
3. **`overlay.Capability` / `strategy.Capability` / `analysis.Capability`** (`projection/overlay/v1.go:28-36`, etc.): **strings inferidas del dato en cada frame**:

```go
// internal/telemetry/projection/overlay/v1.go:269-291
func capabilities(snapshot PayloadV1) []Capability {
	if projection.Available(snapshot.TrackName) || projection.Available(snapshot.SessionType) {
		result = append(result, CapabilitySession)
	}
	for _, current := range snapshot.Vehicles {
		if projection.Available(current.Name) || … { result = appendCapability(result, CapabilityStandings) }
		…
```

**Este es el fallo de diseño multi-sim más importante del backend.** Inferir capability desde disponibilidad de dato confunde tres cosas radicalmente distintas:

- *"este simulador no expone esto nunca"* (iRacing y XYZ de rivales),
- *"lo expone pero el canal está caído"* (REST de LMU),
- *"lo expone pero en este instante no hay valor"* (aún no hay mejor vuelta).

Con LMU es tolerable porque LMU expone casi todo casi siempre. Con iRacing, `CapabilitySpatial` **parpadearía** frame a frame según haya o no dato, y los widgets harían flicker. Un widget no puede distinguir "no soportado" de "aún no" con este contrato.

Además: `driver.RuntimeSnapshot.Capabilities` (que sí sabría la verdad) **nunca llega a la proyección**. `overlay.ProjectorV1.Project` recibe solo `envelope.Snapshot[derive.FinalState]` (`overlay/v1.go:129`); no hay ningún parámetro de capabilities.

Y el remate: **el array `capabilities` que sí viaja al frontend es dead data**. Está definido (`frontend/src/overlay/projection/overlay-projection-v1.ts:9-15,27,116`), decodificado y validado con rigor (`decodeCapabilities`, `:256-267`: enum conocido, sin duplicados, longitud ≤ 5)… y **cero consumidores**. El adaptador no lo lee en ninguna línea; decide todo por `present`/`freshness` campo a campo. Las únicas apariciones de `.capabilities` en el frontend son los tests del decoder y un homónimo sin relación (`WidgetTypeDefinition.capabilities` en `core/widget-registry.ts:53`, que son tamaños y secciones de inspector).

Lo que el frontend usa en su lugar es **`UNSUPPORTED_FIELDS`, una lista estática hardcodeada** en el adaptador (`overlay-projection-adapter.ts:60-71`):

```
session.key, session.globalFlag, session.sectorFlags        → "unsupported-by-projection"
scoring[].driverNumber, teamName, tireCompound              → "unsupported-by-projection"
derived.inputHistory                                        → "history-without-timestamps"
derived.fuelHistory, environment, damage                    → "unsupported-by-projection"
```

Es decir: el frontend ya tiene un mecanismo de capabilities, pero es **una constante en el código del cliente**, no una declaración del backend, y por tanto no puede variar por simulador. Además contradice al gating comercial: `WIDGET_REQUIRED_FEATURE_BY_TYPE` (`core/widget-definition.ts:10-30`) ofrece `track-weather`, `racing-flags` y `car-damage-*` bajo `"overlays.advanced"` mientras sus fuentes (`environment`, `session.globalFlag`, `damage`) están declaradas no soportadas. Hay widgets vendibles cuyo dato el sistema sabe que no existe.

**Diagnóstico**: la infraestructura de capabilities está construida en las cuatro capas y **desconectada en las cuatro juntas**. No hace falta inventarla; hace falta cablearla y darle la semántica correcta.

### 2.4 Cómo debería consumirlas Overlay/Engineer sin identificar el sim

Regla: **el widget pregunta por capability, nunca por simulador**. Tres primitivas:

```
capabilities: { "spatial.xyz": "unsupported", "delta.native": "supported", "weather": "degraded" }
modes:        { "spatial.mode": "lap-distance", "delta.reference": "personal-best", "standings.source": "official" }
fields:       { …Field<T> con present/freshness/provenance… }
```

- `capabilities` es **estable durante la sesión** (cambia solo en boundary o si un canal cae → `degraded`).
- `modes` dice *cómo* se resolvió una capability, no *quién* la resolvió. `spatial.mode = "lap-distance"` es información suficiente para que el Relative use un layout lineal en vez de un radar, sin saber que corre iRacing.
- `fields` sigue llevando `freshness` por señal para el parpadeo instantáneo.

El widget nunca ve `driver.ID`. Un widget que necesitara ver `"iracing"` sería un bug de contrato, detectable con un test de arquitectura (grep de nombres de sim en `frontend/src/overlay/widget-types/**`).

---

## 3. Señales específicas de un simulador sin contaminar el Core

### 3.1 El caso testigo: el diff local del delta nativo

El working tree contiene evidencia experimental perfecta. Reintroducir `mDeltaBest` de LMU (una señal de **un** simulador) tocó:

| Capa | Archivos |
|---|---|
| Catálogo | `catalog/ids.go` (+2 ids), `catalog/catalog.go` (+2 definiciones, líneas 103-104) |
| Runtime | `core/reducer.go` (`VehicleState.DeltaBest`, línea 68) |
| Derivación | `derive/delta.go` (+109 líneas: `SelfDelta.PersonalBest/SessionBest/PreviousLap`, `tracker.previous`), `derive/pipeline.go` |
| Driver | `drivers/lmu/{layout,format,fusion,batch_mapper,driver}.go` (5 archivos) |
| Proyección | `projection/overlay/v1.go` (+4 campos en `PayloadV1`, líneas 53-57) + goldens |
| Transporte TS | `frontend/src/overlay/projection/overlay-projection-v1.ts`, `overlay-projection-adapter.ts` |
| Snapshot TS | `frontend/src/overlay/core/telemetry-snapshot.ts` (+4 campos) |
| Widget | `frontend/src/overlay/widget-types/delta/{delta-definition,delta-view-model}.ts` |
| Inspector + i18n | `hub/overlay-studio/inspector/*`, 4 locales (`en/es/it/pt`) |

**≈20 archivos y 4 idiomas para una señal de un simulador.** Con la arquitectura actual, añadir el `incident count` de iRacing o los niveles TC/ABS de ACC costará exactamente lo mismo.

Peor: la política de fallback acabó **dentro del widget**:

```ts
// frontend/src/overlay/widget-types/delta/delta-view-model.ts:111-118
const deltaSeconds = reference === "previous-lap"
    ? snapshot.player.deltaPreviousLapSeconds
    : reference === "session-best"
      ? snapshot.player.deltaSessionBestSeconds
      : snapshot.player.deltaPersonalBestSeconds ??
        (snapshot.player.deltaReferenceSet ? undefined : snapshot.player.deltaSeconds);
```

`deltaReferenceSet` es un booleano sintético inventado en el adaptador (`overlay-projection-adapter.ts:211`, `optional.deltaReferenceSet = true`) cuyo único propósito es distinguir un payload nuevo de uno viejo. El widget está haciendo **negociación de versión de protocolo**. Eso es precisamente lo que el enunciado del proyecto dice que el widget no debe saber.

Y en Go, el `DeltaReference` proyectado **miente**:

```go
// internal/telemetry/projection/overlay/v1.go:152-154
DeltaReference: projection.MapField(final.Derived.Delta.Reference, func(reference session.DeltaReference) string {
	return "best-completed-player-lap"
}),
```

Devuelve una constante ignorando el enum de entrada. Con tres referencias reales en juego, el campo que debería declarar *cuál* se usó es un literal fijo. Es un bug latente que el multi-sim convierte en bug real.

### 3.2 Las tres opciones de representación, evaluadas

#### A. `map[string]any`

| Dimensión | Consecuencia real |
|---|---|
| Type safety Go | Nula. `state.Extras["iracing.incidents"].(int)` compila y explota en runtime. Los `Field[T]` requieren `comparable`; `any` no lo es, así que se pierde también la calidad. |
| Rendimiento | `map[string]any` boxea cada valor. Con ~30 señales × 60 vehículos × 60 Hz son ~108k allocs/s. `core/reducer.go:274-278` clona por frame; hoy es un `append` de structs planos (una alloc), con maps sería una copia profunda por vehículo. |
| Tests | Imposible testear exhaustivamente: no hay compilador que avise de una clave mal escrita. Los goldens JSON pasan a ser el único contrato. |
| Mantenibilidad por LLM | **Peor de las tres.** Un LLM no puede descubrir el conjunto de claves válidas leyendo tipos; tiene que hacer grep de todos los productores y consumidores. Es la fuente clásica de "el modelo inventa una clave plausible". |
| JSON | Naturalmente serializable, y por eso resulta tentador. |
| TS | Se convierte en `Record<string, unknown>` y obliga a *type guards* por lectura. **Ya está pasando**: `telemetry-snapshot.ts:39`. |

**Veredicto: prohibido en el hot path.** Y hay que *retirar* el que ya existe en TS.

#### B. Catálogo de señales como runtime (`map[SignalID]Value`)

Mejor que strings (los ids son constantes tipadas, `catalog.SignalID` es `uint16`), pero sigue perdiendo el tipo del valor: necesitarías `Value` como union o `any`. En Go, sin uniones, degenera en A. Útil como **índice de metadatos** (que es su rol actual y correcto), no como estructura de datos runtime.

#### C. Structs tipados + capabilities + extensiones tipadas por namespace

Recomendada. Concretamente:

```go
// Núcleo: igual que hoy, structs planos con schema.Field[T].
type VehicleState struct { … }

// Extensión: un struct tipado POR SIMULADOR, opcional, en su propio paquete.
package iracingext
type Vehicle struct {
	IncidentCount schema.Field[schema.Count]
	F2Time        schema.Field[standings.TimeGap]
	ClassPosition schema.Field[standings.Position]
}

package accext
type Vehicle struct {
	TractionControl schema.Field[schema.Count]  // nivel 0..N
	ABS             schema.Field[schema.Count]
	CupCategory     schema.Field[standings.VehicleClass]
}
```

y en el estado canónico un **puntero opcional por namespace**:

```go
type FinalState struct {
	Observed core.ObservedState
	Derived  derive.DerivedState
	Native   NativeExtensions   // punteros nil salvo el sim activo
}
type NativeExtensions struct {
	IRacing *iracingext.State
	ACC     *accext.State
	LMU     *lmuext.State
}
```

Ventajas: type safety total; `nil` = "este sim no aporta nada aquí" con coste cero; el JSON sale limpio (`"native": {"iracing": {...}}`) porque los `nil` se omiten con `omitempty`; y —clave para LLM— **un agente puede descubrir todas las señales nativas de iRacing leyendo un solo archivo**.

Coste: `NativeExtensions` crece con cada sim (un puntero, 8 bytes). Aceptable.

**Regla de promoción**: una señal nativa asciende al núcleo cuando **dos simuladores independientes** la exponen con semántica equivalente. El `incident count` de iRacing se queda en `iracingext` hasta que un segundo sim publique algo comparable. Esto evita el superset por acumulación.

**Regla de consumo**: **ningún widget del anillo 0 puede leer `native.*`.** Solo widgets explícitamente marcados como "específicos de simulador" (que el Studio ocultaría cuando el sim no está activo). Así el contrato "el widget no sabe qué sim corre" se mantiene para el 95% del catálogo de widgets, y el 5% restante lo declara.

### 3.3 Dónde encaja el delta nativo de LMU con este diseño

Hoy: `SignalSessionNativeDeltaBest` está en el **catálogo canónico** (`catalog/catalog.go:103`) y en `core.VehicleState.DeltaBest` (`reducer.go:68`), es decir, **contaminó el núcleo**.

Con el diseño propuesto **no haría falta moverlo**, porque el delta nativo *no es específico de LMU*: iRacing publica `LapDeltaToBestLap` / `LapDeltaToSessionBestLap` / `LapDeltaToOptimalLap`, y ACC publica `Delta` (delta en tiempo real a la mejor vuelta de sesión). Tres sims → señal canónica legítima. Lo que está mal modelado es otra cosa: **tres campos paralelos sin declarar cuál está disponible**. Lo correcto es un único valor + su referencia declarada (§7.1).

---

## 4. Identidad: sesión, vehículo, stint

### 4.1 Cómo se hace hoy con LMU

La identidad canónica es `identity.RunIdentity{Event, Session, Vehicle, Team, Driver}` (`schema/identity/ids.go:11-17`) con una decisión de diseño explícita y correcta: *"Team and driver changes therefore do not create a new run by themselves"*. Es decir, **los driver swaps ya están contemplados**.

La generación de identidad vive en `lmu.BatchMapper` (`drivers/lmu/batch_mapper.go`):

```go
// batch_mapper.go:353-359
func sessionID(counter uint64) identity.SessionID {
	return identity.SessionID(fmt.Sprintf("lmu-session-%d", counter))
}
func vehicleID(slot VehicleSourceID, generation uint64) identity.VehicleID {
	return identity.VehicleID(fmt.Sprintf("lmu-slot-%d-generation-%d", slot, generation))
}
```

Y `batchEventID = "lmu-event-1"` es una **constante literal** (`batch_mapper.go:32`): LMU no expone concepto de evento, así que hay un evento único perpetuo.

La detección de límites de sesión es **puramente heurística**, porque LMU no publica un id de sesión:

```go
// batch_mapper.go:168-172
sessionBoundary := !first && clockChange == ClockReset
if !sessionBoundary && !first && freshSignature && state.hasFresh && signature != state.lastFresh {
	sessionBoundary = true
}
epochBoundary := sessionBoundary || (!first && clockChange == ClockWrap)
```

donde `sessionSignature{track, sessionType}` (`batch_mapper.go:35-38`). Es decir: **"si cambió la pista o el tipo de sesión, o el reloj retrocedió, es una sesión nueva"**. Dos sesiones de Práctica seguidas en el mismo circuito son indistinguibles salvo por el reset de reloj.

El cambio de jugador fuerza epoch:

```go
// batch_mapper.go:204-211
if observedPlayer == "" { state.playerID = "" }
else if state.playerID != observedPlayer {
	if !first && !sessionBoundary { epochBoundary = true }
	state.playerID = observedPlayer
}
```

Las **slot generations** (`generations map[VehicleSourceID]uint64`) resuelven un problema real de rF2: el slot 7 puede ser el coche #23 y, tras una desconexión, el coche #51. Reutilizar el id haría que un widget continuara una serie temporal de otro coche. `vehicleID` incorpora la generación para impedirlo.

El `Cursor{Epoch, Sequence}` (`schema/time.go:18-21`, `Advance` en `time.go:40-57`) es el reloj lógico: `TransitionSourceReset/EventChanged/SessionChanged/VehicleChanged` abren epoch nueva; el reducer valida contigüidad estricta (`core/reducer.go:221-244`) y rechaza saltos.

**Valoración**: el diseño de identidad es el subsistema mejor resuelto de todo el Core y es **directamente reutilizable multi-sim**. Lo único acoplado a LMU son los prefijos de string y la heurística de firma, ambos dentro del driver, que es donde deben estar.

### 4.2 Cómo se haría con iRacing

iRacing es **mucho más fácil**: publica identidad real.

| Concepto Vantare | iRacing | Fuente |
|---|---|---|
| `EventID` | `SubSessionID` (del session YAML `WeekendInfo`) | session string |
| `SessionID` | `SessionUniqueID` + `SessionNum` | telemetría, [iRacing SDK docs](https://sajax.github.io/irsdkdocs/telemetry/) |
| `VehicleID` | `CarIdx` (estable durante toda la subsesión) + `UserID` del driver | session string `DriverInfo.Drivers[]` |
| `DriverID` | `UserID` (numérico, estable entre sesiones) | session string |
| `TeamID` | `TeamID` en team racing | session string |
| Boundary de sesión | cambio de `SessionNum` (Practice→Qualy→Race dentro de la misma subsesión) | |
| Boundary de epoch | cambio de `SessionUniqueID`, o `IsOnTrack` tras reset, o replay | |

`CarIdx` es estable en iRacing dentro de una subsesión, así que **la maquinaria de `generations` no haría falta** — pero tampoco estorba: el driver de iRacing simplemente mantendría `generation = 1` siempre. Que la abstracción sobreviva a un sim que no la necesita es buena señal.

Nota importante: iRacing tiene **dos cadencias**: telemetría a 60 Hz y el *session string* (YAML) que cambia esporádicamente, con un contador `SessionInfoUpdate`. La identidad vive en el YAML, no en la telemetría de 60 Hz. Esto es estructuralmente **idéntico** a la fusión SM+REST de LMU (§6).

### 4.3 Cómo se haría con ACC

| Concepto Vantare | ACC | Fuente |
|---|---|---|
| `EventID` | `EventIndex` de `RealtimeUpdate` + track name | [BroadcastingNetworkProtocol.cs](https://github.com/angel-git/acc-broadcasting/blob/master/BroadcastingNetworkProtocol.cs) |
| `SessionID` | `SessionIndex` + `SessionType` (`RaceSessionType`) | mismo |
| `VehicleID` | `CarIndex` de `RealtimeCarUpdate` / `ENTRY_LIST_CAR` | mismo |
| `DriverID` | `DriverIndex` dentro del `CarInfo` (driver swaps nativos) | mismo |
| Fuente adicional | Shared memory `Physics`/`Graphics`/`Static` para el coche del jugador | |

ACC tiene un matiz propio: la **connection id** del protocolo de broadcasting. Si la app se reconecta al puerto UDP obtiene una connection nueva y debe re-solicitar el `ENTRY_LIST`. Eso es un `TransitionBriefDisconnect` o `TransitionSourceReset` según si la entry list cambió — exactamente los estados que `schema.Transition` ya modela (`schema/time.go:25-32`).

### 4.4 ¿Deben separarse `StreamEpoch`, `SessionID`, `VehicleID`, `StintID`?

**Sí, y hoy están mal fusionados.** `schema.Epoch` está sobrecargado: significa a la vez "reset del stream", "cambió la sesión" y "cambió el coche del jugador" (`batch_mapper.go:172`, `:206-210`). Un consumidor que ve `epoch+1` no puede saber cuál de las tres cosas pasó — solo que debe descartar su historia.

Eso es demasiado destructivo. El tracker de delta se resetea por cambio de epoch **o** de sesión **o** de jugador (`derive/delta.go:146-149`), y el `ControlsHistory` idem (`derive/pipeline.go:397-402`). Correcto conservadoramente, pero pierde información aprovechable: un breve `ClockWrap` de LMU no debería tirar la vuelta de referencia si la sesión y el coche no cambiaron.

Propuesta de cuatro identificadores ortogonales:

| Identificador | Semántica | Qué invalida | Fuente |
|---|---|---|---|
| **`StreamEpoch`** | monotónico; se incrementa cuando el *transporte* se reinicia o hay hueco de secuencia | buffers de transporte, merge-patch; **nada de dominio** | driver/transport |
| **`SessionID`** | una sesión del simulador (Practice 1, Qualy, Race) | vuelta de referencia, históricos, standings | driver (nativo o heurístico) |
| **`VehicleID`** | un coche dentro de una sesión, con generación anti-reciclado de slot | series por coche | driver |
| **`StintID`** | tramo continuo del jugador entre entradas a boxes / cambios de piloto | consumo, degradación, delta | derivado en Core (`pit.in_pit` + `driver.name`) |

Hoy `StintID` **no existe**. `pit.StopCount` se observa, pero nada delimita un stint. Es una carencia real para Strategy Planner y para el consumo de combustible, y es multi-sim al 100% (los cuatro sims dan `in_pit`).

**`epoch` debería significar exactamente una cosa: "el stream se reinició, descarta tus buffers de transporte"**. Todo lo demás debe expresarse como cambio de `SessionID` / `VehicleID` / `StintID`, que son datos de dominio y no obligan a tirar todo.

---

## 5. Unidades

### 5.1 Qué hace hoy Vantare

**Go no convierte unidades en ningún sitio.** Verificado: `grep -rn "3\.6|2\.23694|kmh|mph|Fahrenheit" internal/**/*.go` devuelve **una sola línea**, y es un umbral, no una conversión:

```go
// internal/core/deadband.go:11
const ThresholdSpeedMPS = 0.1 / 3.6
```

Las unidades internas declaradas por el catálogo (`schema/types.go:58-73`, `catalog/catalog.go`) son:

| Magnitud | Unidad interna | Evidencia |
|---|---|---|
| Velocidad | **m/s** | `UnitMetersPerSecond`, `vehicle.speed_mps` (`catalog.go:81`) |
| Distancia | **metros** | `UnitMeters`, `standings.lap_distance` (`catalog.go:88`), `spatial.position` (`catalog.go:70`) |
| Tiempo | **segundos** (float64) o `time.Duration` en el header | `UnitSeconds`; `Clock` usa `Field[time.Duration]` (`schema/time.go:64-66`) |
| Temperatura | **°C** | `UnitCelsius`, `schema.Celsius` (`types.go:181`) — pero `weather.ambient_temperature` tiene `UnitUnknown` (`catalog.go:69`) |
| Combustible | **litros** | `UnitLiters`, `energy.FuelAmount` "the observed amount in liters" (`schema/energy/types.go:6`) |
| Ratios | **0..1** | `schema.Ratio`, `ClosedRange(0,1)` para pedales |
| RPM | rpm | `UnitRPM` |
| Presión | **no existe** | no hay `UnitPascal` ni `UnitKPa` en el enum |
| Ángulo | **no existe** | no hay `UnitRadians`/`UnitDegrees`; la orientación es matriz 3×3 (`spatial/types.go:20-24`) |

Es SI *de facto* salvo litros y °C, ambas defendibles (son las unidades nativas de todos los sims para esas magnitudes).

La velocidad se **deriva** en el driver por magnitud del vector de velocidad local:

```go
// internal/telemetry/drivers/lmu/format.go:338-340
speed := math.Sqrt(vx*vx + vy*vy + vz*vz)
…
row.SpeedMPS = observed(speed)
```

lo cual es correcto y generalizable (iRacing publica `Speed` en m/s directamente; ACC publica `Kmh` como `UInt16` y habría que dividir por 3.6 **en el driver de ACC**).

### 5.2 Dónde se convierte hoy

**En el adaptador del frontend, no en el widget, y sin opción de preferencia**:

```ts
// frontend/src/overlay/projection/overlay-projection-adapter.ts:213-221
assignIfPresent(
  optional,
  "speedKph",
  mappedValue(vehicle.speedMps, quality, `vehicles[…].speedMps`, "player.speedKph", 3.6),
);
```

`TelemetrySnapshot.player.speedKph` (`telemetry-snapshot.ts:21`) es **km/h y solo km/h**. No hay soporte de mph en ninguna capa. Un usuario norteamericano —el mercado natural de iRacing— no tiene forma de ver mph.

### 5.3 Recomendación

Tres reglas:

1. **El Core es SI estricto**, sin excepciones ni "unidad demostrada": m/s, m, s, K o °C (elegir una y documentarla), Pa, rad, kg, litros para volumen. Toda conversión desde la unidad nativa del sim ocurre **dentro del driver**, y el catálogo declara la unidad canónica, nunca "unknown". La entrada `weather.ambient_temperature → UnitUnknown` de hoy es deuda: significa que nadie sabe qué unidad tendrá el dato cuando llegue.

2. **La proyección (Overlay/Engineer) sigue emitiendo SI.** No debe conocer la preferencia del usuario: si lo hiciera, la misma sesión grabada se reproduciría distinta según el ajuste, y el merge-patch RFC-7396 (`internal/app/telemetrytransport/merge_patch.go`) generaría diffs espurios al cambiar de unidad.

3. **El frontend formatea.** Pero no en el adaptador (como hoy) sino en una **capa de formato declarativa compartida** que reciba `(valorSI, unidadCanónica, preferencia)` y devuelva `{text, suffix}`. El `TelemetrySnapshot` debe llevar `speedMps`, no `speedKph`. Así "añadir mph" es un cambio de una función, no de todos los widgets.

Excepción pragmática: los tiempos de vuelta se quedan en segundos float64 en todas las capas. Convertirlos a `time.Duration` en el frontend no aporta nada y JSON no tiene tipo duración.

---

## 6. Frecuencia, frames parciales y fusión de fuentes

### 6.1 El problema es universal, no de LMU

| Sim | Fuente rápida | Fuente lenta / esporádica |
|---|---|---|
| LMU | Shared memory ~50–100 Hz (`defaultInterval = time.Second / 60`, `drivers/lmu/driver.go:17`) | REST local 1–2 Hz |
| iRacing | Telemetría 60 Hz (vars binarias) | *Session string* YAML, esporádico (`SessionInfoUpdate`) |
| ACC | Shared memory (Physics ~333 Hz, Graphics ~ frame rate) | UDP broadcasting: `RealtimeUpdate` ~ cada frame de HUD, `ENTRY_LIST` bajo demanda, eventos (`BROADCASTING_EVENT`) asíncronos |
| AC EVO | Bloques de memoria compartida `Local\acevo_pmf_*` a distintas cadencias | — |

Es decir: **todos los simuladores modernos son multi-fuente con cadencias heterogéneas**. Lo que Vantare construyó para LMU no es una peculiaridad: es el caso general.

### 6.2 Cómo lo resuelve Vantare hoy

`lmu.Fusion` (`drivers/lmu/fusion.go`) es el componente más sofisticado del sistema y, en mi opinión, el más infravalorado:

- Una **matriz de autoridad por señal** (`authorityMatrixV4`, `fusion.go:31-69`, 38 reglas) que declara para cada `catalog.SignalID`: fuente preferida, fuente alternativa, si son *equivalentes*, y **un TTL por fuente**.
- Una **cascada de selección** con degradación explícita (`fusion.go:406-430`): fresco preferido → fresco alternativo (si equivalente) → *stale* preferido → *stale* alternativo → cualquier valor → missing.
- **Envejecimiento monotónico** (`fieldAt`, `fusion.go:442-450`): si `elapsed - updated > ttl`, el campo pasa de `Fresh` a `Stale` sin perder el valor. Usa tiempo monotónico, no UTC (comentario en `fusion.go:101-102`).
- **Diagnóstico de conflicto** (`ConflictDiagnostic`, `fusion.go:84-88`): cuando ambas fuentes son usables y discrepan, se registra (máx. 5 por frame).
- **Propagación de staleness a la parrilla** (`ageVehicleGrid`, `fusion.go:202-242`): si el `SourceTime` está stale, todas las filas de todos los vehículos se marcan stale.
- **Trazabilidad**: cada frame lleva `Decisions []FieldDecision` con la fuente elegida por señal (`fusion.go:77-82`).

### 6.3 ¿Es generalizable?

**Sí, casi tal cual, y debería subir del driver de LMU a un paquete compartido.** Es el activo más reutilizable del sistema. Lo que hay que cambiar:

1. `ObservationSource` es un enum cerrado de LMU (`SourceSharedMemory`, `SourceREST`, `SourceCanonical`). Debe pasar a `SourceSlotID string` abierto, para que ACC declare `"shm"`, `"udp-realtime"`, `"udp-entrylist"` y iRacing `"telemetry"`, `"session-yaml"`.
2. La fusión es **de exactamente dos fuentes** (`fusion.shared`, `fusion.rest`, `fusion.go:103-107`). ACC necesita tres. Debe pasar a `map[SourceSlotID]fusionSource` o un slice, con `AuthorityRule` llevando una **lista ordenada de fuentes** en vez de `Preferred`/`Alternative`.
3. `ruleFor` hace **búsqueda lineal en un array de 38 entradas y hace `panic` si falta** (`fusion.go:179-186`). Con 4 sims y 200 señales es una tabla que debe indexarse por `SignalID` (que es `uint16` → array directo), y ausente debe ser error de construcción, no panic en el hot path.
4. `inferredDecision` (`fusion.go:268-332`) es un `switch` de 30 casos que replica manualmente el mapeo señal→campo. Con multi-sim se convierte en un `switch` de 200 casos. Esto es **exactamente el punto donde una tabla generada valdría la pena**.

### 6.4 ¿Es válido un frame parcial?

**Hoy, no: el contrato es de reemplazo total.** `core.Batch` lleva un `ObservedState` completo y el reducer lo sustituye entero (`core/reducer.go:131-139`). No hay concepto de delta a nivel canónico. La incrementalidad aparece solo en el transporte, vía RFC-7396 merge patch (`internal/app/telemetrytransport/merge_patch.go`).

Es la decisión correcta y hay que mantenerla. Un `ObservedState` completo con `Field.Missing`/`Stale` explícitos por señal es **estrictamente más expresivo** que un frame parcial: un frame parcial no puede distinguir "no cambió" de "dejó de estar disponible". La fusión, y no el reducer, es quien reconstruye el estado total desde llegadas parciales. Ese reparto de responsabilidades es correcto y debe conservarse en la arquitectura simplificada.

Lo que sí falta: **frescura *por fuente* visible al consumidor**. Hoy el widget ve `freshness` por campo, pero no puede saber que "los standings vienen del canal UDP que lleva 3 s sin llegar mientras la física sigue a 60 Hz". Con ACC eso será visible y frecuente. Recomiendo exponer en el frame un pequeño bloque `sources: [{id, state, ageMs}]`, que ya existe en forma embrionaria como `driver.SourceStatus` (`driver/source_status.go:6-13`) pero **nunca llega a la proyección**.

---

## 7. Delta, gaps, standings, relative: autoridad y fallback

### 7.1 Delta nativo vs delta calculado

Vantare tiene **las dos implementaciones** y ese es su punto fuerte y su lío actual.

**Delta derivado** (`derive/delta.go`, ~570 líneas): reconstruye la vuelta de referencia muestreando `(lapDistance, elapsed)` a 10 Hz (`selfDeltaSampleInterval = 100ms`, `delta.go:23`), detecta cruce de meta con máquina de estados (`pendingWrap`, `pendingReset`, `selfDeltaWrapMinimumDrop = 100m`, `delta.go:24`), e interpola linealmente (`interpolateReference`, `delta.go:494-519`). Solo necesita **lap number + lap distance + source time + in pit** — señales del anillo 0/1 que **los cuatro sims exponen**. Es genuinamente multi-sim.

**Delta nativo**: se toma de `VehicleState.DeltaBest` con validación de rango (`delta.go:113-120`: finito, `|v| < 10000`, provenance observed, freshness usable).

La política de autoridad actual es: **si hay nativo, el nativo gana y se publica como `Seconds` y `PersonalBest`; el derivado sobrevive solo como `SessionBest` y `PreviousLap`**:

```go
// internal/telemetry/derive/delta.go:134-142
return SelfDelta{
	Freshness: freshness, Seconds: current.DeltaBest, Reference: reference,
	History: slices.Clone(tracker.history),
	PersonalBest: current.DeltaBest,
	SessionBest:  derived.SessionBest,
	PreviousLap:  derived.PreviousLap,
}
```

Esto es **una fusión implícita de dos autoridades distintas en un mismo struct**, sin declararlo. `SessionBest` es derivado con provenance `Derived`; `PersonalBest` es observado. El widget recibe tres números y elige por configuración de usuario (`delta-definition.ts:8-10`), sin saber que tienen procedencias, latencias y semánticas distintas.

**Diseño correcto**: un único valor + su referencia declarada.

```
delta: {
  value: Field<seconds>,
  reference: "personal-best" | "session-best" | "previous-lap" | "optimal",
  authority: "native" | "reconstructed",
  availableReferences: ["personal-best", "previous-lap"]   // capability
}
```

El widget configura una **referencia preferida**; el Core resuelve `preferida → disponible más cercana → unavailable`, y **declara qué resolvió**. El widget muestra el número y, si `authority = reconstructed` y aún no hay vuelta de referencia, muestra el placeholder. Nada de `deltaReferenceSet` en TS.

Ventaja multi-sim inmediata: iRacing publica `LapDeltaToBestLap`, `LapDeltaToSessionBestLap` **y** `LapDeltaToOptimalLap` — es decir, iRacing soporta *tres* referencias nativas, incluida una (`optimal`) que Vantare no modela. ACC publica una sola (`Delta`, a la mejor de sesión). Con el diseño de campos paralelos habría que añadir `playerDeltaOptimalSeconds` y repetir las 20 modificaciones de §3.1. Con `availableReferences` es un valor más en un array.

### 7.2 Gaps oficiales vs derivados

Hoy: **oficiales del sim, con derivación mínima**. `deriveRelativeGaps` (`derive/gaps.go:46-82`) calcula el gap relativo al jugador **restando los gaps al líder**:

```go
// internal/telemetry/derive/gaps.go:124-154
difference := int64(playerLaps) - int64(currentLaps)      // laps behind leader
result.Laps = mustDerived(standings.RelativeLaps(difference), lapQuality)
if difference != 0 { result.Time = MissingField; return }  // distinto lap → sin tiempo
delta := float64(playerTime) - float64(currentTime)        // time behind leader
result.Time = mustDerived(standings.RelativeTime(delta), timeQuality)
```

Con dos salvaguardas notables: `exactFreshQuality` (`gaps.go:158-178`) exige que **ambos** campos sean observados y con la **misma** freshness, y si los vehículos van en vueltas distintas el gap temporal se declara `Missing` en vez de mentir.

Es sobrio y correcto. Y es **directamente portable a ACC** (que da `Position`/`Laps`) y a **iRacing** (que da `CarIdxF2Time`, el gap en formato "F2" de la retransmisión). Es decir: **el gap relativo por resta de gaps al líder es multi-sim**.

Lo que **no** es multi-sim: la ausencia de un camino alternativo. Si un sim no publicara gaps al líder, `deriveRelativeGaps` devuelve `Missing` y el widget Relative queda vacío. Falta el **fallback por distancia de vuelta**: `gap ≈ (distPct_rival − distPct_player) × longitudDePista / velocidadMedia`. iRacing ofrece `CarIdxEstTime` (tiempo estimado hasta el punto actual) que hace ese cálculo trivial y exacto.

### 7.3 Standings: ¿oficiales o reconstruidos?

Hoy: **oficiales, y el widget ordena en TypeScript**.

```ts
// frontend/src/overlay/widget-types/standings/standings-view-model.ts:68-69
return [...rows].sort(
  (left, right) => (readScoringNumber(left, "place") ?? 99) - (readScoringNumber(right, "place") ?? 99),
);
```

La proyección Go entrega los vehículos **en el orden del array del simulador** (`overlay/v1.go:157-159` itera `state.Vehicles` tal cual, que viene del orden de slots de scoring de LMU). El `99` mágico como posición por defecto es un parche que revela el problema: cuando la posición falta, el orden es arbitrario.

Esto es **lógica de dominio en el widget** y romperá con multiclase en iRacing/ACC, donde hay dos ordenaciones legítimas (`Position` global y `CarIdxClassPosition` / `CupPosition`).

### 7.4 Relative con y sin spatial de rivales

| Sim | XYZ de rivales | Progreso de vuelta | Modo de Relative viable |
|---|---|---|---|
| LMU | **sí** (`WorldPosition` por vehículo, `core/reducer.go:69`) | `LapDistance` en metros | radar espacial + lista |
| iRacing | **no** | `CarIdxLapDistPct` (0–1), `CarIdxEstTime` | lista + barra lineal; **radar imposible** |
| ACC | **parcial**: `WorldPosX`, `WorldPosY`, `Yaw` (sin Z) | `SplinePosition` (0–1) | radar 2D + lista |
| AC EVO | sí (player; rivales según bloque) | sí | por determinar |

Este es **el caso de prueba definitivo del contrato**. La respuesta no es "el widget comprueba si hay `worldPosition`" (eso es inferir capability del dato, §2.3). La respuesta es un **modo declarado**:

```
spatial: {
  mode: "xyz" | "xy" | "lap-distance" | "unavailable",
  frame: "right-handed-z-up",       // convención canónica, no "la de LMU"
  trackLengthMeters: Field<number>  // necesario para convertir pct → metros
}
```

- `mode = "xyz"` → el radar dibuja posiciones reales (LMU).
- `mode = "xy"` → radar 2D plano, sin elevación (ACC). El widget ya sabe que no puede filtrar por altura en un puente.
- `mode = "lap-distance"` → el widget **no dibuja radar**; muestra la variante lineal. Es un cambio de *layout*, no de disponibilidad: el widget lo decide una vez al inicio de la sesión, no cada frame.
- `mode = "unavailable"` → el widget se declara no aplicable y el Studio lo indica.

Y muy importante: **`spatial.mode` se declara en el frame, no lo infiere el widget de la presencia de campos**. Así el widget no hace flicker cuando un frame concreto no trae posición.

Hoy, además, **el Overlay ni siquiera recibe spatial**: `overlay.VehicleV1` (`projection/overlay/v1.go:61-91`) no tiene `WorldPosition`. Solo `engineer.VehicleV1` la expone (`projection/engineer/v1.go:95-97`) bajo `GroupSpatial`. Por eso no hay widget spotter/radar en `frontend/src/overlay/widget-types/` (verificado: no hay carpeta radar/spotter). El Spotter vive en Engineer. Esto significa que el problema del Relative espacial **aún no ha llegado al Overlay**, pero llegará.

### 7.5 Política de autoridad/fallback propuesta (Go)

Un solo lugar, `derive`, con una tabla explícita:

```go
type Authority uint8
const (
	AuthorityNative Authority = iota  // el simulador lo publica
	AuthorityDerived                   // Vantare lo reconstruye
	AuthorityEstimated                 // Vantare lo aproxima con supuestos
	AuthorityUnavailable
)

type Resolution[T comparable] struct {
	Value     schema.Field[T]
	Authority Authority
	Mode      string   // "xyz" | "lap-distance" | "personal-best" | …
}
```

Reglas, en orden y por concepto:

| Concepto | 1ª opción | 2ª opción | 3ª opción | Si nada |
|---|---|---|---|---|
| Delta | nativo con la referencia pedida | nativo con otra referencia (declarando cuál) | reconstruido | `unavailable` |
| Gap al líder | oficial del sim | derivado de `estTime` / `lapDistPct` | estimado por velocidad media | `unavailable` |
| Gap relativo | resta de gaps oficiales (hoy) | resta de `estTime` | por distancia + ritmo | `unavailable` |
| Standings | orden oficial (`position`) | reconstruido por `laps + lapDistPct` | por orden de llegada de datos | `unavailable` |
| Spatial | XYZ | XY | lap-distance | `unavailable` |

Regla de oro: **el downgrade nunca es silencioso**. Cada resolución viaja con su `Authority` y su `Mode` al frame, y el widget puede (opcionalmente) marcar visualmente un valor estimado. Un usuario que ve "+0.312" debe poder saber si es el delta del simulador o el que Vantare reconstruyó.

---

## 8. Respuestas explícitas

**¿Debe existir un modelo canónico interno?**
Sí, y ya existe: `core.ObservedState` + `derive.FinalState`. Es lo que hace que un widget pueda ser escrito una vez. Sin él, cada widget tendría un `if simulator === …`. Conservarlo es innegociable.

**¿MCD o superset?**
Ninguno: **núcleo universal (anillo 0) + capabilities declaradas (anillo 1) + extensiones nativas tipadas (anillo 2)** (§2.2, §3.2C).

**¿Structs, catálogo o ambos?**
Ambos, con roles separados, como hoy: structs para runtime, catálogo para metadatos (id estable, unidad, rango, dominio, ledger). El error actual no es tenerlos, es que **no hay ningún mecanismo que garantice su coherencia** salvo tests manuales. La solución es generar uno desde el otro (§8, codegen).

**¿Generar contratos Go→TS automáticamente? ¿Existe algo hoy?**
Hoy **no hay codegen**. Lo que hay es un **test de fixture**: `internal/app/telemetrytransport/typescript_contract_test.go` valida `testdata/transport_contract_v1.json` contra las constantes Go (eventos, rutas, `MaxPayloadBytes`, versión de proyección). Eso cubre el *transporte*, no el *payload*. Los tipos de `overlay-projection-v1.ts` están **escritos a mano** y decodificados campo a campo con `decodeOptionalField`.

Debe existir codegen, y es la mejora de mayor relación valor/coste de todo este informe. Recomiendo generar **desde el catálogo Go**, no desde los structs (los structs tienen ruido de implementación):

- `catalog.Markdown()` ya existe (`catalog/catalog.go:218-241`) y demuestra que el catálogo es una fuente generadora viable.
- Añadir `catalog.TypeScript()` que emita tipos + decodificadores + nombres de campo, y un test `go test` que falle si el `.ts` generado difiere del commiteado (mismo patrón que el fixture actual, pero cubriendo el payload).
- Esto **elimina de golpe** los pasos "adaptador TS" y "snapshot TS" de la cadena de 20 archivos de §3.1, y sobre todo elimina el renombrado a `place`/`inPits`.

Wails genera bindings de métodos (`frontend/wailsjs/`), pero no del payload de telemetría, que viaja como evento JSON opaco.

**¿Qué se modifica y qué NO al añadir iRacing (con el contrato propuesto)?**

*Se crea*: `internal/telemetry/drivers/iracing/` (reader de shared memory, parser del session YAML, fusión de las dos fuentes, mapper de identidad, declaración de capabilities) e `internal/telemetry/schema/native/iracing/` para incidentes y `F2Time`.

*Se modifica*: el registro de drivers en `internal/app/telemetry_core_runtime.go` (una entrada en el slice de `DriverCandidate`), y el catálogo si aparecen señales nuevas del anillo 0/1 (`lap_distance_pct`, `track_length`, `class_position`).

*NO se toca*: `schema/*`, `core/reducer.go`, `derive/*`, `projection/*`, `frontend/src/overlay/**`. **Cero widgets.**

*Qué se toca hoy, sin el contrato propuesto*: además de lo anterior, `projection/overlay/v1.go` (para los campos nuevos), los cuatro decodificadores TS, `telemetry-snapshot.ts`, los view-models de standings/relative/delta (que hoy asumen `place` y `timeGapToPlayer` y no saben qué hacer sin XYZ), y `internal/app/telemetry_core_runtime.go:170-177` para que el manifiesto de Engineer deje de mentir. Estimo **15–25 archivos**.

**¿Cómo se declara "sin spatial de rivales"?**
`capabilities["spatial.rivals"] = "unsupported"` **y** `modes["spatial.mode"] = "lap-distance"`. Lo primero para que el Studio pueda deshabilitar/avisar; lo segundo para que el widget elija layout. Nunca por ausencia de campo.

**¿Fallbacks sin identificar el sim desde los widgets?**
Sí: todo fallback se resuelve en `derive` y se declara con `Authority` + `Mode` (§7.5). El widget lee el modo, no el simulador. Test de arquitectura: ningún archivo bajo `frontend/src/overlay/widget-types/**` puede contener las cadenas `lmu`, `iracing`, `acc`, `rfactor`, `evo`.

**¿Qué conceptos son realmente universales?**
Universales (anillo 0): sesión y su tipo, tiempo de sesión, parrilla de vehículos con identidad, posición, vueltas completadas, mejor/última vuelta, in-pit, nombre de piloto y coche, controles del jugador, marcha/rpm/velocidad, combustible.
Requieren capability: distancia de vuelta (unidad distinta: metros vs pct), spatial, gaps oficiales, delta nativo, meteorología, multiclase, neumáticos/frenos, penalizaciones, incidentes, energía virtual, asistencias.

**¿Standings recibe filas preparadas o crudo?**
Hoy **crudo**, en orden de slot del simulador, y el widget ordena (`standings-view-model.ts:68`). Debe recibir **filas preparadas**: ordenadas por el Core, con `position`, `classPosition`, `gapToLeader`, `gapToAhead`, `isPlayer`, `lapsDown` ya resueltos, y con la ordenación (`global` o `class`) declarada. La razón no es estética: la reconstrucción de standings cuando el sim no da posiciones fiables (multiclase, coches en boxes, DNF) es lógica de dominio compleja que no puede vivir cuatro veces en cuatro view-models de TS.

**¿Relative y Delta en Go?**
Sí, ambos. El Relative ya está mayormente en Go (`derive/gaps.go`) y funciona bien. El Delta también (`derive/delta.go`), pero su *selección de referencia* se escapó al widget (`delta-view-model.ts:111-118`) y hay que devolverla. El Core debe emitir `RelativeRow[]` y `DeltaView` listos.

**¿Qué lógica visual queda en el frontend?**
Formato de números (decimales, signo, separadores, locale), formato de tiempo (`1:23.456`), unidades de display (km/h vs mph), color y umbrales de color, animación e interpolación entre frames, layout y responsive, truncado de nombres, iconografía, tematización, y **ventanas de visualización** (cuántas filas arriba/abajo mostrar en el Relative — es preferencia, no dominio).

**¿Cómo se configura una columna sin motor de reglas en el widget?**
Con un **enum cerrado de columnas** definido en Go y expuesto como capability por columna:

```
availableColumns: ["position", "driverName", "vehicleClass", "gapToLeader",
                   "gapToAhead", "lastLap", "bestLap", "pitStops", "incidents"]
```

El usuario elige un subconjunto y su orden en el Inspector. El widget hace `columns.map(c => row[c])` sobre un `StandingRow` **tipado**, donde cada celda ya viene como `{ text, tone?, emphasis? }` resuelto por Go. Ni el widget ni el Inspector necesitan saber cómo se calcula `gapToLeader`; y una columna no soportada por el sim activo simplemente no aparece en `availableColumns`. Eso es configuración declarativa, no motor de reglas.

---

## 9. Prueba concreta: añadir el simulador hipotético "SimX"

**SimX**: telemetría del jugador (velocidad, rpm, marcha, pedales, combustible), standings oficiales (posición, vueltas, mejor/última vuelta, in-pit), sin posiciones espaciales de rivales, sin meteorología, sin delta nativo. Publica `lapDistancePct` (0–1) y la longitud de pista. Fuente única a 50 Hz.

### 9.1 Con la arquitectura de HOY

**Archivos nuevos** (`internal/telemetry/drivers/simx/`):

| Archivo | Contenido | Líneas est. |
|---|---|---|
| `layout.go` | offsets/validación del formato de SimX | ~250 |
| `format.go` | parseo a `Observation` con `schema.Field` por señal | ~600 |
| `driver.go` | ciclo de vida, `RuntimeSnapshot`, estados | ~400 |
| `fusion.go` | **hay que escribirlo igualmente** aunque haya una sola fuente, porque no es reutilizable | ~200 |
| `batch_mapper.go` | identidad, epoch, session boundary, generaciones | ~350 |
| `reader_windows.go` / `_stub.go` | acceso al transporte | ~150 |
| tests + goldens | | ~1500 |

**Archivos modificados**:

| Archivo | Cambio |
|---|---|
| `catalog/ids.go`, `catalog/catalog.go` | +2 señales (`standings.lap_distance_pct`, `session.track_length_meters`) — o, peor, reinterpretar `standings.lap_distance` |
| `core/reducer.go` | `VehicleState.LapDistancePct` (o normalizar en el driver a metros usando la longitud de pista, preferible) |
| `internal/app/telemetry_core_runtime.go` | +1 `DriverCandidate`; **y el manifiesto de Engineer sigue diciendo `CapabilitySpatial: Supported`, que ahora es mentira** (líneas 170-177) |
| `projection/overlay/v1.go` | posiblemente nada, si el driver normaliza a metros |
| `frontend/**` | nada obligatorio… pero ver §9.3 |

**Genéricamente**: el Core **no** se rompe. La arquitectura aguanta. El coste real es **~3.500 líneas de driver**, de las cuales **~550 (fusión + partes del mapper) son duplicación pura** de lo que ya existe en `drivers/lmu`.

### 9.2 Con el contrato propuesto

Nuevo: `drivers/simx/{reader,format,driver,identity}.go` + `capabilities.go` (~1.400 líneas + tests). La fusión se reutiliza del paquete compartido (una sola fuente = un slot, configuración trivial). El mapper de identidad usa un helper compartido de slot-generations.

Modificado: el registro de drivers (1 entrada) y el catálogo (2 señales del anillo 1).

**No modificado**: `schema`, `core`, `derive`, `projection`, `frontend` completo.

### 9.3 Comportamiento de cada widget con SimX

| Widget | Capability requerida | Hoy | Con el contrato propuesto |
|---|---|---|---|
| **Standings** | `standings` (anillo 0) | **Funciona**, pero el TS ordena por `place`; si el adaptador de SimX no escribe la clave `place` el widget cae al fallback `index + 1` (`standings-view-model.ts:96`) y **muestra un orden falso sin avisar** | Funciona. Recibe `StandingRow[]` ya ordenado; las columnas no soportadas no aparecen |
| **Relative** | `gaps.relative` | Funciona **si** SimX da `timeBehindLeader`+`lapsBehindLeader` (`derive/gaps.go:113`); si no, `Missing` y el widget queda **vacío sin explicación** (`relative-view-model.ts:55`) | `spatial.mode = "lap-distance"`; el Core deriva gaps desde `lapDistancePct` + ritmo, marcados `AuthorityEstimated`; el widget muestra la variante lineal |
| **Delta** | `delta` | **Funciona**: `derive/delta.go` reconstruye desde lap+distancia+tiempo. Pero el usuario que tenga configurado `personal-best` no verá nada, porque `PersonalBest` solo se rellena desde el nativo (`delta.go:120`) y el fallback del widget depende de `deltaReferenceSet` (`delta-view-model.ts:111-118`) | `delta.availableReferences = ["session-best","previous-lap"]`; el Core resuelve `personal-best → session-best` y lo declara; el widget muestra el valor y la referencia efectiva |
| **Spotter / Radar** | `spatial.rivals` | No existe en Overlay hoy (vive en Engineer). En Engineer **se degradaría mal**: `messagepolicy/scheduler.go:593-595` exige `CapabilitySpatial == Supported` para la familia Spotter, y el manifiesto está hardcodeado a `Supported` (`telemetry_core_runtime.go:174-177`) → **el Spotter intentaría emitir avisos con posiciones ausentes** | `spatial.rivals = "unsupported"` → la familia Spotter se desactiva con `ReasonCapabilityUnavailable` (mecanismo que **ya existe**, `messagepolicy/contract.go:89`), y el Studio marca el widget como no disponible para este sim |
| **Track weather** | `weather` | El widget lee `snapshot.environment?.ambientC` (`telemetry-snapshot.ts:48`), que es opcional → muestra placeholders. **Aceptable por accidente**, porque `weather` no está mapeado ni siquiera para LMU (`catalog.go:69`, `LedgerExistingUnproduced`) | `weather = "unsupported"` → el Studio lo indica al añadir el widget, no en directo |
| **Fuel / strategy** | `energy.fuel` (anillo 0) | Funciona sin cambios | Funciona sin cambios |
| **Pedals / input telemetry** | `controls` (anillo 0) | Funciona sin cambios | Funciona sin cambios |

**Fallback de Delta (detalle)**: `preferida → mejor disponible → unavailable`, resuelto en Go, declarado en el frame. Nunca en el widget.

**Fallback de Spotter (detalle)**: sin XYZ no hay Spotter lateral honesto. Con `lapDistancePct` se pueden emitir avisos de *proximidad longitudinal* ("coche 0,3 s detrás") pero **no** "left"/"right"/"three-wide", que requieren posición lateral. La degradación correcta es **desactivar las familias que requieren lateralidad y mantener las longitudinales**, con capabilities de grano más fino que el actual `spatial` monolítico: `spatial.longitudinal` vs `spatial.lateral`.

---

## 10. Contratos propuestos (pseudocódigo)

### 10.1 Go

```go
// ---------- driver ----------

// SimDriver es lo único que un simulador nuevo implementa.
type SimDriver interface {
	ID() SimID                                     // "lmu" | "iracing" | "acc" | "simx"
	Detect(ctx context.Context) (bool, error)
	Capabilities() CapabilitySet                   // estático: lo que el sim puede exponer
	Run(ctx context.Context, out chan<- SourceFrame) error
	Runtime() RuntimeStatus                        // dinámico: estado por fuente
}

// SourceFrame es lo que produce UNA fuente de UN driver. Puede ser parcial.
type SourceFrame struct {
	Source     SourceSlotID    // "shm" | "rest" | "udp-realtime" | "session-yaml"
	ReceivedAt time.Time
	Elapsed    time.Duration   // monotónico, para TTL
	Session    SessionObservation   // campos Field[T], los ausentes = Missing
	Vehicles   []VehicleObservation
	Native     NativeExtensions     // punteros nil salvo el sim activo
}

// ---------- capabilities ----------

type CapabilityID string

const (
	CapStandings      CapabilityID = "standings"
	CapControls       CapabilityID = "controls"
	CapFuel           CapabilityID = "energy.fuel"
	CapLapProgress    CapabilityID = "progress.lap-distance"
	CapSpatialLong    CapabilityID = "spatial.longitudinal"
	CapSpatialLateral CapabilityID = "spatial.lateral"
	CapGapsOfficial   CapabilityID = "gaps.official"
	CapDeltaNative    CapabilityID = "delta.native"
	CapWeather        CapabilityID = "weather"
	CapMulticlass     CapabilityID = "standings.multiclass"
	CapIncidents      CapabilityID = "incidents"
	CapAssistLevels   CapabilityID = "assists.levels"
)

type CapabilityState uint8  // Unknown | Supported | Degraded | Unsupported
                            // (reutiliza projection/engineer/contract.go:26-33)

type CapabilitySet struct{ entries map[CapabilityID]CapabilityState }

func (s CapabilitySet) State(id CapabilityID) CapabilityState  // Unknown si falta
func (s CapabilitySet) Degrade(id CapabilityID) CapabilitySet  // canal caído

// ---------- estado canónico ----------

type CanonicalState struct {
	Identity  RunIdentity      // Event, Session, Vehicle, Team, Driver  (ya existe)
	Stint     StintID          // NUEVO: tramo entre paradas / cambios de piloto
	Cursor    schema.Cursor    // StreamEpoch + Sequence (ya existe)
	Caps      CapabilitySet
	Sources   []SourceStatus   // NUEVO en el estado: {id, state, ageMs}
	Session   SessionState
	Vehicles  []VehicleState   // ordenado por el Core, no por el sim
	Player    identity.VehicleID
	Native    NativeExtensions
}

// SignalState reemplaza el par (Field, capability inferida).
type SignalState[T comparable] struct {
	Field      schema.Field[T]   // value + present + provenance + freshness
	Capability CapabilityID
	Authority  Authority         // Native | Derived | Estimated | Unavailable
	Source     SourceSlotID      // qué fuente lo ganó (trazabilidad)
}

// ---------- salida a producto ----------

type OverlayFrame struct {
	Meta       FrameMeta                 // versión, epoch, sequence, capturedAt
	Caps       map[CapabilityID]string   // "supported" | "degraded" | "unsupported"
	Modes      Modes
	Session    SessionView
	Player     PlayerView
	Standings  []StandingRow             // YA ordenado
	Relative   []RelativeRow             // YA seleccionado y ordenado
	Delta      DeltaView
	Native     json.RawMessage           `json:",omitempty"`
}

type Modes struct {
	Spatial   string  // "xyz" | "xy" | "lap-distance" | "unavailable"
	Delta     string  // "personal-best" | "session-best" | "previous-lap" | "optimal"
	Standings string  // "official" | "reconstructed"
	Gaps      string  // "official" | "estimated"
}

type StandingRow struct {
	VehicleID     identity.VehicleID
	IsPlayer      bool
	Position      SignalState[int32]
	ClassPosition SignalState[int32]   // Unsupported si el sim no es multiclase
	DriverName    SignalState[string]
	VehicleClass  SignalState[string]
	CompletedLaps SignalState[int32]
	BestLap       SignalState[float64] // segundos
	LastLap       SignalState[float64]
	GapToLeader   SignalState[float64] // segundos; Missing si va a vueltas
	LapsToLeader  SignalState[int32]
	GapToAhead    SignalState[float64]
	InPit         SignalState[bool]
	PitStops      SignalState[int32]
	Penalties     SignalState[int32]
}

type RelativeRow struct {
	VehicleID   identity.VehicleID
	IsPlayer    bool
	GapSeconds  SignalState[float64] // firmado: + adelante, − detrás
	LapDelta    SignalState[int32]
	DriverName  SignalState[string]
	Class       SignalState[string]
	// Solo si Modes.Spatial != "lap-distance":
	RelativeX   SignalState[float64] // metros, marco del jugador
	RelativeY   SignalState[float64]
}

type DeltaView struct {
	Value               SignalState[float64]
	Reference           string   // la efectivamente usada
	RequestedReference  string   // la que pidió el usuario
	AvailableReferences []string
	History             []DeltaSample
}
```

### 10.2 TypeScript (generado desde el catálogo Go, no escrito a mano)

```ts
// GENERATED — do not edit. Source: internal/telemetry/catalog + projection/overlay.

export type CapabilityState = "unknown" | "supported" | "degraded" | "unsupported";
export type Authority = "native" | "derived" | "estimated" | "unavailable";
export type Freshness = "missing" | "fresh" | "stale" | "invalid";

export type Signal<T> = Readonly<{
  value: T | null;          // null === no presente. Nunca 0 como sentinela.
  freshness: Freshness;
  authority: Authority;
  capability: string;
}>;

export type OverlayFrame = Readonly<{
  meta: FrameMeta;
  caps: Readonly<Record<string, CapabilityState>>;
  modes: Readonly<{
    spatial: "xyz" | "xy" | "lap-distance" | "unavailable";
    delta: "personal-best" | "session-best" | "previous-lap" | "optimal";
    standings: "official" | "reconstructed";
    gaps: "official" | "estimated";
  }>;
  session: SessionView;
  player: PlayerView;
  standings: readonly StandingRow[];   // ya ordenado por Go
  relative: readonly RelativeRow[];    // ya seleccionado por Go
  delta: DeltaView;
}>;

export type StandingRow = Readonly<{
  vehicleId: string;
  isPlayer: boolean;
  position: Signal<number>;
  classPosition: Signal<number>;
  driverName: Signal<string>;
  vehicleClass: Signal<string>;
  completedLaps: Signal<number>;
  bestLapSeconds: Signal<number>;
  lastLapSeconds: Signal<number>;
  gapToLeaderSeconds: Signal<number>;
  lapsToLeader: Signal<number>;
  gapToAheadSeconds: Signal<number>;
  inPit: Signal<boolean>;
  pitStops: Signal<number>;
  penalties: Signal<number>;
}>;

// Un widget queda así, sin dominio:
export function buildStandingsViewModel(frame: OverlayFrame, content: StandingsContent) {
  if (frame.caps["standings"] !== "supported") return unavailable("standings");
  return {
    rows: frame.standings.map((row) => ({           // sin .sort()
      cells: content.columns.map((column) => formatCell(row, column, content.units)),
      tone: row.isPlayer ? "player" : "default",
    })),
  };
}
```

Nótese lo que **desaparece**: `Record<string, unknown>`, `readScoringNumber(row, "place") ?? readScoringNumber(row, "position")`, el `.sort()`, el `?? 99`, el `deltaReferenceSet`, y la multiplicación por `3.6` incrustada en el adaptador.

---

## 11. Valoración de las dos arquitecturas

### 11.1 Arquitectura ACTUAL

**Extensibilidad multi-sim: 9 / 18**

| Aspecto | Nota | Justificación |
|---|---|---|
| Existencia de modelo canónico | 3/3 | `core.ObservedState` es real, tipado y product-neutral |
| Calidad del modelo de señal | 3/3 | `Field[T]` con presence/provenance/freshness es de los mejores que he visto en el dominio |
| Aislamiento del driver | 2/3 | El Core no importa LMU, pero absorbió su semántica (9 fugas, §1.3) |
| Declaración de capabilities | 1/3 | Tres sistemas incompatibles; el de Overlay **infiere capability del dato**; el de Engineer está hardcodeado a `Supported` (`telemetry_core_runtime.go:170-177`) |
| Autoridad/fallback declarada | 0/3 | No existe `Authority` ni `Mode`. El fallback de delta acabó **dentro del widget** (`delta-view-model.ts:111-118`) |
| Frontera del contrato | 0/3 | El adaptador destruye el tipado a `Record<string, unknown>` con nombres rF2 (`place`, `inPits`) y los widgets recalculan dominio (`.sort()` en `standings-view-model.ts:68`) |

**Facilidad de añadir señales/widgets: 3 / 10**

| Aspecto | Nota | Justificación |
|---|---|---|
| Añadir una señal | 1/4 | ~20 archivos + 4 locales, medido sobre el diff local de `mDeltaBest` (§3.1) |
| Añadir un widget | 1/3 | Debe reimplementar lectura de un `map` sin tipos, ordenación, formato y fallbacks |
| Seguridad del cambio | 1/3 | Hay goldens y tests fuertes en Go (bueno), pero el frontend no tiene red: una clave mal escrita en `Record<string, unknown>` no la detecta el compilador |

Lo que sí está muy bien y hay que **preservar íntegro** en cualquier reescritura: `schema.Field`, `Provenance`/`Freshness`, `Cursor`/`Transition`, `RunIdentity` con slot generations, la matriz de autoridad con TTL de `lmu.Fusion`, el reducer con validación estricta de cursor, y el ledger append-only del catálogo.

### 11.2 Arquitectura SIMPLIFICADA (drivers → engine canónico → FinalState → OverlayFrame único → un publisher → un store → widgets)

**Extensibilidad multi-sim: 15 / 18**

| Aspecto | Nota | Justificación |
|---|---|---|
| Existencia de modelo canónico | 3/3 | Se conserva `FinalState`; es el núcleo de la propuesta |
| Calidad del modelo de señal | 3/3 | `SignalState` = `Field` + capability + authority + source: estrictamente superior |
| Aislamiento del driver | 3/3 | Con `SourceFrame` genérico y fusión compartida, el driver es la **única** frontera con el sim |
| Declaración de capabilities | 3/3 | Un solo `CapabilitySet`, estable por sesión, declarado por el driver y degradable por canal, viajando en el frame |
| Autoridad/fallback declarada | 2/3 | `Authority` + `Modes` resuelven el problema; −1 porque las políticas de fallback estimado (gap por ritmo, standings reconstruidos) son algoritmos nuevos, no triviales y aún por validar contra un sim real |
| Frontera del contrato | 1/3 | Mejora radical con `OverlayFrame` tipado + codegen; −2 porque **hay que migrar 20 widgets existentes** y el codegen Go→TS no existe todavía: es trabajo real, no un ajuste |

**Facilidad de añadir señales/widgets: 7 / 10**

| Aspecto | Nota | Justificación |
|---|---|---|
| Añadir una señal | 3/4 | Catálogo + driver + (si aplica) una derivación. El TS se genera. Quedan la i18n y el Inspector si la señal es configurable: no es gratis |
| Añadir un widget | 3/3 | Lee `OverlayFrame` tipado, chequea una capability, mapea columnas y formatea. Sin dominio |
| Seguridad del cambio | 1/3 | El codegen elimina la deriva Go↔TS; −2 porque un `OverlayFrame` único es **más grande y más acoplado** que cuatro proyecciones especializadas: un cambio de forma afecta a Overlay, Engineer, Strategy y Analysis a la vez, y `Native json.RawMessage` es un agujero de tipado que hay que vigilar con tests |

### 11.3 Riesgos de la simplificación que conviene nombrar

1. **Un `OverlayFrame` único es un punto de acoplamiento global.** Hoy `overlay.PayloadV1` puede evolucionar sin tocar `engineer.PayloadV1`. Con un frame único se pierde ese aislamiento. Mitigación: mantener frames por producto pero **generados desde un mismo `CanonicalState`**, con codegen; el ahorro real viene del codegen, no de unificar el frame.
2. **Filas preparadas en Go significa más CPU en Go y más JSON.** `StandingRow` con `SignalState` por celda es ~4× el volumen del `VehicleV1` actual. Con 60 coches a 30 Hz hay que medirlo. El merge-patch RFC-7396 lo amortigua (solo viaja el diff), pero el coste de serialización no.
3. **`Native json.RawMessage` reintroduce lo no tipado por la puerta de atrás.** Debe ir acompañado de la regla dura "ningún widget del anillo 0 lo lee" y de un test que la haga cumplir.
4. **Las capabilities estables por sesión son una apuesta.** Si un canal cae a mitad de sesión (el REST de LMU lo hace), `supported → degraded` es un cambio de capability en vivo. Hay que definir con precisión qué puede cambiar dentro de una sesión y qué no, o volveremos al flicker por otra vía.

---

## Fuentes externas

- iRacing SDK — variables de telemetría (`CarIdxLapDistPct`, `CarIdxEstTime`, `CarIdxF2Time`, `CarIdxPosition`, `CarIdxClassPosition`, `CarIdxOnPitRoad`, `SessionUniqueID`, `SessionNum`, `PlayerCarMyIncidentCount`, `LapDeltaToBestLap`, `LapDeltaToSessionBestLap`, `LapDeltaToOptimalLap`, `Speed` en m/s, `FuelLevel` en litros, `AirTemp`/`TrackTempCrew` en °C). Confirmado que **no expone XYZ mundial de rivales**. [sajax.github.io/irsdkdocs/telemetry](https://sajax.github.io/irsdkdocs/telemetry/) — consultado 2026-08-19.
- iRacing SDK — cabeceras y estructura (`irsdk_defines.h`), implementaciones de referencia. [IRSDKSharper](https://github.com/mherbold/IRSDKSharper), [irsdk-go](https://pkg.go.dev/github.com/leonb/irsdk-go) — consultado 2026-08-19.
- ACC Broadcasting API — estructura de `RealtimeCarUpdate` (`CarIndex`, `DriverIndex`, `WorldPosX`, `WorldPosY`, `Yaw`, `Kmh`, `Position`, `CupPosition`, `SplinePosition` 0..1, `Laps`, `Delta` Int32 "realtime delta to best session lap"), `RealtimeUpdate` (`EventIndex`, `SessionIndex`, `SessionType`, `Phase`, `AmbientTemp`, `TrackTemp`, `RainLevel`, `Wetness`) y `CarInfo` (`CarIndex`, `CupCategory`, colección de drivers). Nótese la **ausencia de `WorldPosZ`**. [BroadcastingNetworkProtocol.cs](https://github.com/angel-git/acc-broadcasting/blob/master/BroadcastingNetworkProtocol.cs) — consultado 2026-08-19.
- ACC Broadcasting — SDK en Go, útil como referencia de puerto. [toonknapen/accbroadcastingsdk](https://github.com/toonknapen/accbroadcastingsdk) — consultado 2026-08-19.
- Assetto Corsa EVO — bloques de memoria compartida con nombre `Local\acevo_pmf_*` en Windows, documentados por Kunos en su guía oficial de Steam y transcritos por la comunidad. [dSyncro/acevo-shared-memory](https://github.com/dSyncro/acevo-shared-memory), [live-telemetry-evo SHARED_MEMORY.md](https://github.com/albertowd/live-telemetry-evo/blob/develop/docs/SHARED_MEMORY.md) — consultado 2026-08-19.

**Nota de método**: todo lo referido a Vantare está verificado leyendo el archivo citado en este checkout. Todo lo referido a iRacing, ACC y AC EVO procede de las fuentes de arriba (documentación comunitaria y código de SDKs públicos, no documentación oficial de Kunos/iRacing salvo donde se indica) y **no ha sido verificado contra los simuladores en ejecución**; debe confirmarse antes de implementar un driver.
