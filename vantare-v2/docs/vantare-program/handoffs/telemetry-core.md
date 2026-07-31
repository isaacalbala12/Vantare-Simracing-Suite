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

- Proyecto Linear: `Telemetry Core — Modular Runtime & LMU`.
- Base final de ISA-105 / TC-07A:
  `3b44d36713213ab642f47174c1b5d8234362cac0`.
- Rama:
  `vantareapp/isa-105-tc-07a-proyeccion-overlay-y-shadow-comparator`.
- Plan TC-07A:
  `docs/superpowers/plans/2026-07-31-isa-105-tc-07a-overlay-shadow-comparator.md`.
- Commit de plan publicado:
  `a42c0c5`.
- Matriz de preflight:
  `docs/telemetry-core/overlay-shadow-matrix.md`.
- Promoción: ninguna; la cadena permanece en ramas de issue.
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
- TC-07A.1 ISA-129: D0-D6 aceptados. D7 está implementado y pendiente de
  veredicto independiente. Overlay v1 conserva versión y claves base; añade
  campos opcionales de sesión, scoring, fuel, gaps y self-delta/history. Los
  dos goldens prueban old/old, old/new, new/old y new/new sin relajar el
  decoder. Adapter y comparator consumen solo señales demostradas; flags,
  equipo, número, compuesto, weather y daños siguen missing. Focal Go x20,
  Telemetry Core completo, frontend 297 archivos/2.019 tests, lint focal y
  build pasan. D5 implementó el mapper canónico
  `Observation → Batch`: fixture real 44/44, identidad opaca por slot y
  generación, jugador/header coherentes cuando existe y limpieza segura al
  desaparecer, sesión/epoch literal según §2.4 y commit de estado únicamente
  tras aceptación del sink. El adapter real del `DriverManager` y el reloj
  duradero conservan continuidad y detectan resets entre reconexiones. Focal
  x20, Telemetry Core y suite Go global serial pasan. Review independiente
  final `APPROVE`, P0/P1/P2/P3 = 0. D4B capturó y
  hash-pinned LMU 1.4
  real en menú y pista, ha probado los ocho solapes SHM/REST —incluido circuito
  antes de anonimizar— y ha habilitado únicamente `1.4.0.0` mediante file y
  product version coincidentes. Lector productivo opt-in `live` PASS. Sin
  derivaciones, wiring, PR, merge ni promoción todavía.
- TC-07B–TC-09: pendientes.

No existe wiring productivo del nuevo reducer/derivaciones. Gaps y delta ya
tienen inputs, algoritmo, fixture real y proyección demostrados en D6-D7, pero
no pueden considerarse live hasta cerrar el harness único D8 y los gates D9.
La suite global de ISA-37
pasó después de generar `frontend/dist`; `go vet` conserva tres avisos heredados
de `unsafe.Pointer` en readers Win32.

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
- **P3 heredado:** tres avisos `unsafe.Pointer` Win32 en vet.
- **P2 operativo:** Nightly/Testers no existen; ISA-121 bloquea promoción.
- **P2 funcional conocido:** falta el harness único D8 y los gates D9 antes de
  cualquier shadow wiring/cutover.

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
| En progreso | ISA-129 / TC-07A.1; D0-D6 aceptados, D7 en review independiente |
| Pendientes | ISA-106–117 e ISA-87 según dependencias y cierre de ISA-129 |

## Siguiente acción exacta

Cerrar la review independiente de D7. Si queda limpia, commit/push y ejecutar
D8: un único harness determinista LMU → Parse/Fusion → BatchMapper → Reducer →
SessionCoordinator → Derive → Overlay v1 → decoder/adapter. Completar D9 antes
de desbloquear ISA-106.

## Gate final

TC-09 exige Core, recording, Overlay y Engineer simultáneos; soak automatizado
de dos horas; sesión LMU real; reconexión; frecuencia/drops/latencia; teardown;
y evidencia para Isaac.

## Última actualización

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
