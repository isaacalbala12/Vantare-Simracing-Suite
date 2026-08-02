# ISA-102 / TC-06B — RecordingSink y SQLite histórico

Estado: implementado en rama de issue; tercera review `ACCEPT` sin P0/P1/P2/P3
conocidos. No hay wiring productivo, UI ni promoción; commit/PR/Linear quedan
para la entrega del orquestador.

## Resultado

TC-06B convierte el contrato aprobado por ISA-101 en un adaptador privado
SQLite CGO-free. La frontera neutral vive en `internal/telemetry/recording`;
`database/sql` y `modernc.org/sqlite` solo pueden importarse desde
`internal/telemetry/recording/sqlite`.

El reducer y el publisher live no hacen I/O. `TryAccept` valida y encola sin
esperar al disco. La cola es acotada y nunca elimina datos silenciosamente:
cola llena, edad de datos volátiles de dos segundos, almacenamiento lento o
fallido detienen únicamente la grabación y dejan una sesión `incomplete`.

Este corte no activa grabación en LMU. El consentimiento, la selección de
carpeta y el wiring del composition root pertenecen a cortes posteriores.

## Contratos

- `RecordingPayloadV1` y `RecordingFactV1` son DTO cerrados, versionados y
  allowlisted. Rechazan campos desconocidos, payloads mayores de 256 KiB,
  NaN/Inf, máscaras presence desconocidas, cursores inválidos y más de 128
  vehículos. FactType e IncompleteReason usan catálogos v1 cerrados.
- Todo `RecordingBatch` v1 contiene al menos un snapshot. `Accepted` siempre es
  el cursor del último snapshot del batch; un batch solo de hechos se rechaza.
  Los hechos conservan su propia secuencia independiente dentro de `facts`.
  Los límites temporales del chunk incluyen timestamps de snapshots y hechos,
  sin convertir `factSequence` en cursor durable.
- El mapper consume snapshots/hechos reales de Telemetry Core. Sustituye la
  identidad por slots locales efímeros y nunca serializa nombres, Steam IDs,
  rutas, metadata abierta o raw.
- `HistoricalStore`, `SessionWriter` y `SessionReader` no exponen SQLite.
- `SessionManifest` valida la tabla de estados: estados no terminales no tienen
  fin ni motivo; `complete` exige fin y cursores iguales; `incomplete` exige fin
  y motivo; el watermark persistido nunca supera al committed; checkpoints UTC
  quedan entre inicio y fin.
- `accepted` es ownership volátil, `committed` es transacción confirmada y
  `persistedAccepted` es solo el watermark que ya estaba en un manifest
  atómico. `Abort` nunca convierte la cola volátil en durable.

## Durabilidad y límites

- SQLite usa WAL, `synchronous=FULL`, foreign keys, `application_id` y
  `user_version=1`.
- El manifest se escribe mediante temporal sincronizado y reemplazo atómico.
  En Windows se usa `MoveFileEx` con replace y write-through.
- Batches: hasta 64 entradas por transacción.
- Checkpoint: como máximo cada 1,5 s.
- Operación de append/checkpoint/complete: contexto real con máximo 500 ms,
  cancelado siempre al retornar.
- Deuda volátil: máximo dos segundos desde el primer accepted todavía no
  persistido. Un ledger guarda cursor y acceptedAt de cada batch aún no
  cubierto; está acotado por el batch en vuelo más la capacidad del canal. Un
  checkpoint parcial retira solo cursores cubiertos y la edad pasa al primer
  restante, también entre epochs. Estar idle no consume ese presupuesto.
- Abort recibe un contexto acotado; cierre y double-stop son idempotentes. Un
  fallo terminal registrado siempre prevalece sobre un Stop concurrente y
  nunca se llama Complete después de queue-full/RPO/error.
- Un directorio de sesión no se reutiliza. Recovery se rechaza mientras su
  writer esté activo, incluso desde otra instancia o proceso.
- `MaxSessionBytes` es opcional. Al cruzarlo se conserva el último batch
  committed, se detiene la grabación y nunca se elimina contenido
  automáticamente.

La persistencia del manifest recibe `context.Context`. Comprueba cancelación
entre creación, permisos, chunks de 32 KiB, sync, cierre y replace; siempre
limpia el temporal. Los adaptadores y dobles propios deben cooperar con el
contexto. No se promete hard real-time dentro de una syscall de filesystem que
el kernel no permita cancelar: si el replace ya terminó, se considera commit
real y no se informa falsamente como cancelado.

## Esquema y lectura

`history-v1.sqlite` conserva chunks, observed, facts, algoritmos, derived y la
reserva raw definida por ADR 0005. Cada payload y chunk tiene CRC32. Las
consultas de observed/facts son read-only, por rango inclusivo y orden total
determinista. El reader valida CRC y permite filtrar tipos de hecho.

Los manifests futuros solo se inspeccionan como metadata read-only tras validar
un envelope común: session ID igual al directorio y nombre de DB base-only
`history-vN.sqlite` coherente con la versión. No se abre ni recupera una DB de
versión desconocida.

## Crash y recuperación

Los tests matan un subproceso en cuatro límites reales: antes de append, antes
de commit, después de commit/antes de manifest y después del reemplazo del
manifest. Startup interpreta `opening`, `recording` y `recovering` como
incomplete efectivo.

Recovery es copy-on-write: copia DB/WAL/SHM a
`recovery/<id-local>`, valida y checkpointa la copia, y deja el resultado
read-only/incomplete. El SHA-256 representa el bundle estable de DB, WAL y SHM;
se calcula antes y después para demostrar que el original no cambió. Nunca se
promueve automáticamente la copia.

Cada sesión usa un lease de filesystem antes de Begin o RecoverCopy. En
Windows es un handle `CreateFile` exclusivo, mantenido hasta Close y liberado
por el kernel incluso si el proceso termina sin cleanup. El fichero puede
permanecer, pero no representa por sí mismo un lease activo. El fallback
portable usa creación exclusiva fail-safe: un crash puede dejar un fichero
stale que bloquea operación posterior, pero nunca habilita dos writers. Vantare
se distribuye inicialmente en Windows y el test de subproceso cubre el
comportamiento productivo.

Los DSN SQLite se construyen como URI mediante `net/url`; `#`, `%`, espacios y
Unicode quedan codificados sin cambiar la ruta. El flujo completo se prueba
bajo `folder # 100% telemetría 測試`.

## Privacidad

Persistido:

- tiempo, cursores, señales allowlisted, calidad/presencia, slots locales;
- hechos cerrados y valores numéricos;
- versiones, integridad y métricas de almacenamiento.

No persistido:

- nombre de piloto/evento/sesión, Steam ID, Vehicle ID original;
- rutas absolutas, metadata abierta, audio, estrategia o raw real.

`rawCapture` permanece obligatoriamente `disabled` en v1.

## Dependencia y packaging

La única dependencia directa nueva es `modernc.org/sqlite v1.55.0`, fijada con
sus transitivas exactas. Licencias y tamaños están en
`evidence/isa-102-recording/`.

El build Windows Wails con `CGO_ENABLED=0` pasa. El probe simple del binario
crece 512 bytes porque todavía no existe wiring productivo y el linker elimina
el adaptador no usado; el binario de tests SQLite demuestra que el driver sí
compila sin CGO. Esto no sustituye volver a medir cuando TC-07 conecte el
composition root.

## Rendimiento y capacidad

Benchmark de cinco ejecuciones con 64 vehículos:

- 3,25–3,53 ms por append;
- 15.952–16.413 B/op;
- 72–75 allocs/op.

La matriz 4× guarda 400 snapshots de 64 vehículos y 40 hechos en 3.444.736
bytes: 8.611,8 bytes por snapshot. Es evidencia de crecimiento, no una promesa
de tamaño para todas las sesiones.

## Fallos cubiertos

ENOSPC, fallo antes de append/commit/manifest, permiso del manifest, writer
lento o que solo responde a cancelación, budget RPO, cola llena, carrera
fallo/Stop, abort acotado, double-stop, reutilización, lease entre Stores y
procesos, crash del holder, recovery activo, traversal/absolute path, schema
futuro, CRC/identidad, crashes y liberación de handles.

## Exclusiones

Sin UI, consentimiento, wiring productivo, MCAP, replay, DuckDB, raw real,
Strategy, análisis, cambios al reducer ni limpieza ajena. TC-07 deberá decidir
la composición productiva y volver a ejecutar packaging/rendimiento con el
adaptador enlazado.

## Rollback

El corte es reversible retirando el paquete `recording/sqlite`, los puertos y
la dependencia modernc. No hay migraciones productivas ni datos de usuarios.
