# F1.3 — Contrato Vector de decisión e I/O del solver ampliado

**Fecha:** 2026-08-21
**Issue:** #726 (ISA-694 F1.3)
**Owner:** Strategy Solver (`internal/strategy/solver`)
**Estado:** ejecutable desde F4-1 como `strategy.solver.v2`

## Ubicación y justificación

Paquete `internal/strategy/solver` (no `contract`, porque el solver ya es el owner del modelo determinista). Extiende los tipos `Input/Result` existentes con `SolverInputV2/SolverResultV2` en el mismo paquete para compartir `ResourceKind`, `PitCostModel` y `manual.PitStopInput` sin crear un subpaquete artificial. Strategy **sí puede importar** el paquete público de Analysis (`internal/telemetryanalysis/strategyprojection`) y lo hace aquí: `Projection *StrategyInputProjectionV2` y `Observed *ObservedStrategyV1` se consumen por referencia, no se duplican.

## Vector de decisión (spec §5)

- **PitStops[]**: `lap` arbitraria, `fuelLiters`/`vePercent` por servicio, `compound` por stint siguiente, `driver` por stint siguiente, `savingLevel` por stint siguiente, `serviceMode` paralelo/secuencial.
- **Stints[]**: derivado de `pitStops + raceLaps` (len = pits+1), cada uno con `laps`, `compound`, `driver`, `savingLevel`.

## Modelo de coste de pit

`PitCostModel{TransitSeconds, RefuelRateLPerS, VERatePPerS, TyreSeconds, ServiceMode}` compatible con `internal/strategy/manual.CalculatePitStop`: `refuelSeconds = fuelLiters / rate`, `veSeconds = vePercent / rate`; el núcleo es `max(refuel, ve, tyres)` si `parallel` o la suma de los tres si `sequential`; `total = transit+core+repair+penalty`. El solver convierte cantidades a duraciones y delega tránsito, solape y suma final en `manual`.

### Ejecución y discretización F4-1

`SolveV2` parte con Fuel/VE a capacidad y explora paradas tras cualquier vuelta,
sin parada después de meta. En cada parada se cambian neumáticos y Fuel/VE son
cantidades independientes del candidato. El consumo procede de la familia
`valid` de `Projection`; si no existe, se usan los campos manuales
`FuelPerLapLiters` y `VEPerLapPercent`. Estos dos campos completan un defecto del
contrato compile-only: antes declaraba fallback manual sin transportar consumo.

El espacio finito queda fijado por `ServiceDiscretization`:

- Fuel: `0, paso, 2*paso, ...` hasta el hueco disponible; default `1 L`.
- VE: `0, paso, 2*paso, ...` hasta el hueco disponible; default `1 %`.
- No se añade un último valor irregular para llenar el depósito: si no es
  múltiplo del paso, no pertenece al espacio de decisión.
- La precisión interna es `10^-6` de unidad y se admiten como máximo 200 niveles
  por recurso. Así se evitan comparaciones flotantes ambiguas y una
  discretización accidentalmente explosiva.

El solver conserva exactitud mediante programación por vueltas y poda de
dominancia: a igual vuelta, un estado de menor o igual coste con al menos el
mismo Fuel y VE domina al otro. El oráculo de tests enumera sin poda exactamente
las mismas vueltas y cantidades en carreras pequeñas. Los empates se ordenan
por tiempo, menos paradas, vueltas de parada y cantidades Fuel/VE.

## Otros campos del I/O

- **Formation** (`formation.seconds`): coste de formación antes de vuelta 1.
- **EventRules** (`eventRules`): `min/maxPitStops`, `requiredWindows [fromLap,toLap]`, `mandatoryCompounds`, `driverLimits{Min/MaxLaps, MaxTimeSeconds, unavailableWindows}`.
- **ComputeBudget** (`budget.p95Millis`, `maxCandidates`, `maxIterations`): presupuesto p95 como parámetro.
- **Projection/Observed**: familias degradadas D19 referenciadas sin duplicar tipos.

## Resultado

`SolverResultV2{Best DecisionVector, Binding BindingConstraint, Sensitivities[] SolverSensitivity, Expected/WorstCase ScenarioEvaluation, Candidates[], Feasible, Reasons[] SolverReason, ComputeStats{WithinBudget}}`

- **Restricción vinculante**: `binding.kind/message/laps` (qué límite — fuel/VE/tyreLife/driver/event — atasca el largo máximo de stint).
- **Sensibilidades**: por parámetro, `delta` vs `impactSeconds`.
- **Esperado/caso-malo**: `ScenarioEvaluation{total, green, degradation, pit, formation}` rankea por esperado y expone riesgo (spec §5: variantes = misma función objetivo, distinta tolerancia).

## Compatibilidad

- `SolverInputV1` (`Input` con `PitLossSeconds` escalar) sigue válido; `SolverInputV2` y `SolveV2()` son aditivos y no rompen `Solve()` existente. F4-1 ejecuta formación, ritmo/degradación lineal vigente y pit por servicios; compuestos, pilotos, ahorro y clima permanecen en sus extensiones F4 posteriores. Se mantiene `tiempo_total = Σ stints + Σ pit + formación`.
- Si ADR vs spec: gana ADR rev.2 (sin conflicto; ADR §12 firma cubre envelope, no solver).

## Verificación

```bash
go vet ./internal/strategy/solver/...
go test ./internal/strategy/solver/... -run TestSolverInputV2
gofmt -l ./internal/strategy/solver/
```
