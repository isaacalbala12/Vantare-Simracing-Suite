# Hub Rune · VANTA-143 / #2256

Vía paralela de desarrollo según ADR 0108. Workspace independiente de native;
no cambia los overlays, Electron ni la distribución. Ejecutable:
`vantare-hub-ui-rune`: marco conectado con estado del núcleo y Roadmap de solo lectura.

Rune y sus cuatro parches están fijados a
`d5338988a7c1b3377adb60853815b6d0843dae7c`, Rust 1.99.1.
`default-features = false`; se habilitan explícitamente `accessibility`, `dbus`,
`embedded-fonts`, `metal-backend` y `svg`, como fija Cargo.toml.
`ogg-audio` queda desactivado: el Hub no reproduce OGG y sus codecs MPL-2.0
están prohibidos por decisión del orquestador. No activar defaults.

## Comprobaciones

Windows servidor: **nunca ejecutar el binario**, ni `--snap`, `--frames`,
`--video` o `--tree`. Compilar solo por la cola, desde `vantare-v2`, con
`RUSTUP_TOOLCHAIN=1.99.1`, `CARGO_BUILD_JOBS=2`, un solo slot propio y targets
persistentes del slot en D:, según la instrucción actual del orquestador.

```powershell
$env:RUSTUP_TOOLCHAIN = '1.99.1'
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo clippy --locked -j2 --all-targets --manifest-path hub-rune/Cargo.toml -- -D warnings
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo test --locked -j2 --all-targets --manifest-path hub-rune/Cargo.toml
```

Desde esta carpeta, `cargo fmt --all -- --check`,
`python scripts/test_dependencies.py` y `python scripts/check_dependencies.py`.
El último comprueba todas las plataformas resueltas, incluidos build scripts,
sin compilar. Falla con MPL, licencias externas desconocidas/no permisivas,
reactivación de OGG o dependencia de runtime/UI/GPUI del producto. Los crates
locales existentes sin SPDX solo se reconocen por su ruta exacta. El listado
[LICENCIAS.md](LICENCIAS.md) se genera con `--report LICENCIAS.md`.
No se ha añadido cargo-deny ni otra dependencia para esta comprobación.
El catálogo compartido necesita Node >= 22.18.0 y rustup con Rust 1.99.1/rustfmt.
La CI instala ambos con versiones fijadas; el test local explica si falta Node.

El test Rune usa únicamente Runtime/frame, sin GPU. No ejecutar el test desde
un binario de aplicación ni añadir opciones gráficas en CI. El workflow propio
Windows no es obligatorio y los cambios solo en hub-rune no lanzan gates nativos.

Solo en **debug + macOS** se aceptan `--snap`, `--frames`, `--scene`, `--size`,
`--scale`, `--out` y `--theme` (con valor separado o `=`). En Windows y release
se rechazan; `--video` y `--tree` se rechazan en todas las plataformas.
Las capturas --snap son offscreen: Rune no crea una ventana ni activa la aplicación.
El guion siempre pasa --snap; --scene solo abre una ventana y no debe usarse para capturar.
Isaac completó el recorrido visible: PASS manual. Aspecto: FALLO; véase CORTE-1.

Al pulsar X se envía `WindowClose` (id 0, como Electron); el proceso espera
`CloseRequested` y escribe `CloseAnswer` antes de salir. En este commit Rune
oculta la ventana antes de llamar a `on_close`: `keep_running` mantiene el proceso
para completar el protocolo. Isaac comprobó el cierre visible con X: PASS manual; la medición del proceso sigue pendiente.
El plazo de cierre es **10 s**, con el reloj y la planificación de Rune: supera
los 5 s de report-close y los 2 s del cierre forzado Live/ControlEof. Si vence,
falla el envío o el enlace falla, el cliente sale.
En el host actual, WindowClose emite CloseRequested (o no repite un cierre ya
pendiente); no devuelve una respuesta de éxito ni un mensaje de veto separado.
El veto de guardas es de la interfaz: CloseAnswer { allow: false } conserva la
sesión para Window/Restart. Este marco es de solo lectura y confirma el cierre.
Si llega un Failure id 0 recuperable (Busy/Rejected/Denied/Protected), se anula
el plazo y se reabre la ventana con AppHandle::open. Otros errores de cierre
son terminales. Rune permite reabrir con keep_running, aunque oculta la ventana
antes de on_close: no puede garantizar que siga visible mientras se decide.
La reapertura y el foco reales siguen pendientes de prueba en el Mac.
El worker espera a la vez el evento de lectura overlapped y el evento de envíos
o parada (`WaitForMultipleObjects`), sin sondeo ni retraso periódico de 250 ms.
Las escrituras mantienen un plazo de 5 s. Las lecturas quedan pendientes hasta
recibir datos o cancelar; ya no usan el antiguo plazo de 200 ms.
Antes del join se cancela la E/S pendiente y se señala la parada; los buffers
permanecen vivos hasta que Windows confirma la cancelación. Se comprueba
CancelIoEx: ERROR_NOT_FOUND es benigno; otros errores se registran sin datos del
canal. El drenaje espera como máximo 1 s y consulta GetOverlappedResult sin
bloquear. Si Windows no confirma la finalización, se registra y se aborta el
proceso: devolver y liberar un buffer aún en uso sería inseguro. Un timeout de
escritura deja la conexión parada, incluso si se completó parte de la trama;
no se permite escribir la siguiente. Lecturas canceladas usan ConnectionAborted.
CPU real: corte 2.

La apertura y capturas se hacen en el Mac. La biblioteca hub-host se consume
directamente; no se copia el contrato. La escena de desarrollo usa los mismos
ejemplos que Electron, sin servicios productivos ni cuentas reales.

## Marco conectado (pasos 2–5)

El marco usa los nueve temas, Inter, textos e iconos de Electron. El generador
`node ../hub-web/scripts/rune-catalog.mjs` actualiza catálogo e iconos;
`--check` detecta diferencias y también se ejecuta en los tests. Requiere Node
>=22.18.0 y rustup/rustfmt 1.99.1 solo en desarrollo, no en la aplicación.

Arrancado por hub-host, consume y borra `VANTARE_HUB_PIPE`/`VANTARE_HUB_TOKEN`
antes de iniciar hilos. El cliente tiene colas acotadas, E/S con plazo y cierre
con cancelación/recogida del worker. No se registran los valores del bootstrap.
Se conserva el contrato Rust del host; no se copia un DTO del núcleo.

En un Mac de desarrollo, el anfitrión de escena solo existe en debug. Las
escenas comparten los JSON de `hub-web/fixtures` y no usan servicios ni cuentas:

```sh
VANTARE_HUB_HOST=mock VANTARE_HUB_SCENE=roadmap-published \
  ~/target-isa-2256-hub-rune/debug/vantare-hub-ui-rune \
  --scene roadmap --snap ~/orq/roadmap-rune.png
```

Otras escenas: `core-offline`, `core-connected`, `roadmap-base`,
`roadmap-error`, `ajustes-base`. Opciones visuales Rune solo admitidas en Mac
con debug; en el servidor no ejecutar ninguna. Los tres argumentos QA de
Chromium del anfitrión se validan e ignoran; otros argumentos se rechazan.

Roadmap conserva la última publicación si falla el refresco, ignora respuestas
antiguas, expira peticiones a 45 s y refresca cada 300 s solo mientras la sección
está abierta. No hace peticiones en paralelo ni permite editar o publicar.
Tablero, Circuito y Temporada se calculan desde la misma publicación; `later`
se agrupa en Planeado. El estado del simulador y el aviso de núcleo apagado se
actualizan desde el protocolo del anfitrión.

El smoke gráfico Windows sigue pendiente. El teclado, cambio de pantalla/tema
y cierre visible en Mac tienen PASS manual de Isaac; el aspecto fue rechazado. [Corte 1](CORTE-1.md) separa cobertura automática y
aceptación real pendiente. No se afirma fidelidad visual o soporte Windows 10
probado a partir de mocks o de una compilación.


## Inicio · primer corte de pantalla

Rama propia de VANTA-143/#2256, dependiente de #2268. El material de #2241
sirve como referencia de estructura; no se fusiona su workspace de medición.
Este primer PR conecta HomeGet/Event::Home y la suscripción Home solo mientras
Inicio está visible. Un fallo o plazo de 45 s conserva el último estado y
permite reintentar; no hay sondeo periódico y se ignoran respuestas antiguas.

Contiene la bienvenida, vista previa del layout, métricas disponibles,
actividad de los perfiles y panel lateral con favorito, estado y plantillas.
Los enlaces Studio respetan el acceso actual. Solo muestra los datos disponibles;
no inventa Hz ni CPU. Los textos y las 19 ilustraciones proceden de Electron,
y las escenas se generan desde la misma función pura que usa su anfitrión simulado.
Las ilustraciones se decodifican por CPU; ninguna prueba crea una ventana o GPU.

El selector y el favorito lanzan con launcher.launch { profile, baseRevision },
igual que Electron. Un doble clic no duplica peticiones. Se comprueban acceso,
protegido, live y progreso al pulsar y al enviar. Un rechazo o Failure muestra el error. Sin respuesta tras 45 s, el lanzamiento
queda incierto: botones y Ctrl L permanecen bloqueados hasta que una publicación
Home o una lectura nueva informe Running o Idle. Actualizar estado solo consulta;
no reintenta el lanzamiento. Una lectura pendiente anterior no certifica Idle. Se conserva
el perfil/revisión pulsados y se rechaza enviar si cambian antes del despacho.
El anfitrión conserva la ejecución y las comprobaciones definitivas.

Circuito/alias compartidos, solo un circuito decodificado, plantillas en parejas,
panel adaptable y hero de 200/236/300 px según altura. El saludo y la fecha usan
los casos compartidos de Electron. Ctrl K abre una búsqueda con foco modal y
Ctrl L lanza el favorito con las mismas restricciones. VER TODO abre la actividad
disponible en Inicio. Detener sigue deshabilitado con el mismo motivo que Electron.
Los avisos del siguiente corte siguen pendientes. La fidelidad visual requiere capturas del Mac y
aprobación; no se da por verificada con los tests de Runtime.


Escenas debug: inicio-base, inicio-vacio, inicio-cargando, inicio-error,
inicio-sin-diseno e inicio-lanzando. 66 capturas offscreen por cliente y comparativas completadas. Isaac probó la
ventana visible y aprobó el funcionamiento; la aprobación visual sigue pendiente
en [Corte 1](CORTE-1.md).
El servidor permanece sin ejecutar la aplicación.


## Fidelidad del marco e Inicio

El PR prioritario corrige el raíl de 76/272 px, cabecera de 52 px, iconos,
aviso de núcleo integrado y estados con icono/título/subtítulo/etiqueta.
El TTF compartido de Rajdhani tiene la familia interna `Rajdhani SemiBold`;
Electron usa un alias CSS y Rune debe pedir el nombre interno para evitar otra fuente.
Inter también usa familias internas separadas por peso (Inter W400/500/600/650/700).
Los tests comprueban los bytes del archivo utilizado para cada peso, sin depender de
las fuentes instaladas en la máquina.
Los títulos pequeños usan mayúsculas espaciadas como TrackedCaps de Electron.

Las fechas de actividad se convierten desde RFC3339 a la zona local y se muestran
DD/MM · HH:MM como Electron. Se reutiliza chrono 0.4.45 ya aprobado, presente en
hub-host y en Cargo.lock, con las mismas funciones; no entra ningún paquete nuevo.
Los valores inválidos conservan el texto compartido sin fecha.

El orquestador detuvo las capturas de Electron porque abrían ventanas. No volver
a ejecutar el guion antiguo: la referencia debe arrancar con política accessory,
ventana oculta y foco deshabilitado antes de ready-to-show, o usar el banco existente.
Las capturas Rune emplean --snap offscreen, sin Automatización ni System Events.
El corte 1 mantiene FALLO visual hasta la aprobación de Isaac, aun con CI verde.


### Referencia Electron sin ventanas visibles

`scripts/electron-corte1.mjs <hub-web> <salida-nueva> <plan.json> <SHA-build-QA>`
se ejecuta con Bun solo en macOS y con el QA build ya preparado. Exige
LSUIElement=true en el bundle Electron de ese checkout propio. Nunca modificar
un Electron instalado de otra tarea ni usar un perfil real.
Copia un entry QA junto al original e importa primero electron-capture-guard.mjs:
accessory, sin foco, sin show/showInactive/focus/restore/moveTop y sin diálogos
nativos de error. Ningún archivo de Electron de producto se modifica.

El guion falla si una ventana es visible, tiene foco, puede recibirlo o Electron
es la aplicación en primer plano. Registra esos valores y el PID anterior/posterior;
si Isaac cambia de aplicación por su cuenta, no se interpreta como activación de QA.
CDP usa viewport lógico 1440×900 y DPR 1/1.25/1.5; no redimensiona PNG posteriores.
Es referencia del renderer Electron real del Mac, complementaria al banco HWND
Windows; no certifica una ventana Windows ni el teclado físico.
Prueba de arranque oculto PASS: visible=false, focused=false, focusable=false,
aplicación en primer plano sin cambio. SIGTERM del controlador no continúa la matriz.


Evidencia de #2297: 66 comparativas por fase, claro/oscuro y 100/125/150 %,
con originales y hashes en evidence/hub-rune/corte1 del servidor. Se publican
las rutas del informe y del registro en [CORTE-1](CORTE-1.md), sin PNG en Git. El target propio del Mac
se retiró al terminar; el binario debug quedó conservado en ~/orq para una
revisión coordinada. Nuevas compilaciones necesitan volver a crear el target.


Excepción acotada de ADR 0108: se extrae la función pura del mock de Inicio de
`hub-web/src/mock/modules/home.ts` a `src/mock/home-scene.ts`, compartida por el
mock Electron y el generador del catálogo Rune. Conserva los datos y el contrato
del anfitrión; evita dos fuentes de escenas. No cambia el producto Electron ni
hub-host. La revisión del PR declara esta excepción expresamente.


## Studio · corte 2 en curso

La rama `vantareapp/isa-2256-hub-rune-studio` parte del head 7eff0c88 de
#2297. Ese PR sigue draft, pendiente de la comparativa definitiva de Inicio
y del OK visual de Isaac. La autorización posterior del orquestador permite
avanzar Studio con código y tests sin ventana mientras vuelve el Mac.

Studio consume directamente StudioView/Request/Reply de hub-host. Suscribe al
entrar y retira al salir; no sondea. Ofrece selección, catálogo con búsqueda,
añadir/eliminar con confirmación, deshacer/rehacer, mostrar en pista y ajustes
de visibilidad, opacidad 20–100 %, sesiones y fuera de pista. Apariencia incluye
Look, estilo, acento y los formatos admitidos de Standings/Relative/Delta/Fuel,
así como fondo transparente y barra Delta donde los ofrece el contrato.
La marca sigue siendo de solo lectura y Contenido sigue pendiente, como Electron.
La imagen compartida es una ilustración: no simula una vista previa del overlay.

El anfitrión conserva la autoridad. Solo hay una petición pendiente y cada edición
se vuelve a comprobar antes del envío con acceso, revisión y bloqueo actuales.
No se aplica nada de manera optimista. Un conflicto actualiza el documento y
exige una acción nueva; un plazo vencido bloquea nuevas ediciones hasta releer,
sin reenviar automáticamente una operación cuyo resultado no se conoce.
Se puede dejar de mostrar overlays aunque se revoque el acceso.

Escenas debug: studio-base, studio-vacio, studio-protegido y studio-missing,
derivadas del corpus generado por el anfitrión, sin otra copia de sus tipos.
El anfitrión de escena ofrece lectura y eventos; las escrituras requieren el
anfitrión real y la escena devuelve Unsupported sin fingir un guardado.
Los presets cerrados studio-light/studio-dark quedan preparados para el Mac.
Los flags de captura solo se aceptan en debug+macOS; en Windows no se ejecuta
el binario ni se crea un dispositivo gráfico.

Pendiente: comparativas Studio con Electron en ambos temas y las tres escalas,
ventana real/teclado físico y escrituras con el anfitrión real. No se declara
Studio ni el corte 2 aceptados. Al volver el Mac se captura primero #2297,
siempre offscreen y sin activar ventanas delante de Isaac.


Validación local Studio: Clippy y 73 tests Windows PASS sin ventana, por la cola
con dos jobs. Incluye conflictos/revocación/plazos, peticiones de apariencia de
los cinco widgets en ambos Looks y catálogo Unicode/Escape. El test espera la
entrada de Rune avanzando el reloj inyectado antes de pulsar el campo y comprueba
que ya es visible. Logs en D:/VantareServer/evidence/hub-rune/studio-*-validated.log.
CI y revisión del head actual se consultan en #2306; estos tests no certifican
apariencia, dispositivo gráfico ni anfitrión real.
