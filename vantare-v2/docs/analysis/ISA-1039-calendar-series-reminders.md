# ISA-1039 — recordatorios de series

C5 del plan #1027. Base nightly d6d0992f; rama
vantareapp/isa-1039-calendar-series-reminders. Sin modificar HUD/Studio.

DueReminders solo aceptaba eventos seguidos individualmente: seguir una serie
real devolvía cero avisos. Además truncaba minutos: 121 segundos disparaba el
umbral de dos minutos y 119/61 no lo hacían. Ambas regresiones RED reproducidas.

La corrección usa los eventos ya publicados y la identidad canónica del generador
(ID de serie + instante UTC, fuente bundled), nunca el nombre. Solo reconoce IDs
de series actuales seguidas. No expande otra recurrencia ni altera Calendar.events.
Se comparan duraciones completas con la ventana documentada (T-1,T]. El dedupe
existente conserva un aviso por evento/umbral, incluso siguiendo serie y evento.
Su mapa retenía todas las ocurrencias durante la vida del proceso: regresión RED
3 retenidas frente a 1 futura. Ahora elimina las que ya empezaron en cada tick,
sin olvidar avisos futuros. No añade persistencia de notificaciones: tras reinicio
puede volver a avisar una vez si aún está dentro del umbral vigente.

Go del módulo Calendar PASS: seed real en su fecha histórica de vigencia,
seguir/dejar de seguir, recarga desde disco, seguimiento doble, agotamiento de publicación, bordes por
segundos, ID/fuente y cambio de título. Estas pruebas controladas no son Wails ni
simulador en vivo. Build embed y roadmap 23+21 PASS. Go completo inicial PASS;
comprobación final tras limpieza de dedupe y revisión pendientes.

Archivos: calendar_service.go, official_schedule.go (constante de ID compartida),
series_reminders_test.go, reminder_loop.go y su test, informe, handoff y roadmap manual/generado.
Verificación manual pendiente: con horario vigente y permisos/preferencias
habilitados, seguir una serie y comprobar un aviso al entrar en el umbral; dejar
de seguir y comprobar que no vuelve a avisar. Confirmación de acciones y permisos
continúan en C6. No se afirma ahorro CPU/RAM/GPU ni aceptación de notificación real.
Sin dependencias nuevas, cambios de datos reales, merge o release.
