# Fase 3 — Eventos y Engineer (ISA-1428)

## Ampliación autorizada: integración del corte 4

Revisión de Opus/Isaac: integrar `vantareapp/isa-1427-fase2` (punta leída
`e172eb3fb0e92915468209d8c0cc46a30362a115`), unificar workspace y conectar
producción. Se autoriza además `native/Cargo.toml`, lock padre, transporte IPC,
`runtime/src/core/`, servicio y launcher/tests, lo mínimo necesario. Adaptadores,
modelo, `ui/` y `hub/` no se editan: sus cambios de fase 2 se reciben por merge.
Ponytail sigue activo; no se crean subagentes ni se hace push/PR/promoción.

Hitos nuevos, cada uno con gates completos y commit local:

1. Merge fase 2 sin perder ninguna rama. DTO v4 se conserva. Primer fmt encontró
   un formato heredado en `native/ui/src/app.rs:385`; no se corrige fuera del
   alcance autorizado. Clippy/test se ejecutan y se registra esta deuda explícita.
2. Engineer miembro de `native/`, package/lints heredados, un lock. Eliminar solo
   lock y `.gitignore` propios; nada de librerías nuevas.
3. Corte vertical núcleo → Engineer: extender el mismo journal con hechos neutrales tipados (boxes existente,
   vuelta completada, bandera activada/retirada con ámbito, sesión/estado de sesión,
   estado de fuente). Cursor único y registros versionados; v1 de boxes sigue
   legible. Solo comparar fotos consecutivas fiables; primera foto es base,
   saltos de contador/calidad no fabrican vueltas ni retiradas de banderas.
   Transporte de eventos sobre los mismos primitivos Win32 de IPC: ACL de
   usuario/PID/imagen, límite/versionado existente, ACK exacto y plazos/cancelación.
   Dueño I/O separado de adquisición: publica corte inmutable foto+ring con
   ArcSwap, reutiliza el ring hasta que cambie el tail. Si se pierde retención,
   hueco explícito; si falla persistencia, estado degradado y fotos continúan.
   Peticiones acotadas al dueño; nunca esperar ni fsync en adquisición.
4. Verificar y documentar el launcher: habilita Engineer solo mediante opción explícita con checkpoint;
   mismo Job Object, cancelación EOF, supervisión/backoff/presupuesto y orden
   de cierre. Engineer consume el pipe de eventos y checkpointa antes de ACK;
   conserva el banco `--stream`. Pruebas de procesos, pérdida/reconexión, ACK
   incorrecto, recording, source_state y lifecycle; sin audio ni juego físicos.

Señales pendientes se detallan más abajo con unidad/calidad/procedencia, sin
editar `model.rs`. Voz física/Spotter completo siguen pendientes; integrar el
flujo no autoriza afirmar paridad acústica ni presupuestos de rendimiento.

Merge fase 2 verificado: clippy padre PASS (23,56 s); tests padre 442 PASS
incluyendo lifecycle, 4 live ignorados (compilación 2m59s). Engineer fmt/clippy
PASS (6,71 s), 16 tests PASS, 0 ignorados (compilación 1m01s). `fmt --check`
padre FAIL solo en la línea importada de UI; no se modifica UI ni se declara
gate global verde. Sin conflictos, DTO v4 y ambos conjuntos de cambios presentes.

Workspace unificado: `engineer` hereda versión/edición/lints del padre; único
lock padre, solo añade la entrada de paquete Engineer. Lock e ignore propios
eliminados. Clippy completo PASS (33,92 s); tests completos 458 PASS contando
lifecycle, 4 live ignorados (compilación 2m10s). Fmt global sigue FAIL únicamente
en UI importada; las rutas propias cumplen formato. No dependencias nuevas.

## Contratos exactos pendientes del modelo (no implementados)

Cada señal necesita capability/presencia explícita y `Quality<T>`: `Reliable`
solo con esquema admitido, lectura finita/coherente/fresca e identidad correcta;
`Stale` al caducar una lectura anteriormente válida, `Unavailable` si el SDK,
campo o captura no la aporta. `Estimated` nunca habilita avisos de seguridad.
No se solicita añadir campos durante este worker; corresponde al propietario
del dominio/adaptador y a una captura de conformidad por simulador.

| Contrato solicitado / unidad | Consumidor bloqueado | LMU: fuente exacta disponible o pendiente | ACC: fuente exacta disponible o pendiente |
|---|---|---|---|
| `Car.velocity_mps: Quality<WorldVelocity { x_mps, y_mps }>`; m/s, mismo marco de suelo que `Pose`, jugador y rivales | Spotter: filtro de cierre vectorial | Scoring `local_velocity` +288 y orientación +336; jugador telemetry +184/+232. `adapter/lmu/frame.rs:423,461` ya transforma para alinear pose, sin publicarlo como velocidad. Conservar convención neutral, no yaw × velocidad escalar | UDP car update solo aporta velocidad escalar; no acreditar vector de deriva con heading. No hay vector rival admitido en el traductor actual: `Unavailable`, requiere SDK/capacidad y captura nuevos |
| `Car.penalty_count: Quality<u32>`; número pendiente, cero válido | Familia Go de incremento de sanciones | Scoring `mNumPenalties`, int16 +194 (`internal/telemetry/drivers/lmu/layout.go:193`); admitir solo >=0 y por CarId | Evento UDP 6 se conserva como `Other("penalty")` (`adapter/acc/translate.rs:731`); no es contador ni sujeto suficiente. `Unavailable` hasta contrato SDK tipado |
| `Car.pit_stop_count: Quality<u32>`; paradas completadas, cero válido | Conteo de parada/stint futuro; entrada/salida ya funciona | Scoring int16 +192 (`layout.go:192`), no publicado por modelo nativo | No contador admitido en traductor actual; `Unavailable`, no contar automáticamente cada entrada al pit lane |
| `Player.pit_limiter_active: Quality<bool>`; booleano, falso válido | Avisos de limitador | Sin campo admitido en parser nativo actual; confirmar campo telemetry del SDK y captura antes de publicarlo, hoy `Unavailable` | Sin campo admitido en traductor actual; confirmar physics del SDK y captura antes de publicarlo, hoy `Unavailable`. `in_pits` de graphics +160/+1236 no equivale a limitador |
| `Car.pit_service: Quality<PitServiceState>`; enum `Requested/Servicing/Completed/None`, y `remaining_s: Quality<f64>` en segundos si el SDK lo informa | Servicio de boxes completo; no necesario para entrada/salida | Extended/PitInfo histórico experimental no cableado (`docs/telemetry-core/engineer-rescue-matrix.md:26`); mensajes Extended no constituyen enum fiable ni duración. `Unavailable` hasta fuente/captura admitida | No estado/duración de servicio admitido en traductor actual; `Unavailable` hasta señal SDK tipada y captura. Pit lane/velocidad cero no demuestran servicio |
| `Session.race_limit: Quality<RaceLimit>`; enum `Time { end_s }/Laps { total }`, segundos en reloj de sesión o vueltas | Guardia de timings equivalente a Go: distingue end time observado cero de ausencia | `adapter/lmu/frame.rs:69,176` admite `end_time_s`; debe conservar su calidad y semántica de cero. Go `internal/families/timings.go:14–30` exige esa distinción; no deducirla por `remaining_s` ausente | Traductor actual no acredita el modo de límite como contrato propio; usar solo SDK/captura que lo pruebe, hoy `Unavailable` para esta familia |

No faltan campos para vuelta completada, entrada/salida, flags con ámbito o
cambio de sesión/fuente: este corte usa `laps`, `in_pits`, `flags`, sesión y
`source_state` del DTO v4. No solicita un segundo bus ni señales sintéticas.
Tipo/duración de sanción (DT/SG), micrófono/wake, estrategia de parada y swaps
quedan fuera de la paridad mínima: contador no autoriza inferir ninguna de ellas.

## Integración productiva y límites comprobables

Estado final del corte 4: integración funcional implementada y verificada;
entrega local lista para revisión de Opus, aceptación global de formato
**bloqueada** por `native/ui/src/app.rs:385`, heredado de fase 2 y excluido
expresamente. El propietario de UI debe aplicar el formato y repetir fmt
global. No se declara la fase completa/paridad física ni todos los gates verdes.
Notion no disponible: excepción GitHub explícita de Isaac, sin simular seguimiento.

Hito 4 añade cuatro escenarios reales de lifecycle Engineer (reinicio aislado,
dos reintentos exactos, colgado/parada por plazo y muerte por Job), manteniendo
los siete existentes. Añade además `core_e2e`: `vantare-core.exe` reproduce la
captura real LMU de 44 coches, emite SourceChanged Live→Stale, el cliente recibe
foto/ID coherentes y watermark durable, el archivo contiene hecho v3 y EOF
cierra el dueño. Es replay real; no prueba física del juego en marcha.

Gates finales en `native/`, offline y compilación limitada a `-j 2`:

```text
cargo fmt --check
FAIL (exit 1): solo ui/src/app.rs:385, formato importado; no tocar UI.
cargo fmt -p vantare-runtime -p vantare-engineer -p vantare-ipc -- --check
PASS: rutas propias.
cargo clippy --workspace --all-targets --offline -j 2 -- -D warnings
PASS (exit 0), 11,68 s.
cargo test --workspace --offline -j 2
PASS (exit 0), 472 tests incluyendo 11 escenarios lifecycle; 4 live ignorados.
Compilación 25,13 s; los 4 ignorados requieren LMU/ACC físicos.
git diff --check
PASS.
```

Salida literal local: `C:/tmp/vf-fase3-fmt-final.log`,
`C:/tmp/vf-fase3-clippy-final.log`, `C:/tmp/vf-fase3-test-final.log`.
No dependencias nuevas, unsafe nuevo cero. Después de merge fase 2 no hay
diff propio en adaptadores, modelo, DTO v4, UI ni Hub.

Ficheros de la ampliación (no incluye los recibidos de fase 2):

- `native/Cargo.toml`, `native/Cargo.lock`, `native/README.md`.
- `native/engineer/Cargo.toml`, `README.md`, `src/{lib,main,radio}.rs`,
  `tests/{lifecycle,radio}.rs`; eliminados su `Cargo.lock` y `.gitignore`.
- `native/ipc/src/{lib,pipe}.rs`: exposición de los mismos primitivos e imagen.
- `native/runtime/src/core/mod.rs`, `service.rs`,
  `bin/vantare-core.rs`, `bin/vantare/main.rs`.
- `native/runtime/src/flows/{mod,journal,recording,wire,tests}.rs`;
  nuevos `{event,host,client,facts_tests,transport_tests}.rs`.
- `native/runtime/tests/{core_e2e,lifecycle}.rs` y este microplan.

Para verificar manualmente, usar el ejemplo de `native/README.md` con un
checkpoint exclusivo y binarios de la misma revisión. Sin `--engineer` solo
nacen núcleo/overlays. `--parar` cierra Engineer antes de overlays/núcleo;
`--recording` es opt-in. No se ha abierto ninguna UI durante los tests.

Preguntas pendientes para sus propietarios: admitir las señales exactas de
la tabla anterior por cada SDK/captura; confirmar assets/voces Kokoro por locale
y escucha física; medir coste de historial largo y juego/CPU/OBS en la campaña
correspondiente. No bloquean este cableado, sí Spotter/sanciones/pitstop completo
y paridad acústica. Append/fsync de archivo no es cancelable por Win32 Event;
el watchdog de cierre del núcleo (4 s) y el plazo del launcher acotan la vida
del proceso, sin prometer fsync exitoso en un disco colgado.

Hito 3 implementado: hechos neutrales, dueño I/O, named pipe, Engineer y hook
opt-in del launcher. Gates completos: `cargo clippy --workspace --all-targets
--offline -j 2 -- -D warnings` PASS (13,05 s); `cargo test --workspace --offline
-j 2` PASS, 467 tests incluyendo 7 escenarios lifecycle, 4 live ignorados
(compilación 1m39s). `cargo fmt --check` FAIL solo por el formato importado de
`ui/src/app.rs:385`; rutas propias formateadas, sin editar UI. No librerías
nuevas, unsafe nuevo cero, ninguna red externa ni secretos. El hito 4 completa
la verificación específica del tercer hijo y el handoff final descritos arriba.

Un mismo cursor identifica todos los hechos. Boxes JSONL v1 sigue legible;
hechos v3 son enums cerrados, base de recording v2 sin cambio. La entrega de
hechos amplía el envelope v1 con tag 2: consumidores anteriores lo rechazan
explícitamente; desplegar núcleo/Engineer de la misma revisión y DTO v4.
Se omiten flags `Other` del journal tipado (permanecen íntegros en foto); sin
contrato de tipo/sujeto no se emite sanción. Vuelta completada es solo jugador,
contador fiable +1; no se reconstruyen vueltas perdidas ni tiempos por IPC.

Adquisición publica foto y ring inmutables por ArcSwap, retención 256 por lado;
solo copia ring al cambiar tail. El dueño I/O replica IDs, lee JSONL y confirma
append/fsync fuera de adquisición. 8 clientes, 8 peticiones, una entrega por
ACK y canal receptor de 1. Si el dueño pierde el prefijo, Retention explícito y
recording Degraded; no bloquear adquisición para prometer cero pérdida. Leer
historial hace scans JSONL: queda por medir coste con archivos largos; no se
atribuye el presupuesto físico CPU/juego a este banco.

`vantare-core --recording R.jsonl` activa recording al arrancar; por defecto off.
`EventHost::set_recording` prueba/controla on/off fuera de adquisición. No hay
control Hub en este corte. Error al abrir un archivo solicitado falla arranque;
error después de arrancar degrada recording sin detener fotos. Reinicio recupera
prefijo durable y declara frontera; ACK tras checkpoint no garantiza un audio
exactamente una vez ante muerte/corte eléctrico.

Verificación automática: cambios fiables y negativos por calidad/identidad;
recording mixto/reinicio/cursor; disco lleno y fsync fallido inyectados; named
pipe real con imagen, reconexión, on/off, ACK adelantado, consumidor parado y
cancelación; proceso Engineer real recibe hecho de Core y checkpointa antes del
aviso. Fixtures sintéticas explícitas ejercitan estas fronteras; no son LMU/ACC
físicos ni escucha acústica. Juego, assets/voces y distribución siguen siendo
acciones de Isaac; ninguna red, descarga, secreto o gasto durante este corte.

## Histórico de los cortes 1–3 (anterior a la ampliación autorizada)

Fecha: 2026-09-30. Contrato: ADR 0099 completa, §2–4 y §7;
[issue #1428](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1428).
Worker Codex; revisión final del diff por Claude Opus 5.5. Base proporcionada
por el orquestador: `abcf10acdbb6500eabdbb88f20e6ed568bb484e4`, integración
de fase 2; rama `vantareapp/isa-1428-fase3-eventos-engineer`, worktree limpio.
No se cambia esa base ni se hace push, PR o merge. Isaac autoriza expresamente
GitHub solo porque Notion no está disponible: seguimiento Notion pendiente,
sin atribuir UUID/VAN ni afirmar su actualización.

## Inventario necesario (lectura de esta base)

El ejecutable Go ya no tiene `app*.go` en la raíz; el cableado vive en
`cmd/vantare/`. Se conservan el producto y sus contratos, sin editarlos.

| Función actual | Evidencia (ruta:línea) | Datos y frontera |
|---|---|---|
| Arranque y voz cache-only | `cmd/vantare/main.go:2270,2290–2299` | EngineerService + caché Kokoro; voice host separado; no sintetiza en carrera |
| Radio ordenada y acotada | `internal/radio/message.go:47–80`, `internal/radio/bus.go:56–105` | ID, intent, sujeto, cuatro locales, prioridad, TTL; 64 pendientes; ACK de inicio y preempción Spotter |
| Engineer desde el canónico | `internal/engineer/service/engineer_service.go:245–295` | Puerto async de telemetría, radio, Spotter y familias; rollbacks legacy separados |
| Cinco familias actuales | `internal/families/engine.go:31–58,92–132` | fuel, penalties, laps, timings, pitstops; disponibilidad por señal, reset ante identidad/frescura |
| Boxes | `internal/families/pitstops.go:22` | Transiciones confirmadas y ACK; no interpretar ausencia como fuera de boxes |
| Spotter | `internal/spotter/producer.go:103–141`, `internal/spotter/geometry/geometry.go:7–13,98–142` | Geometría, mínimo 10 m/s, largo 4,5 m, ancho 1,8 m, histéresis; P0 y TTL 3 s |
| TTS/cache | `internal/tts/cache.go:26–59`, `internal/engineer/audio/router.go:55–58,159` | SHA-256(locale NUL voice NUL texto), MP3, caché por proveedor; lookup sin motor en ruta productiva |
| Player Windows | `internal/engineer/audio/player_windows.go:47–78,107–178` | Proceso PowerShell/WPF, cancelación y medio local validado; no se copia ese proceso al hot path nativo |
| Entrada de voz | `internal/engineer/voiceinput/runtime.go:47–80,139–160`, `process_host.go:334` | PTT/wake experimental, proceso de micrófono; no demuestra backend WASAPI/Whisper empaquetado |
| Presentación frontend | `docs/engineer/radio-output-contract.md:13–48,52–77`, `frontend/src/engineer/engineer-presentation-store.ts` | Backend manda TTL/generación; audio/visual/both/disabled; no segunda cola en widgets |
| Voz acordada | `docs/ideas/rework-ingeniero.md:30–41`, `docs/engineer/catalog-v1.md:15` | Kokoro local batch, assets versionados; es/en/it/pt-BR; espeak futuro sujeto a licencia y escucha humana |
| Continuidad | `docs/vantare-program/handoffs/engineer-spotter.md:25–47` | Reparación de rutas Windows; audio acústico y LMU físico pendientes |
| Journal nativo existente | `native/runtime/src/flows/journal.rs:15–65,103–182`, `recording.rs:28–117` | Boxes jugador, cursor/ACK, memoria 256, fsync explícito, journal JSONL v1; no flag recording dinámico |
| Núcleo/IPC | `native/runtime/src/core/mod.rs:101–120,164–174`, `native/runtime/src/service.rs:34–41`, `native/ipc/src/subscriber.rs:24–78` | Core genera journal antes de foto; pipe solo latest-wins de fotos; observar nunca hace I/O |

## Objetivo y cortes verticales

Conservar la API pública de fase 1 y completar la semántica automática de la
fase 3: cursor, hueco, recording on/off, error de disco y consumidor lento.
Engineer separado consume únicamente fotos y hechos neutrales. Ninguna regla
depende del simulador. No inferir adelantamientos, boxes ni stint entre fotos
IPC latest-wins, al reiniciar o a través de un hueco.

1. **Journal configurable (commit propio).** Añadir opt-in/out explícito y
   estado activo/desactivado/degradado. Base de segmento durable al activar
   tarde: el prefijo volátil anterior no se graba retroactivamente. Conservar
   lectura de eventos ya confirmados al desactivar. JSONL v1 sigue legible;
   registro adicional versionado de base declara intervalos sin grabación.
   Tests de activación tardía, varias transiciones y reapertura, retención,
   cursor independiente, escritura y fsync fallidos (incluido error de disco
   lleno inyectado, sin llenar el disco de Isaac). Memoria acotada; fsync y
   apertura siguen siendo operaciones explícitas fuera de adquisición.
2. **Contrato de consumo y Engineer (commit propio).** Envelope JSON acotado
   con foto DTO existente, tail coherente, estado de recording y entrega
   individual; cursor/ACK explícito. Codec neutral en `flows/`; nada en
   `ipc/`. Worker nuevo `native/engineer/`, proceso sin UI que checkpointa
   cursor antes de ACK, valida coherencia y deduplica; hueco resetea historial
   desde foto sin emitir una transición. Tests con pipes anónimos heredados
   entre procesos reales ejercitan el codec y reinicio del consumidor; esos
   pipes son banco de frontera, **no sustituyen el named pipe de producto**.
   Se mide trabajo efectivo con contadores/test, no se atribuyen presupuestos
   de CPU a pruebas bajo compilación concurrente.
3. **Radio/Spotter/voz local (commit propio).** Familia boxes por eventos;
   fuel/flags por estado actual y Spotter por posiciones fiables, velocidad
   y estado de boxes; TTL, deduplicación, cola finita y prioridad Spotter.
   La geometría se prueba por separado; el Spotter audible queda bloqueado
   mientras falte la velocidad vectorial de oponentes (ver abajo).
   Cuatro locales del catálogo. Voz más sencilla: WAV PCM pregenerado Kokoro,
   player Win32 `PlaySoundW` asíncrono, parada/preempción, sin TTS runtime.
   Reutilizar textos propios; caché de clips cerrada por intent/locale, no
   fingir compatibilidad con MP3 hash Go. Ausencia de clip es degradación
   visible, nunca síntesis ni OneCore como fallback inventado. Tests de
   reglas/TTL/calidad/gaps/cola/caché; no emitir audio real en tests.
4. **Integración de producto (bloqueada por propiedad de rutas).** Exportar
   desde IPC la conexión de eventos con ACL, PID/imagen, versionado, plazos
   y ACK; publicar foto+tail desde el mismo turno del escritor; dueño único
   de recording fuera de adquisición; registrar Engineer en launcher y en
   workspace. El servicio/launcher/IPC/manifiesto raíz pertenecen a otros
   workers: NO se editan aquí. Hasta este corte no se declara la fase cerrada.

## Fronteras y dependencias

Solo se modifican `native/runtime/src/flows/`, `native/engineer/` y este
microplan. Series se conserva para fase 4. Sin cambios en widgets, kit,
`model.rs`, `ipc/`, `runtime/src/core/`, adaptadores, producto Go o frontend.
El crate Engineer usa `domain`, `ipc` (foto DTO/Subscriber existente),
`runtime::flows` (tipos neutrales/codec) y `runtime::shutdown` (cierre compartido): evita duplicar
cursor, journal y codec. No invoca adaptadores ni Core en producción. Aislamiento
es de proceso; no se introduce otra abstracción de telemetría. En el futuro el
orquestador puede mover el codec a `ipc` sin cambiar el wire.

El crate tiene workspace local para no modificar `native/Cargo.toml` compartido.
Se ejecutan sus gates aparte **además** de los del workspace padre; el orquestador
debe incorporar miembro y lock al integrar. Dependencias: ninguna librería nueva
de terceros; `serde_json` y `windows-sys` ya fijadas por el workspace. Añadir el
crate propio sí se justifica por aislamiento de fallos/voz bajo demanda (ADR §3).
Alternativa en núcleo descartada: audio/I/O no pertenecen a adquisición.

## Porte y límites

Se portan boxes, avisos de combustible bajo y banderas presentes, geometría
Spotter y salida de radio mínima. Las familias históricas se recuperan por
hechos, no por diferencias entre fotos coalescidas. Penalties necesita señal
común tipada de sanciones; pitstop completo necesita limitador/servicio de boxes;
timings requiere contrato de consultas y reloj; laps históricos necesita eventos
de cierre canónicos: se solicitan abajo y no se inventan señales. Wake/PTT/STT,
Kokoro batch regenerado, Strategy/Pit Manager, UI Hub/radio y migración de caché
MP3 quedan fuera de este corte: gates humanos, activos o fases propias.

## Riesgos, preguntas y bloqueos

- **IPC/launcher/workspace:** el orquestador debe asignar el hook named pipe y
  el lifecycle del worker al propietario de esas rutas. No hay transporte de
  eventos productivo en la base; no basta un Subscriber de fotos para recuperarlos.
- **Modelo:** solicitar `penalties` tipado con calidad/ámbito; limitador y estado
  de servicio de boxes; eventos de vuelta/posición/stint del núcleo. No editar
  `model.rs` ni deducirlos de ausencia o saltos.
- **Spotter:** `internal/spotter/producer.go:194–199,213` exige velocidades
  vectoriales fiables del jugador y del oponente para filtrar tráfico con
  cierre excesivo; `Car` nativo solo tiene pose, y `Player` velocidad escalar.
  Solicitar `Car.velocity_mps: Quality<WorldVelocity>` (dos componentes SI
  en el mismo marco que Pose) y capability. No inferir velocidad de fotos
  coalescidas. Sin esa señal se porta/testea geometría pero no se anuncia
  Spotter audible seguro ni paridad completa. Este bloqueo no impide boxes,
  fuel, banderas ni la salida de clips.
- **Voz:** confirmar assets Kokoro WAV PCM y voces por locale; escucha perceptual
  de Isaac pendiente. Sin assets no hay voz audible aceptada. No gastar ni descargar.
  [Microsoft documenta WinMM como API legacy](https://learn.microsoft.com/en-us/windows/win32/multimedia/using-playsound-to-play-waveform-audio-files)
  y recomienda WASAPI/Audio Graphs para código nuevo cuando sea posible. Aquí
  se elige el player mínimo de clips por ausencia de streaming/micrófono,
  device routing y ACK acústico; no se promete esa paridad. Si la aceptación
  exige dispositivo seleccionable o plazos acústicos estrictos, sustituir el
  player en una tarea acotada con prueba física; no ampliar este corte a un
  motor multimedia. `SND_NODEFAULT` impide el sonido por defecto.
- **Persistencia:** búsqueda lineal existente por evento tiene techo conocido;
  perfilar con corpus representativo antes de añadir un índice. Tests de fallos
  de disco son inyección determinista, no prueba de disco físico lleno/corte eléctrico.
- **Rendimiento:** mediciones de producto seriales por el orquestador, con LMU/OBS;
  no claims de p95 acústico, CPU ni frame time desde fixtures o tests.

## Verificación por hito

Desde `native/`: `cargo fmt --check`,
`cargo clippy --workspace --all-targets -j 2 -- -D warnings`,
`cargo test --workspace -j 2`. Engineer: mismos comandos en `native/engineer/`,
con `--offline` para no añadir red. Jobs nunca >2. Cada commit local en español
lleva `(ISA-1428)` y `Co-Authored-By: GPT-6.1 Sol <noreply@openai.com>`.
Registrar resultados y tests ignorados; los tests físicos ignorados no son PASS.

## Evidencia de ejecución

- Inventario y microplan preparados antes de tocar Rust. Gates iniciales PASS:
  fmt exit 0; clippy workspace/all-targets offline `-j 2 -D warnings` exit 0
  (2m51s de compilación); test workspace offline `-j 2` exit 0 (7m41s de
  compilación). 4 pruebas live ignoradas (2 runtime, 1 grabadora LMU, 1 ACC);
  arquitectura, corpus/oráculo y los 7 escenarios de lifecycle PASS.
- Corte 1: PASS fmt, clippy workspace/all-targets offline `-j 2 -D warnings`
  (4,45 s), test workspace offline `-j 2` exit 0 (387 PASS contando lifecycle,
  4 live ignorados; compilación incremental 20,88 s). Focal: 22 flujos PASS.
  Se corrigió el nombre del getter señalado por clippy; ninguna supresión.
  Dependencias de terceros nuevas: 0. `set_recording` conserva la API existente.
- Corte 2: PASS fmt y clippy en ambos workspaces. Padre: 390 PASS y 4 live
  ignorados, compilación test 12,65 s, clippy 5,83 s. Engineer: 3 escenarios
  PASS (procesos, restart, dedup atrasado, 11 confirmados, huecos, checkpoint,
  corrupción y EOF), 0 ignorados; compilación 1,81 s, ejecución 0,28 s.
  El crate propio se justifica por aislamiento de proceso; bibliotecas de
  terceros nuevas: 0 (serde_json existente fijado al lock). `wire` es contrato
  y banco heredado, no se declara integración named pipe ni fase aceptada.
- Corte 3: PASS fmt, clippy workspace/all-targets offline `-j 2 -D warnings`
  y test workspace offline `-j 2` en ambos workspaces. Padre: 390 PASS
  contando los 7 escenarios lifecycle, 4 live ignorados; clippy 6,78 s y
  compilación test 4,59 s (también hubo espera por lock de caché). Engineer:
  16 PASS, 0 fallos/ignorados; clippy 1,27 s y compilación test 3,66 s;
  radio 10 casos/0,01 s, lifecycle 2/0,45 s, recovery 3/0,86 s y CLI 1.
  Tiempos de gates, **no benchmark ni evidencia de presupuestos**.
  Named pipe de fotos: reusa Subscriber de producto, fija imagen Core hermano,
  consume fuel/flags y cierra por EOF/Ctrl+C. Tests de proceso ejercitan EOF
  antes de conectar y rechazo por imagen de publicador sintético (dos conexiones
  acreditan rechazo/reintento). No demuestra Core empaquetado ni launcher.
  Radio: una cola de 8, FIFO/prioridad/preempción Safety, TTL, calidad/sujeto,
  cuatro locales, no repetir condición estable y retirar con revisión congelada
  500 ms, gap/identidad/pérdida de evidencia. Geometría aislada de voz; clips
  ausentes son visibles; PCM/malformados se prueban sin reproducir audio.
  Dependencia directa de `windows-sys 0.61.2` justificada por WinMM; misma
  librería/versión del padre, feature Audio, **0 terceros nuevos**. Dos llamadas
  unsafe confinadas a `voice/win.rs`, ambas con SAFETY; 0 unwrap en producción.
  No se edita el manifiesto/lock padre ni modelo/core/IPC/launcher.

## Estado de entrega y siguiente acción del orquestador

Cortes 1 y 2 entregados en `e4b272db` y `8fd73005`; inventario/microplan previo
en `da3a9dc3`. Corte 3 listo para revisión local. **Fase 3 no aceptada aún**:
corte 4 bloqueado por las rutas reservadas y voz/Spotter por sus dependencias.
No hay actualización Notion, push, PR, CI remoto, merge, release o promoción.
La issue GitHub #1428 fue leída; este documento es evidencia técnica local,
no afirma haber sustituido el seguimiento operativo del proyecto.

Preguntas/encargos concretos para desbloquear, sin ejecutar en este worktree:

1. Asignar servidor de eventos con ACL/PID/imagen, handshake y plazos/ACK,
   corte foto+tail coherente y dueño de persistencia fuera de adquisición.
   Conectar el codec existente en vez de deducir hechos del pipe de fotos.
   Añadir flag recording y alta del proceso/cancelación en launcher.
2. Integrar `engineer` como miembro del workspace padre y consolidar lock;
   mantener gates del workspace local hasta hacerlo. Conectar JSONL radio a
   presentación nativa (TTL/generación), sin segunda cola de selección.
3. Solicitar al dueño del modelo `Car.velocity_mps` y capability; sanciones,
   limitador/servicio y eventos históricos tipados. Spotter audible, laps,
   penalties/timings y pitstop completo quedan bloqueados, no implementados
   con heurísticas de fotos latest-wins.
4. Isaac: assets Kokoro normalizados, licencias/voces es/en/it/pt-BR y escucha;
   luego prueba física Core/LMU/OBS y presupuestos seriales. No generación,
   gasto, descarga, micrófono ni audio físico ejecutados aquí.

Reproducción: ejecutar los tres gates en `native/` y en `native/engineer/`
con `--offline -j 2` en clippy/test. Focales: `cargo test -p vantare-runtime
--lib flows --offline -j 2` desde padre; `cargo test --test recovery --test
radio --test lifecycle --offline -j 2` desde Engineer. Para comprobar cierre
manual sin Core, `'' | .\native\target\debug\vantare-engineer.exe --pipe
--pipe-name vantare-engineer-manual-absent`: estado no disponible y salida 0,
sin audio. Voz real se verifica solo tras autorizar/proporcionar assets; no
se presenta ese comando de cierre como aceptación de una sesión real.

Delta total Rust frente a la base: **+2.920 líneas incluyendo tests**; el corte
3 añade 13 rutas/modificaciones locales. Aumenta por añadir journal/codec y
proceso inexistente: se mantiene una cola, un checkpoint y el DTO existente, sin índice,
framework async, decoder/TTS ni renderer paralelo. Los tests son bancos
sintéticos identificados, con archivos/procesos/named pipe reales y plazos.
