## Contrato vigente de licencias — paso 9 (#1827)

El Hub usa services v19, sin TransferRights. El saludo rechaza v18 y anteriores como
Version antes de Policy y no envía acciones de revocación. El helper se admite
por lectura autenticada del núcleo; abrirlo no concede derechos. Las páginas y
widgets siguen leyendo Policy.state. ACK perdido es transitorio: el supervisor
conserva su suelo de un minuto antes de pedir otra emisión HTTP.


Services v19 añade `LicenseStatus { policy, session, notice }` local al supervisor.
El aviso tipado se conserva en memoria hasta un resultado de renovación verificado,
un cierre confirmado o una sesión nueva; perder/leer la respuesta no lo consume.
La sesión es la última observada de services, también NeedsSignIn; null significa
sin observación confirmada en ese intento, nunca SignedOut implícito. No arranca
el helper para consultarla. Hub no altera formularios/errores con esa observación
y sigue consultando avisos en NeedsSignIn. Los derechos del Hub y la compra solo se confirman
por el Feed fresco; el Hub ya no solicita renovaciones durante la espera de compra.
Solo el supervisor conserva esa ventana y su suelo/backoff. Inicio y Cuenta muestran
el aviso separado del resultado del usuario. Reiniciar el supervisor pierde su aviso
remoto en memoria; Policy sigue siendo la autoridad y conserva su diagnóstico.
V18/v19 se rechazan como Version antes del esquema, sin revocar; control v7 y fotos v11 intactos.

Contrato y rollback de datos: [ADR0102](../../docs/adr/0102-modelo-acceso-nativo.md).
Las secciones fechadas inferiores son históricas; este contrato sustituye sus
reglas de candidate/marcador y transferencia. La retirada de archivos antiguos
es un paso de arranque, sin copia ni reintento durable de credenciales. Rollback sintético con lectores
v17 y pre-NeedsSignIn, sin cambios de instalación: `native/scripts/license-generation-rollback.ps1`.

## #1827 — Acceso por Policy.state (paso 7)

Navegación, acceso y mensajes leen el estado explícito del núcleo; Policy.error
no concede ni bloquea páginas. Catálogo, módulos, Session y frescura mantienen
sus reglas. ClockBehind explica la frontera pendiente y su fecha al comprobar
manualmente. Services v17 valida la generación control v7 anidada antes del
esquema; el desajuste es transitorio, sin revocar. Recompilar el conjunto.
[Contrato](../../docs/adr/0102-modelo-acceso-nativo.md).

Services v17 versiona la Policy v7 anidada; Session/AccountCancel permanecen
intactos. V16 del paso 6 nunca se publicó en release.

## #1827 — Sesión y acceso (paso 6, services v16)

`AccountCancel` (v16) cancela solo el intento OAuth/FAPI y relee Session;
conserva la cuenta protegida y los derechos. «Volver/Cancelar» lo usa sin
sustituirlo por Logout. Solo «Cerrar sesión» envía Logout. En NeedsSignIn,
Cuenta ofrece Google/Discord/email y también el cierre explícito de sesión.


El Hub lee Session publicada por services, sin inferirla de expires_at, textos
o signed_in. En NeedsSignIn muestra el aviso de volver a entrar en Cuenta;
las páginas conservan el acceso que permita la política fresca del núcleo.
Una política ausente, denegada o caducada no concede acceso. SignedOut y una
solicitud explícita de Logout conservan el bloqueo previo al ACK.
Los servicios remotos requieren SignedIn; no se reutilizan tokens rechazados.
Los resultados de renovación fallidos releen AccountPoll, sin otro grant HTTP.
No cambia la firma, el plazo, la gracia, el catálogo ni las reglas beta.

Tras fallar el ACK de Logout, Reintentar cierre de sesión reenvía Logout. Volver
solo permite regresar con Session conocida y política fresca del núcleo que
conserve acceso; no confirma un cierre fallido. Choose admite Escape y Volver
sin iniciar un intento. AccountCancel en vuelo bloquea proveedores y nuevos
Cancel hasta su respuesta, sin sustituirlo por Logout.
La mezcla v15/v16 puede mostrar el aviso genérico de servicios desconectados
si el peer cierra el pipe sin respuesta; limitación de diagnóstico aceptada,
sin revocación ni fallback de Cancel a Logout.

## ISA-1793 — Acceso sin comprobación manual

El Hub confirma la sesión y consume la política fresca del núcleo. El supervisor
renueva desde su temporizador, sin bloquear el login ni duplicar HTTP desde la
UI. Los avisos automáticos se consultan por IPC local cada cinco segundos;
DeviceLimit conserva su salida accionable y no revoca la política firmada.
El primer uso de un canal inactivo reconecta mediante Probe, manteniendo
imagen, versión, nonce y secuencia. Una respuesta perdida no repite la acción.
Desde el paso 9, solo el supervisor comprueba la compra por el camino automático
no destructivo; el botón Comprobar acceso sigue siendo una acción explícita.

## #1631 · Formularios de email

R2 añade recuperación del formulario tras caducidad/reinicio y cola llena,
«Volver» durante red y autorización pendiente mediante AccountPoll. El servicio
conserva el mismo grant, respeta el intervalo de Clerk y cede entre consultas;
la ventana de reintento es de 30 s. El corte combinado de login y Founders usa services **v14**.
Desde #1761, el fallo al abrir navegador conserva el intento PKCE y ofrece
Copiar enlace: IPC explícito, URL redactada en Debug y portapapeles GPUI.
La URL no se añade a logs ni archivos de Vantare; solo se copia por ese gesto.
Cancelar/reintentar/caducar retiran la copia. No se entregan tokens ni verifier.
Pasos y límites de cancelación: [login propio](../../docs/auth/login-propio.md).
El modo `parity-capture`, con `VANTARE_CAPTURE_EMAIL=code|expired|password|queue|waiting|consent|pending`,
pinta los componentes reales con datos ficticios y bloquea los comandos remotos.
No demuestra autenticación contra Clerk.
Windows R2 (15/10): fmt/check/Clippy de producto PASS, Nextest de los cuatro
crates 1131/1131 PASS (ocho omisiones existentes), lifecycle 13/13 y telemetría
25/25 PASS; siete capturas GPUI revisadas. El Clippy opcional de capturas
conserva 21 avisos previos, separados en #1648. Clerk development sigue pendiente.

Evidencia previa macOS (14/10/2026):

El acceso ofrece email con código o contraseña, alta y recuperación en Orbit.
Los inputs no se guardan; la contraseña se dibuja oculta y no permite copiar.
Tras verificación hay una aprobación explícita de acceso a identidad/perfil.
Google/Discord siguen abriendo la página alojada de Clerk en el navegador.
Entonces el protocolo services era v9; ahora Hub, supervisor y servicios se actualizan juntos a v14 (marketing verificado, login propio y Founders).
Build y Clippy de Hub/services/ipc/runtime PASS; Nextest compatible 1072/1072
PASS. 49 tests GPUI quedan pendientes por AppKit/hilo principal; cuatro mediciones
se omiten por defecto. QA visual/interacción, Windows y Clerk development real
quedan al orquestador. La contraseña tampoco se expone en accesibilidad.

# Hub nativo (ISA-1430)

## #1628 · Primer arranque

El asistente GPUI guarda el kit en el layout y las decisiones de uso/fallos en
privacy.json. Fallos llega encendido con el aviso de datos y cómo apagarlo;
«Saltar» siempre pasa por ese aviso. Marketing es un permiso separado, apagado
para cuentas sin decisión: servicios usa OAuth actual → `native-mail-consent`;
solo su ACK cambia el interruptor y permite continuar como guardado. En error
hay reintento explícito o entrada sin guardar. Ajustes › Privacidad consulta el
permiso remoto al abrir y permite cambiarlo con `source:settings`. No se guarda
marketing en disco ni se infiere del permiso de uso. UI española: `locale:es`.
Servicios v14 exige recompilar Hub y supervisor juntos.
Automático es la opción inicial/recomendada: resuelve Equilibrado, o Ahorro si
el PC tiene ≤4 núcleos físicos o menos de 8 GiB de RAM. La lectura local de
CPU (registro/topología Windows), RAM (GlobalMemoryStatusEx) y GPU (primer
adaptador DXGI de hardware) ocurre una vez al abrir el asistente; no se envía.
Un dato no disponible se muestra como tal y no se inventa. No hay medición en
carrera ni ajuste continuo: se guarda la cadencia resuelta y la elección
Automático en general.json. Los cinco niveles manuales siguen disponibles.

LMU usa el discovery del Launcher. ACC solo se marca para el onboarding a
partir del manifest instalado en las bibliotecas Steam; no entra en el Launcher.
Email abre el formulario nativo de #1635 dentro del asistente; Google y Discord
conservan AccountBegin en navegador. Pro sin sesión abre el mismo formulario
de email antes de comprar. Pro conserva
la compra existente; Pro Plus y Launch Edition abren https://vantare.app/#precios
sin crear un checkout ni requerir sesión. Los cuatro widgets Gratis se
forman el kit inicial de carreras online: Standings, Relative, Delta y Pedals.
Los otros estilos identifican sus widgets Pro, sin modificar derechos comerciales.

Privacidad: al reabrir se leen las decisiones de `settings.privacy`/privacy.json.
Solo si fallos sigue sin decidir, el asistente propone activarlo con aviso
(decisión de Isaac del 15-oct, reiterada en la review del 17-oct). Uso siempre
parte apagado si no hay decisión. Terminar confirma lo mostrado; el resumen
incluye uso, fallos y el permiso de correos confirmado por el servidor.
Marketing es opcional: Terminar no espera su ACK ni reintenta un rechazo. Sin
confirmación muestra «Sin confirmar» y explica cómo reintentarlo en Ajustes ›
Privacidad. Un ACK posterior actualiza el resumen; nunca se inventa un permiso.
La pregunta independiente de Ajustes es una recuperación para instalaciones
sin decisión y sin asistente: conserva «Aceptar / No, gracias», sin activar
fallos antes de esa respuesta. Una decisión guardada prevalece en ambas rutas.
Los errores remotos de marketing no habilitan «Entrar sin guardar»: esa salida
solo corresponde a un error local de privacidad, revoca también el grabador
en memoria y no intenta escribir otra vez el archivo que falló. La suspensión
solo dura ese proceso: al reiniciar se vuelve a leer privacy.json y un permiso
anterior puede reactivar el grabador. No se presenta como decisión persistida;
para cambiarla de forma duradera hay que guardar en Ajustes cuando sea posible.

Teclado: GPUI activa el control al soltar Enter/Espacio y ese control consume
el evento. Un Enter sin consumir avanza, también si el foco está en un control
pasivo. El formulario de email conserva Enter para sus propias acciones.
Los tests usan gpui_platform::headless y TestPlatform con foco/eventos reales,
sin renderer, ventanas del sistema ni capturas; `test-support` solo se habilita
en la dependencia de desarrollo de la revisión GPUI ya fijada. Su aprobación
queda pendiente de Isaac: introduce 11 transitivas de test, incluido el fork
git de proptest fijado por GPUI. HeadlessAppContext/TestPlatform está bajo
test-support; el headless normal de Windows carece de DirectX y de drop helper
y no permite crear una ventana para dibujar/recorrer foco y enviar eventos.
La prueba alternativa y el resultado se registran en #1637; no se reemplazan
los eventos de teclado por llamadas directas al controlador.

R3: el botón de correos de Ajustes reintenta `mail.desired` mientras no haya
ACK, aunque el último permiso confirmado fuera otro. Solo sin intención pendiente
alterna el ACK; el texto muestra «Reintentar guardar el permiso de correos».
Los iconos del resumen reciben confirmación/activación explícita, nunca infieren
un estado del texto: planes sin confirmar o bloqueados y permisos apagados son
neutros. Verificación de producción: `cargo tree -p vantare-hub --target
x86_64-pc-windows-msvc --offline --locked -e normal,build,features` no incluye
`gpui/test-support` ni proptest; al añadir `dev` sí aparecen. Es evidencia del
grafo de compilación, no una inspección de un binario release. La dependencia
permanece pendiente de aprobación de Isaac en VANTA-120: no fusionar antes.

## #1564 · Widgets por sesión

Standings → Contenido abre Práctica / Qualy / Carrera, con columnas y formatos
de nombre/tiempo independientes; Restablecer preset afecta solo a la pestaña
activa. Filas, Look, filtro y gaps de clase, pie y ventana del jugador son comunes.
Formato de tabla también modifica solo las columnas de la pestaña activa.
Cambiar pestaña reconstruye sus controles y el ejemplo de diseño usa esa sesión;
las fotos reales y En vivo conservan la sesión de su fuente. La pestaña es estado
de autoría, no un cambio del layout ni de posición/ancla.

En pista reúne Mostrar en práctica/qualy/carrera con Fuera de pista de #1562
para todos los widgets. Ambas reglas se guardan mediante Editor, con
Deshacer/Rehacer, y se combinan en overlays live. La preview siempre se ve.
El módulo nuevo `studio/sessions.rs` conserva el renderer compartido;
la partición #1561 PR-4 conserva Studio y Prepared en `studio.rs`.
Qué vive en cada archivo de Studio y dónde tocar: [`src/studio/README.md`](src/studio/README.md).

## #1569 · Añadir widget

Sin selección, el carril del inspector es el catálogo (`studio/add_widget.rs`);
el lienzo conserva su ancho. Buscador por nombre o uso, categorías con recuento,
sugeridos que faltan y el plan permite, grupo Pro con candado y «Ver planes»
(Cuenta: Licencias está oculta en la beta). Sin acceso verificado no se vende Pro.
Miniatura e icono son SVG propios (`assets/widgets/`, sin texto); el tamaño sale
del renderer productivo con su ejemplo. Deuda: el SVG no sigue al renderer ni al
Look; si un widget cambia de forma, rehacer su miniatura (revisión visual).
Clic o Intro: primer hueco libre (también respecto a ocultos); arrastrar: silueta a tamaño real e imán de 7 px
a centro, márgenes y otros widgets. Un único paso de historial (`Editor::add_at`):
el nuevo queda seleccionado y el aviso ofrece Deshacer/Ctrl Z. «+ Añadir» del
inspector, el botón de la tira, Esc desde el lienzo y clic en lienzo vacío vuelven al catálogo;
`/` busca desde el lienzo. Escenas QA: `studio-sin-seleccion`, `studio-vacio`,
`studio-catalogo-busqueda`, `studio-catalogo-sin-resultados`, `studio-anadido`.

Captura aislada con el harness existente, mutex y pantalla-ocupada:
`--capture studio-base --demo --size 1440x900 --out <PNG>`. Solo en
`parity-capture`, `VANTARE_CAPTURE_SESSION=practice|qualifying|race` selecciona
la pestaña y presets D7; `VANTARE_CAPTURE_INSPECTOR=behavior` enfoca En pista.
Estas escenas son QA declarada, no telemetría ni interacción física en juego.

Proceso GPUI independiente, misma revisión y kit Eficiencia que `vantare-ui`.
No usa Wails ni importa el runtime. Consume DTO/IPC del supervisor para cuenta,
licencias, roadmap y reportes; el supervisor posee la red y las credenciales.

```powershell
cd native
cargo run --offline -j 2 -p vantare-hub
```

Todas las secciones del producto distribuido están en la navegación. La presencia
de una sección no acredita acceso, conexión remota ni paridad funcional completa.

El botón Cerrar Hub, el cierre de ventana y el flanco no-Live→Live solicitan
el mismo cierre protegido. Primero deben resolverse las decisiones del Launcher
y guardarse los documentos: un formulario Strategy sin confirmar, un conflicto
o un error de escritura mantiene el Hub abierto y muestra el error. La preservación
de datos tiene prioridad incluso si el juego ya está activo; tras resolverlo,
se puede cerrar manualmente. El Hub no es hijo del launcher. Live exige origen `SourceKind::Live` **y**
`state.source_state == SourceState::Live` (DTO v9). Waiting, Stale, Lost y
Replay no cierran; primera foto Live establece referencia y tampoco cierra.
El cierre cancela el Subscriber, sin parar núcleo, overlays ni Engineer.
La escena del Workshop no participa en esta decisión. La entrada física
al juego y la clasificación real de su estado siguen pendientes de QA.
`--control-stdin` y EOF son exclusivamente el ciclo de desarrollo (100 ms).

La paridad y los bloqueos están en el
[microplan](../../docs/superpowers/plans/2026-09-30-fase-5-hub-studio-workshop.md).

## Desarrollo en Linux y macOS (#1437)

Los gates de desarrollo se ejecutan desde `native/`: `cargo fmt --check`,
`cargo check --workspace --all-targets -j 4`,
`cargo clippy --workspace --all-targets -j 4 -- -D warnings`,
`cargo test --workspace --no-fail-fast -j 4` y
`cargo test --workspace --test lifecycle -j 4`.
El discovery del sistema y la lectura de accesos directos `.lnk` solo están
disponibles en Windows; Unix conserva las fuentes explícitas de prueba.
Los tests que ejecutan `cmd.exe` también son exclusivos de Windows. La captura
de paridad por Win32/PowerShell no está disponible en Unix; estos gates no
verifican paridad visual ni el comportamiento Windows.

## Workshop local

```powershell
cargo run --offline -j 2 -p vantare-hub -- --workshop --data-dir C:/tmp/hub-local
# O recompilar/reabrir al guardar Rust/fuentes con PowerShell 7:
./hub/dev.ps1 -DataDir C:/tmp/hub-local
```

Catálogo: `Kind::ALL`, sin copia de widgets. Selección de escenas versionadas,
reload JSON a 150 ms (última foto válida ante error), unidades/idioma del
formateador, fondo del escenario y comparación con una foto fijada sobre el
mismo renderer. El fondo pertenece al escenario, no al widget.

`--scene RUTA` admite un snapshot DTO JSON o un JSONL (una foto DTO por línea,
misma época, revisiones crecientes y tiempos de recepción no decrecientes).
JSONL: play/pausa, step, inicio, loop y cadencia de la captura. No genera
transiciones ni señales nuevas. Archivos hasta 16 MiB y 512 fotos. La escena
`lmu47` distribuida viene del corpus real; otras escenas son reconstrucciones
de paridad. Un archivo externo no adquiere procedencia por su nombre.

La selección se guarda en `workshop-selection.json` en `--data-dir` (por
defecto `<directorio de datos>/VantareNative/hub`, separado de Wails). El
directorio base es `%LOCALAPPDATA%` en Windows, `$XDG_DATA_HOME` (o
`$HOME/.local/share`) en Linux y `$HOME/Library/Application Support` en macOS.
Un error inicial de documento/escena termina con error, sin reemplazarlo por
datos ficticios.
Guardar o cerrar conserva widget/escena/foto/loop/unidades/idioma; la comparación
es temporal. Los locks y temporales son archivos hermanos; tras una muerte
abrupta revisar los restos antes de quitarlos. Conflictos o falta de permisos
no sobrescriben el archivo. Cierre normal rechazado si falla guardar; EOF
supervisado siempre cierra y devuelve error si no pudo guardar.

Pendiente de Workshop completo: catálogo de 22 widgets (Kind::ALL expone 18 en esta integración), configuración
de contenido en Workshop (Studio ya ofrece las opciones aplicadas), edición/timeline de escenas y exportación de capturas
desde Hub. El comparador y el binario de captura existentes de `ui` siguen
siendo el camino de paridad. Este corte no los duplica ni afirma paridad aprobada.

## Studio local

```powershell
cargo run --offline -j 2 -p vantare-hub -- --studio --data-dir C:/tmp/hub-local --layout C:/tmp/hub-local/layout.json
```

Editor del único `vantare_ui::layout::Layout`: selección, añadir/eliminar/ordenar
instancias, visibilidad, opacidad 0..1 y undo/redo acotado a 50 cambios. Canvas
edita posición global mediante drag, anclaje 3×3 y cruceta; admite negativas. Drag
mantiene preview fuera del documento y confirma una sola edición al soltar.
Inspector edita los `Settings` tipados. Mismo `Overlay::configured` que overlays;
no hay otra implementación visual ni otro formato de layout.

Al abrir una instalación limpia, Hub y overlays inicializan el documento mediante
la misma API: Standings, Relative, Delta y Pedals en el monitor principal. Si otro
proceso lo creó después de prepararlo, se relee antes de pintar o editar. Un layout
vacío guardado por el usuario se conserva; los conflictos de ediciones posteriores
siguen exigiendo recarga explícita.

Cada edición, undo y redo se guarda mediante `layout::Document::save` antes de
confirmarla. Usa `<directorio de datos>/Vantare/native/layout.json`, independiente
de `--data-dir`. Conflicto por bytes/error conserva documento, selección e historial.
Recargar layout acepta explícitamente el archivo externo y descarta historial;
si es inválido, conserva el anterior. Un archivo inválido al arrancar falla sin
abrir ventana ni reemplazarlo. Tamaño/normalización/backup/escritura pertenecen
solo a la API común. Cerrar no vuelve a escribir el layout ni pisa cambios externos.

Standings estándar usa siempre la clase del jugador; Multiclase agrupa todas
las clases. Relative estándar conserva solo la clase del jugador y admite filas
delante/detrás independientes. Se retiran sus selectores redundantes de clase
y el centrado de tabla en el jugador. El punto de la cruceta sigue centrando
espacialmente el widget en el lienzo.

Delta Vantare admite Cápsula/Barra/Ampliado y referencias Mejor propia/Óptima/
Líder de clase. Barra y sectores se editan cuando el formato los representa.
Última vuelta y mejor absoluta de sesión siguen pendientes: el núcleo no
publica señales independientes para ellas. Neo/Neutro y los acentos del kit
Vantare están disponibles en los widgets portados de #1497. Las opciones que
el renderer no aplica permanecen pendientes y se conservan al editar otra
propiedad; fuente: constructores de `ui` y `ui/layout-evidence.md`.

Para probar en un archivo aislado, usar `--layout C:/tmp/hub-local/layout.json`
en Hub y en `vantare-overlays`; sin ese argumento ambos usan el layout común.
`hub/dev.ps1 -Layout C:/tmp/hub-local/layout.json` conserva esa ruta al recompilar.
El overlay ya vigila el archivo: no se añade comando de aplicación desde Hub.
Canvas de preview 1920×1080, otros monitores quedan fuera de esta preview.
Tests de documento/geometría no sustituyen arrastre físico, DPI, vigilancia
de ventanas/OBS ni paridad.

### Studio UI r10, ronda 3 (#1496)

El lienzo 1920×1080 conserva 16:9, ocupa el máximo espacio disponible y se
centra en el viewport medido. Zoom manual conserva el desplazamiento espacial;
Ajustar vuelve al encaje. La barra inferior muestra x/y y tamaño efectivo del
renderer. Anclar alinea los bordes o el centro del widget con una de nueve zonas:
es una acción de posición, sin anclaje persistente ni seguimiento automático.
La cruceta mueve 1 px, Mayús 8 px; mantener pulsada una flecha repite con
aceleración. Teclado y botones confirman una sola edición al soltar, con
undo/redo mediante el mismo Editor. El punto centra. Un clic o ruido de puntero
por debajo del umbral de drag no cambia posición, archivo ni historial.
Los valores exactos salen del inspector.

El inspector usa secciones del panel derecho común; Ctrl Alt B lo recoge.
Contenido, opacidad, visibilidad, columnas y color admitido conservan sus setters
productivos. La tira permite seleccionar/ocultar y añadir el catálogo real.
Ejemplo usa muestras de diseño por widget; las tablas están marcadas como
ficticias y contienen 30 coches por clase para responder a filas, ventanas y
multiclase. Boxes permite seleccionar fotos reales del corpus sin inventar
señales y comparte la misma foto entre todos los widgets. En vivo usa
exclusivamente la foto recibida. Salida/Carrera/Lluvia/Noche explican
su indisponibilidad si el corpus no demuestra esas condiciones; las muestras
no certifican una sesión real. Durante el slider de opacidad, la preview altera
solo el marco exterior y conserva renderers/foto; al soltar se guarda una edición.

El documento nativo no guarda escala libre ni frecuencia por instancia. Tamaño
−/+ usa las dimensiones admitidas del widget. Rendimiento, selector de otros
overlays, Publicar/Mostrar en pista y URL de OBS siguen pendientes. El indicador
Hz muestra — porque no existe medición disponible; no se inventa nivel 4 Hz ni
frecuencia efectiva. El renderer compartido es `Overlay::configured`, sin otra
implementación de widgets ni schema nuevo.

## Secciones locales

Calendario lee el seed oficial UTC de Go. El empaquetado caduca el 1 de
septiembre de 2026: se muestra histórico y no ofrece próximas carreras.
Seguir/dejar de seguir guarda `calendar-following.json`. Para una agenda
explícita, dejar un catálogo UTC en `--data-dir/official-schedule.json` y
pulsar Cargar; fallo conserva la última agenda. Se ofrecen hasta 20 salidas
de las siguientes 24 horas de series seguidas si la publicación es vigente.
No hay publicación, Discord, zonas distintas de UTC ni recordatorios.

| Sección | Implementación actual y contrato |
| --- | --- |
| Notificaciones | Errores locales, dedupe, lectura y destinos cerrados; memoria del proceso. |
| Ajustes | Preferencias locales de apariencia y Workshop; [contrato](src/settings/README.md). |
| Testing Center | Editor del servicio de reportes y diagnóstico local separado; [contrato](src/testing/README.md). |
| Cuenta / licencias / roadmap | DTO/IPC al supervisor; sin red/tokens; inputs de email transitorios; `src/services`. |
| Launcher | Catálogo, perfiles, cadenas y política de cierre; [contrato](src/launcher/README.md). |
| Strategy | Documento y solver local, datos/revisiones y editor; `src/strategy.rs`. |
| Análisis | Lectura acotada y cancelable mediante el helper de storage; `src/analysis`. |
| Engineer | Report v2 con frescura, entregas observadas y ajustes para su propietario; [contrato](src/engineer/MODEL.md). |

El proceso Engineer pertenece al supervisor y sigue independiente del Hub.
Estas rutas implementadas no prueban login/envío remoto, juego, OBS o empaquetado.
El worker de servicios publica su evento de cancelación antes de conectar o leer
el saludo. El cierre lo señala y espera el join en el ejecutor de fondo; no bloquea
el hilo UI durante el join. GPUI limita las futures de cierre a 200 ms; señalar
el evento y cerrar el sender despierta también connect/hello y recv pendientes.
Descartar una conexión no cancela al propietario, por
lo que una reconexión conserva su evento hasta el cierre del Hub.
La navegación, el rail, la paleta y el contenido usan la misma proyección de las
capacidades del núcleo recibidas por Cuenta. Requiere sesión no caducada y política
vigente sin error; logout, cierre del servicio o error revocan la proyección. El
Hub consulta LicenseStatus por IPC una vez por segundo cuando el canal está libre;
la política pierde vigencia a los dos segundos aunque no llegue otra respuesta.
Los bits ausentes no acreditan Free ni Studio básico: ese dato no está en el DTO.
Las restricciones de capturas/demo permanecen aisladas de la autoridad productiva.
El microplan y los bloques fechados conservan la evidencia de los hitos anteriores.


## Verificación de proceso

`--pipe NOMBRE` selecciona un pipe local privado; por defecto usa el nombre
por usuario de IPC. Desde native, después de construir el binario:

```powershell
./hub/verify-process.ps1
```

Usa una copia y datos temporales propios más un pipe sin productor para
comprobar proceso vivo, guardado y salida total por EOF. No lanza núcleo ni
juego ni demuestra entrada al juego, paridad, DPI/OBS o presupuesto de memoria.
La condición de cierre usa DTO v9 y el Studio usa la API común de layout.
El smoke usa una ruta de layout aislada y no lee el layout personal.

## Kit visual

`src/orbit.rs` reproduce los tokens y piezas de Command Orbit v0.3
(`frontend/src/styles/orbit.tokens.css`): columna de contexto, barra superior,
cabecera de página, tarjetas, filas de ajuste, interruptores, botones, selects
y notas. Toda sección nueva compone estas piezas; no define colores ni tamaños
propios. La dirección visual la mantiene el orquestador.

## Horario publicado — #1488

«Actualizar horario» usa el worker IPC compartido para pedir a services el
horario publicado. La primera apertura del Calendario también lo pide si no
hay horario vigente. La demo no consulta red ni guarda publicaciones.
`official-schedule.json`, bajo el directorio de datos, contiene la última agenda
validada y guardada atómicamente; se restaura al arrancar. Una respuesta inválida,
un fallo de red o de escritura conserva el horario anterior. La ventana es
`[validFrom, validUntil)`; cuando no hay uno vigente, todas las vistas muestran
«Aún no hay horario publicado para esta semana» sin carreras caducadas.
No publica horarios ni activa recordatorios.

## #1562 · Ocultar fuera de pista

Ajustes → General ofrece Ocultar fuera de pista (opt-in). Studio → En pista
ofrece heredar / siempre visible / ocultar por instancia. Se guardan en el único
layout mediante el Editor existente, con conflictos y Deshacer/Rehacer. Studio
no aplica ocultación a sus previews. Ver [contrato](../runtime/README.md).

Revisión del paso 7: ClockBehind.until_ms está en tiempo de pared (lápida
efectiva menos forward_millis), con aviso de fecha/hora local. El estado local
del supervisor usa el mismo aviso si omite renovar. NoCredential/RecoveryRequired/
ClockBehind frescos admiten consultas al helper; Logout sigue disponible con
canal del núcleo autenticado, incluso ante denegación o caducidad. Sin conceder
derechos ni saltar el ACK durable; ADR0102.
