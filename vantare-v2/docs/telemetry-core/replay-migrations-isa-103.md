# ISA-103 / TC-06C — Replay en tres niveles y migraciones

Fecha: 2026-07-30.

## Resultado

Telemetry Core dispone de replay determinista para pruebas y harnesses sin
convertirlo en una fuente live:

1. **Raw** reproduce bytes exactos hacia los parsers del driver.
2. **Canónico** reproduce `core.Batch` y hechos tipados hacia reducer,
   coordinador, derivaciones y proyecciones.
3. **Histórico** pagina los DTO persistidos en SQLite desde un único snapshot
   read-only.

Los tres niveles son deliberadamente distintos. `RecordingPayloadV1` es un DTO
histórico pseudonimizado y parcial; no contiene identidad, circuito, clutch,
RPM y el resto del estado necesario para reconstruir un `core.Batch`.

## Player determinista

`internal/telemetry/recording/replay` contiene un player síncrono:

- no crea goroutines;
- `step` entrega exactamente un frame;
- el modo temporizado usa velocidad racional reducida, no `float64`, y calcula
  la espera desde el offset absoluto para no acumular truncamiento;
- la espera se inyecta para que los tests no usen `time.Sleep`;
- cancelación o error del consumidor no consumen el frame;
- cada entrega recibe una copia propia, incluso al reintentar;
- offsets, timestamps, cursores y payloads no cambian con la velocidad.

Cada fixture declara versión, simulador, build del simulador, build de Vantare,
schema, inicio UTC, procedencia (`synthetic` o `sanitized-capture`) y
sanitización. Las dos versiones son dimensiones independientes y se validan
contra su contrato correspondiente. El decoder raw es cerrado, acotado y
verifica SHA-256 por registro.

La captura compartida ya sanitizada `testdata/lmu-fixture.bin` atraviesa en
tests el parser real de Shared Memory. Su SHA-256
`959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff`
está fijado en la regresión: cambiar la captura no actualiza automáticamente
su prueba. Los cuerpos REST sintéticos atraviesan los decoders reales de
standings y session info desde una fixture distinta, etiquetada como
`synthetic`; nunca se presentan como parte de la captura Shared Memory. No se
expone una API de raw en producción.

## Replay canónico

El fixture canónico conserva `core.Batch` completo y hechos
`core.SessionFact`. Antes de reproducir:

- un reducer aislado valida cursores, epochs, identidad, vehículos y batches;
- los hechos validan cursor causal, sesión, identidad, tipo, secuencia y UTC;
- las transiciones conservan `SessionEnded` con el header de la sesión anterior
  y admiten batches de hechos sin un snapshot nuevo, como pérdida de conexión;
- todas las colecciones son copiadas.

El golden transversal ejecuta:

```text
canonical fixture
  -> reducer
  -> session coordinator
  -> derive pipeline
  -> Overlay / Engineer / Strategy / Analysis projections
```

Step y 4× producen el mismo digest SHA-256. Esto demuestra el contrato sin
crear un driver de replay ni conectarlo al composition root.

## Replay histórico

El nuevo puerto `HistoricalReplayStore` es independiente de
`HistoricalStore`. El reader:

- abre una transacción SQLite read-only y fija un snapshot hasta `Close`;
- limita esa vista al último cursor reconocido por el manifest, aunque SQLite
  ya contenga un batch posterior todavía no checkpointed;
- pagina de 1 a 4.096 registros con `Limit+1`;
- usa entropía por apertura, fija el ID en el source y rechaza páginas o
  cursores de otro reader;
- ordena por epoch, snapshot causal, tipo y secuencia;
- emite el snapshot observado antes de sus hechos;
- valida schema, codec, counts, bytes, rangos y CRC agregado de cada chunk,
  además del CRC, tipo, versión y payload de cada registro, antes de entregar;
- detecta hechos huérfanos antes de emitir ningún registro;
- conserva cursores observados y de hechos separados;
- filtra tiempo por snapshot causal: un hecho nunca aparece sin el observado
  que lo causó;
- contrasta el `fact_type` indexado con el payload decodificado;
- nunca carga una sesión completa por obligación de API.

Una sesión puede seguir creciendo en WAL mientras un reader mantiene su vista
congelada. El reader no ve filas añadidas después de abrirse. Si el timestamp
causal retrocede, el source rechaza el replay en vez de inventar un reloj.

## Compatibilidad futura

`manifestVersion` y `recordingSchemaVersion` se inspeccionan por separado. Si
alguna versión es futura:

- solo se interpretan los metadatos comunes;
- `Inspect` marca read-only y counts desconocidos;
- no se abre DB, WAL ni SHM;
- reader, replay y recovery devuelven `ErrFutureManifest`;
- campos futuros no se convierten a zero-values.

Esto incluye el caso antes ausente: manifest v1 con schema v2.

## Migraciones

El motor neutral implementa el protocolo copy-on-write:

1. obtiene versión y SHA-256 de la fuente;
2. calcula un plan cerrado de pasos `N -> N+1`;
3. crea una copia con intento único;
4. aplica cada paso solo sobre la copia;
5. exige validación integral y golden del backend;
6. vuelve a verificar que la fuente no cambió;
7. entrega hashes de origen/destino y digest del plan a una activación CAS;
8. el backend debe tomar el lease exclusivo, volver a comparar los tres
   valores y solo entonces reemplazar atómicamente el manifest.

Downgrades, saltos, huecos, IDs duplicados, target igual a source, copia
inválida y fuente modificada bloquean la activación. El catálogo productivo
está vacío porque v1 es el único schema real. Los tests usan una migración
sintética privada para demostrar el motor; no se inventa un schema v2.

Cuando exista v2, su adaptador SQLite deberá implementar:

- copia de DB/WAL/SHM;
- checkpoint únicamente de la copia;
- transacciones por paso y `user_version`;
- `integrity_check`, `foreign_key_check`, CRC, counts, cursores y golden;
- publicación del target junto al original;
- manifest nuevo mediante replace atómico;
- reanudación segura de un target huérfano con procedencia coincidente.

## Frontera productiva

El guard de arquitectura recorre todo el módulo y rechaza cualquier import
productivo de `recording/replay` fuera de su propio árbol. Los tests de drivers
pueden usarlo porque los archivos `_test.go` no forman parte del binario.

No se añadió:

- driver o fallback live;
- wiring en app/server/Wails;
- UI;
- captura raw productiva;
- MCAP o DuckDB;
- dependencia nueva;
- schema v2 ficticio;
- cambios en Strategy.

Durante la suite completa se reprodujo el test heredado
`TestDriverDoesNotPublishOrMutateRESTAfterCancellation`. El test utilizaba el
ticker productivo de 60 Hz y podía contar publicaciones Shared Memory normales
mientras esperaba que REST llegara al punto de cancelación. Se sustituyó solo
en ese test por el `manualTicker` existente. El caso pasa 100 repeticiones y no
se cambió código productivo del driver.

## Rendimiento

El benchmark de una página de 512 snapshots históricos, cada uno con 64
vehículos, dio 223,8–273,6 ms/op y ~18,6 MiB/op. La memoria corresponde
principalmente a los 512 payloads JSON completos solicitados; callers normales
pueden usar páginas menores. El contrato prohíbe la carga ilimitada.

## Rollback

Todo el corte es aditivo salvo el reconocimiento seguro de schemas futuros.
Retirar el paquete `replay`, el puerto histórico y el guard restaura el estado
anterior. El motor de migración no tiene pasos productivos y no puede mutar
ninguna sesión actual.
