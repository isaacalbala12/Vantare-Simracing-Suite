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
- Base apilada entregada: ISA-104 / TC-06D, SHA
  `3b44d36713213ab642f47174c1b5d8234362cac0`.
- Rama:
  `vantareapp/isa-104-tc-06d-inspector-privacidad-y-export-diagnostico`.
- PR draft: `#40`, apilada sobre ISA-103.
- Promoción: ninguna; la cadena permanece en ramas de issue.
- TC-01–TC-03: cerrados.
- TC-04A–D y TC-05A–C: cerrados técnicamente en la cadena apilada.
- TC-06A–D: cerrados técnicamente; ISA-104 está `In Review`.
- TC-07–TC-09: pendientes; ISA-105 / TC-07A es el siguiente corte.

No existe wiring productivo del nuevo reducer/derivaciones. Gaps y delta
permanecen `missing` hasta tener inputs demostrados. La captura raw diagnóstica
de ISA-104 permanece desactivada y sin wiring productivo.

## Decisiones

- Preferencia por señal, no autoridad global entre Shared Memory y REST.
- Cero es legítimo; missing/stale/invalid no se inventan.
- Raw en memoria; persistencia solo con consentimiento.
- LMU usa sus archivos históricos y no duplica recording por defecto.
- Reducer single-writer sin I/O; derivaciones lineales/versionadas/acotadas.
- Replays raw, canónicos e históricos son niveles distintos.
- Mocks/simulator solo en harness explícito.

## Evidencia y riesgos

- ISA-104: catálogo metadata-only, inspector local, export sanitizado
  byte-exacto, Wails correlacionado, UI responsive y captura raw limitada sin
  wiring. Reviews backend/UI `ACCEPT`, P0/P1/P2/P3 = 0.
- Gates finales ISA-104: Go global serial, Telemetry, app, race focal, vet
  aplicable, 1.923 tests frontend, build frontend/Wails y Playwright
  wide/medium/compact en verde. Privacidad y seis capturas verificadas.
- **P3 heredado:** dos avisos `unsafe.Pointer` Win32 en vet LMU normal.
- **Deuda heredada fuera del corte:** lint global con 33 errores y dos warnings.
- **P2 operativo:** Nightly/Testers no existen; ISA-121 bloquea promoción.
- **P2 funcional conocido:** gaps/delta siguen missing hasta demostrar inputs.

## Issues

| Estado | Issues |
|---|---|
| Cerradas | ISA-23–37, incluyendo ISA-96/97/100 según Linear |
| Cerradas técnicamente | ISA-38–41 e ISA-101–103 en la cadena apilada |
| En revisión | ISA-104 / TC-06D, PR draft `#40` |
| Siguiente | ISA-105 / TC-07A |
| Pendientes | ISA-106–117 e ISA-87 según dependencias |

## Siguiente acción exacta

ISA-105 / TC-07A: proyección Overlay y shadow comparator sobre
`3b44d36713213ab642f47174c1b5d8234362cac0`. Debe mapear las proyecciones de
Telemetry Core a los ViewModels existentes, comparar legacy/nuevo por campo y
tolerancias y permanecer únicamente en harness/shadow. Sin CSS, canvas,
renderers, regeneración de baselines ni cutover productivo.

## Gate final

TC-09 exige Core, recording, Overlay y Engineer simultáneos; soak automatizado
de dos horas; sesión LMU real; reconexión; frecuencia/drops/latencia; teardown;
y evidencia para Isaac.

## Última actualización

2026-07-31, ISA-104 cerrada técnicamente y sincronizada en Linear como
`In Review`; commit `3b44d36`, PR draft `#40`, sin promoción. Siguiente ISA-105.
