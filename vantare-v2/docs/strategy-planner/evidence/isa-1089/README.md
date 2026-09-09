# ISA-1089 — coste repetido en búsqueda de paradas

SDD T00/T01. Base43d415f4, rama vantareapp/isa-1089-recorded-solver-timeout,
worktree C:/tmp/vantare-isa1089. Ejecución global del SDD reanudada por Isaac.

## Reproducción y cambio

El test TestRecordedImolaCalculationCompletes usa el input Wails saneado de
ISA-1088. RED: calculation_timeout a8.02s. Perfil CPU local
C:/tmp/isa1089-cpu.prof: appendPit y CalculatePitStop concentran trabajo repetido,
además de asignaciones/GC. No es benchmark comparativo de producto.

Cada búsqueda conserva hasta4096 costes de servicio, indexados por cantidades
enteras Fuel/VE y cambio de neumáticos. El input del solver permanece fijo;
esos son todos los argumentos variables del cálculo del servicio. En miss o
caché llena se usa CalculatePitStop existente. No se cachean errores, no se
eliminan alternativas, no se cambia dominancia/discretización/deadline. Caché
local al SolveV2Context, sin estado global ni nuevas dependencias.

Replay y enumeración exhaustiva siguen usando appendPit sin caché. La prueba
adicional compara nodos completos con/sin caché, en servicios paralelos y
secuenciales, combinaciones Fuel/VE, cambio de neumático y vuelta distinta.
Imola exige final temporal correcto y reserva satisfecha, no sólo ausencia de error.

## Evidencia y límites

Primer GREEN aislado:5.88s,76vueltas,7240.676758s previstos. No equivale a
precisión física ni optimalidad del adapter final (not_proven). Una ejecución
con dos paquetes pesados concurrentes volvió a agotar8s; queda documentada.
Solver/application completos con -p1 PASS. Gates globales y runtime se completan
en la continuación del corte; no certificar mejora porcentual sin condiciones
comparables y repeticiones. Fixture pertenece a preparación, no reserva.

Logs locales: isa1089-focused.log (fallo concurrente),
isa1089-focused-serial.log, isa1089-build.log, isa1089-go-test.log y isa1089-vet.log
en C:/tmp. Fuente/hash original documentados en ISA-1088/1090. No nueva lectura
DuckDB ni modificación de LMU en esta reproducción Go.

Rollback: revert del commit de este corte; no afecta documentos persistidos,
fuentes, revisiones ni esquema. Revisión personal de clave/coste, lifetime,
replay independiente, errores e identidad. Sin subagentes de código.

## Gates posteriores registrados durante T02

Go global `go test -p 1 ./...` PASS, sin FAIL en log; vet app/strategy/analysis/cmd
PASS. Build frontend normal y diagnóstico PASS. No frontend tests/lint nuevos:
no cambió TS/CSS; suites previas del SDD conservan su alcance histórico.
Intento Wails PID18668 de este worktree termina sin CDP: listener39261 ocupado,
hotkeys ocupadas, callback de controlador WebView fallido. Instancia1072 ajena
PID26412 permanece intacta. La causa completa de WebView no está demostrada;
esta ejecución no certifica el caso en UI ni hace necesario tocar ese otro código.
Continuación T02 independiente; repetir runtime cuando las condiciones lo permitan.
