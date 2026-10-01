# Modelo de estados Engineer — #1430

Importar `crate::engineer::model::{Model, Health, UNAVAILABLE}`.
`engineer.rs` declara el módulo y consume su estado actual, entregas e informe.
El modo captura carga el fixture compartido mediante `Model::capture`, a través
del mismo parser v2 y reloj congelado. No escribe estados de usuario.

```rust,ignore
let mut model = Model::new(&settings_path);
// Cada segundo, incluso si no cambia mtime:
let now = crate::engineer_control::runtime::now_ms();
if model.poll(now) { /* notificar a GPUI */ }
let view = model.view(now);
```

| Datos | Forma tipada y significado |
| --- | --- |
| Salud | `View.health: Health`: Fresh, Stopped, Missing, Invalid, Expired, LegacyUnavailable. |
| Servicio / conexión | `View.running`, `View.connected`, `View.connection: Connection`. Conectado exige proceso fresco + observación Live aceptada; no implica permiso ni audio. |
| Spotter | `View.spotter: Spotter`: Disabled, WaitingSource/Player/PitLane/LowSpeed, UnavailableSpatial, Ready. Global enabled controla también Spotter. Ready no acredita cobertura completa de rivales; los que carecen de evidencia se omiten como en el productor. |
| Datos actuales | `View.runtime: Option<&RuntimeStatus>`; None = no disponible, no pintar datos viejos. |
| Jugador de telemetría | `runtime.telemetry_player_available`, presencia del sujeto en la foto; distinto del audio playerAvailable de Wails, no disponible sin validar dispositivo. |
| Voz | `runtime.voice`: engine, clips_configured, selected_voice, cached_voices `[locale, voice, clips_available]`, error. Cache-only, un preset compartido. |
| Entrega | `runtime.delivery`: pending (excluye activo), speaking, text_enabled, voice_requested, history, evicted; `last()` devuelve último aviso. |
| Entrega individual | `Delivery`: id, Message {epoch, sequence, intent, locale, text}, text_emitted, audio: AudioOutcome, selected_at_ms. Hora real de selección, no hora de creación. |
| Historial | `Model::history(Filter)` devuelve `ObservedDelivery` más recientes primero, hasta 1000; deduplica PID/instance_ms/id y actualiza resultados de audio. |
| Ciclo | `Model.current_epoch`: época de foto actual incluso sin avisos. No es presentationLifecycle Wails. |
| Exportación | `prepare_export(now_ms)` congela estado recibido, running/connected actuales, error, historial observado y no disponibles; independiente de filtros. |
| Retención | Worker retiene 64 últimas entregas; `report().runtime.delivery.evicted` es acumulado worker, `Model.evicted` cuenta expulsadas en Hub. Nunca sumar como pérdida exacta. |

`Model.report()` conserva la última evidencia válida incluso tras un error;
no usarla para el estado actual. `view` falla cerrado y deja `runtime=None`
cuando caduca heartbeat (3 s), retrocede reloj, v1 carece de heartbeat,
se retira/rompe el archivo o el proceso publica active=false. No hace falta
consultar PID ni lanzar procesos. V1 sigue parseable; sus diagnósticos y
frescura se muestran no disponibles.

La vista consume `view/history/prepare_export`; `status()` conserva la proyección
v1 para compatibilidad, pero no acredita conexión o frescura. Un v1 se muestra
como no disponible. Texto emitido no se presenta como ACK visual; la duración
real sigue no disponible. Solo el fixture de captura tiene resultados Wails
congelados (Publicado, Completado, 25 ms).

No disponibles en `UNAVAILABLE`: síntesis, micrófono/PTT, catálogo TTS,
dispositivo de audio, voz separada por canal, modo por familia, ACK de subtítulos, test de audio,
contadores/percentiles e historial durable/completo. En Linux el motor de
reproducción está no disponible aunque un WAV pase validación. Texto emitido
y audio started/finished no prueban visualización ni escucha humana.
