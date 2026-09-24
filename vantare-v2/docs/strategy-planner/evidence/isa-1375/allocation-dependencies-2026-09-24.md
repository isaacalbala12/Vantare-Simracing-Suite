# ISA-1375 — dependencias de memoria del editor registrado

Banco: `TestRecordedStrategyRealDuckDB` con S266 Algarve y S026 Monza, parser LMU y runtime autorizado de desarrollo. Pasó en 85,17 s; ambos SHA-256 originales permanecieron intactos. Se ejecutó con `-memprofile` y se leyó `alloc_space`. El test reabre y deriva varias veces la misma fuente: **42.030 MiB son asignaciones acumuladas de toda la prueba, no memoria simultánea ni coste de una sola operación**. El perfil `inuse_space` se toma al terminar, tras liberar las vistas, y tampoco representa el pico. Los picos de proceso medidos por separado constan en [el primer banco](owned-alignment-2026-09-24.md).

| Función, asignación propia | MiB acumulados | Dependencia relevante |
| --- | ---: | --- |
| `normalizeLMUDuckDBPage` | 8.445 | Una página nueva por lectura; coste temporal del parser. |
| `duckdbadapter.mapBatch` | 7.759 | Decodificación de lotes; no debe cambiarse por un lector paralelo. |
| `buildGPSClock` | 7.014 | Lista ordenada, mapa y conjunto de índices GPS de toda la grabación. |
| `ApplySampleCorrectionSnapshot` | 3.654 | Vista completa desacoplada incluso sin muchos valores corregidos. |
| `cloneHistoricalPages` | 3.244 | Copia profunda de páginas en llamadas públicas y derivaciones posteriores. |
| `timestampedSeries` | 2.290 | Series numéricas completas reconstruidas por derivación. |
| `observedFuelRises` | 1.988 | Observaciones globales de combustible para límites de stint. |
| `readLapDistResetObservations` | 1.083 | Copia y ordenación de muestras de distancia para detectar reinicios. |

`ReadCorrectionInput` asignó acumulativamente 27.070 MiB incluyendo sus llamadas; esta cifra **no** se suma a las asignaciones propias anteriores. `SolveV2Context` acumuló 281 MiB en este evento hipotético y es un problema separado del bloqueo exacto Hypercar #1367.

## Segundo corte: reloj GPS sin estructuras duplicadas

`buildGPSClock` conserva un mapa índice→instante y ordena únicamente los índices. Antes mantenía además un conjunto de índices y una segunda lista con índice e instante. El test protege páginas fuera de orden e índices repetidos; el banco real de S266+S026 volvió a pasar con idénticos ritmo seco 95,190 s (N=58), Fuel 2,135 L/vuelta (N=58), VE no aplicable para LMP2 y 38 vueltas/0 paradas con optimalidad probada **sólo para el evento supuesto**. Los SHA-256 originales no cambiaron.

Un perfil `alloc_space` de la misma prueba completa pasó de 42.030 a 39.578 MiB acumulados, y la asignación propia de `buildGPSClock` de 7.014 a 4.430 MiB. Las pruebas duraron 85,17 y 82,23 s respectivamente. Son dos ejecuciones, sin control de variabilidad ni medición de pico por etapa; **no** se infiere un porcentaje estable de memoria de proceso ni se eleva el límite de muestras. Los perfiles locales quedaron en `C:\tmp\isa1375-allocs.mem` y `C:\tmp\isa1375-clock-allocs.mem`.

## Estado que exige el cálculo

- El reloj GPS actual valida forma, índices únicos y tiempo estrictamente creciente. La fuente LMU entrega páginas por canal e índice. Una pasada ordenada puede validar con el último índice/tiempo; otra lectura por ventanas puede aportar el instante requerido para cada canal continuo. No basta con descartar muestras GPS sin demostrar la cobertura exacta y los mismos motivos de fallo.
- Lap, tiempo de vuelta, entrada a boxes y cambios de compuesto generan eventos cuyo volumen depende de vueltas/cambios, no de la frecuencia de muestreo. La distancia de vuelta sólo necesita la muestra anterior para detectar un reinicio, pero el código actual ordena todas las muestras.
- Combustible, energía virtual, clima, desgaste y curvas consultan series completas alrededor de límites de vuelta/stint. Esas consultas admiten ventanas y resúmenes por vuelta **sólo si** se conservan tolerancias, orden estable, calidad/presencia y desempates actuales. No se ha demostrado aún su paridad.
- Una corrección escalar exige cobertura exacta del índice/columna y comparación con el valor original. Las decisiones por familia, stint e identidad dependen de validez y metadatos efectivos. La vista pública corregida copia todas las páginas; una ruta incremental deberá validar y aplicar cada objetivo durante la lectura sin alterar el original ni aceptar un subconjunto.
- La salida legítima conserva vueltas, stints, diagnósticos y procedencia. Por tanto el presupuesto buscado es memoria `O(vueltas + correcciones + tamaño de página)`, no una constante absoluta. Ninguna afirmación de soporte de 24 h se deriva de este perfil.

Siguiente prueba: medir por separado preparación, inspección y proyección con la misma fuente y un banco más largo autorizado; comparar cada modelo completo contra la ruta actual antes de sustituirla. Mantener un rechazo explícito cuando un límite de salida o memoria documentado se alcance.

## Tercer corte: visita paginada común

El lector de correcciones expone `VisitCorrectionPages` sobre el mismo parser
autorizado, con inspección de identidad, cuotas de muestras/valores/texto,
validación de página y cancelación antes de pasar cada página a un consumidor.
`ReadCorrectionInput` usa ahora esa visita y sigue reuniendo todas las páginas,
por lo que **el comportamiento productivo y su pico de memoria no son aún
acotados**. La prueba con lector controlado compara el número de muestras
visitadas con la ruta actual y comprueba parada inmediata por error o
cancelación, además de los rechazos de cuotas ya existentes.

Este corte prepara la sustitución sin duplicar la lógica de lectura. Todavía
faltan la paridad del reloj GPS incremental, un consumidor productivo sin
retención y una medición nueva de pico. No se eleva
ningún presupuesto ni se afirma soporte de resistencia.

El banco real opt-in pasó de nuevo con S266 Algarve y una **segunda Monza
distinta de S026** (archivo de 2026-05-02). Algarve conserva ritmo seco
95,190 s (N=58), Fuel 2,135 L/vuelta (N=58), VE LMP2 no aplicable y 38
vueltas/0 paradas con óptimo probado sólo para el evento supuesto. Preparación,
proyección, revisión exacta, clasificación, identidad, correcciones por familia,
restauración y reapertura pasaron en 270,29 s. Los SHA-256 originales siguen
`6b912640e5b68da087fbe86ce70401101edbdc89cb89cb93df30c9ef396d9362`
y `00874567d608eb2c40f8213ce4abb3a91b5756e31826c615bccd246b172ecef3`.
La duración incluye la distinta fuente objetivo y no se interpreta como
regresión de velocidad. La suite Go completa y la prueba focal del visitante
también pasaron; no se hizo QA Wails ni una medición de pico posterior.

## Cuarto corte: reloj GPS de la lectura propia

`ReadCorrectionInput` recibe páginas con índices contiguos y crecientes.
Su alineación usa ahora referencias a las páginas GPS y búsqueda por índice,
sin construir el mapa y la lista de **cada muestra GPS**. El API puro
`BuildTemporalAlignment` mantiene el algoritmo general para páginas fuera de
orden; la ruta propia también recurre a él si encuentra una entrada que no
cumple su supuesto de orden. Las pruebas de paridad cubren páginas ordenadas y
desordenadas, índice duplicado, hueco de cobertura, tiempo no monótono, valor
inválido y frecuencia incorrecta. Se conservan los motivos de rechazo.

Comparación A/B con los mismos dos DuckDB y el mismo test opt-in, antes
`ddf831e8` y después de este cambio, ambos con perfil `alloc_space`:

| Medida acumulada de una ejecución completa | Antes | Después |
| --- | ---: | ---: |
| Asignación propia de `buildGPSClock` | 4.394 MiB | 1.216 MiB |
| Asignaciones totales del proceso de test | 39.697 MiB | 36.396 MiB |
| Tiempo de la prueba | 86,86 s | 70,42 s |

Los perfiles están en `C:/tmp/isa1375-before-clock-allocs.mem` y
`C:/tmp/isa1375-ordered-clock-allocs.mem`. Son **asignaciones acumuladas**, no
memoria simultánea ni pico. Dos ejecuciones no demuestran una mejora estable
de tiempo. La asignación restante de `buildGPSClock` procede de rutas puras
que todavía vuelven a alinear las vistas corregidas. En ambos recorridos
Algarve mantuvo ritmo seco 95,190 s (N=58), Fuel 2,135 L/vuelta (N=58) y el
plan supuesto de 38 vueltas/0 paradas; preparación, revisiones, identidad,
familias y reapertura pasaron. Los hashes originales citados arriba siguen
intactos. La lectura completa de muestras y las copias/series de derivación
siguen impidiendo una garantía de memoria acotada para resistencia.
`go test -p 1 ./... -count=1`, la paridad focal y `git diff --check`
pasaron. No se modificó frontend ni se abrió Wails.

## Quinto corte: detección de reinicios de vuelta en orden

La lectura propia entrega `Lap Dist` por índice creciente. La detección de
reinicios conserva ahora sólo la muestra anterior y los reinicios encontrados;
si recibe páginas desordenadas o índices repetidos, utiliza la ruta anterior
con ordenación completa. Una prueba compara ambas rutas con varias páginas,
huecos, origen temporal desconocido y frecuencia incompatible. El banco opt-in
con los mismos Algarve y Monza pasó: 71 eventos, 70 reinicios, 66 vueltas
completas, ritmo seco 95,190 s (N=58), Fuel 2,135 L/vuelta (N=58) y plan
supuesto de 38 vueltas/0 paradas. Los SHA-256 originales siguen intactos.

El perfil `alloc_space` de la misma prueba pasó de 36.396 a 35.370 MiB
acumulados. La función `readLapDistResetObservations` aparecía con 1.108 MiB
propios antes y ya no aparece entre los nodos del nuevo perfil. Estas cifras
**no miden el pico** ni demuestran una mejora estable de tiempo. Los perfiles
son `C:/tmp/isa1375-ordered-clock-allocs.mem` y
`C:/tmp/isa1375-lapdist-allocs.mem`. Suite Go completa y prueba focal PASS.
`ReadCorrectionInput` y las vistas corregidas aún retienen todas las páginas;
la memoria productiva no está acotada por vuelta/página, no se eleva el límite
de muestras y no se afirma soporte de 24 h. No hubo QA Wails.

## Sexto corte: cobertura continua sin ordenar una copia completa

`channelCoverageWindow` conserva sólo los extremos y la muestra anterior cuando
las páginas vienen en orden. Comprueba primero todo el orden de índices: una
página posterior puede llenar un hueco aparente, por lo que un rechazo temprano
cambiaría el resultado anterior. Si hay desorden, usa la ruta ordenada previa.
La prueba de paridad incluye ese caso, hueco real y reloj no monótono.

Suite Go completa y banco real con los mismos Algarve/Monza PASS; 71 eventos,
70 reinicios, 66 vueltas completas, ritmo/Fuel y plan supuesto invariantes,
hashes originales intactos. El perfil `alloc_space` total fue 35.370 MiB antes
y 35.378 MiB después, indistinguible a esta escala: **no se atribuye ahorro
medido** ni velocidad. El perfil nuevo es
`C:/tmp/isa1375-coverage-allocs.mem`. Este cambio elimina una copia potencial
de tamaño de sesión en esa función, pero `ReadCorrectionInput` continúa
materializando todas las páginas y no hay todavía garantía de memoria acotada
ni QA Wails.

## Séptimo corte: estado GPS alimentable por páginas

La validación del reloj GPS ordenado quedó aislada en un acumulador que conserva
únicamente el último índice, el último instante y el estado de monotonía. La
ruta propia que ya tiene páginas usa ese mismo acumulador y mantiene su
fallback general para páginas fuera de orden. Una prueba compara motivos de
rechazo con el reloj materializado al partir el GPS en varias páginas; otra
alimenta el acumulador desde `VisitCorrectionPages` sin guardar esas páginas
en el consumidor y compara el estado con `ReadCorrectionInput`. La prueba
focal empezó en rojo por ausencia del acumulador y pasó tras implementarlo.

`go test ./internal/telemetryanalysis -count=1` PASS. La suite `go test -p 1
./... -count=1` pasó en el paquete modificado, pero terminó roja por dos
timeouts en `internal/engineer/voiceinput` y
`internal/strategy/application`; ambas pruebas pasaron al repetirse aisladas.
La suite global no se presenta como verde. No se ejecutó el banco DuckDB
opt-in: las tres variables de selección de fuentes/runtime no estaban
configuradas en esta sesión. El escáner aún no sustituye a
`withCorrectionInput`; este corte no reduce memoria pico, no cambia las cuotas
y no acredita carreras de 24 h ni Wails.
