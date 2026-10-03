# Fuji 6 h — comparación con fragmento real, ronda 2 (#1450)

Fecha: 2026-10-03. Worker Codex; revisión pendiente de Claude Opus 5.5. [GitHub #1450](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1450). Notion no disponible; se conserva la excepción explícita de Isaac para este encargo. **El sello `bf29fa11f5b7850f85bcc552d84f91bfb71f5610`, su informe y su fixture no se modifican.** Esta ronda abre exclusivamente el fragmento autorizado `C:/tmp/strategy-real/carrera/Fuji Speedway_R_2026-10-03T14_47_24Z.duckdb`. No se consulta `no-usar/`.

## Respuesta para Isaac

**La aritmética del plan es lógica bajo sus entradas, pero aún no está demostrado que el planificador pueda producir una estrategia útil para esta carrera de seis horas.** El replay acepta el plan manual; la búsqueda original no lo encontró. El fragmento confirma la energía virtual como recurso limitante y un stint cercano a 41 vueltas. También contradice el consumo extrapolado de práctica: con los consumos reales, los stints sellados de 43 vueltas no caben. Ese error pertenece a mis entradas, no a una operación aritmética incorrecta del solver.

No hay una llegada real grabada ni dos paradas completas. El fragmento comienza **ya estacionado, repostando y con desgaste 100 %**; termina durante la siguiente recarga. Por eso no se puede afirmar un tiempo real completo entrada→salida, carga total, número total de paradas ni vueltas finales. Una corrección con una estimación de pérdida de boxes da **234 vueltas**, frente a 236 selladas; se acerca algo a la extrapolación anclada en el reloj del fragmento, **222–223**, pero sigue lejos. Las 222–223 son una extrapolación condicional, no el resultado final de la carrera.

## Método fijo y límites del fichero

Lectura DuckDB read-only. SHA-256, inventario, scripts, JSON y logs fuera del repo: `C:/tmp/isa-1450-evidence/round2/`. Metadata: Alejandro Nadales, BMWMH Custom Team 2026 #397, Hyper, Race, Fuji Speedway, Cubierto. La identidad de los otros pilotos y sus cambios no se exporta como señal: Isaac los confirma, no este fichero.

Se conserva el método de ronda 1: reloj implícito `primer GPS Time + índice/frecuencia`, frecuencia de `channelsList`, muestra anterior a cada frontera; vuelta limpia sin boxes ni limitador, sin banderas sectoriales distintas del basal 11, sin yellow, consumos positivos. Se excluye además **todo tiempo oficial ≤0**, regla necesaria porque aquí Lap Time de la vuelta 196 vale cero; no se sustituye por un tiempo favorable. Aplicarla a la práctica no elimina ninguna de sus 21 vueltas limpias. No se descarta por ritmo la vuelta 162 de 95,376 s: queda dentro de los filtros existentes.

GPS: **15839,5475–19649,5875 s**, duración **3810,040 s = 1:03:30,040**, 381.005 muestras a 100 Hz, paso máximo ≈0,010000 s sin huecos observados. Fuel y VE: 76.201 muestras a 20 Hz, último recurso a 19649,5475; desgaste: 38.101 a 10 Hz. La alineación es la misma hipótesis de formato corroborada por recargas/estacionamiento, no timestamps individuales inexistentes.

`Lap=160` a 15839,5475 es la **foto inicial** del contador, no una frontera completa observada. La siguiente frontera es `Lap=161` a 16007,380; su tiempo oficial es 186,971680 s, superior al intervalo grabado de 167,8325 s. Si ese tiempo oficial es válido, empezó a 15820,408320, **19,139180 s antes del fragmento**. No se usan esos segundos faltantes como si hubiera telemetría. Las fronteras posteriores llegan a `Lap=201` a 19631,240. `Finish Status` permanece 0. La vuelta 196 tiene intervalo GPS 89,600 s, pero tiempo oficial 0: invalida su ritmo, no demuestra una detención.

Las **21 vueltas limpias** son: 162, 163, 166, 168, 169, 170, 172, 174, 176, 177, 178, 180, 181, 182, 183, 185, 189, 190, 191, 197, 198. `laps.json` conserva todos los intervalos y motivos de exclusión, sin selección a favor del sello. Media para consumos, mediana para ritmo, DE muestral y P10/P90 con el mismo índice discreto de ronda 1.

| Medición | Práctica / sello | Fragmento real | Diferencia |
|---|---:|---:|---:|
| Ritmo limpio mediano | 90,472412 s | **90,248047 s** | −0,248 % |
| Ritmo limpio medio | 90,615821 s | **90,639927 s** | +0,024106 s |
| DE / P10–P90 de ritmo | 0,609180 / 90,100586–91,379395 s | **1,239343 / 89,919922–91,062500 s** | La vuelta 162 aumenta la DE; se conserva |
| Fuel medio | 1,830120 L/v | **1,914442 L/v** | **+4,607 %** |
| Fuel mediano / DE / P10–P90 | 1,831132 / 0,031777 / 1,792649–1,876587 | **1,909790 / 0,040391 / 1,865784–1,966854** | No atribuir el aumento a una causa no grabada |
| VE media | 2,315804 %/v | **2,398193 %/v** | **+3,558 %** |
| VE mediana / DE / P10–P90 | 2,308076 / 0,032950 / 2,278412–2,366348 | **2,381744 / 0,041364 / 2,357674–2,451286** | Límite de stint inferior al sellado |

Desgaste medio limpio FL/FR/RL/RR: **1,014328 / 0,760502 / 1,005035 / 0,895850 puntos %/v**; el detalle por rueda queda en `measurements.json`. El código de compuesto se mantiene `(0,0,0,0)` y el setup dice **Medio**. No se interpreta cero como blando. Al inicio las cuatro ruedas están a 100 %; en la segunda entrada quedan **58,210 / 69,211 / 58,221 / 62,694 %**. No hay reinicio observado dentro del fragmento: la primera sustitución pudo suceder antes y la segunda después del corte. Por tanto, «medios frescos al principio» tiene apoyo fuerte, pero no se ha capturado el acto de cambio; «cambia en cada parada» no está probado.

## Boxes y stint realmente observados

Convención: el contador es el último número de vuelta completado; la entrada final sucede con contador 200 y antes de completar 201. Se informa el instante y ambos números para no desplazar una parada una vuelta.

| Visita | Entrada / salida pit lane | Vuelta | Fuel y VE en extremos grabados | Lo cargado observable |
|---|---|---|---|---|
| Primera, inicio censurado | Ya `In Pits=1` a **15839,5475**; salida **15904,140** | Contador 160 al inicio y salida; salida durante vuelta 161. La vuelta/instante exactos de entrada **no están grabados** | Inicio parcial **32,211838 L / 24,396187 %**; salida **79,955231 L / 100 %** | Neto **+47,743393 L / +75,603813 %**; suma de incrementos Fuel **47,788162 L**. Son cargas restantes desde el inicio del fichero, no carga total |
| Segunda, final censurado | Entrada real **19629,060**; no hay salida antes de **19649,5875** | Contador 200, entrada al final de **vuelta 201**; completa 201 a 19631,240 | Entrada **1,550842 L / 1,867668 %**; último recurso **30,181955 L / 24,269953 %** | Neto **+28,631113 L / +22,402284 %**; incrementos Fuel **28,655909 L**, VE **22,402346 %**. Recarga sigue activa al corte |

La diferencia entre carga neta y incrementos positivos corresponde al consumo durante movimientos en pit lane y muestreo. No se equipara ninguna de esas cantidades a una carga completa censurada.

Primera visita: pit lane observado **≥64,5925 s**. Velocidad <1 km/h durante ≥32,57 + 7,11 + 2,44 = **42,12 s**, con pequeños movimientos intermedios; desde el inicio ya detenido hasta movimiento sostenido, **≥42,37 s**. Segunda visita: pit lane **≥20,5275 s**; detenido 2,42 + ≥6,64 = **≥9,06 s**, estancia desde primer estacionamiento ≥9,16 s. Los símbolos ≥ son imprescindibles: falta el comienzo de la primera y el final de la segunda.

Sí se miden dos trayectos parciales diferentes: segunda entrada→primer estacionamiento **11,3675 s**; último estacionamiento→salida de la primera **22,2225 s**. Sumarlos da **33,590 s** de tránsito por los dos ramales, **no una pérdida completa frente a rodar por pista**. No se inyecta esa suma como `transitSeconds` supuestamente medido: falta el trayecto equivalente por pista y no son la misma parada.

Las recargas corroboran los ~**4 L/s y 2,5 % VE/s** de práctica. En la primera, Fuel aumenta desde la primera muestra posterior al inicio hasta 15851,4975 y VE hasta 15869,7975; pendientes medias de incrementos positivos **3,999009 L/s / 2,499300 %/s**. En la segunda, VE empieza 19640,5975, Fuel 19642,3975 y ambos continúan al corte; medias con transitorios **3,979987 / 2,489150**. Solapamiento Fuel/VE observado, sin acreditar solapamiento reglamentario con neumáticos o piloto.

**Único stint entre visitas:** salida 15904,140→entrada 19629,060: **3724,920 s = 1:02:04,920**. Contador completado 160→200, delta 40, más los trozos de salida 161 y entrada 201: intervalo nominal de servicio **161–201, 41 vueltas**, no 41 vueltas limpias completas. Consume **78,404389 L / 98,132332 % VE**, equivalentes a **40,954 / 40,919** vueltas según las medias medidas. La equivalencia confirma ≈41 sin convertirla en un contador exacto de vueltas completas. No se pueden reconstruir duración/consumo del stint anterior ni siguiente.

Con capacidades nominales del sello: `82 / 1,914442 = 42,832` vueltas Fuel; `100 / 2,398193 = 41,698` VE. **Máximo nominal entero 41**. Con la salida real de 79,955 L, Fuel permite 41,764, muy cerca de VE 41,698: ambos están ajustados y VE sigue limitando ligeramente. Al entrar queda ≈0,810 vuelta Fuel / 0,779 VE; la reserva terminal del sello no era una reserva obligatoria en cada parada.

## Comparación y atribución

| Elemento | Juicio | Motivo / responsable |
|---|---|---|
| Recurso limitante VE | **Lógico** | Confirmado por capacidad/consumo de práctica y fragmento. No es un fallo del modelo |
| Stints sellados de 43 | **Ilógico con consumos reales** | `43 × 2,398193 = 103,122299 %` y Fuel ≈82,321006 L. Falla mi extrapolación de consumo; el sello sí respetaba sus valores de práctica |
| Stints sellados de 42 | **Ilógico con consumos medios reales** | 100,724106 % VE, incluso saliendo con 100 %. El intervalo real ≈41 respalda acortarlos, sin garantizar cada vuelta futura |
| Ritmo de 90,472 s | **Lógico como ritmo limpio nominal** | Mediana real 90,248, media 90,640. No sirve por sí sola para reconstruir cuatro horas anteriores, salidas, tráfico o neutralizaciones |
| Consumo extrapolado de práctica | **Dudoso, insuficiente para una recomendación robusta** | +4,607 % Fuel / +3,558 % VE reales. Cambios de setup, conducción o condiciones no quedan causalmente identificados |
| Tasas 4 L/s / 2,5 %/s | **Lógico** | Reproducidas en ambas recargas; el modelo lineal coincide con las pendientes, no acredita la duración íntegra |
| Paradas 64,6 s y final 55 s | **Dudoso / demasiado optimista en la estimación empírica** | Tránsito 25 y neumáticos 30 eran supuestos; ni una parada completa está grabada. Una estimación por tiempos oficiales da ≈102,6 s, con atribución incierta. No prueba un error de la fórmula del solver |
| Medios nuevos por parada | **Dudoso** | Compuesto Medio confirmado; juego fresco inicial y desgaste permiten un stint, pero falta el acto de cambio y su duración/inventario |
| Tres pilotos y cinco cambios | **Dudoso / no verificable** | Isaac confirma cambios, pero solo hay identidad estática Alejandro. A/B/C, prestaciones iguales y solapamiento del cambio eran supuestos; no hay reglas WEC automáticas |
| Cinco paradas totales | **Lógico como orden de magnitud, no confirmado** | Seis stints de hasta 41 permiten 222–234 vueltas; `ceil(vueltas/41)−1=5`. Paradas adicionales, stint inicial corto o condicionantes anteriores no están grabados |
| 236 vueltas finales | **Dudoso como pronóstico global; incompatible con el reloj observado bajo ritmo constante** | La aritmética original cierra. Desde 201 a 19631,240 quedan 1968,760 s: sin más pérdida caben 22 vueltas, hasta 223. Llegar a 236 exigiría 35 vueltas en ~56,25 s/vuelta. La llegada real y el origen exacto del reloj de carrera no se observan |
| Replay productivo | **Lógico dentro del modelo configurado** | Comprueba capacidades, carga, reserva y última vuelta. No corrige consumos ni inventa reglas ausentes |
| Búsqueda automática para 6 h + pilotos | **Ilógico como experiencia de cálculo utilizable; fallo de operatividad confirmado** | Hay un plan factible por replay, pero no produce incumbent dentro de los presupuestos medidos. No se interpreta `not_proven` como inviabilidad |

No se abre una issue por cada supuesto equivocado: no son fallos confirmados del planificador. La limitación de representar un cambio de piloto como servicio independiente es una necesidad potencial, no un bug probado por este fragmento.

## Recalcular sin tocar el sello

**Lo medido no permite recalibrar íntegramente boxes.** Para responder con lo posible, se hace una sensibilidad explícita, no una nueva predicción a ciegas:

1. Los tiempos oficiales almacenados para vueltas 160 y 161 son 96,136719 y 186,971680 s. Si corresponden al par entrada/salida de esa visita, su exceso sobre dos vueltas limpias es **102,612305 s**. La entrada no está en la telemetría y el tiempo lento puede incluir cambio de piloto/espera; es una **estimación agregada**, no tránsito medido. Añadir la vuelta 162 de 95,375977 eleva el exceso a 107,740234 s, mezclando calentamiento de neumáticos; se conserva como sensibilidad, sin escogerlo para mejorar el resultado.
2. Se mantienen tres pilotos iguales y servicios paralelos hipotéticos; se actualizan ritmo y consumos con las medias/mediana real. Se conservan tasas de práctica verificadas aquí. Se calibra un coste fijo residual de **63,412305 s = 102,612305 − 98/2,5**, a una carga nominal de 98 % VE. **No es `transitSeconds` físicamente identificado**: absorbe todo el exceso no representado. Neumáticos sigue en 30 s como supuesto. Todas las entradas y decisiones corregidas están fuera del repo.
3. Replay Rust con salida 82/100 y cargas enteras 1 L / 1 %: **41 / 41 / 41 / 41 / 41 / 29**, cinco paradas, **234 vueltas**. Coste de boxes **504,261513 s**, última vuelta empieza en **5:58:52,056** y acaba **6:00:22,304**. Reservas **2,020572 L / 2,822838 % VE**, satisfechas; replay factible. No es una solución automática ni un óptimo certificado.

Actualizar solo el ritmo manteniendo boxes originales conserva ≈236 vueltas; poner cinco pérdidas constantes de 102,612 s da ≈234. Esta sensibilidad explica dos vueltas de corrección, **no** las 13–14 de diferencia entre el sello y la extrapolación anclada. Las cargas, reservas y tiempo del replay se verifican en `check_fragment.py`.

La ubicación de las paradas también se acerca: el sello sitúa las dos últimas en **170 y 212**; la corrección las sitúa en **164 y 205**. La salida inicial observada mantiene contador 160 y la nueva entrada sucede al terminar 201: el desfase nominal se reduce de unos **10–11 a unos 4** vueltas. La primera entrada está censurada y la historia anterior falta, así que esa proximidad no reconstruye cinco paradas reales ni demuestra que el equipo siguiera la misma política.

Si GPS se toma como reloj de carrera de seis horas desde cero, al completar 201 son **5:27:11,240**, quedan **32:48,760**. El corte sucede a **5:27:29,588**, contador 201, estacionado y recargando; no es el fin de carrera. Desde la frontera 201, una pérdida pendiente de menos de **73,551016 s** permite completar **223**; una pérdida de ~102–108 s conduce a **222**, a ritmo mediano constante. Sin pérdidas posteriores, 223 es el máximo nominal con ese ritmo; usando la media y pérdidas similares también se obtienen 222–223. El origen verde/formación y la regla de llegada del líder siguen sin estar en el fichero.

El reloj a 201 contiene **1491,383 s** adicionales frente a `201 × 90,248047`. Incluso asignando, solo como hipótesis, cuatro pérdidas anteriores de 102,612 s quedan **1080,933 s (~18 min)** no explicados por este modelo constante. No se atribuyen a sanciones, SC, fallos, más pilotos ni más paradas sin evidencia. Por eso la corrección global 234 se acerca solo dos vueltas; el pronóstico útil desde este punto necesita anclarse al tiempo realmente transcurrido, no reconstruir la carrera entera con una mediana de práctica.

## Búsqueda: presupuesto, causa probable y fallo confirmado

Runner externo enlazado con el crate productivo sin modificaciones. Se repite exactamente la entrada sellada cambiando únicamente presupuestos para los ensayos completos; controles posteriores eliminan dimensiones de manera explícita. Tiempos de esta máquina compartida, no benchmarks comparables. No se cambia el objetivo, no se fuerza un resultado ni se llama a un replay plan automáticamente encontrado.

| Ensayo | Tiempo y presupuesto | Resultado publicable |
|---|---|---|
| Release, entrada y presupuesto exactos del sello | **330 ms internos**, 0,545 s de proceso; 1 M iteraciones / 100.000 candidatos / deadline 20 s | `not_proven`, `iteration_budget_exhausted`, **1.000.001 comparaciones**, 2.726 work items, **0 podados**, sin incumbent |
| Debug, misma entrada, presupuestos mayores | **20,048 s internos**; 100 M iteraciones / 100 M candidatos | Deadline, **13.230.893 comparaciones**, 12.436 work items, **0 podados**, sin incumbent |
| Debug, misma entrada, presupuestos mayores | **120,109 s internos**; 1.000 M iteraciones / 100 M candidatos | Deadline, **81.114.041 comparaciones**, 36.809 work items, **0 podados**, sin incumbent |
| Debug, duración sin perfiles/secuencia | **20,004 s internos**, 100 M iteraciones | Deadline, **14.201.745 comparaciones**, **0 podados**, sin incumbent |
| Debug, distancia fija 236 manteniendo pilotos | **20,074 s internos**, 100 M iteraciones | Deadline, **13.436.490 comparaciones**, **0 podados**, sin incumbent |
| Release, misma entrada con deadline 120 s, límite 100 M / 200 M iteraciones | Guard externo **1536 MiB** alcanzado a **27,099 / 22,153 s** | Proceso detenido, sin JSON completo ni certificado; estado interno del incumbent desconocido |
| Release, controles sin pilotos / distancia fija con pilotos / grid de un stint temporal | Guard externo **1536 MiB** a **17,130 / 20,106 / 3,501 s** | Sin resultado completo; no se usan como certificados de inviabilidad |

La ejecución debug de hasta **600 s** se detuvo a **191,128 s**, con **1.445.056.512 bytes de working set** (~1,35 GiB), por presión de memoria comprometida compartida: se habían observado ~1083 MiB libres; en el momento de detener, 2030 MiB. No llegó al deadline ni emitió certificado. Otro control debug con grid de un stint temporal se detuvo por el guard de **2 GiB**; tampoco publicó resultado. Se conservan los logs de esos abortos y de los fallos de parseo del harness al intentar leer su salida vacía: no se convierten en resultados del solver.

**Tiempo hasta solución completa: no observado.** La ejecución completa más larga de esta ronda fue 120,109 s sin incumbent; no se puede afirmar «nunca llega», ni que los diez minutos se hayan completado. El perfil release reduce el tiempo hasta agotar el millón de iteraciones, pero no convierte esa búsqueda en una solución. Los replays de sello y corrección también se repiten en release y coinciden con debug; no se atribuye a debug una inviabilidad inexistente.

Evidencia de código, separada de la inferencia causal:

- `native/strategy/src/solver/search.rs:63`: si hay duración, **no permite dominancia entre estados con tiempo total diferente**. Es una cautela semántica; redondear tiempos para podar podría cambiar el resultado en el límite de seis horas.
- `search.rs:74` exige igual número de paradas con secuencia; `search.rs:84` exige igualdad de `DriverState`, incluso con perfiles A/B/C idénticos. `drivers.rs:230` acumula tiempo y vueltas por piloto. No se pueden fusionar esos estados arbitrariamente si luego existen límites o disponibilidad.
- `search.rs:189` recorre las fronteras por vuelta creciente; `search.rs:319` enumera producto de cantidades Fuel × VE × opciones de neumáticos. `search.rs:352` y `:375` escanean linealmente los estados de cada frontera para comprobar dominancia en ambos sentidos. El coste observado de comparaciones crece con la frontera.
- `search.rs:278` solo registra completados al alcanzar distancia/duración y condiciones; no hay una semilla del plan factible manual en esta API. `search.rs:411` construye incumbents desde `completed`. Un presupuesto agotado antes de alcanzar un completado devuelve honestamente `not_proven` sin plan.
- `native/strategy/src/solver/budget.rs:14` acota los niveles de discretización a 200; subir `p95Millis` por encima de 200 no vuelve a cambiar la grid 1/1 de estos ensayos. La causa no es un cambio silencioso de grid en los reintentos.

**Causa probable:** explosión del producto Fuel/VE y de estados de historia, con poda muy limitada por reloj y pilotos; se compara una frontera cada vez mayor antes de alcanzar un plan completo. El certificado de cero estados podados apoya esta explicación. No se ha instrumentado internamente ni demostrado una corrección algorítmica. El fallo confirmado es no obtener un plan útil bajo presupuestos medidos teniendo uno factible, no una prueba de inviabilidad ni de un resultado óptimo erróneo.

Seguimiento separado: [#1458 — búsqueda temporal nativa de Fuji 6 h](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1458), creada y releída con entrada exacta y decisión testigo, estado OPEN. Se revisan #1367 (dominancia Hypercar Go/Monza) y #1269 (semántica temporal): antecedentes relacionados, no prueba de que el fallo native de seis horas esté resuelto. Propuesta para la futura tarea: regresión con esta entrada y replay testigo; medir frontier/iteraciones/memoria y tiempo al primer incumbent; estudiar una semilla factible validada y poda/indexación que preserve las condiciones exactas. **No subir presupuestos como supuesto arreglo, no cambiar reglas ni certificar optimalidad sin completar la prueba.**

## Evidencia, gates y entrega

Solo se añade este informe. Sin código, fixtures, dependencias, solver ni sello modificados. Toda la QA en `C:/tmp/isa-1450-evidence/round2/`: `measure_fragment.py`, `measurements.json`, `laps.json`, `derive.py`, `derived.json`, `check_fragment.py`, replay corregido, entradas/resultados de búsqueda, logs, memoria y hash del DuckDB. Scripts y ejecutables previos quedan en la carpeta padre. `check_fragment.py` verifica reloj, filtros, censura, stint, recursos y cierre temporal del replay corregido.

| Check previo al commit | Resultado |
|---|---|
| `cargo build --release -p vantare-strategy -j 2` | Correcto; crate optimizado sin tocar fuentes |
| `cargo fmt --check` | Correcto, salida 0 |
| `cargo clippy --workspace --all-targets -j 2 -- -D warnings` | Correcto, salida 0, sin warnings |
| `cargo nextest run --workspace --build-jobs 2 -j 2` | **1.017 pasadas, 4 omitidas**, salida 0; 278,364 s de pruebas |
| `cargo test --workspace --test lifecycle -j 2` | **5 Engineer + 11 Runtime pasadas**, salida 0 |
| Medición / derivación / replay / GitHub releído / sello intacto | Comprobaciones externas correctas; debug y release coinciden en ambos replays |

Un único cargo propio a la vez, mediante `C:/tmp/fase2/bin/cargo.cmd`; compilación y pruebas limitadas explícitamente a dos. No se usa `cargo test -p`. Las cuatro pruebas ignoradas por defecto requieren REST/memoria compartida LMU —una se compila también en grabador— y ACC con broadcasting activo; no se han arrancado juegos. No se repite `cargo check` separado: no hay cambios Rust y clippy verifica todos los targets; el check de ronda 1 está conservado. Sin CI remoto ni pruebas físicas nuevas.

Los fallos de tooling también quedan conservados: la primera inspección Python falló porque el nombre externo `inspect.py` ocultaba el módulo estándar; se renombró y se repitió correctamente. El primer enlace del runner release eligió un artefacto `serde_json` de otra unificación `serde_core`; falló por traits incompatibles y se reenlazó con el artefacto del build correcto, sin alterar fuentes ni dependencias. Los abortos de búsqueda por guard y sus errores de parseo son los registrados arriba, no gates verdes ni bugs nuevos del planificador.

Verificación manual: ejecutar `measure_fragment.py` sobre el fichero autorizado read-only; revisar los extremos de `In Pits`, velocidad y recargas para confirmar censura; cotejar las 21 vueltas admitidas y la 196 inválida; ejecutar el runner sobre `corrected-estimate-input.json` y `corrected-estimate-decision.json`, luego `check_fragment.py`. Para el bloqueo, deserializar la fixture sellada como `Input` y llamar `solve_v2` con cada presupuesto registrado; no interpretar una ejecución detenida externamente como un certificado de inviabilidad. El informe no sustituye una importación productiva Analysis/Hub ni un runtime físico.

Rama `vantareapp/isa-1450-strategy-fuji-real`; base entregada `27ca9066220abcc209f6dc95985de475b22ffd36`; HEAD de entrada a ronda 2 `bf29fa11f5b7850f85bcc552d84f91bfb71f5610`. Commit local de comparación, SHA en la entrega y comentario #1450. Sin push, PR, CI remoto, merge, promoción ni release. Únicas escrituras GitHub autorizadas: resumen #1450 y seguimiento de fallos confirmados. Notion/proyecto/última actualización no verificables bajo la excepción vigente; no se declara el seguimiento Notion completado ni se modifica el handoff fuera del alcance.

Pendientes de datos: grabación anterior/posterior y llegada, origen exacto del reloj verde, reglas y pilotos, servicios completos, inventario de medios. No bloquean esta comparación parcial; impiden convertir sus extrapolaciones en un resultado real observado.
