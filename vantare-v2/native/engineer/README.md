# Engineer nativo — ISA-1428

Proceso bajo demanda: solo foto y eventos neutrales, sin UI, lectura del juego,
red ni síntesis TTS. Reutiliza `runtime::flows` para cursor, ACK y codec y
`runtime::shutdown` para Ctrl+C/EOF; no invoca Core ni los adaptadores privados.
Microplan: `docs/superpowers/plans/2026-09-30-fase-3-eventos-engineer.md`.

## Ejecución de producto

`vantare-engineer --pipe --cursor R [--pipe-name N] [--locale es|en|it|pt-BR] [--clips CARPETA] [--settings RUTA]`
consume foto DTO v6 y journal por `<pipe-de-fotos>-events`. Windows, ACL de usuario,
PID/imagen del transporte y filtro del consumidor a `vantare-core.exe` hermano
del binario. Reconecta sin inventar fotos. La revisión congelada durante 500 ms
retira avisos y para clips; una reentrega no rejuvenece la foto. Ctrl+C o EOF
en stdin termina y cancela el lector del pipe. El launcher mantiene stdin abierto
y lo cierra al parar; `vantare --engineer R` habilita este tercer hijo, con el
mismo Job Object, backoff y presupuesto de reinicios que overlays. Orden de
cierre: Engineer, overlays, núcleo. Sin esa opción no nace Engineer. El tercer
grupo `--` lleva sus argumentos; el launcher comparte automáticamente nombre
del pipe e imágenes de binarios (`--core-image` / `--engineer-image`).

stdout: JSONL `vantare.radio.v1` con intent, prioridad, texto localizado,
epoch/sequence, session/car y TTL; `vantare.radio.status.v1` con degradaciones
y `clear:true` (retirar presentación, **no** anunciar pista despejada). El estado
inicial declara conexión pendiente y Spotter esperando evidencia espacial.
Boxes y vueltas completadas exigen hechos del journal de la revisión actual;
fuel/flags usan estado fiable actual. SourceState distinto de Live retira voz.
No aceptar el pipe latest-wins como sustituto del journal.

### Señales de segunda ronda — #1428 / #1427

Spotter usa pose, estado de boxes y velocidad escalar del jugador `Reliable`,
con fuente `Live`. Los vectores del jugador y rivales pueden ser `Reliable`
(nativos) o `Estimated` actuales admitidos por el adaptador; `Stale`, ausentes
o no finitos no autorizan avisos. La calidad de las otras señales no se relaja.
Mínimo 10 m/s (también en el vector horizontal); el filtro Go exige diferencia
estrictamente menor de 12 m/s en cada componente del mundo al entrar al solape.
La geometría conserva la histéresis de 5 m para un lado ya comunicado. El ACK
de presentación deduplica una condición estable; la cola existente revalida
la ocupación/calidad antes de reproducir. Época, sujeto, fuente y baseline
reinician el estado. Falta de evidencia retira presentación con `clear:true`;
no se añade un anuncio audible de pista despejada. El ajuste global `enabled`
controla también Spotter; no se cambia el contrato de preferencias del Hub.

LMU aporta vector nativo por coche. ACC deriva un vector `Estimated` de poses
originales con reloj de vuelta por coche, filtro y cortes de continuidad:
véanse los [límites, latencia y error esperados](../runtime/src/adapter/acc/REVIEW.md).
Spotter puede anunciar en ACC después del calentamiento de ambas series,
si jugador y rivales están fuera de boxes y las otras señales son fiables.
Sin clips no hay audio: los tests solo verifican radio visual.
No se declara paridad completa con el Spotter Go (debounce/avisos clear),
validación acústica, ni presupuesto de CPU/latencia/frame time.

### Señales de tercera ronda — #1428 (2026-09-30)

DTO v6 añade `Car.estimated_lap_s`, `Player.pit_limiter_active` y
`Player.pit_stop_stopped`, con ida/vuelta de las cuatro calidades y campos
obligatorios. Las capacidades de familia ya existentes siguen vigentes;
la presencia/frescura de cada nueva señal la determina su `Quality`.
`degrade` y `sanitize` desestructuran todos los campos sin `..`.

LMU: limitador telemetry +604 con disponibilidad +656 y reloj +12, stopped
scoring +457, vuelta estimada scoring +472. Sectores de la última vuelta por
coche desde +152/+160/+168, convirtiendo acumulados en duraciones individuales
solo si son coherentes. Fixtures legacy con bytes borrados no acreditan un
limitador apagado ni parada inexistente. ACC: limitador physics @248,
vuelta estimada graphics @1396; los sectores de rivales/jugador ya disponibles
se conservan desde Broadcasting. Las estimaciones son `Estimated`, nunca
pruebas fiables de un tiempo medido. Detalle de SDK, offsets, ausencia y
frescura en `runtime/src/adapter/{lmu,acc}/REVIEW.md`.

Radio nueva: `pitstops.engage_limiter` con jugador en boxes, limitador apagado
y velocidad >5 m/s; `pitstops.disengage_limiter` fuera de boxes, limitador
encendido, sector cero y velocidad >5 m/s. Todas las señales necesarias deben
ser `Reliable`, con fuente `Live`; stopped fiable también retira el aviso.
La cola existente revalida al presentar y
retira al perder calidad o cambiar sujeto/época; ACK deduplica la condición
estable y los avisos comparten 30 s de cadencia desde creación del último
mensaje presentado. Respeta `families.pitstops` y `enabled`; TTL 10 s.
Son recordatorios de condición actual, también tras baseline, **no hechos de
entrada/salida/servicio deducidos entre fotos**. Entrada/salida sigue requiriendo
el journal productivo, con revisión/sujeto actuales.

Los dos textos nuevos se resuelven en la caché de voz por su hash como el
resto. Su ausencia se declara `voice:missing`; no se genera ni sustituye audio.
No se amplía el contrato de packs existentes ni se declara prueba acústica.

Pendientes razonados del microplan:

- Servicio iniciado/terminado y duración de la parada: `mPitState=3` demuestra
  stopped, no qué operaciones se hicieron ni su finalización. ACC `isInPit`,
  `mandatoryPitDone` e `isInPitLane` tienen otra semántica. El inventario REST
  de 2026-09-30 contiene menú/carga, PitMenu HTTP 500 y reparación 404: no hay
  evidencia de servicio utilizable. No anunciar servicio cumplido.
- Tiempo en boxes: no hay temporizador nativo admitido. Una futura derivación
  necesita continuidad y reloj común en el núcleo/journal; no acumular el
  tiempo entre fotos coalescidas del consumidor.
- LMU requested/entering/exiting: el SDK los enumera, pero este corte solo
  necesita stopped. No añade un enum duplicado de fase ni interpreta ninguno
  como servicio cumplido; captura física positiva pendiente.
- Timings de radio/consultas: ahora viajan la estimación y los sectores que
  las fuentes pueden aportar. Faltan contrato de consulta/race-limit/reloj,
  hechos canónicos para historia y pruebas de vueltas físicas. ACC graphics
  aporta solo el último sector cruzado; sin splits UDP válidos no fabrica la
  última vuelta completa. No se activa una familia de timings por estos campos.
- Avisos de velocidad máxima de boxes, distancia al box, ventana/estrategia,
  conteo de servicios y swaps: faltan límite nativo, geometría o contratos
  correspondientes; velocidad + in_pits no bastan.
- Sanciones: contador con calidad ya presente; no se infiere tipo, causa,
  plazo ni servicio cumplido y no se añade aquí su familia de avisos.

Migración mecánica de fixtures y `src/*/scenes/*.json`: 247 snapshots en
27 archivos; versión 6 y nuevas señales `Unavailable`. Verificación estructural
conserva cada valor anterior, incluidas preferencias y secuencias; renderer y
ViewModels no se modifican. No se declara nueva campaña de capturas de píxeles.

Notion no disponible: excepción expresa del encargo del 2026-09-30. Evidencia
local para revisión de Opus; sin actualización Notion, push, PR ni integración.

## Consumo y recuperación

`vantare-engineer --stream --cursor <checkpoint>` usa stdin/stdout heredados:
HELLO con cursor, frame individual, checkpoint y ACK. Es **el banco IPC**, no
el named pipe de eventos de ADR 0099. En este modo stdout es solo HELLO/ACK;
radio JSONL y diagnóstico salen por stderr. EOF termina con código 0; error de codec, checkpoint
o continuidad termina con 1. El consumidor nuevo recibe foto y base actuales.
Los siguientes recuperan desde cursor, uno por ACK. El servidor solo reconoce
el cursor pendiente: no aceptar un ACK superior a ciegas. Reconexión conserva
el checkpoint. Reentregas no retroceden ni duplican el hecho; saltos requieren gap.

Ante hueco se reconstruye desde foto sin emitir una transición entre fotos.
Un evento histórico durable puede preceder la época de la foto actual: se
consume sin tratar esa foto como reconstrucción histórica. Nunca se deducen
boxes de snapshots IPC. Checkpoint `[epoch,index]`, lectura máxima 128 bytes,
sin fallback ante corrupción. Temporal exclusivo + fsync + rename antes de
ACK; error de escritura no adelanta cursor. No se promete exactamente un audio
ante muerte entre checkpoint y salida, ni durabilidad del rename ante corte
eléctrico. Un solo dueño del checkpoint: no compartir R entre instancias.

## Contrato para IPC

`flows/wire.rs`: u32 LE + JSON UTF-8, máximo 1 MiB. Longitud excesiva se rechaza
antes de reservar cuerpo. Esquemas cerrados:

```text
["vantare.events.hello.v1", cursor | null]
["vantare.events.v1", foto_DTO_JSON_en_string, tail, durable | null, recording, entrega | null]
["vantare.events.ack.v1", cursor]
cursor = [epoch, index]
recording = [0] | [1] | [2, "storage_full" | "permission_denied" | "not_found" | "invalid_data" | "other"]
evento = [0, cursor, sequence, session_id, car_id, was_in_pits, in_pits]
hueco = [1, reason, resume_at]
hecho = [2, registro_JSONL_v3]
reason = 0 CoreRestart | 1 Retention | 2 InvalidCursor | 3 RecordingDisabled
```

Foto y tail comparten época; eventos no superan el corte. Foto usa el DTO
existente de `ipc`, no ABI Rust. Codec valida forma, versión, cursores y tamaños;
**no aporta ACL, identidad de par ni plazos**. `flows/host.rs` utiliza los mismos
primitivos Win32 de IPC (sin otro backend), autentica imagen cliente y tiene
un dueño I/O separado. Adquisición transfiere solo ArcSwap con foto y ring 256;
el dueño replica los mismos IDs y hace append/fsync. Hasta 8 consumidores,
8 peticiones y una entrega sin ACK por consumidor. ACK adelantado cierra el
pipe; I/O tiene plazo 5 s y cancelación. Overflow del ring declara Retention;
fallo de persistencia degrada recording sin parar fotos. `Frame::capture`
puede leer disco: NO llamarlo en adquisición. Lectura histórica escanea JSONL:
no se acredita rendimiento para historiales largos sin medición.
El plazo es de pipe/peticiones: fsync del archivo no es cancelable; el watchdog
del núcleo y el plazo del launcher acotan un proceso bloqueado en disco.

`vantare-core --live --recording R.jsonl` activa grabación antes de adquisición;
sin opción no abre archivo. `EventHost::set_recording` permite on/off fuera del
hilo de adquisición; no hay todavía un control Hub para llamarlo. Restaurar
núcleo requiere época creciente y recupera el prefijo durable; todo tramo perdido
se declara mediante hueco. Cada observación fiable consecutiva puede emitir
boxes/vuelta del jugador, flags con ámbito, sesión, estado de sesión/fuente.
Primera foto, datos ausentes/estimados, saltos de vueltas o recuperación de
fuente obsoleta no inventan transiciones.

## Radio y voz

Una cola de 8 pendientes, coalescida por intent/sujeto, FIFO entre prioridades
iguales y TTL. Solo Safety puede interrumpir otra prioridad. TTL caducado,
cambio de identidad, hueco, pérdida de calidad o foto congelada retiran el
aviso; no generan un hecho contrario. Condiciones estables de fuel/flags no
repiten tras ACK visual. Boxes exige evento nuevo del jugador y foto fiable
de esa misma revisión: eventos históricos se recuperan sin hablarlos tarde.
Fuel: 1 l, 2 l, medio depósito con nivel/capacidad fiables; flags: yellow/blue
fiables de sesión o jugador. No hay aviso por sector ni autonomía estimada.

`spotter::classify_position` conserva los límites longitudinales/laterales Go
en los ejes neutrales ahead/right, con histéresis. El filtro de cierre consume
vectores nativos o estimados actuales; no deriva desde fotos del consumidor.
Penalties/timings/pitstop completo también requieren señales/contratos
comunes pendientes en el microplan. No es paridad de todas las familias Go.

Voz opt-in mediante la caché Kokoro ya generada por el producto Go. Por
defecto se lee `%APPDATA%/Vantare/Ingeniero/tts-cache/kokoro`; `--clips CARPETA`
cambia esa raíz y activa voz en los ajustes iniciales. Con ajustes locales,
`voice:true` activa la raíz por defecto sin necesitar `--clips`. Una carpeta
ausente no impide consumir eventos: conserva texto y publica `voice:missing`.
No se crea ni modifica la caché, no hay red, descarga ni síntesis.

La clave es SHA-256 de `locale + NUL + voz + NUL + texto` en UTF-8, hexadecimal
minúscula: la misma `tts.Cache.Key` del Go. Las voces son las canónicas de
`internal/engineer/audio/config.go`: es/ef_dora, en/af_bella, it/if_sara y
pt-BR/pf_dora. Los nueve textos compartidos coinciden con
`internal/engineer/presentation/presentation.go`, incluida «Volta concluída».
No se buscan otras voces, idiomas, sinónimos ni claves de intent como texto.
Flags conserva su catálogo nativo: esas dos frases no existen en el catálogo
canónico Go y su ausencia de clip se declara, sin sustituir el mensaje.

Se busca `<hash>.wav`, luego `<hash>.mp3`. Se conserva en último lugar el
pack nativo previo `<locale>/<intent>.wav`. Si un candidato existe pero es
irregular, corrupto o inaccesible, se informa el error sin probar otro medio.
Ruta canonical dentro de la raíz, archivo regular, máximo 4 MiB y 8 s.
WAV conserva la validación RIFF PCM16 mono/estéreo de 16–48 kHz y cabecera
canónica de 44 bytes; no se normaliza ni convierte ningún archivo.
WAV usa `PlaySoundW` asíncrono con `SND_NODEFAULT`; MP3 usa
`mciSendStringW` (open/set/status/play/stop/close), alias exclusivo por clip
y cierre RAII también ante errores. Windows mide su duración sin reproducir
durante la inspección. SHA-256 usa `BCryptHash` de CNG (Windows 10+).
Sin dependencias nuevas; solo features de `windows-sys` ya fijado.
Unsafe queda en `voice/win.rs`, con comentarios SAFETY.

La misma cola/TTL controla ambas APIs: preempción, hueco, cambio de identidad,
ajustes, pérdida de calidad, foto congelada y cierre paran el medio. La espera
de apertura/inspección no recorta la duración del audio recién iniciado; TTL
sigue acotándolo. `voice` es `disabled`, `missing`, `failed` o `started`;
este último acredita que Windows aceptó el inicio, no escucha humana.
Aviso visual permanece ante ausencia/error de clip. Duración más tick de 50 ms,
sin promesa de plazo acústico estricto bajo I/O bloqueado. Lectura local en
Engineer, nunca en adquisición. Sin wake/PTT/STT ni ajuste de dispositivo.
No se promete exactamente una entrega acústica tras una caída.

Banco explícito desde `native/`, sin tocar ajustes, cursor ni caché:

```powershell
cargo run -p vantare-engineer --offline -j 2 --example voice-cache -- coverage
cargo run -p vantare-engineer --offline -j 2 --example voice-cache -- play es fuel.low_1l
cargo run -p vantare-engineer --offline -j 2 --example voice-cache -- play it fuel.low_half_tank
cargo run -p vantare-engineer --offline -j 2 --example voice-cache -- play pt-BR laps.completed
cargo run -p vantare-engineer --offline -j 2 --example voice-cache -- preempt es fuel.low_1l
# Para otra raíz, añadir CARPETA al final de coverage o play.
```

`coverage` inspecciona las 11 frases por cada locale sin reproducir: devuelve
texto, voz, disponible/ausente/fallido, nombre hash y duración del clip válido.
`play` reproduce solo la selección explícita y registra duración y tiempo
total (incluye I/O y cierre); no habilita Spotter en la radio productiva.
`preempt` inicia el seleccionado, lo sustituye por `pitstops.exit` después de
100 ms y verifica parada explícita e idempotente del reemplazo.

## Control local desde Hub — ISA-1428 / ISA-1430

El Hub escribe `%LOCALAPPDATA%/Vantare/native/engineer.json`; Engineer lo
sondea cada turno (espera de hasta 50 ms, sin promesa bajo I/O bloqueado) y
confirma sus ajustes efectivos en `engineer-status.json` del mismo directorio.
Un archivo de ajustes ausente inicialmente usa `--locale` y voz opt-in por `--clips`;
cuando existe, el documento manda. JSON inválido o retirado conserva los
últimos ajustes válidos y publica error. El siguiente JSON válido recupera
sin reiniciar. El banco `--stream` solo usa estos archivos con `--settings`.

Contrato cerrado v1, máximo 64 KiB, sin migración del producto Go:

```json
{
  "version": 1,
  "enabled": true,
  "locale": "es",
  "voice": false,
  "families": {"fuel": true, "flags": true, "pitstops": true, "laps": true}
}
```

Solo `es`, `en`, `it`, `pt-BR`; `voice` activa la caché por defecto o
la raíz de `--clips`; no selecciona otra voz ni descarga assets.
Sin carpeta/clip válido conserva texto
y declara `missing`. No hay control de volumen propio (se usa Windows),
Spotter audible/on-off, penalties o timings; Hub muestra su indisponibilidad.
`flags` es una familia nativa, no una afirmación de paridad de las familias Go.
`enabled=false` silencia radio pero continúa consumiendo/checkpointando hechos;
no arranca ni mata el proceso. Cada cambio retira cola/voz/presentación previas.

Ambos lados compilan el mismo `engineer/src/control.rs` (`#[path]` en Hub):
contrato JSON e I/O sin dependencia Hub → Engineer/runtime ni dependencia
nueva. Guardado: lock del SO, bytes observados, temporal exclusivo, fsync y
rename sin borrar destino. Conflicto conserva disco/memoria; Hub permite
recargar explícitamente. No hay garantía CAS ante un editor externo que
ignore el lock ni durabilidad del rename ante corte eléctrico; no usar el
directorio compartido para dos Engineer simultáneos.

Estado: versión, PID, proceso activo, ajustes confirmados, presencia de pack
completo y clips WAV/MP3 válidos por locale, último mensaje con época/revisión y error. Solo
se reemplaza cuando cambia su contenido; assets se inspeccionan cada segundo
por mtime/tamaño y solo se releen cuando cambia esa firma. El último mensaje
es histórico, no una presentación con TTL ni prueba acústica. Cierre ordenado
publica `active=false`; muerte abrupta puede dejar un informe antiguo. Hub
sondea cada 250 ms y conserva el último estado válido ante JSON inválido.

Verificación aislada desde `native/`, sin escribir los ajustes de producto:

```powershell
target/debug/vantare-hub.exe --engineer --engineer-settings C:/tmp/engineer-check/engineer.json --layout C:/tmp/engineer-check/layout.json --data-dir C:/tmp/engineer-check/hub --pipe vantare-engineer-check
target/debug/vantare-engineer.exe --pipe --pipe-name vantare-engineer-check --cursor C:/tmp/engineer-check/cursor.json --settings C:/tmp/engineer-check/engineer.json
```

Mantener stdin abierto; cambiar locale/familias, comprobar ajustes confirmados,
introducir JSON roto y recuperar, probar dos Hub y recargar tras conflicto,
cerrar Engineer con EOF y comprobar inactivo. La radio requiere el Core
hermano/launcher; sin él el estado declara fuente ausente. `tests/lifecycle.rs`
comprueba cambios en caliente y radio inglesa sobre named pipe y proceso
reales con observaciones sintéticas explícitas, JSON roto, apagado de radio
sin perder hechos y publicación de cierre. Los tests de contrato y Hub
cubren roundtrip, conflictos, lock y recuperación de escritura parcial.
Sin prueba física LMU/OBS, escucha ni aceptación visual del orquestador.

## Gates y evidencia

Miembro del workspace `native/`: edición/lints comunes y un único Cargo.lock.
Desde `native/` (los gates incluyen Engineer):

```powershell
cargo fmt --check
cargo clippy --workspace --all-targets --offline -j 2 -- -D warnings
cargo test --workspace --offline -j 2
```

Para Engineer aislado: añadir `-p vantare-engineer` a clippy/test. `tests/recovery.rs` usa
observaciones **sintéticas explícitas**, procesos y checkpoints reales: reinicio,
dedup, todos los confirmados, hueco volátil, retención, escritura fallida,
corrupción y EOF con plazo. `tests/radio.rs` verifica las reglas, TTL, cola,
calidad, fotos congeladas, locales y WAV sin reproducir. `tests/voice_cache.rs` verifica SHA-256 contra
vectores congelados obtenidos invocando el Go, paridad de catálogo/voz,
resolución exacta y solo lectura, ausencia, medios corruptos/irregulares y cobertura. `tests/lifecycle.rs`
ejercita EOF sin Core y rechazo de publicador con imagen distinta mediante
named pipe real (datos sintéticos); no sustituye prueba con Core empaquetado.
No demuestra LMU/OBS, acústica ni rendimiento.
Notion pendiente de restablecer acceso; no hay push, PR o merge.

Verificación de este diff, 2026-09-30, con los comandos anteriores:

- `cargo fmt --check`: código 0, sin salida.
- Clippy workspace/all-targets con `-D warnings`: código 0,
  `Finished dev profile` en 11,44 s.
- Tests workspace: código 0, **634 pasados, 0 fallidos, 4 ignorados**:
  623 del harness estándar y 11 del banco de ciclo de vida del launcher.
  Engineer aporta 25 tests. Los ignorados requieren LMU (3) o ACC (1) en marcha;
  no se ejecutaron ni sustituyen evidencia física de este worker.
- `go test ./internal/tts -run TestCache_NewAndKeyDeterminism -count=1`:
  `ok`, 0,113 s; Go solo se consultó, sin modificarlo.

Antes de ese resultado hubo bloqueos por memoria: paginación insuficiente al
compilar DuckDB y `LNK1102` al enlazar Storage. El gate final usa el perfil y
linker originales, sin modificar configuración, cachés compartidas ni tests.
Otro intento falló en el test ajeno
`ipc::latest::tests::put_wakes_a_waiting_reader_and_close_releases_it`:
el cierre puede adelantarse al lector durante sus dos esperas de 20 ms, sin
sincronización de recepción. Pasó aislado y en la repetición global final;
queda documentado para el orquestador, sin editar IPC ni ocultar el fallo previo.

## Evidencia de caché y voz — worker de #1428, 2026-09-30

Rama `vantareapp/isa-1428-w-voz-engineer`, entrada limpia en
`e8b0927a3e8f63b8e89d2043b18c57ac1753c0fd`. Issue
[#1428](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1428),
proyecto Rust nativo, fase 3. Notion no disponible; Isaac autoriza explícitamente
trabajar solo con GitHub en este encargo. No se declara seguimiento Notion
completado; el orquestador actualizará el handoff común al revisar el diff.
Se conserva la base de integración asignada, sin rebase ni cambios ajenos.
`origin/nightly` leído tras fetch: `f29b5fee04022756f9ae59f19bf153f91eebe4ed`;
merge-base con la rama asignada: `5838de5a4abee3e99d9d50aebd5dc20609c53611`.

Caché real: **807 archivos, 779 MP3 y 28 WAV**. Informe reproducible por
`voice-cache coverage`, congelado en
[`coverage-2026-09-30.json`](coverage-2026-09-30.json) sin versionar clips.

| Locale | Voz Go | Catálogo con clip válido | Frases habilitadas con clip |
| --- | --- | --- | --- |
| es | ef_dora | 9/11 | 6/8 |
| en | af_bella | 9/11 | 6/8 |
| it | if_sara | 9/11 | 6/8 |
| pt-BR | pf_dora | 9/11 | 6/8 |

Disponibles: `pitstops.entry`, `pitstops.exit`, `laps.completed`,
`fuel.low_1l`, `fuel.low_2l`, `fuel.low_half_tank`, `spotter.car_left`,
`spotter.car_right`, `spotter.three_wide`. Ausentes en los cuatro locales:
`flags.yellow` y `flags.blue` (texto/aviso sin voz). Sin clips inválidos en
estas 44 resoluciones. Las tres frases Spotter tienen WAV, pero siguen sin
emitirse: faltan las señales que ya declaraba el Engineer, fuera de este encargo.
`Status.assets` conserva su significado de pack completo, por eso es false
mientras falten flags; no impide reproducir una frase que sí tenga clip.

La prueba explícita usa los clips reales directamente en su sitio y las mismas
funciones `Voice::play/tick/stop` del worker. Duraciones del medio:

| Selección | Medio | Duración | Operación completa |
| --- | --- | --- | --- |
| es / fuel.low_1l / ef_dora | MP3 | 948 ms | 2151 ms |
| it / fuel.low_half_tank / if_sara | MP3 | 1695 ms | 2426 ms |
| pt-BR / laps.completed / pf_dora | MP3 | 1233 ms | 1554 ms |
| en / spotter.car_left / af_bella | WAV | 874 ms | 929 ms |

Prueba sobre el binario final `voice-cache.exe`, SHA-256
`15067eb7ba097af660ed3ce19292561abdd9e86335e9696d8e1ff9468664fbcc`.
Windows aceptó inicio y parada (`started_and_stopped`) de los cuatro clips.
La operación completa incluye apertura/inspección, reproducción y cierre;
se ejecutó mientras había compilaciones, no es un benchmark de latencia.
`preempt es fuel.low_1l` y `preempt en spotter.car_left` devolvieron
`preempted_and_stopped`: MP3→MP3 (reemplazo de 1332 ms) y WAV→MP3
(reemplazo de 1050 ms), con segunda llamada stop sin error. No se afirma escucha/aceptación humana,
calidad perceptual, selección de dispositivo ni prueba LMU/OBS. El banco de
preempción no sustituye el test de política de cola: solo comprueba parar el
medio actual, sustituirlo y cerrar el reemplazo. No hay medición de presupuesto
de CPU, latencia o memoria, ni modificación de señales o familias productivas.

El SHA-256 agregado de nombres ordenados UTF-8 y los digest de cada archivo
antes y después de las reproducciones y preempciones fue idéntico
`912a7462e4bfcc4a9362b635d1f0cc4563dc504e238c8f4845aebb68dddeea07`.
No se copian, convierten ni generan medios. Las fixtures WAV de los tests son
sintéticas explícitas y temporales; los tests normales no reproducen audio.

Referencia de API del sistema: [BCryptHash de Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/bcrypt/nf-bcrypt-bcrypthash)
y [status de MCI](https://learn.microsoft.com/en-us/previous-versions/ms713277(v=vs.85)).

### Actualización de caché #1428 — 2026-09-30

En la caché local del producto se añadieron `flags.yellow` y `flags.blue`
para `es` (`ef_dora`), `en` (`af_bella`), `it` (`if_sara`) y `pt-BR`
(`pf_dora`): ocho MP3, sin versionar los clips. Kokoro CLI sintetiza offline
a velocidad 1.0; ffmpeg convierte su WAV a MP3 mono de 24 kHz con
`libmp3lame -q:a 2`. Se conserva la clave SHA-256 y el texto exacto del
catálogo nativo. La cobertura local final es **11/11 por locale, 44/44**,
con las dos banderas disponibles en los cuatro idiomas. El informe versionado
`coverage-2026-09-30.json` conserva la medición inicial.

Tras autorización expresa del orquestador se descargaron únicamente
`voices/if_sara.pt` y `voices/pf_dora.pt` de `hexgrad/Kokoro-82M`, fijados
a la revisión del modelo local `f3ff3571791e39611d31c381e3a41a3af07b4987`.
El banco `voice-cache play` aceptó y detuvo las cuatro banderas nuevas de
`it`/`pt-BR`; también se reprodujeron banderas de `es`/`en` en la primera
ejecución. Esto acredita reproducción aceptada por Windows, sin afirmar
escucha humana. Los 811 clips anteriores a esta continuación conservan
sus hashes; la caché termina con 815 archivos. La evidencia detallada queda
en `C:/tmp/isa-1428-voz-banderas-evidence/` en la máquina de trabajo.
