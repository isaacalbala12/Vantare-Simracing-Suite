# ISA-1086 — productor autorizado de varias revisiones

Base 40e9527355ebee0e3d619efe69d24634f9e4a51a; rama
vantareapp/isa-1086-authorized-revision-producer; C:/tmp/vantare-isa1086.

Tres Go: telemetry_analysis_correction_commands.go modificado para compartir
la derivación escalar autorizada; strategy_revision_catalog.go y su test nuevos
en internal/app. Contrato, ambos handoffs y roadmap manual/generado actualizados.

Adapter mantiene catálogo observado. Resuelve sesiones abiertas propias por
identidad estable; revalida base/revisión/snapshot bajo autorización y locks
existentes, aplica clasificación derivada y agrega mediante el productor Analysis.
No es servicio Wails ni autoautoriza/reabre fuentes. Máximo cuatro fuentes,
rechazo de cierre/ambigüedad; cero resultados parciales al fallar una fuente.

RED por constructor ausente; GREEN inicial del productor y comandos escalares.
Prueba ampliada: dos fuentes, cabeza posterior sin sustituir pin anterior,
referencias incorrectas, combinación ajena, cancelación, licencia y cierre.
Fixtures controladas de parser/contrato, no DuckDB real ni evidencia física.
Build frontend PASS con aviso heredado de chunks. App/Analysis completos, vet
y Go global PASS; log C:/tmp/isa1086-go-test.log. El fallo #708 de #1084 no
aparece en esta pasada, sin modificar aquel módulo. Diff check y revisión
personal de los tres Go PASS. No TS/CSS cambiados: gate frontend #1085 418/3294.

Isaac autoriza PC/build/app de nuevo. Aún no se abre app en este corte ni LMU.
Comprobar manualmente exige conexión a Strategy/main y UI; sigue pendiente.
Sin dependencia nueva, originales reales leídos/modificados, push/PR, CI remota,
merge, promoción o release. C7 y el editor completo permanecen pendientes.
