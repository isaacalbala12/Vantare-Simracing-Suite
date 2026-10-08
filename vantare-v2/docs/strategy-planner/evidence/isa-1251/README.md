# ISA-1251 — optimalidad opcional validada

## Resultado

El cliente de Strategy valida `optimality` cuando CalculateOrbit lo incluye.
La ausencia conserva la compatibilidad con respuestas antiguas y
`not_proven` se conserva; cualquier valor desconocido o mal tipado se rechaza
en vez de desaparecer silenciosamente.

## Evidencia

- RED: `proven`, `null` y `7` resolvían como respuestas válidas y perdían el
  campo.
- GREEN: los tres valores se rechazan señalando
  `orbitCalculation.plans.s1.optimality`; ausencia y `not_proven` se aceptan.
- El banco usa el cliente productivo y su transporte controlado.
- La producción añade sólo la llamada al `strategyEnum` existente.
- Frontend completo: 448 archivos y 3827 pruebas; typecheck/build, lint y
  auditoría i18n pasan. Los 44 tests de roadmap pasan; el build conserva sólo
  el aviso heredado de chunks grandes.

## Límites

Este corte no define nuevos estados de optimalidad ni completa la taxonomía de
resultado. Tampoco cambia el solver o la UI. No se abrió app/Wails/LMU ni se
tocaron DuckDB.
