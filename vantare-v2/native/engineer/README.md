# Engineer nativo — ISA-1428

Proceso bajo demanda: solo foto y eventos neutrales, sin UI, lectura del juego,
red ni síntesis TTS. Reutiliza `runtime::flows` para cursor, ACK y codec y
`runtime::shutdown` para Ctrl+C/EOF; no invoca Core ni los adaptadores privados.
Microplan: `docs/superpowers/plans/2026-09-30-fase-3-eventos-engineer.md`.

## Ejecución parcial de producto

`vantare-engineer --pipe [--pipe-name N] [--locale es|en|it|pt-BR] [--clips CARPETA]`
consume el named pipe de **fotos** ya existente. Windows, ACL de usuario,
PID/imagen del transporte y filtro del consumidor a `vantare-core.exe` hermano
del binario. Reconecta sin inventar fotos. La revisión congelada durante 500 ms
retira avisos y para clips; una reentrega no rejuvenece la foto. Ctrl+C o EOF
en stdin termina y cancela Subscriber. El launcher debe mantener stdin abierto
durante el trabajo y cerrarlo al parar. Todavía no está registrado en launcher.

stdout: JSONL `vantare.radio.v1` con intent, prioridad, texto localizado,
epoch/sequence, session/car y TTL; `vantare.radio.status.v1` con degradaciones
y `clear:true` (retirar presentación, **no** anunciar pista despejada). El estado
inicial declara eventos no disponibles y Spotter sin velocidad de rivales.
Este modo sirve fuel/flags por foto; boxes necesita la conexión de eventos
pendiente. No aceptar el pipe latest-wins como sustituto del journal.

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
eléctrico. Un solo dueño del checkpoint (launcher todavía pendiente).

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
reason = 0 CoreRestart | 1 Retention | 2 InvalidCursor | 3 RecordingDisabled
```

Foto y tail comparten época; eventos no superan el corte. Foto usa el DTO
existente de `ipc`, no ABI Rust. Codec valida forma, versión, cursores y tamaños;
**no aporta ACL, identidad de par ni plazos**. Integrar named pipe, dueño de
persistencia separado, launcher y miembro del workspace padre corresponde a
los propietarios de esas rutas. No conectar el banco a datos reales saltando
la frontera. `Frame::capture` puede leer disco: NO llamarlo en adquisición.
Hace falta transferir un corte coherente al dueño del transporte.

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
Penalties/laps/timings/pitstop completo también requieren señales/contratos
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

## Gates y evidencia

Workspace local durante el trabajo paralelo. Desde `native/engineer/`:

```powershell
cargo fmt --check
cargo clippy --workspace --all-targets --offline -j 2 -- -D warnings
cargo test --workspace --offline -j 2
```

Además, los tres gates del workspace padre `native/`. `tests/recovery.rs` usa
observaciones **sintéticas explícitas**, procesos y checkpoints reales: reinicio,
dedup, todos los confirmados, hueco volátil, retención, escritura fallida,
corrupción y EOF con plazo. `tests/radio.rs` verifica las reglas, TTL, cola,
calidad, fotos congeladas, locales y WAV sin reproducir. `tests/lifecycle.rs`
ejercita EOF sin Core y rechazo de publicador con imagen distinta mediante
named pipe real (datos sintéticos); no sustituye prueba con Core empaquetado.
No demuestra LMU/OBS, acústica ni rendimiento.
Notion pendiente de restablecer acceso; no hay push, PR o merge.
