# ENG-06 — Runtime productivo y transporte preemptivo

Estado: implementación WIP en la rama aislada de ISA-167. Los P1/P2 de la
primera review independiente están corregidos; pendiente de re-review. Sin
promoción, TTS/STT, UI nueva, Pit Manager ni Strategy.

## Resultado y ownership

`EngineerService` continúa siendo el único owner productivo. Consume solamente
`ObservationSnapshotV1` y hechos canónicos, alimenta el único `core.Runtime`,
convierte la salida legacy acotada mediante `projectioninput` y la somete a una
sola instancia de `messagepolicy.Scheduler`. Este corte no abre Shared Memory,
REST, archivos, sockets ni una segunda fuente de telemetría.

El flujo productivo queda:

1. Telemetry Core entrega una observación canónica.
2. El adapter deriva frames y evidencia desde esa misma observación.
3. Los monitores existentes producen mensajes legacy acotados.
4. `projectioninput.CandidateFromMessage` crea el contrato neutral.
5. La única policy admite, ordena y revalida.
6. El runtime de entrega selecciona una decisión y crea una sesión cancelable.
7. El transporte confirma `started` antes de cualquier salida visible o audio.
8. Solo ese ACK permite avanzar cooldown y contexto Spotter.

El harness legacy sigue siendo explícito y no participa en el composition root.

## Contrato de entrega v1

`internal/engineer/delivery` define un puerto bloqueante y cancelable por
`context.Context`. Una sesión admite exactamente esta secuencia:

- `queued`;
- `started`;
- uno de `completed`, `interrupted`, `failed` o `cancelled`.

También se permite fallar o cancelar antes de `started`. Estados, motivos e IDs
son finitos y acotados. El ACK nunca contiene texto, telemetría, rutas,
dispositivos ni datos personales. Las combinaciones estado/motivo inválidas y
las transiciones duplicadas fallan cerradas.

El callback de `started` vuelve a demostrar TTL, fuente, epoch, identidad,
prioridad, intención y claim semántico contra la observación más reciente. Si
esa prueba falla, el estado no avanza, no se publica la notificación y el
runtime termina la sesión como `cancelled` con un motivo sanitizado.
La cancelación y este ACK se serializan bajo el mismo owner; incluso un puerto
defectuoso que intente confirmar tarde no puede reactivar una entrega
preemptada.

## Transporte de producto y audio

El transporte por defecto publica la notificación existente de Engineer y la
marca como iniciada justo antes de hacerla visible. Si existe `AudioPlayer` y
un resolver produce un archivo, reproduce ese audio dentro del mismo contexto
cancelable. Sin player o audio resuelto, la entrega visual completa el contrato
sin inventar TTS ni tratar el modo silencioso como error.

El resolver de este corte solo consulta audio ya disponible. El contrato es
context-aware y cada lookup tiene un límite de 100 ms. `AudioRouter` ofrece
`ResolveCached`, que no llama al engine aunque exista; un miss o timeout
degrada a notificación visual. La síntesis y las descargas quedan fuera del
camino crítico y pertenecen a un transporte TTS posterior.

El composition root instala antes de `Start` el `audio.Player` existente y un
`AudioRouter` cache-only sobre la caché canónica hash de Kokoro bajo
`tts.DefaultCacheRoot`. Conserva lectura del layout desempaquetado histórico,
pero no retiene un engine. Por tanto la preempción no existe solo en fakes: el
grafo real usa `PlayContext` y puede cancelar el proceso de reproducción. No se
añade provider ni síntesis nueva.

`audio.Player.PlayContext` usa el proceso PowerShell ya existente, pero su
espera pertenece al caller: no crea una goroutine de espera separada. Cancelar
el contexto termina el proceso y el runtime une la goroutine de entrega antes
de cerrar.

## Preempción y lifecycle

- Un Spotter P0 cancela audio Engineer activo de prioridad inferior.
- Engineer no crítico nunca interrumpe Spotter.
- Un Spotter nuevo no corta otro Spotter ya iniciado; espera su turno.
- Un candidato cancelado antes de `started` jamás llega a notificación o audio.
- `Stop`, deshabilitar Engineer, perder la fuente, cambiar epoch/identidad y
  hechos de inicio/fin/cambio de piloto/desconexión cancelan pendientes y
  entrega activa.
- Un error de transporte termina solo esa sesión y despierta la siguiente; no
  bloquea el loop.

Existe una sola goroutine de loop y, como máximo, una de transporte activo.
Ambas pertenecen al `WaitGroup` del servicio, heredan un contexto cancelable y
tienen un camino de cierre probado. No hay ticker de polling ni sleeps en el
runtime.

## Métricas y replay

`EngineerHealth.policy` expone solo contadores acotados de pendientes,
aceptados, emitidos, suprimidos, expirados, cancelados y no disponibles.
`EngineerHealth.delivery` expone contadores por estado y una ventana acotada de
latencias desde la selección de la decisión hasta el inicio, con p95 y máximo.
`dropCount` conserva el contador existente de backpressure SSE. Ninguno de
estos campos conserva IDs de candidato, mensajes, payloads, paths o identidad.

El oráculo v2 distingue explícitamente:

- `emitted / candidate_emitted`: la policy produjo una decisión;
- `dispatched / transport_queued`: el runtime la entregó al transporte;
- `playback_started / playback_started`: el ACK contractual autorizó inicio.

El golden v1 se conserva como historia. El golden v2 fija el nuevo contrato y
evita volver a confundir selección con reproducción o comunicación real. Los
replays focales cubren además right, three-wide, clear contextual, boundaries
de lifecycle, presión con capacidad uno y disconnect -> reconnect. Al perder
la conexión, producto y replay guardan el borde de la última observación
aceptada (`epoch`, identidad y `sequence`). Tras recovery solo aceptan un
cursor estrictamente posterior: dentro del mismo epoch debe aumentar
`sequence`; un epoch mayor sigue siendo un lifecycle legítimo. Un snapshot
igual o anterior no restaura pendientes, no reconecta Engineer y no autoriza
playback. El incremento de `ReconnectAttempt` crea este borde incluso si dos
status consecutivos siguen en `live`, cubriendo estados intermedios coalescidos.
Replay conserva `awaiting fresh` y el borde hasta aceptar cursor y
identidad/lifecycle juntos: un cursor posterior con contexto inválido no
autoriza que el snapshot del borde se reutilice después.

## Límites actuales

- No se añade TTS, STT, voz, dispositivo o UI.
- Solo las seis familias aprobadas previamente pueden atravesar la policy.
- Pit Manager y Strategy no forman parte de este corte.
- El transporte inyectable debe respetar el contexto y emitir un único estado
  terminal. El runtime corrige retornos sin terminal como fallo acotado.

## Evidencia técnica WIP

- Engineer completo: PASS.
- Telemetry completo: PASS.
- Go global serial: PASS.
- Race focal de delivery, policy, adapter, replay, audio, service y server:
  PASS con GCC UCRT64.
- Repetición service/server x20 y LMU integration x20: PASS.
- Vet focal: PASS. Vet global conserva únicamente tres warnings Win32
  heredados fuera del diff (`launcher/icon_windows.go` y dos archivos LMU).
- Frontend build para el embed: PASS; no hay cambio frontend rastreado.
- Bench x5: lifecycle 252–281 ns/op; scheduler saturado 4,59–5,91 us/op;
  supersession Spotter a capacidad 0,59–0,71 ms/op. El benchmark productivo
  Scheduler -> queueLoop -> transport -> started, con ocho submissions
  concurrentes y preempción Spotter, queda medido por separado.
- `git diff --check`: PASS.
- Corrección final de review WIP: regresiones de producto y replay reutilizan
  el snapshot igual y uno anterior al borde de desconexión antes de aceptar el
  siguiente cursor. La ruta productiva cubre también `live/N -> snapshot S ->
  live/N+1 -> S rechazado -> >S aceptado`; replay cubre `>S` con identidad
  inválida, conserva el borde y solo acepta después un `>S` válido. Focal
  service/replay x10 y ambas regresiones x20: PASS. Benchmark de la ruta
  productiva (`productDeliveryPort -> ResolveCached -> PlayContext`), 20x:
  PASS, 65.310 ns/op; el temporizador se detiene al entrar en `PlayContext`.
  Race focal no ejecutable con `CGO_ENABLED=0`; vet focal: PASS. El gate Go
  global no concluyó dentro de 124 s y el vet global reproduce solo los tres
  avisos Win32 heredados de `unsafe.Pointer` fuera del diff.

Rollback: revertir el commit futuro de ISA-167. No hay migraciones, datos
persistidos, secretos ni estado remoto.
