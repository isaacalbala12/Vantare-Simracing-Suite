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

### Compuesto, inventario físico y ventanas F4-5

`SolverInputV2.TyreInventory` transporta `maximum + []tyres.Tyre` y se valida
con `internal/strategy/tyres.NewInventory`. El solver no redefine identidad,
estado, compuesto, esquina bloqueada ni suficiencia. Los fitments los obtiene
exclusivamente con `SelectFitment`/`SelectFitmentExcluding`, que asignan cuatro
identidades distintas y respetan las esquinas persistentes y los descartes.

Mientras `TyresCompound` real siga `unsupported` sin mapping semántico (D19),
`CompoundPace[]` declara por cada compuesto:

- `presence=valid`, `provenance` y `confidence`; la procedencia solo puede ser
  `manual` o `reference`;
- `paceDeltaSeconds`, sumado una vez por vuelta como diferencia de ritmo base;
- una curva explícita `{lapInStint, deltaSeconds}` o la pendiente lineal
  `degradationPerLapSeconds`, nunca ambas.

Dos autoridades de ritmo fallan cerradas: `CompoundPace` no se combina con
`DegradationPerLap` global ni con una `CombinedStintPaceCurve` derivada. Los
parámetros y curvas usados se devuelven en `CompoundPaceCost`, con su
procedencia intacta. `ScenarioEvaluation.compoundSeconds` separa el delta base
del coste de degradación. La sensibilidad añade 0,20 s/vuelta al delta de cada
compuesto elegido y publica `compoundPaceDeltaSeconds.<compound>`.

El primer stint explora un fitment canónico por compuesto disponible. En cada
parada el candidato elige entre:

- **no cambiar:** conserva compuesto, identidades y edad; la duración
  `manual.PitStopInput.Tyres` es cero;
- **cambiar:** selecciona otro juego físico canónico, puede cambiar de
  compuesto y paga `PitCost.TyreSeconds` dentro del solape paralelo/secuencial
  de F4-1.

El uso dentro del candidato se acumula por identidad física durante toda la
carrera. Quitar un juego y volver a montarlo no reinicia `TyreLifeLaps`; otro
juego que aún no ha rodado en ese candidato sí conserva toda su vida declarada.
La reutilización entre stints continúa permitida por el dominio físico, pero
ninguna identidad ocupa dos esquinas del mismo stint.

`RequiredWindows` es una lista de ventanas inclusivas `[fromLap,toLap]`, con
`1 <= from <= to < raceLaps`. Cada ventana exige al menos una parada; una misma
parada puede satisfacer varias ventanas solapadas. Cuando una ventana cierra
sin parada el candidato se poda como inviable con
`reason=required_pit_window`. Al completar también se aplican `min/maxPitStops`
y `MandatoryCompounds`; la ausencia de un compuesto obligatorio produce
`reason=mandatory_compound`.

#### Espacio finito, simetría y poda

Antes de buscar, el inventario produce una lista determinista y disjunta de
juegos por compuesto. Como dos juegos del mismo compuesto tienen el mismo
modelo de coste en F4-5, el inicio usa un representante canónico; después de
cada parada se enumeran todos los juegos alternativos. No se generan
permutaciones de las cuatro ruedas que son equivalentes para la función
objetivo.

La dominancia solo compara estados con el mismo futuro posible. Además de las
condiciones de F4-1..4, deben coincidir el fitment actual, el uso acumulado por
identidad, las ventanas ya satisfechas y, si hay compuestos obligatorios, el
conjunto ya usado. `ComputeStats.prunedStates` cuenta los estados descartados;
`MaxCandidates` sigue contando la dimensión compuesto/cambio/servicios y corta
sin afirmar óptimo cuando se agota.

El oráculo pequeño enumera sin poda exactamente las mismas longitudes, ahorro,
cantidades, compuestos, juegos, cambios y reglas. La paridad cubre dos
compuestos, ventana obligatoria y hasta dos paradas, y exige además que el
solver haya podado al menos un estado. El caso de negocio de ocho vueltas
demuestra ambos sentidos: con blandos solo 0,4 s/vuelta más rápidos gana el
doble stint duro sin servicio; con 2 s/vuelta de ventaja compensa pagar el
cambio a blandos.

### Piloto por stint F4-6

`DriverProfiles[]` fija el orden determinista de pilotos que el solver explora.
Cada entrada enlaza `driverId` con exactamente una autoridad:

- `profile: PilotProfileV1`, validado por su owner
  `internal/strategy/pilotprofile`; o
- `manual: ManualDriverProfile`, con ritmo base, consumo Fuel/VE y
  procedencia/confianza `manual` o `reference`.

Dos autoridades, IDs repetidos, un límite para un piloto inexistente o un
ahorro superior al consumo de cualquiera de los pilotos fallan cerrados. El
resultado devuelve `DriverProfileCost[]` con la fuente, ID de origen, cifras y
procedencia usadas. `StintDecision.driver` identifica al piloto y el pit
anterior conserva el piloto del stint siguiente.

El ritmo base y el consumo efectivo se seleccionan antes de evaluar cada
stint. Por tanto, el piloto cambia tanto el tiempo por vuelta como la autonomía,
las cantidades de servicio y el coste de peso Fuel; curva de stint, compuesto
y ahorro siguen aplicándose sobre esa misma evaluación. Sin `DriverProfiles`
existe un único piloto implícito con los campos globales de F4-1..5: no añade
ramas, no cambia los números ni el golden Orbit.

`EventRules.DriverLimits[driverId]` aplica restricciones duras:

- `unavailable[{fromLap,toLap}]` son tramos inclusivos ya resueltos a vueltas;
  un piloto debe estar disponible durante todo su stint. La API F2(a) conserva
  los tramos `ok/no` del documento v2 en minutos del día; la capa que prepare
  el cálculo debe resolverlos contra el inicio/duración confirmados del evento
  y nunca inventar esa conversión dentro del solver;
- `maxContinuousTimeSeconds` acumula todo el tiempo efectivo al volante aunque
  el mismo piloto atraviese una parada; cambiar de piloto reinicia el continuo;
- `maxTotalTimeSeconds` acumula todos sus stints;
- `minLaps/maxLaps` conservan los límites ya declarados por F1.3.

El tiempo al volante incluye ritmo base, curva/degradación, delta de compuesto,
peso Fuel y coste de ahorro. Excluye formación y servicio de pit. Una violación
produce candidato inviable con motivo tipado: `driver_unavailable`,
`driver_continuous_time`, `driver_total_time`, `driver_minimum_laps` o
`driver_maximum_laps`.

#### Espacio, poda, oráculo y sensibilidad

La dimensión nueva multiplica cada frontera de stint por el número de pilotos;
no genera permutaciones fuera de esas fronteras. La dominancia solo compara
estados con el mismo piloto actual, tiempo continuo y mapa exacto de
vueltas/segundos totales por piloto, además del estado Fuel/VE/neumáticos/reglas
de F4-1..5. Es una poda conservadora: conserva todos los futuros distintos por
disponibilidad o límites y todavía elimina servicios dominados.

El oráculo pequeño recorre sin poda la misma dimensión piloto × ahorro × largo
de stint × servicios × neumáticos. La prueba de paridad exige el mismo óptimo y
`prunedStates > 0`. El caso de negocio asigna al rápido donde está disponible y
fuerza al más lento en una ventana intermedia; otro caso demuestra que el menor
consumo puede compensar el peor ritmo. La sensibilidad publica
`driverPaceDeltaSeconds.<driverId>` con `delta=+0,20 s/vuelta` e impacto igual a
las vueltas asignadas por el plan.

### Escenarios de clima F4-7 (D5)

`SolveV2` acepta de forma aditiva `WeatherPlanInput`; sin ese campo ejecuta
exactamente el espacio y las formulas F4-1..6. `SolveWeatherScenarios` recibe
entre 1 y 16 `WeightedWeatherScenario`, normaliza sus pesos y ejecuta el mismo
solver una vez por escenario. Un unico escenario completamente seco sin
parametros climaticos es el caso degenerado: conserva `Best` y todas las cifras
de `Expected` del `SolveV2` actual.

#### Forecast a condicion por vuelta

Los cinco nodos verificados en vivo de `WeatherScenario v1`
`START/25/50/75/FINISH` ocupan respectivamente el 0/25/50/75/100 % de la
carrera. La vuelta 1 usa 0 % y la ultima 100 %; para las intermedias se usa
`(lap-1)/(raceLaps-1)`. `RainChance` se interpola linealmente entre los dos
nodos vecinos. No se interpola por indice de vuelta entero ni se adelanta un
nodo completo.

La traduccion default y configurable (`RainChanceThresholds`) es:

- `< 20 %`: `dry`;
- `>= 20 % y < 60 %`: `humid`;
- `>= 60 %`: `wet`.

Debe cumplirse `0 < humid < wet <= 100`. `Sky`, temperatura de aire y pista se
conservan en el escenario como contexto, pero no fuerzan un bucket: el forecast
capturado aporta probabilidad, no `Path Wetness` observado. Cambiar ese criterio
requiere evidencia y contrato nuevos. La salida publica `WeatherTimeline[]`
con vuelta, probabilidad interpolada y bucket; la sensibilidad vuelve a evaluar
el plan robusto con el umbral wet a `-5/+5` puntos porcentuales, e informa
vueltas reclasificadas, impacto y factibilidad.

#### Parametros seleccionados vuelta a vuelta

Cada bucket no seco encontrado exige un `WeatherBucketParameter` explicito con
procedencia `manual` o `reference`; faltar el bucket falla cerrado. El seco
puede omitirlo para preservar el caso degenerado. Cada parametro transporta:

- `paceDeltaSeconds`, el `delta_clima` aditivo de spec §5;
- fallback opcional de Fuel/VE por vuelta. Si
  `Projection.{Fuel,VirtualEnergy}Consumption.ByClimateBucket` publica el mismo
  bucket `valid`, la familia derivada de Analysis es la autoridad y declarar a
  la vez el fallback se rechaza;
- `CompoundPace[]` opcional por bucket, con el mismo contrato de curva/delta y
  procedencia F4-5. Solo puede sustituir compuestos presentes en la lista global
  que define el inventario y el espacio de eleccion.

La busqueda suma consumo, `delta_clima` y parametros/curva de compuesto para la
condicion de **cada vuelta absoluta**. Por tanto, un stint que cruza una
transicion no queda etiquetado entero por la condicion inicial: cambia de
consumo y coste al cruzarla. El ahorro se resta despues de seleccionar el
consumo del bucket y no puede superar el consumo de ninguna vuelta. El peso
Fuel reconstruye tambien el nivel vuelta a vuelta con ese consumo.

`EventRules.AllowedCompoundsByClimate` permite una regla dura opcional por
bucket. Un compuesto fijo debe ser valido durante todas las vueltas del stint;
si deja de serlo, el candidato solo puede seguir mediante una parada previa a
la primera vuelta incompatible. La eleccion usa el inventario fisico F4-5,
conserva edad/identidades y paga el servicio real. Sin regla dura, los deltas y
curvas hacen que dry/wet compitan por tiempo total.

#### Planes por escenario y recomendacion robusta

`WeatherScenarioResult.Plans[]` expone para cada escenario su peso normalizado,
timeline y `SolverResultV2` optimo. La recomendacion se elige sobre la union
determinista de los planes y candidatos rankeados de esos escenarios. Cada plan
se reproduce sin reoptimizar bajo todos los timelines, aplicando de nuevo
recursos, compuestos, inventario, pilotos, ventanas y reglas.

El criterio primario elegido es **minimax regret**:

`regret(plan, scenario) = time(plan, scenario) - time(optimo_scenario)`

Se minimiza el mayor regret porque D5 pide la opcion que menos pierde cuando el
forecast falla. En empate se minimiza la perdida esperada ponderada
`sum(weight * regret)` y despues se usa identidad canonica del plan para
determinismo. `RobustRecommendation` expone `method=minimax_regret`,
`maxRegretSeconds`, `weightedExpectedLossSeconds` y la evaluacion/factibilidad
por escenario. Un candidato inviable en cualquier escenario no puede ser la
recomendacion robusta.

El caso de negocio versionado usa lluvia desde `NODE_50`: el optimo para lluvia
para en la vuelta anterior a la primera vuelta `wet` y monta el juego fisico de
wets. Con una variacion donde la lluvia se adelanta, la recomendacion minimax
pierde menos tiempo que ejecutar el plan seco puro. El oraculo exhaustivo
enumera sin poda el mismo escenario pequeno y conserva paridad.

## Otros campos del I/O

- **Formation** (`formation.seconds`): coste de formación antes de vuelta 1.
- **EventRules** (`eventRules`): `min/maxPitStops`, `requiredWindows [fromLap,toLap]`, `mandatoryCompounds`, `driverLimits{min/maxLaps, maxContinuousTimeSeconds, maxTotalTimeSeconds, unavailable}`, `allowedCompoundsByClimate`.
- **ComputeBudget** (`budget.p95Millis`, `maxCandidates`, `maxIterations`): presupuesto p95 como parámetro.
- **Projection/Observed**: familias degradadas D19 referenciadas sin duplicar tipos.

## Resultado

`SolverResultV2{StintPaceCost StintPaceCostSource, CompoundPaceCost[] CompoundPaceCostSource, FuelWeightCost FuelWeightCostSource, SavingCost SavingCostSource, SavingPlan, WeatherBucketCost[] WeatherBucketCostSource, WeatherTimeline[], Best DecisionVector, Binding BindingConstraint, Sensitivities[] SolverSensitivity, Expected/WorstCase ScenarioEvaluation, Candidates[], Feasible, Reasons[] SolverReason, Assumptions[] SolverReason, ComputeStats{PrunedStates, WithinBudget}}`

- **Restricción vinculante**: `binding.kind/message/laps` (qué límite — fuel/VE/tyreLife/driver/event — atasca el largo máximo de stint).
- **Sensibilidades**: por parámetro, `delta` vs `impactSeconds`.
- **Esperado/caso-malo**: `ScenarioEvaluation{total, green, degradation, fuelWeight, saving, pit, formation}` rankea por esperado y expone riesgo (spec §5: variantes = misma función objetivo, distinta tolerancia).

## Compatibilidad

- `SolverInputV1` (`Input` con `PitLossSeconds` escalar) sigue válido;
  `SolverInputV2` y `SolveV2()` son aditivos y no rompen `Solve()` existente.
  F4-2 selecciona la curva de stint, F4-3 suma el peso de Fuel, F4-4 elige el
  ahorro, F4-5 añade compuesto/inventario/reglas, F4-6 asigna piloto y F4-7
  selecciona clima por vuelta y compara escenarios. Se mantiene
  `tiempo_total = Σ ritmo base + Σ delta compuesto + Σ curva stint + Σ peso Fuel + Σ coste ahorro + Σ delta_clima + Σ pit + formación`.
- F4-4 añade el ahorro y su procedencia sin cambiar el wire de
  Orbit, que sigue usando `Solve` v1 hasta disponer del contrato real de servicios.
- Si ADR vs spec: gana ADR rev.2 (sin conflicto; ADR §12 firma cubre envelope, no solver).

## Verificación

```bash
go vet ./internal/strategy/solver/...
go test -count=100 ./internal/strategy/solver ./internal/strategy/tyres
go test ./internal/strategy/... ./internal/app
go test ./internal/strategy/application -run TestCalculateOrbitUsesGoEngineForGoldenPlan
$goFiles = Get-ChildItem internal/strategy/solver,internal/strategy/tyres -Filter *.go
gofmt -l $goFiles.FullName
```
