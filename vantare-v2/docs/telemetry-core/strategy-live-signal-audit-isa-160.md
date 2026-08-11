# ISA-160 / TC-10A — auditoría de señales live para Strategy

Fecha: 2026-08-11

Base auditada: `54f267b0a2c674a899f12206af1d42c4aef37f7d`

Alcance: tests y documentación; sin cambios de schema, driver, fusión,
proyecciones ni código Strategy.

## Veredicto

Telemetry Core ya demuestra Fuel, pit y progreso mediante campos canónicos con
presencia, procedencia y freshness explícitas. El frame real sanitizado de LMU
1.4 lleva el Fuel del vehículo activo por el único reader, `Fusion`,
`BatchMapper`, `Reducer` y `Derive` hasta el estado final: `83.80992715710434 L`
de `115 L`, `observed` y `fresh`, con una sola apertura de `LMU_Data`.

Virtual Energy, identidad/compound/wear/corner de neumáticos y weather no están
admitidos. Permanecen ausentes de `lmu.Observation`, `core.VehicleState` y
`core.ObservedState`; no se convierten en cero, estimación ni fallback. El
ledger ejecutable y byte-exacto es
`internal/telemetry/drivers/lmu/testdata/strategy_live_signals_v1.golden.json`.

## Matriz cerrada v1

`supported` significa que existe un campo canónico y una regla de calidad;
puede seguir apareciendo `missing` cuando la sesión no ofrece el dato.
`unsupported` significa `source=none-admitted`, `authority=none` y
`freshness=missing`.

| Key | Capability | Tipo canónico | Source / offset | Unidad | Authority / fusión | Freshness | Identidad | Estado runtime | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `energy.fuel_amount` | supported | `schema.Field[energy.Fuel].Amount` | `LMU_Data`, telemetry row `+524` | L | SHM únicamente | TTL 500 ms; observed fresh/stale/invalid/missing | player `lmu-slot-N-generation-G`; G incrementa tras desaparecer/reaparecer y vuelve a 1 al resetear sesión | player-only | fixture 1.4 de pista + `TestStrategySignalAuditCarriesRealLMU14FuelToFinalState` |
| `energy.fuel_capacity` | supported | `schema.Field[energy.Fuel].Capacity` | `LMU_Data`, telemetry row `+608` | L | SHM únicamente; amount/capacity se validan juntos | TTL 500 ms; observed fresh/stale/invalid/missing | player `lmu-slot-N-generation-G`; G incrementa tras desaparecer/reaparecer y vuelve a 1 al resetear sesión | player-only | misma fixture y recorrido E2E que Fuel amount |
| `energy.virtual_energy` | unsupported | ausente | none-admitted | none-admitted | none | missing | none | ausente | guard reflect; `FuelMult` excluido no representa VE |
| `tyres.identity` | unsupported | ausente | none-admitted | none-admitted | none | missing | none | ausente | guard reflect; modelos legacy Engineer no identifican neumáticos físicos |
| `tyres.compound` | unsupported | ausente | none-admitted | none-admitted | none | missing | none | ausente | guard reflect; ninguna fuente LMU canónica admitida |
| `tyres.wear` | unsupported | ausente | none-admitted | none-admitted | none | missing | none | ausente | offsets/escala de placeholders Engineer no demostrados |
| `tyres.corner` | unsupported | ausente | none-admitted | none-admitted | none | missing | none | ausente | `wheels.Corner` localiza una medición de temperatura de freno; no es identidad de neumático |
| `weather.ambient_temperature` | unsupported | catálogo metadata-only; sin campo runtime | none-admitted | none-admitted | none | missing | none | `LedgerExistingUnproduced` | guard de catálogo y reflect |
| `weather.track_temperature` | unsupported | ausente | none-admitted | none-admitted | none | missing | none | ausente | sidecars históricos sin contrato admitido de source/unidad |
| `weather.rain_intensity` | unsupported | ausente | none-admitted | none-admitted | none | missing | none | ausente | cliente weather histórico de Pit Manager no es productor canónico |
| `weather.track_wetness` | unsupported | ausente | none-admitted | none-admitted | none | missing | none | ausente | ninguna fuente LMU canónica admitida |
| `pit.in_pit` | supported | `schema.Field[pit.InPit]` | scoring row `+198` | boolean | SHM únicamente | TTL conjunto de grid 500 ms; observed fresh/stale/invalid/missing | vehículo `lmu-slot-N-generation-G`; G incrementa tras desaparecer/reaparecer y vuelve a 1 al resetear sesión | per-vehicle | secuencia real sanitizada `false -> true -> false` de `menu_track_pit_disconnect_v1.golden.json` |
| `pit.stop_count` | supported | `schema.Field[pit.StopCount]` | scoring row `+192`; solape REST standings | count | SHM preferida; REST solo fallback del player ya identificado por SHM | SHM 500 ms; REST 2 s; observed fresh/stale/invalid/missing | vehículo `lmu-slot-N-generation-G`; misma transición; REST no crea identidad | per-vehicle | `layout_test.go`, tabla de autoridad en `fusion_test.go` |
| `session.lap_number` | supported | `schema.Field[session.LapNumber]` | telemetry row `+20` | count | SHM únicamente | TTL 500 ms; observed fresh/stale/invalid/missing | player `lmu-slot-N-generation-G`; G incrementa tras desaparecer/reaparecer y vuelve a 1 al resetear sesión | player-only | trace real `lmu-1.4-self-delta-trace-v1.jsonl` + layout test |
| `standings.completed_laps` | supported | `schema.Field[standings.CompletedLaps]` | scoring row `+100`; solape REST standings | count | SHM preferida; REST solo fallback del player ya identificado por SHM | SHM 500 ms; REST 2 s; observed fresh/stale/invalid/missing | vehículo `lmu-slot-N-generation-G`; misma transición; REST no crea identidad | per-vehicle | `layout_test.go`, tabla de autoridad en `fusion_test.go` |
| `standings.lap_distance` | supported | `schema.Field[standings.LapDistance]` | scoring row `+104` | m | SHM únicamente | TTL conjunto de grid 500 ms; observed fresh/stale/invalid/missing | vehículo `lmu-slot-N-generation-G`; G incrementa tras desaparecer/reaparecer y vuelve a 1 al resetear sesión | per-vehicle | trace real Delta + `layout_test.go` |
| `session.maximum_laps` | supported | `schema.Field[session.MaximumLaps]` | sesión `+1716` | count | SHM únicamente | TTL 500 ms; observed fresh/stale/invalid/missing | event/session del header canónico | session | `layout_test.go` + regresión de sesión limitada por vueltas en Derive |
| `session.remaining_time` | supported | `schema.Field[session.RemainingTime]` | derivada de source time `+1700` y end time `+1708` | s | cadena `Derive`; no existe raw remaining admitido | fresh/stale solo desde calidad exacta de ambos inputs; si no, missing/invalid | event/session del header canónico | session derived | `derive/gaps_test.go` y `pipeline_advanced_test.go` |

La matriz de autoridad productiva actual es `MatrixVersion=4`. Fuel, InPit,
lap number, lap distance, maximum laps y end time son SHM-only. Completed laps
y stop count admiten el fallback REST acotado anterior. Un frame SHM envejecido
vuelve stale el grid entero; REST no refresca el resto de la fila.

## Identidad y generación

`BatchMapper` forma cada identidad canónica como
`lmu-slot-N-generation-G`. `N` es el `VehicleSourceID` de la fila LMU y no la
posición en carrera. La primera ocupación del slot dentro de una sesión usa
`G=1`; si la fila desaparece y más tarde reaparece en la misma sesión, el
mapper incrementa G. Un reset de sesión crea `lmu-session-S+1`, limpia active
slots y generaciones y vuelve a `G=1`. Un reconnect transitorio sin boundary
de sesión no reinicia esos contadores. REST solo puede completar completed
laps/stop count del player ya identificado por SHM; nunca crea ni cambia la
identidad.

`TestStrategySignalAuditTracksCanonicalVehicleGeneration` recorre
conductualmente `generation-1 -> desaparición -> generation-2 -> reset de
sesión -> generation-1`. El ledger repite esta regla en todas las filas
player-only y per-vehicle para que ninguna proyección futura pierda el alcance
de la identidad.

## Contrastes ejecutables no circulares

El golden es un snapshot revisable, no el oráculo único. Los tests contrastan
cada fila supported contra fuentes productivas independientes:

- offsets/nombres/scope de `lmu13Layout`;
- `AuthorityMatrix()` runtime v4 y TTL reales SHM 500 ms / REST 2 s;
- key, unidad y acción del catálogo Go;
- registro fijo de `Derive` para `session.remaining_time` desde source/end time;
- allowlists exactas y ordenadas de campos de `Observation`,
  `core.VehicleState`, `core.ObservedState`, `strategy.SnapshotV1`,
  `strategy.PayloadV1` y `strategy.PlayerV1`.

El audit v1 también comprueba que el catálogo no admita silenciosamente las
keys VE/tyres/weather cerradas, que brake temperature y ambient temperature
continúen `LedgerExistingUnproduced`, y que Strategy v1 conserve únicamente
las capabilities `session`, `progress` y `pit`. Una ampliación legítima debe
actualizar explícitamente este audit y su evidencia; añadir una nueva versión
de proyección no queda prohibido por los guards de v1.

## Evidencia estática frente al smoke real de menú

La evidencia estática demuestra compatibilidad del layout, reglas de fusión,
calidad, identidad, derivaciones y el recorrido E2E sobre fixtures reales
sanitizadas y hash-pinned. No significa que todos los campos estén presentes en
cualquier estado de LMU.

El smoke real opt-in ya observado el 2026-08-10/11 registró exactamente:

```text
normalized LMU build="1.4.0.0" supported=true
runtime state="live" player-present=false
fingerprint="LMU_Data/runtime:build=1.4.0.0;size=324820;evidence=active-grid-bijective;telemetry=not-required-no-player"
```

Era menú sin vehículo del jugador. Ese smoke solo observó como correctamente
`missing` los campos player-only Fuel y lap number: `live` describe
disponibilidad compatible de la fuente, no presencia inventada del piloto. No
se usa el smoke de menú para afirmar pit o progreso; esas familias se
demuestran mediante fixtures reales sanitizadas/hash-pinned, el trace Delta y
los tests estáticos de layout/fusión. El smoke no persistió raw ni PII e
ISA-160 no inició LMU ni capturó archivos nuevos.

## Hallazgos negativos obligatorios

- `FuelMult` pertenece al decoder Extended retirado y fixture-only. Es un
  multiplicador de combustible de sesión, no Virtual Energy; no puede
  renombrarse, convertirse ni usarse como aproximación de VE.
- Los campos tyre del modelo legacy de Engineer y los offsets de wheel marcados
  como placeholders no son evidencia canónica. Reactivarlos abriría de nuevo
  semántica no validada y no está permitido.
- `wheels.Corner` solo aporta FL/FR/RL/RR a `BrakeTemperature`, cuyo catálogo
  sigue `LedgerExistingUnproduced`. No identifica una unidad física, compound,
  montaje ni desgaste de neumático.
- `mInPits`/`InPit` es únicamente un booleano. No distingue pit lane, box,
  garaje ni fase de parada, aunque los nombres históricos de fixtures sugieran
  esos estados.
- El cliente weather histórico de Pit Manager no es un productor canónico. Los
  valores ambient/track de sidecars históricos solo prueban bytes potenciales;
  no fijan source, unidad, validez, freshness ni autoridad admitidas.
- Ninguna familia unsupported permite fallback, valor cero, estimación, acceso
  directo al sidecar ni un segundo reader.

## Límite ejecutable de ISA-161 / TC-10B

ISA-161 puede ampliar `StrategyLiveProjection v1` solo con campos canónicos ya
existentes:

- Fuel amount/capacity, conservados como una lectura atómica de
  `schema.Field[energy.Fuel]`;
- session source time, end time, remaining time y maximum laps;
- progreso mediante lap distance y sector, además de lap number y completed
  laps ya publicados;
- pit mediante InPit y stop count ya publicados.

La evolución debe ser aditiva y backward-compatible: campos y capabilities
opcionales, sin reinterpretar ausencias. Debe incluir contract tests
producer-old/consumer-old, producer-old/consumer-new,
producer-new/consumer-old y producer-new/consumer-new; además de golden,
transporte full/delta, resync por salto, replay determinista y soak con
backpressure/lifecycle. Debe reutilizar el único reader, `FinalState` y el
transporte canónico.

VE, tyres y weather continúan ausentes de la proyección y de sus capabilities
hasta una issue separada con evidencia propia amplíe schema, driver y fusión.
ISA-160 no implementa el productor, wiring, transporte ni consumo Strategy.

## Reproducción

```powershell
go test -count=20 ./internal/telemetry/drivers/lmu -run '^TestStrategySignalAudit'
go test -count=1 ./internal/telemetry/...
go test -count=1 ./...
go vet ./internal/telemetry/...
git diff --check
```

Verificación manual: comparar el golden con la matriz anterior, confirmar las
18 keys en el mismo orden y revisar que ninguna familia unsupported aparezca
en los tres structs protegidos por reflection. No hace falta abrir LMU.

Rollback: retirar los dos archivos test-only y este documento. No hay
migración, estado persistido ni comportamiento productivo que revertir.
