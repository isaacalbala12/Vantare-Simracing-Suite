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

- Arranque devuelve `["ready", watermark]`.
- `["append", SeriesChunk-v1]` devuelve `["ack", watermark]` tras COMMIT.
- `["status"]` devuelve `["status", watermark]`.
- `["stop"]` o EOF cierra la conexión y el proceso.

Sin SQL arbitrario. Índice ya guardado con bytes iguales es idempotente;
contenido distinto, orden/progreso inválido o entrada corrupta falla sin ACK.
Chunk y watermark se escriben en una transacción. Fallo de SQL/COMMIT obliga
a reabrir antes de continuar, sin reintento ciego de un resultado incierto.
Al abrir se verifica watermark y se reconstruye el analizador compartido por
páginas de 16, con memoria acotada. No confundir este watermark (último chunk
guardado) con ausencia de huecos: índice/offset/lost_before conservan pérdidas.
Un proceso caído puede haber confirmado un chunk cuyo ACK se perdió; repetir
exactamente ese chunk es seguro.

Recording no se activa al suscribir ni al arrancar Core. El llamador debe
arrancar este binario explícitamente fuera de adquisición, consumir el
Receiver en un worker y flush al parar. La integración Hub es fase 5 y el
journal fase 3; el launcher actual sigue sin arrancar este proceso.

Tests con DB temporales reales; no DB de usuario ni telemetría física.
Evidencia de compilación, gates y límites en el microplan de fase 4.
