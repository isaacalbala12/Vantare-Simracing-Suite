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

### Curva de ritmo por stint F4-2

`SolveV2` selecciona una sola autoridad de coste de stint:

- si `Projection.CombinedStintPaceCurve` está `valid` y declara
  `identifiability=combined_only`, consume sus puntos y conserva en el resultado
  `model`, `provenance`, `confidence` e `identifiability`;
- en cualquier otro estado usa `DegradationPerLap` como curva lineal manual,
  con procedencia `manual`. Así el modo manual sigue siendo un caso particular,
  no un segundo solver.

La edad de vuelta del stint empieza en 1. Entre dos edades observadas se hace
interpolación lineal. Antes del primer punto se conserva su delta, sin inventar
una mejora. Después del último punto se extrapola con una pendiente no negativa
igual al máximo entre la pendiente del último tramo y
`(rangeUpper-rangeLower)/sqrt(N)`, donde rango y N proceden de la confianza de
la curva. Por tanto, poca muestra o mucha dispersión penalizan más el tail y
nunca se prolonga una mejoría aparente fuera del rango observado.

Una curva seleccionada falla cerrada si no tiene puntos, N/rango, edades
positivas y únicas, muestras positivas o valores/rangos finitos. Los puntos se
ordenan por edad y se precalcula el coste acumulado hasta `RaceLaps`; evaluar un
candidato sigue siendo O(1) por stint. El oráculo exhaustivo usa el mismo coste
por tramos sobre su espacio pequeño, pero continúa enumerando sin la poda del
solver.

La sensibilidad pesimista conserva el 20 % del modelo anterior. En una curva
derivada perturba **todos** sus deltas y su rango, vuelve a evaluar el mismo plan
y publica `parameter=combinedStintPaceCurve`; en manual perturba la pendiente
lineal y publica `parameter=degradationPerLapSeconds`. `WorstCase` incorpora ese
impacto sin cambiar la decisión elegida.

## Otros campos del I/O

- **Formation** (`formation.seconds`): coste de formación antes de vuelta 1.
- **EventRules** (`eventRules`): `min/maxPitStops`, `requiredWindows [fromLap,toLap]`, `mandatoryCompounds`, `driverLimits{Min/MaxLaps, MaxTimeSeconds, unavailableWindows}`.
- **ComputeBudget** (`budget.p95Millis`, `maxCandidates`, `maxIterations`): presupuesto p95 como parámetro.
- **Projection/Observed**: familias degradadas D19 referenciadas sin duplicar tipos.

## Resultado

`SolverResultV2{StintPaceCost StintPaceCostSource, Best DecisionVector, Binding BindingConstraint, Sensitivities[] SolverSensitivity, Expected/WorstCase ScenarioEvaluation, Candidates[], Feasible, Reasons[] SolverReason, ComputeStats{WithinBudget}}`

- **Restricción vinculante**: `binding.kind/message/laps` (qué límite — fuel/VE/tyreLife/driver/event — atasca el largo máximo de stint).
- **Sensibilidades**: por parámetro, `delta` vs `impactSeconds`.
- **Esperado/caso-malo**: `ScenarioEvaluation{total, green, degradation, pit, formation}` rankea por esperado y expone riesgo (spec §5: variantes = misma función objetivo, distinta tolerancia).

## Compatibilidad

- `SolverInputV1` (`Input` con `PitLossSeconds` escalar) sigue válido; `SolverInputV2` y `SolveV2()` son aditivos y no rompen `Solve()` existente. F4-2 sustituye dentro de `SolveV2` la degradación lineal por la curva combinada cuando está disponible; compuestos, pilotos, ahorro y clima permanecen en sus extensiones F4 posteriores. Se mantiene `tiempo_total = Σ stints + Σ pit + formación`.
- Si ADR vs spec: gana ADR rev.2 (sin conflicto; ADR §12 firma cubre envelope, no solver).

## Verificación

```bash
go vet ./internal/strategy/solver/...
go test -count=100 ./internal/strategy/solver
go test ./internal/strategy/... ./internal/app
go test ./internal/strategy/application -run TestCalculateOrbitUsesGoEngineForGoldenPlan
gofmt -l ./internal/strategy/solver/
```
