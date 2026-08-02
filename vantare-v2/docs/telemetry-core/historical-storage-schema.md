# TC-06 — contrato de sesión y esquema histórico v1

Estado: contrato implementado por ISA-102 / TC-06B en rama de issue, pendiente
review y sin wiring productivo. Evidencia:
[`recording-sink-sqlite-isa-102.md`](recording-sink-sqlite-isa-102.md).

## Objetivo y fronteras

Una sesión histórica debe poder explicar qué fue aceptado, qué llegó a disco,
qué quedó incompleto y con qué versiones puede reproducirse. El recorder es un
adaptador externo: nunca hace I/O en el reducer ni bloquea el live.

Autoridad:

- `observed` y `facts`: autoritativos una vez committed y reflejados por el
  manifest activo;
- `derived`: cache reconstruible, con algoritmo y versión explícitos;
- `raw`: fichero separado, opt-in, limitado y desactivado por defecto;
- DuckDB u otra cache analítica: siempre reconstruible y no autoritativa.

No se guardan nombres, rutas absolutas, IDs remotos ni raw real por defecto.
Los manifests y logs usan IDs aleatorios locales y datos allowlisted.

## Layout por sesión

```text
recordings/
  <session-id-local>/
    manifest.json
    history-v1.sqlite
    raw/
      <segment-id>.bin
    exports/
      <export-id>.mcap
    recovery/
      <attempt-id>/
        manifest.json
        history-v2.sqlite
```

- `manifest.json` se escribe en `manifest.tmp`, se sincroniza y se reemplaza
  atómicamente. Nunca contiene rutas absolutas.
- `history-vN.sqlite`, `-wal` y `-shm` forman una unidad mientras la sesión está
  abierta. No se copian o renombran por separado durante una transacción.
- recovery y migración trabajan en `recovery/<attempt-id>`; el original queda
  read-only y su SHA-256 se registra antes y después.
- raw y MCAP nunca son necesarios para abrir el histórico autoritativo.

## Manifest v1

Campos mínimos:

| Campo | Contrato |
|---|---|
| `manifestVersion` | `1`; una versión futura se abre read-only |
| `recordingSchemaVersion` | `1`, independiente de canonical/projection |
| `activeDatabase` | nombre relativo versionado, por ejemplo `history-v1.sqlite` |
| `sessionID` | ID local opaco; no nombre de piloto/evento |
| `simulatorID` | enum allowlisted, por ejemplo `lmu` |
| `appBuild` | versión Vantare que escribió |
| `integrityState` | `opening`, `recording`, `complete`, `incomplete`, `recovering` |
| `accessMode` | `read_write` o `read_only`; no describe integridad |
| `startedAtUTC` / `endedAtUTC` | UTC; `endedAtUTC` puede faltar |
| `persistedAcceptedCursor` | último accepted watermark que llegó a un manifest atómico |
| `committedCursor` | último lote confirmado por el backend; puede estar por delante del manifest tras crash |
| `lastCheckpointAtUTC` | instante del manifest durable |
| `incompleteReason` | enum sanitizado, nunca error/path raw |
| `derivedAlgorithms` | lista ordenada `id`, `version`, `configDigest` |
| `rawCapture` | `disabled` o límites/segmentos explícitos |
| `integrity` | SHA-256/CRC de artefactos cerrados y resultado de validación |

El contador `accepted` más reciente vive en memoria y es volátil. No se
promete un ACK durable por lote. `Abort` no promueve ese contador al manifest:
conserva el último `persistedAcceptedCursor` ya escrito y el committed conocido.
Tras un crash solo se conoce con certeza ese watermark; por ello la pérdida
posterior está acotada por la cola/cadencia, pero no puede cuantificarse
exactamente.

## Cursores y durabilidad

Estados:

```text
crear manifest integrityState=recording antes de aceptar el primer lote
  -> TryAccept en cola acotada; accepted avanza solo en memoria
  -> writer agrupa
  -> transacción SQLite commit
  -> manifest.tmp + fsync + replace con persistedAcceptedCursor/committedCursor
  -> publicar último watermark persistido
```

- `accepted` significa ownership del recorder y es volátil.
- Cada batch v1 exige al menos un snapshot; `accepted` es el cursor del último
  snapshot. `factSequence` permanece en su namespace independiente y nunca
  sustituye el cursor durable.
- `committed` significa transacción confirmada por el backend.
- `persisted accepted watermark` significa el último accepted conocido en el
  manifest; no convierte cada ACK previo en durable.
- En startup, `opening`, `recording` o `recovering` pasan a `incomplete`;
  `complete` se conserva. `accessMode=read_only` es ortogonal y nunca se
  convierte en un estado de integridad.
- Intervalo máximo propuesto: `1.500 ms`.
- Presupuesto de commit/manifest: `500 ms`.
- Edad máxima del accepted pendiente más antiguo: `2.000 ms`; estar idle no
  consume este presupuesto.
- Si cola, disco o commit no cumplen: no se bloquea al publisher; el recorder
  se detiene, marca `incomplete`, conserva el último watermark persistido y
  notifica.
- Begin y recovery adquieren un lease exclusivo de filesystem compartido entre
  procesos. En Windows el kernel libera el handle al morir el proceso.
- No hay eviction, overwrite o drop silencioso.

El objetivo RPO es `<= 2 s`, pendiente de demostrar en TC-06B con el
coordinator real. ISA-101 solo ejercita límites del backend y un manifest
experimental; no convierte tiempos locales ni watermarks en un ACK durable.

## RecordingPayloadV1, RecordingFactV1 y privacidad

`RecordingPayloadV1` y `RecordingFactV1` son DTOs de almacenamiento propios,
versionados y separados de `core.ObservedState`/facts runtime. No se serializan
los tipos core completos.

Allowlist v1:

- versión, canal, epoch, secuencia y tiempo de captura;
- `session_slot` local por vehículo, velocidad, throttle, brake, gear, pit;
- máscaras de presencia y quality enum;
- `RecordingFactV1`: versión/canal, epoch/secuencia/tiempo, secuencia observed
  causal, `fact_type` enum, slot local, valor numérico, presencia y quality.

Prohibido:

- nombres de piloto, equipo, vehículo, evento o servidor;
- IDs remotos, Steam/plataforma/licencia/cuenta;
- rutas absolutas o relativas aportadas por una fuente;
- raw shared-memory/REST, audio/voz, tokens o secretos;
- mapas de metadata, texto libre o campos desconocidos.

El `sessionID` del manifest es opaco y aleatorio. Los vehículos se remapean a
slots locales por sesión; no existe identificador estable entre sesiones. El
módulo aislado incluye golden SHA-256 observed/fact y pruebas sobre JSON base
válido que exigen `UnknownRecordingFieldError` para nombres, IDs remotos, rutas,
metadata abierta y cualquier campo desconocido.

## SQLite v1

Identidad del fichero:

```sql
PRAGMA application_id = 1447120468; -- 0x56414E54, "VANT"
PRAGMA user_version = 1;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
```

Esquema conceptual mínimo:

```sql
CREATE TABLE recording_meta (
  key TEXT PRIMARY KEY,
  value BLOB NOT NULL
);

CREATE TABLE chunks (
  chunk_id INTEGER PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  codec TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  first_sequence INTEGER NOT NULL,
  last_sequence INTEGER NOT NULL,
  first_captured_at_ns INTEGER NOT NULL,
  last_captured_at_ns INTEGER NOT NULL,
  observed_count INTEGER NOT NULL,
  fact_count INTEGER NOT NULL,
  payload_bytes INTEGER NOT NULL,
  payload_crc32 INTEGER NOT NULL,
  durable_at_ns INTEGER NOT NULL,
  UNIQUE(epoch, first_sequence),
  CHECK(last_sequence >= first_sequence)
);

CREATE TABLE observed_records (
  epoch INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  captured_at_ns INTEGER NOT NULL,
  source_time_ns INTEGER,
  chunk_id INTEGER NOT NULL REFERENCES chunks(chunk_id),
  payload BLOB NOT NULL,
  payload_crc32 INTEGER NOT NULL,
  PRIMARY KEY(epoch, sequence)
);

CREATE TABLE facts (
  epoch INTEGER NOT NULL,
  fact_sequence INTEGER NOT NULL,
  causal_snapshot_sequence INTEGER NOT NULL,
  occurred_at_ns INTEGER NOT NULL,
  chunk_id INTEGER NOT NULL REFERENCES chunks(chunk_id),
  fact_type INTEGER NOT NULL,
  payload BLOB NOT NULL,
  payload_crc32 INTEGER NOT NULL,
  PRIMARY KEY(epoch, fact_sequence)
);

CREATE TABLE algorithm_sets (
  algorithm_set_id INTEGER PRIMARY KEY,
  ordered_manifest BLOB NOT NULL,
  manifest_sha256 BLOB NOT NULL UNIQUE
);

CREATE TABLE derived_records (
  algorithm_set_id INTEGER NOT NULL REFERENCES algorithm_sets(algorithm_set_id),
  epoch INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  derived_at_ns INTEGER NOT NULL,
  payload BLOB NOT NULL,
  payload_crc32 INTEGER NOT NULL,
  PRIMARY KEY(algorithm_set_id, epoch, sequence)
);

CREATE TABLE raw_segments (
  segment_id TEXT PRIMARY KEY,
  relative_path TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  codec TEXT NOT NULL,
  first_captured_at_ns INTEGER NOT NULL,
  last_captured_at_ns INTEGER NOT NULL,
  byte_length INTEGER NOT NULL,
  sha256 BLOB NOT NULL,
  consent_revision INTEGER NOT NULL
);

CREATE INDEX observed_by_time
  ON observed_records(captured_at_ns, epoch, sequence);
CREATE INDEX facts_by_time
  ON facts(occurred_at_ns, epoch, fact_sequence);
CREATE INDEX facts_by_type_time
  ON facts(fact_type, occurred_at_ns, epoch, fact_sequence);
```

Reglas:

- un commit contiene `chunks` y todos sus records; nunca queda un chunk parcial;
- payloads conservan su envelope binario versionado y CRC por registro;
- `chunks.payload_crc32` cubre los payloads en orden;
- codec v1 puede ser `none`; no se introduce compresión sin benchmark/golden;
- `derived_records` puede borrarse completo y reconstruirse;
- raw se referencia por ruta relativa y SHA-256, nunca se mezcla en SQLite.

## Consultas deterministas

TC-06B debe exponer puertos neutrales para:

- último cursor committed validado contra el manifest;
- rango inclusivo por UTC y por epoch/secuencia;
- hechos por rango/tipo y continuidad de `fact_sequence`;
- resumen por canal, counts, inicio/fin y estado incomplete;
- scan ordenado de observed/facts;
- replay con clock inyectado, velocidad y step mode solo en harness.

Orden total:

1. observed: `(epoch, sequence)`;
2. facts: `(epoch, fact_sequence)`;
3. rango temporal: tiempo, después epoch y secuencia;
4. nunca usar orden físico de filas como contrato.

## Versionado y migración

Versiones independientes:

- `manifestVersion`;
- `recordingSchemaVersion` / SQLite `user_version`;
- payload observed/fact;
- canonical/projection;
- cada algoritmo derived;
- MCAP profile/export.

Política:

1. misma versión: read-write normal;
2. versión anterior soportada: abrir read-only y ofrecer migración;
3. versión futura: read-only, sin interpretar campos desconocidos como cero;
4. versión retirada: export explícito con lector histórico o error claro;
5. nunca downgrade in-place.

Migración copy-on-write:

1. cerrar handles y registrar SHA-256 del original;
2. producir `history-vN+1.sqlite` junto al original; nunca reemplazar el DB
   activo ni usar el rename del DB como commit de migración;
3. recuperar/checkpointar la copia;
4. migrar una versión por transacción;
5. ejecutar `foreign_key_check`, `integrity_check`, counts, cursores, CRC y
   replay golden;
6. sincronizar el DB nuevo y escribir un manifest nuevo que lo referencia;
7. **solo el replace atómico del manifest** cambia el DB activo;
8. conservar DB, dependencia y reader read-only de la versión anterior mientras
   exista cualquier sesión que la necesite, salvo export/borrado explícito.

## Contrato exacto para TC-06B

TC-06B implementa solo:

- puerto neutral de store y coordinator fuera del reducer;
- adaptador SQLite privado;
- manifest v1 y status visible;
- cola acotada, batches, checkpoint y teardown;
- startup recovery sobre copia;
- tests de full disk, writer lento, permisos, kill, tail, doble start/stop,
  cancelación y reader concurrente;
- build Windows/Wails real y delta binario/licencias final.

No implementa:

- MCAP export/import (secuencia posterior);
- replay productivo;
- inspector/UI;
- DuckDB;
- raw real;
- migraciones de datos de usuario existentes;
- wiring de productos o cambios al reducer.

Puerto mínimo orientativo, sin tipos SQL:

```go
type HistoricalStore interface {
    Begin(context.Context, SessionManifest) (SessionWriter, error)
    Inspect(context.Context, SessionRef) (SessionSummary, error)
    RecoverCopy(context.Context, SessionRef) (RecoveryReport, error)
}

type SessionWriter interface {
    Append(context.Context, RecordingBatch) (VolatileAcceptedCursor, error)
    Checkpoint(context.Context) (PersistedWatermark, error)
    Complete(context.Context) error
    Abort(context.Context, IncompleteReason) error
}
```

El método de entrada usado por live debe ser no bloqueante (`TryAccept` o
equivalente). Los métodos anteriores pertenecen al worker del recorder, no al
reducer.

## Gates de cierre de TC-06B

- 4× y 64 vehículos sin digest/count/cursor divergente;
- RPO `<= 2 s` con checkpoints periódicos, no solo `Close`;
- cola llena, disk full, timeout, writer lento y permisos detienen recording,
  conservan live y producen `incomplete`;
- recovery preserva el original, valida DB frente al watermark persistido y no
  inventa el número de accepted volátiles perdidos;
- kills deterministas antes de append, antes de commit, después de commit/antes
  de manifest y después del replace del manifest;
- `integrityState=recording` persistido antes del primer accept; opening,
  recording y recovering aparecen incomplete al reiniciar, sin mezclar
  `accessMode`;
- golden/negativos de `RecordingPayloadV1` y `RecordingFactV1`, incluida
  prohibición tipada de PII/IDs/rutas/campos desconocidos;
- reader concurrente no bloquea writer fuera del presupuesto;
- crecimiento y retención medidos;
- dependencia, licencias y Wails Windows cerrados;
- review independiente sin P0/P1/P2;
- gate manual de Isaac pendiente antes de cualquier promoción.
