# Almacenamiento de series — ISA-1429

Crate y proceso bajo demanda:
`vantare-storage <ruta.duckdb> [--read-only|--create|--resume]`.

- `--create`: solo nombre nuevo. Inicializa y confirma el esquema en un
  directorio hermano exclusivo `<nombre>.creating-<pid>-<contador>/`, hace
  CHECKPOINT, cierra la conexión y comprueba que no quede WAL. Sin conexión
  abierta, sincroniza el fichero y publica con `std::fs::hard_link`: creación
  atómica del nombre final que nunca reemplaza un destino existente, tampoco
  si otro creador gana después de comprobarlo. Tras publicar intenta retirar
  el alias temporal y su directorio; si falla esa limpieza, registra el error
  en stderr y sirve igualmente la DB publicada (`ready`). No copia ni renombra
  una DB/WAL viva. Las grabaciones exigen un volumen con enlaces duros
  (NTFS/ReFS con ese soporte); sin él, la creación falla cerrado. `--create`
  no crea el directorio padre: debe crearlo el dueño antes de invocar el helper.
- Si se pierde la carrera por un destino o WAL existente, intenta retirar
  únicamente su temporal propio antes de devolver el error. Ante otros fallos
  de publicación conserva los artefactos para diagnóstico, sin reparación.
  Una caída también conserva los artefactos. Antes de publicar solo existe el temporal;
  después ya existe una DB inicializada, aunque aún no se haya enviado ready.
  Un corte justo después de publicar puede dejar ambos nombres del mismo
  fichero cerrado: no abrir el temporal ni usarlo como otra grabación.
- `--resume`: exige un fichero existente y el prefijo válido del formato
  propio. No sustituye ni inicializa archivos ausentes/ajenos/incompletos.
- Sin modo se conserva el comportamiento histórico crear/reabrir; el Hub
  GPUI congelado y `--read-only` mantienen CLI y protocolo sin cambios.

Códigos de salida: **0**, éxito; **3**, `--create` rechazado por destino o WAL
ya existente (`AlreadyExists`), de modo que el dueño puede elegir otro nombre
sin interpretar texto; **1**, cualquier otro error, también en los otros modos.
La limpieza fallida después de publicar no convierte el éxito en salida 1.
El barrido de directorios `.creating-*` huérfanos pertenece a **G4a**; este
helper no lo implementa ni toca temporales de otros creadores.

La publicación resuelve la carrera entre creadores, no promete persistencia
del nombre ante pérdida eléctrica. Los temporales no son grabaciones del
catálogo. No reanudar automáticamente tras una caída ni borrar un temporal
que pueda pertenecer a otro proceso. El directorio de datos es local y de
confianza; no habilita importar DB externas ni protege frente a otro editor
deliberado que borre/sustituya archivos o sus WAL durante una apertura.

Ningún paquete vivo depende de storage/DuckDB. El workspace tiene 14
miembros y ocho default-members; storage se excluye del build por defecto para
no compilar DuckDB bundled. Compilarlo explícitamente con `--offline -j 4`
o mediante los gates `--workspace`. El test de aislamiento descubre todos los
miembros actuales y comprueba cada árbol salvo el propio storage.
El único binding nuevo autorizado es duckdb `=1.10505.0`, bundled, sin features
de extensiones. Las dependencias transitivas Arrow/TLS son propias del binding;
el proceso desactiva autoinstall/autoload, acceso externo y usa dos threads,
256 MB de límite DuckDB (no equivale a RSS máximo del proceso).

Una conexión y un bucle secuencial poseen SQL. DB nueva por grabación, versión
`vantare.series-db.v2`, tablas `series_meta`, `series_chunks`,
`session_summaries` y `lap_times`. Abre también v1 sin migrarla ni crear
las tablas nuevas. No interpreta,
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
  `["summaries", "series-summary.v1", total_segmentos, resúmenes, perdidos]`;
  `perdidos` suma los `lost_before` de los bloques guardados (descartes por
  cola llena en medio; la cola final es `attempted − watermark`, #2883).
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
contenido distinto, orden/progreso inválido o entrada corrupta de chunks falla sin ACK.
Los eventos de metadatos inválidos tienen el rechazo no fatal descrito debajo.
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
Receiver en un worker y flush al parar. El Hub ya descubre grabaciones
nativas y lanza el lector read-only en segundo plano. El supervisor todavía
no conecta el escritor de series: pendiente en [#1975](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1975),
sin implementación ni decisión sobre DuckDB en este paso.

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

G3 conecta el Core mediante `--series-dir <DIR>`, con helper junto a su
ejecutable y `SeriesWorker::start_new` (`--create`). La creación y los
reintentos ocurren fuera de adquisición; ninguna DB se reanuda automáticamente.
Tras colisión se elige otro nombre opaco. EOF de stdin termina el helper y
cierra la conexión, incluso si el Core desaparece sin ejecutar Drop.


## Dónde viven las grabaciones — ADR 0111

Este helper no elige carpeta: abre la ruta que le dan. Quien la decide es la
sesión ([ADR 0111](../../docs/adr/0111-grabaciones-carpeta-unica-por-instalacion.md)):
instalado, `<raíz de instalación>/recordings`, la misma para todas las
generaciones; en desarrollo, `recordings` dentro de los datos del Hub. El núcleo
crea ahí una base nueva por arranque y es el único que escribe y poda; el
anfitrión del Hub solo lee.

Consecuencias para el formato:

- **Las grabaciones son datos que solo se añaden.** Como la carpeta ya no
  cambia con cada versión, un programa antiguo (tras una vuelta atrás) puede
  encontrarse archivos de un formato más nuevo. Los marca como `incompatible`
  y no los abre ni los modifica. Sí puede borrarlos **por cupo**: la poda del
  núcleo no mira el contenido, y un núcleo antiguo retira las más viejas al
  superar 200 grabaciones o 5 GiB, sean del formato que sean.
- Un cambio de formato tiene que poder leerse con el helper nuevo sin
  reescribir los archivos viejos, como ya ocurre con v1 y v2.
- Una grabación con su `.wal` al lado no se mueve entre carpetas: la pareja se
  queda junta donde está (ver «Adoptar grabaciones» en
  [installer/README.md](../installer/README.md)).

## Metadatos de sesión y vueltas — D8a-1 / #1974

Las DB nuevas (`--create` y creación histórica sin modo) usan v2. Las DB v1
siguen sirviendo `append`, `page`, `summaries`, `plot-page`, `finish` y `--resume`
sin cambios. Los comandos nuevos sobre v1 responden `["unsupported","meta"]`
y el proceso sigue vivo: no disponer de tablas de resumen no implica corrupción.
El codec de muestras `vantare.player-lap.v1` no cambia. D8a-2 conecta estos
eventos desde el Core. Un helper antiguo que solo conoce DB v1 rechaza una
DB v2 como `incompatible`; la compatibilidad de lectura es del helper nuevo.

`session_summaries` tiene clave `(epoch, session)` y columnas `kind`,
`kind_text`, `track_name`, `vehicle`, `class_name`, `started_at_ms`,
`ended_at_ms`, `sim_elapsed_s`, `final_position`, `final_class_position`,
`laps_completed`, `best_lap_ms`, `end_reason`, `sealed`.
`lap_times` tiene clave `(epoch, session, car, lap)`, `official_ms` y
`sector_ms` (JSON de enteros en milisegundos, o NULL). Época, sesión y relojes
son u64; coche, vuelta, posiciones y tiempos en ms son u32.

Los objetos de evento son cerrados: todos los campos indicados son obligatorios;
los campos opcionales se envían como `null`. Los textos admiten hasta 256 bytes
UTF-8; `sectorMs` admite null o un array de hasta 16 enteros u32 (JSON de hasta
177 bytes). `simElapsedS` admite null o un número finito no negativo.

- `["session-open", {epoch, session, kind, kindText, trackName, vehicle, className, startedAtMs}]`
  responde `["ack-session","open",epoch,session]`.
  `kind`: `practice|qualifying|race|other|unknown`; `kindText` conserva el texto
  adicional del simulador (puede ser vacío). Repetir exactamente la identidad
  es idempotente, incluso sellada; cambiarla devuelve `["rejected","conflict"]`.
- `["lap", {epoch, session, car, lap, officialMs, sectorMs}]` responde
  `["ack-lap",epoch,session,car,lap]`. Requiere sesión existente; repetir una
  vuelta idéntica es idempotente. Cambiarla devuelve `["rejected","conflict"]`.
  Con la sesión sellada solo se admite repetir una vuelta ya existente idéntica;
  cualquier otra escritura devuelve `["rejected","sealed"]`.
- `["session-close", {epoch, session, endedAtMs, simElapsedS, finalPosition, finalClassPosition, lapsCompleted, bestLapMs, endReason}]`
  responde `["ack-session","close",epoch,session]` tras sellar una sola vez.
  `endReason`: `sessionChanged|coreStopped`. Repetir el mismo cierre es seguro;
  modificar un cierre ya sellado devuelve `["rejected","sealed"]`. No se valida
  semánticamente que `endedAtMs >= startedAtMs` (el reloj de pared puede cambiar).
- Vuelta/cierre sin sesión devuelve `["rejected","missing"]`. Un objeto mal
  formado o fuera de los límites anteriores devuelve `["rejected","invalid"]`,
  sin tocar la DB ni detener el proceso; un evento válido posterior funciona.
  Estos rechazos no son ACK. Los errores reales de SQL, COMMIT o I/O terminan
  el proceso sin ACK. El límite de transporte (32 KiB+128 por línea) sigue siendo
  estricto: frame truncado, sobredimensionado o JSON ilegible termina la conexión.

Cada evento se valida antes de escribir y usa una transacción que incluye la
comparación con lo guardado. Se confirma el COMMIT antes del ACK. Si el helper
muere tras el COMMIT y antes del ACK, repetir el mismo evento al reabrir es seguro.
Una caída antes del cierre deja `sealed=false`, con identidad y vueltas ya
confirmadas; no se inventa un cierre al abrir. `finished` sigue describiendo
el productor de chunks y es independiente del sellado de cada sesión.

Lecturas disponibles tanto en read-only como al reanudar:

- `["session-summaries"]` → `["session-summaries","series-session.v1",total,filas]`.
  Devuelve hasta 256 sesiones por `(epoch,session)` descendente; `total` hace
  visible la retención. Cada fila usa nombres camelCase del evento, campos de
  apertura/cierre y `sealed`; la ausencia se conserva como null.
- `["lap-times",epoch,session,after,limit]` →
  `["lap-times","series-laps.v1",total,filas]`. `after=null` empieza por la
  primera vuelta; luego se usa `[car,lap]` de la última fila recibida. El cursor
  es exclusivo, en orden `(car,lap)` ascendente, y `limit` está entre 1 y 256.
  `total` cuenta todas las vueltas de esa sesión, no solo las posteriores al
  cursor. Cada fila contiene `epoch`, `session`, `car`, `lap`, `officialMs`,
  `sectorMs`. Una página vacía indica que no hay más filas. Así se pueden leer
  sesiones de más de 256 vueltas sin duplicados ni truncamiento.
- La forma corta `["lap-times",epoch,session]` equivale a `after=null, limit=256`;
  para obtener todas las vueltas hay que continuar con el cursor explícito.

Las versiones de respuesta `series-session.v1` / `series-laps.v1` son
independientes del formato DB v2 y del codec de muestras v1. El lector debe
validarlas. No se admite SQL, filtros o nombres de columna arbitrarios. Las
lecturas mal formadas, incluidos parámetros inválidos de `lap-times`, son
fatales sin ACK; `rejected invalid` corresponde a los eventos de escritura.

**Tiempo oficial pendiente de verificar con LMU real.** Los tests con fixtures,
helper real y kill/WAL no demuestran que los tiempos coincidan con el cronómetro
del juego. La posición guardada al cerrar tampoco acredita el resultado oficial.


## Pérdida de eventos

El Core usa una cola de 64 eventos de sesión y solo `try_send`: un helper lento
no bloquea las fotos. Los descartes por cola llena/desconectada tienen contador
y un único aviso en stderr. El pump posee el pipe y envía cada comando seguido
de su ACK, junto a los chunks; `rejected` se registra una vez y permite continuar.
`unsupported meta` desactiva los eventos para esa DB v1 y conserva los chunks.

El Core envía las vueltas ANTES del cierre. Al parar, emite `coreStopped` antes
de `worker.finish`; el pump drena la cola de eventos antes de confirmar finish.
El plazo total de cierre sigue siendo 1 s. Los eventos descartados por `try_send`
o por ese plazo pueden verse como sesión SIN SELLAR o sin vueltas; si se pierde
la apertura puede faltar el resumen. Ni `finished` ni `sealed` acreditan ausencia
de pérdidas. Una caída conserva solo los eventos cuyo COMMIT llegó al disco.

El tiempo oficial viene de best_lap_s/last_lap_s del juego y está PENDIENTE DE
VERIFICAR con LMU real (medición en el PC de juego con Isaac).


### Limitaciones de captura y medición pendiente con LMU real

- Un last_lap_s IDÉNTICO al de la vuelta anterior no se reconoce como nuevo:
  la vuelta espera 3 s del reloj de origen y sale con `officialMs:null`.
- Si last_lap_s cambia en una foto ANTERIOR a la que sube laps, ese valor ya
  es la línea base cuando se detecta la vuelta. Si no llega otro valor distinto,
  espera los mismos 3 s y sale con null. El orden de refresco de LMU no está
  verificado; véase `delayed_lap_counter` en el [README de flows](../runtime/src/flows/README.md).
- Tipo de sesión, circuito, coche y clase se fijan en el primer fotograma con
  jugador y su coche; no se refinan después, aunque fueran unknown o vacíos.
  El helper rechaza otro open con datos distintos para la misma clave con
  `rejected conflict`. Si el jugador cambia de coche dentro de una sesión,
  el resumen describe el primer coche; los resultados de cierre usan el último.
- Si laps baja y vuelve a subir en la misma sesión/coche, se reutiliza la clave
  `(epoch,session,car,lap)`. Un valor distinto recibe `rejected conflict`,
  conserva el primer valor y provoca un único aviso de rechazo en stderr del
  pump. Un valor idéntico sigue siendo idempotente. Un salto del contador solo
  registra la última vuelta observada; no reconstruye las intermedias.
- `session_events_dropped` NO se expone en `recording-status.json`. La pérdida
  se avisa en stderr y puede dejar una sesión sin sellar o sin vueltas; ese
  archivo de estado no ofrece el contador ni garantiza cobertura completa.

Estas limitaciones se deben contrastar al medir con LMU real en el PC de juego
con Isaac: el tiempo oficial (best_lap_s/last_lap_s del juego) sigue PENDIENTE DE
VERIFICAR. Los fixtures fijan el comportamiento actual, no el orden de refresco
ni la correspondencia física con el cronómetro del juego.
