# ADR 0012 — lectura acotada para correcciones registradas

Estado: **implementación parcial; no aceptada como soporte de resistencia**. ISA-1375, 2026-09-24. Complementa ADR 0010/0011 y el [contrato de correcciones](../strategy-planner/sdd/stint-boundary-corrections-t13.md).

La preparación productiva ya usa un resumen por visitas paginadas, con paridad
completa en el banco real disponible. [Tres mediciones por versión](../strategy-planner/evidence/isa-1375/paged-preparation-2026-09-25.md)
no muestran un pico menor y sí más tiempo por relectura. La cuota de muestras
no se elevó. Inspección, guardado y proyección aún materializan toda la fuente;
esta decisión sigue abierta hasta medir una fuente más larga y cerrar esas
operaciones sin cambiar identidad ni correcciones.

## Contexto

La preparación actual guarda todas las páginas necesarias, construye un mapa GPS global y materializa de nuevo páginas/series para inspeccionar y proyectar cada revisión. La sesión real S266 Algarve cabe bajo el límite medido de #1210, pero esa cuota y un pico de aproximadamente 765–855 MiB no demuestran soporte para carreras mucho más largas. [Perfil y mapa de dependencias](../strategy-planner/evidence/isa-1375/allocation-dependencies-2026-09-24.md).

## Decisión propuesta

Conservar el parser LMU autorizado, su revalidación del artefacto en cada lectura, las identidades y snapshots existentes. Para las operaciones registradas, procesar páginas del mismo `CorrectionInputReader` en ventanas y releer cuando otra fase necesite datos. Evitar una base temporal y un segundo lector mientras la relectura medida sea aceptable. Preservar las API puras actuales para consumidores que ya poseen páginas; la ruta productiva deberá dejar de devolver un `CorrectionInput` con todas las páginas antes de reclamar memoria acotada.

Primero validar el reloj GPS con estado constante por canal y después consultar ventanas GPS por índice al recorrer canales continuos. Reducir eventos y señales a observaciones por vuelta/stint, conservando el orden estable, tolerancias, calidad, ausencias y motivos de fallo actuales. Validar cada corrección contra su fila original y aplicar sólo su valor efectivo a la ventana leída. La memoria objetivo crece con vueltas, correcciones y una cantidad fija de páginas, no con el número total de muestras. Si un caso necesita materialización global, rechazarlo explícitamente hasta tener evidencia de una alternativa segura; nunca truncar o interpolar silenciosamente.

Esta es una secuencia de implementación, no permiso para cambiar resultados en bloque: (1) medir memoria/tiempo por operación; (2) aislar validación GPS y probar paridad, incluidos puentes inválidos; (3) producir validez y resúmenes por vuelta, con oráculo exhaustivo contra la ruta actual; (4) aplicar snapshots exactos y derivar proyección, probar replay/cancelación/limpieza; (5) medir fuente larga real y validar en Wails. Cada corte debe conservar la ruta anterior hasta demostrar igualdad o documentar una diferencia de cómputo versionada y aceptada.

## Frontera de sustitución comprobada

`TelemetryAnalysisService.withCorrectionInput` es el punto común de preparación,
inspección, guardado y proyección de revisiones. Hoy llama a
`ReadCorrectionInput` antes de ejecutar cualquiera de esas acciones, de modo
que ninguna optimización posterior a la devolución de `CorrectionInput` puede
acotar el pico de lectura. `DeriveCorrectedSession` vuelve a alinear y a
materializar una vista corregida; `InspectCorrectionLaps` también crea esa
vista antes de paginar sólo la respuesta. Por ello la primera sustitución
productiva debe ocurrir **dentro de esta frontera común**, manteniendo la
autorización, el bloqueo por sesión y la serialización de lectura ya existentes.

El primer contrato incremental, `VisitCorrectionPages`, inspecciona la sesión
y visita páginas del parser autorizado, con cancelación y cuotas comprobadas
en cada página; no devuelve un `[]HistoricalPage` completo. Su siguiente
consumidor incremental será la validación del reloj GPS, contrastada con `BuildTemporalAlignment` para
puentes válidos, índices duplicados, páginas desordenadas, valores inválidos y
cobertura truncada. Hasta demostrar esa paridad en streaming, la ruta pública actual seguirá
siendo el oráculo. Preparación, edición y proyección no se anunciarán como
acotadas porque una sola operación todavía materialice todas las muestras.

La alineación de páginas **ya materializadas** usa un índice de páginas GPS
ordenadas en la ruta propia y conserva el mapa general cuando recibe páginas
fuera de orden. Esto reduce asignaciones medidas, pero el índice de páginas y
las propias muestras aún crecen con la grabación. No sustituye la validación
incremental ni cambia el objetivo de memoria de este ADR.

## Alternativas y límites

- Aumentar `MaxSamples`/`MaxValues` prolonga el fallo; no acota memoria.
- Clonar menos páginas reduce un factor, pero mantiene crecimiento lineal con muestras; el primer corte `d7a2514a` sólo hace esto.
- Volcar toda la telemetría a un almacén temporal añadiría custodia, limpieza, I/O y otra fuente de fallos. Se reevalúa únicamente si la relectura paginada medida no alcanza el tiempo objetivo.
- Un nuevo lector DuckDB para Strategy duplicaría autoridad y se descarta. Otros simuladores seguirán sus propios formatos detrás del contrato de páginas, sin exigir DuckDB.

No se altera el criterio de inclusión de vueltas, la estimación de incertidumbre ni el solver. El bloqueo Hypercar #1367 y la calibración independiente #1030 se validan por separado. Esta propuesta no cierra ISA-1375 ni T22.
