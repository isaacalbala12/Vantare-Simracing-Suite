# Evidencia ISA-1227 — T02d2d evento recorded en TypeScript

## Alcance

- Cargas iniciales Fuel/VE en el contrato TypeScript de `calculate_orbit`.
- Adaptación pura del borrador recorded al evento Go ya existente.
- Horizonte por tiempo o vueltas, reglas, reservas y aplicabilidad VE.

Pilotos, ritmos, variantes y ejecución visible quedan para sus cortes del SDD.

## Decisión mínima

Un único mapper produce sólo `input.event`. No añade estado, servicio, comando ni
segunda representación del cálculo. Reutiliza la validación del asistente y
rechaza las ausencias obligatorias antes de alcanzar Go.

## Contrato comprobado

- Cero y ausencia permanecen distintos para cargas y reservas.
- Una carrera por vueltas conserva exactamente la distancia y duración inactiva
  a cero.
- VE desconocida o aplicable sin capacidad/reserva se rechaza.
- VE no aplicable elimina los valores retenidos del formulario.
- El borrador y sus reglas no se modifican.

## Pruebas

- RED: faltaban el módulo mapper y las cargas iniciales del contrato TS.
- Tests focales cliente + mapper: 58 PASS.
- Suite frontend completa: 448 archivos y 3772 tests PASS; Happy DOM imprimió
  su `AbortError` de teardown heredado, pero el proceso terminó en código cero.
- Typecheck, ESLint focal y completo, y build: PASS.
- Roadmap: 23 + 64 tests PASS; artefacto regenerado y `--check` sin cambios.
- Astra high aconsejó el mapper de evento y no construir todavía un input
  completo con ritmos inexistentes.

## Límites

No ejecuta cálculos ni acredita UI, app/Wails/LMU, DuckDB o precisión física.
