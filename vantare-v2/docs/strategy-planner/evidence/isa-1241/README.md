# ISA-1241 — límites de vueltas por piloto

## Resultado

El paso Pilotos edita `minLaps` y `maxLaps` directamente en
`draft.rules.driverLimits[driverId]`, junto a los límites temporales existentes.
Vaciar un control elimina sólo ese valor; quitar el piloto elimina su entrada.
No se ha creado otro contrato ni se ha modificado SolverV2.

La validación compartida de reglas se aplica a `driverLimits` al avanzar desde
Pilotos. Rechaza vueltas fraccionarias y mínimo superior a máximo; cero sigue
siendo un límite válido y ausencia sigue siendo ausencia.

## Evidencia

- RED: faltaban ambos controles y el paso Pilotos aceptaba 40/12 y 12,5.
- GREEN focal: cinco archivos de test, 74 pruebas.
- Persistencia y parser conservan 12/40 vueltas y 1800/5400 segundos.
- El adapter de cálculo transporta exactamente el mismo `driverLimits`.
- Frontend completo: 448 archivos y 3810 pruebas; typecheck, lint, auditoría
  i18n y build pasan. El build conserva sólo el aviso heredado de chunks grandes.
- Roadmap regenerado desde `plan.md`; diff-check pasa.
- Los 21 tests del contrato de roadmap pasan.
- Review independiente Astra: sin P0–P2 y sin alternativa más simple.

## Límites

Este corte no añade disponibilidad, ventanas de pit, compuestos obligatorios,
semántica de orden, cambios de solver ni validación de app/Wails/LMU.
