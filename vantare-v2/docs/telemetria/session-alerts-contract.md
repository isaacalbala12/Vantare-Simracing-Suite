# Telemetría para Avisos de sesión — #1638 → #1653

Continuación 15-oct-2026, VANTA-33. No modifica la rama del widget ni su agenda.

**Estado 16-oct:** evaluación offline de Imola completada (287.495 fotos, cero rechazos); jugador
parado, IA en movimiento. No incluye inicio/fin reales, qualy, carrera,
formación, salida ni próxima sesión. El supervisor 16280 está cancelado por
STOP; el procedimiento live de abajo es histórico y no debe reactivarse en
el servidor. [Informe y límites vigentes](imola-practica-2026-10-16.md).

El grupo `Signal::SessionInfo` entrega `Snapshot.state.session.timing` en DTO
v11, tanto en foto completa como selectiva. El consumidor debe recompilarse con
Core. La versión de Services y de derechos no cambia.

| Campo neutral | Unidad y significado | Productor LMU en esta entrega |
| --- | --- | --- |
| `started_at_s` | Instante de inicio real, reloj de sesión | Ausente: falta evidencia de transición |
| `finished_at_s` | Instante de fin real, reloj de sesión | Ausente: falta evidencia de transición |
| `scheduled_end_s` | Fin programado en ese mismo reloj | SHM mEndET válido y positivo; no es final real |
| `start_phase` | Grid / Formation / Countdown / Racing | Ausente: fases 1.4 no admitidas por evidencia |
| `distance_to_start_line_m` | Metros longitudinales hasta la próxima línea de salida/meta | Estimados desde distancia de vuelta y longitud; ausentes en boxes |
| `next_kind` | Tipo explícito de la próxima sesión | Ausente: las respuestas guardadas no lo anuncian |
| `next_starts_at_s` | Inicio anunciado en el reloj de la sesión actual | Ausente: no hay agenda fiable en las capturas |

Cada campo usa `Quality`; el silencio los degrada a `Stale`. No consumir
`last_known()` para emitir un aviso nuevo. No se transforma ausencia en cero,
el fin programado en fin real ni el final de prácticas en la salida de carrera.
Los instantes pertenecen a `(epoch, session.id)`: nunca restarlos entre sesiones
ni compararlos directamente con UTC. No se fija inicio real a cero cuando el
usuario se conecta tarde. Si la fuente no permite recuperar ese instante, queda
ausente. `next_kind` y `next_starts_at_s` deben estar actuales juntos para crear
una cuenta atrás de la sesión siguiente.

La distancia no es la distancia a una casilla de parrilla, ni la línea de
activación de una salida lanzada que el servidor pueda configurar en otro lugar.
Se acepta distancia nativa entre −longitud y +longitud: antes de la línea se usa
su opuesto; después se resta de la longitud. No se dibuja una distancia en boxes
usando la coordenada de la vuelta principal. La salida de boxes y la fase de
formación requieren su validación física propia.

## Conectar en #1653 (trabajo del dueño del widget)

El draft #1660 ya pide `SessionInfo`: recibe todos estos campos sin añadir
pedales ni otro lector. En `domain::session_alerts::project`:

- Mantener la identidad `(snapshot.epoch, session.id)` y exigir origen LMU y
  calidad actual. El número nativo distingue también Practice1 de Practice2.
- Conectar `start_phase.current()` a la fase del widget: Formation → Formation,
  Countdown → Start, Racing → Racing; Grid no afirma formación ni salida.
  Racing no debe generar un aviso de bandera verde.
- Conectar `distance_to_start_line_m.current()` a `SessionInput.distance_m`
  solamente en una fase de salida validada; no mostrarlo como distancia a la
  casilla de parrilla. Admitir `Estimated` y conservar su significado.
- Extender `SessionInput` con los instantes reales y la próxima sesión. El
  borrador actual no los tiene. No reutilizar `remaining_s` de prácticas como
  cuenta atrás de carrera: solo `next_kind == Race` y `next_starts_at_s` actuales,
  con `elapsed_s` actual, permiten calcular los segundos restantes.
- Deduplicar inicio/fin por identidad e instante confirmado, con reloj inyectado
  y sin recuperar avisos antiguos al reconectar. El calendario sigue su contrato
  UTC separado; no se mezcla su reloj con el del simulador.

La conexión positiva de fase/inicio/fin/próxima sesión sigue bloqueada por
evidencia, no por la serialización. Un test con una fase escrita a mano prueba
el contrato y no acredita que LMU la entregue.

## Fase B: pasos para Isaac

**Sustituido el 16-oct:** LMU no se abrirá en el servidor por RAM. El supervisor
16280 terminó `cancelled` mediante STOP. Usar el [kit autónomo y arnés offline](grabacion-completa-lmu.md)
en el PC de juego; los comandos live de abajo se conservan como referencia,
no como instrucciones vigentes. Falta recibir práctica/qualy/carrera completa.

No se lanza LMU desde el worker. Cargar una práctica local con jugador en boxes,
un Hypercar si se quiere comprobar energía virtual (un GT3 también sirve para
el transporte). Una sesión parada/garaje basta para el smoke de las 18
proyecciones, sin abrir ventanas de Vantare ni capturar la app.

Desde `C:\VantareServer\wt\isa-1638\vantare-v2`, tras compilar Core en el
target propio:

La compilación previa, también por la cola y sin iniciar LMU, es:

```powershell
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --manifest-path native/Cargo.toml -p vantare-runtime --bin vantare-core --features vantare-services/network --target-dir C:\VantareServer\targets\isa-1638 --locked --offline -j 4
```

Con LMU ya cargado por Isaac:

```powershell
python -I native/scripts/verify-lmu-widget-coverage.py --target-dir C:\VantareServer\targets\isa-1638
```

El comando abre solo un Core QA sin ventana, con datos y pipe aislados, prueba
las demandas de los 18 widgets y cierra su Core por EOF. No controla el juego.
Rechaza Replay y sesión no usable. No acredita todas las señales opcionales ni
el dibujo de los nuevos diseños; tampoco certifica formación desde boxes.

Para las señales pendientes hace falta después una sesión práctica → qualy →
carrera y una carrera con vuelta de formación/salida habilitada. Isaac debe
entrar al coche, completar la formación y cruzar salida/meta; para validar la
distancia debe salir de boxes. Hacen falta observaciones antes/después de cada
transición y cuerpos REST/bytes sanitizados con sus relojes. El smoke anterior
no graba esas transiciones: cuando Isaac indique que está listo, se prepara y
ejecuta esa adquisición de telemetría, sin capturas de la app. No es necesario
conducir para el primer smoke; sí para estas comprobaciones positivas.

## Preparación automática en el servidor — 15-oct-2026

LMU instalado en `D:/SteamLibrary/steamapps/common/Le Mans Ultimate`.
No se inicia desde el worker. Core QA compilado en 19,70 s y test UI en
3 min 13 s, por la cola con `VANTARE_CARGO_MIN_GB=0`, jobs 2, target
`C:/VantareServer/targets/isa-1638`. El ejecutable precompilado es
`debug/deps/vantare_ui-2ea21ed7218a718b.exe`. `--list --exact` confirma un único
test físico. Pasan las dos pruebas de proyecciones sin juego (escenas default
y capturas LMU/ACC); son evidencia offline, no una prueba física.

`native/scripts/wait-lmu-widget-coverage.py` está esperando oculto, PID **16280**.
Descriptor local: `C:/tmp/1638-phase-b-active.json`. Directorio de esta espera:
`C:/VantareServer/logs/1638-phase-b-20261015-204225`.

- Solo abre `LMU_Data` existente mediante OpenFileMapping/FILE_MAP_READ; nunca
  crea SHM ni escribe al simulador. Exige un único `Le Mans Ultimate.exe`, dos
  copias SHM iguales, 1–104 coches y un solo jugador, en dos sondeos a 5 s.
  La build y la sesión reales siguen sujetas a admisión por el Core productivo.
- Respeta `pc-medicion.lock`; la reserva propia antigua #1638 del 14-oct
  (rest-discard-01-a1-01, PID 13928 ausente) se archivó reversiblemente como
  `C:/tmp/buzon/pc-medicion.1638-expired-20261015-204225.json`. Otras reservas
  no se modifican.
- Al estar listo ejecuta `verify-lmu-widget-coverage.py --target-dir ...
  --test-bin ...`, sin compilar en ese momento. Core y test no abren ventanas;
  Core usa un pipe/datos aislados y termina por EOF, también ante fallo.
- `waiter.log` registra cambios de estado, `verification.log` recoge la prueba
  y `summary.json` se actualiza de forma atómica. Guarda hashes de ambos
  binarios y rechaza cambios mientras espera. Un filtro con cero tests nunca
  pasa: exige un test correcto, **el catálogo fuente completo y todas sus variantes
  live de inspector**. El supervisor deriva nombres desde el bloque `widgets!`
  que genera `Kind::ALL` y la multiplicidad desde `LIVE_EXTRA_SETTINGS` de
  `ui/src/demand.rs`; no fija cantidades en Python. Contrasta el multiconjunto
  completo de líneas, no solo su número. Con el catálogo actual son 19 widgets
  y 23 comprobaciones; incorporar otro widget actualiza la expectativa desde
  el fuente. El evaluador offline también contrasta el catálogo exportado por
  el binario con ese registro fuente: un binario anterior autoconsistente falla.
- Solo se hace un intento tras confirmar la sesión. Éxito/fallo queda en el
  resumen y en `C:/tmp/buzon/telemetria-1638.md`. No se graban snapshots,
  nombres ni cuerpos REST. La prueba no acredita formación/salida ni fuentes
  opcionales ausentes; después se coordina esa carrera con Isaac.
- Un segundo supervisor con el mismo log-dir se rechaza por lock. Para otra
  ejecución usar un log-dir nuevo, sin sobrescribir una verificación anterior.

Para cancelar **durante la espera**, crear el archivo
`C:/VantareServer/logs/1638-phase-b-20261015-204225/STOP`. La verificación ya
iniciada tiene plazos acotados (test 180 s, supervisor 240 s).
Las cuatro pruebas Python de guardas/cancelación pasan; además se ha comprobado
el rechazo real de un supervisor duplicado mientras el principal sigue vivo.

Logs de preparación: `C:/VantareServer/logs/1638-phase-b-{core-build,ui-build,
default-projections,recorded-projections}.log`. No hay QA física positiva hasta
que el resumen diga `passed`; estar `waiting` no es una validación LMU.
