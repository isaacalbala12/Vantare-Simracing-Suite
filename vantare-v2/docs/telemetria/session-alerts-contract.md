# Telemetría para Avisos de sesión — #1638 → #1653

Continuación 15-oct-2026, VANTA-33. No modifica la rama del widget ni su agenda.
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

No se lanza LMU desde el worker. Cargar una práctica local con jugador en boxes,
un Hypercar si se quiere comprobar energía virtual (un GT3 también sirve para
el transporte). Una sesión parada/garaje basta para el smoke de las 18
proyecciones, sin abrir ventanas de Vantare ni capturar la app.

Desde `C:\VantareServer\wt\isa-1638\vantare-v2`, tras compilar Core en el
target propio:

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
