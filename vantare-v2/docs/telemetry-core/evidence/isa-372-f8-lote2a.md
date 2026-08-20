# ISA-372 / F8 — lote 2a: DeltaVM, RelativeVM y FuelVM en shadow

Fecha: 2026-08-20.

Rama: `vantareapp/isa-372-tc-f8-builders-lote2a`.

Base: `tc-integration@74e1a5a6f7ee925df0eac4daa9dabe94db0fd85c` (F0–F8 lote 1 +
F11 integrados).

## Resultado

Tres features más del `OverlayFrame v2` quedan pobladas y su dominio sube de
TypeScript a Go: la resolución de referencia del delta, la selección y el orden
de la ventana relativa, y la proyección de vueltas de sesión del combustible.
Overlay v1 sigue intacto y productivo: `overlayV2Features` está vacío por
defecto y ningún widget se conmuta.

## 1. Qué dominio subió a Go, por feature

| Feature | Builder | Dominio que sube | Archivo TS de origen |
| --- | --- | --- | --- |
| `delta` | `builder_delta.go` · `BuildDelta` | Resolución de referencia: pedida → mejor disponible → no disponible, y publicación de `available[]` | `delta-view-model.ts:111-118` |
| `relative` | `builder_relative.go` · `BuildRelative` | Selección de la ventana ahead/behind alrededor del jugador y su orden | `relative-row-selection.ts:9-48` |
| `fuel` | `builder_fuel.go` · `BuildFuel` | Proyección de vueltas restantes de sesión `ceil(remaining / lastLap)` | `fuel-strategy-view-model.ts:27-32` |

### delta

Overlay v1 elegía la referencia dentro del widget: leía `content.reference`,
tomaba el campo correspondiente y, si no había vuelta de referencia, caía en
silencio a `player.deltaSeconds` **sin decir nunca cuál había usado**. Ahora la
resolución es explícita y observable en el frame:

| Campo | Significado |
| --- | --- |
| `requested` | La referencia pedida por el consumidor (preferencia del runtime) |
| `available[]` | Las referencias con un valor **utilizable** ahora mismo |
| `reference` | La **efectiva**: la pedida si está disponible, si no la primera por prioridad documentada (`personal-best` → `session-best` → `previous-lap`); vacía si no hay ninguna |
| `seconds` | El valor de la referencia efectiva, con su propia calidad |
| `authority` | `native` para el mejor personal observado del simulador, `derived` para las referencias reconstruidas por la pipeline |

`PreferencesV2` gana `DeltaReference`, normalizada al valor por defecto ante
cualquier entrada desconocida. Vive ahí y no en el widget porque el frame es
**uno por tick**: publicar la referencia pedida junto a la efectiva permite que
el widget renderice la diferencia en lugar de resolverla.

### relative

El orden canónico es el gap relativo derivado (`derive.GapSet.Vehicles`):
positivo = delante del jugador en la misma vuelta, negativo = detrás. Un único
orden **descendente** por ese gap reproduce exactamente el orden de salida de v1
(`[delante lejos→cerca, player, detrás cerca→lejos]`), con el id de vehículo
como desempate determinista.

La ventana publicada está acotada a 8 delante + 8 detrás + el ancla del
jugador. El widget recorta después a su rango configurado (2/2 por defecto). Sin
esa cota el tamaño del frame dependería de la parrilla; con ella el coste de la
sección es constante.

`RelativeRowV2` gana `classId` de forma **aditiva** y los tipos TS se regeneran
con `telemetry-contract-gen`. El validador del transporte
(`overlay-frame-v2-store.ts`) acepta el campo opcional nuevo.

### fuel

`remaining` y `capacity` salen directos del `energy.Fuel` canónico del jugador,
convertidos a la unidad preferida sin tocar la calidad. `estimatedLaps` es la
proyección de vueltas de sesión al ritmo de la última vuelta, publicada con la
**peor calidad de las dos entradas**: una estimación construida sobre una vuelta
stale se publica como stale, nunca como fresh.

## 2. Decisión en fuel: derivación mínima vs missing

El briefing permitía subir `fuelHistory` como derivación mínima en `overlayv2` o
declararlo ausente. **Se declara ausente.** Razón:

- `avgPerLap` en v1 promedia `derived.fuelHistory`, una serie de consumo por
  vuelta que hoy **solo existe en el snapshot de TypeScript**. No hay historial
  de combustible canónico ni derivación en `derive/` que lo produzca.
- Reconstruirlo dentro de la capa de proyección crearía una **segunda
  autoridad** sobre el consumo, al lado de la que legítimamente pertenece a
  `derive/`. Eso rompe la regla "una autoridad por concepto" justo en el
  subsistema que ISA-372 está unificando.
- El riesgo de la alternativa es asimétrico: declarar ausente no puede producir
  un número incorrecto; derivar en el sitio equivocado sí, y además hay que
  deshacerlo cuando la derivación real aterrice en `derive/`.

`perLap` y, por tanto, `requiredFuel` quedan en missing. **La derivación
pertenece a `derive/` y queda como follow-up explícito.**

En cambio `estimatedLaps` **sí** se publica: sus dos entradas
(`Derived.SessionRemaining` y `LastLapTime` del jugador) son canónicas, la
aritmética es la misma que v1 hacía en el widget, y no inventa ninguna señal.

## 3. Presupuesto del frame

| Escenario | Bytes | Límite |
| --- | ---: | --- |
| Sintético completo @104 (`TestFrameV2SyntheticFullUnder64KiBWith104Vehicles`) | 34.650 | < 65.536 ✅ |
| Golden real compacto @1 | 1.579 | — |
| Golden real compacto @20 | 6.186 | — |
| Golden real compacto @44 | 10.807 | — |
| Golden real compacto @104 | 22.942 | — |

El golden @104 sube de 21.775 B (lote 1) a 22.942 B: +1.167 B por las 9 filas de
`relative`, el `requested` del delta y los cuatro `QValue` de `fuel`. La ventana
relativa acotada es lo que mantiene ese incremento constante en vez de
proporcional a la parrilla.

## 4. Paridad por widget y tests

| Widget | Feature | Qué verifica el test domain-free |
| --- | --- | --- |
| `delta` | `delta` | Renderiza la referencia resuelta en Go sin elegir ninguna; signo, decimales, tono y progreso; delta ausente como `missing` y no como cero; última vuelta desde la identidad del frame |
| `relative` | `relative` | Ventana y orden respetados sin reseleccionar; signo del gap y tono; ancla del jugador opcional; unión de posición/última vuelta por id dentro del mismo frame; sin ancla, sin filas |
| `fuel-strategy` | `fuel` | Depósito y proyección leídos del frame sin recalcular; depósito vacío como cero y ausente como `undefined`; interruptor de proyección del widget |

Los tres cubren además el ciclo de vida de la fuente (`live` / `stale` /
`stopped` / `error`) y el hecho de que la feature está **apagada por defecto**.

Comparador: `compareDelta`, `compareRelative` y `compareFuel` con métrica
`overlay_shadow_mismatches_total{feature,field,phase}` y **gate solo en
`phase=live`**. Tolerancias absolutas explícitas:

| Campo | Tolerancia | Motivo |
| --- | ---: | --- |
| `delta.progress` | 1e-9 | Los dos lados dividen por la misma escala tras un round-trip JSON |
| `relative.rows[].gapSeconds` | 1e-6 | Round-trip JSON del gap derivado |
| `fuel.fuelLiters` | 1e-6 | Round-trip JSON del depósito |
| `fuel.lapsRemaining` | 0 | Las dos partes publican un entero: cualquier diferencia es real |

Las filas de `relative` se comparan **por identidad de vehículo con el orden
significativo**; una fila presente solo en un lado se reporta una vez como
`rows[].identity`, no como divergencia de valor campo a campo.

Tests con secuencias `stale→live` para las tres features, incluido el caso
`transition` cuando los dos contratos discrepan sobre la frescura.

## 5. Señales declaradas ausentes

Declaradas ausentes, **no** inventadas:

| Campo | Motivo |
| --- | --- |
| `delta.trend` | El canónico lleva el historial acotado del delta pero ningún concepto de tendencia; reconstruirla aquí duplicaría la autoridad que `delta-trace` ya posee |
| `delta.bestLapText` | El frame v2 no lleva mejor vuelta del jugador |
| `delta.lapText` | El frame lleva vueltas completadas, no el número de vuelta que v1 mostraba |
| `delta.predictedLapText` | Sin tiempo estimado de vuelta en el frame v2 |
| `relative.rows[].driverNumber` | El `VehicleState` canónico no tiene dorsal |
| `relative.rows[].bestLapText` | El contrato wire v2 no lleva mejor vuelta por fila |
| `relative.rows[].gapText` | v1 dejaba el gap en blanco al coche doblado y mantenía la fila; el builder v2 deja fuera de la ventana al vehículo sin gap canónico. Diferencia de contrato declarada |
| `fuel.perLap` | Sin historial de consumo canónico; la derivación pertenece a `derive/` |
| `fuel.requiredFuel` | Depende de `perLap` |
| `fuel.fuelPercent` | v1 nunca lo pobló; el frame sí lleva la capacidad, pero mantener la paridad manda |

Se exponen en `OVERLAY_V2_DELTA_DECLARED_GAPS`,
`OVERLAY_V2_RELATIVE_DECLARED_GAPS` y `OVERLAY_V2_FUEL_DECLARED_GAPS`, junto al
ViewModel que las declara; el comparador las reexporta para no tener dos copias.
El comparador las declara en vez de compararlas, de modo que no pueden ensuciar
el gate.

## 6. Diferencia de criterio de orden en relative (a vigilar en sesión real)

Overlay v1 ordena la ventana por **distancia de vuelta**; el builder v2 la
ordena por **gap relativo derivado**. Sobre los goldens y en cabeza de carrera
ambos criterios coinciden, pero bajo tráfico real pueden divergir (dos coches en
la misma vuelta con gaps casi iguales, o un coche doblado que v1 mantiene y v2
excluye).

Esto **no** es una señal ausente: es un criterio distinto sobre la misma
intención. Al muestrear en sesión real hay que leer
`overlay_shadow_mismatches_total{feature="relative",field="rows.order",phase="live"}`
antes de considerar la feature conmutable. Si aparece, la decisión pendiente es
si el criterio canónico debe ser la distancia de vuelta (hoy disponible en
`VehicleState.LapDistance`, sin derivación que la ordene) en lugar del gap.

## 7. Pendientes

- Lote 2b: `controls`, `spotter` y `damage`.
- `CapabilityModesV2` sigue en `none`.
- Derivación de consumo de combustible por vuelta en `derive/`, para poder
  poblar `fuel.perLap` con una autoridad única.
- `telemetry_core_runtime.go` no se toca en este lote. Para que la preferencia
  de referencia del delta llegue al builder, el runtime debe pasar
  `PreferencesV2.DeltaReference`; mientras no lo haga, `normalizedPreferences`
  la fija en `personal-best`, que es exactamente el valor por defecto del
  widget, así que el comportamiento actual no cambia.
