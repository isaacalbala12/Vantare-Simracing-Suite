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
