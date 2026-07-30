# Caracterización histórica LMU DuckDB

Fecha: 2026-07-29. Alcance: TA-03 / ISA-126.

## Resultado

LMU guarda la telemetría histórica observada como DuckDB con tres tablas de
catálogo y una tabla por canal o evento:

- `channelsList(channelName, frequency, unit)`;
- `eventsList(eventName, unit)`;
- `metadata(key, value)`;
- 56 canales continuos, sin columna temporal propia;
- 42 eventos, con `ts DOUBLE` como primera columna;
- 12 claves de metadatos;
- 101 tablas en total.

El diccionario completo, sin valores de usuario, está versionado en
[`lmu-duckdb-schema-v1.json`](../../../../internal/telemetryanalysis/testdata/lmu-duckdb-schema-v1.json).
Contiene nombres de tablas, frecuencia declarada, unidad declarada y tipos de
columnas. No es una base DuckDB, no contiene una ruta, una sesión, nombres,
Steam ID, setup, valores de metadatos ni muestras.

Esta evidencia caracteriza una muestra real completada. No afirma que LMU
mantenga para siempre exactamente el mismo catálogo. El parser conserva
canales y tipos desconocidos como `unknown` en vez de descartarlos.
Los nombres de tablas, columnas y claves se consideran sin distinción de
mayúsculas para detectar duplicados ambiguos antes de consultar datos.

## Procedimiento read-only

1. Se enumeró únicamente metadata de los candidatos `.duckdb`.
2. Se descartó cualquier candidato con `.duckdb.wal` hermano.
3. Se eligió un candidato completado y se comprobó estabilidad de tamaño y
   `mtime`.
4. Se calculó SHA-256 del original, se creó una copia temporal y se marcó la
   copia como read-only.
5. Se verificó que SHA-256, tamaño, `mtime` y atributos del original no
   cambiaron antes/después y que el hash de la copia coincidía.
6. La copia se abrió mediante DuckDB 1.5.2 con `read_only=true`.
7. Solo se consultaron catálogo, schema y agregados técnicos. Los valores de
   `metadata` no se leyeron.

En el momento de la observación había 331 candidatos: 26 con WAL y 305 sin
WAL. La copia inspeccionada tenía aproximadamente 15,3 MB. Estos números
describen exclusivamente el entorno de prueba en ese instante y no forman
parte del contrato del producto.

No se ejecutó `CHECKPOINT`, `VACUUM`, `EXPORT`, `COPY`, `ATTACH`, reparación,
escritura, borrado, movimiento ni renombrado sobre la biblioteca LMU. La copia
temporal no se incorpora al repositorio.

## Catálogo continuo

Las frecuencias declaradas observadas son 1, 2, 5, 7, 10, 20, 50 y 100 Hz.
Cada tabla continua contiene una o cuatro columnas `value*` y no contiene
`ts`. Los tipos observados son `FLOAT`, `DOUBLE` y `BOOLEAN`.

| Grupo | Canales observados |
|---|---|
| Controles | Brake Pos, Brake Pos Unfiltered, Clutch Pos, Clutch Pos Unfiltered, Steering Pos, Steering Pos Unfiltered, Throttle Pos, Throttle Pos Unfiltered, FFB Output |
| Motor y transmisión | Clutch RPM, Engine Oil Temp, Engine RPM, Engine Water Temp, Fuel Level, Regen Rate, SoC, Steering Shaft Torque, Turbo Boost Pressure, Virtual Energy |
| Movimiento y trazada | G Force Lat/Long/Vert, GPS Latitude/Longitude/Speed/Time, Ground Speed, Lap Dist, Path Lateral, Time Behind Next, Total Dist, Track Edge |
| Chasis | Front3rdDeflection, FrontRideHeight, Rear3rdDeflection, RearRideHeight, RideHeights, Susp Pos |
| Frenos y neumáticos | Brake Thickness, Brakes Air Temp/Force/Temp, Tyres Wear/CarcassTemp/Pressure/RimTemp/RubberTemp/TempCentre/TempLeft/TempRight, Wheel Speed |
| Entorno | Ambient Temperature, Track Temperature, Wind Heading, Wind Speed |
| Estado | OverheatingState |

Las unidades se conservan literalmente como fueron declaradas. Una unidad
vacía es `unknown`: no se convierte en porcentaje, ratio, enum o boolean
mediante el nombre del canal.

## Catálogo de eventos

Los 42 eventos observados conservan su `ts` y una o cuatro columnas de valor.
Los tipos de valor son `BOOLEAN`, `FLOAT`, `TINYINT`, `UTINYINT`, `USMALLINT`
y `UINTEGER`.

| Grupo | Eventos observados |
|---|---|
| Vuelta y sectores | Best LapTime, Best Sector1/2, Current LapTime, Current Sector/1/2, Lap, Lap Time, Last Sector1/2 |
| Controles del coche | ABS, ABSLevel, AntiStall Activated, Brake Bias Rear, Brake Migration, Gear, FuelMixtureMap, TC, TCCut, TCLevel, TCSlipAngle |
| Estado del coche | Engine Max RPM, Finish Status, FrontFlapActivated, Headlights State, In Pits, LastImpactMagnitude, LaunchControlActive, RearFlapActivated, RearFlapLegalStatus, Speed Limiter |
| Pista y carrera | CloudDarkness, Minimum Path Wetness, OffpathWetness, Sector1/2/3 Flag, SurfaceTypes, Yellow Flag State |
| Neumáticos/daños | TyresCompound, WheelsDetached |

En la copia observada, `ts` no tenía nulos y no disminuía dentro de ninguna
tabla de eventos. El parser lo exige por página. No se asigna significado
adicional a códigos enteros sin una fuente que lo demuestre.

Las claves nuevas de metadata quedan sensibles por defecto. La allowlist
pública v1 contiene únicamente clase/coche, tipo de sesión,
circuito/layout, versión y condiciones meteorológicas. Identidad, Steam ID,
setup, tiempos y cualquier clave no conocida siguen protegidos.

## Tiempo y vueltas

La frecuencia permite reconstruir un eje **relativo** exacto por índice:

```text
relative_seconds = sample_index / frequency_hz
```

El catálogo no declara el origen que alinea ese eje relativo con el `ts` de los
eventos. La existencia de `GPS Time` no autoriza a tratar su primer valor como
origen universal de todos los canales. TA-03 marca por tanto:

- continuo: `continuous_implicit_frequency`, origen `unknown`;
- evento: `event_timestamped`, origen `source_timestamp`.

TA-04 deberá demostrar un ancla o una regla de alineación antes de calcular
delta, mapa o comparación espacial. No existe fallback silencioso por tiempo.

`Lap` puede describir límites observados. El modelo genera rangos entre dos
límites consecutivos, pero deja la validez como `unknown`: no deduce vuelta
válida, in-lap, out-lap, Safety Car ni bandera.

## Dependencia DuckDB

La [documentación oficial del cliente Go](https://duckdb.org/docs/current/clients/go)
lo presenta como driver `database/sql`. El
[repositorio oficial](https://github.com/duckdb/duckdb-go) documenta licencia
MIT, binarios empaquetados y requisitos CGO/GCC en Windows. Es una opción
legítima, pero cambia build, cross-compilation, tamaño, supply chain y
empaquetado.

TA-03 no añade esa dependencia. El código define un puerto mínimo
`LMUDuckDBReader` y normaliza catálogo/páginas. La CLI y el módulo Python ya
instalados se usaron solo como tooling local de caracterización. Elegir y
empaquetar un reader productivo requiere un corte explícito con:

- auditoría de licencia y artefactos;
- build reproducible Windows 10/11;
- medición de tamaño y memoria;
- modo read-only demostrado;
- pruebas de WAL/estabilidad;
- integración con instalador y CI.

Ejecutar `duckdb.exe` externo del usuario no es una alternativa de producto:
su presencia, versión y procedencia no están garantizadas.

## Límites

- No hay reader productivo DuckDB ni wiring.
- No se importan valores de metadatos reales.
- No se indexan sesiones ni se crea una galería.
- No se calculan mapa, delta, comparación o coaching.
- No se modifica Telemetry Core, Strategy, Engineer, Wails/SSE ni frontend.
- El fingerprint versiona el schema observado, no la semántica completa de
  cada canal.
