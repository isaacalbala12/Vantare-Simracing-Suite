# ISA-678 — derivación canónica de `fuel.perLap` y estimación de vueltas

Fecha: 2026-08-20.

Rama: `vantareapp/isa-678-fuel-perlap-canonico`.

Base: `origin/nightly@e2d67180`.

## Resultado

El consumo de combustible por vuelta deja de ser un cálculo del navegador y pasa
a ser una derivación canónica en `internal/telemetry/derive`. `fuel.perLap` del
`OverlayFrame v2` queda poblado por primera vez y `fuel.estimatedLaps` gana una
precedencia explícita, publicada en el frame como `fuel.basis`.

Esto cierra el follow-up que ISA-372 / F8 lote 2a dejó abierto por escrito
(`docs/telemetry-core/evidence/isa-372-f8-lote2a.md`, §2 y §5): la serie de
consumo solo existía en `derived.fuelHistory` del snapshot TypeScript, y
reconstruirla dentro de la capa de proyección habría creado una **segunda
autoridad** sobre el mismo concepto. La derivación aterriza ahora donde
correspondía.

## 1. El tracker: qué mide y qué se niega a medir

`derive.FuelUsage` publica tres campos derivados y su frescura:

| Campo | Significado |
| --- | --- |
| `PerLap` | Media móvil del consumo, en litros, sobre las últimas vueltas válidas |
| `LastLap` | La última vuelta medida, la muestra más reciente de esa media |
| `WindowLaps` | Cuántas vueltas hay realmente detrás de la media |

`WindowLaps` no es decorativo: una media de una sola vuelta y una de tres se
publican con el mismo tipo, y el consumidor tiene derecho a saber cuál está
leyendo antes de tomar una decisión de estrategia.

Una vuelta **solo** produce muestra si se cumple todo esto a la vez:

1. el número de vuelta del jugador avanza exactamente uno;
2. el jugador no pisa boxes en ningún momento de la vuelta;
3. las lecturas de vuelta, depósito y boxes siguen frescas y con procedencia
   observada;
4. el depósito baja (consumo estrictamente positivo y finito).

Cualquier otra cosa **invalida la vuelta abierta** en vez de publicar un número:

| Situación | Qué hace el tracker |
| --- | --- |
| Repostaje (el depósito sube más de 0,05 l) | Invalida la vuelta abierta; el reanclaje ocurre en el siguiente cruce |
| Entrada a boxes | Invalida la vuelta abierta |
| Salto o regresión de vuelta | La frontera no se observó: descarta la vuelta abierta y reancla aquí, sin muestra |
| Lote stale/missing/inválido | No mide nada nuevo; conserva la ventana ya medida |
| Depósito con procedencia no observada | `FreshnessInvalid`; no siembra la ventana |

El riesgo es asimétrico y la decisión sigue el mismo criterio que ISA-372: no
publicar no puede producir un número incorrecto; medir una vuelta contaminada
por un repostaje sí, y encima el error se arrastra dentro de la media.

## 2. La ventana

Ventana móvil acotada, configurable con `Config.FuelUsageWindow`. Por defecto
**3 vueltas válidas** (`DefaultFuelUsageWindow`), máximo 10
(`MaxFuelUsageWindow`); cualquier valor fuera de rango cae al valor por defecto
y nunca puede ampliarlo.

Tres vueltas y no treinta porque el consumo sigue la carga de combustible, el
estado del neumático y el tráfico: una media larga es más estable pero describe
un coche que ya no existe, y es exactamente la decisión de estrategia que
alimenta la que se vuelve peor.

## 3. Reset y aislamiento

El tracker se reinicia entero ante un cambio de `epoch`, de `SessionID` **o de
`StintID`**. El stint importa: un stint nuevo es, en la práctica, un depósito
nuevo, y arrastrar la media del anterior es exactamente el fallo que la
invalidación por repostaje evita dentro de la vuelta.

`Prepare` clona el tracker de forma eager (la ventana tiene como mucho 10
entradas), a diferencia del copy-on-write que el historial del delta necesita
por tamaño. `Commit` publica el clon. El tracker comprometido nunca se muta
mientras se prepara un candidato.

Nueva `AlgorithmVersion`: `fuel.per-lap@1`.

## 4. Precedencia en el builder

`BuildFuel` no calcula el consumo: lee `Derived.Fuel.PerLap` y lo convierte a la
unidad preferida. `estimatedLaps` sí gana una precedencia, y la **publica**:

| Orden | `basis` | Aritmética | Cuándo gana |
| --- | --- | --- | --- |
| 1 | `fuel` | `floor(remaining / perLap)` | Siempre que exista consumo canónico utilizable |
| 2 | `session` | `ceil(sessionRemaining / lastLapTime)` | Reserva, mientras no haya ninguna vuelta medida |

La base de combustible gana porque es la pregunta que el widget de combustible
hace realmente —cuántas vueltas permite el depósito— y porque sus dos entradas
son canónicas y del mismo concepto. **Redondea hacia abajo**: una vuelta a medio
repostar no es una vuelta que el piloto pueda completar, y redondearla hacia
arriba es justo el error que este widget no puede cometer.

Las dos conservan la peor calidad de sus entradas: una estimación construida
sobre una entrada stale se publica stale, nunca fresh.

`fuel.basis` es un campo **aditivo** del contrato wire v2 (`omitempty`), con TS
regenerado por `telemetry-contract-gen` y aceptado como opcional acotado
(`"fuel"` | `"session"`) por el validador del transporte. Existe para que el
consumidor pueda distinguir las dos respuestas en vez de adivinar cuál de las
dos aritméticas produjo el número; el comparador de sombra depende de ello.

### `requiredFuel` sigue ausente, con motivo

`requiredFuel` es `perLap × vueltas restantes **de sesión**`. Esa proyección ya
no es siempre el `estimatedLaps` publicado, porque la base de combustible gana
cuando existe. Poblarlo exigiría un segundo campo de vueltas en el frame que
ningún consumidor ha pedido, así que se declara ausente en vez de aproximarlo
con la base que resultara ganar. Es la misma regla de ISA-372: declarar ausente
no puede producir un número incorrecto.

`fuel.fuelPercent` y `fuel.history` siguen ausentes por los motivos originales.

## 5. Diferencia intencional frente a Overlay v1

**El valor puede diferir del que muestra Overlay v1, y es correcto que difiera.**

| | Overlay v1 (`avgPerLap`) | Canónico (`fuel.perLap`) |
| --- | --- | --- |
| Fuente | `derived.fuelHistory` del snapshot TS | Stream canónico en `derive/` |
| Ventana | Las últimas `content.historyRows` filas del acumulador | Las últimas 3 vueltas **válidas** |
| Inicio | Cuando el widget se monta en el navegador | Cuando empieza el stint |
| Validez | Toda fila del acumulador cuenta | Boxes, repostaje y saltos de vuelta excluidos |
| Redondeo | A 2 decimales dentro del widget | Ninguno; el valor viaja íntegro |
| Autoridad | Una por widget montado | **Una por concepto** |

Las dos medias responden a la misma intención con criterios distintos, así que
divergen de forma esperada: distinto arranque, distinta retención y, sobre todo,
distinto criterio de validez. Dos widgets de v1 montados en momentos distintos
podían además mostrar dos medias diferentes a la vez; el canónico no puede.

**El canónico es la autoridad.** No porque sea nuevo, sino porque excluye las
vueltas que el acumulador del navegador no sabía excluir y porque hay uno solo.

Consecuencia en el comparador de sombra
(`overlay-shadow-comparator.ts`), para que la diferencia no ensucie el gate:

- `avgPerLap` pasa de hueco declarado a **diferencia intencional**: los dos
  lados lo publican, pero no se compara nunca como valor.
- `lapsRemaining` se compara **estrictamente solo bajo `basis: "session"`**, que
  es cuando las dos partes responden a la misma pregunta. Bajo `basis: "fuel"`
  no se compara, porque la respuesta es deliberadamente otra.

Ambos se exponen en `OVERLAY_V2_FUEL_INTENTIONAL_DIFFERENCES`, junto al
ViewModel que los declara, y el comparador los reexporta para no tener dos
copias. `OVERLAY_V2_FUEL_DECLARED_GAPS` queda reducido a lo que el frame
realmente no publica: `fuelPercent`, `requiredFuel`, `history`.

## 6. Goldens tocados

| Golden | Cambio | Motivo |
| --- | --- | --- |
| `derive/testdata/overlay_timing_v1.golden.json` | +1 línea | La nueva `AlgorithmVersion` `fuel.per-lap@1` entra en la lista publicada |
| `overlayv2/testdata/overlay_v2_{1,20,44,104}.golden.json` | +1 línea cada uno | `"basis": "session"`; la fixture no mide ninguna vuelta, así que `perLap` queda missing y gana la reserva |

No cambia ningún valor existente en ningún golden: los dos cambios son
estrictamente aditivos. El incremento del frame es de un campo corto por frame,
constante y no proporcional a la parrilla.

## 7. Verificación

- `go test ./tools/... ./internal/telemetry/... ./internal/app/...` PASS
  (excluido `internal/app/launcher`, con panic preexistente en esta base).
- Centinelas `TestCachedProjectorMatchesProjectV2ByteForByte` y
  `TestFrameV2SyntheticFullUnder64KiBWith104Vehicles` PASS.
- Paridad de replay por digest (`recording/replay`) PASS sin regenerar.
- `go run ./tools/telemetry-contract-gen -check` PASS tras regenerar TS.
- `pnpm --dir frontend test` PASS (372 archivos, 2.876 tests).
- `go vet ./internal/telemetry/...` limpio salvo los avisos `unsafe.Pointer`
  preexistentes. `go build ./...` limpio salvo `build/ios`, roto en esta base.
- `git diff --check` limpio.

Verificación manual: en sesión real, completar tres vueltas limpias y comprobar
que `fuel.perLap` aparece con `basis: "fuel"` y vueltas restantes coherentes con
el depósito; entrar a boxes y repostar, y comprobar que la media **no** se
mueve por esa vuelta.

## 8. Pendientes

- Muestreo en sesión real de
  `overlay_shadow_mismatches_total{feature="fuel",field="status",phase="live"}`
  antes de considerar la feature conmutable.
- `fuel.requiredFuel` sigue ausente; si un consumidor lo pide, la decisión
  pendiente es publicar las vueltas de sesión como campo propio en vez de
  reutilizar `estimatedLaps`.
- La ventana por defecto (3) no es configurable desde el runtime todavía:
  `Config.FuelUsageWindow` existe, pero nadie la pasa.
