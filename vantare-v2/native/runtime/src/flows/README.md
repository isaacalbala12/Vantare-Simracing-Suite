# Flujos de eventos — ISA-1425 / ISA-1428 / ADR 0099 §2

Prueba de frontera interna del runtime; no hay transporte IPC, consumidor
Engineer ni flag CLI. `Core::new` deja recording desactivado.
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
en cada uno. Saturación marca `gap = true` y deja de añadir muestras. También
marcan hueco las fotos obsoletas, jugador/progreso ausentes y retrocesos de
distancia o tiempo. En un retroceso se espera al avance del contador para
evitar meter datos de la vuelta nueva en la anterior. Las señales ausentes o
estimadas de velocidad/pedales conservan su etiqueta y no frenan el muestreo.
Las series no escriben disco, tampoco con recording; almacenamiento, workers,
IPC y buffers de múltiples vueltas pertenecen a fases posteriores.

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
