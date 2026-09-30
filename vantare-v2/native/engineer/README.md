# Engineer nativo — ISA-1428

Proceso bajo demanda: solo foto y eventos neutrales, sin UI, lectura del juego,
red ni síntesis TTS. Reutiliza `runtime::flows` para cursor, ACK y codec y
`runtime::shutdown` para Ctrl+C/EOF; no invoca Core ni los adaptadores privados.
Microplan: `docs/superpowers/plans/2026-09-30-fase-3-eventos-engineer.md`.

## Ejecución de producto

`vantare-engineer --pipe --cursor R [--pipe-name N] [--locale es|en|it|pt-BR] [--clips CARPETA] [--settings RUTA]`
consume foto DTO v4 y journal por `<pipe-de-fotos>-events`. Windows, ACL de usuario,
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
inicial declara conexión pendiente y Spotter sin velocidad de rivales.
Boxes y vueltas completadas exigen hechos del journal de la revisión actual;
fuel/flags usan estado fiable actual. SourceState distinto de Live retira voz.
No aceptar el pipe latest-wins como sustituto del journal.

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
en los ejes neutrales ahead/right, con histéresis. **Solo geometría**: faltan
velocidades de rivales para el filtro de cierre, por tanto no emite radio.
Penalties/timings/pitstop completo también requieren señales/contratos
comunes pendientes en el microplan. No es paridad de todas las familias Go.

Voz opt-in mediante clips locales pregenerados Kokoro, sin red ni síntesis:
`<CARPETA>/<locale>/<intent>.wav`, por ejemplo `es/fuel.low_1l.wav`. El batch
de assets debe normalizar a RIFF/WAVE canónico con cabecera de 44 bytes,
PCM16 mono/estéreo, 16–48 kHz, máximo 8 s; no acepta chunks de metadatos ni
MP3 de la caché Go. Validación acotada (4 MiB), ruta canonical dentro de la
carpeta y archivo regular. Reproductor Win32 WinMM asíncrono, sin proceso extra,
con stop y `SND_NODEFAULT`; unsafe solo en `voice/win.rs` con comentarios SAFETY.

`voice` en JSON es `disabled`, `missing`, `failed` o `started`; el último
significa que WinMM aceptó iniciar, **no** acredita salida acústica. Aviso visual
permanece cuando falta clip; no hay motor alternativo. Sin assets incluidos y
sin prueba acústica. WinMM no da ACK de fin: se usa duración validada y tick de
50 ms; I/O/salida bloqueados no acreditan plazo acústico estricto. Leer el clip
local ocurre en este worker, nunca en adquisición. No exactamente una vez para
audio ante muerte entre checkpoint y salida; permisos/distribución de assets y
escucha es/en/it/pt-BR pendientes de Isaac. Sin wake/PTT/STT ni ajuste de dispositivo.

## Control local desde Hub — ISA-1428 / ISA-1430

El Hub escribe `%LOCALAPPDATA%/Vantare/native/engineer.json`; Engineer lo
sondea cada turno (espera de hasta 50 ms, sin promesa bajo I/O bloqueado) y
confirma sus ajustes efectivos en `engineer-status.json` del mismo directorio.
Un archivo ausente inicialmente usa `--locale` y voz opt-in por `--clips`;
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

Solo `es`, `en`, `it`, `pt-BR`; `voice` activa los clips de `--clips`, no
selecciona otra voz ni descarga assets. Sin carpeta/clip válido conserva texto
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
completo y WAV válido por locale, último mensaje con época/revisión y error. Solo
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
calidad, fotos congeladas, locales y WAV sin reproducir. `tests/lifecycle.rs`
ejercita EOF sin Core y rechazo de publicador con imagen distinta mediante
named pipe real (datos sintéticos); no sustituye prueba con Core empaquetado.
No demuestra LMU/OBS, acústica ni rendimiento.
Notion pendiente de restablecer acceso; no hay push, PR o merge.
