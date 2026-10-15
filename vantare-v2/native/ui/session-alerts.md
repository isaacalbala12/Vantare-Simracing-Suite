# Avisos de sesión · ISA-1653 / VANTA-74

Widget Pro LMU del registro `widgets!`: `session-alerts`. Diseño aprobado:
Mac `~/orq/vanta-74-r4/`, ronda 4 v2. Panel 480 × 88, franja FCY amarilla
sólida, final rojo de Fuel y terminado blanco; título de Banderas,
número y mini de Delta. Los cuatro paneles usan las primitivas `Kit`.
Neo reutiliza íntegro el token compilado; Carmín/Limpio/Transparente toman
los valores de las variantes del kit CSS aprobado, sin alterar otros widgets.
Texto en Transparente con sombra; solo fundido lineal de 150 ms.

## Comportamiento

- Por defecto 5 y 1 minutos; hasta cinco umbrales de 1–60 minutos (0 quita
  un campo en el inspector). El minuto es rojo, otros umbrales amarillos.
- Un aviso dura 8 s, ajustable 4–15. Un evento más prioritario acorta el
  actual a un mínimo total de 2 s. Orden: formación/salida, último minuto,
  terminado, calendario, otros umbrales; FIFO dentro de la misma prioridad.
- Un umbral de la cola ya vencido se descarta. Reconexión o pérdida de datos
  no se interpreta como fin de sesión. Primer snapshot establece la base;
  tampoco recuperar avisos de umbrales anteriores al más próximo.
- Prácticas/qualy terminan al observar una transición real de sesión o un
  estado Finished fresco; se conserva posición de clase y mejor vuelta si
  están disponibles. Cero segundos no prueba fin (puede quedar vuelta en curso).
- La mini aparece después del aviso; hasta tres cuentas, próxima primero,
  amarillo → rojo al entrar en el último minuto. YA dura 1,5 s. Tipos y tamaño
  S/M/L configurables. La salida muestra SALIDA y metros solo con señal verificada.
- Sonido Windows activado de fábrica, volumen 70 %, un WAV de 125 ms por entrada
  (distinto por color), sin hilos; opcional pitido a cero. El widget retiene
  el búfer asíncrono hasta stop/Drop. Studio/Workshop permanecen silenciosos.
  La reproducción real de audio Windows queda para su validación física.

La mini es una instancia del MISMO Kind con `companionFor` apuntando al aviso.
El alta crea ambas en un paso de historial; la mini arranca arriba a la derecha
(y=92) y se arrastra/ancla con los controles comunes. Comparten ajustes,
opacidad, visibilidad y sesiones; posición/tamaño independientes. Duplicar o
borrar cualquiera opera sobre el conjunto. No hay otro catálogo ni renderer.
La geometría del lienzo conserva los dos recuadros en layouts v1; ningún cambio
del protocolo Core. Los lectores antiguos rechazan el Kind desconocido.

## Señales y dependencia #1638

`domain::session_alerts::project` consume las señales actuales (calidad fresca)
de sesión, reloj, posición y mejor vuelta de jugador. Solo LMU, sin runtime en UI/domain.
En esta base LMU publica `Session.state = Unavailable` explícitamente
(`runtime/src/adapter/lmu/translate.rs`, comentario de mGamePhase). Por tanto:

1. No se anuncia formación ni salida en telemetría real: faltan fase fiable,
   separación parrilla/formación/salida y distancia verificada a línea.
2. Fin de práctica/qualy depende de cambio observado de sesión mientras falte
   Finished. No deducirlo de cero, bandera verde ni interrupción.
3. El reloj mide el fin de la sesión actual; NO da el tipo ni el comienzo exacto
   de la siguiente. El texto real dice tiempo restante de sesión; no promete
   «qualy en 5 min» ni una duración de la próxima sesión no publicada.
4. `SessionInput.phase` / `distance_m` son entradas opcionales puras de enganche
   para #1638, hoy None en el proyector. Los tests sintéticos de metros NO son
   evidencia de LMU. Añadir el mapeo solo con capturas sanitizadas verificadas.

## Calendario nightly y enganche #1640

La selección disponible en nightly es `Calendar.following.reminder_ids`
(persistida en calendar-reminders.json). El Hub expande las salidas UTC marcadas
del horario vigente para los próximos 61 minutos, incluso sin servidor/juego.
Agenda vencida, pruebas del calendario y demo no publican carreras reales.

Interfaz mínima en `ipc::session_alerts`: documento local calendar-alerts.json
v1 junto al layout, `updatedAtMs` y eventos {id, label, startsAtMs}. id identifica
una salida concreta: serie:timestamp. El Hub escribe atómicamente con el helper
existente cada segundo; el host de overlays lee como máximo 64 KiB cada 500 ms.
Máximo 256 salidas; agenda sin latido de 10 s se retira. Sin cuenta ni secretos.
Cancelar la marca elimina aviso/cola/mini; no hay notificaciones de salidas pasadas.

El Hub usa el mismo motor puro para los avisos del calendario y reutiliza
`Hub::notify_system` (preferencia general de toasts Windows y No molestar).
Con un widget configurado toma sus umbrales; sin widget usa 5/1.
No requiere overlay abierto para pedir el toast; el overlay consume la agenda
mientras esté abierto. No se añade otro servicio ni transporte de telemetría.

PR #1640 estaba OPEN durante la implementación. Al integrarla, adaptar SOLO
`Calendar::alert_feed(now)` a sus recordatorios de salidas individuales/franjas;
conservar el contrato de agenda y la identidad por salida para evitar duplicados.
No se ha fusionado ni copiado la rama de calendario.

## Verificación

`ui/fixtures/session-alerts-default.scene.json` es demostración sintética.
Los tests puros cubren cola, prioridad, frescura, cambios de sesión, mini y YA;
los tests del documento cubren enlace, edición, movimiento, duplicado, borrado
y undo; los de layout fijan 480 × 88, escala mini, paneles y fade.
Los gates y fallos del entorno están en el buzón/evidencia de la entrega.

No se ha abierto ni capturado la app. Capturas de paridad y QA física pendientes
de #1655 (herramienta sin ventanas visibles). Con ella comparar con las PNG
r4 v2 a 1920×1080 / 2560×1440; validar los cuatro estilos, mini, dos recuadros,
posición bajo Delta, sonidos y toasts en Windows. Después probar LMU real.

Evidencia de la entrega (Mac): código e1dd1747; fmt/check/Clippy workspace
PASS; 17/17 pruebas de la feature, lifecycle 10/10, telemetría 25/25 y 456 huellas
PASS. Nextest completo: 989 PASS / 51 FAIL / 8 omitidos; 50 fallos por hilo
principal de GPUI macOS y uno de socket IPC que pasa al repetirlo. El gate
global no queda verde; requiere comprobar las pruebas GPUI en Windows.
Logs y diagnóstico: `~/orq/1653-evidence/`; estado/HEAD final en la issue y buzón.
