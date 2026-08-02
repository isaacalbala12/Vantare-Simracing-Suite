# TC-02A — Inventario de dominios y datos

Fecha de corte: 2026-07-19. Base: `724158a262eaa5dbcc8ab89c98aa74847ffed06b` (`vantareapp/isa-100-tc-00b-separar-y-reconciliar-la-planificacion-de-telemetry`). Issue: ISA-26.

Este documento caracteriza el sistema existente antes del runtime nuevo. No crea schema, cambia offsets, corrige unidades ni convierte consumidores. Cuando el código no permite distinguir “ausente” de un valor cero, se declara como deuda; cero, `false` y cadena vacía no se consideran ausentes por sí solos.

## Convenciones

| Clase | Significado |
| --- | --- |
| `identity` | Identifica sesión, vehículo, piloto o fuente. |
| `attribute` | Propiedad relativamente estable dentro de una sesión. |
| `continuous signal` | Medida que cambia con cada frame. |
| `fact` | Evento o estado discreto observado. |
| `derivation` | Valor calculado, estimado, fusionado o editorial. |

Owners objetivo usados en las tablas: `schema/identity`, `schema/session`, `schema/vehicle`, `schema/controls`, `schema/energy`, `schema/wheels`, `schema/spatial`, `schema/standings`, `schema/pits`, `schema/weather` y `core/lifecycle`. Son fronteras documentales del ADR 0004, no paquetes aprobados ni un schema para implementar.

Calidad: `directo` significa leído del origen indicado; `fusionado` conserva precedencia REST/shared memory; `derivado` no procede directamente de LMU; `legacy` es un contrato productivo a retirar por fases; `placeholder` existe en código pero su offset o semántica no está validado; `no wire` existe en el ViewModel pero no llega desde el payload productivo.

## Cobertura total de rango y frecuencia útil

Esta sección es normativa para **todas** las filas y grupos de todas las tablas de este documento, incluida la matriz Engineer 30/30:

- **RF-0 (fallback total):** si un campo o grupo no coincide con una fila más específica de la matriz RF inferior, su rango semántico actual es `desconocido` y su frecuencia útil actual es `desconocida`; ambos quedan pendientes de TC-03. Por tanto, ninguna fila sin columnas explícitas de rango/frecuencia queda sin cubrir ni adquiere semántica por silencio.
- Los límites del tipo Go/TypeScript no se presentan como rango semántico. Por ejemplo, `uint8` no prueba que LMU utilice todo `0..255`.
- “Por snapshot recibido” describe cuándo lo usa hoy el consumer, no la frecuencia de adquisición de LMU. La cadencia útil en Hz no está fijada por ningún contrato actual y se marca siempre `Hz desconocidos / TC-03`.
- “Por cambio/transición” es una frecuencia útil lógica del consumer, no una promesa sobre polling, debounce o latencia de source.
- Si un selector agrupa campos, la decisión aplica individualmente a cada campo nombrado. Gana la fila más específica; después aplica RF-0.

### Matriz RF — rango y frecuencia útil demostrables

| Selector inequívoco de campos ya inventariados | Rango semántico actual | Frecuencia útil actual | Evidencia/deuda |
| --- | --- | --- | --- |
| Todos los `bool` observados (`Connected`, `PlayerHasVehicle`, `IsPlayer`, pits, garage, timed, flats/detached y equivalentes Engineer) | `{false,true}`; ambos valores válidos | Por cambio de estado; Hz desconocidos | El tipo demuestra el dominio, no presencia ni freshness. |
| Punteros/slices/objetos raíz `Player`, `Session`, `Vehicles`, `Frame.*` | `nil/no nil`, longitud `0..N` sin máximo conocido | Por snapshot recibido; Hz desconocidos | Vacío y ausencia no son equivalentes. |
| Identidades/textos libres: IDs, nombres, track, vehicle/class/team/driver/number, `SessionKey`, `SourceInfo.Kind/Name` | IDs: rango semántico desconocido; textos: conjunto/longitud desconocidos; vacío válido o ambiguo | Útil al alta o cambio de identidad; Hz desconocidos | Estabilidad, normalización y reciclaje pendientes TC-03. |
| Enums informales: `SessionState`, type/name, phase, flags, sectors, pit/finish/qualification/surface y estados frontend | Solo los literales enumerados donde el tipo los fija; códigos/textos LMU restantes desconocidos | Por transición; Hz desconocidos | Publicar catálogo y `unknown` en TC-03. |
| Contadores: lap numbers/totals, vehicles, laps-behind, pitstops, penalties, epoch, wheel-detached count | Rango semántico desconocido; cero puede ser válido | Por snapshot o transición de contador; Hz desconocidos | Base, overflow, sentinel y monotonicidad pendientes. |
| `Speed`, RPM, fuel/cap/fraction, steering, temperaturas, wear, brake temps, pressures, grip, damage, positions y velocidades espaciales | Rango semántico desconocido salvo inputs normalizados indicados abajo | Por snapshot recibido para consumers live; Hz desconocidos | Unidades/rangos físicos y sentinels pendientes TC-03. |
| `Throttle`, `Brake`, `Clutch` Go y snapshot V3 | `0..1` en el contrato normalizado actual | Por snapshot recibido; Hz desconocidos | Cero válido; confirmar rango raw y clipping en TC-03. |
| Tiempos y gaps: session/remaining/lap/best/last/estimated/delta/time-behind/time-into-lap | Rango semántico y signo desconocidos, salvo convención documentada de `TimeGapToPlayer` | Por snapshot; facts de vuelta útiles al cambio de vuelta; Hz desconocidos | Cero, signo, precisión y clock pendientes TC-03. |
| `TimeGapToPlayer` | `float64` firmado; positivo delante y negativo detrás en el contrato actual; magnitud sin cota conocida | Por snapshot recibido; Hz desconocidos | Es derivado por `gap`. |
| Distancias/geometría: lap distance, track length/edge, path lateral, `Vec3`, orientación | Rango/ejes/wrap desconocidos; orientación tiene forma 3x3 | Por snapshot para consumidores espaciales; Hz desconocidos | Sistema de coordenadas y unidad pendientes. |
| Arrays fijos `DentSeverity[8]`, `PitGroup[24]`, tyres `[4]`, filas de orientación | Longitud fija indicada; rango de cada elemento desconocido salvo `bool` | Por snapshot si están wired; en lectores no wired, frecuencia útil desconocida | No validar offsets por forma del array. |
| `TelemetrySnapshot.status` | `{ready,missing,stale,disconnected,error}` | Por transición y render de snapshot | ViewModel, no observación LMU. |
| `TelemetrySnapshot.session.type` | `{practice,qualifying,race,warmup,endurance}`; mapper actual no produce `endurance` | Por cambio de sesión | ViewModel derivado. |
| `capturedAt`, `TimestampUnixMS`, ticks Extended | Rango de reloj/ticks y epoch semántico desconocidos | Por snapshot/mensaje; Hz desconocidos | Separar source/receive/capture en TC-03. |
| Historial frontend input/delta/fuel | Input/delta: máximo 120 muestras; fuel: máximo 64 vueltas; rango de valores heredado del campo | Input/delta por snapshot; fuel por transición de vuelta; Hz de snapshot desconocidos | Bounded store frontend, no adquisición LMU. |
| Schedule auxiliary y environment/damage `no wire` | Rango desconocido salvo forma/tipos declarados | Frecuencia útil productiva desconocida | No hay source productivo en el adapter actual. |
| Extended/PitInfo/Wheel placeholders y PitManager dry-run | Rango desconocido salvo `FuelMult` byte, arrays/bools y unidades anotadas; semántica no validada | Desconocida porque no están wired productivamente | No promover antes de TC-03. |
| Outputs/editorial/heurísticos Engineer (pearls, push, strategy y mensajes de monitores) | Rango/catálogo propio no inventariado como dato observado | Por evento/regla del monitor; cadencia útil no contractual | Son derivaciones/outputs, no nuevas observaciones LMU. |

### Herencia verificable de source y consumer

- **SC-0 (fallback total):** toda fila que no declare source o consumer de forma explícita hereda los de su sección y de la matriz SC inferior. Si tampoco coincide, source y consumer son `desconocidos / TC-03`; nunca se infieren como observados.
- `models.Telemetry`, Player y Session declaran source y consumer por fila o en su cabecera.
- Para `VehicleScoring`, la matriz SC siguiente sustituye las columnas omitidas de source/consumer de cada fila.
- Para Engineer, cada tabla declara la herencia exacta inmediatamente antes o después de ella; la matriz 30/30 lista el consumer y sus inputs, que remiten a campos definidos arriba.

| Campos/grupo | Source actual heredado | Consumer actual heredado |
| --- | --- | --- |
| `VehicleScoring.ID`, nombres/número/equipo/vehículo/clase, place/laps, player/pits/garage/state/sector/finish, gaps/laps-behind, distancias/tiempos, pitstops/penalties/qualification/flag/fuel fraction | Standings REST con fallback/shared memory y fusión de `EnrichedLMUSource` | Relative/standings, flags, overlays Desktop/Studio/OBS y monitores Engineer enumerados en 30/30 |
| `VehicleScoring.TimeGapToPlayer` | Derivación posterior del paquete `gap` sobre standings fusionado | Relative/standings y overlays |
| `TelemetrySnapshot` directo | `UpdateWire` Wails o SSE → `telemetry-adapter.ts` | ViewModels/renderers Overlay Studio/Desktop/OBS |
| `TelemetrySnapshot.derived` | `derived-telemetry-store` frontend | Widgets de fuel/input/delta |
| `TelemetrySnapshot.auxiliary/environment/damage` | Sin wire productivo actual; fixtures/contratos de widget | Widgets respectivos solo cuando un caller aporta esos objetos |
| Engineer `Frame`, Player, Session y Vehicle base | LMU shared memory/REST mediante adapter y service Engineer; simulator/replay son sources legacy seleccionables | Runtime y monitores concretos de la matriz 30/30 |
| Engineer `Position/LocalVelocity/Orientation` y extensiones espaciales | Shared memory mediante adapter Engineer | Spotter; multiclass/pitstops donde la matriz 30/30 lo indica |
| Engineer wheel/damage/temperature extensions | Shared memory mediante decode/offsets Engineer | Tyre, damage y engine según la matriz 30/30 |
| `SourceInfo` | Lifecycle/capabilities del service/source | Diagnóstico/ops |
| Extended/PitInfo/PitManager | Readers shared memory o REST indicados en su tabla | Sin consumer productivo integrado; monitores opcionales/dead wiring señalados como deuda |

## Topología productiva actual

```text
LMU shared memory ── normalizer ─┐
                                ├─ EnrichedLMUSource/fusion ─ pipeline ─ TelemetryService
LMU REST standings/session ─────┘                              ├─ Wails UpdateWire ─ Desktop/Studio
                                                              └─ SSE UpdateWire ─ OBS/browser

LMU shared memory ─ Engineer adapter/service ─ monitores Engineer
Process discovery ─ Launcher trigger (sin campos de simulación)
```

`EnrichedLMUSource` mantiene los campos rápidos del jugador desde shared memory y deja que REST complete sesión/standings. `gap` calcula `TimeGapToPlayer`. `pipeline.Filter` calcula `SessionState`, `SessionKey` y `SessionEpoch`. Wails y SSE transportan el mismo snapshot completo y un diff opcional; no son owners de datos.

## Contrato público Overlay/Desktop/OBS

Fuente de verdad actual: `pkg/models/telemetry.go`. Consumers: `TelemetryBridge`/Wails (Desktop y Overlay Studio V3), servidor SSE (OBS/browser), adaptadores frontend y overlays legacy.

### Raíz `models.Telemetry`

| Campo | Tipo actual | Unidad | Fuente | Clase | Owner objetivo | Presencia/calidad y decisión |
| --- | --- | --- | --- | --- | --- | --- |
| `Connected` | `bool` | booleana | lifecycle de source/service | fact | `core/lifecycle` | Directo del estado de source; `false` es válido. Conservar presencia explícita. |
| `Player` | `*PlayerTelemetry` | — | shared memory/fusión | attribute | proyección Overlay | `nil` expresa ausencia real; no reemplazar por objeto cero. |
| `Session` | `*SessionInfo` | — | scoring REST/shared memory | attribute | proyección Overlay | `nil` expresa ausencia real. |
| `Vehicles` | `[]VehicleScoring` | filas | REST/shared memory fusionado | attribute | proyección Overlay | Vacío puede ser sesión sin filas o dato no disponible; TC-03 debe aportar presencia. |
| `PlayerHasVehicle` | `bool` | booleana | scoring/player match | fact | `schema/identity` | `false` es válido; no inferir ausencia. |
| `SessionEpoch` | `uint64` | contador | `pipeline.Filter` | derivation | `core/lifecycle` | Derivado, monotónico en el proceso; documentar persistencia/reinicio en TC-03. |
| `SessionKey` | `string` | clave | `pipeline.Filter` | derivation | `core/lifecycle` | Incluye hoy `NumVehicles`; eso no debe definir identidad futura. |
| `SessionState` | `string` | enum informal | `pipeline.Filter` | derivation | `core/lifecycle` | Estados legacy; convertir a contrato explícito en TC-03 sin asumir que vacío es offline. |

### `models.PlayerTelemetry`

| Campo | Tipo | Unidad conocida | Fuente actual | Consumer | Clase / owner | Presencia, calidad y decisión |
| --- | --- | --- | --- | --- | --- | --- |
| `ID` | `int32` | slot/id LMU | scoring/shared memory | selección de player, overlays | identity / `schema/identity` | Cero puede ser slot válido; falta presencia explícita. |
| `LapNumber` | `int32` | vueltas | shared memory | lap/fuel/widgets | continuous signal / `schema/session` | Directo; aclarar base 0/1 y transición. |
| `Speed` | `float64` | m/s según comentario Go | magnitud de velocidad local | Desktop/Studio/OBS | continuous signal / `schema/spatial` | Directo. V3 lo asigna a `speedKph` sin conversión; no resolver hasta TC-03. |
| `Gear` | `int32` | marcha LMU | shared memory | input widgets | continuous signal / `schema/vehicle` | Directo; validar reversa/neutro y presencia. |
| `EngineRPM` | `float64` | rpm | shared memory | input widgets | continuous signal / `schema/vehicle` | Directo; cero válido con motor parado. |
| `Fuel` | `float64` | litros, por confirmar LMU | shared memory | fuel widgets | continuous signal / `schema/energy` | Directo; cero válido. Confirmar unidad. |
| `FuelCap` | `float64` | litros, por confirmar | shared memory | fuel/Engineer | attribute / `schema/energy` | Directo; cero no prueba ausencia. |
| `DeltaBest` | `float64` | segundos | nativo LMU o motor AlphaDelta | delta widgets | derivation/fusion / `schema/session` | Provenance cambia por frame y hoy no viaja. TC-03 debe distinguir observado/derivado. |
| `Throttle` | `float64` | 0..1 observado | shared memory | input widgets/historial | continuous signal / `schema/controls` | Directo; cero válido. Frontend normaliza tolerando porcentaje. |
| `Brake` | `float64` | 0..1 observado | shared memory | input widgets/historial | continuous signal / `schema/controls` | Directo; cero válido. |
| `Clutch` | `float64` | 0..1 observado | shared memory | input widgets/historial | continuous signal / `schema/controls` | Directo; cero válido. |
| `Steering` | `float64` | rango LMU desconocido | shared memory | legacy/diagnóstico | continuous signal / `schema/controls` | Directo; signo, rango y saturación pendientes. |
| `VehicleName` | `string` | texto | scoring/shared memory | UI/diagnóstico | attribute / `schema/vehicle` | Vacío puede ser desconocido; necesita presencia. |
| `TrackName` | `string` | texto | shared memory | legacy | attribute / `schema/session` | Duplica `Session.TrackName`; definir fuente canónica. |
| `TimeGapPlaceAhead` | `float64` | segundos | gap engine | relative/widgets | derivation / `schema/standings` | Derivado; cero puede significar empate, no ausencia. |
| `TimeGapPlaceBehind` | `float64` | segundos | gap engine | relative/widgets | derivation / `schema/standings` | Derivado; convención de signo/presencia pendiente. |

### `models.SessionInfo`

| Campo | Tipo | Unidad | Fuente | Consumer | Clase / owner | Presencia, calidad y decisión |
| --- | --- | --- | --- | --- | --- | --- |
| `TrackName` | `string` | texto | REST/scoring | todos | identity / `schema/session` | Fusionado; normalización y estabilidad pendientes. |
| `SessionType` | `int32` | enum LMU | scoring | modo UI/Engineer | attribute / `schema/session` | Directo; documentar enum. |
| `SessionName` | `string` | texto | REST/scoring | modo UI | attribute / `schema/session` | Fusionado; no usar texto como único identity sin normalizar. |
| `SessionTime` | `float64` | segundos | scoring | flags/laps/race time | continuous signal / `schema/session` | Directo; origen/reloj pendiente. |
| `TimeRemainingInGamePhase` | `float64` | segundos | scoring | overlays/Engineer | continuous signal / `schema/session` | Directo; cero es fin válido. |
| `NumVehicles` | `int32` | vehículos | standings | lifecycle/Engineer | continuous signal / `schema/standings` | Cambia por joins/leaves; no pertenece a identidad de sesión futura. |
| `GamePhase` | `uint8` | enum LMU | scoring | flags/session end | fact / `schema/session` | Directo; publicar enum y unknown explícito. |
| `PlayerName` | `string` | texto | scoring | UI/identity heurística | attribute / `schema/identity` | No garantiza identidad estable ni stint/driver. |
| `AmbientTemp` | `float64` | °C aparente | REST/session | Engineer conditions | continuous signal / `schema/weather` | Observado vía REST; confirmar unidad y freshness. |
| `TrackTemp` | `float64` | °C aparente | REST/session | Engineer conditions | continuous signal / `schema/weather` | Observado vía REST; confirmar unidad y freshness. |
| `YellowFlagState` | `string` | enum informal | scoring/normalizer | overlays | fact / `schema/session` | Canonicalización y relación con `GamePhase` pendientes. |
| `SectorFlags` | `[]string` | enum informal por sector | scoring/normalizer | overlays/Engineer | fact / `schema/session` | Orden/número de sectores y unknown pendientes. |

### `models.VehicleScoring`

Todos los campos son por vehículo. Cada fila hereda rango/frecuencia de RF-0 o de su selector RF, y source/consumer de la matriz SC. La fuente predominante es standings REST, con fallback/shared memory y fusión; consumidores principales son relative/standings/flags/Engineer y `TimeGapToPlayer` se deriva después.

| Campo | Tipo | Unidad | Clase / owner | Presencia, calidad y decisión |
| --- | --- | --- | --- | --- |
| `ID` | `int32` | slot/id LMU | identity / `schema/identity` | Directo; cero puede ser válido y el reciclaje de slots debe investigarse. |
| `DriverName` | `string` | texto | attribute / `schema/identity` | No es id estable; vacío no equivale a ausencia. |
| `DriverNumber` | `string` | texto | attribute / `schema/identity` | Formato libre. |
| `TeamName` | `string` | texto | attribute / `schema/vehicle` | REST; normalización pendiente. |
| `VehicleName` | `string` | texto | attribute / `schema/vehicle` | Fusionado; normalización pendiente. |
| `Place` | `uint8` | posición ordinal | continuous signal / `schema/standings` | Cero puede ser no clasificado o desconocido. |
| `TotalLaps` | `int16` | vueltas completadas | continuous signal / `schema/standings` | Directo; confirmar signo/base. |
| `VehicleClass` | `string` | texto | attribute / `schema/vehicle` | REST; clave de clase canónica pendiente. |
| `IsPlayer` | `bool` | booleana | fact / `schema/identity` | `false` válido; derivado por matching en algunos caminos. |
| `InPits` | `bool` | booleana | fact / `schema/pits` | `false` válido; distinguir pit lane/box. |
| `Pitting` | `bool` | booleana | fact / `schema/pits` | REST; semántica respecto a `InPits` pendiente. |
| `InGarageStall` | `bool` | booleana | fact / `schema/pits` | REST; `false` válido. |
| `PitState` | `string` | enum informal | fact / `schema/pits` | REST; enumeración y unknown pendientes. |
| `Sector` | `string` | enum/texto | fact / `schema/session` | REST; canonicalización pendiente. |
| `FinishStatus` | `string` | enum informal | fact / `schema/standings` | REST; enumeración pendiente. |
| `TimeBehindLeader` | `float64` | segundos | continuous signal / `schema/standings` | Observado/fusionado; cero válido para líder. |
| `TimeBehindNext` | `float64` | segundos | continuous signal / `schema/standings` | Observado/fusionado; convención de signo pendiente. |
| `LapsBehindLeader` | `int32` | vueltas | continuous signal / `schema/standings` | Observado; cero válido. |
| `LapsBehindClassLeader` | `int32` | vueltas | continuous signal / `schema/standings` | REST; cero válido. |
| `LapsBehindNext` | `int32` | vueltas | continuous signal / `schema/standings` | Observado; cero válido. |
| `LapDistance` | `float64` | metros, por confirmar | continuous signal / `schema/spatial` | Observado; rango y wrap pendientes. |
| `TimeIntoLap` | `float64` | segundos | continuous signal / `schema/session` | REST; cero válido. |
| `BestLapTime` | `float64` | segundos | fact / `schema/standings` | Observado; cero puede significar sin vuelta y requiere presencia. |
| `LastLapTime` | `float64` | segundos | fact / `schema/standings` | Observado; necesita presencia. |
| `EstimatedLapTime` | `float64` | segundos | derivation / `schema/standings` | Estimación del origen; marcar provenance. |
| `Pitstops` | `int32` | conteo | fact / `schema/pits` | REST; cero válido. |
| `Penalties` | `int32` | conteo | fact / `schema/standings` | REST; no incluye texto/detalle del buffer Extended. |
| `Qualification` | `int32` | posición/estado, desconocido | attribute / `schema/standings` | Semántica exacta pendiente. |
| `Flag` | `string` | enum informal | fact / `schema/session` | Flag por vehículo; enumeración pendiente. |
| `FuelFraction` | `float64` | fracción aparente | continuous signal / `schema/energy` | REST; rango y relación con litros pendientes. |
| `TimeGapToPlayer` | `float64` | segundos | derivation / `schema/standings` | Calculado por `gap`; positivo delante y negativo detrás en el contrato actual. |

## Proyección frontend Overlay Studio V3

`frontend/src/overlay/core/telemetry-snapshot.ts` es un ViewModel puro, no un schema de adquisición. Desktop/Studio reciben Wails; OBS/browser recibe SSE y ambos pasan por `telemetry-adapter.ts`.

| Campo de snapshot | Fuente actual | Clase | Presencia/calidad y decisión |
| --- | --- | --- | --- |
| `status` | conexión, timeout o error del adapter | derivation | `ready/missing/stale/disconnected/error`; conservar como estado de proyección. |
| `capturedAt` | reloj frontend | derivation | milisegundos locales, no timestamp del frame LMU. |
| `session.type` | `SessionType/SessionName` | derivation | Mapea a practice/qualifying/race/warmup; `endurance` existe en tipo pero no lo produce el mapper. |
| `session.remainingSeconds` | `TimeRemainingInGamePhase` | continuous signal | Presencia basada en `undefined`, pero payload Go con `omitempty` pierde cero. |
| `session.key/epoch` | pipeline | derivation | Reenvío del lifecycle legacy. |
| `session.trackName` | `Session.TrackName` | identity | Vacío se convierte en ausente. |
| `session.globalFlag/sectorFlags` | Yellow/Sector flags | fact | Copia de enums informales. |
| `player.inPit` | fila `IsPlayer.InPits` | fact | Fallback `false` mezcla ausencia con valor válido. |
| `player.speedKph` | `Player.Speed` | continuous signal | Nombre KPH, valor backend documentado m/s; deuda crítica para TC-03. |
| `player.rpm/gear/fuelLiters` | player RPM/Gear/Fuel | continuous signal | Availability se infiere por presencia JSON; unidades de fuel por confirmar. |
| `player.totalLaps` | fila player `TotalLaps` | continuous signal | Duplicado funcional con `lapNumber`; semántica pendiente. |
| `player.deltaSeconds` | `DeltaBest` | derivation/fusion | No expone si fue nativo o AlphaDelta. |
| `player.lastLapSeconds/bestLapSeconds` | fila player | fact | Cero/omitido puede perder distinción. |
| `player.lapNumber` | fila player `TotalLaps` | derivation | No usa `Player.LapNumber`; divergencia a resolver, no corregida aquí. |
| `player.predictedLapSeconds` | `EstimatedLapTime` | derivation | Estimación sin provenance. |
| `player.throttle/brake/clutch` | inputs player | continuous signal | Normalizados a 0..1; cero válido. |
| `scoring[]` | copia libre de `VehicleScoring` | attribute | `Record<string, unknown>` es deuda de ViewModel, no propuesta para runtime. Extras de fixtures (`teamBrandColor`, `tireCompound`, `fastestLap`) no están en wire Go. |
| `derived.fuelHistory` | store frontend | derivation | Hasta 64 vueltas; memoria de UI, no observación LMU. |
| `derived.inputHistory` | store frontend | derivation | Hasta 120 muestras normalizadas. |
| `derived.deltaHistory` | store frontend | derivation | Hasta 120 muestras. |
| `auxiliary.scheduleEvents` y sus campos `id/title/track/startAt/durationMinutes/classes/status/license` | datos auxiliares/fixtures | attribute | No wire de telemetría productivo; mantener fuera del core observado. |
| `environment.ambientC/trackC/rainPercent/wetnessPercent/windKph/windDirection/pressureHpa` | contrato de widget/fixtures | continuous signal | Adapter productivo no los llena. Solo ambient/track tienen fuente REST actual en otro contrato. |
| `damage.body/aero/suspension/tyres[4]` | contrato de widget/fixtures | continuous signal | Adapter productivo no los llena; Engineer tiene señales distintas, sin mapping aprobado. |
| `errorMessage` | error de adapter | fact | Metadato de proyección, no dato de simulación. |

## Contrato Engineer actual

Engineer mantiene un modelo duplicado en `internal/engineer/telemetry`. Es consumidor legacy, no owner futuro del schema.

### Raíz y tipos geométricos

| Campo | Tipo/unidad | Fuente | Clase / owner | Calidad/decisión |
| --- | --- | --- | --- | --- |
| `Frame.Connected` | `bool` | source lifecycle | fact / `core/lifecycle` | Conservar estado explícito. |
| `Frame.PlayerHasVehicle` | `bool` | scoring | fact / `schema/identity` | `false` válido. |
| `Frame.Player/Session/Vehicles` | punteros/slice | adapter LMU | attribute | Proyección Engineer del futuro schema. |
| `Frame.TimestampUnixMS` | `int64`, ms Unix | reloj del adapter | fact / lifecycle | Distinguir capture time, source time y receive time. |
| `Vec3.X/Y/Z` | `float64`, sistema LMU desconocido | shared memory | continuous signal / `schema/spatial` | Ejes, handedness y unidad pendientes. |
| `Orientation.Row0/Row1/Row2` | tres `Vec3` | shared memory | continuous signal / `schema/spatial` | Matriz observada; convención pendiente. |
| `SourceInfo.Kind/Name/Live/Available` | strings/bools | service/source | identity/fact / lifecycle | Consumido por diagnóstico/ops; separar capacidad de disponibilidad. |

Los campos base de Player/Session/Vehicle con el mismo nombre que el contrato público conservan tipo, source, consumer, rango y frecuencia útil indicados arriba mediante RF/SC, salvo diferencias enumeradas aquí. Su source heredado es el adapter/service Engineer sobre LMU shared memory/REST y sus consumers exactos son los monitores de la matriz 30/30; no se hereda ningún owner desde Engineer hacia core.

### Extensiones de `engineer/telemetry.PlayerTelemetry`

Source heredado para todas estas filas: shared memory mediante el adapter Engineer; los campos `Wheel*` pasan además por el decode de ruedas y sus offsets. El consumer figura por fila. Rango/frecuencia heredan RF.

| Campo(s) | Tipo | Unidad | Consumer | Clase / owner | Calidad/decisión |
| --- | --- | --- | --- | --- | --- |
| `Position`, `LocalVelocity` | `Vec3` | posición/velocidad LMU; unidad por confirmar | spotter | continuous signal / `schema/spatial` | Directo. |
| `Orientation` | matriz 3x3 | convención desconocida | spotter | continuous signal / `schema/spatial` | Directo. |
| `EngineWaterTemp`, `EngineOilTemp` | `int32` | °C aparente | engine | continuous signal / `schema/vehicle` | Directo; confirmar escala/sentinel. |
| `TyreTempFL/FR/RL/RR` | `int32` | °C aparente | tyre | continuous signal / `schema/wheels` | Directo legacy; confirmar punto de medida. |
| `BrakeTempFL/FR/RL/RR` | `int32` | °C aparente | legacy/no uso focal | continuous signal / `schema/wheels` | Duplicado con WheelBrakeTemp; decidir fuente canónica. |
| `TyreWearFL/FR/RL/RR` | `uint8` | escala desconocida | tyre | continuous signal / `schema/wheels` | Directo legacy; no asumir porcentaje. |
| `DentSeverity[8]` | `[8]int32` | escala LMU desconocida | damage | continuous signal / `schema/vehicle` | Observado; mapping comentado es hipótesis y requiere prueba. |
| `WheelDetachedCount` | `int32` | conteo | damage | fact / `schema/wheels` | Derivado del decode de ruedas; cero válido. |
| `WheelBrakeTempFL/FR/RL/RR` | `float64` | °C confirmado en código | tyre/engine | continuous signal / `schema/wheels` | Offset confirmado localmente; provenance por rueda requerido. |
| `WheelSurfaceType` | `uint8` | enum LMU | tyre | fact / `schema/wheels` | Solo un valor agregado hoy; rueda/origen exacto pendiente. |
| `WheelFlatFL` | `bool` | booleana | tyre | fact / `schema/wheels` | Placeholder; no tratar como dato fiable. |

### Extensiones de Session y Vehicle Engineer

Source heredado: scoring/session LMU mediante el adapter Engineer para `TrackLength`, `SessionLapsTotal` e `IsTimedSession`; shared memory para geometría Vehicle. Consumer figura por fila y rango/frecuencia heredan RF.

| Campo(s) | Tipo/unidad | Consumer | Clase / owner | Calidad/decisión |
| --- | --- | --- | --- | --- |
| `Session.TrackLength` | `float64`, metros aparente | multiclass, pitstops, push, strategy | attribute / `schema/session` | Confirmar unidad y validez por circuito. |
| `Session.SessionLapsTotal` | `int32`, vueltas | fuel/laps/push/strategy | attribute / `schema/session` | Cero documentado como sesión cronometrada; necesita presencia explícita. |
| `Session.IsTimedSession` | `bool` | fuel | derivation/fact / `schema/session` | Confirmar si observado o inferido. |
| `Vehicle.PathLateral`, `TrackEdge` | `float64`, unidad LMU desconocida | spotter/pitstops | continuous signal / `schema/spatial` | Directo; convención de signo/límites pendiente. |
| `Vehicle.Position/LocalVelocity/Orientation` | geometría | spotter | continuous signal / `schema/spatial` | Mismas preguntas de ejes/unidad. |

Engineer no contiene los campos públicos `Pitting`, `InGarageStall`, `LapsBehindClassLeader`, `TimeIntoLap` ni `TimeGapToPlayer`; esa diferencia es contractual, no una propuesta de borrado.

### Lectores y modelos Engineer adicionales

Source figura por fila. Consumer productivo heredado: `ninguno` cuando el estado indica `no integrado`, `no conectado`, `dry-run` o `placeholder`; cuando el valor ya llega al Frame, aplica la fila SC wheel/damage/temperature y la matriz 30/30. Rango/frecuencia heredan RF.

| Contrato/campos | Fuente/unidad | Estado real | Decisión |
| --- | --- | --- | --- |
| `ExtendedData.FuelMult` (`byte`) | Extended shared memory, multiplicador 0x–7x | lector existe; no integrado al frame productivo | Requirement de energy con presencia/provenance; no implementar ahora. |
| `TicksLastHistoryMsg` (`int64` ticks), `LastHistoryMessage` (`string`) | Extended shared memory | no integrados | Facts de historial/penalización; preservar raw + timestamp si se aprueban. |
| `PitSpeedLimit` (`float32`, m/s) | Extended shared memory | no integrado; validez depende de DMA | Requirement de pits con calidad explícita. |
| `OilPressureWarning` (`bool`) | sin dato real | placeholder | No admitir en schema observado. |
| `PitInfoData.PitStopActive`, `PitGroup[24]`, `PitLapDist` | PitInfo shared memory; distancia en unidad por confirmar | reader Windows existe, no conectado | Requirements de pits, no runtime actual. |
| `WheelData.BrakeTemp` | °C | confirmado en código | Candidato observado tras validación TC-03. |
| `WheelData.TempLeft/Center/Right`, `Pressure`, `Wear`, `GripFract`, `Flat`, `Detached` | °C/kPa/0..1/booleanas aparentes | placeholders | No promover hasta verificar offsets y presencia. |
| `WheelData.SurfaceType` | `uint8` enum | lectura directa, semántica parcial | Publicar enum/rueda/provenance antes de usar. |
| `PitMenuStatus.Category/Message/ChoiceID` | REST | cliente pitmanager, sin consumidor productivo final | Requirement futuro de pits; mantener fuera de core hasta ownership. |
| `pitmanager.StandingRow` | REST standings | contrato duplicado, dry-run | Mapear a standings canónico en migración, no duplicar schema. |
| `WeatherData.AmbientTemp/TrackTemp/RainIntensity/CloudBrightness/WindSpeed/WindDirection` | °C, 0..1, m/s, grados aparentes | REST pitmanager, no proyectado al overlay productivo | Requirements weather; freshness/unidad/presencia obligatorias. |

## Matriz Engineer 30/30

La cuenta excluye `replay/testdata`, que es fixture. “Sin telemetría” significa ausencia real de inputs de simulación en ese directorio, no falta de investigación.

Cada input nombrado en esta matriz remite a su fila de campo y hereda su rango/frecuencia RF y source SC. Las salidas heurísticas/editoriales heredan la última fila RF y no se reclasifican como datos observados.

| # | Directorio | Inputs/campos relevantes actuales | Tipo de consumo y deuda |
| ---: | --- | --- | --- |
| 1 | `audio` | Sin `Frame`; recibe `audio.Message` | Salida/side effect. No debe importar schema para reproducir mensajes. |
| 2 | `commands` | Sin `Frame`; texto/intent de voz | Entrada de usuario, no dato LMU. |
| 3 | `conditions` | `Session.AmbientTemp`, `TrackTemp` | Observado REST; lluvia no está en Frame. |
| 4 | `core` | `Frame` completo y resultados de monitores | Orquestación legacy; futuro consumer de proyección Engineer. |
| 5 | `damage` | `Player.DentSeverity`, `WheelDetachedCount` | Observado + interpretación heurística. |
| 6 | `driverswaps` | fila player `Pitstops`, `ID` | Derivación heurística; no hay identidad real de stint/driver. |
| 7 | `engine` | `EngineWaterTemp`, `EngineOilTemp`, `Speed`, Wheel brake temps | Señales observadas; presión de aceite real ausente. |
| 8 | `flags` | `Session.GamePhase/SessionTime/SectorFlags`; player `Place/InPits`; vehicles `Flag/TimeBehindNext/ID` | Mezcla facts y reglas derivadas. |
| 9 | `fuel` | `Player.Fuel/FuelCap/LapNumber`; session timed/time/remaining/laps | Consume observados y deriva consumo/autonomía. |
| 10 | `laps` | `Player.LapNumber`; player row `BestLapTime/TotalLaps/Place`; session time/type/phase/laps | Facts de vuelta + mensajes derivados. |
| 11 | `lmu` | Buffers raw, normalización, Extended/PitInfo/Wheels | Adquisición concreta; extras parcialmente no conectados/placeholders. |
| 12 | `multiclass` | `Player.LapNumber`; `Session.TrackLength/SessionTime`; vehicles class/distance/laps/id/name | Deriva tráfico y ciclos por clase. |
| 13 | `opponents` | vehicle IDs/names/class/place/pits/best lap/finish | Cache/derivación de oponentes. |
| 14 | `pearls` | lap, total de vueltas, posición | Editorial/aleatorio; no dato observado nuevo. |
| 15 | `penalties` | player row `Penalties` | Conteo observado; texto Extended no conectado. |
| 16 | `pitmanager` | REST pit menu, standings y weather | Cliente/dry-run; sin consumidor productivo integrado. |
| 17 | `pitstops` | `InPits/LapDistance/TimeBehindNext/TotalLaps`; `Player.Speed/LapNumber`; track length/type/laps | State machine derivada; unidades/presencia heredadas. |
| 18 | `position` | `Place/TotalLaps/TimeBehindNext`; session type/phase/num vehicles; player lap | Posición y anuncios derivados. |
| 19 | `push` | place/pits/gaps/best lap/laps; session type/track length/remaining/laps | Heurística; requirement futuro, no schema propio. |
| 20 | `racetime` | session remaining/time/game phase | Deriva hitos de tiempo. |
| 21 | `replay` | JSONL de `Frame` | Harness/test; no fuente productiva futura sin gate. |
| 22 | `service` | frames/source status y mensajes runtime | Lifecycle/orquestación legacy. Simulator/replay seleccionables hoy. |
| 23 | `sessionend` | session type/phase/num vehicles; player row place/laps/finish | Detecta final y deriva resumen. |
| 24 | `simulator` | Genera `Frame` sintético | Fallback productivo legacy; futuro solo test según ADR. |
| 25 | `spotter` | posiciones/orientaciones/IDs/pits/lap distance; player speed; game phase; path lateral | Geometría observada + inferencia espacial. |
| 26 | `strategy` | fuel/cap; sector/pits/lap distance/gaps/place; session time/track length/laps/remaining | Heurística existente; documentar requirements, no mover a Product B en ISA-26. |
| 27 | `telemetry` | Declara `Frame`, Player, Session, Vehicle, Vec3, Orientation, SourceInfo | Modelo duplicado legacy; candidato a proyección, no owner futuro. |
| 27a | `telemetry/service` | frames y lifecycle de `Source` con timestamp | Subpaquete del dominio `telemetry`; adquisición/orquestación legacy y migración futura por puertos. |
| 28 | `timings` | player row gaps/place/sector/pits; otras filas place/gap | Deriva mensajes relativos. |
| 29 | `tyre` | lap, tyre temps/wear, Wheel brake temps/surface/flat | Señales mixtas: confirmadas, legacy y placeholder; no homogeneizar sin TC-03. |
| 30 | `watchedopponents` | IDs/names/class/place/timeBehindLeader y player fields | Estado configurado + derivación. |

La ruta física contiene 31 directorios inmediatos si `telemetry/service` se cuenta además de su padre. El inventario operativo previo cuenta 30 dominios porque trata `telemetry/service` como subpaquete del dominio `telemetry`; la tabla conserva ambos renglones para no ocultar ningún consumidor. Por tanto, cobertura: **30/30 dominios**, **31/31 rutas Go relevantes**, más `replay/testdata` excluido como fixture.

## Launcher y consumidores live adicionales

| Consumidor | Datos usados | Decisión |
| --- | --- | --- |
| Desktop shell / Overlay legacy | `models.Telemetry` completo vía Wails `UpdateWire` | Proyección externa; no puede ser importada por core/schema. |
| Overlay Studio V3 | `TelemetrySnapshot` vía Wails/coordinator | ViewModel puro; historial frontend es derivado. |
| OBS/browser | mismo `UpdateWire` vía SSE | Transporte externo; SSE no entra en core/schema. |
| Server/API | secuencia, snapshot y diff | Boundary de transporte, no owner. |
| Diagnóstico/ops | `SourceInfo` y estado de sources | Consumer lifecycle; no mezclar con campos de simulación. |
| `cmd/lmu-debug`, `cmd/lmu-test` | buffers/contratos LMU para diagnóstico | Herramientas; se excluyen del grafo productivo del test arquitectónico. |
| Launcher | identidad/estado del proceso LMU para trigger | No consume campos de telemetry del simulador. Mantener process discovery fuera del schema. |
| Engineer service | `engineer/telemetry.Frame` desde source LMU/simulator/replay | Consumer legacy independiente; migrará por proyección, no import inverso. |

No se encontró otro consumidor live de campos de simulación fuera de estos caminos mediante la búsqueda reproducible inferior.

## Requirements futuros, sin schema ni implementación

Strategy/Product B necesita, como requirements: identidad estable de sesión/stint/vehículo; combustible observado con unidad y presencia; laps y tiempo restantes; estado de pits; standings/gaps con provenance; track length y lap distance; y derivaciones de consumo/autonomía separadas de hechos. El monitor `internal/engineer/strategy` existente sigue siendo consumer legacy y no define el dominio futuro.

Analysis necesita como requirements: timestamp de source/recepción, calidad y freshness; provenance por campo; snapshots/eventos reproducibles; definición estable de unidades; y acceso a hechos observados sin depender de Overlay, Engineer, LMU concreto o DB. Recording/Analysis no se implementan en ISA-26 y no se propone `map[string]any` ni event sourcing completo.

## Preguntas LMU obligatorias para TC-03

1. Confirmar unidades y escalas de speed (m/s), fuel/fuel cap, lap distance, track length, posiciones, velocidades locales, steering, temperaturas y desgaste.
2. Corregir contractualmente —no por nombre solamente— la divergencia `Speed` m/s → `speedKph` V3 y verificar el overlay legacy que multiplica por 3.6.
3. Definir presencia por campo sin usar cero/`false`/vacío como sentinel; revisar el efecto de JSON `omitempty`.
4. Separar source timestamp, receive timestamp y capture timestamp; definir freshness por source REST/shared memory.
5. Documentar enums y unknown para gear, game phase, flags, sector, pit state, finish status, surface type y session type.
6. Definir identidad estable de sesión sin `NumVehicles`; documentar rotación/reuso de slot IDs y cambios de piloto/stint.
7. Publicar precedence y provenance por campo cuando REST y shared memory difieren; incluir delta nativo frente a AlphaDelta.
8. Validar convención de signo y presencia de todos los gaps; distinguir vuelta de diferencia de segundos.
9. Validar offsets de Wheels/Extended/PitInfo y rechazar explícitamente placeholders no confirmados.
10. Aclarar mapping de `DentSeverity[8]`, escalas de daño y relación con los ViewModels `body/aero/suspension/tyres`.
11. Aclarar lluvia, wetness, viento, presión y cloud brightness: fuente, unidad, frecuencia y qué está realmente disponible.
12. Definir pit lane, pitting, garage stall, pit active y pit group sin colapsarlos en un booleano.
13. Aclarar `FuelFraction`, `Fuel`, `FuelCap` y `FuelMult`, y cuál es observado frente a derivado.
14. Resolver `Player.LapNumber` frente a `Vehicle.TotalLaps`; hoy V3 publica el segundo como `lapNumber`.
15. Decidir si simulator/mock puede seguir siendo fallback productivo; ADR 0004 lo reserva para tests tras la migración.

## Búsqueda reproducible

La cobertura de metadatos se comprueba primero. RF-0 y SC-0 son reglas totales: toda fila de campo/grupo queda cubierta aunque la respuesta honesta sea `desconocido / TC-03`; los marcadores específicos verifican las herencias de las tablas agregadas:

```powershell
$inventoryPath = "docs/telemetry-core/domain-inventory.md"
$inventory = Get-Content $inventoryPath -Raw
$coverageMarkers = @(
  "**RF-0 (fallback total):**",
  "**SC-0 (fallback total):**",
  "Cada fila hereda rango/frecuencia de RF-0 o de su selector RF, y source/consumer de la matriz SC.",
  "Source heredado para todas estas filas: shared memory mediante el adapter Engineer",
  "Cada input nombrado en esta matriz remite a su fila de campo y hereda su rango/frecuencia RF y source SC."
)
$coverageMarkers | ForEach-Object {
  if (-not $inventory.Contains($_)) { throw "Falta marcador de cobertura: $_" }
}
$fieldRows = (Select-String -Path $inventoryPath -Pattern '^\| `').Count
if ($fieldRows -eq 0) { throw "No se encontraron filas de campos/grupos" }
"PASS: $fieldRows filas de campos/grupos bajo cobertura total RF-0/SC-0"
```

Después se reproducen sources y consumers en código:

Ejecutar desde la raíz `vantare-v2`:

```powershell
rg -n "models\.Telemetry|PlayerTelemetry|SessionInfo|VehicleScoring|UpdateWire|Subscribe|SSE" .
rg -n "TelemetrySnapshot|TelemetryRefState|speedKph|environment|damage|derived" frontend/src
rg -n "telemetry\.Frame|\*telemetry\.Frame|Frame\)" internal/engineer
rg -n "Fuel|Speed|LapNumber|SessionTime|TrackLength|Position|Orientation|Pit|Flag|Temp|Wear|Gap" internal/engineer
Get-ChildItem internal/engineer -Directory -Recurse | Sort-Object FullName
rg -n "launcher|process|SourceInfo|lmu-debug|lmu-test" cmd internal frontend/src
go list -deps ./internal/telemetry/...
```

Estas búsquedas inventarían coincidencias si se interpretaran solas; las tablas anteriores se verificaron contra las declaraciones de modelo, adaptadores y consumers. No se abrieron secretos ni se consultaron valores de entorno.

## Decisiones de ISA-26

- El owner futuro de datos observados es Telemetry Core/schema; Overlay, Engineer, Strategy y Analysis son consumers por proyección o puertos.
- Los contratos duplicados permanecen intactos hasta cortes posteriores.
- Los derivados conservan nombre y provenance conceptual separados de observaciones.
- Un dato sin presencia/calidad demostrable queda como deuda, no se rellena con cero ni mock.
- Este inventario cierra alcance documental; TC-03 debe resolver semántica antes de crear el schema runtime.
