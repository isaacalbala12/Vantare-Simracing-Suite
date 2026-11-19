# Desviaciones del oráculo Go

El cálculo de Estrategia se portó de Go a Rust comparando contra resultados
congelados de Go (`testdata/oracle/`). Esos ficheros **no se editan**: son la
referencia histórica y `tests/oracle_hashes.rs` vigila sus huellas.

Cuando el cálculo se aparta de Go **a propósito**, queda escrito aquí, caso a
caso, y en un fichero de expectativas aparte que los tests de paridad usan en
lugar de Go. Cualquier otra diferencia con Go sigue haciendo fallar esos tests.

## #2691 · El desgaste de neumáticos se acumula si no se cambian ruedas

**Qué hacía Go (y el port).** El desgaste de cada tramo se contaba desde cero:
la vuelta `k` del tramo perdía `pérdida × (k − 1)`, aunque la parada anterior
no hubiera cambiado ruedas. «No cambiar ruedas» solo ahorraba su tiempo en
boxes. El plan salía más rápido que lo real.

**Qué hace ahora.** Cada vuelta paga según la **edad de las ruedas** (las
vueltas que llevan rodadas), y la edad solo vuelve a cero al montar ruedas
nuevas. Un tramo de `n` vueltas que empieza con ruedas de edad `e` paga lo de
antes más `pérdida × e × n`. El modelo completo está en el `README.md` del
crate, sección «Desgaste de neumáticos acumulado».

**Decisión.** Isaac (raíz), 19-11-2026, en la issue #2691: «acumular el desgaste
cuando no se cambian ruedas, porque es el modelo correcto. Apartarse del oráculo
Go en esos casos es aceptable (el oráculo heredó el error); se documentará caso
a caso».

### Los cuatro casos del oráculo que cambian

De los 334 casos de solver y los 3 de escenarios de `testdata/oracle`, diez
tienen en su resultado una parada sin cambio de ruedas. Seis
(`solver-extended.json`: `edit-0-no-tyres`, `edit-1-no-tyres`,
`edit-4-no-tyres`, `edit-5-no-tyres`, `edit-6-no-tyres`, `edit-7-no-tyres`)
tienen desgaste 0 y **no cambian**. Cambian estos cuatro, todos de
`solver-tyres.json`.

Los cuatro comparten carrera: 5 vueltas a 90 s, depósito de 4 L a 1 L por
vuelta (hace falta una parada), 10 s de paso por boxes, 0,5 s por litro de
carga, 3 s de cambio de ruedas, 3 s de formación, sin vida máxima de ruedas.
Blando: 1 s más rápido por vuelta y 0,8 s de pérdida por vuelta de edad. Duro:
0,1 s de pérdida por vuelta de edad. `sets1` tiene un juego de cada compuesto;
`sets2`, dos.

**Antes (Go), en los cuatro:** blando, tramos de 2 y 3 vueltas, sin cambiar
ruedas en la parada. Desgaste 0,8 × 1 + 0,8 × (1 + 2) = **3,2 s**. Total
450 − 5 + 3,2 + 10,5 + 3 = **461,7 s**.

**Ese mismo plan, ahora:** las cinco vueltas van con las mismas ruedas, así que
el desgaste es 0,8 × (0 + 1 + 2 + 3 + 4) = **8,0 s** y el total **466,5 s**.
Deja de ser el mejor.

| Caso | Servicio | Juegos | Antes (Go) | Ahora | Plan nuevo |
|---|---|---|---|---|---|
| `tyres-parallel-life0-sets1` | en paralelo | 1 | 461,7 s (desgaste 3,2 s) | **464,5 s** (desgaste 1,0 s) | duro, tramos de 1 y 4 vueltas, sin cambiar ruedas |
| `tyres-parallel-life0-sets2` | en paralelo | 2 | 461,7 s (desgaste 3,2 s) | **464,2 s** (desgaste 3,2 s) | blando 2 vueltas y otro juego de blando nuevo 3 vueltas |
| `tyres-sequential-life0-sets1` | en serie | 1 | 461,7 s (desgaste 3,2 s) | **464,5 s** (desgaste 1,0 s) | duro, tramos de 1 y 4 vueltas, sin cambiar ruedas |
| `tyres-sequential-life0-sets2` | en serie | 2 | 461,7 s (desgaste 3,2 s) | **464,5 s** (desgaste 1,0 s) | duro, tramos de 1 y 4 vueltas, sin cambiar ruedas |

Las cuentas del plan nuevo:

- **Duro sin cambiar** (los tres casos de 464,5 s): desgaste
  0,1 × (0 + 1 + 2 + 3 + 4) = 1,0 s; parada de 10 + 0,5 = 10,5 s. Total
  450 + 1,0 + 10,5 + 3 = 464,5 s. Con las mismas ruedas da igual dónde se pare:
  los repartos 1+4, 2+3, 3+2 y 4+1 empatan y se publica el primero.
- **Blando y otro juego de blando** (`parallel-sets2`): desgaste
  0,8 × 1 + 0,8 × (1 + 2) = 3,2 s; en paralelo la parada dura lo que tarda lo
  más lento, las ruedas: 10 + 3 = 13 s. Total 450 − 5 + 3,2 + 13 + 3 = 464,2 s,
  mejor que el duro sin cambiar.
- En serie (`sequential-sets2`) ese mismo plan paga carga y ruedas una detrás
  de otra, 10 + 0,5 + 3 = 13,5 s, y se queda en 464,7 s: gana el duro.
- Con un solo juego de cada compuesto (`sets1`), pasar de blando a duro cuesta
  465,1 s en paralelo y 465,6 s en serie: gana el duro sin cambiar.

Efecto que se ve: estirar un blando que pierde 0,8 s por vuelta deja de salir a
cuenta. El cálculo prefiere el duro o montar otro juego.

### Cómo queda sujeto en los tests

- `testdata/oracle-deviations/2691-tyre-wear.json` guarda, por caso: lo que
  decía Go (`go`), lo que vale ahora el plan de Go (`goPlanNow`) y lo esperado
  ahora (`result`: evaluación, reserva, caso adverso y el plan).
- Los tests de paridad (`src/solver/parity_tests.rs`) comparan esos cuatro
  casos con `result` y el resto con Go. Además comprueban que Go sigue diciendo
  lo anotado.
- `deviations_from_the_go_oracle_are_the_four_reviewed_tyre_cases` exige que
  la lista sea exactamente esa, que el plan de Go tenga una parada sin cambio
  de ruedas, que ese plan valga ahora 8,0 s de desgaste y 466,5 s, y que lo
  esperado quede entre lo que decía Go y eso. El fichero lleva su huella
  SHA-256 en el test: tocarlo sin revisarlo falla.
- `tests/tyre_wear.rs` comprueba los cuatro contra un modelo independiente
  (una búsqueda propia que prueba todas las decisiones): el mejor plan vale
  464,5 / 464,2 / 464,5 / 464,5 s.

### Huellas del cálculo que cambian

`tests/unfixed_fingerprints.rs` guarda la huella de 696 resultados. Antes de
tocar el modelo se guardó cada uno troceado por partes
(`testdata/unfixed/partes/`, que no se regenera) y lo que #2691 cambia está
listado, parte a parte, con su antes y su después, en
`testdata/unfixed/desviaciones-2691/`. El test falla si cambia una parte que no
está en la lista, y también si una parte listada no podía cambiar: solo puede
hacerlo una parte cuyo plan no cambia ruedas en alguna parada, o una búsqueda
con inventario físico de neumáticos (que prueba planes sin cambio aunque no los
elija).

**Cambian 76 de las 696.** Las otras 620 son idénticas, entre ellas todas las
del camino del Hub (`manual`, 21), las de los oráculos escalares (125) y las de
pasos finos (24).

**Oráculos extendidos: 9 de 206**, todas en la parte de la búsqueda (`solve`):

| Caso | Qué cambia | Mejor plan y coste |
|---|---|---|
| `tyres/tyres-parallel-life0-sets1` | el mejor plan (ver arriba) | 461,7 → 464,5 s |
| `tyres/tyres-parallel-life0-sets2` | el mejor plan | 461,7 → 464,2 s |
| `tyres/tyres-sequential-life0-sets1` | el mejor plan | 461,7 → 464,5 s |
| `tyres/tyres-sequential-life0-sets2` | el mejor plan | 461,7 → 464,5 s |
| `tyres/tyres-discarded` | tres candidatos con una parada sin cambio: 476,2 → 476,4 s | igual: 466,4 s |
| `weather/weather-allowed` | cuatro candidatos con una parada sin cambio: 491,9 → 492,1 s | igual: 482,1 s |
| `weather/weather-override-compound` | candidatos con una parada sin cambio: 465,0 → 465,1 s y 465,5 → 465,6 s | igual: 455,1 s |
| `weather/weather-driver` | la lista de candidatos y el certificado: de «no comprobado» (se agotaba la memoria de la búsqueda) a **comprobado** | igual: 461,0 s |
| `tyres/tyres-reuse` | solo un contador de la búsqueda (comparaciones: 6.887.658 → 6.731.028); sigue «no comprobado» por memoria | igual: 646,0 s |

En `weather-driver` y `tyres-reuse` la búsqueda trabaja menos; se explica más
abajo, con sus contadores.

**Entradas generadas: 67 de 320**, todas en la misma parte
(`noEnergyNorTyresAtLastStop`): un replay que el test estropea a propósito
quitando la energía y el cambio de ruedas de la última parada. El último tramo
empieza con las ruedas del anterior y paga de más
`pérdida × vueltas del tramo anterior × vueltas del último`. El test comprueba
esa fórmula en los 67 (entre 0,05 s y 84 s de más) y que el resto de cada caso
(búsqueda, respaldo, recálculo, los demás replays) no se mueve. Ninguno cambia
de «plan válido» a «no válido» ni al revés. Los valores de cada uno están en
`testdata/unfixed/desviaciones-2691/generated.json`.

### `weather-driver`: de «no comprobado» a «comprobado»

Es el único cambio visible de certificado. El plan y el coste **no cambian**:

| | Antes | Ahora |
|---|---|---|
| Plan | el piloto «b» hace las cinco vueltas con el duro, sin parar | el mismo |
| Tiempo | 461,0 s | 461,0 s |
| Certificado | `not_proven`, motivo `frontier_memory_budget_exhausted` | `proven` |

**Por qué antes no se comprobaba.** La búsqueda extendida guarda como mucho
4.096 planes a medias a la vez. En esta carrera (dos pilotos, clima, un juego de
cada compuesto) se llenaba antes de terminar, así que devolvía el mejor plan
encontrado sin poder decir que era el mejor.

**Por qué ahora sí.** No se ha tocado la regla de poda. Lo que cambia son los
costes que compara. Antes, con las mismas ruedas, el desgaste pagado dependía de
dónde se hubiera parado: dos tramos de 2 vueltas pagaban menos que uno de 1 y
otro de 3. Dos planes con las mismas ruedas, la misma edad y las mismas paradas
podían llegar a una vuelta con costes distintos y combustibles distintos, y
ninguno descartaba al otro: había que guardar los dos. Ahora esos dos planes
han pagado exactamente el mismo desgaste, lo repartan como lo repartan; solo se
diferencian por lo cargado en boxes y por el combustible que llevan, y quedan
muchos menos sin descartar. La memoria alcanza y la búsqueda termina.

**Comprobación independiente.** `tests/tyre_wear.rs` lleva una búsqueda propia
para este tipo de carrera (`Wet`): recorre quién conduce cada tramo, cuánto
dura, cuánto se carga en cada parada y qué ruedas se llevan, con el clima y el
consumo de cada vuelta contados aparte del crate.

- `weather_driver_is_proven_and_its_plan_is_really_the_fastest`: en
  `weather-driver` el mejor plan posible vale 461,0 s, y es el que publica la
  búsqueda, ahora como `proven`.
- `races_like_weather_driver_are_only_proven_with_the_fastest_plan`: carreras
  del mismo tipo con otros números (vueltas, pronóstico, depósito, desgastes,
  tiempos de boxes, ritmo y consumo de cada piloto en mojado). La búsqueda nunca
  publica un plan más rápido que el mejor posible y, siempre que dice `proven`,
  es ese.
- `long_hunt_for_a_proven_plan_that_is_not_the_fastest` (ignorado por defecto):
  lo mismo con más carreras. Ejecutado el 19-11-2026 con 150: 94 quedan
  `proven`, las 94 con el mejor plan posible; 89 con parada, 49 con alguna
  parada sin cambio de ruedas y 46 con cambio de piloto. Ningún contraejemplo.
  Con la semilla del test se comprobaron además 70 carreras; en el test quedan
  las 12 primeras para que no tarde.

### La poda de la búsqueda extendida y por qué sigue siendo segura

La búsqueda avanza vuelta a vuelta. En cada vuelta guarda planes a medias, todos
recién salidos de una parada en esa misma vuelta, y descarta un plan `r` cuando
otro `l` «lo domina» (`dominates` en `src/solver/search.rs`). Para dominar, `l`
tiene que cumplir todo esto frente a `r`:

| Tiene que ser igual | Por qué |
|---|---|
| Vuelta | se comparan solo planes de la misma vuelta: el clima y el consumo que quedan por delante son los mismos |
| Juego de ruedas montado | compuesto y ruedas concretas: de ahí salen el ritmo, el desgaste y qué juegos quedan |
| Lo que ha rodado cada rueda del inventario | la vida que le queda a cada juego y, desde #2691, el desgaste de volver a montarlo |
| Edad de las ruedas montadas | la vida que les queda y, desde #2691, su desgaste |
| Estado de los pilotos | quién conduce y lo que lleva conducido cada uno (límites de piloto) |
| Ventanas de parada ya cumplidas y compuestos obligatorios ya usados | lo que todavía obliga el reglamento |
| Número de paradas, si hay mínimo, máximo, orden de pilotos o algo fijado a mano | lo que todavía obliga el reglamento |
| Combustible, si el peso del combustible cuesta tiempo | llevar más sería más lento |
| Consumo acumulado, si la reserva es un porcentaje de lo gastado | la reserva que se exigirá en meta |
| Tiempo total, en carreras por tiempo o con pilotos no disponibles a ciertas horas | el reloj decide qué se puede hacer después |

Y además: `l` no lleva menos combustible ni menos energía que `r`, no ha hecho
más paradas, y su tiempo no es peor.

**El argumento.** Lo que le queda por pagar a un plan desde una vuelta depende
solo de lo que hay en esa tabla: cada tramo futuro cuesta según la vuelta en que
empieza, sus vueltas, el piloto, el compuesto y la **edad de las ruedas**; cada
parada futura, según lo que se cargue y si se cambian ruedas. Antes de #2691 el
desgaste futuro no dependía de la edad (solo la vida máxima); ahora sí, y la
edad ya estaba en la tabla, como «igual», porque la vida máxima la necesitaba.
Así que cualquier final de carrera que pueda hacer `r` lo puede hacer `l`,
cuesta lo mismo de ahí en adelante, y `l` llega con un tiempo que no es peor:
descartar `r` no pierde ningún plan mejor. La regla no se ha tocado en #2691.

En la búsqueda escalar (la del Hub) no hay regla de dominancia: se queda con el
mejor plan de cada clave exacta `(combustible, energía, paradas, ventanas,
edad de las ruedas)`. La edad se añadió a la clave en #2691 porque ahora decide
el futuro; sin ella, los tests contra la fuerza bruta fallan
(`tests/fixed_tyres.rs`).

Un límite que ya existía y que #2691 no cambia: la regla «`l` lleva al menos
tanto combustible como `r`» da por hecho que a `l` le cabe cualquier carga que
le quepa a `r`. Con consumos por vuelta distintos según el piloto o el clima,
dos planes pueden diferir en una fracción del paso de carga. Las 220 carreras
de este tipo comparadas con la búsqueda propia (70 con la semilla del test y
150 en la búsqueda larga) no han dado ningún plan «comprobado» que no sea el
mejor; eso no demuestra que no pueda pasar con otras entradas.

### Efecto sobre el trabajo de la búsqueda

Contadores del certificado de las dos búsquedas del corpus en que cambian, con
el código de antes y el de ahora sobre la misma entrada:

| Caso | Contador | Antes | Ahora |
|---|---|---|---|
| `weather/weather-driver` | cargas probadas (`exploredWorkItems`) | 6.785 (cortada) | 5.900 (terminada) |
| | comparaciones entre planes (`iterations`) | 11.769.463 | 5.310.239 |
| | planes descartados (`prunedStates`) | 3.745 | 3.936 |
| | estado | `not_proven` (memoria) | `proven` |
| `tyres/tyres-reuse` | cargas probadas | 12.017 (cortada) | 12.017 (cortada) |
| | comparaciones entre planes | 6.887.658 | 6.731.028 |
| | planes descartados | 8.649 | 8.649 |
| | estado | `not_proven` (memoria) | `not_proven` (memoria) |

En los otros siete casos listados los tres contadores son idénticos antes y
ahora (424, 952, 8.232, 952, 8.232, 128 y 608 cargas probadas).

### Qué no cambia

- Un plan en que todas las paradas montan ruedas nuevas se evalúa con las
  mismas cuentas, bit a bit. Es lo que hace el Hub.
- La vida máxima de las ruedas ya contaba la edad acumulada.
- El tiempo en boxes: sin cambio de ruedas no se paga su servicio, como antes.
