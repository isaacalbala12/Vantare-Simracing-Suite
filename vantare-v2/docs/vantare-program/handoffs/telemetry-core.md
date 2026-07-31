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
- Base apilada de ISA-105: ISA-104 / TC-06D, SHA
  `3b44d36713213ab642f47174c1b5d8234362cac0`.
- Rama:
  `vantareapp/isa-105-tc-07a-proyeccion-overlay-y-shadow-comparator`.
- HEAD publicado D1–D5: `f2a1ac3`.
- Promoción: ninguna; la cadena permanece en ramas de issue.
- TC-01–TC-03: cerrados.
- TC-04A–D y TC-05A–C: cerrados técnicamente en la cadena apilada.
- TC-06A–D: cerrados técnicamente; ISA-104 está `In Review`.
- TC-07A ISA-105: D1–D5 completos; D6 review/entrega activo.
- TC-07B–TC-09: pendientes.

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
| En ejecución | ISA-105 / TC-07A, D1–D5 publicados en `f2a1ac3`; D6 activo |
| Nuevo bloqueo previo a shadow | ISA-129 / TC-07A.1 |
| Pendientes | ISA-106–117 e ISA-87 según dependencias |

## Siguiente acción exacta

Cerrar D6 de ISA-105 / TC-07A: review adversarial del delta completo, PR draft
contra ISA-104 y estado `In Review`. Después ejecutar ISA-129 / TC-07A.1 para
parrilla/timing/gaps/delta/sesión/unidades y retirar el fallback mock conectado
antes de ISA-106. Sin CSS, canvas, renderers, regeneración de baselines ni
cutover productivo.

## Gate final

TC-09 exige Core, recording, Overlay y Engineer simultáneos; soak automatizado
de dos horas; sesión LMU real; reconexión; frecuencia/drops/latencia; teardown;
y evidencia para Isaac.

## Última actualización

2026-07-31, ISA-105 D1–D5 aprobados y publicados en `f2a1ac3`. Cobertura real:
18/18, con un exacto, cinco parciales, once no comparables y un externo. La
evidencia sanitizada conserva 2 widgets, 31 campos, 19 iguales y 12 diferencias
explicadas; tres capturas y hashes verificados. Go telemetry/app, frontend
297/1.993, build y Playwright pasan. Visual Crystal falla al 100 % también en
la base exacta y el benchmark incumple umbrales en ambas ramas; no se tocaron
ni regeneraron baselines, canvas o renderers. Review D5 `APPROVE`,
P0/P1/P2/P3 = 0. D6 activo; ISA-129 sigue siendo la siguiente dependencia.
