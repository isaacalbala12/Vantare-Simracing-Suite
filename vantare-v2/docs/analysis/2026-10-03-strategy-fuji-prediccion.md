# Fuji 6 h — predicción ciega, ronda 1 (#1450)

Fecha: 2026-10-03. Referencia: [GitHub #1450](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1450), incluido el comentario de Isaac que sustituye el protocolo inicial. Worker Codex; revisión pendiente de Claude Opus 5.5. Notion indisponible; Isaac autoriza expresamente trabajar solo con GitHub en este encargo. No se ha leído ni buscado la carrera reservada ni `no-usar/`. Este informe y su entrada se congelan en el commit de predicción; la comparación posterior pertenece a otro informe.

## Predicción sellada

**236 vueltas, 5 paradas, stints 43 / 42 / 42 / 43 / 42 / 24.** Tres pilotos hipotéticos A/B/C, rotación A→B→C→A→B→C, medios nuevos en cada parada. Última vuelta comienza en **5:59:33,217** y termina en **6:01:03,689**; dura 90,472412 s en el modelo. Tiempo de boxes acumulado: **312,200 s**. Reserva final: **2,091680 L y 2,470256 % VE**, equivalente a 1,066695 vueltas del recurso limitante, por encima de las 0,8 exigidas.

Veredicto: **lógico con los supuestos indicados; dudoso como recomendación robusta y como demostración del optimizador completo**. Es una predicción manual validada con el replay productivo Rust y la cuadrícula de servicio 1 L / 1 % de la entrada. La búsqueda automática con duración y pilotos no encontró un plan dentro del presupuesto: no se presenta este replay como su resultado óptimo. Una búsqueda auxiliar a distancia fija recuperó cinco paradas para 236 vueltas, con otra distribución, una discretización mucho más restringida y exceso de carga final.

| Stint | Piloto supuesto | Vueltas | Consumo L / % VE | Repostar / recargar al terminar | Pérdida parada (s) | Neumáticos al parar |
|---|---|---|---|---|---|---|
| 1 | A | 1–43 (43) | 78,695 / 99,580 | 78 L / 99 % | 64,600 | Medios nuevos |
| 2 | B | 44–85 (42) | 76,865 / 97,264 | 77 L / 97 % | 63,800 | Medios nuevos |
| 3 | C | 86–127 (42) | 76,865 / 97,264 | 77 L / 98 % | 64,200 | Medios nuevos |
| 4 | A | 128–170 (43) | 78,695 / 99,580 | 79 L / 99 % | 64,600 | Medios nuevos |
| 5 | B | 171–212 (42) | 76,865 / 97,264 | 41 L / 56 % | 55,000 | Medios nuevos |
| 6 | C | 213–236 (24) | 43,923 / 55,579 | Sin parada | — | Fin |

Salida inicial: 82 L / 100 % VE. Antes de las cinco paradas quedan entre 2,879600 y 5,014560 L, y entre 0,313320 y 2,156660 % VE. En el sexto se sale con 46,014560 L y 58,049552 % VE. Cinco cambios de piloto y cuatro medios nuevos por parada: seis juegos incluido el inicial, sin disponibilidad real certificada. Tiempo de conducción modelado: A **2:09:40,627**, B **2:06:39,683**, C **1:39:31,179**. No incluye boxes como tiempo de conducción.

La cuadrícula importa: después de consumir 99,579572 % VE en 43 vueltas, quedan 0,420428 %. Recargar 100 % como **cantidad** excedería la capacidad; recargar el máximo entero admisible, 99 %, deja 99,420428 %, suficiente para 42 vueltas, no 43. Se llena Fuel y VE hasta el máximo admisible de la cuadrícula en las cuatro primeras paradas; en la quinta, solo lo necesario para el tramo final y la reserva. Así se obtiene la distribución sellada, sin fingir que la recarga discreta deja siempre el depósito exactamente lleno.

## Fuente y método de medición

Único fichero abierto: `C:/tmp/strategy-real/practica/Fuji Speedway_R_2026-10-03T10_23_55Z.duckdb`, read-only. Su SHA-256 está en `C:/tmp/isa-1450-evidence/measurements.json`, campo `db_sha256`; los hashes de QA se conservan fuera del repo. Metadata: Alejandro Nadales, BMWMH Custom Team 2026 #397, Hyper, Fuji Speedway, Race, Cubierto. El nombre «práctica» es el papel asignado por Isaac a esta grabación; su metadata dice Race.

`Lap` y `Lap Time` son eventos `(ts,value)`. Fuel y VE tienen 81.793 muestras a 20 Hz; desgaste 40.897 a 10 Hz (`channelsList`). Su reloj implícito se reconstruye como `primer GPS Time + índice/frecuencia`: origen 29,8325 s, final de recursos 4119,4325 s. GPS tiene 408.964 muestras a 100 Hz y pasos de 0,01 s sin huecos observados, hasta 4119,4625 s. Es una hipótesis de alineación del formato corroborada por tamaños, extremos y coincidencia entre entrada a boxes, velocidad, recarga y reinicio del desgaste; estos canales no traen timestamps individuales. Cada frontera de vuelta usa la muestra anterior, con resolución de 50 ms en recursos y 100 ms en desgaste.

Para cada vuelta completada n: intervalo entre eventos `Lap=n-1` y `Lap=n`; tiempo oficial de `Lap Time` en su extremo; consumo y desgaste como valor inicial menos final. Se excluyen la primera vuelta (salida/formación), cualquier intervalo de `In Pits=1` o limitador, cualquier bandera sectorial diferente del estado basal 11 y cualquier `Yellow Flag State!=0`, además de recursos no monotónicos. No se interpreta el enum sectorial como una regla deportiva: el filtro estricto elimina **todos** los estados distintos del basal, aunque alguno fuera inocuo. No se seleccionan vueltas por ser rápidas. No hay una bandera de validez de vuelta explícita; incidentes sin estos eventos podrían permanecer.

Quedan **21 vueltas**: 5, 7, 14, 19, 20, 21, 24, 25, 26, 27, 29, 30, 32, 33, 35, 36, 37, 38, 39, 41, 42. Los motivos de exclusión de las 43 vueltas están en `laps.json` de la evidencia.

| Magnitud | Valor para el plan | Dispersión observada |
|---|---|---|
| Ritmo limpio | Mediana **90,472412 s** | Media 90,615821; DE 0,609180; P10 90,100586; P90 91,379395; rango 89,622437–92,112671 |
| Fuel | Media **1,830120 L/v** | Mediana 1,831132; DE 0,031777; P10 1,792649; P90 1,876587 |
| VE | Media **2,315804 puntos %/v** | Mediana 2,308076; DE 0,032950; P10 2,278412; P90 2,366348 |
| Desgaste FL / FR / RL / RR | Media **1,053961 / 0,749563 / 0,925490 / 0,845134 puntos %/v** | DE 0,070902 / 0,061671 / 0,053525 / 0,044777; `measurements.json` conserva el detalle |

Las 41 vueltas 2–42 sin filtrar banderas dan mediana 90,763916 s, próxima al ≈1:30,8 comunicado; el filtro explica que la mediana limpia sea más rápida. Se usa media para consumos, mediana para ritmo; DE muestral y P10/P90 por índice `floor((n−1)·p)` de las muestras ordenadas. El solver cuantiza cantidades a seis decimales; no representa precisión física de microlitros.

Compuesto observado: `TyresCompound=(0,0,0,0)` sin cambios de código, corroborado por `CarSetup.VM_FRONT_TIRE_COMPOUND.stringValue` y su equivalente trasero: **Medio**. No se deduce «soft» del código cero. Justo antes de boxes queda aproximadamente **54,897 / 68,149 / 58,692 / 62,247 %** de vida. Hay un reinicio a 100 % durante el servicio terminal; no demuestra cuánto tiempo exige un cambio completo ni que doblar stint sea seguro.

### Boxes y recargas: observación parcial

La única transición a `In Pits=1` es a **4098,960 s**; el limitador se activa a 4097,705 s y no se desactiva antes del corte. Lap 43 vale 94,925537 s: exceso de entrada frente a la mediana limpia **4,453125 s**. **No hay vuelta de salida ni parada completa**, por lo que la pérdida «entrada + salida − dos vueltas limpias» no es medible.

Velocidad <1 km/h: intervalos terminales 4110,3125–4112,7325 (2,42 s) y 4112,8225–4119,4625 (≥6,64 s), separados por 90 ms de movimiento. Total observado ≥9,06 s; estancia hasta el corte desde el primer estacionamiento ≥9,15 s. No es la duración final del servicio. Los 72,85 s detenidos al principio son previos a la salida y se excluyen del coste de boxes.

La VE aumenta desde 4110,4825 s; Fuel desde 4112,5325 s. Ambos siguen aumentando al corte. Pendiente en 4113–4119 s (120 incrementos a 20 Hz): **4,000000 L/s** y **2,500000 puntos % VE/s** de media; medianas 3,984375 y 2,490244 por cuantización. Son velocidades observadas de un servicio censurado, no el tiempo de llenar el depósito. Fuel mínimo observado 2,885709 L y VE mínima 0,313588 %: la práctica también apura especialmente la VE.

## Supuestos y origen, sin reglas inventadas

| Entrada / decisión | Origen y límite |
|---|---|
| Fuji, BMW Hypercar 2026, 6 h | Instrucción de Isaac. Solo esta versión/coche. |
| Capacidades 82 L / 100 % VE | Máximo observado de la práctica y dato de Isaac. 82 L no certifica capacidad homologada física. |
| Ritmo, consumo y pendientes de recarga | Datos medidos arriba, cargados como overrides manuales con `sourceId` de la práctica. No se simula una proyección Analysis productiva ni se atribuye un perfil observado a B/C. |
| Condiciones constantes | Supuesto: mismo clima/ritmo/consumo de práctica, sin lluvia, neutralizaciones, averías, sanciones ni pérdida adicional por tráfico. La grabación dice Cubierto; no acredita seis horas sin cambios. |
| Tránsito/pérdida fija boxes 25 s; neumáticos 30 s | Supuestos del worker, **no medidos ni defaults WEC**. El exceso de entrada de 4,453 s no basta para deducir el tránsito completo. |
| Servicio paralelo | Hipótesis apoyada por recargas solapadas. Fórmula nativa `25 + max(Fuel/4, VE/2,5, neumáticos si cambian)`. No acredita que neumáticos o cambios de piloto se solapen por reglamento. |
| Tres pilotos A/B/C, igualdad de prestaciones | Supuesto del worker ante número desconocido. A no representa una identidad de piloto confirmada para la carrera. `driverSequence` obliga a rotar por stint. |
| Mínimos/máximos de conducción | **Ausentes**, conforme al modelo nativo cuando no se entregan `driverLimits`. No hay default WEC/Hypercar que se pueda aplicar automáticamente: `Input.event_rules`, `Dimensions.driver_profiles/driver_sequence` y `DriverLimit` reciben reglas explícitas; `Rules::default()` no añade límites. `drivers.rs` solo comprueba los que se configuran. No se certifica cumplimiento reglamentario real. |
| Tiempo específico de cambio de piloto | No tiene un término independiente en `PitCost`; se supone absorbido por el servicio más largo. No medido. |
| Neumáticos medios nuevos cada parada; vida máxima 43 vueltas | Política conservadora del worker apoyada en un stint observado de 43 vueltas, **no estimación de vida hasta fallo**. Sin inventario físico conocido ni límite de juegos. El input usa vida escalar, sin `compoundPace`/inventario: el replay no certifica disponibilidad ni identidad del compuesto. «Medios» es la política del informe. |
| Degradación temporal 0; sin ahorro ni efecto peso | Supuesto de mantener el ritmo agregado. La práctica no aísla degradación de neumáticos de descarga de combustible/tráfico. No se usa desgaste % como segundos. |
| Formación 0 s | Default de trabajo asumido: reloj de seis horas desde carrera efectiva. No se ha definido si el evento incluye formación; tampoco se añade la salida lenta de práctica. |
| Reserva terminal 0,8 vueltas Fuel y VE | Referencia de producto ISA-832 en `docs/vantare-program/handoffs/strategy-planner.md`, aplicada por el worker a ambas reservas. El solver no la inyecta automáticamente. **Terminal**, no margen obligatorio en todas las paradas. |
| Última vuelta | Semántica nativa de duración: comienza antes de 21600 s y finaliza en/después de 21600 s (`solver/replay.rs`). No modela que otro líder dispare la bandera ni el ritmo multicategoría. |
| Horizonte 240 vueltas; grid inicial 1 L / 1 % | Horizonte superior a las ≈239 vueltas sin boxes; valores explícitos. Búsqueda inicial 20.000 ms, 100.000 candidatos, 1.000.000 iteraciones: presupuesto de auditoría del worker, no promesa de rendimiento ni default deportivo. El formulario Hub fija 2.000 ms, 250.000 candidatos y el mismo millón de iteraciones (`native/hub/src/strategy.rs`); no se ha presentado el presupuesto de auditoría como ese default. |

## Ejecución nativa y revisión de lógica

Entrada reproducible: [`native/strategy/testdata/fuji-1450-input.json`](../../native/strategy/testdata/fuji-1450-input.json). Es `strategy.solver.v2`, compatible con `solver::Input`; no es un documento `strategy.v2` del editor. Está basada en los fixtures Rust y sus contratos. El fichero Go `internal/strategy/application/testdata/recorded-imola-input.json` solicitado como referencia no existe en esta base; no se ha fabricado ni buscado en la carrera reservada.

Se invocaron `solve_v2`, `replay_decision_v2` y `replay_decision_v2_with_resources` del crate productivo, desde un runner externo enlazado con su rlib. El solver permanece intacto. El replay usa explícitamente 82 L / 100 % iniciales y la decisión de la tabla, cuyas cinco cargas Fuel/VE son cantidades enteras compatibles con la cuadrícula inicial. No es una solución encontrada automáticamente por la búsqueda.

| Caso ejecutado | Resultado real | Interpretación |
|---|---|---|
| Duración 6 h + pilotos, grid 1/1 | `not_proven`, `iteration_budget_exhausted`, sin incumbent completo | No llega al resultado en 1.000.001 iteraciones. `feasible=false` aquí no significa carrera imposible. |
| Distancia fija 236, grid 1/1, sin pilotos | `not_proven`, `candidate_budget_exhausted`, sin plan | Tampoco valida optimalidad a distancia fija con este presupuesto. |
| Duración, 5 ventanas exactas 43/86/129/172/215, presupuesto ampliado | `not_proven`, `deadline_exceeded`, sin plan | Acotar ventanas no basta; agotó 20 s. |
| Distancia fija, grid de capacidades 82/100 | `no_solution` en esa grid | Añadir una capacidad entera al resto positivo no cabe. Discretización demasiado gruesa, no prueba de inviabilidad física. |
| Duración, grid 82/100 | `not_proven`, deadline, sin plan | Misma limitación y búsqueda interrumpida. |
| Distancia fija 236, iniciales 82/100, grid de un stint (78,695160 L / 99,579572 %) | **`proven` en `validated_discrete_input`, 6.675 iteraciones**; 43×5+21, cinco paradas | Es el óptimo de esa grid restringida, sin pilotos ni duración. Reposta un stint entero también en la última parada: acaba con **43,567480 L / 51,368116 % VE** y 6:01:15,648. Exceso causado por la grid, no decisión libre óptima. |
| Duración + pilotos, grid de un stint | `not_proven`, deadline, sin plan | El éxito a distancia fija no se generaliza a la carrera completa. |
| Predicción manual de la tabla, duración + pilotos, grid 1 L / 1 % | **Replay factible**, sin motivos de rechazo, ambas reservas satisfechas | Prueba aritmética y semántica de este plan en el modelo configurado; no certificado de óptimo global. |

Los tiempos de ejecución son evidencia de esta máquina compartida, no benchmarks comparables. Los logs/JSON íntegros y certificados están fuera del repo.

También se ejecutó Go mediante un harness externo, sin cambios de código en el repo. Su `SolverInputV2` actual no tiene los campos nativos `raceDurationSeconds`, `initialFuelLiters`, `initialVEPercent` ni `driverSequence`; tampoco su presupuesto tiene `maxIterations`. La primera llamada al replay rechazó sumar 236 vueltas frente a `raceLaps=240`. La referencia se adaptó explícitamente a **distancia fija 236 vueltas**, eliminando esos campos no soportados, sin alterar consumos, servicios ni la decisión; `go-fixed-input.json` y el harness guardan la adaptación. No es una comparación completa de seis horas ni de las reglas de rotación.

El replay Go es **factible** y reproduce **exactamente** los campos de evaluación Rust: 21663,689248 s totales y 312,199990 s de boxes. Usa carga inicial mínima canónica, reconstruible desde el balance como **81,372416 L / 99,686680 % VE**, frente a la salida explícita 82/100 de la predicción nativa. Por eso sus reservas finales son **1,464096 L / 2,156936 % VE**, también satisfechas, pero distintas. Su búsqueda `SolveV2Context`, acotada externamente a cinco segundos para mantener barata esta referencia, devuelve `context deadline exceeded`, sin plan automático. `compare_go.py` comprueba evaluación, vueltas, factibilidad y reservas; no confunde el error de búsqueda con inviabilidad del plan. La paridad del corpus congelado de los tests es evidencia adicional de contratos, no sustituto de esta comparación de Fuji limitada a distancia fija.

Comprobación a mano:

- `21600 / 90,472412 ≈ 238,75` vueltas sin boxes. Con 312,200 s de pérdida, `(21600 − 312,200) / 90,472412 ≈ 235,30`; por la última vuelta iniciada antes del final, **236** completadas.
- Fuel: `82 / 1,830120 ≈ 44,81` vueltas; VE: `100 / 2,315804 ≈ 43,18`. **VE limita**, no Fuel. 43 vueltas consumen 99,58 % VE; 44 consumirían 101,90 %.
- Cinco cargas completas más el stint final dan seis stints; `ceil(236 / 43) − 1 = 5` paradas. Con cuatro paradas solo caben 215 vueltas antes de considerar la reserva.
- Las cuatro primeras paradas cuestan `25 + max(Fuel/4, VE/2,5, 30)`: aproximadamente 64,6 / 63,8 / 64,2 / 64,6 s. La última, por 56 % VE y neumáticos, cuesta `25 + 30 = 55 s`.
- El replay reproduce el total y el comienzo de la última vuelta; el chequeo externo exige recursos no negativos, reservas finales y `última salida < 21600 ≤ final`. No hay corrección de cifras tras ver una carrera real.

### Lo que no cuadra o no está demostrado

1. **Búsqueda completa bloqueada por presupuesto**, incluso 20 s sin incumbent. Esto es un hallazgo de operatividad del cálculo, no prueba de un plan ilógico; no se ha cambiado ni optimizado el solver.
2. **Stints de 43 muy al límite**: en el primero quedan solo 0,420 % VE y en el cuarto 0,313 %. P90 observado de consumo VE: 2,366348 %/v; a ese consumo 43 vueltas gastarían 101,753 %. La propuesta nominal no cubre esa variación; tampoco una carga fija calculada con la media garantiza los tramos de 42 vueltas al P90. Una política de máximo **42** con recargas adaptadas al consumo real conserva el orden de cinco paradas y es un candidato para la ronda 2, no una modificación del sello principal. El desgaste no es el recurso limitante de la práctica.
3. **Ritmo optimista por mediana limpia**: usar la media limpia conduce a unas **235** vueltas; P10/P90 de ritmo, manteniendo este coste nominal de boxes, da aproximadamente **237/233**. Son sensibilidades deterministas, no intervalos de confianza ni probabilidades.
4. **Boxes censurados**: sin salida no se puede verificar ni tránsito 25 s, neumáticos 30 s ni coste del cambio de piloto. +10 s en cada parada suma +50 s; haría que la última vuelta 236 empezara después de las seis horas y habría que recalcular. El resultado está cerca de ese límite.
5. **Reglamento/equipo desconocidos**: no se conocen cantidad real de pilotos, tiempos mínimos, máximos, descansos, asignación de neumáticos, compatibilidad de servicios o formación. No se puede declarar un plan WEC reglamentariamente válido. No se inventan defaults para satisfacer ese requisito.
6. **No demuestra integración Hub/Analysis**: medición externa read-only y overrides; no prueba selección de revisiones, ingestión automática DuckDB, app en vivo, ni rendimiento. Sin acceso a la carrera reservada no hay comparación empírica ni confirmación de estrategia realista.
7. **La descripción «1 h» no fija la duración observada**: las 43 `Lap Time` suman 3939,988 s (≈65:40); la primera y última frontera dan una cifra equivalente. `Finish Status` permanece 0 en toda la grabación. No se ha supuesto que la entrada terminal a boxes pruebe el final de carrera ni que exista bandera de llegada. La ventana nominal de la práctica no se usa como duración de la carrera a predecir.

## Evidencia, gates y continuidad

Todo el material de QA está en `C:/tmp/isa-1450-evidence/`: `issue-1450.txt`, `schema.txt`, `inspect_practice.py`, `measure.py`, `measurements.json`, `laps.json`, `build_input.py`, los generadores de decisiones, `runner.rs/.exe`, salidas nativas, `fuji-grid-decision.json`, `native-grid-prediction-replay.json`, `plan-table-grid.json`, `summarize.py`, `go-reference/`, `go-fixed-input.json`, `go-result.json`, `go-comparison.json`, manifiesto de hashes y logs de gates. Los tres archivos con `grid` identifican la predicción principal; los ensayos anteriores se conservan como evidencia, sin convertirlos en predicciones alternativas selladas. En Git solo este informe y la entrada pequeña; sin dependencias nuevas, código productivo ni tests alterados.

Validación terminada antes del sello, con logs externos y código de salida 0:

| Gate | Resultado |
|---|---|
| `cargo check --workspace --all-targets -j 2` | Correcto |
| `cargo fmt --check` | Correcto |
| `cargo clippy --workspace --all-targets -j 2 -- -D warnings` | Correcto, sin warnings |
| `cargo nextest run --workspace --build-jobs 2 -j 2` | 1.017 pruebas pasadas, 4 omitidas; 261,447 s de ejecución |
| `cargo test --workspace --test lifecycle -j 2` | 5 pruebas Engineer y 11 Runtime pasadas, sin fallos |

Un único cargo del worker a la vez, a través de `C:/tmp/fase2/bin/cargo.cmd`. La primera ejecución Nextest también pasó, pero se invocó solo con `-j 2`, que limita los threads de pruebas, **no los de compilación**: se omitió por error `--build-jobs 2`. Se repitió el gate completo con ambos límites explícitos; `cargo-nextest-capped.log` es la evidencia definitiva, conservando el log inicial. No se afirma retrospectivamente que aquella compilación estuviera limitada a dos jobs. No se usa `cargo test -p`.

Las cuatro omisiones son tests ignorados por defecto que exigen simuladores en vivo: REST LMU, memoria compartida LMU (también compilada en el binario grabador) y ACC con broadcasting activo. No se han arrancado juegos ni ejecutado esas pruebas; el resultado no certifica runtime físico LMU/ACC. No se añaden tests que dupliquen el informe: el código productivo no cambia, y el runner, replay y comprobaciones externas verifican los datos y la decisión concreta.

Reproducción manual para el revisor: ejecutar `measure.py` sobre el único DuckDB autorizado; comparar hash y 21 vueltas admitidas; deserializar la fixture como `Input` y llamar `solve_v2`; para la tabla, llamar `replay_decision_v2_with_resources` con `fuji-grid-decision.json` y 82/100. `summarize.py --grid` comprueba las cantidades, servicios enteros y cierre temporal. El runner externo conserva el código de estas llamadas; enlazarlo con la rlib del workspace y `serde_json` reconstruidas sobre este HEAD. `fuji-input.json` contiene la entrada inicial sin cargas fijadas; la fixture y su copia `fuji-frozen-input.json` corresponden a `fuji-replay-input.json` con salida 82/100 y un identificador legible de práctica en lugar del hash como `sourceId`. La identidad por hash permanece en la evidencia externa. Ninguna tiene una proyección ni perfiles observados ficticios.

Rama: `vantareapp/isa-1450-strategy-fuji-real`. Base entregada y HEAD inicial: `27ca9066220abcc209f6dc95985de475b22ffd36` (ISA-1445 ventana estrecha). Se conserva esa base específica del encargo; no se cambia a nightly ni se mezclan otros workers. Commit local con `(#1450)` y coautor solicitado; su SHA lo proporciona Git en la entrega, sin autorreferencia en el documento. Sin push, PR, CI remoto, merge, promoción, release ni actualización externa de estado. Notion/proyecto/última actualización: no verificables en este encargo; #1450 abierta al leerla, sin declarar seguimiento Notion completado. Único handoff de proyecto leído; no se modifica por estar fuera de las rutas asignadas.

Preguntas para la ronda 2 (no bloquean este sello): pilotos y reglamento exactos; si seis horas incluye formación; si la llegada sigue al líder; tiempos completos de boxes; inventario de medios y servicios permitidos. Después del sello recibir la carrera apartada y contrastar vueltas, stints, recursos, pilotos, neumáticos y tiempos **sin reescribir esta predicción**.
