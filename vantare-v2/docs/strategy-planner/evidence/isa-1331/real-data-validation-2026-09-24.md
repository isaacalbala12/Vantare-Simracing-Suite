# ISA-1331 — Validación de referencias con DuckDB reales (24-sep-2026)

La conexión existe, pero las sesiones probadas no producen familias con presencia `valid`. La pantalla de preparación oculta las magnitudes con presencia `unknown` y muestra guiones; no se ha validado todavía un cálculo óptimo alimentado por datos reales.

## Recorrido comprobado

El frontend pide `get_revision_planning_inputs` para las revisiones exactas. Strategy delega en `StrategyRevisionCatalog`, que deriva las familias desde la sesión autorizada de Analysis. El banco opt-in `TestRecordedStrategyRealDuckDB` recorrió importación, apertura, preparación, proyección exacta, consulta de Strategy, cierre/reapertura y comprobación SHA-256 de los originales. Se añadió al banco el registro explícito de presencia, muestras, magnitud y motivo para ritmo y combustible.

| Fuente LMU | Observación directa en DuckDB | Proyección exacta de Analysis |
| --- | --- | --- |
| COTA práctica `2026-09-09T18_43_03Z` (la abierta en Wails) | `Lap`: un registro, máximo 0; `Lap Time`: 0; `In Pits`: 1; combustible 67,905–68 L | No hay vuelta completa; no puede dar ritmo ni consumo por vuelta. SHA-256 documentado: `B6F8AFFFDF59066B13210499DA9B23524C8F72944B40F5193EFA96ACFAD60F34`. |
| COTA práctica `2026-07-18T15_05_04Z` | `Lap` 0–2; combustible 68,560–74,972 L | Ritmo seco 116,071 s, 1 muestra, `unknown`; combustible 2,405 L/vuelta, 1 muestra, `unknown`. Banco PASS 11,90 s; SHA-256 original `896cf401267ab34a4d953a4fd130e944b352deb6fd1f71653690460695dc287f` intacto. |
| COTA práctica `2026-07-17T19_06_50Z` | `Lap` hasta 8 | Ritmo seco 116,589 s, 3 muestras, `unknown`; combustible 2,401 L/vuelta, 3 muestras, `unknown`. Banco PASS 18,85 s; SHA-256 original `7da31387f851721bf9d32e92849c7dc22c93da43668044ecac57138f0ec2024e` intacto. |
| COTA carrera `2026-07-18T15_24_25Z` | `Lap` 0–30; 31 eventos; 72.287 muestras de combustible | Ritmo seco 115,913 s, 21 muestras, `unknown`; combustible 2,490 L/vuelta, 22 muestras, `unknown`. Banco PASS 43,13 s; SHA-256 original `bda9a70a621fd76df80242b7a3978d728042be30f7b5e9a2d927e14f45b04695` intacto. |

Las magnitudes `unknown` son observaciones con incertidumbre, no entradas válidas para afirmar una estrategia óptima. En las tres proyecciones con vueltas, el motivo de ritmo es `no_clean_complete_laps_for_representative_pace`. El análisis inicia las fronteras de vuelta en `unknown` (`lapvalidity.go`, `reconcileLapBoundaries`); `consumptionpace.go` compone la presencia más débil de frontera, segmento y clima. En las fuentes probadas eso propaga `unknown` a las familias agregadas incluso con 21–22 muestras. No se debe sustituirlo por `valid` sin un criterio verificable de fronteras, incidentes y cobertura.

## Resultado y siguiente corrección

La UI necesita distinguir «sin vueltas» de «observado con calidad pendiente», mostrar el motivo y ayudar a escoger sesiones con cobertura real. Analysis debe definir y probar cuándo una frontera y una vuelta son válidas, incluyendo vueltas invalidadas pero normales, incidentes, huecos y boxes. Sólo entonces se repite el banco con proyección `valid` y se verifica el cálculo nativo; las cifras `unknown` nunca se promocionan por presentación.

Esta validación no modifica originales, no arranca LMU, no acredita toda la QA visual ni cierra T22. No hay push, PR, CI remota, merge, promoción ni release.
