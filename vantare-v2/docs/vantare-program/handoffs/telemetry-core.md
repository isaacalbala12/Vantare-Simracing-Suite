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
- Base de ejecución:
  `08836514d973e7833db8a58720e0aae38c47e746`, entrega ISA-38 apilada sobre
  GOV-01 y la cadena anterior.
- Rama: `vantareapp/isa-39-tc-05a-proyecciones-versionadas-por-producto`.
- Promoción: ninguna; la cadena permanece en ramas de issue.
- TC-01–TC-03: cerrados.
- TC-04A ISA-35: cerrado.
- TC-04B ISA-36: cerrado.
- TC-04C ISA-37: implementado y presente en la base.
- TC-04D ISA-38: implementado, entregado y presente en la base.
- TC-05A ISA-39: cerrado técnicamente; correcciones del primer review
  aceptadas sin P0/P1/P2/P3.
- ENG-03 ISA-127: adaptación pura de la proyección Engineer implementada sobre
  TC-05A mediante composición explícita con ENG-02; pendiente review.
- TC-05B–TC-09: pendientes.

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
- ISA-127 reutiliza el único `ProjectorV1`, `PayloadV1`, `Metadata` y
  `VersionPolicy` de TC-05A. La capa Engineer añade solo su `Context`,
  `Manifest`, `Field` y `ObservationV1`; no crea transporte, wiring ni otro
  envelope. Guía: `docs/engineer/projection-adapter.md`.
- La verificación ISA-127 mantiene focal/árbol projection/Engineer/vet/race y
  frontend build en verde. La pasada Telemetry volvió a exponer una ejecución
  load-sensitive heredada de
  `TestDriverDoesNotPublishOrMutateRESTAfterCancellation`; aislado x20 pasa.
  No hay cambios bajo `drivers/lmu`.
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
| Siguiente | ISA-40 / TC-05B |
| Pendientes | ISA-40–41, ISA-101–117 e ISA-87 según dependencias |

## Siguiente acción exacta

ISA-40 / TC-05B debe envolver estas proyecciones en Wails/SSE con full
snapshot y resync, sin serializar el snapshot canónico ni duplicar contratos.
En paralelo, el review de ISA-127 debe confirmar que la adaptación Engineer no
introduce otra versión, envelope o semántica de gaps.

## Gate final

TC-09 exige Core, recording, Overlay y Engineer simultáneos; soak automatizado
de dos horas; sesión LMU real; reconexión; frecuencia/drops/latencia; teardown;
y evidencia para Isaac.

## Última actualización

2026-07-29, ISA-39 / TC-05A cerrada técnicamente e ISA-127 / ENG-03
implementada localmente; adaptación Engineer pendiente de review.
