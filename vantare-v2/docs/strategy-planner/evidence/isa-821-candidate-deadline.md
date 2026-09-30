# ISA-821 — deadline por candidato

Base `b85fa5f4`, rama `vantareapp/isa-821-candidate-deadline`, ejecución personal.

## Cambio y regresiones

Cada candidato recibe un contexto con deadline derivado del padre. El presupuesto
operativo inicial es 29 minutos frente a 30 del cliente; no es una medición de
latencia ni un umbral de calidad de telemetría. Las opciones no pueden ampliarlo.
Se espera la salida del importer, sin abandonar goroutines ni desbloquear un
reintento mientras ese trabajo siga activo. Un éxito devuelto después de vencer
el contexto se descarta antes de guardar el modelo.

RED reproducido: importer sin deadline y éxito después de cancelar el padre.
GREEN: timeout con error o éxito tardío, cero sesiones guardadas, fallo
`candidate_timeout`, reintento posterior y límites de configuración.
El banner traduce timeout y pérdida del catálogo en ES/EN/PT/IT; RED/GREEN de
ambos mensajes y sus doce tests focales pasan.

## Frontera y límites

`LMUImporter.Import(ctx)` ya transmite contexto a autorización, staging, Inspect
y ReadPage. El reader conserva el plazo padre al añadir límites por operación.
`readerSession.request` termina el helper y espera su salida y el lector de
respuesta al cancelar. No se introduce un segundo protocolo de cancelación.

Cancelación cooperativa de Go: el plazo no interrumpe por la fuerza cualquier
cálculo CPU o llamada de filesystem. El importer debe responder al contexto;
no se afirma un límite duro de tiempo para un importer que lo ignore. La espera
protege de duplicar ese trabajo. Tampoco es cancelación instantánea al cerrar UI.
La prueba de terminación física del helper con build tag duckdb_integration no
se ejecuta en este corte; la trazabilidad de propagación se revisó estáticamente.

## Revisión y checks

Revisión personal de correctitud, simplicidad, arquitectura, seguridad y coste:
context.WithTimeout estándar, defer cancel, sin nuevos procesos o dependencias;
no se guarda un resultado tardío ni se amplía el límite del cliente.

Build, Go completo, typecheck y lint: PASS. Frontend completo: 415 archivos /
3243 tests PASS (300.09 s, exit 0). Happy DOM emite AbortError al desmontar;
no hay tests fallidos. Digest y diff check PASS. Logs locales en
`C:/tmp/vantare-isa821-*-final.log` y logs separados de build/typecheck/lint.
No se modifica ningún DuckDB original ni se inicia LMU/Wails. Verificación manual:
reintentar una sesión omitida desde Strategy y comprobar la causa y el progreso;
para provocar el plazo de forma determinista usar las regresiones del servicio.
Sin push, PR, CI remota, merge, promoción o release.
