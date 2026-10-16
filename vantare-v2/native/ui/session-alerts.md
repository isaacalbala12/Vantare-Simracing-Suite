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
- El blanco de prácticas/qualy exige un finished_at_s confirmado y reciente,
  dentro de la misma identidad; se deduplica por identidad e instante. Al conectar
  tarde se establece la base sin recuperar avisos antiguos. La posición de clase
  y mejor vuelta se usan solo si son actuales. Cambiar de ID/tipo, SessionState,
  cero segundos o fin programado NO demuestra fin real.
- La mini aparece después del aviso; hasta tres cuentas, próxima primero,
  amarillo → rojo al entrar en el último minuto. YA dura 1,5 s para calendario
  e inicios anunciados; el fin programado se oculta al llegar a cero. Tipos y tamaño
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

## Contrato v11 · #1664 / #1638

El widget consume `SessionInfo`, `SessionClock`, posiciones y vueltas del mismo
Snapshot, sin runtime en UI/domain.
[Contrato neutral y evidencia](../../docs/telemetria/session-alerts-contract.md).
Recompilar junto al Core v11; los lectores guardados de v7–v10 siguen disponibles.

- `scheduled_end_s - elapsed_s`, ambos actuales, permite avisar del **fin previsto**
  de prácticas/qualy. Se pinta «FIN PREVISTO», nunca «terminada» ni «empieza la carrera».
  No se toma `remaining_s` genérico como inicio de la siguiente sesión. Si falta
  reloj, vence su frescura o se llega a cero, se oculta sin YA, pitido a cero
  ni aviso blanco. Puede seguir una vuelta después del fin programado.
- `next_kind` + `next_starts_at_s` + `elapsed_s` actuales permiten calcular
  una cuenta de la próxima sesión explícita. Sin uno de ellos no se inventa.
  Esos tres relojes pertenecen a (epoch, session.id); no se comparan con UTC.
- `finished_at_s` reciente permite blanco con resultado actual; una sesión
  consecutiva (incluida Practice1→Practice2) reinicia umbrales, sin inferir fin.
  `started_at_s` se conserva como hecho del contrato; no genera bandera verde.
- `start_phase.current()`: Formation→Formation, Countdown→Start,
  Racing→Racing; Grid/Preparing no se interpretan como formación. Sin fase actual
  se retiran los avisos de fase y sus metros.
- Solo Countdown actual permite `distance_to_start_line_m.current()`. Si es
  Estimated se conserva el significado y se muestra «≈620 m». No es distancia
  a casilla de parrilla ni a una línea de activación distinta de salida/meta.

**Estado LMU demostrado en nightly:** fin programado, distancia estimada a
salida/meta (ausente en boxes) e identidad de sesiones consecutivas.
Inicio/fin reales, fase formación/salida y próxima sesión siguen ausentes.
Por eso el contador real actual es «fin previsto»; formación/salida, blanco de
fin confirmado y próxima carrera del juego permanecen ocultos hasta tener fuente.
Las entradas positivas sintéticas prueban el consumo v11, no acreditan LMU real.

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

Evidencia histórica de la primera entrega (Mac): código e1dd1747; fmt/check/Clippy workspace
PASS; 17/17 pruebas de la feature, lifecycle 10/10, telemetría 25/25 y 456 huellas
PASS. Nextest completo: 989 PASS / 51 FAIL / 8 omitidos; 50 fallos por hilo
principal de GPUI macOS y uno de socket IPC que pasa al repetirlo. El gate
global no queda verde; requiere comprobar las pruebas GPUI en Windows.
Logs y diagnóstico: `~/orq/1653-evidence/`; estado/HEAD final en la issue y buzón.


Fase v11 (16-oct): merge de origin/nightly bcaa0e3f (#1664) en ff9bc31f.
CI Windows anterior fallaba en Sound::stop por unused_self; stop es ahora función
asociada. Gates de esta fase se ejecutan secuencialmente, con
VANTARE_CARGO_MIN_GB=0 (entorno equivalente en el Mac). Fmt/check/Clippy PASS,
23/23 pruebas de feature, lifecycle Mac 10/10 y telemetría 32/32 PASS.
Workspace Mac: 1642 PASS / 50 FAIL por hilo principal GPUI / 12 omitidos.
La CI Windows y el SHA final se verifican en PR #1660, issue #1653 y
~/orq/1653.buzon.md; no se extrapola el gate Mac a Windows.
