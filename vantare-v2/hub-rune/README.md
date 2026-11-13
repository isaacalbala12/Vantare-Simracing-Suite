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
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo clippy --locked --all-targets --manifest-path hub-rune/Cargo.toml -- -D warnings
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo test --locked --all-targets --manifest-path hub-rune/Cargo.toml
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
Las capturas y la ventana visible siguen pendientes del Mac dormido.

Al pulsar X se envía `WindowClose` (id 0, como Electron); el proceso espera
`CloseRequested` y escribe `CloseAnswer` antes de salir. En este commit Rune
oculta la ventana antes de llamar a `on_close`: `keep_running` mantiene el proceso
para completar el protocolo. Queda pendiente comprobar ese cierre nativo en Mac.
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

Las capturas, el smoke gráfico Windows y la ventana visible se han aplazado
por orden del orquestador. [Corte 1](CORTE-1.md) separa cobertura automática y
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

Es un primer corte: quedan para el siguiente PR las acciones de lanzar/seleccionar,
paleta/atajos, nombre y fecha locales, avisos de actividad y acabado visual contra
Electron (circuito, columnas/adaptación, fechas y espaciados). No se afirma paridad
completa de Inicio ni se muestran controles de lanzamiento sin conectar.

Escenas debug: inicio-base, inicio-vacio, inicio-cargando, inicio-error,
inicio-sin-diseno e inicio-lanzando. Capturas headless y ventana visible del Mac,
comparación con las referencias Electron y aceptación del corte 1 siguen pendientes.
El servidor permanece sin ejecutar la aplicación.
