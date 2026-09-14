# ISA-1037 — estado visible de Calendario

C4b del plan aprobado #1027. Rama vantareapp/isa-1037-calendar-status-ui;
base nightly d6d0992f. Depende de C2 #1029, C3 #1032 y C4a #1035.
No integrar antes de esas entregas ni afirmar aceptación visual sin Wails.

El botón emite una sola petición y deja de mostrar un toast de éxito anticipado.
El hook consume started/result independientemente de loaded, conserva el documento
ante errores y retira listeners/reloj al desmontarse. La descripción existente
expone carga, actualización, error, horario vacío, futuro, caducado o desconocido.
Un resultado correcto nunca oculta la caducidad. El botón se desactiva durante
la actualización confirmada por el backend. Cuatro idiomas; sin cambios CSS.

El contrato schedule opcional y su copia en normaliseCalendar reproducen el
prerrequisito aditivo de C3, necesario al partir cada corte de la misma nightly.
Su integración debe conservar una sola definición. C3 limita las recurrencias;
este corte informa del estado y no pretende sustituir esa corrección.

Regresión RED: siete fallos por estados ausentes, doble emisión y toast prematuro.
GREEN focal: 66 tests, incluyendo límites exactos de vigencia, datos inválidos,
errores, secuencia loaded/result y retirada de listeners. Typecheck y lint PASS.
La suite completa inicial terminó 3244 PASS / 5 FAIL: un fallo de i18n por dos
textos obsoletos corregido y comprobado después, y cuatro timeouts de overlays
(Pedals dos, Standings uno, transparent-shells uno). No se declara suite verde.
Go completo falló en TestCoordinatorWithSQLiteDrainsAndReleasesAllHandles,
store_test.go:801, recording commit exceeded budget (deuda #708). Sin tocarlo.
Build y roadmap 23+21 PASS. No se han medido CPU/GPU/RAM ni tiempos Wails aquí.

Review 618d5a51: dos P2 reproducidos RED y corregidos: operación y vigencia se
muestran juntas, y el hook solicita el estado actual del backend tras suscribirse
para recuperar resultados de arranque anteriores al montaje. Este último depende
del añadido a C4a #1035, sin segunda consulta remota. Regresiones focales finales:
70 PASS. Review 7a84c268 ACCEPT; build (incluye typecheck) y lint finales PASS.
No se repiten las suites completas solo para intentar cambiar sus fallos ajenos.

Archivos: calendar-store/types, use-calendar-starts, OrbitShell, RacesOrbitPage,
sus pruebas y cuatro catálogos; informe, handoff y roadmap manual/generado.
Verificación manual pendiente en build conjunta: abrir Calendario, refrescar con
red y sin ella, comprobar respuesta visible sin perder vista/selección, comprobar
horarios caducados y ausencia de confirmación prematura al recibir calendar:get.
Sin cambios HUD/Studio, datos reales, dependencias, merge o release.
