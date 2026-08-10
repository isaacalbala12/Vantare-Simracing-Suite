# Handoff vivo — Telemetry Core

## Resultado

Un único núcleo live modular y neutral al simulador. El driver LMU posee Shared
Memory y REST local como fuentes complementarias. Overlay, Engineer, Strategy
y Analysis consumen proyecciones versionadas y nunca abren readers propios.

## Autoridad

- `docs/adr/0004-telemetry-core-modular-observation-architecture.md`.
- `docs/telemetry-core/README.md` y su evidencia.
- `docs/superpowers/plans/2026-07-19-telemetry-core-final-architecture-master.md`.
- Microplan activo y Linear.

## Estado real

- ISA-160 / TC-10A convierte la auditoría Strategy live en evidencia
  ejecutable sin modificar producción. Un test E2E recorre la fixture real
  sanitizada LMU 1.4 por Driver/Fusion/BatchMapper/Reducer/Derive con una sola
  apertura de `LMU_Data` y demuestra Fuel `83.80992715710434/115 L`, observed
  y fresh, para el vehículo activo. El ledger test-only v1 cierra 18 keys:
  Fuel, pit y progreso supported; VE, identidad/compound/wear/corner de tyres y
  weather unsupported y ausentes de Observation/estado canónico. Allowlists
  exactas cubren Observation/core/Strategy v1, catálogo y capabilities; las
  filas supported se contrastan además con layout, AuthorityMatrix v4,
  catálogo, TTLs y Derive. La identidad player/per-vehicle es
  `lmu-slot-N-generation-G`: G incrementa tras desaparición/reaparición y
  vuelve a 1 al resetear sesión; REST no crea identidad. El smoke LMU fresco
  pasa con build `1.4.0.0` supported, runtime live,
  `PlayerPresent=false` y fingerprint
  `active-grid-bijective;telemetry=not-required-no-player`, sin raw ni PII.
  Solo Fuel/lap number player-only se acreditan missing mediante ese smoke;
  pit/progreso se sostienen en fixtures y tests. RED por golden ausente y RED
  posterior por identidad incompleta quedaron observados antes de GREEN; focal
  x20 y Telemetry Core pasan. La instalación frontend congelada terminó con
  exit 0 sin cambios tracked y el build pasó. La primera suite Go global falló
  solo en `TestCoordinatorWithSQLiteDrainsAndReleasesAllHandles` por `recording
  commit exceeded budget`; el test pasó 10/10 aislado y la segunda suite global
  pasó completa. El flake queda registrado, pero no se atribuye a ISA-160,
  cuyo delta no toca recording/coordinator. `gofmt` y diff-check pasan; vet
  reproduce exactamente los dos avisos heredados de `unsafe.Pointer`. Tras el
  rebase sobre `origin/nightly@b1db9f8`, la implementación es `87b451b`. La
  instalación frontend congelada, build, focal x20, Telemetry Core y suite Go
  global pasan post-rebase. El draft PR #202 permanece abierto hacia `nightly`;
  Linear ISA-160 está actualizado con
  comentario, evidencia y enlace, y sigue `In Progress` porque el equipo no
  dispone de estado `In Review`. CI sigue pendiente y no se declara verde. Sin
  merge, promoción ni release.
- ISA-311 corrige el flake del soak lógico sin modificar el runtime: el test
  sigue recorriendo Overlay, Engineer, recording coordinator y SQLite reales,
  pero usa un reloj lógico fijo y un adapter de writer test-only con deadline
  global de 30 s para que la latencia del disco compartido no se confunda con
  el presupuesto temporal por operación. El límite real de 500 ms y sus
  regresiones permanecen intactos. El reloj aislado reveló todavía 1/20 cierres
  por contexto; la solución completa pasa soak 20/20, regresiones temporales
  20/20, build frontend y `go test ./... -count=1` sobre
  `origin/nightly@ff286f4`. Los HEAD `6ac6f9e`, `756315d` y `0a1e750` pasaron
  sin rerun los runs `31416018600`, `31416779711` y `31435630710`. PR #200 se
  promovió por rebase a `nightly@54f267b`; Linear refleja ISA-311 en `Nightly`.
  `testers`, `master` y release permanecen fuera del alcance.
- Proyecto Linear: `Telemetry Core — Modular Runtime & LMU`.
- Stack técnico final aprobado: `170eaebbaa6744019ead96a2c78201b4da2fb9bb`.
- Promoción ISA-171 / TC-09G completada en
  `nightly@c5eb3c906bc0f93a747adac13f3efcc9f731f8b9`.
- La protección de `nightly` prohíbe merge commits. El commit lineal promovido
  conserva exactamente el árbol aprobado `e63c54fb4db2a848e296ca06d92d90fdbc2b3c96`
  y registra como procedencia el stack `170eaeb`; rollback mediante revert del
  commit `c5eb3c9`.
- La simulación encontró solo tres conflictos documentales de gobernanza; cero
  conflictos de código. `testers` y `master` están fuera del alcance.
- Gates de integración frescos: Go bloqueante completo, ISA-118 focal,
  frontend bloqueante 1.978/1.978, build, cutover/shadow Playwright, 7/7
  fuzzers, soak/lifecycle, replays, benchmark, auditoría de consumidores y dos
  sistemas visuales pasan. El canvas conserva la flake externa ISA-172 y no se
  modifica en este corte.
- PR #65: el primer CI bloqueó correctamente una equivalencia válida de rutas
  Windows 8.3/largas en `diagnostics`. La corrección mínima usa identidad real
  del directorio, conserva los guards contra reparse points y convierte los
  errores ignorados del test en fallos explícitos. El segundo CI confirma ese
  paquete verde y expone la misma comparación textual en la frontera del
  catálogo Wails; se aplica el mismo contrato de identidad y una regresión 8.3.
  El timeout del spy permanece en 2 s para no ocultar el fallo. Review
  independiente, CI del PR y gate post-promoción `30729804412`: PASS.
- El inventario detallado siguiente conserva la historia técnica de cada corte.
- Follow-up Strategy live: ISA-160 / TC-10A audita las señales y ISA-161 /
  TC-10B produce/cablea `StrategyLiveProjection v1`; ambas están bloqueadas
  detrás del gate final de Telemetry Core y no reabren la adquisición LMU.
- TC-01–TC-03: cerrados.
- TC-04A ISA-35: cerrado.
- TC-04B ISA-36: cerrado.
- TC-04C ISA-37: implementado y presente en la base.
- TC-04D ISA-38: implementado, entregado y presente en la base.
- TC-05A ISA-39: cerrado técnicamente; correcciones del primer review
  aceptadas sin P0/P1/P2/P3.
- TC-05B ISA-40: cerrado técnicamente tras re-review `ACCEPT` sin
  P0/P1/P2/P3.
- TC-05C ISA-41 y TC-06A ISA-101: cerrados en la base aprobada de ISA-102.
- TC-06B ISA-102: implementación completa y tercera review `ACCEPT` sin
  P0/P1/P2/P3 conocidos. No hay wiring productivo.
- TC-06C ISA-103: dos reviews finales `ACCEPT`, P0/P1/P2/P3 = 0; los hallazgos
  iniciales y los tres casos límite posteriores quedaron corregidos y están
  cubiertos por regresiones repetidas.
  Replay permanece exclusivamente en tests/harness y migraciones productivas
  no tienen pasos mientras v1 sea el único schema real. El test heredado de
  cancelación REST dejó de usar el ticker productivo y pasa x100 de forma
  determinista; el runtime LMU no cambió.
- TC-06D ISA-104: implementación y gates D7 completos; preparada para entrega
  apilada sobre ISA-103.
  Catálogo metadata-only, inspector local, paquete sanitizado byte-exacto,
  eventos Wails correlacionados, cancelación acotada, UI responsive e
  internacionalizada, captura raw limitada y tap LMU sin wiring productivo.
  Reviews integradas backend y UI: `ACCEPT`, P0/P1/P2/P3 = 0.
- TC-07A ISA-105: implementación y re-review D6 completas; código final
  `f6b43b7`, `ACCEPT`, P0/P1/P2/P3 = 0. PR draft `#41`; Linear `In Review`.
- TC-07A.1 ISA-129: D0-D8 aceptados y publicados; D9 ha cerrado la evidencia
  real y está en gates/review final. Overlay v1
  conserva versión y claves base; añade
  campos opcionales de sesión, scoring, fuel, gaps y self-delta/history. Los
  dos goldens prueban old/old, old/new, new/old y new/new sin relajar el
  decoder. Adapter y comparator consumen solo señales demostradas; flags,
  equipo, número, compuesto, weather y daños siguen missing. Focal Go x20,
  Telemetry Core completo, frontend 297 archivos/2.020 tests, lint focal y
  build pasan. El harness D8 recorre una captura real LMU 1.4 de 38 vehículos
  por Driver/Fusion -> BatchMapper -> Reducer -> SessionCoordinator -> Derive
  -> Overlay v1, con una apertura/cierre y bytes idénticos en 20 ejecuciones.
  El trace real Delta de 1.846 muestras atraviesa la cadena canónica y el mismo
  golden exacto consumido por decoder/adapter TypeScript. Reorder, vacancy y
  generación, reset de sesión, cambio de jugador y freshness completo se
  prueban como transiciones controladas, no como evidencia real adicional. El
  cruce corrigió arrays vacíos `null` a `[]`. D9 añade una secuencia real
  sanitizada `InPit=false -> true -> false` dentro de la misma sesión —sin
  inferir garaje, box, pit lane o fase de parada— y un ciclo
  real connected -> disconnected -> reconnected sin payload desconectado. D5
  implementó el mapper canónico
  `Observation → Batch`: fixture real 44/44, identidad opaca por slot y
  generación, jugador/header coherentes cuando existe y limpieza segura al
  desaparecer, sesión/epoch literal según §2.4 y commit de estado únicamente
  tras aceptación del sink. El adapter real del `DriverManager` y el reloj
  duradero conservan continuidad y detectan resets entre reconexiones. Focal
  x20 y Telemetry Core pasan. Review D8 final `APPROVE`, P0/P1/P2/P3 = 0. D4B capturó y
  hash-pinned LMU 1.4
  real en menú y pista, ha probado los ocho solapes SHM/REST —incluido circuito
  antes de anonimizar— y ha habilitado únicamente `1.4.0.0` mediante file y
  product version coincidentes. Lector productivo opt-in `live` PASS. Sin
  derivaciones, wiring, PR, merge ni promoción todavía.
- TC-07B ISA-106: shadow Wails/SSE implementado sobre ISA-129. Legacy conserva
  autoridad de render; Studio/Desktop/OBS observan el contrato canónico sin
  dirty ni mutaciones visuales. Gates Go, frontend y Playwright verdes.
- TC-07C ISA-107: cutover implementado. Overlay Projection v1 es la única
  fuente alcanzable de Studio/Desktop/OBS; el runtime legacy dejó de arrancar.
  Código legacy inerte se elimina en TC-09, no durante el cutover.
- TC-08A ISA-108: auditoría 30/30 completa. La matriz vigente está en
  `docs/telemetry-core/engineer-capability-audit-isa-108.md`. No cambia
  comportamiento ni elimina funcionalidad. Confirma que sesión, grid, fuel,
  pit, laps y gaps son proyectables, mientras flags, engine, tyre, damage,
  conditions y driver swaps deben quedar deshabilitados sin capability.
- TC-08A.1 ISA-130: geometría implementada y verificada antes de ISA-109.
  World position, orientation y local velocity atraviesan el core con
  evidencia LMU real; los offsets y tests sintéticos legacy no se usan como
  autoridad. Suite global, repeticiones, fuzzing y benchmarks pasan; los dos
  avisos Win32 de vet son heredados.
- TC-08B ISA-109: proyección y entrada pura implementadas. El payload contiene
  sesión, parrilla completa, fuel, gaps y geometría con calidad explícita. Se
  reutiliza el contrato ENG-02/03 aprobado, incorporado como segundo padre de
  la rama; no se arrastran su UI ni sus assets de investigación. No hay wiring.
- TC-08C ISA-110: matriz ejecutable 21/21 y bridge replay fail-closed.
  Spotter normal, fuel, contador genérico de sanciones, laps, timings y
  entrada/salida de pit tienen escenarios de paridad. El resto permanece
  parcial o disabled; no hay wiring productivo.
- TC-08D ISA-111: runtime Engineer separado de toda fuente live/sintética;
  entrada canónica acotada por familia, todavía sin wiring LMU productivo.
- TC-08E ISA-112: cutover productivo implementado. El único runtime LMU
  publica estado, observación y hechos hacia Engineer; Engineer no abre un
  reader propio y sus errores quedan aislados de Overlay. La captura real de
  38 coches demuestra la cadena completa y ausencia de falsos Spotter ante
  tráfico lejano. ISA-113 detectó que el shell aún abre otro grafo legacy.
- TC-09A ISA-113: auditoría completada. El runtime canónico es único productor
  de Overlay/Engineer, pero `app.New(-live)` todavía abre una adquisición LMU
  y REST legacy para status/diagnostics/ops. ISA-114 debe migrarlos y retirarla.
- TC-09B ISA-114: implementación completa en revisión. El composition root ya
  no crea `app.App` ni un segundo reader/poller. Status, diagnostics y ops usan
  `TelemetryCoreRuntime`; solo el driver canónico contiene APIs de adquisición
  LMU. El backend legacy y sus CLIs quedan retirados.
- TC-09C ISA-115: implementación completa en revisión. Un único decoder/mapper
  Overlay y lifecycle compartido para Wails/SSE; eventos, adapters y selector
  shadow legacy retirados sin cambiar UI.
- TC-09D ISA-116: implementación y review completadas. Fuzzing de siete
  fronteras, métricas payload-free, benchmarks de la cadena y soak lógico de
  dos horas con 64 vehículos, seis consumidores, Engineer y SQLite pasan.
- TC-09E ISA-87: lifecycle productivo y harness Wails/SSE cerrados; shutdown
  ordenado, hotkeys Win32 corregidos y owners de recursos verificados.
- TC-09F ISA-117: gate técnico final cerrado. Auditoría, fuzz, replay, soak,
  lifecycle, frontend, Playwright, Crystal y evidencia LMU real pasan. Isaac
  aprobó el checklist humano y la issue quedó `Done`; su promoción controlada
  continúa exclusivamente mediante ISA-171.

Existe wiring productivo canónico para Overlay y Engineer. Gaps, delta, pit y
reconexión tienen inputs, algoritmo, fixtures reales y proyección demostrados.
No queda otro corte de implementación de Telemetry Core. La siguiente acción
es la validación integrada Nightly/Pro Plus y la recogida de feedback antes de
considerar cualquier paso a `testers`; `master` permanece fuera de alcance.
`go vet` conserva tres avisos heredados de `unsafe.Pointer` Win32; ISA-118 e
ISA-131/ISA-94 poseen la deuda externa.

## Decisiones

- Preferencia por señal, no autoridad global entre Shared Memory y REST.
- Cero es legítimo; missing/stale/invalid no se inventan.
- Raw en memoria; persistencia solo con consentimiento.
- LMU usa sus archivos históricos y no duplica recording por defecto.
- Reducer single-writer sin I/O; derivaciones lineales/versionadas/acotadas.
- Replays raw, canónicos e históricos son niveles distintos.
- Mocks/simulator solo en harness explícito.

## Evidencia y riesgos

- ISA-37: focal x20, Core, guard ADR, race, fuzz 10 s, benchmark, frontend
  build y suite global Go en verde.
- ISA-38: fan-out sin goroutines, snapshot latest-wins de capacidad uno, log de
  hechos compartido/acotado y resync explícito; tests de soak 20.000, lectores
  concurrentes y 1.000 cierres simultáneos. El cursor causal, teardown
  cancelado, métricas de dos lectores y agotamiento máximo tienen regresiones.
  Focal x20, Telemetry completo, race focal x5 con GCC UCRT64, vet focal, build
  frontend y suite global Go PASS tras la corrección; re-review ACCEPT.
- ISA-39: cuatro proyecciones v1 pequeñas, golden JSON, calidad/presencia
  explícitas, capabilities por producto y versiones canonical/projection/
  recording independientes. La frontera corregida y aprobada es
  `core -> derive -> projection`; Overlay publica `controls.history` sin
  duplicar el tipo derivado. Sin transporte o wiring. ENG-02 debe consumir el
  contrato `projection/engineer` y no duplicar envelope/versioning. Focal x20,
  Telemetry, guard ADR, vet, race x5 y frontend build PASS. Global conserva la
  contención Windows conocida de settings. Una pasada intermedia mostró una
  ejecución load-sensitive del teardown REST LMU; Telemetry final y el focal
  aislado x20 pasan, y ninguna ruta del driver está en el diff.
- ISA-39 review: los campos del jugador ausente ya no usan el zero-value de Go;
  serializan calidad `unknown/missing` explícita en Engineer, Strategy y
  Analysis. El guard de arquitectura rechaza imports entre subárboles de
  productos y conserva únicamente raíz común + árbol propio.
- ISA-40: hub local sin wiring global, full obligatorio, delta RFC 7396
  equivalente y opcional, resync full ante late join/reconnect/gap/consumer
  lento, status separado y coherente por `statusRevision`, facts con secuencia
  independiente y adapters Wails/SSE con JSON idéntico. Constructors tipados y
  sello privado impiden sustituir los `PayloadV1` por canonical/final/raw.
  Cada hub y envelope quedan aislados por `ProductID`; Wails y SSE comparten
  nombre namespaced y JSON. Epoch solo avanza, facts comprueba continuidad
  desde `after` y el delta se reseala. Límite duro de 256 KiB; SSE
  loopback-only. Focal x20, vet focal, race x5,
  Telemetry, guard ADR, frontend 1851/1851, build y suite global Go PASS.
  Benchmark full de 64 vehículos: 258–303 µs/op, ~128,7 KiB/op y
  1.964–1.965 allocs/op.
- ISA-41: decoder/store TypeScript compartido para cuatro productos, payloads
  opacos y versión v1. Status/snapshot coherentes, full de resync, delta
  continuo, facts con cursor independiente y teardown compartido. Harness
  explícito sin ruta productiva; golden Go consumidos por tests. Un fixture
  compartido fija rutas, eventos, estados y límites en Go y TypeScript. Focal
  36/36, frontend 1.887/1.887, build, lint focal, TC-05B Go x20 y proyecciones
  Go y suite global Go PASS. El primer review quedó corregido: reframe
  coherente tras cambio de status, extensiones seguras, cap duro de 256 KiB y
  attach/teardown transaccionales; pendiente re-review independiente.
- ISA-101: benchmark aislado con exactamente los mismos bytes sanitizados para
  framing, SQLite modernc y MCAP. Cinco repeticiones nominal/4×/ráfaga y una
  de 24 h lógica conservaron counts, cursor y SHA-256; queries de rango/cursor,
  crecimiento y tamaños quedaron en CSV. Throughput de cierre se separa de
  checkpoints/RPO.
- ISA-101 crash/recovery: kills deterministas cubren antes de append, antes de
  commit, después de commit/antes de manifest y después del replace. En el
  límite intermedio SQLite/framing recuperan DB `240` con watermark `200`;
  before-append conserva accepted `200`; opening/recording/recovering reinician
  incomplete sin mezclar `accessMode`. Accepted es volátil: no hay ACK durable
  por lote ni pérdida exacta inferible. MCAP no ofrece commit parcial y sigue
  `NO-GO` autoritativo; su recovery CLI upstream no quedó verificado localmente.
- ISA-101 packaging: probes CGO=0 PASS para framing, SQLite y MCAP; DuckDB
  bloqueado por build tags CGO y ausencia de `gcc`. Build base Wails CGO=0
  PASS. SQLite queda `GO` condicionado a TC-06B; MCAP candidato condicionado
  para intercambio/replay; DuckDB y
  framing propio `NO-GO` autoritativo.
- ISA-101 checks: tests del módulo x5 para framing/SQLite/MCAP y tags combinados,
  vet por candidato, builds CGO=0, Telemetry completo, suite Go global, frontend
  build, Wails Windows, invariantes de 48 filas/16 digests y `diff --check`
  PASS. Race no está disponible en este host CGO=0 sin `gcc`; frontend test no
  se repitió porque el corte no cambia frontend.
- ADR 0005 y `docs/telemetry-core/historical-storage-schema.md` fijan manifest
  atómico, observed/facts autoritativos, derived reconstruible, raw opt-in
  separado, chunks versionados/CRC, accepted volátil/watermark/committed,
  `RecordingPayloadV1`/`RecordingFactV1` allowlisted con golden y errores
  unknown tipados, integridad/modo de acceso separados, COW con switch solo por
  manifest, versiones futuras read-only y recovery sobre copia.
- ISA-102 materializa ese contrato: puertos neutrales, mapper real
  pseudonimizado, cola no bloqueante, SQLite modernc privado, manifest
  atómico, reader por rangos, recovery COW del bundle DB/WAL/SHM, límites de
  crecimiento y teardown. Crash boundaries, fallos, privacidad, benchmark y
  packaging CGO=0 están en
  `docs/telemetry-core/recording-sink-sqlite-isa-102.md`.
- La primera review de ISA-102 detectó siete inconsistencias confirmadas,
  corregidas sin ampliar alcance: deadlines reales en todas las operaciones,
  fallo terminal sobre Stop, batch v1 con snapshot obligatorio y tiempos
  mixtos, lease Windows cross-process, catálogo FactType único, cursores/reason
  cerrados y validación NaN/Inf/presence. Pendiente re-review independiente.
- La segunda review añadió tres correcciones: ledger RPO exacto para
  checkpoints parciales/epochs, contexto cooperativo hasta la escritura
  atómica del manifest y DSN URI seguro para caracteres reservados/Unicode.
  Casos nuevos x100 y paquete completo x10 pasan. La tercera review read-only
  del orquestador cerró `ACCEPT` sin P0/P1/P2/P3 conocidos. La repetición
  fresca dejó recording y Telemetry Core en verde. La suite Go global falló
  únicamente por la contención Windows heredada de ISA-118 bajo carga; su caso
  focal x20 pasó y la suite global serial posterior quedó completamente verde.
  Vet focal y build Wails Windows con CGO desactivado también pasan; no hay una
  regresión atribuible a TC-06B.
- Bench ISA-38 fechado: snapshot escalar 231,1–251,6 ns/op y hecho
  129,1–136,2 ns/op, ambos 0 B/op/0 allocs; snapshot con copia de 64 vehículos
  3,753–5,432 µs/op, 16.384 B/op y 1 alloc.
- ISA-104 backend: raíz histórica canónica en LocalAppData o data portable;
  toda la cadena rechaza symlinks/junctions/reparse. Prepare/List/Inspect
  comparten máximo dos operaciones, lifecycle de aplicación y cancelación
  correlacionada; cancel-before-request usa TTL 30 s y cap 64 sin goroutine.
  `ProfileService` entrega snapshots defensivos bajo sincronización.
- ISA-104 UI: solo current+ready abre Inspect; future/corrupt/current no
  disponible son metadata-only. El cliente recalcula SHA-256 y tamaño antes de
  preview/copy/download. Los estados no inspeccionados muestran `—` en lugar
  de zero-values desconocidos y el contraste local medido es 4,592:1. Vitest
  focal 64/64, suite frontend 1.923/1.923, build, lint focal y Playwright con
  seis capturas pasan; consola/overflow/procesos residuales en cero. Evidencia:
  `docs/telemetry-core/evidence/isa-104-inspector/`.
- ISA-104 hardening final: la raíz raw valida toda la cadena antes y después de
  crear y rechaza symlink/junction/reparse; Settings/Launcher entrega snapshots
  profundos, incluido `LastLaunchedAt`; el catálogo conserva top-K global
  determinista con más de 500 entradas. Tests junction Windows, focales
  repetidos y race pasan. Suite Go global serial final: PASS.
- **P3 heredado:** seis avisos `unsafe.Pointer` Win32 en vet global; los seis
  archivos son idénticos a la base ISA-105.
- **Deuda heredada reproducida:** ISA-118 conserva historial de flakiness por
  contención Windows de `app-settings.json.tmp`, pero la ejecución global final
  de ISA-129 queda PASS. El lint global conserva 32 errores y 2 warnings fuera
  del área focal; el único error heredado dentro de un archivo tocado se cerró.
- **P2 operativo cerrado:** ISA-121 creó y protegió Nightly/Testers. La
  promoción controlada se ejecuta mediante ISA-171.
- **Gates funcionales ISA-129 cerrados:** pit/outlap, disconnect/reconnect y las
  dos vueltas Delta proceden de evidencia real sanitizada; no hay sustitución
  sintética ni cutover.

## Issues

| Estado | Issues |
|---|---|
| Cerradas | ISA-23–37, incluyendo ISA-96/97/100 según Linear |
| En revisión | ISA-38 / TC-04D, implementación aceptada técnicamente |
| Cerrada técnicamente | ISA-39 / TC-05A, re-review `ACCEPT` |
| Cerrada técnicamente | ISA-40 / TC-05B, re-review `ACCEPT` |
| Cerradas en la base ISA-102 | ISA-41 / TC-05C e ISA-101 / TC-06A |
| Cerrada técnicamente | ISA-102 / TC-06B, tercera review `ACCEPT` |
| Cerrada técnicamente | ISA-103 / TC-06C, dos reviews finales `ACCEPT` |
| Cerrada técnicamente | ISA-104 / TC-06D, reviews integradas `ACCEPT` |
| En revisión | ISA-105 / TC-07A, PR draft `#41`, D6 `ACCEPT` |
| Cerrada técnicamente | ISA-129 / TC-07A.1; D0-D9 aceptados |
| En revisión | ISA-106 / TC-07B, ISA-107 / TC-07C e ISA-108 / TC-08A |
| Cerradas técnicamente | ISA-130 / TC-08A.1 e ISA-109 / TC-08B |
| Cerradas técnicamente | ISA-110 / TC-08C, ISA-111 / TC-08D e ISA-112 / TC-08E |
| Auditoría cerrada | ISA-113 / TC-09A, matriz proof-first sin borrados |
| En revisión | ISA-114 / TC-09B, backend duplicado retirado |
| En revisión | ISA-115 / TC-09C, frontend/transporte legacy retirado |
| Cerrada técnicamente | ISA-116 / TC-09D, hardening y soak `APPROVE` |
| Cerrada técnicamente | ISA-87 / TC-09E, Wails/SSE y teardown integrado |
| Aprobada | ISA-117 / TC-09F, gate final completo en `170eaeb` |
| Completada | ISA-171 / TC-09G, promoción controlada a `nightly@c5eb3c9` |
| Draft PR / Linear In Progress | ISA-160 / TC-10A, implementación reescrita `87b451b` sobre `nightly@b1db9f8`, draft PR #202; CI y aceptación pendientes |
| Backlog follow-up | ISA-161 / TC-10B, productor Strategy live bloqueado por aceptación de ISA-160 |

## Siguiente acción exacta

Verificar CI del draft PR #202 y completar la revisión/aceptación humana de
ISA-160. CI todavía no está declarada verde. Solo después, ISA-161 /
TC-10B puede ampliar aditivamente `StrategyLiveProjection v1` con los campos
canónicos existentes de Fuel, sesión, progreso y pit, sus contract tests
old/new y gates de transporte/resync/replay/soak. VE, tyres y weather siguen
ausentes hasta una issue de evidencia propia. ISA-152 / STR-17 permanece
bloqueada por ISA-161. No hay autorización de merge o promoción.

## Gate final

TC-09 exige Core, recording, Overlay y Engineer simultáneos; soak automatizado
de dos horas; sesión LMU real; reconexión; frecuencia/drops/latencia; teardown;
y evidencia para Isaac.

## Última actualización

2026-08-11, ISA-160: auditoría Strategy live implementada localmente sin
cambios productivos. Fuel real LMU 1.4 atraviesa el pipeline canónico con
calidad observed/fresh; el ledger y sus contrastes ejecutables cierran Fuel,
pit y progreso como supported y VE/tyres/weather como unsupported. La review
de especificación y calidad añadió identidad/generación exacta, allowlists de
v1, oráculos no circulares y la distinción correcta del smoke de menú. RED por
golden ausente y RED por identidad incompleta quedaron seguidos de focal x20 y
Telemetry Core verdes. La instalación frontend congelada terminó con exit 0 y
sin cambios tracked; el build pasó. La primera suite global falló solo en
`TestCoordinatorWithSQLiteDrainsAndReleasesAllHandles` por `recording commit
exceeded budget`; pasó 10/10 aislado y una segunda suite global pasó completa.
El flake queda visible y no se atribuye al delta ISA-160. El smoke LMU fresco
pasó con build `1.4.0.0` supported/live y `PlayerPresent=false`; `gofmt` y
diff-check pasan, y vet conserva exactamente los dos avisos Win32 heredados.
El rebase sobre `origin/nightly@b1db9f8` reescribió la implementación como
`87b451b`. La instalación frontend congelada, build, focal x20, Telemetry Core
y suite Go global pasan post-rebase. El draft PR #202 sigue abierto hacia
`nightly`. Linear ISA-160 se actualizó con comentario, evidencia y enlace al
PR; permanece `In Progress` porque el equipo no tiene estado `In Review`. CI
sigue pendiente y no se declara verde. Sin merge, promoción ni release.

2026-08-01, ISA-117: gate técnico final completado sobre ISA-87 `4233c9f`.
La auditoría demuestra un solo owner LMU y cero rutas legacy productivas. Go
global, siete fuzzers, replay, soak de dos horas, lifecycle x5, frontend
2.016/2.016, build, Playwright cutover/shadow, Crystal 21/21, fixtures LMU
reales x5 y lectura live LMU 1.4 pasan. Cero P0/P1/P2 atribuibles a Telemetry
Core. Deuda externa: ISA-118 e ISA-131/ISA-94; `-race` sin GCC y tres avisos
Win32 vet heredados. Documento, rollback y checklist:
`docs/telemetry-core/final-gate-isa-117.md`. Estado: `In Review`; sin merge ni
promoción.

2026-08-01, ISA-87: status y Overlay Projection v1 coinciden byte a byte entre
el transporte real de eventos Wails y SSE. El composition root posee un
shutdown único y ordenado; Engineer forma parte de él y los hotkeys terminan
su hilo Win32 mediante `PostThreadMessageW`. El harness integrado prueba
SQLite, puerto, suscriptores, goroutines, bridges y owners de handles. Documento:
`docs/telemetry-core/wails-lifecycle-teardown-isa-87.md`. Siguiente: ISA-117.

2026-08-01, ISA-116: siete fronteras pasan fuzzing; métricas runtime/transporte
sin payload; soak lógico exacto de dos horas con 64 vehículos, seis
consumidores, Engineer y SQLite sin rechazos ni crecimiento; benchmarks de
toda la cadena documentados. La validación del Hub conserva seguridad y reduce
el full de 64 vehículos desde 258–303 µs históricos a 47,2–50,5 µs. Go global,
frontend 2.016/2.016, build y Playwright cutover pasan. `-race` queda no
ejecutable por ausencia de GCC; vet conserva tres avisos Win32 heredados.
Documento: `docs/telemetry-core/hardening-isa-116.md`. Siguiente: ISA-87.

2026-08-01, ISA-115: `telemetry:update`, los adapters Wails/SSE antiguos,
`normalizeLegacyTelemetry`, el selector fail-open y el harness shadow runtime
quedan retirados. Studio/Desktop/OBS comparten Overlay Projection v1; el
decoder/mapper autoritativo vive en `overlay/projection` y el comparador
histórico queda no productivo hasta ISA-117. Source status usa un contrato y
eventos `telemetry-core:*` únicos. Documento:
`docs/telemetry-core/frontend-retirement-isa-115.md`. Siguiente: ISA-116.

2026-08-01, ISA-114: status, diagnostics y métricas leen el runtime canónico y
el segundo grafo LMU se retira completo. Solo
`internal/telemetry/drivers/lmu` utiliza APIs de memoria compartida. Engineer
conserva monitores, audio, comandos, Pit Manager y SSE; los readers
experimentales sin wiring se eliminan y las fixtures Extended restantes son
decoders puros sin I/O. Documento:
`docs/telemetry-core/backend-retirement-isa-114.md`. Siguiente: ISA-115.

2026-08-01, ISA-113: la matriz final demuestra que `app.New(true)` todavía
abre el reader y poller REST legacy, aunque ya no publique widgets. El status
visible, diagnostics y ops mantienen ese grafo alcanzable junto al driver
canónico. Se clasificaron backend, Engineer, frontend, transports, fixtures y
tooling con KEEP/MOVE/DELETE y orden de retirada. Cero borrados. Documento:
`docs/telemetry-core/consumer-retirement-matrix-isa-113.md`. Siguiente: ISA-114.

2026-08-01, ISA-112: la composición productiva inyecta `EngineerService` en
`TelemetryCoreRuntime`. Estado de fuente, observaciones y hechos siguen
contratos separados; live no conecta sin datos usables y stale/error/stop
desconectan. Los errores Engineer no interrumpen LMU ni Overlay. El fixture
real LMU 1.4 de 38 coches atraviesa ese runtime con una apertura de `LMU_Data`
y no produce falsos Spotter ante tráfico lejano. ISA-113 encontró otra apertura
legacy en el shell, fuera del runtime Engineer. El solape audible real queda en
el gate manual final. Documento:
`docs/telemetry-core/engineer-cutover-isa-112.md`. Siguiente: ISA-113.

2026-08-01, ISA-111: `EngineerService` ya no construye fuentes. Solo consume
snapshot/hechos canónicos; ejecuta seis familias aprobadas de forma aislada,
resetea por límites y reporta desconectado hasta evidencia real. Suite global
serial y build frontend pasan; race no está disponible con CGO desactivado.
Documento: `docs/telemetry-core/engineer-runtime-separation-isa-111.md`.
Siguiente: ISA-112.

2026-08-01, ISA-110: el replay enumera Spotter + 20 monitores y falla cerrado
para cualquier familia o señal no aprobada. Seis escenarios atraviesan la
proyección canónica y reproducen geometría/transiciones observables; el bridge
solo acepta fresh+supported y no está conectado a producción. Documento:
`docs/telemetry-core/engineer-replay-parity-isa-110.md`. Siguiente: ISA-111.

2026-08-01, ISA-130: posición mundo, velocidad local y orientación se admiten
por vehículo desde el único reader LMU hasta Reducer. La fixture real LMU 1.3
`959c5142…e5ff` demuestra 44/44 filas, matriz right-handed y el signo local
mediante un oráculo independiente. Cero permanece presente; NaN/Inf y matriz
degenerada quedan invalid por campo; la caducidad vuelve stale toda la
geometría. El sanitizador zero-rebuild conserva ya esos spans para una futura
captura 1.4. No se activa Spotter y las fixtures 1.4 anteriores a cero no se
presentan como prueba espacial. Siguiente corte: ISA-109.

Gates finales ISA-130: Telemetry Core x10, focal x20, suite Go global, build
frontend y dos fuzzers pasan. Parse de 44 vehículos: 49,3–53,7 µs/op;
sanitización diagnóstica: 164,5–201,2 µs/op. Vet focal conserva solo dos avisos
Win32 heredados de `unsafe.Pointer`. No hay wiring Spotter ni promoción.

2026-08-01, ISA-129 D9: el harness D8 y el trace Delta real se conservan sin
repetir las vueltas. Cuatro frames LMU 1.4 zero-rebuild cierran una secuencia
`InPit=false -> true -> false` dentro de la misma sesión, sin ampliar el
booleano a etiquetas de garaje/box/pit lane, y la reconexión después
de ausencia completa de proceso/mapping. Los hashes y sidecars se reproducen
x20; la desconexión no contiene payload y el reconnect abre una sesión/epoch
nueva sin aceptar un grid vacío. Los cuatro benchmarks, Telemetry Core,
frontend 297/2.020, build, lint focal y `diff --check` pasan. `-race` sigue no
disponible con CGO desactivado. Mi suite Go global final pasa; la review
independiente reprodujo el P3 Windows heredado ISA-118 de
`app-settings.json.tmp` en global, serial y focal. Está fuera del diff y no se
corrige en ISA-129. Lint global y seis warnings Win32 siguen fuera del área
focal y reproducidos en la base exacta. La review independiente final cerró
`APPROVE`, P0/P1/P2/P3 abiertos = 0, después de endurecer los JSON de evidencia,
forzar el tracking de los cuatro binarios y resolver el ledger sin duplicarlo.
Pendientes solo commit D9, push, PR draft, Linear y ledger global; no hay merge
ni promoción.

2026-07-31, ISA-129 D7 aceptado: contrato Overlay v1 aditivo con dos
goldens y matriz de compatibilidad completa. El decoder normaliza ausencias y
rechaza campos conocidos inválidos; el adapter conserva calidad y no inventa
datos. La matriz 18/18 queda en 2 exactos, 10 parciales, 5 no comparables y 1
externo. El cambio legítimo del payload actualizó el hash del replay canónico y
la expectativa del harness; las suites amplias pasan. Review final `APPROVE`,
P0/P1/P2/P3 = 0. Siguiente acción exacta: D8, sin wiring productivo, PR, merge
ni promoción en este punto.

2026-07-31, ISA-129 D6 aceptado: remaining, gaps relativos y self-delta se
derivan exclusivamente de observaciones canónicas demostradas. La sesión LMU
real queda preservada como fixture sanitizada de 1.846 muestras a 10 Hz, tres
wraps y dos vueltas comparables, con SHA-256
`d8f01beee1380d771e5e29de5dfa9e5de72517e1bf447bc14881ee44df7fe938`.
El test compara contra un oráculo independiente por distancia, fija 100 ms de
incertidumbre y exige una diferencia superior. Focales x20, dos fuzzers de
10 s, Telemetry Core, vet focal, benchmarks y `diff --check` PASS. Review final
`APPROVE`, P0/P1/P2/P3 = 0. Sin proyección Overlay, wiring productivo, PR,
merge ni promoción. Siguiente: D7.

2026-07-31, ISA-129 D5 aceptado: mapper síncrono fuera de cada driver, 44 identidades
estables en la fixture real, sesión/epoch/generaciones atómicos y campos
canónicos completos sin derivaciones. Focal x20, Telemetry Core y suite Go
global serial PASS. Review independiente final `APPROVE`, P0/P1/P2/P3 = 0.
`go test -race` no es ejecutable en este entorno porque Go informa
`-race requires cgo` y `CGO_ENABLED=0`; no se cambió el toolchain para ocultar
el gate. Sin wiring productivo, PR, merge ni promoción.

2026-07-31, ISA-129 D4B: cuatro evidencias LMU 1.4 reales y sanitizadas fijadas
por SHA-256. Pista: práctica, 38 vehículos y jugador; REST live correlacionado.
Los sentinels negativos finitos de lap distance y gaps son `missing`, nunca
cero. La revisión adversarial añadió correlación de circuito mediante digest
privado en memoria y recapturó el par final. Driver y CLI x20, Telemetry Core,
lector opt-in y auditoría de privacidad PASS. La suite Go global reprodujo solo
la contención Windows heredada de `app-settings.json.tmp`; el focal aislado
pasó al repetir y la suite global serial quedó verde. Siguiente: D5. Sin PR,
merge, wiring productivo ni promoción.
