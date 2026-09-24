# Copia y recuperación de una revisión LMU real — ISA-1373

Banco opt-in `TestTelemetryAnalysisRealVerifiedCopyRecoversSavedRevision`, ejecutado el 2026-09-24 en Windows con el lector DuckDB de confianza usado por la app. Fuente: `Circuit of the Americas_P_2026-07-17T19_06_50Z.duckdb` (22.933.504 bytes, SHA-256 `7DA31387F851721BF9D32E92849C7DC22C93DA43668044ECAC57138F0EC2024E`). La fuente se lee y se duplica en un directorio temporal; el test sólo borra ese duplicado.

Recorrido PASS: selección explícita y estabilidad del duplicado → apertura con parser productivo → preparación → inspección de una vuelta editable → exclusión de esa vuelta para la curva de ritmo y guardado de una nueva revisión → copia verificada en carpeta retenida → cierre y reinicio de Analysis → borrado del duplicado inicial → recuperación sólo desde la copia registrada → apertura con la misma identidad → misma base y revisión inicial → carga de la revisión corregida, con exclusión persistida → proyección de esa revisión. El test comprueba SHA-256 idéntico antes/después en el archivo LMU original.

Comando: `go test -p 1 ./internal/app -run '^TestTelemetryAnalysisRealVerifiedCopyRecoversSavedRevision$' -count=1 -v` con `ISA1373_REAL_SOURCE` y `ISA1088_RUNTIME_APP` asignados explícitamente a la fuente y al directorio del lector. Resultado final `PASS` (2,95 s). El test se omite sin ambas variables; no depende de LMU en ejecución.

Alcance: integración Go con DuckDB real y autorización controlada de desarrollo. No acredita WebView2/Wails, selector nativo de carpeta, persistencia de un borrador de Strategy tras reinicio ni errores físicos de permisos/espacio. No se arrancó ni cerró LMU.
