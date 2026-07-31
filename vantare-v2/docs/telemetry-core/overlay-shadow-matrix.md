# TC-07A — Matriz old/new de consumidores Overlay

Estado: contrato de preflight de ISA-105. Esta matriz describe lo que existe en
la base `3b44d36713213ab642f47174c1b5d8234362cac0`; no concede paridad a señales
ausentes.

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
| `delta` | `player.deltaSeconds`, last/best/predicted lap, lap y player scoring | player ID, lap/completed laps parciales | delta con referencia/signo, tiempos de vuelta, predicción | Not comparable |
| `standings` | sesión/remaining, id, place, número, piloto, clase, equipo/color, gaps/interval, vueltas, pit, compuesto | id, position, completedLaps, inPit, sessionType | remaining, piloto, número, clase, equipo/color, gaps, tiempos, compuesto | Partial |
| `relative` | id, place, isPlayer, `timeGapToPlayer`, clase, número, piloto y tiempos | id, position, isPlayer derivable | gap relativo demostrado, piloto, clase, número y tiempos | Not comparable |
| `pedals` | throttle, brake, clutch y status | los tres ratios del player | nada para el valor instantáneo | Exact para valor instantáneo |
| `broadcast-tower` | sesión, lap/total, place, número, piloto, equipo, clase, gap, color y player | sessionType, lap/completedLaps, position, player ID | número, piloto, equipo, clase, gap y color | Partial |
| `fuel-strategy` | fuel, remaining, last lap y fuel history | ninguno | fuel, remaining, last lap e historial de consumo | Not comparable |
| `pedals-telemetry` | controles, speed, rpm, gear, player place y status | controles, speedMps, rpm, gear, position | legacy etiqueta m/s como `speedKph`; no se acepta el factor 3,6 como tolerancia | Partial hasta corregir la unidad legacy |
| `pedals-telemetry-compact` | controles, speed, rpm, gear y status | todos los valores instantáneos | legacy etiqueta m/s como `speedKph`; no se acepta el factor 3,6 como tolerancia | Partial hasta corregir la unidad legacy |
| `racing-flags` | global flag y sector flags | ninguno | control de carrera y flags | Not comparable |
| `delta-trace` | `derived.deltaHistory` | ninguno; `derive.Delta` está missing | delta e historial con referencia/signo | Not comparable |
| `race-schedule` | `auxiliary.scheduleEvents` | no aplica | calendario local/remoto, ajeno a live telemetry | External |
| `head-to-head` | place, piloto, equipo, clase, gap y sectores | position | piloto, equipo, clase, gap y sectores | Not comparable |
| `delta-advanced` | delta best/sector/theoretical/last | ninguno | todas las variantes de delta | Not comparable |
| `input-telemetry` | controles, speed, rpm, gear e historial recibido aparte | valores instantáneos y muestras sin tiempo individual | timestamp exacto de cada muestra para la traza | Partial |
| `multiclass-relative` | place, class, color, number, piloto, gap y player | position, player ID | piloto, clase, color, número y gap | Not comparable |
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
| `remainingSeconds` | `timeRemaining` | ausente | mismatch |
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
| delta/fuel/lap times | ausentes | no fabricar |

### Scoring

Cada vehículo nuevo puede producir únicamente:

- `id`;
- `place`, si `position` es usable;
- `totalLaps`, si `completedLaps` es usable;
- `inPits`, si `inPit` es usable;
- `isPlayer`, derivado por igualdad de ID.

`vehicle.name` queda solo en quality/diagnóstico: no se emite como `name` ni
`driverName`, porque `readScoringName` interpreta ambas claves como piloto. No
debe producir claves con un zero-value que simule:

- número del coche;
- clase;
- equipo;
- color;
- gaps;
- tiempos;
- compuesto;
- penalizaciones;
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
límite de 64 se aplica únicamente a las diferencias serializadas, no al número
de widgets ni a los contadores completos.

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

El reducer/proyector nuevo todavía no tiene wiring productivo. Además,
`TelemetrySourceManager` puede volver al source mock y ese mock construye
telemetría sintética marcada como conectada. Esto contradice el contrato
«mock solo harness» y bloquea ISA-107 aunque el comparator de ISA-105 funcione.

Otros bloqueadores:

- el driver canónico LMU todavía no proyecta una parrilla real completa;
- `derive.Delta` y `derive.Gaps` están deliberadamente missing;
- `session.type` y `player.inPit` son obligatorios en `TelemetrySnapshot`, pero
  pueden faltar correctamente en la proyección;
- el timestamp legacy es tiempo de adaptación frontend y el nuevo es tiempo de
  adquisición; no son comparables sin correlacionar el mismo frame;
- el fixture visual incluye fuel, delta, clima, daño y calendario que no son
  señales productivas y no puede usarse para declarar paridad de datos.

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
evidencia real, identidad de parrilla, timing/gaps/delta, sesión/flags y las
unidades requeridas; también debe retirar el fallback mock conectado. Ese corte
no pertenece al comparator y no puede rellenarse con fixtures.

## Gate de inventario

- Tipos registrados: 18.
- Tipos inventariados: 18.
- Tipos exactos completos actuales: Pedals instantáneo.
- Tipos parciales: Standings, Broadcast Tower, los dos Pedals Telemetry e Input
  Telemetry.
- Tipos externos: Race Schedule.
- Resto: no comparable hasta incorporar señales demostradas.
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
`APPROVE` con P0/P1/P2/P3 = 0.
