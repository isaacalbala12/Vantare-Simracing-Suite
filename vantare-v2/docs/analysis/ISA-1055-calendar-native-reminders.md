# ISA-1055 — avisos nativos y permisos de Calendario

C6c de #1027; base C6b a9a17cf3 sobre C6a/C5/C2 y nightly d6d0992f.
Rama vantareapp/isa-1055-calendar-native-reminders; sin integración.

CalendarReminder reutiliza notify.Service y su único hilo nativo; comparte con
LaunchFinished las puertas Supported/SystemEnabled/Authorized/minimised. Título,
circuito y T−N min no necesitan otra capa de traducción. No pide autorización,
no añade goroutine ni sustituye notificaciones. Los textos ES/EN/PT/IT describen
avisos de inicio y Calendario. El registro dice accepted, no visible.

La autoridad nativa exige estado active/grace y un plan Calendar pagado o rol
operativo válido, usando ClassifyPlan/currentResult existentes. Free, desconocido,
revocado/cerrado y bloqueado no reciben recordatorios ni crean seguimientos.
No convierte rol en entitlement. Se comprueba al seguir y en cada aviso; dejar
de seguir sigue permitido para retirar preferencias. El resultado denegado de
series mantiene requestId y ok=false. calendar:reminder mantiene su payload para
consumidores autorizados. No se editan HUD/Studio/OBS.

La UI genérica antigua concede roles antes de evaluar estado bloqueado; el gate
nativo sigue el precedente nativo de autoridad active/grace. No se amplía ese
bypass legado ni se rediseña acceso global: una denegación devuelve error y ACK.
La comprobación Wails de cuentas/roles reales continúa pendiente.

RED contractual: faltaban métodos de permisos/aviso. GREEN: módulos license,
notify y app completos, matriz de acceso, cierre de sesión, preferencias/permiso/
ventana, errores/nil backend y rechazo previo a mutación. Un error de sintaxis
transitorio en notify activó también el guard AST; corregido y módulos PASS.
Build PASS; full Go/frontend, checks textos/roadmap y review pendientes. No hay prueba
de aviso Windows visible ni ahorro CPU/GPU/RAM. Son tests, no runtime real.

Archivos: política/test nativo, notify/test, bridge/test/permisos, main,
comentario settings, cuatro textos existentes, informe/handoff y roadmap.
Manual: cuenta permitida + serie seguida, SystemEnabled activo, ventana minimizada;
observar aviso y contrastar log accepted. Repetir desactivado/visible/Free/sin
permiso; nada debe solicitar autorización por sí solo. Usar perfil de prueba.
Sin dependencias, credenciales, merge, promoción o release.

Caso adicional de arranque: comprobar permiso solo al emitir consumía antes la
deduplicación. El bucle ahora comprueba enabled antes de calcular/marcar avisos,
manteniendo prune y cancelación; nil conserva el contrato de tests anteriores.
RED ausencia de comprobación, GREEN pendiente completo. Test por canales sin Sleep:
permiso false → true en la misma ventana conserva un único recordatorio.
Se incluyen reminder_loop.go y sus tests dentro del gate C6c; no nueva goroutine.
