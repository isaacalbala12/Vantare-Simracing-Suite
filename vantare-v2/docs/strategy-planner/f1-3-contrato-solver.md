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

### Peso de combustible F4-3

Cada vuelta suma `litros a bordo al inicio de la vuelta * secondsPerLiter` al
ritmo base y a la curva de stint de F4-2. El nivel parte de la carga inicial
del candidato —en F4-1, la capacidad utilizable—, resta el consumo después de
cada vuelta y añade exactamente los litros elegidos en cada parada. El resultado
separa este término como `fuelWeightSeconds`; `totalSeconds` conserva la suma
aditiva completa.

El coeficiente acepta una sola autoridad:

- `SolverInputV2.FuelWeight` para `manual` o `reference`, con
  `presence=valid`, `secondsPerLiter`, `provenance` y `confidence`;
- `Projection.FuelWeightCurve.slopeSecondsPerUnit` para `derived`, solo cuando
  Analysis materializó la curva tras `identifiability=separable`. Una fuente
  derivada no se puede introducir por el fallback manual y dos autoridades
  simultáneas fallan cerradas.

`SolverResultV2.FuelWeightCost` conserva presencia, valor, procedencia y
confianza; `Assumptions` declara la fuente usada o que el término no estaba
configurado. La sensibilidad pesimista aumenta el coeficiente un 20 % sobre el
mismo plan y publica `parameter=fuelWeightSecondsPerLiter`.

Con peso activo, la poda solo compara estados con el mismo nivel de Fuel: un
estado con más litros ya no es automáticamente mejor porque arrastra coste en
las vueltas futuras. El oráculo exhaustivo suma el mismo nivel vuelta a vuelta
sin poda. El caso de negocio versionado cubre una carrera donde el modelo sin
peso llena una vez y el modelo con peso prefiere dos repostajes splash.

### Ahorro como variable de decisión F4-4 (D6)

Cada stint elige un nivel de ahorro completo: Fuel ahorrado en L/vuelta, VE
ahorrada en puntos porcentuales/vuelta y coste en s/vuelta. `none` siempre
existe y cuesta cero. Los demás niveles llegan por una sola autoridad:

- `SolverInputV2.SavingCost` acepta exclusivamente `manual` o `reference`;
- `Projection.SavingCost` acepta la familia `valid` de Analysis. Si su
  procedencia es `derived`, el solver exige el método
  `derived_from_controlled_ab_protocol` emitido por F3-a4; una curva derivada
  no puede entrar por el fallback manual;
- dos autoridades simultáneas, identificadores repetidos, valores no finitos o
  negativos, o un ahorro mayor que el consumo base fallan cerrados.

La cifra de `manual.CalculateFuel/VirtualEnergy(...).Saving.PerLap` es una
semilla útil para declarar un nivel manual, pero no fuerza el plan. El solver
la compara con `none` y con los demás niveles bajo la función objetivo común.

El consumo efectivo del stint es
`consumo_base - ahorro_del_nivel`. Ese valor decide cuántas vueltas caben,
cuánto Fuel/VE queda y cuánto debe añadirse en la siguiente parada. F4-3 usa el
mismo consumo efectivo al reconstruir los litros a bordo de cada vuelta, de
modo que ahorro, cantidad repostada y peso no son términos independientes.
El coste de ritmo es aditivo (`vueltas * secondsPerLap`) y se expone separado
como `ScenarioEvaluation.savingSeconds`.

#### Discretización y poda

El espacio no interpola ni mezcla campos de niveles distintos:

- `none` más la lista declarada, con máximo 16 niveles adicionales;
- cada nivel es un punto indivisible `(Fuel L/vuelta, VE pp/vuelta,
  s/vuelta)` y usa la precisión interna de servicios de `10^-6`;
- en cada frontera de stint se exploran todos los niveles y todas las
  longitudes factibles; luego se exploran las cantidades de servicio de F4-1;
- el presupuesto `MaxCandidates` cuenta también esta dimensión y, si se agota,
  el resultado no afirma que demostró el óptimo.

No se añade una poda específica de ahorro. Después de aplicar el nivel, el
estado vuelve a ser `(vuelta, Fuel, VE, nº paradas si hay regla, coste)`, por lo
que se conserva la poda de dominancia de F4-1. Con peso activo solo se comparan
estados con Fuel idéntico, como exige F4-3. El oráculo de tests añade la misma
dimensión pero enumera sin poda todos los niveles, largos y servicios en
carreras pequeñas; cubre Fuel y VE, dos niveles declarados y peso activo. La
igualdad con el oráculo demuestra que esta poda no pierde el óptimo en esos
tamaños.

`SolverResultV2.SavingCost` conserva presencia, procedencia, confianza y
niveles. `SavingPlan` lista solo los stints que ahorran, indicando nivel,
vueltas, Fuel/VE ahorrado por vuelta y total, coste por vuelta y coste total.
Cada `StintDecision` conserva los mismos datos y el pit anterior identifica el
nivel del stint siguiente. La sensibilidad pesimista aumenta un 20 % el coste
de los niveles elegidos sobre el mismo plan y publica
`parameter=savingTimeCostPerLap`.

El test canónico D6 usa 25 vueltas, 10 L de capacidad y 1 L/vuelta: `none`
necesita dos paradas y deja una necesidad final equivalente a unas 5 vueltas.
Ahorrar 0,25 L/vuelta en los dos stints restantes cuesta 0,20 s/vuelta, reduce
los litros repostados y elimina una parada; con el mismo ahorro a 2 s/vuelta,
el solver conserva la parada. El fixture mantiene el peso activo para probar la
interacción completa y no solo `coste_ahorro < tránsito`.

## Otros campos del I/O

- **Formation** (`formation.seconds`): coste de formación antes de vuelta 1.
- **EventRules** (`eventRules`): `min/maxPitStops`, `requiredWindows [fromLap,toLap]`, `mandatoryCompounds`, `driverLimits{Min/MaxLaps, MaxTimeSeconds, unavailableWindows}`.
- **ComputeBudget** (`budget.p95Millis`, `maxCandidates`, `maxIterations`): presupuesto p95 como parámetro.
- **Projection/Observed**: familias degradadas D19 referenciadas sin duplicar tipos.

## Resultado

`SolverResultV2{StintPaceCost StintPaceCostSource, FuelWeightCost FuelWeightCostSource, SavingCost SavingCostSource, SavingPlan, Best DecisionVector, Binding BindingConstraint, Sensitivities[] SolverSensitivity, Expected/WorstCase ScenarioEvaluation, Candidates[], Feasible, Reasons[] SolverReason, Assumptions[] SolverReason, ComputeStats{WithinBudget}}`

- **Restricción vinculante**: `binding.kind/message/laps` (qué límite — fuel/VE/tyreLife/driver/event — atasca el largo máximo de stint).
- **Sensibilidades**: por parámetro, `delta` vs `impactSeconds`.
- **Esperado/caso-malo**: `ScenarioEvaluation{total, green, degradation, fuelWeight, saving, pit, formation}` rankea por esperado y expone riesgo (spec §5: variantes = misma función objetivo, distinta tolerancia).

## Compatibilidad

- `SolverInputV1` (`Input` con `PitLossSeconds` escalar) sigue válido;
  `SolverInputV2` y `SolveV2()` son aditivos y no rompen `Solve()` existente.
  F4-2 selecciona la curva de stint, F4-3 suma el peso de Fuel y F4-4 elige el
  ahorro; compuestos, pilotos y clima permanecen en sus extensiones F4
  posteriores. Se mantiene
  `tiempo_total = Σ ritmo base + Σ curva stint + Σ peso Fuel + Σ coste ahorro + Σ pit + formación`.
- F4-4 añade el ahorro y su procedencia sin cambiar el wire de
  Orbit, que sigue usando `Solve` v1 hasta disponer del contrato real de servicios.
- Si ADR vs spec: gana ADR rev.2 (sin conflicto; ADR §12 firma cubre envelope, no solver).

## Verificación

```bash
go vet ./internal/strategy/solver/...
go test -count=100 ./internal/strategy/solver
go test ./internal/strategy/... ./internal/app
go test ./internal/strategy/application -run TestCalculateOrbitUsesGoEngineForGoldenPlan
gofmt -l ./internal/strategy/solver/
```
