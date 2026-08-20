# 05 — Rendimiento y benchmarks

> **Fecha:** 2026-08-19  
> **Entorno medido:** Windows/amd64, AMD Ryzen 7 3700X (8C/16T), Go 1.25, Node 24.14.1.  
> **Alcance:** experimentos aislados bajo `docs/research/telemetry-architecture-2026/bench/`; no se modificó código productivo.  
> **Disciplina de evidencia:** “medido” significa que existe salida cruda conservada en `bench/results/`; “calculado” es aritmética sobre bytes medidos; “estimado” se identifica expresamente. Una repetición iniciada en esta continuación quedó incompleta y no se usa. La repetición acotada posterior fue bloqueada por permisos del caché Go (`AppData/Local/go-build`), no por un fallo del producto.

## 1. Resumen ejecutivo

La CPU de las capas Go no justifica por sí sola desmontar el Core: reducer, derive y proyección caben holgadamente en el presupuesto de 60 Hz. El problema medido está en la **forma y frecuencia del payload**, en la repetición de campos de calidad por vehículo y en el último kilómetro TypeScript.

El hallazgo crítico es funcional, no una microoptimización: el Hub rechaza payloads mayores de 256 KiB (`internal/app/telemetrytransport/transport.go:44, 568-592`). Con los contratos actuales, Engineer supera ese límite con 85 vehículos y Overlay con 103; a 104 ambos fallan. El runtime convierte el error de publicación en `failStop` (`internal/app/telemetry_core_runtime.go:789-795, 668-683`), de modo que un grid soportado por LMU puede detener toda la telemetría.

Un `OverlayFrame` preparado para UI y tipado, conservando sólo datos que el overlay necesita, redujo el payload sintético de 104 coches de 269.573 B a 35.209 B (−86,9 %) y el coste de parse JSON de ~1,84 ms a ~0,21 ms. RFC7396 apenas redujo el payload actual en ese escenario porque los arrays de vehículos se reemplazan completos; además requiere secuencia/base correcta. No compensa su complejidad inicial.

## 2. Metodología y artefactos

Los fixtures se construyen en `bench/fixtures.go`; las variantes compactas en `bench/compact_frame.go`; los tamaños y payloads reproducibles en `bench/payload_sizes_test.go`; el límite real del Hub en `bench/transport_limit_test.go`; etapas Go en `bench/pipeline_bench_test.go`; transporte en `bench/transport_bench_test.go`; latencia/GC en `bench/latency_gc_test.go`; y parse/decoder/adaptador frontend en `bench/frontend-bench-entry.ts` y `frontend-bench.mjs`.

Los resultados crudos conservados son:

- `bench/results/payload-sizes.txt` y `.csv`;
- `bench/results/transport-payload-ceiling.txt`;
- `bench/results/existing-telemetry-benchmarks.txt`;
- `bench/results/existing-app-benchmarks.txt`;
- `bench/results/latency-and-gc.txt`;
- `bench/results/frontend-json-and-adapter.txt`;
- payloads JSON de cada variante para 1, 20 y 104 vehículos.

Los experimentos no ejecutan una WebView Wails real ni un navegador OBS. Separan producción del payload, marshal, Hub, `JSON.parse`, validación TypeScript y adaptación legacy. Por tanto no miden `ExecJS`, IPC, layout, React paint ni composición GPU.

## 3. Tamaño por frame y ancho de banda

### 3.1 Resultados medidos

| Variante | 1 coche | 20 coches | 104 coches |
|---|---:|---:|---:|
| Overlay v1 actual | 7.221 B | 55.757 B | 269.573 B |
| Engineer v1 actual | 6.889 B | 64.876 B | 320.631 B |
| Strategy v1 | 1.356 B | 1.356 B | 1.356 B |
| Analysis v1 | 847 B | 847 B | 847 B |
| Canonical serializable completo* | 6.960 B | 60.754 B | 298.482 B |
| OverlayFrame compacto, vehículos array | 760 B | 7.104 B | 35.209 B |
| OverlayFrame compacto, vehículos map | 770 B | 7.304 B | 36.249 B |
| RFC7396 sobre Overlay v1 | 5.535 B | 54.111 B | 268.079 B |
| RFC7396 sobre compacto | 515 B | 6.899 B | 35.156 B |

\* `schema.Field` tiene datos privados y no se serializa directamente; esta variante refleja una representación JSON equivalente con valor/presencia/provenance/freshness. Es una aproximación explícita al coste de transportar el canonical, no código productivo.

El array compacto fue entre 1,4 % y 2,9 % menor que el mapa keyed por ID. Un mapa no aporta ahorro wire; su posible ventaja sería lookup, a cambio de perder orden explícito y de introducir claves duplicadas en JSON. Para Standings/Relative, un array ordenado con `vehicleId` tipado es la elección más simple.

### 3.2 MiB/s calculados

| Variante, 104 coches | 10 Hz | 20 Hz | 30 Hz | 60 Hz |
|---|---:|---:|---:|---:|
| Overlay v1 | 2,57 | 5,14 | 7,71 | 15,43 MiB/s |
| Engineer v1 | 3,06 | 6,12 | 9,17 | 18,35 MiB/s |
| Canonical completo | 2,85 | 5,69 | 8,54 | 17,08 MiB/s |
| Compacto array | 0,34 | 0,67 | 1,01 | 2,02 MiB/s |

Estos valores son payload JSON puro; no incluyen envelopes, copias internas, SSE, IPC ni overhead de WebSocket/HTTP. Publicar el full actual a 60 Hz multiplica bytes sin que Standings, sesión o clima cambien a esa frecuencia. Regular **antes de proyectar y serializar** evita trabajo, mientras regular después del marshal sólo ahorra transporte.

## 4. Límite de 256 KiB: fallo reproducido

`MaxPayloadBytes` es 262.144 B. El experimento contra `NewOverlayFull` y el Hub real encontró:

| Producto | Máximo aceptado | Primer rechazo | 104 coches |
|---|---:|---:|---:|
| Overlay v1 | 102 coches | 103 | rechazado |
| Engineer v1 | 84 coches | 85 | rechazado |

En 104 coches, el generador de tamaños produjo 266.707 B para Overlay y 320.656 B para Engineer en la prueba específica del techo. La pequeña diferencia frente a la tabla de §3 proviene de fixtures distintos, pero ambos cruzan el mismo límite. La prueba end-to-end publicó 20/60/90 coches y devolvió `telemetry projection transport payload exceeds limit` para 104.

Esto confirma el defecto D-08 de `06-reliability-review.md`: no basta con subir silenciosamente el límite. Hay que compactar contratos, desacoplar fallos de consumidores y añadir un test de 104 coches en el runtime. Subir el límite puede ser mitigación temporal, no arquitectura.

## 5. Coste del pipeline Go

### 5.1 Microbenchmarks existentes

Resultados productivos conservados (`existing-telemetry-benchmarks.txt`):

| Etapa/fixture | Tiempo | B/op | allocs/op |
|---|---:|---:|---:|
| Parse LMU ObjectOut, 44 coches | 42,7 µs | 29.548 | 155 |
| Fusión LMU | 3,87 µs | 656 | 6 |
| REST decode | 5,50 µs | 2.112 | 24 |
| Reducer, 64 coches | 28,5 µs | 85.416 | 5 |
| SessionCoordinator, 64 | 30,9 µs | 62.720 | 9 |
| Derive pipeline, 64 | 144,0 µs | 232.296 | 13 |
| Fanout snapshot, 64 | 10,8 µs | 40.960 | 1 |

El catálogo por ID midió 15,1 ns frente a 1,92 ns de acceso directo a struct. La diferencia relativa es grande, pero la absoluta es irrelevante frente a parse, clones, derive y JSON; no justifica un rediseño por rendimiento.

`BenchmarkTelemetryCoreCombined64Vehicles` registró 8,07 ms, 1,75 MB/op y 196 allocs/op. Este benchmark de `internal/app` no debe interpretarse como “el pipeline cuesta 8 ms”: incluye preparación/copia y camino combinado distinto de la suma de microetapas. La discrepancia exige perfilar el benchmark antes de usarlo para dimensionar CPU. Se conserva como señal de que el wiring completo asigna mucho, no como estimación directa del frame vivo.

### 5.2 Repetición parcial descartada

La continuación inició `-count=3`; sólo terminó filas iniciales del reducer antes de ser interrumpida. Como no completó todas las variantes, esos números no se usan para comparar. La ejecución acotada posterior no pudo crear un archivo del caché Go por restricciones del entorno. Los resultados previos completos permanecen disponibles, pero no se afirma significancia estadística entre arquitecturas: no existe aún un `benchstat` actual-vs-recomendado sobre implementaciones productivas equivalentes.

## 6. Proyección, marshal, latencia y GC

El test aislado procesó 3.200 frames por escenario. Debido a la granularidad aproximada de 1 ms de `time.Now` en el host Windows, midió bloques de 16 frames y dividió el tiempo; esto reduce cuantización, pero los percentiles siguen siendo menos precisos que un benchmark Go estándar.

| Cadena | Media | p50 | p95 | p99 | GC/3.200 | alloc total |
|---|---:|---:|---:|---:|---:|---:|
| Actual v1+marshal, 1 | 88 µs | 73 µs | 131 µs | 160 µs | 128 | 302 MiB |
| Compacto+marshal, 1 | 20 µs | ~0* | 63 µs | 94 µs | 70 | 156 MiB |
| Actual v1+marshal, 20 | 242 µs | 250 µs | 312 µs | 321 µs | 137 | 978 MiB |
| Compacto+marshal, 20 | 59 µs | 63 µs | 98 µs | 125 µs | 64 | 453 MiB |
| Actual v1+marshal, 104 | 1,013 ms | 0,973 ms | 1,263 ms | 1,352 ms | 118 | 3.951 MiB |
| Compacto+marshal, 104 | 0,310 ms | 0,313 ms | 0,407 ms | 0,444 ms | 55 | 1.798 MiB |

\* Artefacto de resolución del reloj; no significa latencia cero.

Ambas variantes caben en 16,67 ms a 60 Hz en CPU backend aislada. El compacto reduce aproximadamente 69 % la media a 104 coches y 54 % los bytes asignados acumulados. La ganancia relevante es menos GC y mucha menos presión en IPC/frontend, no “hacer viable” el reducer.

## 7. Frontend: parse, decode y adapter legacy

Node ejecutó 2.000 iteraciones por caso tras 200 de calentamiento:

| Operación | 1 coche | 20 coches | 104 coches |
|---|---:|---:|---:|
| `JSON.parse` Overlay v1 | 36,7 µs | 282 µs | 1,84 ms |
| Decode Overlay v1 | 35,3 µs | 324 µs | 2,08 ms |
| Adapter → `TelemetrySnapshot` | 25,8 µs | 256 µs | 1,68 ms |
| Parse+decode+adapter | 102 µs | 1,01 ms | 5,89 ms |
| `JSON.parse` compacto array | 6,0 µs | 45,3 µs | 0,211 ms |
| `JSON.parse` compacto map, 104 | — | — | 0,222 ms |

En 104 coches el p99 de parse+decode+adapter fue 7,94 ms. A 60 Hz consume cerca de la mitad del presupuesto de un frame antes de React, layout o pintura; a 30 Hz sigue siendo gasto evitable. El adaptador legacy representa ~1,68 ms de media y además pierde calidad semántica (`overlay-projection-adapter.ts`, analizado en 07). Retirarlo tiene evidencia simultánea de rendimiento y mantenibilidad.

Node/V8 no equivale exactamente a la WebView2 embebida. Estos datos comparan formas de payload y pasos TypeScript; no predicen FPS final por sí solos.

## 8. RFC7396 y pérdida de secuencias

Sobre Overlay actual, el patch de 104 coches fue 268.079 B frente a 269.573 B: sólo −0,55 %. Sobre el compacto fue 35.156 B frente a 35.209 B: −0,15 %. La causa es estructural: RFC7396 no hace patch elemento a elemento de arrays; si cambia Standings, reemplaza el array.

El Hub soporta deltas, pero producción pasa `nil` en ambas publicaciones (`telemetry_core_runtime.go:789,793`). El frontend necesita una base exacta y lógica de resync. Para Vantare local, latest full snapshot permite saltar frames sin reconstrucción y recuperarse al abrir una ventana a mitad de sesión. Veredicto: **no activar RFC7396**. Reconsiderarlo sólo si una medición con datos vivos, un formato apto para listas y resync demuestra ahorro material superior a su complejidad.

## 9. Subscriber lento y latest-wins

El Hub usa un pending slot por suscriptor y coalescing (`telemetrytransport/transport.go:151-173, 409-477`); un suscriptor lento no genera una cola ilimitada de snapshots. El benchmark existente de publicación del Hub midió 71,4 µs, 12.636 B/op y 357 allocs/op, pero no representa una WebView lenta ni SSE bloqueado.

Para estado continuo, la política correcta es latest-wins con un full retenido. Para facts, drop silencioso no es correcto: requieren cursor monotónico, cola acotada, métrica de overflow y resync/replay explícito. Engineer y Recording no deben ejecutarse síncronamente dentro del commit del Core.

## 10. CPU aproximada por cadencia

Usando la media aislada de proyección+marshal de §6, no el benchmark combinado:

| 104 coches | 10 Hz | 20 Hz | 30 Hz | 60 Hz |
|---|---:|---:|---:|---:|
| Actual backend | ~1,0 % de un core | ~2,0 % | ~3,0 % | ~6,1 % |
| Compacto backend | ~0,3 % | ~0,6 % | ~0,9 % | ~1,9 % |

Es una aproximación lineal de tiempo de pared en un core, no CPU de proceso observada. No incluye adquisición, Engineer, SSE/Wails ni frontend. Sí demuestra que regular el payload estático a 10–20 Hz puede ahorrar más que eliminar una función Go de microsegundos.

## 11. Cadencias recomendadas

El backend debe adquirir a la frecuencia útil de cada driver y hacer un commit canónico coherente. Los productos publican después, con cadencias propias y antes de serializar:

| Sección/producto | Cadencia inicial | Razón |
|---|---:|---|
| Player controls/RPM/gear/speed | 30–60 Hz | fluidez; frontend puede interpolar sólo visualmente |
| Relative/spotter espacial | 20–30 Hz | respuesta rápida sin exigir 60 Hz universal |
| Standings/gaps/fuel/session | 5–10 Hz, o dirty-trigger + tope | cambian más despacio |
| Status/source health | integrado en full, 2–5 Hz o al cambiar | evita stream/revision paralelos |
| Engineer latest state | 5–10 Hz, async latest-wins | no debe bloquear overlay |
| Facts | inmediatamente, ordenados | eventos discretos no se muestrean |
| Recording | según esquema del canal, async | fidelidad analítica sin bloquear Core |

No es necesario dividir inmediatamente el wire en múltiples streams. Un primer `OverlayFrame` compacto a 20–30 Hz elimina el riesgo principal. Los tiers sólo se introducen si métricas de frames sucios y WebView muestran beneficio adicional.

## 12. Conclusión arquitectónica

1. **Conservar** adquisición, validación, calidad, identidad, reducer y derivaciones Go: su coste medido es proporcional y sus garantías son valiosas.
2. **Rediseñar el borde de producto**, no el canonical como primer paso: ViewModels/frames tipados y compactos, sin `TelemetrySnapshot` legacy ni lógica de dominio duplicada.
3. **Publicar latest full snapshot** y regular antes de proyectar/serializar. No activar RFC7396.
4. **Aislar consumidores**: payload demasiado grande, Strategy, Engineer o Recording no pueden detener Core/Overlay.
5. **Añadir gates de 104 coches**, p99 y bytes/frame. El límite de 256 KiB debe ser una prueba de contrato, no una sorpresa terminal.
6. **Posponer protocolos binarios**: JSON compacto de 104 coches mide 35 KiB y 0,21 ms de parse; no hay evidencia para pagar complejidad binaria ahora.

## 13. Incertidumbres pendientes

- No se midió Wails `ExecJS`, WebView2, SSE real, React commit/layout/paint ni OBS.
- No existe benchmark estadístico de una implementación productiva de la arquitectura recomendada; el compacto es prototipo sintético fiel al shape propuesto.
- No se midió una sesión larga con heap estable; `alloc total` sobre 3.200 frames mide churn, no fuga.
- Los percentiles Go dependen de un reloj Windows grueso; deben repetirse con `testing.B`, `benchstat` y perfiles CPU/alloc tras implementar un vertical slice.
- Los payloads de Strategy/Analysis constantes reflejan sus contratos actuales pequeños, no productos futuros completos.

Estas incertidumbres no cambian el defecto del límite ni la dirección de la recomendación; sí impiden prometer un porcentaje final de CPU/FPS antes del vertical slice.
