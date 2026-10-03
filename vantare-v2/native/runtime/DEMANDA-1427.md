# Primera candidata de demanda — #1427 / ADR 0099

Los ajustes de cada renderer declaran señales y periodos mínimos; `Settings`
despacha por el registro existente. El layout une solo widgets visibles. Las
columnas y los huecos del pie de Standings y Relative usan sus ajustes
normalizados. Los ajustes todavía ignorados por un renderer no eliminan datos
que ese renderer sigue usando.

`ipc::Demand` une consumidores y elige el periodo más corto. La identidad de
los coches es una dependencia explícita de sus señales. El saludo del pipe
registra la demanda; desconectar la retira. La adquisición consulta una revisión
atómica, sin construir mapas en cada tick. Solo se condicionan las derivaciones:
la adquisición, el saneado, el journal y las series conservan las entradas
nativas. Un consumidor antiguo sin demanda sigue solicitando la foto completa;
si el Hub abre ese tipo de suscriptor, mantiene activas todas las derivaciones.
El Hub no se cambia en esta entrega.

Las 28 señales son grupos neutrales: clima y tiempos de vuelta, por ejemplo,
agrupan varios campos. La identidad de coches acompaña sus señales. No hay
un protocolo de deltas por campo ni un planificador adicional en el núcleo.

DTO **7** incorpora `DemandSnapshot`, con demanda pedida y señales entregadas.
Los campos no entregados se omiten; el suscriptor conserva los anteriores solo
cuando siguen pedidos, pertenecen a la misma sesión/fuente y al mismo coche por
ID. `Photo::signal_state` distingue `NotRequested` de `Requested` con
`Quality::Unavailable`. Los renderers siguen recibiendo snapshots y ViewModels
puros. El host no proyecta una foto que no cubra el layout activo.

La cadencia limita entregas por señal, no la frecuencia de adquisición. Delta
Trace e Input Telemetry piden cada observación (periodo cero): sus historias
distinguen pérdidas reales por revisión y no deben recibir saltos fabricados
por el planificador. La
primera foto, una nueva sesión/fuente/conjunto de coches y una reconexión
hidratan todas las señales pedidas. Cambiar el layout reconecta el mismo
suscriptor y elimina su caché. Tras aceptar el saludo, el siguiente tick del
núcleo refresca la foto incluso si el replay no aporta una adquisición nueva;
esa revisión no inventa muestras del journal o las series. La detección del
layout y el saludo tienen su propia latencia: no se promete recibir datos dentro
de un único tick contado desde un clic del usuario.

La cadencia no deduplica valores iguales: una revisión nueva puede entregar
pedales constantes. Sin fotos entregables, el publicador mantiene el pipe con
`Ping` cada segundo; la UI cuenta esos mensajes como actividad sin inventar
fotos ni ampliar la demanda. Ese latido demuestra conexión, no frescura del
simulador: el núcleo conserva su límite de 500 ms y un cambio de estado de
fuente rehidrata lo pedido sin esperar la cadencia. El silencio real del pipe
sigue pasando a `Lost` a los 5 s.

Combustible y delta reinician su memoria al dejar de pedirse. Reactivarlos puede
dar `Requested + Unavailable` hasta tener observaciones suficientes; nunca se
estima consumo o delta atravesando un intervalo no observado por el derivador.

## Verificación y límites

La evidencia de esta candidata, incluidas capturas, fallos y mediciones, vive en
`C:/tmp/fase8-demanda-evidence/`. `RESULTADOS.md` contiene el método, hashes,
tabla antes/después, gates y decisiones. No se versionan logs ni capturas.

Las pruebas cubren unión de widgets/consumidores, columnas y pies, cambios de
layout, hidratación en el siguiente tick, cadencia con reloj inyectado,
retención por ID, rechazo de campos entregados omitidos y discontinuidades de
estimadores. La comprobación de proyección compara las fotos completas y las
pedidas de los 18 widgets con sus escenas.

La medición usa LMU47 grabado y el banco de fase 0, con cuatro widgets. Es una
comparación de procesos en replay, sin juego ejecutándose; no demuestra FPS del
juego, OBS, otras GPU ni otras escalas DPI. La paridad visual debe contrastarse
con la referencia anterior y conservar cualquier fallo heredado. La entrega es
local para revisión del orquestador: no autoriza promoción ni publicación.

## Resultado local (2026-10-01)

Media de dos pasadas antes y dos finales: IPC visual de 1.513.132 a 355.892
bytes/s (-76,48%); privada conjunta de 100,93 a 98,19 MiB. CPU núcleo de 2,549
a 2,675% de un núcleo (+4,95% relativo); overlays de 2,616 a 2,625%. No se
acredita ahorro de CPU ni rendimiento del juego. Se conservan las primeras
pasadas que empeoran y las repeticiones en el informe externo.

Las 18 capturas finales son idénticas a las anteriores con umbral cero. Contra
los PNG canónicos pasan 17/18, igual que antes: Fastest Lap conserva su 4,31%
de diferencia (límite 4%). No se cambia la referencia ni el umbral.

Fmt, Clippy con warnings como errores, lifecycle y builds pasan. Nextest del
workspace: 851/854 pasan, tres fallos en Strategy incluido por Hub, cuatro
omitidos. Ipc/runtime/ui: 478 pasan, sin fallos. Los fallos ajenos son la ruta
de fixtures del manifiesto y paridad Go de clima/neumáticos, repetidos; no se
modifica Hub/Strategy ni se declara el workspace verde. Opus debe resolver o
aceptar explícitamente ese bloqueo antes de integración. GitHub #1427 es el
puente técnico; Notion sigue sin acceso bajo la excepción dada para este worker.

## Ronda 2 — contrato de pausa y diagnóstico (#1455)

DTO **8** añade `SourceState::Paused`; el saludo del pipe exige v8 para no
entregar un estado desconocido a consumidores v7. La lectura de escenas
guardadas acepta v7 y las vuelve a serializar como v8; no se migran ni alteran
las capturas canónicas.

LMU confirma pausa cuando `mCurrentET` lleva 500 ms sin avance y REST responde
con una sesión compatible consultada hace menos de 500 ms. El lector SHM
verifica que el proceso de LMU sigue vivo antes y después de cada lectura.
`gamePhase` e `inRealtime` no se interpretan como flags de pausa: la evidencia
actual no demuestra esa equivalencia. Se usa el criterio autorizado de reloj
detenido con REST vivo, sin añadir endpoints, consultas ni observadores IPC.
La caché REST auxiliar mantiene su TTL de 2 s para sus otros datos; ese TTL
no autoriza mantener una pausa.

El núcleo conserva la última foto `Live` de la misma sesión y jugador, incluidas
calidades, capacidades, posiciones, gaps, tiempos y orden. Si el reloj del jugador
caduca antes que scoring, la reserva mantiene el scoring más reciente y el
último jugador válido; la foto Live publicada sigue declarando ese fallo real.
La confirmación de pausa renueva el plazo del núcleo; si cesa, vuelve a degradar
a los 500 ms. REST
caído desde el principio no cambia la caducidad SHM de 500 ms. Cerrar LMU sigue
degradando inmediatamente al detectar la desconexión. Reanudar una pausa
confirmada recupera `Live` al avanzar el reloj; un fallo real conserva la
ventana de recuperación anterior. Los datos de otra sesión no se heredan.

La pausa automática solo se confirma en vivo; REST grabado en un replay no
prueba que un proceso esté vivo. Los estimadores y las series no añaden datos
mientras están en pausa. Reanudar scoring no hace fresco un reloj del jugador
que siga parado.

El host visual común conserva la proyección de los 18 widgets mientras están
en pausa, sin nuevas muestras en sus historias. Una ventana abierta durante
pausa proyecta la foto conservada. El aviso `EN PAUSA` (`PAUSED` en inglés)
ocupa una franja de 22 px debajo del widget; no tapa las filas ni sus datos.
La cadencia y `Ping` no cambian: cada cambio de estado rehidrata solo lo pedido.
No se fuerza demanda completa ni se aumenta su tráfico habitual.

Cada transición de estado o frescura de inputs/posiciones observada en el bucle
I/O del núcleo o en la UI deja una línea en stderr y en
`%LOCALAPPDATA%/Vantare/native/logs/freshness.log`, con
reloj, umbral, época, secuencia y PID. El núcleo puro sigue sin escribir disco.
Fuera de Windows el registro usa el directorio temporal. Un fallo del registro
no cambia la fuente. El journal conserva los códigos existentes y añade el
código de fuente 4 para `Paused`.

Límite: sin un flag de pausa verificado, un plugin SHM colgado con REST todavía
sano es indistinguible de una pausa según este criterio. REST caducado, sesión
incompatible o proceso cerrado no confirman pausa. La prueba física de pausar
y reanudar debe registrarse sin manipular LMU desde el worker; grabadora y
resultados están en `C:/tmp/isa-1455-evidence/`.
