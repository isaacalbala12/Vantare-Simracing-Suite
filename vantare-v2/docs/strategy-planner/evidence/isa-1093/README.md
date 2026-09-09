# ISA-1093 — porte A4 productivo

Base 7446c0e69dc5a65c4e1dae9536580284a867aed0; rama vantareapp/isa-1093-recorded-a4.
Primer corte: marco React presentacional integrado en el asistente existente,
arte garage-a4.png aprobado (decoración generada, no telemetría), tokens Orbit,
progreso accesible, foco al cambiar paso y footer. El padre conserva estado y
acciones. Cinco paths de lógica/test/asset, más cuatro traducciones asociadas.

Estado de transición: todavía tres pasos anteriores, textos/formularios previos;
T05 los sustituirá por los cinco aprobados. No aceptación visual ni recorrido
A4 completo. No cálculos ficticios añadidos. El marco no consulta persistencia.

51 tests focales PASS; se conservó anuncio de paso tras detectar regresión en
una prueba. Lint y build con tipos PASS; full frontend en curso, log
C:/tmp/isa1093-t04a-tests.log. Sin Go nuevo en este corte.

El banco visual existente no monta: wails-runtime-mock no exporta Call, ahora
importado por Analysis. Error reproducido en Chromium contra puerto5193,
script C:/tmp/isa1093-capture.cjs. Sin captura útil de paridad. Siguiente corte
acotado repara esa exportación del soporte de pruebas y conserva rechazo
explícito de operaciones nativas no implementadas; no finge lectura DuckDB.

Base #1092 T02c4: 420 archivos/3321 tests PASS, lint/build PASS. Issue1092 sigue
abierta por recursos/pilotos/reglas visibles. T01 Wails y calibración pendientes.
No app nativa/LMU abiertos, no push/PR/CI remoto/merge/release.
