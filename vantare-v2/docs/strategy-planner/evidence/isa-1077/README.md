# ISA-1077 — derivaciones sobre correcciones escalares

Base 1980c3d4, rama vantareapp/isa-1077-corrected-derivation,
worktree C:/tmp/vantare-isa1077. Dos archivos Go nuevos: corrections_derivation.go
 y corrections_derivation_test.go.

DeriveCorrectedSession revalida identidad, parser y esquema; aplica la vista
completa y ejecuta las funciones actuales de validez, consumo/ritmo, curvas y
boxes. Devuelve base y snapshot junto a los derivados, sin publicar ni sustituir
el catálogo original. Cualquier error devuelve un resultado vacío.

Prueba con fixture registrada sanitizada lap-validity-s045-v1.json y modificación
controlada de tiempos: cambian las vueltas válidas; cambiar valores de calidad
inválida no las convierte en utilizables. La declaración de unidad en el test es
explícita porque la fixture la omite. No es evidencia de calibración física.
Comprueba originales intactos y rechazo de sesión/parser distintos.

Checks: gofmt, go test ./internal/telemetryanalysis -count=1,
go vet ./internal/telemetryanalysis, pnpm --dir frontend build y go test ./...
pasan. Build conserva aviso heredado de chunks grandes. La suite global terminó
con código 0; existe la incidencia independiente intermitente #812 de Engineer.
No se cambió Engineer. Revisión personal del código y caminos de error completada.

Pendiente: vincular revisión durable exacta a la proyección, servicio con
reautorización de fuente, operaciones de uso por familia y UI productiva.
Sin dependencias nuevas, lectura de DuckDB reales, LMU, push, PR, CI remota,
merge, promoción o release.
