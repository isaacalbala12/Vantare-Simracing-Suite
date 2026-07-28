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
- Base de ejecución: GOV-01
  `67e263392b2192ee11f2ef4ccb161331dda3c735`, que ya incorpora la cadena
  apilada hasta ISA-37.
- Rama: `vantareapp/isa-38-tc-04d-fan-out-backpressure-observabilidad-y-soak`.
- Promoción: ninguna; la cadena permanece en ramas de issue.
- TC-01–TC-03: cerrados.
- TC-04A ISA-35: cerrado.
- TC-04B ISA-36: cerrado.
- TC-04C ISA-37: implementado y presente en la base.
- TC-04D ISA-38: implementado y review independiente ACCEPT; entrega aislada.
- TC-05–TC-09: pendientes.

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
| Siguiente | ISA-39 / TC-05A |
| Pendientes | ISA-39–41, ISA-101–117 e ISA-87 según dependencias |

## Siguiente acción exacta

Entregar ISA-38. Después ISA-39 / TC-05A debe definir proyecciones versionadas
por producto sobre puertos de lectura, sin adaptar `core` a Wails/SSE y sin
introducir todavía recording o cutover.

## Gate final

TC-09 exige Core, recording, Overlay y Engineer simultáneos; soak automatizado
de dos horas; sesión LMU real; reconexión; frecuencia/drops/latencia; teardown;
y evidencia para Isaac.

## Última actualización

2026-07-28, ISA-38 / TC-04D, Codex orquestador; review independiente ACCEPT.
