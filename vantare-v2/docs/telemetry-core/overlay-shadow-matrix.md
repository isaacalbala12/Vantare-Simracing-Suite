# TC-07A — Matriz old/new de consumidores Overlay

Estado: contrato de preflight de ISA-105. Esta matriz describe lo que existe en
la base `3b44d36713213ab642f47174c1b5d8234362cac0`; no concede paridad a señales
ausentes.

## Contrato posterior ISA-129 / TC-07A.1 D0

ISA-105 cerró el comparator, no las señales ausentes. ISA-129 parte de
`c9acee24cf4c4d80922b380b12f7367c2a60c937` y debe cerrar primero el contrato
de procedencia documentado en
`docs/telemetry-core/lmu-overlay-signal-provenance.md`.

Bloqueadores P0 vigentes antes de cualquier shadow wiring:

1. el fallback `createMockSource()` puede llegar a producción como telemetría
   `Connected=true`;
2. no existe el bridge real `lmu.Observation -> core.Batch`;
3. la observación modular es player-only y no ofrece parrilla ni identidad
   multivehículo estable.

La allowlist cerrada de ISA-129 admite desde Shared Memory, con presencia y
calidad explícitas: sesión current/end/max laps, grid y slot numérico, labels
de piloto/vehículo/clase, scoring, tiempos de vuelta, gaps de clasificación,
pit/penalties, fast telemetry del jugador y fuel/capacidad. Remaining, relative
gap y self delta son derivados con referencia y signo documentados. REST solo
puede complementar campos equivalentes de sesión/jugador; nunca crea filas,
IDs o valores de rivales.

La unión scoring/telemetry queda cerrada sobre las filas activas
`[0,mNumVehicles)`: ambos conjuntos de IDs deben ser no negativos, únicos y
biyectivos. El jugador se elige por `mIsPlayer` en scoring y luego por ID igual
en telemetry. La cola inactiva se ignora y `mPlayerVehicleIdx`,
`mPlayerHasVehicle`, posición y orden nunca seleccionan al jugador. La fixture
real demuestra 44/44 IDs activos y 60 filas telemetry inactivas con ID cero;
una no-biyección activa invalida el frame completo.

Permanecen missing —no cero— equipo, número, compuesto, Virtual Energy, daños,
weather no admitido, fases/banderas, pit-state labels, el remaining raw,
`FuelFraction` y native `mDeltaBest`. La compatibilidad productiva continúa
fijada a los fixtures LMU 1.3; LMU 1.4 requiere la evidencia diagnóstica D4B.

D0 no cambió la clasificación original. D1-D6 cerraron el mock, el driver, la
normalización, el bridge canónico y las derivaciones. D7 proyecta solo esas
señales ya demostradas y actualiza la clasificación 18/18 que aparece debajo.

## Contrato aditivo D7

Overlay Projection continúa en v1. Las claves base no cambian y las nuevas son
opcionales para mantener las cuatro combinaciones old/new. El golden exacto
anterior a D7 vive en `overlay_v1_pre_d7.golden.json`:

- productor antiguo → consumidor antiguo: superficie base idéntica;
- productor antiguo → consumidor nuevo: cada campo D7 se normaliza a
  `present=false`, `freshness=missing`, `provenance=unknown`;
- productor nuevo → consumidor antiguo: las extensiones seguras se ignoran;
- productor nuevo → consumidor nuevo: Go, transporte, decoder y adapter
  conservan valores, calidad y ceros legítimos.

Una clave D7 conocida pero inválida se rechaza; no se interpreta como ausente.
No se amplió `capabilities`, porque añadir enums rompería al consumidor v1
anterior. La disponibilidad fina está en cada `Field` y en quality metadata.

## Autoridades inspeccionadas

- Legacy → `frontend/src/overlay/core/telemetry-adapter.ts`
- Frontera legacy → `frontend/src/overlay/core/telemetry-snapshot.ts`
- Registro de consumidores →
  `frontend/src/overlay/core/widget-registry.ts`
- Lectores de scoring →
  `frontend/src/overlay/widget-types/shared/scoring-readers.ts`
- Proyección nueva →
  `internal/telemetry/projection/overlay/v1.go`
- Calidad de campos →
  `internal/telemetry/projection/contracts.go`
- Derivaciones disponibles →
  `internal/telemetry/derive/pipeline.go`
- Transporte TypeScript →
  `frontend/src/telemetry-transport/contracts.ts`

## Vocabulario

- **Exact:** la proyección contiene la misma señal y semántica necesaria para
  construir el ViewModel.
- **Partial:** una parte útil es comparable, pero el ViewModel completo necesita
  campos que la proyección no contiene.
- **Not comparable:** falta la señal central que da significado al widget.
- **External:** el dato no pertenece a telemetría live y no debe introducirse en
  `overlay.PayloadV1`.

`Partial` y `Not comparable` son mismatches visibles. No equivalen a PASS.

## Inventario completo: 18 tipos registrados

| Tipo registrado | Consumo real del ViewModel | Campo nuevo disponible | Campo ausente o incompatible | Cobertura |
|---|---|---|---|---|
| `delta` | `player.deltaSeconds`, last/best/predicted lap, lap y player scoring | delta self-reference, last/best/estimated lap, lap/completed laps | nada central; referencia limitada a mejor vuelta completa del jugador | Exact |
| `standings` | sesión/remaining, id, place, número, piloto, clase, equipo/color, gaps/interval, vueltas, pit, compuesto | remaining, id, position, piloto, clase, completedLaps, pit, gaps y tiempos | número, equipo/color, fastest lap y compuesto; gap de modo qualifying sigue parcial | Partial |
| `relative` | id, place, isPlayer, `timeGapToPlayer`, clase, número, piloto y tiempos | id, position, isPlayer, gap relativo, piloto, clase y tiempos | número de coche | Partial |
| `pedals` | throttle, brake, clutch y status | los tres ratios del player | nada para el valor instantáneo | Exact para valor instantáneo |
| `broadcast-tower` | sesión, lap/total, place, número, piloto, equipo, clase, gap, color y player | sessionType, lap/completedLaps, position, player ID, piloto, clase y gap | número, equipo y color | Partial |
| `fuel-strategy` | fuel, remaining, last lap y fuel history | fuel del jugador, remaining y last lap | historial de consumo, promedio y required fuel | Partial |
| `pedals-telemetry` | controles, speed, rpm, gear, player place y status | controles, speedMps, rpm, gear, position | legacy etiqueta m/s como `speedKph`; no se acepta el factor 3,6 como tolerancia | Partial hasta corregir la unidad legacy |
| `pedals-telemetry-compact` | controles, speed, rpm, gear y status | todos los valores instantáneos | legacy etiqueta m/s como `speedKph`; no se acepta el factor 3,6 como tolerancia | Partial hasta corregir la unidad legacy |
| `racing-flags` | global flag y sector flags | ninguno | control de carrera y flags | Not comparable |
| `delta-trace` | `derived.deltaHistory` | historial acotado con tiempo de fuente, distancia y delta self-reference | sectores, insight y mapa | Partial |
| `race-schedule` | `auxiliary.scheduleEvents` | no aplica | calendario local/remoto, ajeno a live telemetry | External |
| `head-to-head` | place, piloto, equipo, clase, gap y sectores | señales proyectadas, pero aún sin correlación de calidad específica para el rival seleccionado | todos los campos quedan bloqueados hasta atribuir calidad por entidad | Not comparable |
| `delta-advanced` | delta best/sector/theoretical/last | best self-reference | sector, theoretical y last | Partial |
| `input-telemetry` | controles, speed, rpm, gear e historial recibido aparte | valores instantáneos y muestras sin tiempo individual | timestamp exacto de cada muestra para la traza | Partial |
| `multiclass-relative` | place, class, color, number, piloto, gap y player | position, player ID, piloto, clase y gap relativo | color y número | Partial |
| `track-weather` | ambient, track temp, rain, wetness, wind y pressure | ninguno; `trackName` no alimenta este ViewModel | todas las condiciones ambientales | Not comparable |
| `car-damage-visual` | body, aero, suspension y tyres | ninguno | todos los daños | Not comparable |
| `car-damage-numbers` | body, aero, suspension y tyres | ninguno | todos los daños | Not comparable |

## Evidencia exacta por builder

La policy TypeScript debe repetir estos 18 contratos y el test compara sus keys
con `widgetTypeRegistry.list()` para detectar tipos nuevos u huérfanos.

| Tipo | Builder | Paths de telemetría activables |
|---|---|---|
| `delta` | `buildDeltaViewModel` en `widget-types/delta/delta-view-model.ts` | `player.deltaSeconds`, `bestLapSeconds`, `lastLapSeconds`, `predictedLapSeconds`, `lapNumber`; player scoring `totalLaps/estimatedLapTime` |
| `standings` | `buildStandingsViewModel` en `widget-types/standings/standings-view-model.ts` | `session.type/remainingSeconds`; scoring `id/place/isPlayer/driverNumber/driverName/vehicleClass/teamCode/teamBrandColor/gaps/laps/lap times/pit/tireCompound` según columnas |
| `relative` | `buildRelativeViewModel` en `widget-types/relative/relative-view-model.ts` | scoring `id/place/isPlayer/timeGapToPlayer/vehicleClass/driverNumber/driverName/bestLapTime/lastLapTime` según columnas |
| `pedals` | `buildPedalsViewModel` en `widget-types/pedals/pedals-view-model.ts` | `player.throttle/brake/clutch` |
| `broadcast-tower` | `buildBroadcastTowerViewModel` en `widget-types/broadcast-tower/broadcast-tower-view-model.ts` | `session.type`, `player.lapNumber/totalLaps`; scoring `place/isPlayer/driverNumber/name/team/class/gap/color` |
| `fuel-strategy` | `buildFuelStrategyViewModel` en `widget-types/fuel-strategy/fuel-strategy-view-model.ts` | `session.remainingSeconds`, `player.fuelLiters/lastLapSeconds`, `derived.fuelHistory` |
| `pedals-telemetry` | `buildPedalsTelemetryViewModel` en `widget-types/pedals-telemetry/pedals-telemetry-view-model.ts` | `player.throttle/brake/clutch/speedKph/rpm/gear`; player scoring `place` |
| `pedals-telemetry-compact` | `buildPedalsTelemetryCompactViewModel` en `widget-types/pedals-telemetry-compact/pedals-telemetry-compact-view-model.ts` | `player.throttle/brake/clutch/speedKph/rpm/gear` |
| `racing-flags` | `buildRacingFlagsViewModel` en `widget-types/racing-flags/racing-flags-view-model.ts` | `session.globalFlag/sectorFlags` |
| `delta-trace` | `buildDeltaTraceViewModel` en `widget-types/delta-trace/delta-trace-view-model.ts` | `derived.deltaHistory` |
| `race-schedule` | `buildRaceScheduleViewModel` en `widget-types/race-schedule/race-schedule-view-model.ts` | `auxiliary.scheduleEvents`; externo al core live |
| `head-to-head` | `buildHeadToHeadViewModel` en `widget-types/head-to-head/head-to-head-view-model.ts` | scoring `place/isPlayer/name/team/class/gap/sectorComparisons` |
| `delta-advanced` | `buildDeltaAdvancedViewModel` en `widget-types/delta-advanced/delta-advanced-view-model.ts` | `player.deltaSeconds` |
| `input-telemetry` | `buildInputTelemetryViewModel` en `widget-types/input-telemetry/input-telemetry-view-model.ts` | `player.throttle/brake/clutch/speedKph/rpm/gear`; historial explícito separado |
| `multiclass-relative` | `buildMulticlassRelativeViewModel` en `widget-types/multiclass-relative/multiclass-relative-view-model.ts` | scoring `place/isPlayer/class/name/driverNumber/teamBrandColor/gap` |
| `track-weather` | `buildTrackWeatherViewModel` en `widget-types/track-weather/track-weather-view-model.ts` | `environment.*` |
| `car-damage-visual` | `buildCarDamageVisualViewModel` en `widget-types/car-damage-visual/car-damage-visual-view-model.ts` | `damage.body/aero/suspension/tyres` |
| `car-damage-numbers` | `buildCarDamageNumbersViewModel` en `widget-types/car-damage-numbers/car-damage-numbers-view-model.ts` | `damage.body/aero/suspension/tyres` |

La policy usa contenidos no predeterminados que activen columnas/campos
opcionales. Campos derivados solo del content se comprueban como invariantes,
no como evidencia de paridad telemétrica.

## Campos old/new

### Metadatos y sesión

| Frontera ViewModel | Legacy | Overlay v1 | Regla |
|---|---|---|---|
| `capturedAt` | tiempo del adapter frontend | `ReceivedUTC` del envelope | no comparable salvo correlación explícita del mismo frame |
| `status` | connected/error/stale de adapter/store | estado de transporte | no inferir de valores |
| `session.type` | `sessionType/sessionName` | `sessionType` tipado | exacto para valores conocidos |
| `session.trackName` | `trackName` | `trackName` Field | solo si usable |
| `remainingSeconds` | `timeRemaining` | derivado de end/source time | exacto si ambos campos fuente son válidos |
| `session.key/epoch` | clave/epoch legacy | epoch solo en envelope | no fabricar key; epoch puede conservarse |
| flags | global/sector legacy | ausente | mismatch |

### Player y controles

| Frontera ViewModel | Overlay v1 | Regla |
|---|---|---|
| player | `playerVehicleId` | resolver por ID, nunca por índice |
| `speedKph` | `speedMps` | multiplicar por 3,6 en el adapter correcto; registrar mismatch contra el legado que hoy etiqueta m/s como kph |
| `rpm` | `engineRpm` | exacto salvo redondeo demostrado |
| `gear` | `gear` | exacto |
| throttle/brake/clutch | ratios `0..1` | tolerancia absoluta `1e-6`; preservar cero |
| `inPit` | `inPit` | exacto; preservar false |
| `lapNumber` | `lapNumber` | exacto si está presente |
| `totalLaps` | `completedLaps` | exacto con esa semántica |
| `deltaSeconds` | self delta contra mejor vuelta completa del jugador | preservar signo y referencia explícita |
| fuel/lap times | fuel split amount/capacity y best/last/estimated lap | emitir solo cada campo usable; capacidad no se fuerza en un target sin consumidor |

### Scoring

Cada vehículo nuevo puede producir:

- `id`;
- `place`, si `position` es usable;
- `totalLaps`, si `completedLaps` es usable;
- `inPits`, si `inPit` es usable;
- `isPlayer`, derivado por igualdad de ID.
- `driverName`, `vehicleClass`, sector y distancia de vuelta;
- best/last/estimated lap;
- penalties, gaps al líder/siguiente y relative gap/lap delta;
- fuel del jugador cuando está presente.

`vehicle.name` sigue solo en quality/diagnóstico: el nombre de piloto procede
exclusivamente de `driverName`. No debe producir claves con un zero-value que
simule:

- número del coche;
- equipo;
- color;
- compuesto;
- pit-stop count visible, salvo que un consumidor lo adopte explícitamente.

## Calidad y estado

Un `projection.Field` es **usable** cuando:

1. `present=true`;
2. `freshness` es `fresh` o `stale`;
3. `freshness` no es `invalid`;
4. el valor pasa la validación de dominio.

La calidad se conserva en metadata diagnóstica por path:

- `fresh` → comparable;
- `stale` → valor conservado y mismatch `stale-projection`;
- `missing` → no se emite clave en `TelemetrySnapshot`;
- `invalid` → no se emite clave y mismatch `invalid-projection`;
- `estimated` → procedencia visible, nunca equivalente silenciosamente a
  observado.

Un campo stale aislado no degrada widgets que no lo consumen. El status global
del transporte sí se traduce al status global del snapshot.

El comparator mantiene un mapa tipado `ViewModel path -> source paths`. Si una
fuente está stale, invalid o missing, la salida dependiente nunca puede quedar
`equal` aunque el valor coincida por casualidad.

Para listas, la calidad se resuelve por la identidad interna de cada vehículo y
su índice real en la proyección. Los IDs solo sirven durante el cálculo: el
reporte conserva paths genéricos como `vehicles[].position`. Broadcast Tower no
usa la posición como identidad y detecta un cambio de coche en la misma plaza.

Los fallbacks conservan su orden semántico. Por ejemplo,
`lapNumber ?? totalLaps` consulta la calidad de `lapNumber` siempre que el valor
exista; solo cae a `totalLaps` cuando el primero es realmente `undefined`.

## Historial de controles

`controlsHistory` contiene cursor y ratios, pero no el tiempo individual de cada
muestra. `DerivedInputSample` exige `capturedAt`. ISA-105 no debe:

- asignar el timestamp exterior a todas las muestras;
- asumir una frecuencia;
- reconstruir tiempo desde sequence;
- inventar offsets.

En este bloque, `present` significa que hay muestras almacenadas y `freshness`
describe el estado actual de la señal. Por ello son estados legítimos tanto
`present=true` con `missing/invalid` como `present=false` con `stale`; solo se
exige coherencia entre `present` y la existencia real de muestras.

El valor instantáneo se compara. El historial se clasifica `partial` y el
informe registra `controlsHistory.samples[*].capturedAt` como no representable.
ISA-106 puede comparar una traza continua construida frame a frame sin alterar
el contrato histórico.

## Políticas de comparator

| Familia | Política |
|---|---|
| presencia/status/boolean/enum/posición/vueltas | exacta |
| ratio de controles | abs `<= 1e-9` para el mismo frame |
| velocidad raw | abs `<= 1e-6 m/s` para el mismo frame; factor 3,6 nunca es tolerancia |
| velocidad ViewModel | comprobar conversión `m/s × 3,6`; abs `<= 3,6e-6 km/h` |
| RPM | abs `<= 1e-6 rpm` para el mismo frame |
| tiempo/delta | abs `<= 1e-6 s` solo con la misma referencia/frame |
| strings sensibles | igualdad interna; valores redactados en el reporte |
| arrays | longitud, identidad y orden por separado |
| ausencia nueva | `unsupported-by-projection`, nunca equal |
| stale/invalid | categorías propias, nunca equal |

## Sanitización

El reporte puede publicar:

- widget type;
- path cerrado;
- clasificación;
- tolerancia aplicada;
- números no identificables;
- conteos.

Debe redactar o excluir:

- nombres de piloto/equipo;
- IDs de vehículo, Steam o cuenta;
- rutas;
- payload completo;
- estrategias, voz, tokens, logs y raw;
- mensajes de error externos.

Los tests inyectan canarios únicos en nombre, equipo, ID, ruta y mensaje de
error. Ningún canario puede aparecer en el objeto de reporte, su JSON ni el
DOM. Los paths usan índices/aliases deterministas, nunca IDs reales.

Se procesan y contabilizan hasta los 128 widgets válidos de un documento. El
límite configurable de 64 se aplica únicamente a las diferencias serializadas,
no al número de widgets ni a los contadores completos. Una muestra diagnóstica
independiente de resultados iguales/tolerados/externos queda también acotada a
64 entradas; nunca consume el cupo de diferencias ni puede ocultarlas.

## Consumidores transversales fuera de los builders

TC-07A compara ViewModels, pero el cutover posterior también debe preservar:

- selección de layout por sesión en
  `frontend/src/overlay/runtime/resolve-runtime-layout.ts`;
- reglas de visibilidad por sesión/pit en
  `frontend/src/overlay/core/widget-visibility.ts`;
- acumulador especial de Input Telemetry en
  `frontend/src/overlay/widget-types/input-telemetry/input-telemetry-accumulator.ts`;
- derivaciones legacy duplicadas en
  `frontend/src/overlay/core/derived-telemetry-store.ts`;
- freeze de telemetría durante interacción del canvas en
  `frontend/src/hub/overlay-studio/canvas/StudioCanvas.tsx`;
- coordinación de frecuencia en
  `frontend/src/overlay/runtime/RuntimeWidgetFrame.tsx`.

ISA-105 no modifica estas rutas. Deben formar parte de ISA-106/107 y de sus
gates para evitar que un comparator verde rompa comportamiento transversal.

## Bloqueadores productivos descubiertos

El flujo productivo sigue siendo legacy:

```text
LMU Shared Memory + REST
  -> EnrichedLMUSource
  -> service.Service
  -> telemetry:update / /telemetry/stream
  -> normalizeLegacyTelemetry
  -> TelemetrySnapshot
  -> ViewModels
```

El reducer/proyector nuevo todavía no tiene wiring productivo. D1 retiró el
mock conectado del camino productivo y D4-D7 materializaron driver, mapper,
derivaciones y proyección, pero D8 aún debe probar la cadena completa en un
único harness antes del shadow wiring.

Otros bloqueadores:

- falta el harness único que recorra driver → reducer → derive → Overlay;
- fases/banderas, equipo/número/compuesto, weather y daños siguen missing;
- `session.type` y `player.inPit` son obligatorios en `TelemetrySnapshot`, pero
  pueden faltar correctamente en la proyección;
- el timestamp legacy es tiempo de adaptación frontend y el nuevo es tiempo de
  adquisición; no son comparables sin correlacionar el mismo frame;
- el fixture visual puede incluir clima, daño y calendario, pero ninguno se usa
  para declarar paridad de datos productivos.

## Decisión de ISA-105

ISA-105 se limita a:

1. decodificar la proyección actual;
2. adaptar únicamente señales demostradas;
3. construir los ViewModels reales;
4. mostrar equivalencias y carencias;
5. producir evidencia sanitizada.

No se abre en este corte una expansión especulativa de señales canónicas. La
matriz será la entrada explícita para decidir qué campos demostrables deben
añadirse antes del cutover ISA-107. ISA-106 puede conectar shadow transport sin
promoverlo, pero no puede declarar paridad donde esta matriz dice `Not
comparable`.

Antes de ISA-106 se ejecutará ISA-129 / TC-07A.1, microcorte canónico aditivo
que debe cerrar, con
evidencia real, identidad de parrilla, timing/gaps/delta y las unidades
requeridas; fases/flags permanecen explícitamente fuera del allowlist. También
debe retirar el fallback mock conectado. Ese corte no puede rellenarse con
fixtures visuales.

## Gate de inventario

- Tipos registrados: 18.
- Tipos inventariados: 18.
- Tipos exactos completos actuales: Delta y Pedals instantáneo.
- Tipos parciales: Standings, Relative, Broadcast Tower, Fuel Strategy, los dos
  Pedals Telemetry, Delta Trace, Delta Advanced, Input Telemetry y Multiclass
  Relative.
- Tipos externos: Race Schedule.
- Resto: cinco no comparables hasta incorporar señales demostradas o una
  correlación de calidad segura por entidad.
- Renderizadores/CSS/canvas inspeccionados como consumidores de ViewModels, no
  como fuentes de datos.

## Resultado ejecutado de TC-07A

La evidencia reproducible vive en
`docs/telemetry-core/evidence/isa-105-overlay-shadow/`:

- `coverage.json` se deriva de `widgetTypeRegistry` y
  `OVERLAY_SHADOW_POLICIES`: 18 registrados, 18 políticas y 18 cubiertos;
- `report.json` es la salida sanitizada real del comparator para el escenario
  `partial`: 2 widgets, 31 campos, 19 iguales y 12 diferencias;
- las capturas wide, medium y compact están indexadas con escenario, viewport y
  SHA-256 verificado;
- los canarios de nombre, equipo, vehículo y circuito no aparecen en JSON, DOM
  ni capturas;
- el harness conserva cinco escenarios fijos y las etiquetas `NO LIVE` y
  `NO PRODUCTIVO`; no usa Wails, SSE, red, persistencia ni runtime Overlay.

La corrección D6 asegura que las 64 diferencias se seleccionan antes y por
separado de la muestra no-mismatch, retira `pitStopCount` sin consumidor de la
proyección adaptada y declara por campo las dependencias reales de Delta,
Standings y Relative. La identidad estructural `vehicles[].id` también forma
parte de `rows[].id` y, junto con `playerVehicleId`, de `rows[].isPlayer`.
Los resúmenes siguen contabilizando todo el documento aunque las entradas
serializadas estén acotadas.

Los gates D5 terminaron así:

| Gate | Resultado |
|---|---|
| `go test ./internal/telemetry/... ./internal/app/... -count=1` | PASS |
| `pnpm --dir frontend test` | PASS — 297 archivos / 1.993 tests |
| `pnpm --dir frontend build` | PASS |
| `pnpm --dir frontend test:telemetry-overlay-shadow` | PASS |
| Privacidad, hashes, alcance y `git diff --check` | PASS |
| `visual:overlay-studio` | FAIL heredado: Crystal 100 % también en `3b44d367`; Original 0 % |
| `bench:overlay-studio-drag` | FAIL heredado/de entorno en ISA-105 y base exacta |

No se actualizó ningún baseline. ISA-105 no toca renderizadores, CSS, canvas,
drag/resize ni el benchmark productivo. La review independiente D5 concluyó
`APPROVE` y la re-review adversarial D6 final concluyó `ACCEPT`, ambas con
P0/P1/P2/P3 = 0 tras cerrar todos los hallazgos razonables. Después del último
fix, la suite frontend completa pasó 297 archivos / 2.000 tests y el Playwright
shadow volvió a pasar.

## Resultado D7 de ISA-129

D7 amplía el payload v1 sin cambiar versión ni claves base. El adapter mapea
remaining, fuel, delta y tiempos del jugador; identidad de piloto, clase,
sector, distancia, tiempos, penalizaciones y gaps por vehículo; y delta history
con el `ReceivedUTC` canónico preservado en cada muestra. Una muestra retenida
con delta actual missing o stale mantiene así timestamp e identidad estables.
No crea fuel history, input history, flags, equipo, número, compuesto, weather
ni daños.

La policy mantiene 18/18 tipos: 2 exactos, 10 parciales, 5 no comparables y 1
externo. Nombres e IDs participan en la correlación interna, pero el informe
diagnóstico solo conserva paths y observaciones redactadas. Los cuatro cruces
old/new están fijados por tests; el golden anterior se conserva intacto.

## Resultado parcial D8 de ISA-129

El harness único ya recorre una captura Shared Memory real y sanitizada de
LMU 1.4 por la cadena:

```text
Driver/Fusion -> BatchMapper -> Reducer -> SessionCoordinator
-> Derive -> Overlay Projection v1
```

La captura de pista conserva su hash fijado, 38 vehículos y un jugador
correlacionado. Veinte ejecuciones independientes producen bytes idénticos en
la proyección (`2ef6f2cbe10973b12bdc8a695dfc5578501c05e48c06079e8cd20e03a47f605c`),
con una sola apertura y un solo cierre de `LMU_Data` por ejecución. La captura
real de menú se detiene antes de `Batch`: no tiene identidad de sesión válida,
no tiene jugador ni parrilla y no puede convertirse en payload live.

Sobre la observación real de pista, una secuencia canónica controlada prueba
que reordenar filas no cambia identidades, omitir y readmitir un slot incrementa
su generación, y un reset de sesión o cambio de vehículo jugador avanza el
epoch. Estas transiciones son tests de contrato; no se presentan como capturas
reales adicionales. El test de reloj congelado verifica además la transición
live -> stale -> live y ahora enumera todos los campos admitidos de sesión y de
cada vehículo.

El trace real D6 de 1.846 muestras y tres cruces de meta ya no se limita a un
hash. Se reproduce por `BatchMapper -> Reducer -> SessionCoordinator -> Derive
-> Overlay v1`: antes de completar una vuelta de referencia, Delta permanece
missing; después aparece como valor derivado fresh. La primera proyección real
con delta queda fijada en un golden que atraviesa también el decoder de
transporte, el decoder Overlay v1 y el adapter TypeScript. Ese cruce descubrió
y corrigió que el clon de una proyección vacía convertía arrays JSON vacíos en
`null`, forma que el contrato TypeScript rechaza.

El gate también encontró y corrigió una pérdida de semántica de freshness: al
congelarse el reloj de origen, el driver marcaba stale el reloj pero no todos
los campos admitidos del vehículo. Ahora todas las señales Shared Memory,
incluido `InPit`, fuel, gaps y controles, caducan juntas sin mutar el snapshot
anterior.

La evidencia ejecutable está fijada en
`internal/telemetry/drivers/lmu/testdata/menu_track_pit_disconnect_v1.golden.json`.
Ese golden declara de forma cerrada dos gates que **siguen pendientes**:

- no existe una secuencia sanitizada y verificable de LMU 1.4
  garaje -> pit lane -> outlap con `InPit=false/true/false`;
- no existe una secuencia real grabada de estado disconnect/reconnect.

Se localizaron capturas históricas de boxes y outlap del antiguo módulo
Engineer, pero no demuestran de forma verificable el build LMU 1.4 y no se han
reclasificado ni copiado. No se permite reemplazar ninguno de los dos gates
por fixtures sintéticos. Las vueltas reales válidas para Delta sí se conservan
en el trace hash-pinned D6 y no necesitan repetirse.

Por tanto, D8 cubre menú, pista, determinismo, ownership, freshness,
reorden/generaciones, resets/cambio de jugador y las vueltas Delta reales hasta
Go y TypeScript. Los dos gates reales de pit y desconexión permanecen abiertos.
ISA-129 debe seguir `In Progress` e ISA-106 bloqueada hasta que D9 pueda aportar
esas secuencias; no se permite cerrarlas con transiciones controladas ni con
capturas históricas sin build verificable.
