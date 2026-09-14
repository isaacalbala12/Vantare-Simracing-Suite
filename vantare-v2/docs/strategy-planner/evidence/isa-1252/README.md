# ISA-1252 — presupuesto agotado en escenarios meteorológicos

## Resultado

`SolveWeatherScenariosContext` conserva la diferencia que ya produce SolverV2:
si la búsqueda termina por el límite de candidatos o iteraciones, devuelve
`ErrorOverflow`; reserva `ErrorInfeasible` para un escenario sin plan factible.

## Evidencia

- RED: un escenario seco resuelve con el presupuesto normal, pero al limitar la
  búsqueda a un candidato devolvía `infeasible`.
- GREEN: los límites de candidatos y de iteraciones devuelven `overflow`.
- El caso de control sigue demostrando que el mismo escenario es factible.
- La corrección sólo inspecciona `candidate_budget_exhausted` e
  `iteration_budget_exhausted`, razones existentes del resultado de SolverV2.
- El resto de resultados no factibles conserva `ErrorInfeasible`.

## Límites

No cambia presupuestos, búsqueda, solución parcial, protocolo ni UI. No se abrió
app/Wails/LMU ni se tocaron archivos DuckDB.
