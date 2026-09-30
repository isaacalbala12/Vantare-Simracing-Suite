# Engineer nativo — ISA-1428

Proceso bajo demanda: solo foto y eventos neutrales, sin UI, lectura del juego,
red ni síntesis TTS. Reutiliza `runtime::flows` para cursor, ACK y codec, sin
duplicar el journal. Producción solo importa `flows`; no invoca Core ni los
adaptadores privados. Microplan: `docs/superpowers/plans/2026-09-30-fase-3-eventos-engineer.md`.

## Consumo y recuperación

`vantare-engineer --stream --cursor <checkpoint>` usa stdin/stdout heredados:
HELLO con cursor, frame individual, checkpoint y ACK. Es **el banco IPC**, no
el named pipe de ADR 0099. EOF termina con código 0; error de codec, checkpoint
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
corrupción y EOF con plazo. No demuestra LMU/OBS, acústica ni rendimiento.
Notion pendiente de restablecer acceso; no hay push, PR o merge.
