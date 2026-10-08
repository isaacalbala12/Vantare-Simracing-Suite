# ISA-1080 — preparación autorizada

Base 40419038; rama vantareapp/isa-1080-authorized-correction-input;
worktree C:/tmp/vantare-isa1080. Cinco Go: lector de entrada y test,
servicio TA-03E existente, método de preparación y test.

El servicio conserva el artefacto emitido al abrir con consentimiento y recibe
solo handle opaco. Analysis inspecciona/lee canales requeridos, deriva validez y
produce base/revisión vacía estables. No usa el handle como identidad de datos.
Lectura serializada y acotada; exceder presupuesto no produce resultado parcial.

Tests: tablas completas de eventos de fixture registrada s266 para paginación.
Sus endpoints continuos dispersos se excluyen expresamente del contrato de
lector del test; no se inventan muestras omitidas. Base esperada recalculada
sobre el mismo subconjunto declarado. Presupuestos de muestras/valores/texto,
cancelación, página mal formada y artefacto ausente rechazan sin resultado.
App usa fixture controlada de parser/permisos, no un DuckDB real: licencia
revocada, path arbitrario, concurrencia, cancelación, fallo lector y reintento
de limpieza. Original del test intacto. No demuestra precisión física o Wails.

RED por API ausente; GREEN posterior. Analysis/subpaquetes y app completos,
vet, build frontend y Go global pasan. Log C:/tmp/isa1080-go-test.log.
Build conserva aviso heredado de chunks. No se repite suite frontend porque
no cambió TS/CSS; último gate #1079: 416 archivos/3264 tests con dos workers.
Revisión personal de cinco archivos, lifecycle, presupuestos y error paths.

Contrato, handoffs Strategy/Analysis y roadmap actualizados. Faltan comandos
de guardado/proyección autorizados, selección persistida, operaciones restantes
y UI. Sin dependencias nuevas, fuentes reales leídas, LMU, push/PR/CI remota,
merge, promoción o release.
