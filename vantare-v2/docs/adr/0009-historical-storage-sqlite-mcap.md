# ADR 0009: SQLite autoritativo y MCAP de intercambio para histórico

## Estado

Aceptado para SQLite como almacenamiento local autoritativo. MCAP permanece
candidato condicionado para intercambio/replay; DuckDB y un framing propio
siguen `NO-GO` como store autoritativo de Telemetry Core. Implementación y
promoción pertenecen a Linear, Git/GitHub y el handoff vivo.

## Fecha

2026-07-30

## Contexto

Telemetry Core necesita conservar sesiones locales para replay y análisis sin
bloquear el directo. Los requisitos que deciden el backend son:

- Windows 10/11 y Wails con `CGO_ENABLED=0`;
- cero pérdida silenciosa a 4× y con 64 vehículos;
- objetivo RPO local máximo de 2 segundos desde accepted volátil hasta
  watermark persistido, pendiente de demostrar con el coordinator;
- lectura concurrente y consultas deterministas por cursor, tiempo y canal;
- sesiones incompletas visibles y recuperables;
- crecimiento acotado, versionado y migración segura;
- raw separado, desactivado por defecto y sin PII;
- recuperación y migración siempre sobre copia, conservando el original.

Se compararon los mismos bytes sanitizados con:

- `modernc.org/sqlite v1.55.0`;
- `github.com/foxglove/mcap/go/mcap v1.9.0`;
- `github.com/duckdb/duckdb-go/v2 v2.10505.0`;
- framing append-only propio, exclusivamente como control desechable.

La metodología, comandos y CSV crudos viven en
`docs/telemetry-core/storage-benchmark-isa-101.md` y
`docs/telemetry-core/evidence/isa-101-storage/`.

## Decisión

### 1. SQLite CGO-free es el candidato autoritativo para TC-06B

`GO` condicionado a implementar y demostrar en TC-06B:

1. adaptador privado tras el puerto de recording; ningún tipo SQL cruza a
   `schema`, `core`, `derive` o productos;
2. `modernc.org/sqlite` fijado a una versión exacta junto con la versión exacta
   de `modernc.org/libc`;
3. `PRAGMA journal_mode=WAL`, `PRAGMA synchronous=FULL`,
   `PRAGMA foreign_keys=ON`, `application_id=0x56414E54` y `user_version=1`;
4. checkpoints cada 1,5 segundos como máximo, con presupuesto de commit de
   500 ms; si el presupuesto se incumple, el recorder se detiene, marca la
   sesión `incomplete` y avisa sin bloquear live;
5. manifest `integrityState=recording` persistido antes del primer accept,
   `accessMode` ortogonal, watermark accepted persistido separado del accepted
   volátil y cursor committed;
6. límites explícitos por tiempo/tamaño y política de retención;
7. fault injection real para disco lleno, writer lento y permisos;
8. build Wails Windows real con la dependencia integrada, inventario de
   licencias y delta binario final;
9. recuperación, migración e `integrity_check` sobre copia; nunca reparar el
   único original in-place.

El benchmark de ISA-101 prueba viabilidad, round-trip y recuperación local. No
prueba todavía el coordinador, la cola acotada, el aviso al usuario, los límites
de retención ni el empaquetado final con SQLite dentro de Vantare.

### 2. MCAP queda como candidato de export/import/replay

Capacidades upstream relevantes:

- formato público, versionado, con canales, chunks, índices y CRC;
- biblioteca Go CGO-free y licencia MIT;
- payload idéntico al autoritativo, sin transformarlo en fuente live;
- la documentación oficial anuncia `mcap recover` sobre una copia.

La recuperación CLI **no quedó verificada localmente**: el CLI consultado no
compiló por incompatibilidad de versiones, registrada en la evidencia. Por
tanto esto no es un `GO` local para export/replay; TC-06B o una issue posterior
debe validar una herramienta compatible, golden round-trip y recovery antes de
adoptarlo. No es el store autoritativo. La API Go probada no expone un
checkpoint durable del chunk activo: antes de `Close`, el kill determinista no
recuperó registros aceptados y el reader detectó el fichero incompleto. Un
export MCAP se genera desde datos ya durables y puede reintentarse o borrarse.

### 3. DuckDB queda fuera del camino de grabación

DuckDB recibe `NO-GO` como backend autoritativo en el entorno actual:

- el binding Go oficial requiere CGO;
- con `CGO_ENABLED=0`, los bindings Windows quedan excluidos por build tags;
- con CGO habilitado, el host no dispone de `gcc`;
- el enlace estático aumenta el binario y no se pudo medir el ejecutable real;
- por tanto no pasa el gate Windows/Wails ni permite cerrar packaging,
  dependencias enlazadas y recuperación con evidencia local.

DuckDB solo puede reabrirse en una issue futura como cache analítica
reconstruible. Esa cache:

- se genera desde SQLite autoritativo;
- nunca recibe datos directamente del recorder;
- puede eliminarse y reconstruirse;
- no participa en RPO, recovery ni migración autoritativa;
- necesita toolchain, build Wails, tamaño, licencias y crash tests propios.

### 4. El framing propio se descarta

El framing de control fue el más pequeño y rápido, pero recibe `NO-GO`
productivo. Convertirlo en formato real obligaría a poseer y mantener locks,
índices, migraciones, tooling, repair, compatibilidad y auditoría. Se conserva
solo como baseline reproducible de ISA-101 y puede borrarse con el benchmark.

## Evidencia que sostiene la decisión

- Los tres candidatos CGO-free escribieron y leyeron exactamente el mismo
  SHA-256 por escenario, sin pérdidas a nominal, 4×, 64 vehículos, ráfagas y
  24 h lógicas.
- Las medianas primarias excluyen la primera pasada y están en
  `raw-aggregate.csv`; la única pasada 24 h no tiene mediana.
- Kills en cuatro límites verificaron para framing/SQLite: el lote previo
  permanece antes de append/commit; el backend puede quedar en `240` mientras
  el manifest sigue en `200` tras commit; tras reemplazo ambos quedan en `240`.
  Esto es evidencia del límite del backend y manifest experimental, no del
  coordinator productivo ni de ACK durable.
- MCAP no ofrece un commit parcial en la API probada y queda `NO-GO`
  autoritativo.
- Un tail truncado fue visible en los tres candidatos y el SHA-256 del original
  no cambió porque la recuperación operó sobre copia.
- El probe `CGO_ENABLED=0` produjo ejecutables del harness corregido de
  `4.001.280` bytes para framing, `7.719.424` para MCAP y `10.824.192` para
  SQLite. DuckDB no compiló.
- La base Wails real sí compiló con `CGO_ENABLED=0`; esto valida el entorno,
  no la integración futura de SQLite.

## Modelo histórico aprobado para TC-06B

El contrato normativo está en
`docs/telemetry-core/historical-storage-schema.md`:

- manifest atómico por sesión;
- `observed` y `facts` autoritativos;
- `derived` reconstruible y ligado a versiones de algoritmos;
- raw separado y opt-in;
- chunks con schema, codec, epoch, secuencia, tiempo y CRC;
- accepted volátil, watermark accepted persistido y committed separados;
- `RecordingPayloadV1` y `RecordingFactV1` allowlisted, versionados y separados
  de core;
- migración copy-on-write y versiones futuras read-only.

## Consecuencias

- Telemetry Analysis y Strategy podrán consultar un histórico estable sin
  poseer el recorder ni la base.
- El ratio aproximado `2,0×` solo describe esta fixture sintética y estos
  índices. No estima footprint real, retención ni crecimiento multisesión.
  TC-06B debe repetir con el mapping real de `RecordingPayloadV1` y
  `RecordingFactV1`.
- MCAP añade una ruta portable, pero no sustituye al manifest ni a SQLite.
- DuckDB no entra en el binario productivo durante TC-06.
- La dependencia `modernc.org/sqlite` sigue sin estar aprobada para el módulo
  raíz hasta completar TC-06B y la validación humana.

## Riesgos y mitigaciones

| Riesgo | Mitigación obligatoria |
|---|---|
| WAL crece por readers largos | readers cortos, métricas, checkpoint acotado y cierre explícito |
| commit supera presupuesto | detener recording, `incomplete`, aviso; live continúa |
| manifest queda detrás de DB | recovery escanea copia, conserva estado incomplete y nunca infiere accepted perdidos exactos |
| versión futura | abrir read-only; nunca downgrade implícito |
| migración corrupta | copy-on-write, `integrity_check`, SHA-256 y conservar original |
| disco lleno/permisos | fault injection en TC-06B; no depender de pruebas destructivas del host |
| nombres/IDs/raw | allowlist; raw aparte, opt-in, con límite y sin export automático |
| dependencia CGO-free deriva | pin exacto de `sqlite` y `libc`, build Windows/Wails por actualización |

## Rollback

Antes del wiring productivo, rollback es eliminar el módulo de benchmark y
revertir este ADR. Después de TC-06B:

1. detener nuevas grabaciones;
2. conservar sesiones y manifests sin modificarlos;
3. revertir composition/wiring, pero retener la dependencia necesaria mientras
   existan sesiones que requieran esa versión;
4. mantener un reader/exporter read-only por cada versión aún presente;
5. nunca convertir ni borrar sesiones automáticamente durante el rollback.

## Fuentes primarias

- [DuckDB Go y requisitos Windows/CGO](https://github.com/duckdb/duckdb-go)
- [DuckDB: versiones del formato](https://duckdb.org/docs/stable/internals/storage)
- [DuckDB: concurrencia](https://duckdb.org/docs/stable/connect/concurrency.html)
- [DuckDB: ficheros y WAL](https://duckdb.org/docs/lts/operations_manual/footprint_of_duckdb/files_created_by_duckdb)
- [modernc SQLite CGO-free y plataformas](https://pkg.go.dev/modernc.org/sqlite)
- [modernc SQLite: repositorio canónico y licencia](https://gitlab.com/cznic/sqlite)
- [SQLite: application_id y user_version](https://www.sqlite.org/pragma.html)
- [SQLite: WAL](https://www.sqlite.org/wal.html)
- [SQLite: atomic commit](https://www.sqlite.org/atomiccommit.html)
- [SQLite: causas de corrupción](https://www.sqlite.org/howtocorrupt.html)
- [MCAP: especificación](https://mcap.dev/spec)
- [MCAP: matriz de APIs](https://mcap.dev/reference)
- [MCAP: recovery oficial](https://mcap.dev/guides/cli#recovering-data-from-a-corrupt-file)
- [MCAP: repositorio y licencia](https://github.com/foxglove/mcap)
