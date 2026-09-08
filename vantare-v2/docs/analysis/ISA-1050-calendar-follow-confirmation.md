# ISA-1050 — confirmación de seguimiento

C6b de #1027. Base C6a e9dc8ef9, C5/C2 incluidos, nightly d6d0992f.
Rama vantareapp/isa-1050-calendar-follow-confirmation; no integrado.

La interfaz anunciaba éxito al emitir el clic. El backend añade un resultado
terminal con requestId, seriesId, followed y ok, después de guardar y emitir
calendar:loaded/error. Esos eventos compartidos se conservan. Las llamadas Go
pasan la correlación explícitamente; clientes antiguos sin requestId conservan
su operación/documento y reciben un resultado adicional que pueden ignorar.

La página registra el resultado mediante calendar-store, impide doble acción
mientras responde y solo muestra éxito para la petición propia confirmada.
Error o rechazo de transporte libera el botón sin tocar la preferencia; otra
serie, requestId o payload inválido no completa la petición. Al desmontar se
retira el listener y se ignora el resultado anterior. No cancela una escritura
ya solicitada. Free conserva el gate y su explicación. No hay timeout que
presuponga que una operación no confirmada fracasó; el bridge nuevo responde
en todas sus salidas normales. Backend y frontend deben distribuirse juntos.

RED: faltaba resultado backend y cinco pruebas UI fallaban. GREEN: bridge de
series y 94 focales frontend (incluye i18n). Build PASS. Full frontend/Go,
tipos/lint/roadmap 23+21 PASS. Full frontend: 3240 PASS, un timeout
TrackMapEndurance.layout:89 (20 s), #1025. Review halló P2 en expectativas de
tests event-only: siete fallos RED reproducidos, restauradas a una emisión;
módulo app completo PASS. Segunda review y full Go pendientes. Sin prueba Wails o medición de ahorro.
Archivos: bridge/test/result test, main payload, store, RacesOrbitPage/test,
cuatro locales, informe/handoff y roadmap manual/generado. Sin CSS/HUD/Studio,
permisos nativos, dependencias, merge ni release. C6c avisos/permisos nativos,
C9 detalle y validación conjunta siguen pendientes.

Manual: seguir/dejar de seguir, observar Guardando hasta respuesta, reiniciar y
comprobar preferencia; simular error en perfil de prueba, reintentar; comprobar
Free y cambio de serie durante la espera. Aviso guardado no prueba aviso Windows.
