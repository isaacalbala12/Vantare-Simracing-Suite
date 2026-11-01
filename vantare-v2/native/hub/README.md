# Hub nativo (ISA-1430)

## Iniciar con Windows â€” #1840, paso 1d

El interruptor usa SetStartup del candidate de la generaciÃ³n instalada, con raÃ­z
explÃ­cita. Comparte el enlace Startup y las opciones del instalador; deja de
escribir Run. Las instalaciones GPUI leen/persisten autostart en installer-ui.json
sin reescribir data/; las antiguas sin ese archivo conservan su preferencia General.
El comando se posee durante su ejecuciÃ³n, con plazo de 30 s, recogida al cancelar
y espera asÃ­ncrona para mantener la UI disponible. Si guardar una preferencia
antigua falla, se intenta restaurar el estado anterior y se muestra el error.
Sin contexto instalado, el interruptor solicita instalar mediante Setup.

## Arranque instalado â€” #1840, paso 1c

Arranque instalado (#1840, paso 1c): una vez creada la ventana, el Hub publica
hub-ready antes de crear Register. Register tiene 30 segundos y el resultado se
guarda en registration-status.json: Ajustes lo muestra aparte del actualizador.
No cierra el Hub ni dispara rollback. El proceso se posee, cancela y recoge al
vencer o cerrar. No lee ni modifica update-status.json; Stage y las notificaciones
de actualizaciÃ³n conservan su propio mensaje y estado. Un fallo al guardar el
resultado se registra en stderr sin invalidar readiness. El riesgo aceptado de
esta seÃ±al temprana y el bootstrap congelado 975 constan en packaging/README.md.

## Contrato vigente de acceso y cuenta

El Hub consume services v19, control v7 y fotos v11, actualizados como conjunto.
[ADR 0102](../../docs/adr/0102-modelo-acceso-nativo.md) y
[contrato IPC](../ipc/README.md#contrato-vigente-de-acceso) fijan versiones/permisos;
la evidencia histÃ³rica queda en Git/handoff. No se admite mezcla de generaciones.

Solo el Feed autenticado fresco del nÃºcleo concede catÃ¡logo, mÃ³dulos y navegaciÃ³n.
Policy.state, Session y TTL se comprueban; Policy.error y mensajes no conceden.
Una polÃ­tica ausente, denegada o caducada no permite entrar. ClockBehind muestra
la frontera pendiente en hora local al comprobar manualmente. Comprar se confirma
solo por Feed; el Hub no renueva durante la espera. El scheduler y la ventana de
compra pertenecen al [supervisor](../runtime/README.md#contrato-vigente-de-licencias-y-supervisor).

Services publica SignedIn, SignedOut, NeedsSignIn o Pending. NeedsSignIn conserva
las pÃ¡ginas que permita el nÃºcleo, ofrece entrar desde Cuenta y exige SignedIn
para servicios remotos. Error de perfil o bearer vencido no revoca por sÃ­ solo.
Logout bloquea antes del ACK; si falla, Reintentar repite Logout y Volver exige
Session conocida y nueva Policy fresca con acceso. Un callback tardÃ­o no deshace
Logout. AccountCancel abandona el intento, conserva cuenta/derechos y bloquea
proveedores y otros Cancel hasta responder. Choose admite Escape/Volver sin IPC.

LicenseStatus consulta cada 5s Session/aviso del supervisor sin arrancar helper;
null no implica cierre de sesiÃ³n. No altera formularios ni errores del usuario.
Inicio y Cuenta separan el aviso automÃ¡tico del resultado manual. Un definitivo o
DeviceLimit sigue visible hasta Verified, cierre o login confirmados; respuesta
perdida/lectura no lo consume, Transient no lo retira. NeedsSignIn sigue consultando.
Reinicio del supervisor pierde el aviso remoto; Policy conserva su diagnÃ³stico.
RenovaciÃ³n fallida relee AccountPoll para observar Session, sin otro grant HTTP.
Probe reconecta manteniendo imagen, versiÃ³n, nonce y secuencia; no se repite una
acciÃ³n cuya respuesta se perdiÃ³. ACK perdido es transitorio y respeta el suelo.

El acceso ofrece cÃ³digo/contraseÃ±a, alta y recuperaciÃ³n mediante FAPI en Orbit,
sin guardar inputs. La contraseÃ±a no permite copiar ni se expone en accesibilidad.
Tras verificar se pide aprobaciÃ³n explÃ­cita de identidad/perfil; Clerk impone
intervalos y una ventana de autorizaciÃ³n de 30s. Google/Discord usan PKCE alojado.
Si no abre el navegador, Copiar enlace es un gesto IPC explÃ­cito; URL redactada
en Debug, sin logs/archivos, tokens ni verifier. Cancelar/reintentar/caducar retira
la copia. [Flujo y lÃ­mites](../../docs/auth/login-propio.md).

parity-capture con VANTARE_CAPTURE_EMAIL=code|expired|password|queue|waiting|consent|pending
pinta componentes reales con datos ficticios y bloquea comandos remotos; no
acredita autenticaciÃ³n Clerk. Gates, capturas y limitaciones por plataforma se
registran en el handoff, no como contratos por fecha en este README.


## #1628 Â· Primer arranque

El asistente GPUI guarda el kit en el layout y las decisiones de uso/fallos en
privacy.json. Fallos llega encendido con el aviso de datos y cÃ³mo apagarlo;
Â«SaltarÂ» siempre pasa por ese aviso. Marketing es un permiso separado, apagado
para cuentas sin decisiÃ³n: servicios usa OAuth actual â†’ `native-mail-consent`;
solo su ACK cambia el interruptor y permite continuar como guardado. En error
hay reintento explÃ­cito o entrada sin guardar. Ajustes â€º Privacidad consulta el
permiso remoto al abrir y permite cambiarlo con `source:settings`. No se guarda
marketing en disco ni se infiere del permiso de uso. UI espaÃ±ola: `locale:es`.
Servicios v14 exige recompilar Hub y supervisor juntos.
AutomÃ¡tico es la opciÃ³n inicial/recomendada: resuelve Equilibrado, o Ahorro si
el PC tiene â‰¤4 nÃºcleos fÃ­sicos o menos de 8 GiB de RAM. La lectura local de
CPU (registro/topologÃ­a Windows), RAM (GlobalMemoryStatusEx) y GPU (primer
adaptador DXGI de hardware) ocurre una vez al abrir el asistente; no se envÃ­a.
Un dato no disponible se muestra como tal y no se inventa. No hay mediciÃ³n en
carrera ni ajuste continuo: se guarda la cadencia resuelta y la elecciÃ³n
AutomÃ¡tico en general.json. Los cinco niveles manuales siguen disponibles.

LMU usa el discovery del Launcher. ACC solo se marca para el onboarding a
partir del manifest instalado en las bibliotecas Steam; no entra en el Launcher.
Email abre el formulario nativo de #1635 dentro del asistente; Google y Discord
conservan AccountBegin en navegador. Pro sin sesiÃ³n abre el mismo formulario
de email antes de comprar. Pro conserva
la compra existente; Pro Plus y Launch Edition abren https://vantare.app/#precios
sin crear un checkout ni requerir sesiÃ³n. Los cuatro widgets Gratis se
forman el kit inicial de carreras online: Standings, Relative, Delta y Pedals.
Los otros estilos identifican sus widgets Pro, sin modificar derechos comerciales.

Privacidad: al reabrir se leen las decisiones de `settings.privacy`/privacy.json.
Solo si fallos sigue sin decidir, el asistente propone activarlo con aviso
(decisiÃ³n de Isaac del 15-oct, reiterada en la review del 17-oct). Uso siempre
parte apagado si no hay decisiÃ³n. Terminar confirma lo mostrado; el resumen
incluye uso, fallos y el permiso de correos confirmado por el servidor.
Marketing es opcional: Terminar no espera su ACK ni reintenta un rechazo. Sin
confirmaciÃ³n muestra Â«Sin confirmarÂ» y explica cÃ³mo reintentarlo en Ajustes â€º
Privacidad. Un ACK posterior actualiza el resumen; nunca se inventa un permiso.
La pregunta independiente de Ajustes es una recuperaciÃ³n para instalaciones
sin decisiÃ³n y sin asistente: conserva Â«Aceptar / No, graciasÂ», sin activar
fallos antes de esa respuesta. Una decisiÃ³n guardada prevalece en ambas rutas.
Los errores remotos de marketing no habilitan Â«Entrar sin guardarÂ»: esa salida
solo corresponde a un error local de privacidad, revoca tambiÃ©n el grabador
en memoria y no intenta escribir otra vez el archivo que fallÃ³. La suspensiÃ³n
solo dura ese proceso: al reiniciar se vuelve a leer privacy.json y un permiso
anterior puede reactivar el grabador. No se presenta como decisiÃ³n persistida;
para cambiarla de forma duradera hay que guardar en Ajustes cuando sea posible.

Teclado: GPUI activa el control al soltar Enter/Espacio y ese control consume
el evento. Un Enter sin consumir avanza, tambiÃ©n si el foco estÃ¡ en un control
pasivo. El formulario de email conserva Enter para sus propias acciones.
Los tests usan gpui_platform::headless y TestPlatform con foco/eventos reales,
sin renderer, ventanas del sistema ni capturas; `test-support` solo se habilita
en la dependencia de desarrollo de la revisiÃ³n GPUI ya fijada. Su aprobaciÃ³n
queda pendiente de Isaac: introduce 11 transitivas de test, incluido el fork
git de proptest fijado por GPUI. HeadlessAppContext/TestPlatform estÃ¡ bajo
test-support; el headless normal de Windows carece de DirectX y de drop helper
y no permite crear una ventana para dibujar/recorrer foco y enviar eventos.
La prueba alternativa y el resultado se registran en #1637; no se reemplazan
los eventos de teclado por llamadas directas al controlador.

R3: el botÃ³n de correos de Ajustes reintenta `mail.desired` mientras no haya
ACK, aunque el Ãºltimo permiso confirmado fuera otro. Solo sin intenciÃ³n pendiente
alterna el ACK; el texto muestra Â«Reintentar guardar el permiso de correosÂ».
Los iconos del resumen reciben confirmaciÃ³n/activaciÃ³n explÃ­cita, nunca infieren
un estado del texto: planes sin confirmar o bloqueados y permisos apagados son
neutros. VerificaciÃ³n de producciÃ³n: `cargo tree -p vantare-hub --target
x86_64-pc-windows-msvc --offline --locked -e normal,build,features` no incluye
`gpui/test-support` ni proptest; al aÃ±adir `dev` sÃ­ aparecen. Es evidencia del
grafo de compilaciÃ³n, no una inspecciÃ³n de un binario release. La dependencia
permanece pendiente de aprobaciÃ³n de Isaac en VANTA-120: no fusionar antes.

## #1564 Â· Widgets por sesiÃ³n

Standings â†’ Contenido abre PrÃ¡ctica / Qualy / Carrera, con columnas y formatos
de nombre/tiempo independientes; Restablecer preset afecta solo a la pestaÃ±a
activa. Filas, Look, filtro y gaps de clase, pie y ventana del jugador son comunes.
Formato de tabla tambiÃ©n modifica solo las columnas de la pestaÃ±a activa.
Cambiar pestaÃ±a reconstruye sus controles y el ejemplo de diseÃ±o usa esa sesiÃ³n;
las fotos reales y En vivo conservan la sesiÃ³n de su fuente. La pestaÃ±a es estado
de autorÃ­a, no un cambio del layout ni de posiciÃ³n/ancla.

En pista reÃºne Mostrar en prÃ¡ctica/qualy/carrera con Fuera de pista de #1562
para todos los widgets. Ambas reglas se guardan mediante Editor, con
Deshacer/Rehacer, y se combinan en overlays live. La preview siempre se ve.
El mÃ³dulo nuevo `studio/sessions.rs` conserva el renderer compartido;
la particiÃ³n #1561 PR-4 conserva Studio y Prepared en `studio.rs`.
QuÃ© vive en cada archivo de Studio y dÃ³nde tocar: [`src/studio/README.md`](src/studio/README.md).

## #1569 Â· AÃ±adir widget

Sin selecciÃ³n, el carril del inspector es el catÃ¡logo (`studio/add_widget.rs`);
el lienzo conserva su ancho. Buscador por nombre o uso, categorÃ­as con recuento,
sugeridos que faltan y el plan permite, grupo Pro con candado y Â«Ver planesÂ»
(Cuenta: Licencias estÃ¡ oculta en la beta). Sin acceso verificado no se vende Pro.
Miniatura e icono son SVG propios (`assets/widgets/`, sin texto); el tamaÃ±o sale
del renderer productivo con su ejemplo. Deuda: el SVG no sigue al renderer ni al
Look; si un widget cambia de forma, rehacer su miniatura (revisiÃ³n visual).
Clic o Intro: primer hueco libre (tambiÃ©n respecto a ocultos); arrastrar: silueta a tamaÃ±o real e imÃ¡n de 7 px
a centro, mÃ¡rgenes y otros widgets. Un Ãºnico paso de historial (`Editor::add_at`):
el nuevo queda seleccionado y el aviso ofrece Deshacer/Ctrl Z. Â«+ AÃ±adirÂ» del
inspector, el botÃ³n de la tira, Esc desde el lienzo y clic en lienzo vacÃ­o vuelven al catÃ¡logo;
`/` busca desde el lienzo. Escenas QA: `studio-sin-seleccion`, `studio-vacio`,
`studio-catalogo-busqueda`, `studio-catalogo-sin-resultados`, `studio-anadido`.

Captura aislada con el harness existente, mutex y pantalla-ocupada:
`--capture studio-base --demo --size 1440x900 --out <PNG>`. Solo en
`parity-capture`, `VANTARE_CAPTURE_SESSION=practice|qualifying|race` selecciona
la pestaÃ±a y presets D7; `VANTARE_CAPTURE_INSPECTOR=behavior` enfoca En pista.
Estas escenas son QA declarada, no telemetrÃ­a ni interacciÃ³n fÃ­sica en juego.

Proceso GPUI independiente, misma revisiÃ³n y kit Eficiencia que `vantare-ui`.
No usa Wails ni importa el runtime. Consume DTO/IPC del supervisor para cuenta,
licencias, roadmap y reportes; el supervisor posee la red y las credenciales.

```powershell
cd native
cargo run --offline -j 2 -p vantare-hub
```

Todas las secciones del producto distribuido estÃ¡n en la navegaciÃ³n. La presencia
de una secciÃ³n no acredita acceso, conexiÃ³n remota ni paridad funcional completa.

El botÃ³n Cerrar Hub, el cierre de ventana y el flanco no-Liveâ†’Live solicitan
el mismo cierre protegido. Primero deben resolverse las decisiones del Launcher
y guardarse los documentos: un formulario Strategy sin confirmar, un conflicto
o un error de escritura mantiene el Hub abierto y muestra el error. La preservaciÃ³n
de datos tiene prioridad incluso si el juego ya estÃ¡ activo; tras resolverlo,
se puede cerrar manualmente. El Hub no es hijo del launcher. Live exige origen `SourceKind::Live` **y**
`state.source_state == SourceState::Live` (DTO v9). Waiting, Stale, Lost y
Replay no cierran; primera foto Live establece referencia y tampoco cierra.
El cierre cancela el Subscriber, sin parar nÃºcleo, overlays ni Engineer.
La escena del Workshop no participa en esta decisiÃ³n. La entrada fÃ­sica
al juego y la clasificaciÃ³n real de su estado siguen pendientes de QA.
`--control-stdin` y EOF son exclusivamente el ciclo de desarrollo (100 ms).

La paridad y los bloqueos estÃ¡n en el
[microplan](../../docs/superpowers/plans/2026-09-30-fase-5-hub-studio-workshop.md).

## Desarrollo en Linux y macOS (#1437)

Los gates de desarrollo se ejecutan desde `native/`: `cargo fmt --check`,
`cargo check --workspace --all-targets -j 4`,
`cargo clippy --workspace --all-targets -j 4 -- -D warnings`,
`cargo test --workspace --no-fail-fast -j 4` y
`cargo test --workspace --test lifecycle -j 4`.
El discovery del sistema y la lectura de accesos directos `.lnk` solo estÃ¡n
disponibles en Windows; Unix conserva las fuentes explÃ­citas de prueba.
Los tests que ejecutan `cmd.exe` tambiÃ©n son exclusivos de Windows. La captura
de paridad por Win32/PowerShell no estÃ¡ disponible en Unix; estos gates no
verifican paridad visual ni el comportamiento Windows.

## Workshop local

```powershell
cargo run --offline -j 2 -p vantare-hub -- --workshop --data-dir C:/tmp/hub-local
# O recompilar/reabrir al guardar Rust/fuentes con PowerShell 7:
./hub/dev.ps1 -DataDir C:/tmp/hub-local
```

CatÃ¡logo: `Kind::ALL`, sin copia de widgets. SelecciÃ³n de escenas versionadas,
reload JSON a 150 ms (Ãºltima foto vÃ¡lida ante error), unidades/idioma del
formateador, fondo del escenario y comparaciÃ³n con una foto fijada sobre el
mismo renderer. El fondo pertenece al escenario, no al widget.

`--scene RUTA` admite un snapshot DTO JSON o un JSONL (una foto DTO por lÃ­nea,
misma Ã©poca, revisiones crecientes y tiempos de recepciÃ³n no decrecientes).
JSONL: play/pausa, step, inicio, loop y cadencia de la captura. No genera
transiciones ni seÃ±ales nuevas. Archivos hasta 16 MiB y 512 fotos. La escena
`lmu47` distribuida viene del corpus real; otras escenas son reconstrucciones
de paridad. Un archivo externo no adquiere procedencia por su nombre.

La selecciÃ³n se guarda en `workshop-selection.json` en `--data-dir` (por
defecto `<directorio de datos>/VantareNative/hub`, separado de Wails). El
directorio base es `%LOCALAPPDATA%` en Windows, `$XDG_DATA_HOME` (o
`$HOME/.local/share`) en Linux y `$HOME/Library/Application Support` en macOS.
Un error inicial de documento/escena termina con error, sin reemplazarlo por
datos ficticios.
Guardar o cerrar conserva widget/escena/foto/loop/unidades/idioma; la comparaciÃ³n
es temporal. Los locks y temporales son archivos hermanos; tras una muerte
abrupta revisar los restos antes de quitarlos. Conflictos o falta de permisos
no sobrescriben el archivo. Cierre normal rechazado si falla guardar; EOF
supervisado siempre cierra y devuelve error si no pudo guardar.

Pendiente de Workshop completo: catÃ¡logo de 22 widgets (Kind::ALL expone 18 en esta integraciÃ³n), configuraciÃ³n
de contenido en Workshop (Studio ya ofrece las opciones aplicadas), ediciÃ³n/timeline de escenas y exportaciÃ³n de capturas
desde Hub. El comparador y el binario de captura existentes de `ui` siguen
siendo el camino de paridad. Este corte no los duplica ni afirma paridad aprobada.

## Studio local

```powershell
cargo run --offline -j 2 -p vantare-hub -- --studio --data-dir C:/tmp/hub-local --layout C:/tmp/hub-local/layout.json
```

Editor del Ãºnico `vantare_ui::layout::Layout`: selecciÃ³n, aÃ±adir/eliminar/ordenar
instancias, visibilidad, opacidad 0..1 y undo/redo acotado a 50 cambios. Canvas
edita posiciÃ³n global mediante drag, anclaje 3Ã—3 y cruceta; admite negativas. Drag
mantiene preview fuera del documento y confirma una sola ediciÃ³n al soltar.
Inspector edita los `Settings` tipados. Mismo `Overlay::configured` que overlays;
no hay otra implementaciÃ³n visual ni otro formato de layout.

Al abrir una instalaciÃ³n limpia, Hub y overlays inicializan el documento mediante
la misma API: Standings, Relative, Delta y Pedals en el monitor principal. Si otro
proceso lo creÃ³ despuÃ©s de prepararlo, se relee antes de pintar o editar. Un layout
vacÃ­o guardado por el usuario se conserva; los conflictos de ediciones posteriores
siguen exigiendo recarga explÃ­cita.

Cada ediciÃ³n, undo y redo se guarda mediante `layout::Document::save` antes de
confirmarla. Usa `<directorio de datos>/Vantare/native/layout.json`, independiente
de `--data-dir`. Conflicto por bytes/error conserva documento, selecciÃ³n e historial.
Recargar layout acepta explÃ­citamente el archivo externo y descarta historial;
si es invÃ¡lido, conserva el anterior. Un archivo invÃ¡lido al arrancar falla sin
abrir ventana ni reemplazarlo. TamaÃ±o/normalizaciÃ³n/backup/escritura pertenecen
solo a la API comÃºn. Cerrar no vuelve a escribir el layout ni pisa cambios externos.

Standings estÃ¡ndar usa siempre la clase del jugador; Multiclase agrupa todas
las clases. Relative estÃ¡ndar conserva solo la clase del jugador y admite filas
delante/detrÃ¡s independientes. Se retiran sus selectores redundantes de clase
y el centrado de tabla en el jugador. El punto de la cruceta sigue centrando
espacialmente el widget en el lienzo.

Delta Vantare admite CÃ¡psula/Barra/Ampliado y referencias Mejor propia/Ã“ptima/
LÃ­der de clase. Barra y sectores se editan cuando el formato los representa.
Ãšltima vuelta y mejor absoluta de sesiÃ³n siguen pendientes: el nÃºcleo no
publica seÃ±ales independientes para ellas. Neo/Neutro y los acentos del kit
Vantare estÃ¡n disponibles en los widgets portados de #1497. Las opciones que
el renderer no aplica permanecen pendientes y se conservan al editar otra
propiedad; fuente: constructores de `ui` y `ui/layout-evidence.md`.

Para probar en un archivo aislado, usar `--layout C:/tmp/hub-local/layout.json`
en Hub y en `vantare-overlays`; sin ese argumento ambos usan el layout comÃºn.
`hub/dev.ps1 -Layout C:/tmp/hub-local/layout.json` conserva esa ruta al recompilar.
El overlay ya vigila el archivo: no se aÃ±ade comando de aplicaciÃ³n desde Hub.
Canvas de preview 1920Ã—1080, otros monitores quedan fuera de esta preview.
Tests de documento/geometrÃ­a no sustituyen arrastre fÃ­sico, DPI, vigilancia
de ventanas/OBS ni paridad.

### Studio UI r10, ronda 3 (#1496)

El lienzo 1920Ã—1080 conserva 16:9, ocupa el mÃ¡ximo espacio disponible y se
centra en el viewport medido. Zoom manual conserva el desplazamiento espacial;
Ajustar vuelve al encaje. La barra inferior muestra x/y y tamaÃ±o efectivo del
renderer. Anclar alinea los bordes o el centro del widget con una de nueve zonas:
es una acciÃ³n de posiciÃ³n, sin anclaje persistente ni seguimiento automÃ¡tico.
La cruceta mueve 1 px, MayÃºs 8 px; mantener pulsada una flecha repite con
aceleraciÃ³n. Teclado y botones confirman una sola ediciÃ³n al soltar, con
undo/redo mediante el mismo Editor. El punto centra. Un clic o ruido de puntero
por debajo del umbral de drag no cambia posiciÃ³n, archivo ni historial.
Los valores exactos salen del inspector.

El inspector usa secciones del panel derecho comÃºn; Ctrl Alt B lo recoge.
Contenido, opacidad, visibilidad, columnas y color admitido conservan sus setters
productivos. La tira permite seleccionar/ocultar y aÃ±adir el catÃ¡logo real.
Ejemplo usa muestras de diseÃ±o por widget; las tablas estÃ¡n marcadas como
ficticias y contienen 30 coches por clase para responder a filas, ventanas y
multiclase. Boxes permite seleccionar fotos reales del corpus sin inventar
seÃ±ales y comparte la misma foto entre todos los widgets. En vivo usa
exclusivamente la foto recibida. Salida/Carrera/Lluvia/Noche explican
su indisponibilidad si el corpus no demuestra esas condiciones; las muestras
no certifican una sesiÃ³n real. Durante el slider de opacidad, la preview altera
solo el marco exterior y conserva renderers/foto; al soltar se guarda una ediciÃ³n.

El documento nativo no guarda escala libre ni frecuencia por instancia. TamaÃ±o
âˆ’/+ usa las dimensiones admitidas del widget. Rendimiento, selector de otros
overlays, Publicar/Mostrar en pista y URL de OBS siguen pendientes. El indicador
Hz muestra â€” porque no existe mediciÃ³n disponible; no se inventa nivel 4 Hz ni
frecuencia efectiva. El renderer compartido es `Overlay::configured`, sin otra
implementaciÃ³n de widgets ni schema nuevo.

## Secciones locales

Calendario lee el seed oficial UTC de Go. El empaquetado caduca el 1 de
septiembre de 2026: se muestra histÃ³rico y no ofrece prÃ³ximas carreras.
Seguir/dejar de seguir guarda `calendar-following.json`. Para una agenda
explÃ­cita, dejar un catÃ¡logo UTC en `--data-dir/official-schedule.json` y
pulsar Cargar; fallo conserva la Ãºltima agenda. Se ofrecen hasta 20 salidas
de las siguientes 24 horas de series seguidas si la publicaciÃ³n es vigente.
No hay publicaciÃ³n, Discord, zonas distintas de UTC ni recordatorios.

| SecciÃ³n | ImplementaciÃ³n actual y contrato |
| --- | --- |
| Notificaciones | Errores locales, dedupe, lectura y destinos cerrados; memoria del proceso. |
| Ajustes | Preferencias locales de apariencia y Workshop; [contrato](src/settings/README.md). |
| Testing Center | Editor del servicio de reportes y diagnÃ³stico local separado; [contrato](src/testing/README.md). |
| Cuenta / licencias / roadmap | DTO/IPC al supervisor; sin red/tokens; inputs de email transitorios; `src/services`. |
| Launcher | CatÃ¡logo, perfiles, cadenas y polÃ­tica de cierre; [contrato](src/launcher/README.md). |
| Strategy | Documento y solver local, datos/revisiones y editor; `src/strategy.rs`. |
| AnÃ¡lisis | Lectura acotada y cancelable mediante el helper de storage; `src/analysis`. |
| Engineer | Report v2 con frescura, entregas observadas y ajustes para su propietario; [contrato](src/engineer/MODEL.md). |

El proceso Engineer pertenece al supervisor y sigue independiente del Hub.
Estas rutas implementadas no prueban login/envÃ­o remoto, juego, OBS o empaquetado.
El worker de servicios publica su evento de cancelaciÃ³n antes de conectar o leer
el saludo. El cierre lo seÃ±ala y espera el join en el ejecutor de fondo; no bloquea
el hilo UI durante el join. GPUI limita las futures de cierre a 200 ms; seÃ±alar
el evento y cerrar el sender despierta tambiÃ©n connect/hello y recv pendientes.
Descartar una conexiÃ³n no cancela al propietario, por
lo que una reconexiÃ³n conserva su evento hasta el cierre del Hub.
La navegaciÃ³n, el rail, la paleta y el contenido usan la misma proyecciÃ³n de las
capacidades del nÃºcleo recibidas por Cuenta. Requiere sesiÃ³n no caducada y polÃ­tica
vigente sin error; logout, cierre del servicio o error revocan la proyecciÃ³n. El
Hub consulta LicenseStatus por IPC una vez por segundo cuando el canal estÃ¡ libre;
la polÃ­tica pierde vigencia a los dos segundos aunque no llegue otra respuesta.
Los bits ausentes no acreditan Free ni Studio bÃ¡sico: ese dato no estÃ¡ en el DTO.
Las restricciones de capturas/demo permanecen aisladas de la autoridad productiva.
El microplan y los bloques fechados conservan la evidencia de los hitos anteriores.


## VerificaciÃ³n de proceso

`--pipe NOMBRE` selecciona un pipe local privado; por defecto usa el nombre
por usuario de IPC. Desde native, despuÃ©s de construir el binario:

```powershell
./hub/verify-process.ps1
```

Usa una copia y datos temporales propios mÃ¡s un pipe sin productor para
comprobar proceso vivo, guardado y salida total por EOF. No lanza nÃºcleo ni
juego ni demuestra entrada al juego, paridad, DPI/OBS o presupuesto de memoria.
La condiciÃ³n de cierre usa DTO v9 y el Studio usa la API comÃºn de layout.
El smoke usa una ruta de layout aislada y no lee el layout personal.

## Kit visual

`src/orbit.rs` reproduce los tokens y piezas de Command Orbit v0.3
(`frontend/src/styles/orbit.tokens.css`): columna de contexto, barra superior,
cabecera de pÃ¡gina, tarjetas, filas de ajuste, interruptores, botones, selects
y notas. Toda secciÃ³n nueva compone estas piezas; no define colores ni tamaÃ±os
propios. La direcciÃ³n visual la mantiene el orquestador.

## Horario publicado â€” #1488

Â«Actualizar horarioÂ» usa el worker IPC compartido para pedir a services el
horario publicado. La primera apertura del Calendario tambiÃ©n lo pide si no
hay horario vigente. La demo no consulta red ni guarda publicaciones.
`official-schedule.json`, bajo el directorio de datos, contiene la Ãºltima agenda
validada y guardada atÃ³micamente; se restaura al arrancar. Una respuesta invÃ¡lida,
un fallo de red o de escritura conserva el horario anterior. La ventana es
`[validFrom, validUntil)`; cuando no hay uno vigente, todas las vistas muestran
Â«AÃºn no hay horario publicado para esta semanaÂ» sin carreras caducadas.
No publica horarios ni activa recordatorios.

## #1562 Â· Ocultar fuera de pista

Ajustes â†’ General ofrece Ocultar fuera de pista (opt-in). Studio â†’ En pista
ofrece heredar / siempre visible / ocultar por instancia. Se guardan en el Ãºnico
layout mediante el Editor existente, con conflictos y Deshacer/Rehacer. Studio
no aplica ocultaciÃ³n a sus previews. Ver [contrato](../runtime/README.md).

RevisiÃ³n del paso 7: ClockBehind.until_ms estÃ¡ en tiempo de pared (lÃ¡pida
efectiva menos forward_millis), con aviso de fecha/hora local. El estado local
del supervisor usa el mismo aviso si omite renovar. NoCredential/RecoveryRequired/
ClockBehind frescos admiten consultas al helper; Logout sigue disponible con
canal del nÃºcleo autenticado, incluso ante denegaciÃ³n o caducidad. Sin conceder
derechos ni saltar el ACK durable; ADR0102.
