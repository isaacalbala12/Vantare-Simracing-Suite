# STR-05 — Cálculo manual de carrera, recursos y pit

Fecha: 2026-08-02

Issue: ISA-140

Base: `ISA-139@f60f480c064a4b5140e0f12a0918bd7c7d012276`

## Resultado

`internal/strategy/manual` contiene un motor puro, determinista y sin estado
para los cálculos manuales de carrera, Fuel, Virtual Energy y pit. No se
registra en Wails ni en la fachada de STR-04: ese wiring pertenece a los cortes
de UI y edición. Tampoco lee Telemetry Core, Shared Memory, REST, DuckDB,
archivos LMU o persistencia.

Cada valor de entrada utilizado es `Sourced<T>` y exige procedencia y confianza
válidas de `strategy.v1`. Los resultados incluyen una lista `Assumptions` con
campo, unidad, valor exacto, procedencia y confianza. Ningún preset o valor LMU
se incorpora como supuesto silencioso.

## Carrera por vueltas y tiempo

### Por vueltas

Para `N` vueltas competitivas, tiempo medio `L` y pit manual total `P`:

```text
competitiveLaps = N
drivingSeconds = N * L
scheduledSeconds = drivingSeconds + P
totalLaps = competitiveLaps + formationLaps
```

`N` y `L` deben ser positivos. La formación se conserva separada para que los
recursos puedan explicarla sin convertirla en vuelta competitiva.

### Por tiempo

Para duración de evento `D`, pit manual total `P` y tiempo medio `L`:

```text
onTrackBudget = D - P
q = onTrackBudget / L
lapsCompleteAtExpiry = floor(q)
```

`P` es siempre un input explícito con su propia procedencia. STR-05 no deriva
paradas desde Fuel/VE y no contiene un ciclo oculto pit → vueltas → recurso →
pit. Un solver posterior deberá resolver esa relación de forma explícita.

La regla del evento también es explícita:

- `complete_current_lap`: `competitiveLaps = ceil(q)`; termina la vuelta que
  estaba en curso. Si el reloj expira exactamente en meta, no aparece una
  vuelta fantasma.
- `complete_current_plus_one`: aplica lo anterior y añade una vuelta completa
  adicional. No se activa por defecto ni se etiqueta como regla LMU.

Los cocientes a una distancia absoluta máxima de `1e-12` de un entero —o una
ULP cuando la magnitud ya no permite distinguir menos— se tratan como esa
frontera exacta. Esto evita que decimales como `0.3 / 0.1` creen una vuelta
artificial sin redondear fracciones legítimas en carreras grandes. `P == D`
produce cero vueltas; `P > D` se rechaza.

## Fuel y Virtual Energy

Fuel usa `contract.FuelLiters`. Virtual Energy usa porcentajes para valores
instantáneos y `manual.EnergyPoints` para consumos acumulados, que pueden
superar 100 durante una carrera. Las APIs y resultados públicos no permiten
intercambiar ambos recursos.

Para vueltas competitivas `N`, consumo por vuelta `C`, formación `F`, reserva
`R`, cantidad inicial `S` y capacidad utilizable por servicio `U`:

```text
raceNeed = N * C
totalNeed = raceNeed + F + R
additionalRequired = max(totalNeed - S, 0)
stopsRequired = ceil(additionalRequired / U)
```

La reserva admite, de forma explícita y con evidencia propia:

- cantidad absoluta;
- vueltas: `reserve = reserveLaps * C`;
- porcentaje: `reserve = (raceNeed + F) * percent / 100`;
- ninguna.

La capacidad física, la utilizable y la cantidad inicial son distintas. La
utilizable y la inicial no pueden superar la física. Si falta recurso y `U` es
cero, el cálculo falla como capacidad insuficiente; nunca devuelve una
estrategia aparentemente válida.

Los repostajes/recargas se enumeran en orden, llenando hasta `U` y dejando el
resto exacto en la última parada. La lista está limitada por el máximo de
contenedor del contrato compartido.

### Fuel-save para eliminar una parada

Para `stopsRequired > 0`, el objetivo es `targetStops = stopsRequired - 1`:

```text
targetAvailable = S + U * targetStops
amountToSave = max(totalNeed - targetAvailable, 0)
savePerLap = amountToSave / N
percentOfConsumption = savePerLap / C * 100
```

La fórmula cuenta la cantidad inicial `S`; corrige el oráculo histórico que
asumía implícitamente un inicio lleno. `Feasible` solo afirma viabilidad
matemática (`0 < savePerLap < C`), no que el piloto o el coche puedan lograrla.

## Pit: fijo, variable y solape

Cada parada recibe entrada, tránsito, salida, repostaje, neumáticos y modo de
servicio. Reparación y penalización son opcionales. No existen presets.

```text
travel = entry + transit + exit
coreService(parallel) = max(refuel, tyres)
coreService(sequential) = refuel + tyres
overlapSaved = refuel + tyres - coreService
fixed = travel + penalty
variable = coreService + repair
total = fixed + variable
```

Solo repostaje y neumáticos pueden solaparse en este contrato. Reparación se
añade de forma secuencial y la penalización nunca se oculta bajo trabajo. El
resultado publica `OverlapSavedSeconds`, por lo que se puede auditar que cada
servicio se cuenta exactamente una vez. Una agenda de varias paradas suma los
breakdowns ya calculados sin reinterpretarlos.

## Errores y límites

- Números negativos, `NaN`, infinitos, evidencia inválida y enums desconocidos
  fallan cerrados.
- Vueltas y número de paradas respetan el máximo entero compartido `2^53-1`.
- Multiplicaciones, sumas y redondeos comprueban overflow antes de construir
  tipos del contrato.
- Fuel y VE no se suman, comparan ni convierten entre sí.
- No existe solver global, iteración fixed-point, Monte Carlo ni preset LMU.

## Relación con Product A

Product A se importa únicamente desde `producta_compare_test.go`. Las
comparaciones cubren las funciones allowlisted de carrera, recurso y pit solo
en casos semánticamente compatibles. Las diferencias deliberadas quedan fuera
de esa comparación:

- una carrera por tiempo ya no produce vueltas fraccionarias;
- la vuelta final y el `+1` son reglas explícitas;
- fuel-save usa la cantidad inicial real;
- no existe preset LMU productivo.

El paquete productivo `manual` no importa `producta`.

## Evidencia

- TDD rojo: cada slice falló inicialmente por símbolos ausentes antes de
  añadir carrera, pit y recursos.
- Oráculos table-driven para vueltas, tiempo, frontera exacta, `+1`, formación,
  reservas, repostajes, fuel-save, servicios solapados/secuenciales,
  reparación y penalización.
- 10.000 presupuestos deterministas comprueban conservación de recurso.
- Fuzz de Fuel y pit comprueba conservación y límites.
- Comparación histórica limitada a Product A allowlisted.
- Sin cambios frontend ni visuales; Playwright no aplica en STR-05.

## Checks de entrega

| Check | Resultado |
|---|---|
| `go test ./internal/strategy/manual -count=100` | PASS |
| Fuzz Fuel y pit | PASS; más de 318.000 ejecuciones combinadas en la corrida final |
| `go test -race ./internal/strategy/manual ./internal/strategy/contract -count=10` | PASS |
| `go test ./internal/strategy/... -count=1` | PASS |
| `go vet ./internal/strategy/...` | PASS |
| `pnpm --dir frontend test` | PASS; 301 archivos y 2.052 tests |
| `pnpm --dir frontend build` | PASS |
| `go test ./... -count=1` | El delta pasa; falla únicamente el P3 heredado `internal/app.TestConcurrentSavesDontCorruptFile` por contención Windows de `app-settings.json.tmp` |
| `go vet ./...` | Mantiene tres avisos Win32 heredados fuera del alcance |
| `pnpm --dir frontend lint` | Mantiene 30 errores y 2 warnings heredados fuera del alcance |

No se ejecutó Playwright porque el corte no contiene UI ni wiring productivo.
No se creó ni migró estado persistente.

## Rollback

Revertir el commit de ISA-140 elimina `internal/strategy/manual`, los dos
métodos públicos de validación de evidencia y este documento. No hay datos que
migrar, consumidores productivos, wiring, persistencia o estado externo.
