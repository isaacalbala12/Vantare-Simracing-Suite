# Fixture session-v1.duckdb

DB temporal vacía del formato `vantare.series-db.v1`, creada con DuckDB 1.5.5
oficial y bloque de 16 KiB. No contiene tablas de metadatos de sesión ni vueltas.
Se incluye para probar el helper real sin añadir un binding SQL al host.

SQL de creación (sobre un adjunto nuevo con `BLOCK_SIZE 16384`):

```sql
CREATE TABLE series_meta(singleton BOOLEAN PRIMARY KEY, schema_version VARCHAR,
    watermark UBIGINT, finished BOOLEAN, attempted UBIGINT);
INSERT INTO series_meta VALUES(true, 'vantare.series-db.v1', 0, true, 0);
CREATE TABLE series_chunks(idx UBIGINT PRIMARY KEY, payload BLOB);
CHECKPOINT;
```

El test confirma `unsupported meta` con el helper y después consulta mediante
el Reader de solo lectura, sin modificar el fichero. Las DB v2 de los tests se
crean con `--create` y los comandos cerrados del propio helper.
