# ISA-1210 — presupuesto de preparación de sesiones largas

Estado: mejora acotada local; sesiones de resistencia mayores siguen pendientes. Rama `vantareapp/isa-1210-strategy-long-sessions`, base `bfc4c0c0` de ISA-1331. No se abrió la aplicación ni se intervino LMU.

El lector de correcciones conservaba un presupuesto global de 1.000.000 muestras y 1.000.000 valores. El banco real actual abría/importaba las carreras S266 Algarve y S026 Monza, pero `withCorrectionInput` devolvía `ErrTelemetryAnalysisTooLarge` antes de preparar la revisión. Recuento de tablas requeridas en copias privadas DuckDB de sólo lectura, sin consultar reserva #1030:

| Preparación expuesta | Muestras requeridas | GPS Time | Resultado antes |
|---|---:|---:|---|
| S125 Imola | 626.191 | 377.162 | PASS |
| S266 Algarve | 1.138.082 | 685.492 | Límite |
| S026 Monza | 1.002.172 | 603.631 | Límite |

La corrección fija presupuestos independientes de 1.250.000 muestras y 1.500.000 valores; se mantienen paginación, cancelación y rechazo explícito al superar cualquiera de los límites. No se altera el parser, el original ni los criterios de calidad. En el mismo equipo, el recorrido S125 original alcanzó ~453 MiB de working set; S266 con 1,5 M/1,5 M de prueba alcanzó ~837 MiB. El presupuesto final de S266 (1,25 M/1,5 M) recorre la misma cantidad de datos; no se extrapola ese consumo a todas las máquinas ni se afirma que cubra una carrera de 24 horas. Los límites siguen siendo un coste alto de memoria y la preparación por streaming queda pendiente antes de llamar completo al flujo de resistencia.

Con el presupuesto final, `TestRecordedStrategyRealDuckDB` sobre S266/objetivo S026 pasa: 70 fronteras válidas y una inicial incierta; ritmo seco `valid` 95,190 s (N=58); Fuel `valid` 2,135 L/vuelta (N=58); VE LMP2 no aplicable; evento supuesto de 60 min/90 L/40 s produce 38 vueltas, cero paradas y `optimality=proven` **dentro del modelo**. Los hashes originales permanecen `6b912640e5b68da087fbe86ce70401101edbdc89cb89cb93df30c9ef396d9362` y `08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538`.

Monza Hypercar llega a referencias válidas al superar el límite: ritmo 97,559 s (N=53), Fuel 2,876 L/vuelta (N=53), VE 3,328 puntos/vuelta. El cálculo del mismo evento supuesto **falla** por `iteration_budget_exhausted`: 76.237 candidatos, 100.000.001 iteraciones, 42.933 estados podados, ~3,68 s dentro de SolverV2. [Issue #1367](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1367) trata ese fallo por separado. No se presenta como óptimo ni como validación empírica.

El banco opt-in es una prueba real de integración Go con authorizer controlado, no QA Wails/distribución ni carrera observada con reglas verificadas. #1030 conserva pendiente la anotación independiente y la reserva de carreras completas. #1331/T22 conserva pendiente el recorrido nativo con este backend.

Verificación local: banco S266 final PASS 106,31 s; `pnpm --dir frontend build` PASS para generar los assets embebidos; `go test ./internal/app ./internal/telemetryanalysis -count=1` PASS; `go test -p 1 ./... -count=1` PASS. El primer `go test ./...` sólo falló en el setup de `cmd/vantare`/`frontend` porque el worktree nuevo no tenía `frontend/dist`; después del build, una pasada paralela tuvo dos fallos de temporización en Launcher/Updater no relacionados con este cambio. Ambos tests pasaron por separado y la suite completa secuencial pasó. No se repitió la suite frontend, typecheck ni lint porque no se modificó frontend; la build sí pasó. Sin push, PR, CI remota, merge, promoción ni release.
