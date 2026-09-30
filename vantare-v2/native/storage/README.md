# Almacenamiento de series — ISA-1429

Crate y proceso bajo demanda: `vantare-storage <ruta.duckdb> [--read-only]`.
Ningún paquete vivo depende de storage/DuckDB; `cargo build` conserva los
cuatro default-members previos. Compilar explícitamente con `--offline -j 2`.
El único binding nuevo autorizado es duckdb `=1.10505.0`, bundled, sin features
de extensiones. Las dependencias transitivas Arrow/TLS son propias del binding;
el proceso desactiva autoinstall/autoload, acceso externo y usa dos threads,
256 MB de límite DuckDB (no equivale a RSS máximo del proceso).

Una conexión y un bucle secuencial poseen SQL. DB nueva por grabación, versión
`vantare.series-db.v1`, tablas `series_meta` y `series_chunks`. No interpreta,
importa ni migra DB Go/LMU; una DB ajena o versión desconocida falla sin SQL
de modificación. Payload BLOB = codec v1 original, calidad/ausencia intactas.
El índice pertenece a esta grabación; no reutilizar ruta con otro productor.
Reanudar exige el mismo prefijo/identidad y enviar índices posteriores.

Protocolo local UTF-8, array JSON por línea, entrada acotada a 32 KiB+128:

- Arranque devuelve `["ready", watermark, finished, attempted]`.
- `["append", SeriesChunk-v1]` devuelve `["ack", watermark]` tras COMMIT.
- `["status"]` devuelve `["status", watermark, finished, attempted]`.
- `["page", after_index, limit]` devuelve `["page", [SeriesChunk-v1...]]`.
  `limit` entre 1 y 16; cursor por índice, orden creciente. Sin filtros SQL
  arbitrarios. Leer páginas y consumir con `SeriesAnalysis` (flows) reproduce
  el mismo cálculo que live. Las pérdidas de índice/offset siguen siendo huecos.
- Solo en modo read-only: `["summaries"]` devuelve
  `["summaries", "series-summary.v1", total_segmentos, resúmenes]`.
  Recorre páginas de 16 mediante `SeriesAnalysis`, con 255 recientes + una
  activa como máximo; total permite mostrar la retención explícitamente.
  Cada resumen expone identidad completa, `first_chunk`, `next_chunk` (null
  para el último), seal, gap, muestras, ventana observada y `SignalSummary`
  (min/media/max y los cuatro contadores de calidad) de velocidad/pedales.
  No es duración de vuelta ni ritmo Go. No retiene muestras al resumir.
- Solo en modo read-only: `["plot-page", after_index, limit]` devuelve
  `["plot-page", "series-plot.v1", chunks]`, sobre la misma consulta paginada
  y codec validado. Cada chunk lleva index/offset/gap, época/sesión/coche/vuelta y muestras con
  distance/elapsed/speed/throttle/brake en SI. Solo Reliable lleva número;
  el resto es null (los contadores de calidad siguen en el resumen).
  El Hub usa esta lectura para gráficos sin enlazar runtime/DuckDB.
- Fallo de apertura read-only: `["error", "locked"|"incompatible"|"unreadable", diagnóstico]`
  antes de salir con error. La distinción lock usa el diagnóstico de DuckDB;
  no se inventa que una DB con finished=false siga teniendo un writer activo.
- `["stop"]` o EOF cierra la conexión y el proceso.
- `["finish", attempted]` confirma COMMIT del cierre con
  `["finished", watermark, true, attempted]`. `attempted >= watermark`.
  `finished` significa productor detenido, no sesión sin huecos/vueltas completas.
  La diferencia attempted-watermark hace visible la pérdida de cola final.
  EOF/caída deja finished=false: el total de intentos final es desconocido.

Sin SQL arbitrario. Índice ya guardado con bytes iguales es idempotente;
contenido distinto, orden/progreso inválido o entrada corrupta falla sin ACK.
Chunk y watermark se escriben en una transacción. Fallo de SQL/COMMIT obliga
a reabrir antes de continuar, sin reintento ciego de un resultado incierto.
Al abrir para escribir se verifica watermark y se reconstruye el analizador
compartido por páginas de 16, con memoria acotada. Read-only no recorre la
sesión al abrir: consulta solo metadata, y lee las páginas solicitadas.
No confundir este watermark (último chunk
guardado) con ausencia de huecos: índice/offset/lost_before conservan pérdidas.
Un proceso caído puede haber confirmado un chunk cuyo ACK se perdió; repetir
exactamente ese chunk es seguro.

Recording no se activa al suscribir ni al arrancar Core. El llamador debe
arrancar este binario explícitamente fuera de adquisición, consumir el
Receiver en un worker y flush al parar. La integración Hub es fase 5 y el
journal fase 3; el launcher actual sigue sin arrancar este proceso.

El cliente en `runtime::flows` usa únicamente dependencias que runtime ya tenía.
`SeriesWorker::start(exe, db, receiver)` devuelve sin esperar ready; un hilo
posee pipes/receiver y el padre conserva Child. `watermark()`, `failed()` y
`analysis()` exponen el prefijo ACK con resúmenes inmutables latest-wins,
máximo 256. El mismo SeriesAnalysis se aplica en live, validación del writer y
replay: no hay otro algoritmo. Al reabrir, replay de prefijo antes de escribir.
Las DB existentes se inspeccionan read-only antes de abrir RW; no se migran.

Parar adquisición y flush, conservar Core vivo, obtener publication.attempted
y llamar `finish(attempted, timeout)`: devuelve estado durable y resumen final.
Incluye plazo de entrega y salida del proceso. Timeout/Drop cancela, termina
el hijo y une el hilo, también si solo esperaba muestras. Una confirmación
perdida sigue siendo incierta hasta reabrir; no hay retry automático. Repetir
un chunk idéntico es seguro; tras finish no se admiten nuevos índices.

`SeriesReader::open(exe, db)` abre un proceso histórico read-only;
`state()`, `page(after, 1..16)` y `analyze(1..256)` son APIs síncronas fuera
de adquisición/renderizado. El estado conserva tail_lost conocido o desconocido;
los resúmenes conservan huecos y vueltas sin seal. No tratar finished como
prueba de cobertura completa. Al soltar reader se libera el proceso.

La recuperación reconstruye el prefijo completo con memoria acotada, coste
dependiente del tamaño; no se promete latencia de apertura para sesiones enormes.
No autorestart de un feed desconectado ni nuevo índice cero sobre la misma DB:
el supervisor decide productor/época y nueva grabación. La API de replay/retry
recupera DB propias; no repara archivos desconocidos/corruptos ni borra filas.

Tests con DB temporales reales; no DB de usuario ni telemetría física.
Evidencia de compilación, gates y límites en el microplan de fase 4.
