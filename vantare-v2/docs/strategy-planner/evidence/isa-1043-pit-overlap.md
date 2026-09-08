# ISA-1043 — boxes entre fronteras de vuelta

2026-09-08. Rama `vantareapp/isa-1043-pit-lap-overlap`, base `1ac45d69`,
worktree `C:/tmp/vantare-isa1043`. Ejecución y revisión personales.

El etiquetado conserva la lectura de estado al terminar la vuelta y añade
las transiciones observadas dentro de ella. Se reutilizan firstBoolean y
lapIndexAt: los eventos inválidos se ignoran y el evento en la frontera final
pertenece a la vuelta que acaba. Los eventos anteriores al inicio explícito
de una vuelta no se adjudican a ella. Las salidas conservan OutLap.

RED: boxes [80,100] s dentro de vuelta [60,120] s no producía Pit. GREEN:
la vuelta lleva Pit y no se usa para ritmo combinado. FamilyPit y
FamilyObservedStrategy siguen conservando la evidencia. Se cubren fronteras,
spans de tres vueltas, eventos fuera del intervalo y eventos inválidos.
No cambia MAD, tráfico, tolerancias, señales de invalidación o criterios
empíricos. No se equipara una vuelta invalidada con un incidente.

`go test ./internal/telemetryanalysis -count=1`: PASS, incluidas las fixtures
existentes sin ajustar sus expectativas. Build y `go test ./...` PASS
(log local `C:/tmp/vantare-isa1043-go-final.log`); diff y digest/check PASS.
No se repite la suite frontend: este corte no modifica TypeScript ni UI.

Revisión: un único caller productivo en AnalyzeLapValidity; funciones
compartidas de lectura booleana y localización temporal reutilizadas. El
paso añadido cuesta O(eventos × log vueltas), sin nuevo I/O ni dependencia.
El resto de etiquetas y reglas por familia permanece en sus autoridades.

No demuestra frecuencia real del defecto, alineación empírica de todos los
relojes ni calibración de #1030. Verificación manual posterior: sesión de
prueba con una visita a boxes completa dentro de una vuelta; inspeccionar
Pit y exclusión de ritmo, manteniendo la observación de boxes.

Sin cambios frontend productivos, Wails/LMU, originales DuckDB, push, PR,
CI remota, merge, promoción o release.
