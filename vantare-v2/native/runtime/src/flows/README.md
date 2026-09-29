# Flujos mínimos — ISA-1425 / ADR 0099 §2

Prueba de frontera interna del runtime; no hay transporte IPC, consumidor
Engineer ni flag CLI. `Core::new` deja recording desactivado.
`Core::with_flows(epoch, retention, Some(path))` es el opt-in de recording.
La época la inyecta el propietario y debe crecer al reiniciar; no se lee reloj
de pared.

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
