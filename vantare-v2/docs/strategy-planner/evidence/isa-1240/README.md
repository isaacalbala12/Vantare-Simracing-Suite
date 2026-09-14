# Evidencia ISA-1240 — T07a límites de conducción visibles

## Alcance

- Pilotos edita máximo continuo y máximo total en minutos.
- El borrador guarda segundos en la autoridad existente
  `rules.driverLimits[driverId]`.
- Vacío elimina sólo el campo editado; quitar un piloto elimina sólo su entrada
  de límites y limpia referencias de ritmo dependientes.

## Decisión mínima

No se amplía el contrato ni se duplican límites dentro de los pilotos. El
componente actualiza el mismo borrador que el asistente ya persiste y el adapter
ya transporta. Dos etiquetas traducidas y un grid responsive completan la UI.

## Pruebas

- RED: la pantalla no aceptaba el borrador completo ni exponía los controles.
- GREEN: 30/90 minutos producen 1800/5400 segundos.
- GREEN: vaciar continuo conserva sólo total; quitar el piloto no deja límite
  huérfano.
- La creación y reapertura por la operación nativa conserva exactamente los
  segundos; el parser del payload también los mantiene.
- El adapter de cálculo conserva el mismo `driverLimits`.
- Focales finales: 57/57 PASS.
- Frontend completo: 448 archivos y 3808 tests PASS. Happy DOM emitió su mensaje
  heredado de aborto durante teardown, pero Vitest terminó con resumen y exit 0.
- Typecheck, lint completo y build: PASS; build conserva el aviso heredado de
  chunks mayores de 500 kB.
- Roadmap regenerado y estable: digest 23/23, Discord 64/64 y contrato 21/21.
- `git diff --check`: PASS.
- Astra high: sin P0/P1/P2; sus dos simplificaciones quedaron aplicadas.

## Límites

No edita todavía límites por vueltas, ventanas, compuestos o disponibilidad. No
decide orden fijado frente a propuesta libre. Sin app/Wails/LMU, DuckDB, push,
PR, CI remota, integración o release.
