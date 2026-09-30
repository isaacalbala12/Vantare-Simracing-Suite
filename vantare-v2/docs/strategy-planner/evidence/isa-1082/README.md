# ISA-1082 — cliente nativo de fuentes y correcciones

Base f68e22143d78710280f9751a642027d1a7beeb62.
Rama vantareapp/isa-1082-native-analysis-client; C:/tmp/vantare-isa1082.

Cuatro archivos nuevos frontend/src/strategy/analysis-{client,contract}{,.test}.ts;
strategy-application-client.ts solo exporta el parser de proyección existente.
Contrato de correcciones, ambos handoffs y roadmap manual/generado actualizados.

Nombre nativo contrastado con bindings.go del Wails Go instalado y Call.ByName /
cancelOn del runtime TS instalado. Contratos contrastados con historical.go,
corrections.go y servicio Analysis. Pruebas controladas, sin DuckDB real.
Se validan identidad, base, revisión, presencia/calidad, cero/false, paginación,
enteros seguros y cancelación; no se inventan datos ni se reintenta guardar.
La validación de SHA es de formato, no prueba integridad criptográfica en JS.

Suite frontend con dos workers: 418 archivos / 3281 tests PASS (334,07 s),
log C:/tmp/isa1082-frontend-test.log. Focal inicial 14/14 y typecheck final PASS.
El log incluye AbortError de teardown happy-dom; la suite termina con exit 0.
Lint y git diff --check PASS. Revisión personal del diff y contratos realizada.
Sin build frontend/desktop ni apertura de app por instrucción de Isaac.
Go no cambiado: no se repite su suite en este corte.

Verificación manual futura: dentro de Vantare, abrir una fuente autorizada,
leer una página, guardar una corrección, consultar su revisión exacta y cancelar
una lectura. Esto requiere conectar la UI; no se presenta como prueba realizada.
Siguen pendientes selección persistida, agregación, edición restante, UI y
validación física/Wails. Sin dependencias nuevas, LMU, modificación de originales,
push/PR, CI remota, merge, promoción ni release.
