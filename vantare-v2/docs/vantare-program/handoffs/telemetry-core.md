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
- Base de ISA-101 / TC-06A:
  `4801dced7f93ab13ef639f01c3c4e6e9790b5d8c`.
- Rama:
  `vantareapp/isa-101-tc-06a-auditoria-de-almacenamiento-y-esquema-historico`.
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
- TC-05C ISA-41: implementación completa; pendiente review independiente.
- TC-06A ISA-101: auditoría, benchmark, ADR y esquema implementados; hallazgos
  de la segunda re-review corregidos y pendientes de nueva verificación. No hay
  backend productivo.
- TC-06B–TC-09: pendientes.

No existe wiring productivo del nuevo reducer/derivaciones. Gaps y delta
permanecen `missing` hasta tener inputs demostrados. La suite global de ISA-37
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
- Bench ISA-38 fechado: snapshot escalar 231,1–251,6 ns/op y hecho
  129,1–136,2 ns/op, ambos 0 B/op/0 allocs; snapshot con copia de 64 vehículos
  3,753–5,432 µs/op, 16.384 B/op y 1 alloc.
- **P3 heredado:** tres avisos `unsafe.Pointer` Win32 en vet.
- **P2 operativo:** Nightly/Testers no existen; ISA-121 bloquea promoción.
- **P2 funcional conocido:** gaps/delta siguen missing hasta demostrar inputs.

## Issues

| Estado | Issues |
|---|---|
| Cerradas | ISA-23–37, incluyendo ISA-96/97/100 según Linear |
| En revisión | ISA-38 / TC-04D, implementación aceptada técnicamente |
| Cerrada técnicamente | ISA-39 / TC-05A, re-review `ACCEPT` |
| Cerrada técnicamente | ISA-40 / TC-05B, re-review `ACCEPT` |
| En review técnico | ISA-41 / TC-05C |
| Pendiente re-review | ISA-101 / TC-06A |
| Pendientes | ISA-102–117 e ISA-87 según dependencias |

## Siguiente acción exacta

Ejecutar re-review de ISA-101 / TC-06A sobre correcciones de payload fact,
privacidad tipada, integrity/access mode y accepted por boundary. No iniciar
TC-06B, añadir SQLite al `go.mod`
principal, hacer wiring, commit/push/PR o cambiar Linear hasta cerrar ese
review y recibir la dirección aplicable.

## Gate final

TC-09 exige Core, recording, Overlay y Engineer simultáneos; soak automatizado
de dos horas; sesión LMU real; reconexión; frecuencia/drops/latencia; teardown;
y evidencia para Isaac.

## Última actualización

2026-07-30, ISA-101 / TC-06A implementada sobre
`4801dced7f93ab13ef639f01c3c4e6e9790b5d8c`. Auditoría primaria, benchmark
aislado, resultados crudos, fallos/recuperación, ADR 0005 y esquema v1 listos
para review independiente; sin backend productivo ni entrega remota.
