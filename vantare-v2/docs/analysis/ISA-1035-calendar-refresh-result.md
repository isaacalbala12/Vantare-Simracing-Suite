# ISA-1035 — resultado explícito de refresh

C4a del plan aprobado #1027. Base nightly d6d0992f; rama
vantareapp/isa-1035-calendar-refresh-result. Depende de C2 #1029 para conservación
del documento y precede a C4b, que mostrará estos estados en la interfaz.

La lógica de confirmación se extrae del cierre de main al puente Calendar existente.
Regresión RED: éxito solo emitía loaded, fallo no emitía nada. GREEN: started se
emite antes de la operación; éxito entrega loaded/result ok; error entrega result
false sin loaded ni detalles privados. Usa el mismo camino para inicio y petición
manual. Mutex serializa refreshes; la petición HTTP recibe contexto de cierre.
No se introduce un servicio, transporte o interfaz adicional.

Pruebas focales del puente PASS. Gates completos y review independiente en curso.
Wails visual real y avisos visibles aún no ejecutados; no se declara ahorro.

Contrato aditivo: calendar:refresh:started lleva objeto vacío; calendar:refresh:result
lleva únicamente ok:boolean. calendar:get/loaded conservan su significado. La UI
no debe interpretar cualquier loaded como final de una actualización solicitada.

Archivos funcionales: cmd/vantare/main.go e internal/app/calendar_bridge.go;
tests en calendar_bridge_test.go; informe, handoff y roadmap manual/generado.
Verificar con go test ./internal/app -run 'TestCalendarRefresh|TestHandleCalendar'.
Rollback por revert; aplicar UI y backend juntos en una build aislada antes de
aceptar el recorrido Wails. Sin cambios HUD/Studio, datos reales ni secretos.
Commit/PR/CI finales en #1035. Sin merge ni release.
