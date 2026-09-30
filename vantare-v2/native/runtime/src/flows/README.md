# Flujos de eventos — ISA-1425 / ISA-1428 / ADR 0099 §2

Journal neutral con codec acotado de eventos `wire` y consumidor separado en
`native/engineer/`. El named pipe de producto y el flag CLI del núcleo aún no
se conectan (propiedad de otros workers). `Core::new` deja recording desactivado.
`Core::with_flows(epoch, retention, Some(path))` es el opt-in de recording.
La época la inyecta el propietario y debe crecer al reiniciar; no se lee reloj
de pared.

Fase 3 añade `Journal::set_recording(Some(path) | None)` y
`recording_status()` (`Disabled`, `Active`, `Degraded(ErrorKind)`). Apertura,
cambio de modo y `persist()` hacen I/O: el propietario debe ejecutarlos fuera
de adquisición. No hay escritura en `observe`. Desactivar no hace flush y
conserva acceso de lectura al prefijo confirmado, sin grabar eventos nuevos.
Un solo archivo por journal; no se permite cambiar ruta perdiendo ese acceso.
Activar estando activo es idempotente, sin descartar eventos pendientes.

Activar tarde o reactivar escribe y sincroniza `[2, index, epoch]`, base de
segmento, antes de grabar nuevos eventos v1. Nunca persiste retroactivamente
el tramo desactivado. Una base no confirma un evento: `durable_cursor()` sigue
siendo el último evento efectivamente sincronizado. En el núcleo vivo el
consumidor recupera los tramos volátiles aún retenidos; tras perderlos, la
lectura del archivo declara `RecordingDisabled` hasta la siguiente base.
Una base seguida de reinicio puede dar dos fronteras (recording y época).

Fallos de apertura, append, fsync o retención pendiente producen estado
degradado; no hay retry automático de escritura incierta. La reactivación
explícita reabre y sincroniza el prefijo legible, y fija otra base. Las fotos
y los eventos en memoria siguen funcionando. El test de disco lleno inyecta
el código de sistema 112 (Windows) en append y fsync, sobre fichero real;
no llena físicamente un disco. La cola rota y el handle sin permiso de
escritura también se prueban con archivos reales.

## Eventos

Solo entrada/salida de boxes del jugador. `Core::observe` compara fotos
consecutivas ya saneadas: misma época, sesión y coche, y dos estados de boxes
`Reliable`. La primera foto, ausencia, obsolescencia, estimación, cambio de
sesión/coche y rechazo no fabrican eventos. `sequence` es la revisión de la
foto que origina el cambio; `(cursor.epoch, cursor.index)` identifica el evento.
El índice del journal no sustituye la revisión única de las fotos.

Cada `Consumer` posee su cursor. `poll` repite la entrega hasta `ack`; el
consumidor conserva el cursor reconocido para reiniciar. Su persistencia es
responsabilidad del consumidor. ACK no altera otros consumidores ni libera
retención. Un cursor nuevo se obtiene tras reconstruir desde la foto actual
con `core.events().tail()` (ambos se leen en el mismo turno del propietario).

En modo volátil se conservan 256 eventos por defecto, o la retención elegida.
Época distinta, cursor inválido y retención agotada dan `Delivery::Gap` con
motivo y base nueva. Antes de reconocer el hueco se reconstruye desde la foto
actual; se omiten también los eventos retenidos anteriores a esa base. No se
deducen hechos a través del hueco.

Observar solo encola en memoria. El propietario llama a
`core.events_mut().persist()` **fuera del hilo de adquisición**. Solo tras
`sync_all` se avanza `durable_cursor`. El núcleo no lanza un worker ni configura
su cadencia: esa integración pertenece a fases posteriores. Un consumidor
durable lee disco fuera de adquisición, en memoria constante. La búsqueda es
lineal; no hay índice especulativo.

El fichero tiene un único propietario por contrato. JSONL v1, un array por
evento: `[1, index, epoch, sequence, session_id, car_id, was_in_pits, in_pits]`.
Máximo 256 bytes por registro; índices contiguos y épocas no decrecientes.
Reabrir recupera el prefijo completo. Una cola sin newline no fue confirmada y
se sella añadiendo `\tABORTED\n`, sin truncar ni reescribir bytes; jamás se
convierte en evento. Corrupción de un registro completo falla explícitamente.
Tras un error de escritura/sync se exige reabrir; no se reintenta un append
incierto duplicando datos. Si la retención pierde eventos aún no persistidos,
`persist` falla por discontinuidad y conserva el prefijo durable anterior.
No se simula recuperación de lo no confirmado. Puede recuperarse un evento
completo cuya confirmación no llegó al llamador: entrega al menos una vez,
deduplicada mediante cursor y ACK.

Incluso con recording se declara `CoreRestart` al cruzar épocas: no se sabe
si quedó una cola volátil sin confirmar. En este caso la base queda justo
antes del primer evento durable de la época siguiente (o en su inicio si
todavía no se persistió ninguno), para poder entregar todos los confirmados.
Es una frontera histórica; no representa la foto actual ni autoriza a inferir
hechos entre épocas. En modo volátil la base sí es la cola de la foto actual.

Seguimiento: [GitHub #1425](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1425).
Notion no disponible en este encargo; Isaac autoriza continuar solo con GitHub.
La entrega local queda pendiente de revisión del orquestador y de restablecer
el seguimiento Notion; no acredita cierre de fase ni promoción de canal.

Las pruebas usan observaciones sintéticas, sin acreditar LMU físico ni caída
abrupta de Windows. Sí ejercitan fichero real, cierre/reapertura del núcleo,
retención, cola rota y reproducción desde cursor.

## Series por vuelta del jugador — esquema v1

`core.series().active()` expone el bloque durante la vuelta y `sealed()` el
último cerrado, por referencia inmutable. Cada foto aceptada aporta una
muestra si contador, distancia y tiempo de vuelta son `Reliable`. Se conserva
la calidad original de velocidad y pedales; ausencia no equivale a cero.
El cierre lo confirma un incremento de exactamente uno en el contador de
vueltas completadas. La foto de cierre se registra en la vuelta nueva; su
revisión queda en `sealed_at` del bloque anterior. No se interpola el cruce
de meta ni la duración total. Un salto/retroceso de contador descarta el
bloque abierto sin inventar un cierre; cambiar sesión, época o jugador
descarta los bloques de la identidad anterior.

Solo se retienen el bloque abierto y el último sellado: máximo 18.000 muestras
en cada ventana. Reciclar la ventana no corta el feed (ver offsets abajo).
Marcan hueco las fotos obsoletas, jugador/progreso ausentes y retrocesos de
distancia o tiempo. En un retroceso se espera al avance del contador para
evitar meter datos de la vuelta nueva en la anterior. Las señales ausentes o
estimadas de velocidad/pedales conservan su etiqueta y no frenan el muestreo.
Las series no escriben disco, tampoco con recording. La entrega incremental
de ISA-1429 descrita abajo añade una cola volátil; esta cola no confirma
durabilidad. El backend aislado debe confirmar su transacción.

`LapBlock::to_bytes()` serializa fuera de adquisición. UTF-8 JSON compacto,
sin espacios, mapas ni reloj de pared, con este array de orden fijo:

```text
["vantare.player-lap.v1", epoch, session_id, car_id, lap,
 sealed_at, gap, [sample, ...]]
sample = [sequence, distance_m, elapsed_s, speed_mps, throttle, brake]
signal = [quality, value]
quality: 0 = Unavailable (value = null), 1 = Reliable,
         2 = Estimated, 3 = Stale
```

Todas las cinco señales usan `signal`. Valores `f64` finitos saneados por el
núcleo; metros, segundos desde el inicio de vuelta, m/s y fracciones 0–1 para
pedales. `epoch`, sesión, secuencia y `sealed_at` son `u64`; coche y `lap`,
`u32`; `gap`, booleano. `lap` conserva **vueltas completadas al abrir**
(`Car::laps`), no un ordinal visual. `sealed_at = null` mientras está abierto.
Las secuencias de muestras y cierre pertenecen a la época de la cabecera.
La primera muestra puede llegar a mitad de vuelta: un bloque contiene solo
lo observado, no acredita cobertura de toda la vuelta. El encoder conserva
orden y calidad; cambiar este contrato exige otra versión.

El corpus `lmu47-high-rate-60s.tar.gz` (SHA-256
`c5b827ce1cfa558e732da934f11eb0f83f5dfb9e8a3c793f4d3f65ef8ca2a01c`)
tiene 3.600 frames SHM y el contador del jugador sigue en 0 en todos: no hay
cierre que probar. Por eso el test de cierre usa un replay **sintético
determinista explícito**, de cuatro observaciones a través de `Adapter` y
`Core::step`, con época inyectada idéntica. Dos reproducciones en núcleos
nuevos deben dar bytes idénticos y coincidir con un JSON v1 fijado a mano.
Otra prueba consume el fixture real LMU 1.4.2.0 por el adaptador productivo:
aporta distancia/tiempo reales al bloque abierto, sin fabricar una vuelta.

## Pruebas y límites

Los nombres abreviados de esta tabla corresponden a tests en `tests.rs`,
`recording.rs` y `series_tests.rs` (todos bajo `flows::`). Ninguno demuestra
LMU/OBS físico, caída de Windows, latencia ni presupuestos de rendimiento.

| Test (prefijo distintivo) | Cubre | No cubre |
| --- | --- | --- |
| `consumer_restart_recovers` | ACK individual, redelivery, reinicio desde cursor y otro consumidor independiente | Persistencia del cursor en Engineer |
| `volatile_core_restart` | Hueco al reiniciar, primera foto sin cambio inventado, reanudación | Caída de un proceso real |
| `exhausted_retention` | Consumidor lento, retención acotada y base de foto nueva | Presupuesto de memoria medido |
| `recording_recovers_every` | Todos los confirmados, expulsión de memoria, prefijo append-only, deduplicación y reapertura | Corte eléctrico |
| `recording_declares_the_uncertain` | Frontera tras perder la cola no confirmada | Recuperación de esa cola perdida |
| `recording_recovers_new_epochs` | ACK volátil perdido, índices reutilizados y recuperación en varias épocas | Cursor guardado por un proceso externo |
| `torn_unconfirmed_tail` | Cola parcial abortada sin truncar el prefijo | Corrupción del medio físico |
| `lost_unconfirmed_retention` | Persistencia rechazada tras perder eventos no confirmados | Rescate de eventos ya expulsados |
| `missing_stale_estimated` | Ausencia, obsolescencia, estimación, sesión y cambio de jugador sin hechos inventados | Capturas live de cada caso |
| `invalid_configuration` | Retención cero, esquema inválido y época no creciente | Validación de todos los posibles bytes corruptos |
| `failed_append` | Error real de escritura y durabilidad sin confirmar; no retry incierto | Disco lleno real o fallo de `sync_all` |
| `a_real_lmu_fixture` | Fixture real → adaptador → núcleo → muestra de distancia/tiempo | Cierre de vuelta real |
| `the_same_replay` | Dos replays idénticos y golden v1, muestras live y cierre coherente | Determinismo de un simulador físico |
| `sealed_block_keeps` | Bytes sellados estables mientras crece la vuelta nueva | Retención de todo el histórico |
| `quality_is_preserved` | Calidad y ausencia distintas de cero en las cinco señales | Todas las señales del dominio |
| `missing_progress_and_stale` | Hueco sin muestrear datos ausentes/obsoletos | Cadencia o frescura del adaptador |
| `counter_jumps_session_changes` | No sellar saltos ni sesión nueva; rechazo sin alterar series | Capturas live de saltos |
| `delayed_lap_counter` | No mezclar muestras tras reiniciar distancia/tiempo antes del contador | Toda variante de orden de actualización LMU |
| `series_memory_is_bounded` | Tope de muestras y saturación visible al sellar | Soak o medición de memoria privada |

Para reproducir las pruebas de este módulo, desde `native/`:

```powershell
cargo test -p vantare-runtime --lib flows -j 2
```

Los gates globales son `cargo fmt --check`,
`cargo clippy --workspace --all-targets -j 2 -- -D warnings` y
`cargo test --workspace -j 2`. Las pruebas live LMU/ACC del workspace siguen
ignoradas por defecto y requieren el juego en marcha; no las sustituye este
módulo. El orquestador mantiene el handoff vivo y revisa el diff completo.

## Entrega incremental — ISA-1429

Antes de adquirir, `core.series_mut().subscribe(capacity)` devuelve un único
`Receiver<SeriesChunk>`, con capacidad 1–256. No activa recording. Se rechaza
otro receptor o configuración tras la primera muestra. El propietario del
worker recibe bloques por esta API. `SeriesWorker` arranca el proceso SQL
explícitamente; el launcher actual aún no lo configura. El accessor de seis líneas en `core/mod.rs`
solo permite configurar este flujo y publicar parciales, sin cambiar Core.

Cada 64 muestras se publica una porción inmutable de LapBlock v1; `offset`
indica su posición en la vuelta. Cerrar publica el resto o un marcador vacío
con `sealed_at` coherente. `flush()` publica antes un parcial y/o un hueco
nuevo; llamarlo con la cadencia deseada y antes de parar. No duplica un parcial
vacío sin cambio. Sesión/coche/época o salto de contador entregan el resto
anterior con `gap = true` y sin inventar un cierre.

`index` crece por intento; `lost_before` cuenta los intentos perdidos desde
la última entrega. `try_send` no espera a un consumidor lento. El estado
`publication_status()` expone intentos/entregados/perdidos/desconexión y
agotamiento de índice, incluso si nunca se puede entregar otro bloque. No hay
ACK durable ni promesa de pérdida cero. Tras desconexión no se copian nuevas
muestras para el receptor muerto. Las señales conservan su calidad original.
Máximo adicional en cola: `capacity × 64` muestras, además de las dos vueltas
acotadas ya existentes. Serialización y análisis ocurren en el consumidor.
El tope de 18.000 solo limita retención diagnóstica; el feed continúa durante
vueltas largas, con offsets absolutos y sin hueco causado por ese tope.

Los seis tests de `series_feed_tests.rs` prueban entrega durante vuelta,
parciales/cierre, saturación/desconexión, configuración única, hueco y cambio
de identidad; los goldens LapBlock v1 anteriores siguen obligatorios.
El [microplan](../../../../docs/superpowers/plans/2026-09-30-fase-4-series-grabacion-analisis.md)
registra la autorización DuckDB y los presupuestos físicos pendientes.

## Codec y análisis compartido — ISA-1429

`SeriesChunk::to_bytes/from_bytes` usa UTF-8 JSON con esta envoltura v1:

```text
["vantare.series-chunk.v1", index, lost_before, offset, LapBlock-v1]
```

La cabecera de LapBlock v1 se conserva; sus muestras son solo la porción del
chunk. Máximo 64 muestras y 32 KiB antes de parsear; offset absoluto con
sumas comprobadas, sin techo por duración/distancia de vuelta.
Se rechazan versiones/formas desconocidas, valores no finitos/negativos,
pedales fuera de 0–1, calidad inválida, secuencias repetidas/regresivas y
retrocesos de progreso Reliable. `Unavailable` exige null y no equivale a cero.
Las versiones futuras fallan cerradas: no se intenta un fallback.

`serde_json/float_roundtrip`, activado en el manifest runtime existente, es
necesario: el fixture LMU real perdía un ULP en distancia al decodificar con
el parser por defecto. No añade paquetes ni modifica Cargo.lock. El test
conserva igualdad exacta de chunk y resultado, sin relajar tolerancias.

`SeriesAnalysis::new(retention)` (1–256) y `consume(&chunk)` calculan
`series-summary.v1` en el consumidor, sin I/O, simulador ni muestras retenidas.
`active()`, `recent()` y `find_lap(LapId)` exponen resúmenes inmutables. Ante
contador reutilizado, `find_lap` devuelve el segmento más reciente; `first_chunk`
lo distingue de los anteriores. No usar solo (sesión, coche, lap) como clave
única de almacenamiento futuro. Conservar epoch e índice del feed.

Por velocidad/throttle/brake se cuentan Reliable/Estimated/Stale/Unavailable,
y min/max/media **aritmética de muestras Reliable**. Son estadísticas
derivadas, no ritmo representativo Go ni media ponderada por tiempo. No se
usan valores estimados/obsoletos en la media. El resumen conserva secuencias,
primer/último tiempo observado, seal y hueco. `continuous_span_s()` devuelve
la ventana continua observada; devuelve None con hueco. Nunca da duración
total, consumo, vuelta válida o cruce de meta interpolado.

Entrada corrupta/repetida falla antes de alterar el analizador. Índice u offset
omitido marca hueco y mantiene solo lo recibido. Cambio de identidad conserva
la vuelta abierta como incompleta, sin seal inventado. Retención agotada
expulsa solo el resumen más antiguo. No hay catálogo multisesión en disco.

Nueve tests en `analysis_tests.rs`: golden manual, calidad/cero, wire inválido
y topes, orden con estado intacto, retención/queries, huecos y paridad entre
live y bytes/replay. También fixture LMU productivo obligatorio de una muestra:
demuestra roundtrip exacto y no fabrica una vuelta completa. El replay de
cierre sigue siendo sintético explícito. La prueba física de presupuestos
requiere Isaac; no se declara la fase 4 completa por este test.

## Carga reproducible del feed volátil — ISA-1429

`series_load_tests.rs` entrega 36.000 observaciones sintéticas de 104 coches,
100 Hz lógicos y vueltas de 120 s, por Core. El receptor no lee hasta que el
productor termina: timeout de diagnóstico, sin sleeps. Comprueba progreso,
cola de dos chunks/128 muestras, pérdidas visibles y reanudación con hueco
en análisis. No ejecuta almacenamiento ni SHM/REST productivo.

```powershell
cargo test --offline --workspace -j 2 flows::series_load_tests -- --nocapture
```

Imprime tiempos debug con/sin feed, incluyendo generador; una pareja ruidosa
con otros workers no fija ratio ni presupuesto de CPU, memoria privada,
latencia o frame time. Evidencia cruda, hashes, gates y límites en el microplan.
DuckDB está autorizado y se implementa en el crate/proceso `native/storage`.

## Retención diagnóstica y vueltas largas

`MAX_LAP_SAMPLES = 18.000` limita únicamente las ventanas de `active/sealed`.
Al llenarse una ventana se publica el resto antes de reciclar su Vec, conservando
capacidad, sin mover muestras ni generar hueco en el feed. `active_offset()` y
`sealed_offset()` indican el prefijo omitido de esas ventanas diagnósticas;
no tratarlas como vueltas completas. Los chunks mantienen offsets absolutos.
Una vuelta de diez minutos a 100 Hz entrega exactamente 60.000 muestras y
seal, con codec y análisis continuos; prueba de regresión sintética explícita.
No hay techo temporal/de distancia de grabación. Desbordamiento de offset o
contadores de análisis falla cerrado; u32 de resumen admite ~497 días a 100 Hz.

## Proceso SQL y API de análisis durable

`SeriesWorker::start(exe, db, receiver)` consume en un hilo, sin esperar ready
desde adquisición. `analysis()` devuelve Arc de resúmenes del prefijo ACK,
latest-wins con arc-swap existente, hasta 256 resúmenes; watermark y resumen
se publican juntos. El consumidor no bloquea al escritor de esa foto. `failed()`
hace visible una caída. Store valida con el mismo SeriesAnalysis antes de SQL.
`finish(attempted, timeout)` devuelve estado y resumen final después del COMMIT
de cierre y salida del hijo. Primero parar observaciones y flush; mantener Core
vivo hasta finish. Drop/timeout cancela y une el hilo y termina el proceso propio.

`SeriesReader::open(exe, db)`, `page(after, limit)` (1–16), `state()` y
`analyze(retention)` (1–256) consultan por un proceso read-only. Son síncronas:
usar fuera de adquisición/renderizado. El algoritmo y codec compartidos dan
igualdad exacta live/durable/replay. La vuelta parcial y gaps no se completan.
`state.tail_lost()` distingue cola final perdida conocida de total desconocido
tras EOF/caída; finished es cierre de productor, nunca promesa de sesión íntegra.
El [crate storage](../../../storage/README.md) documenta protocolo y esquema.
No dependencia de DuckDB en runtime: solo transporte stdio, sin editar IPC.
