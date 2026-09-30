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

## T04b — banco visual recuperado

RED confirma Call ausente. El mock ahora exporta una llamada que rechaza toda
operación nativa: no devuelve sesiones ni estado de un lector ficticio. GREEN
por cliente Analysis real contra runtime de harness; ESLint focal PASS.
Chromium monta el producto, permite entrar al asistente y captura frame-01.png:
1672x941, sin pageerror y sin overflow de documento. Datos del harness son
fixtures preexistentes, no prueba de telemetría/Wails. Sin procesos nativos.

Revisión propia: marco presente, pero arte de fondo no es la revisión final,
columna/rail más anchos y textos/pasos antiguos. No supera gate A4. Sigue T04c
(arte final garage-journey-v2 y dimensiones acotadas) y T05 (recorrido real cinco
pasos). No solicitar review humana todavía. Full suite posterior pendiente.

## T04c — referencia final y dimensiones

El prototipo tiene overrides posteriores: arte final garage-journey-v2.png,
fondo a900px, rail72 y columna256. Se aplican sólo al asistente y se conserva
columna plegable. frame-02.png usa animación/transiciones desactivadas para una
captura estable: CSS grid72/256/1344, zoom1, documento1672x941 sin overflow,
sin pageerror. No es paridad final: quedan cinco pasos, contenido, contexto y
footer transversal. No se usa la imagen como prueba del motor.

T04a full frontend421 archivos/3322 tests PASS; T04b prueba nueva RED/GREEN y
typecheck/lint focal PASS. Suite completa posterior a b/c: 422 archivos/3323
tests PASS, lint y build con tipos PASS. Logs C:/tmp/isa1093-t04c-tests.log,
C:/tmp/isa1093-t04c-lint.log y C:/tmp/isa1093-t04c-build.log. Esto no certifica
paridad visual ni Wails: esos gates siguen pendientes.
