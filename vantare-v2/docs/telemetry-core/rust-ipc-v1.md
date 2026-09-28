# ISA-1403 — Framing IPC v1 inicial

Estado: framing Go/Rust y un harness Windows de hijo Rust conectado a named pipe. El harness solo realiza Handshake → Stop; no adquiere LMU ni se integra en Wails. La versión `1` identifica el framing local, no el esquema canónico ni las versiones de Overlay/Engineer/Strategy. La elección de codec para payload permanece abierta al benchmark JSON/binario de R06/R21.

## Framing implementado

Una trama es `length:u32 LE | version:u16 LE | kind:u16 LE | payload[length]`. La longitud cuenta solo el payload. El encabezado tiene 8 bytes; Rust y Go rechazan longitudes superiores al límite de cada tipo antes de reservar memoria, versión distinta de `1`, tipo desconocido, EOF dentro de encabezado/payload y bytes sobrantes en el decoder de una trama completa. Sus lectores/escritores soportan I/O parcial; todavía no establecen plazo ni cancelación de pipe. El decoder de buffer exige exactamente una trama; el lector de stream consume una trama y deja las siguientes para llamadas posteriores. Los dos lados prueban los mismos bytes wire fijos para los diez tipos.

| Tipo | ID | Uso previsto |
| --- | ---: | --- |
| Handshake | 1 | Harness: nonce de instancia de 16 bytes, longitud de versión `u8` (1–64) y versión UTF-8 exacta del paquete Rust. Las capabilities productivas aún no están definidas. |
| Configuration | 2 | JSON cerrado v1 con revisión, consumidores, cadencias en ns, preferencias y source/capabilities |
| ConfigurationAck | 3 | JSON cerrado `revision`, `epoch`, `sequence`, `factStream`, `factSequence`; el cursor de facts es la línea base anterior al lote confirmado |
| Snapshot | 4 | Prototipos JSON: `{"product":"overlay-v2","update":UpdateV2}` y `{"product":"engineer-v1"|"strategy-v1","snapshot":SnapshotV1}`; publicación y codec final pendientes |
| Fact | 5 | Prototipo Engineer V1 JSON con stream de entrega, metadata canónica, secuencia de fact y UTC RFC3339; retención productiva/resync pendientes |
| FactAck | 6 | JSON cerrado `{stream,sequence}` tras retener; Rust poda el prefijo confirmado. Probado en replay, sin receptor productivo |
| ResyncRequired | 7 | JSON cerrado `{stream,first,next}` para laguna irrecuperable; bootstrap productivo pendiente |
| Status | 8 | JSON cerrado de heartbeat y estado de fuente, máximo 256 bytes; contrato abajo |
| Stop | 9 | Cierre solicitado; payload exactamente vacío |
| FactReplayRequest | 10 | JSON cerrado `{stream,sequence}`: Go solicita frames posteriores a su cursor; `sequence=0` permite el primer replay |

Snapshot conserva 8 MiB como techo defensivo provisional, no como medición ni autorización para emitir frames de ese tamaño. Los otros tipos tienen límites por tipo. R06 medirá el máximo real de cada producto con 104 coches y fijará límites específicos de Snapshot antes de conectar el pipe. Ningún payload externo se acepta aún en el runtime productivo. El protocolo falla cerrado si la versión o el tipo no coinciden.

## Status y Stop v1 (2026-09-28)

`Status` lleva exactamente `{"heartbeat":u64,"state":string,"sourceAgeNs":u64|null}`.
`heartbeat` empieza en 1 y avanza exactamente de uno en uno por mensaje
emitido por el hijo; Go dispone de un tracker por instancia que rechaza
huecos, retrocesos y duplicados. Los estados
admitidos son `detecting`, `connecting`, `live`, `degraded`, `stale`, `error`,
`stopping` y `stopped`. `sourceAgeNs` es obligatorio: número para
`live`/`degraded`/`stale`, `null` para los demás. Mide la edad de la fuente
con reloj monotónico del hijo; Go mide aparte la llegada del heartbeat con
su propio reloj monotónico. Un Status no prueba por sí solo que avance SHM.
Rust codifica y valida el sobre; Go lo decodifica estrictamente. No hay aún
emisor ni receptor productivo, deadline ni watchdog conectado. El wire fijo
para `live` con heartbeat 1 y edad 0 tiene 46 bytes de payload.

`Stop` acepta únicamente cero bytes de payload. El harness Rust usa el mismo
validador que el futuro runtime; Go dispone de validador equivalente. Stop
solicita cierre, sin prometer un ACK o un plazo que todavía no se implementa.

## Snapshot Overlay V2 inicial (2026-09-28)

El payload JSON de `KindSnapshot` lleva exactamente `product` y `update`.
`product` es `overlay-v2`; `update` es el contrato `UpdateV2` completo, cuyo
`frame.contract` y `frame.algorithm` valen `2`. Rust exige las secciones
Overlay presentes y comprueba estado de fuente y máscara antes de emitir;
el framing aplica el límite de 8 MiB. Go decodifica el sobre y el update
sin campos desconocidos, exige un único JSON, el producto, versión, estado
y máscara conocidos. Este payload es un prototipo de R06, no el codec final
R21 ni una ruta productiva.

`rust/telemetry/testdata/overlay-snapshot-frame-rust-v1.bin` son 24 353 bytes
producidos por el encoder Rust desde el oráculo real estático de 44 y
decodificados por Go como el mismo `UpdateV2`; SHA-256
`15d1328fb1f8a5774ea8986f234a222b8bc25f8b9ea42a257c3adb1389dcb82f`.
La captura sigue siendo un instante, sin 104 ni temporalidad SHM+REST.

## Snapshot Engineer/Strategy v1 inicial (2026-09-28)

Rust envuelve los payloads de producto con `canonicalVersion=1`,
`projectionVersion=1`, cursor y `capturedAt`; Go decodifica estrictamente a
`engineer.SnapshotV1` o `strategy.SnapshotV1`, comprueba versiones, cursor,
fecha RFC3339Nano, producto y esquema. Frames reales estáticos de 44:
`engineer-snapshot-frame-rust-v1.bin` 150 575 bytes, SHA-256
`06e67d8a97edafe1a674070c320bb91543df0d86cc281d076318f92da0859e23`;
`strategy-snapshot-frame-rust-v1.bin` 1 525 bytes, SHA-256
`f170c22604450d2247f790b07458f3ad861254846f0dd9089cd80ccdad85aea8`.
La salida Engineer actual usa un `EngineerView` tipado para construir
directamente JSON y framing sin mapas `Value` por campo; R21 medirá y
comparará codec, copia y entrega completa antes de elegir transporte. El
receptor aún no recibe estos frames desde un hijo productivo.

## Fact Engineer v1 inicial (2026-09-28)

Rust envuelve `FactEnvelopeV1` en `KindFact` con
`{"product":"engineer-v1","stream":u64,"fact":FactEnvelopeV1}`. Metadata lleva el
cursor canónico; `fact.sequence` ordena hechos independientemente.
`occurredAt` proviene del instante UTC canónico y se convierte con
`time 0.3.55`/RFC3339; el decoder Go exige tipo, producto, versiones,
cursores positivos, kind conocido y ambas fechas válidas. El frame
`engineer-fact-frame-rust-v1.bin`, SHA-256
`36e11bd1f14e1e55fcaedf843eca93a575099bd6a371c46394597dfb4734311a`,
coincide con el proyector Go de una vuelta completada. El código **no
publica en runtime**: FactAck y poda están probados solo en el replay;
retención productiva, resync y backpressure quedan pendientes antes de
emitir facts reales.

Rust conserva hasta 64 frames Fact exactos para replay. Valida la
secuencia antes del commit; un ACK elimina solo el prefijo confirmado.
Si el cursor queda fuera de la ventana, `Assembler` produce un mensaje
de resync explícito. En el replay Windows el mismo frame se
envía dos veces y Go confirma una sola copia. Aún no hay solicitud de
replay en reconexión productiva. El helper Windows acepta una solicitud
`FactReplayRequest` del Go host y devuelve el frame exacto retenido;
Go comprueba deduplicación y envía FactAck. El runtime productivo aún
no consume esta solicitud ni automatiza reconexión.

El ACK de configuración fija el stream y la última secuencia Fact ya
consolidada por el motor canónico antes del lote que instala esa configuración. Go crea el
`FactRetainer` desde esos campos antes de aceptar el primer Fact del
lote. `factSequence=0` es válido; `factStream=0` se rechaza. Al cambiar
demanda, un ACK nuevo comunica la línea base actual y evita adivinarla
desde un fixture. No hay todavía bootstrap/reconexión productivos.

`KindResyncRequired` ya lleva `stream`, primer fact aún retenido y
siguiente secuencia. Rust lo emite al perder el rango o retirar demanda;
Go valida el frame de 41 bytes, SHA-256
`45112bfa9c976c3043adda11852c304f2dd9c089bd8113231c469ed3eb1c13f8`.
La recuperación con bootstrap aún requiere supervisor productivo.

La recepción Go usa `FactRetainer` en el replay: 64 facts pendientes,
64 payloads recientes para deduplicar, rechazo explícito de hueco,
conflicto, stream ajeno y saturación, sin ACK ante rechazo. `Drain`
transfiere en orden. El payload de un Fact tiene máximo **4 KiB** tanto
en el encoder Rust como en el decoder Go; el ACK conserva 128 bytes
como límite propio. Aún no está conectado al consumidor Engineer de
la app. El retentor exige un cursor inicial de stream/suscripción;
sin él rechaza incluso el primer salto. El runtime deberá establecer
ese cursor desde un bootstrap/configuración confirmados.

El frame `fact-ack-frame-go-v1.bin` mide 34 bytes, SHA-256
`51c63a1a3611792f1294426f86ef7e4899cbe60c5d3a8cb23487aad3a765fd0f`.
Go lo emite tras almacenar el fact en el test de pipe; Rust valida
stream/sequence y poda únicamente el prefijo confirmado. ACK duplicado
o anterior no retrocede; stream ajeno o secuencia futura se rechazan.

## Configuration/ACK v1 inicial (2026-09-28)

Go codifica una configuración completa con `revision > 0`, `consumers`
(`overlayV2`, `engineer`, `strategy`), las nueve cadencias efectivas en
nanosegundos no negativos, preferencias de unidades/referencia y el source
de capacidades/modos/política. Los arrays/mapas opcionales de source se
normalizan a `[]`/`{}`. El payload se limita a 64 KiB antes de escribir;
Rust rechaza versión/tipo, JSON/campos extra, revisión, cadencia, preferencias
y tamaño inválidos. Un ACK contiene revisión y cursor canónico positivos y
se limita a 256 bytes; Go lo decodifica estrictamente. **Todavía no existe
aplicación ni emisión del ACK en runtime**: el código fija el contrato y
la semántica prevista es confirmar solo después del commit de frontera.

Los frames cruzados son `configuration-frame-go-v1.bin` (660 bytes, SHA-256
`b5278d342721972e751ba6ce32099f5c96edf9573843d2742c0817819b76bd32`)
y `configuration-ack-frame-rust-v1.bin` (46 bytes, SHA-256
`4f18830ddc9ccfd0be5d56406ee49efb824e335777edc0c413253ddeefefeff2`).
Las pruebas de ambos lados verifican sus límites y valores.

`serde 1.0.229` se declara ahora dependencia directa para deserializar el
contrato cerrado con `deny_unknown_fields`; ya era transitiva de
`serde_json`. Alternativa: inspección manual de `Value`, más código y riesgo
de omisiones. Licencia `MIT OR Apache-2.0` según `cargo metadata` local;
`serde_derive` añade macros al build, sin uso en runtime por el binario
inactivo. El ejecutable release actual mide 150 528 bytes; el efecto causal
de tamaño y CPU se medirá sobre la ruta productiva en R21/R22.

## Harness Windows actual

Go genera 16 bytes aleatorios por instancia y reserva `\\.\pipe\vantare-telemetry-<32 hex>` con una DACL protegida para el SID de la sesión de inicio, `PIPE_REJECT_REMOTE_CLIENTS`, primera instancia exclusiva y un solo servidor. Crea el hijo suspendido con entorno vacío y sin handles heredados, lo asocia a un Job Object con `KILL_ON_JOB_CLOSE`, y después lo reanuda. La aceptación del pipe tiene un máximo de 2 s y compara el PID real del cliente con el proceso lanzado. El cierre del job mata al hijo si continúa activo. El harness Rust abre ese pipe, envía el handshake con nonce y versión, espera un `Stop` vacío y sale. Go verifica la versión esperada `0.1.0` en el test conjunto, sin convertir el nombre o nonce en una credencial.

Estas garantías están probadas en el harness, no conectadas todavía al runtime productivo: faltan plazos de lectura/escritura y su cancelación bajo carga, colas/snapshots/facts, reinicios, configuración, bootstrap y supervisión desde Wails. `TestRustChildPipeHandshakeAndStop` requiere `VANTARE_TELEMETRY_RUST_TEST_HELPER` apuntando al binario `cargo build --release --locked --target x86_64-pc-windows-msvc`; una ejecución con `Skip` no acredita este gate.

Un segundo ejecutable **solo de test**, `vantare-telemetry-replay`, se
compila con `cargo build --locked --release --features replay-harness --bin
vantare-telemetry-replay`. `TestRustReplayPipeDeliversDemandedProductsAndFact`
requiere `VANTARE_TELEMETRY_REPLAY_TEST_HELPER` apuntando a ese `.exe`.
Go envía Configuration por un pipe real y recibe ACK, Overlay, Engineer y
fact desde `Assembler` sobre el fixture auditado estático de 44. Tras
retener el fact, Go envía FactAck y Rust poda ese prefijo. Sigue una
segunda Configuration que demanda solo Strategy. Rust confirma
la revisión 8 en el cursor siguiente y Go decodifica solo ese snapshot;
después llega Stop. Pasó en Windows el 2026-09-28; no equivale a LMU live ni al
writer/supervisor productivo. El ejecutable principal se compila sin
`replay-harness` y no incluye este camino.

`Acquisition::handle_control_frame` prepara el despacho del futuro reader:
acepta Configuration, FactAck y FactReplayRequest validados, encola el replay
o ResyncRequired y propaga saturación. Stop corresponde al loop exterior.
La prueba unitaria del despacho usa un Fact real estático de 44 coches; aún
no existe reader/writer de pipe live que lo invoque.

El harness principal Rust usa ahora I/O Win32 overlapped con límite de dos
segundos para Handshake/Stop. Cada operación conserva OVERLAPPED, evento y
buffer hasta `GetOverlappedResult`, incluso tras `CancelIoEx` por timeout.
El test cruzado con Go confirma intercambio normal y salida del hijo sin
Stop ni cierre previo del servidor. La ruta productiva todavía no usa este
transporte, no hay watchdog ni deadlines por frame live.

Una ruta explícita `--candidate-pipe` ya lee Configuration y controles,
adquiere LMU para builds exactas admitidas, entrega batches por el pipe y
responde Stop tras cerrar REST. El host Go aún no la selecciona desde Wails.
El lector consulta disponibilidad sin reservar memoria, valida los ocho
bytes de cabecera antes del payload y abandona el pipe si una trama parcial
vence el plazo. Un test Windows envía solo la cabecera de Configuration de
64 KiB+1 y el hijo sale antes de recibir cuerpo. LMU 1.4.2.0 está
admitida por capturas sanitizadas reales de menú y pista (43 coches) con
sus pares REST y hashes fijados. Un test opt-in ejecutó el candidato
contra LMU físico: menú sin sesión publica connecting sin ACK ni snapshots;
pista entrega ACK, Overlay y Engineer de 43 coches, Status live y Stop limpio.
El candidato emite Status consecutivo cada 250 ms: connecting
sin fuente confirmada, live con edad monotónica desde el último avance SHM
y stale desde 500 ms sin avance o durante recuperación. La edad no deriva
de las lecturas repetidas. Tests Rust fijan el umbral y la fixture real
estática de 44; falta conectar
el watchdog/reinicio Go. La salud REST todavía no cambia el estado.

## Límites de diseño para completar antes de R05/R19

| Recurso | Límite inicial | Evidencia/estado |
| --- | ---: | --- |
| Snapshot wire | 8 MiB | Techo provisional implementado y probado. Falta máximo real con 104 coches y límite específico por producto. |
| Control wire por tipo | Handshake 81 B; Configuration 64 KiB; ACK 256 B; Fact 4 KiB; FactAck/Resync/Replay 128 B; Status 256 B; Stop 0 B | Rust y Go rechazan desde la cabecera antes de reservar payload y al codificar; tests por tipo y pipes Windows. |
| Snapshot pendiente | 1 lote de hasta 3 productos | `WriterQueue` sustituye el lote anterior de solo snapshots; el candidato entrega los productos demandados al writer síncrono. Falta medirlo bajo consumidor lento. |
| Cola de eventos | 8 lotes; 64 facts; 16 MiB total incluidas snapshots | `WriterQueue` valida el lote entero antes de insertarlo; ACK/facts/resync/Stop conservan orden. Saturación devuelve error explícito y exige cierre/resync del owner. |
| Facts pendientes | 64 | Retención/ACK IPC probados en replay y receptor Go; falta entrega productiva y recuperación. |
| Callback Engineer | 250 ms | Valor por defecto Go actual, no un timeout IPC ya implementado. |
| Adquisición LMU SHM | 60 Hz nominal | Agenda implementada en candidato Rust; frecuencia real y coste aún no medidos. |
| Heartbeat hijo | 250 ms | Status secuencial en candidato; fuente medida por reloj monotónico propio. Sin test live admitido. |
| Watchdog de fuente | 1 s | Valor Go actual; watchdog del proceso Rust no conectado. |
| Aceptación de pipe | 2 s | Implementado y probado con deadline en Windows. |
| Cierre de hijo | 2 s | Implementado con Job Object y probado en Windows; falta matriz completa de fallos. |

Profundidad de control, deadline de escritura bajo carga, retención de facts, presupuesto de reinicios y cierre del runtime productivo requieren tests adicionales y quedan **sin fijar** en este corte. Los 2 s de cierre del harness no certifican el cierre del pipeline live. R04/R05 no se marcan completos hasta que la tabla productiva sea numérica y esté protegida por pruebas de frontera. No se activa una ruta productiva con esa tabla incompleta.

## Dependencias

Rust usa `serde`, `serde_json`, `time`, `ureq` y `windows-sys` solo para Windows; `Cargo.lock` fija sus versiones. `windows-sys 0.61.2` aporta llamadas Win32 tipadas para I/O overlapped y añade `windows-link 0.2.1`; ambas licencias son MIT OR Apache-2.0. El framing Go usa la biblioteca estándar. Rust se fija en `1.95.0` para `x86_64-pc-windows-msvc`; `cargo test --locked`, Clippy y los tests Windows Go↔Rust comprueban framing, límites, handshake, timeout y rechazo de cabecera sobredimensionada. El coste de dependencias queda para R21/R22.
