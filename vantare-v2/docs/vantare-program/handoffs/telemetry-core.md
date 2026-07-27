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
- Base apilada: ISA-37, SHA
  `44c7513499f1ab88ebf1aedbc02d3b8e5feda99e`.
- Rama: `vantareapp/isa-37-tc-04c-derivaciones-ordenadas-acotadas-y-versionadas`.
- Promoción: ninguna; la cadena permanece en ramas de issue.
- TC-01–TC-03: cerrados.
- TC-04A ISA-35: cerrado.
- TC-04B ISA-36: cerrado.
- TC-04C ISA-37: implementado sobre
  `44c7513499f1ab88ebf1aedbc02d3b8e5feda99e`; `In Review`.
- TC-04D ISA-38: siguiente corte.
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
- **P3 heredado:** tres avisos `unsafe.Pointer` Win32 en vet.
- **P2 operativo:** Nightly/Testers no existen; ISA-121 bloquea promoción.
- **P2 funcional conocido:** gaps/delta siguen missing hasta demostrar inputs.

## Issues

| Estado | Issues |
|---|---|
| Cerradas | ISA-23–37, incluyendo ISA-96/97/100 según Linear |
| Activa | ISA-37 en `In Review` |
| Siguiente | ISA-38 / TC-04D |
| Pendientes | ISA-39–41, ISA-101–117 e ISA-87 según dependencias |

## Siguiente acción exacta

ISA-38 / TC-04D: fan-out latest-wins para snapshots y stream ordenado para
hechos sobre ISA-37, métricas/soak/teardown, sin Wails/SSE, UI, recording ni
cutover. Base exacta: SHA de ISA-37. Checks: microplan, Core, global Go, race,
benchmark y diff-check. Después ISA-39, ISA-40 e ISA-41.

## Gate final

TC-09 exige Core, recording, Overlay y Engineer simultáneos; soak automatizado
de dos horas; sesión LMU real; reconexión; frecuencia/drops/latencia; teardown;
y evidencia para Isaac.

## Última actualización

2026-07-27, ISA-120, Codex orquestador.
