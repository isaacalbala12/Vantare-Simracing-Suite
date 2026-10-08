# ISA-1331 — Validación de referencias con DuckDB reales (24-sep-2026)

## Estado actual

El banco opt-in, con el lector y las revisiones reales, produce para la carrera COTA del Oreca 07 LMP2_ELMS ritmo seco `valid` de **115,901 s** (20 vueltas) y combustible `valid` de **2,469 L/vuelta** (21 vueltas). La energía virtual queda `missing`, motivo `virtual_energy_not_applicable`, aunque el canal histórico esté presente a cero. Con esas referencias, `CalculateOrbit` completó un evento de prueba explícito de 60 minutos, depósito de 90 L y pérdida de parada de 40 s: 32 vueltas, cero paradas, `optimality=proven` **dentro del modelo y de esas reglas supuestas**. No equivale a validar la estrategia real de la carrera ni su precisión empírica.

La frontera inicial permanece `unknown`: es el estado al comenzar la grabación, no una línea de meta observada. Las otras 30 fronteras de esa carrera son `valid` porque cada evento secuencial de vuelta coincide de forma única con un reinicio de distancia y ambos relojes están alineados dentro de un periodo de muestreo. El agregador conserva las observaciones inciertas por vuelta, pero sólo usa muestras `valid` para la referencia cuando existen. Si no hay ninguna, la referencia sigue siendo incierta.

Un diagnóstico de lectura, sin modificar los originales, examinó cinco archivos de preparación/carrera de COTA, Imola, Algarve y Monza: los 206 eventos posteriores al estado inicial tenían contador secuencial y reinicio único dentro de 0,1 s; la mayor diferencia por archivo estuvo entre 0,0825 y 0,0925 s. Esto justifica la concordancia temporal para este corpus, no sustituye la anotación independiente de incidentes, ritmo, clima ni los cortes de calibración por clase. El banco volvió a pasar en 54,77 s y verificó SHA-256 intactos del original COTA (`bda9a70a621fd76df80242b7a3978d728042be30f7b5e9a2d927e14f45b04695`) y el objetivo Monza (`08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538`). `go test ./...` pasa. Falta validación visual/nativa de esta corrección y el contraste empírico contra carreras anotadas.

Se repitió el banco con la práctica COTA `2026-07-17T19_06_50Z`: 8 fronteras `valid` y la inicial `unknown`, ritmo seco `valid` de 116,589 s (N=3), combustible `valid` de 2,401 L/vuelta (N=3), VE LMP2 no aplicable; hash original `7da31387f851721bf9d32e92849c7dc22c93da43668044ecac57138f0ec2024e` intacto. **Antes de la corrección posterior del adaptador**, el mismo evento supuesto produjo 30 vueltas, 2 paradas y `optimality=not_proven`. La primera pasada del banco falló en una aserción histórica que exigía igualdad de VE incluso al corregir la clase LMP2 a Hypercar; el test ahora exige que sólo esa familia cambie por aplicabilidad y que las demás permanezcan idénticas. Segunda pasada PASS 18,35 s.

## Corrección posterior de la decisión optimizada

El `not_proven` de la práctica reveló una discrepancia del adaptador de Strategy: SolverV2 había elegido dos paradas sin repostaje, pero la reconstrucción visible reducía la carga inicial y añadía repostajes. El replay era factible, aunque distinto de la decisión optimizada. La evaluación final conserva ahora la decisión y cargas que determina el mismo modelo de recursos de SolverV2 **sólo cuando no hay ajustes de stint o parada**. Los ajustes siguen pasando por replay y no heredan una prueba de optimalidad. Una regresión falló antes de corregirlo; después, los tests de Strategy y los dos clientes frontend que comparten el golden pasan.

El banco de práctica repetido produce 30 vueltas, 2 paradas y `optimality=proven` dentro del modelo del evento supuesto; original y objetivo siguen con SHA-256 intactos. El banco de carrera COTA se repitió después: 32 vueltas, 0 paradas, `optimality=proven`; ambos hashes intactos. Estos resultados aún no contrastan el plan contra el resultado de una carrera real ni certifican precisión empírica.

Gates de este corte: `go test ./internal/strategy/... -count=1`, `go test ./... -count=1`, 4.300 tests frontend con 2 omitidos, typecheck, lint, build y diff-check pasan. El primer `go test ./...` concurrente con la suite frontend salió con fallo sin conservar el nombre del test en la salida resumida; dos pasadas Go separadas, incluida una fresca sin caché, pasaron. El aviso `AbortError` de teardown de Happy DOM volvió a aparecer sin fallos de tests frontend. No se realizó QA Wails del nuevo backend.

## Observación anterior a la corrección

Antes de reconciliar las fronteras, la conexión existía pero las sesiones probadas no producían familias con presencia `valid`. Los resultados siguientes son la línea base histórica, no el estado actual.

## Recorrido comprobado

El frontend pide `get_revision_planning_inputs` para las revisiones exactas. Strategy delega en `StrategyRevisionCatalog`, que deriva las familias desde la sesión autorizada de Analysis. El banco opt-in `TestRecordedStrategyRealDuckDB` recorrió importación, apertura, preparación, proyección exacta, consulta de Strategy, cierre/reapertura y comprobación SHA-256 de los originales. Se añadió al banco el registro explícito de presencia, muestras, magnitud y motivo para ritmo y combustible.

| Fuente LMU | Observación directa en DuckDB | Proyección exacta de Analysis |
| --- | --- | --- |
| COTA práctica `2026-09-09T18_43_03Z` (la abierta en Wails) | `Lap`: un registro, máximo 0; `Lap Time`: 0; `In Pits`: 1; combustible 67,905–68 L | No hay vuelta completa; no puede dar ritmo ni consumo por vuelta. SHA-256 documentado: `B6F8AFFFDF59066B13210499DA9B23524C8F72944B40F5193EFA96ACFAD60F34`. |
| COTA práctica `2026-07-18T15_05_04Z` | `Lap` 0–2; combustible 68,560–74,972 L | Ritmo seco 116,071 s, 1 muestra, `unknown`; combustible 2,405 L/vuelta, 1 muestra, `unknown`. Banco PASS 11,90 s; SHA-256 original `896cf401267ab34a4d953a4fd130e944b352deb6fd1f71653690460695dc287f` intacto. |
| COTA práctica `2026-07-17T19_06_50Z` | `Lap` hasta 8 | Ritmo seco 116,589 s, 3 muestras, `unknown`; combustible 2,401 L/vuelta, 3 muestras, `unknown`. Banco PASS 18,85 s; SHA-256 original `7da31387f851721bf9d32e92849c7dc22c93da43668044ecac57138f0ec2024e` intacto. |
| COTA carrera `2026-07-18T15_24_25Z` | `Lap` 0–30; 31 eventos; 72.287 muestras de combustible | Ritmo seco 115,913 s, 21 muestras, `unknown`; combustible 2,490 L/vuelta, 22 muestras, `unknown`. Banco PASS 43,13 s; SHA-256 original `bda9a70a621fd76df80242b7a3978d728042be30f7b5e9a2d927e14f45b04695` intacto. |

Las magnitudes `unknown` eran observaciones con incertidumbre, no entradas válidas para afirmar una estrategia óptima. En las tres proyecciones con vueltas, el motivo de ritmo era `no_clean_complete_laps_for_representative_pace`. El análisis anterior iniciaba todas las fronteras de vuelta en `unknown`; `consumptionpace.go` componía la presencia más débil de frontera, segmento y clima. Eso propagaba `unknown` a las familias agregadas incluso con 21–22 muestras.

## Decisión que motivó la corrección

La UI necesitaba distinguir «sin vueltas» de «observado con calidad pendiente». La prueba de concordancia de evento y distancia resuelve la frontera temporal de este corpus; la elegibilidad por incidente, boxes, clima y ritmo sigue siendo una decisión distinta que requiere anotación y contraste. Las cifras `unknown` nunca se promocionan por presentación.

## Corrección visible y prueba nativa posterior

La preparación muestra ahora magnitudes observadas con presencia `unknown` en tarjetas diferenciadas: «Dato incierto · no se usa para calcular». La consulta mantiene la revisión exacta, y el cálculo Go sigue exigiendo presencia `valid`; mostrar una observación no la convierte en entrada apta. Si Analysis comunica `no_completed_laps_for_representative_pace`, la tarjeta indica que la sesión no contiene vueltas completas. Dos pruebas de regresión cubren ambos casos.

Se recompiló un ejecutable localdev de diagnóstico con bundle sin minificar, preservando la protección de Defender y sin usar runtime simulado. Con Computer Use se abrió físicamente `Circuit of the Americas_P_2026-07-17T19_06_50Z.duckdb` en la build nueva: la preparación mostró ritmo **1:56.589**, combustible **2.40 L/vuelta** y VE **0.0**, los tres con la advertencia roja y la sesión Oreca 07/COTA correcta. La captura de la ventana maximizada corresponde a este estado. El SHA-256 del original tras la apertura fue `7DA31387F851721BF9D32E92849C7DC22C93DA43668044ECAC57138F0EC2024E`, idéntico al anterior. Ejecutable `bin/vantare-localdev-uncertain.exe`, SHA-256 `1E040C96786909765E41810F9CF08178293E266534FDA78E44EAE595C3A97B3E`.

Checks: regresión focal 9/9, suite frontend 4.294 aprobadas y 2 omitidas (492 archivos), typecheck, lint, auditor i18n y build Vite localdev sin minificar, todos con salida 0. Vitest emitió un `AbortError` de teardown de Happy DOM sin fallo de test. La build Vite productiva minificada no se repitió por la detección Defender registrada en #1353; este ejecutable de diagnóstico sí está construido y abierto. La elegibilidad de fronteras/vueltas y el cálculo óptimo nativo siguen pendientes. No se arranca LMU, no se cierra T22 y no hay push, PR, CI remota, merge, promoción ni release.
