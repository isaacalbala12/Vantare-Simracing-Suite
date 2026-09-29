# Fase 3 — Eventos y Engineer (ISA-1428)

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
El crate Engineer usa `domain`, `ipc` (foto DTO existente) y `runtime::flows`
(tipos neutrales/codec, adaptadores privados inaccesibles): evita duplicar
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
