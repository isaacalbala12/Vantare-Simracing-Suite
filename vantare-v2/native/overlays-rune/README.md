# Overlays Rune · VANTA-144 / #2333

Base y proceso (PR 4/5) de [ADR 0110](../../docs/adr/0110-overlays-en-rune.md).
El Hub permanece en Electron. Este workspace independiente conserva su propio
`Cargo.lock` y `rust-toolchain.toml` (1.99.1). No cambia la resolución de
`native/Cargo.lock` ni depende de `ui`, GPUI o `runtime`.

Rune y sus cuatro parches (`wgpu-hal`, `winit`, `parley_engine`,
`accesskit_windows`) usan la copia `https://github.com/isaacalbala12/rune`,
etiqueta `vantare-20261115-1`, commit
`d5338988a7c1b3377adb60853815b6d0843dae7c` fijado por `rev`.
`default-features=false`; se conservan `accessibility`, `dbus`,
`embedded-fonts`, `metal-backend` y `svg`. No se habilita `ogg-audio`.
No hay nuevas dependencias directas fuera de Rune y los crates existentes
`domain`, `ipc` y `profiling`.

En Windows el proceso mantiene una ventana transparente por cada monitor válido,
también al conectar/desconectar monitores. Conserva origen físico (también
negativo), tamaño y DPI de cada monitor;
las claves no dependen del nombre del monitor. Usa click-through, siempre encima,
sin foco/activación, ni entrada en Alt-Tab/barra de tareas en Windows. Los ajustes
nativos se aplican sobre el handle prestado de Rune; un error cierra el proceso.
`--start-hidden` crea las ventanas ocultas. No hay widgets ni capturas todavía.
El arreglo de conectar/desconectar monitores está en
[#2346](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/2346)
(padre #2333); su comprobación física sigue siendo obligatoria antes de F2.

`monitores.rs` mantiene un controlador `App::windowless`: no es otra ventana
oculta ni una superficie gráfica. Conserva el proceso cuando se retira el último
monitor. Un observador Windows consulta la topología una vez por segundo mediante
`EnumDisplayMonitors`/`GetMonitorInfoW` y el mismo DPI efectivo que winit de la
copia fijada. Solo publica cambios; una consulta idéntica o reordenada no despierta
la GUI. Los errores transitorios conservan la última topología completa.
Las ventanas se identifican por HMONITOR, con generación al abrirlas; los nombres
duplicados no son claves. Cambiar límites/DPI recoloca la ventana existente;
retirarla marca su cierre como interno y elimina su waker al destruir el estado.
El cierre del usuario o supervisor sigue cerrando todo. El observador cancela su
espera antes del join; no tiene un sueño de un segundo que bloquee la salida.
Una comprobación única tras abrir detecta errores de creación, sin reloj de GUI
en reposo. Diseño, fotos y cadencias no se modifican en este arreglo (Worker A).
En Mac/Linux se conserva por ahora la topología inicial; la aceptación es Windows.

La CLI del supervisor acepta `--fuente local|pipe[:nombre]`, `--control-stdin`
y `--start-hidden`. El valor por defecto es el pipe del núcleo del usuario.
Con `--control-stdin`, EOF cierra todas las ventanas y termina los lectores;
los bytes recibidos no se interpretan como órdenes. Un error de lectura también
cierra, con salida fallida. El cierre local cancela la espera y une los hilos
sin esperar a que el padre cierre su pipe. No se emplea un read bloqueante sobre
un pipe vacío: Windows consulta los bytes disponibles; Unix usa poll sin espera.
Entre consultas hay una espera cancelable de 250 ms, sin despertar la GUI.

En la fuente real se conecta el Feed de derechos existente, que comprueba la
identidad del núcleo. La autorización por widget sigue exactamente
`ui::rights::allowed_at`: observación fresca, estado que permite acceso y catálogo.
Caducidad, revocación y reinicio retiran el acceso. Renovar el TTL sin cambiar
la autorización no solicita otro frame. `--fuente local` es solo desarrollo:
preview sintético explícito, sin cuenta ni credenciales, en compilaciones debug.
Las distribuciones release (debug_assertions desactivado) rechazan ese argumento
antes de crear hilos o ventanas; LocalPreview tampoco concede widgets en ese
perfil aunque se construya internamente. Se usa una única política para ambos
caminos, cubierta por tests CPU compilados también sin debug_assertions en CI.
Los PR 6/7 deben conservar este cierre al incorporar widgets y el modo de captura.
El núcleo admite ahora ambos ejecutables
hermanos (`vantare-overlays.exe` y `vantare-overlays-rune.exe`) como lectores;
Services sigue siendo el único mutador. Una copia en otra carpeta no es admitida.

### Integración pendiente de PR 3

Esta entrega implementa la parte independiente del PR 5 autorizada por el
orquestador. Usa el contrato actual de UI como referencia, sin enlazar GPUI ni
copiar los tipos que está trasladando Worker A:

| Código actual que se conectará | Uso en el host Rune |
| --- | --- |
| `ui::layout::{Document, Presentation}` | Leer/vigilar diseño y presentación, sin reescribir sus bytes. |
| `ui::source::{DemandHandle, layout_feed}` | Demanda y fotos del mismo transporte existente. |
| `ui::performance::{Preferences, Cadence}` | Filtrar fotos antes de actualizar cada widget. |
| `ui::session` y `ui::geometry` | Visibilidad por sesión y coordenadas del diseño. |

Tras el PR 3 se importarán desde domain/ipc. Hasta entonces el marco está vacío
y `--layout` o los números de campaña devuelven Unsupported antes de crear
ventanas: no se ignoran diseños ni se simulan fotos de producto. Worker A conecta
diseño, presentación, fotos y cadencias contra esos módulos; este arreglo solo
gestiona topología y vida de ventanas. Worker B continúa Eficiencia y captura.
No se anuncia aún el PR 5 completo, preview ni paridad visual.

## Servidor y CI sin gráficos

En el servidor, el entorno Machine debe tener `VANTARE_SIN_GRAFICOS=1` y los
procesos de compilación también lo fijan. `main` comprueba ese valor antes de
inicializar Rune o interpretar argumentos. Si vale `1`, sale con error y mensaje
explícito sin crear ventana, dispositivo ni hilos. Es una defensa adicional:
está prohibido ejecutar el binario en el servidor, incluso para probarla.
Tampoco se ejecutan `--snap`, `--frames`, `--video` ni `--tree`.

Desde `vantare-v2/`, con dos jobs y la cola compartida (no targets por rama):

```powershell
$env:RUSTUP_TOOLCHAIN = '1.99.1'
$env:CARGO_BUILD_JOBS = '2'
$env:VANTARE_SIN_GRAFICOS = '1'
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo fmt --manifest-path native/overlays-rune/Cargo.toml --all -- --check
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo clippy --locked --jobs 2 --all-targets --manifest-path native/overlays-rune/Cargo.toml -- -D warnings
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo test --locked --jobs 2 --all-targets --manifest-path native/overlays-rune/Cargo.toml
```

`--jobs 2` conserva el límite aunque la cola herede otro valor Machine.
La cola asigna un target persistente en D:. Los perfiles dev/release no tienen
símbolos de debug. La CI alojada usa `windows-latest` y `RUNNER_TEMP`, formato,
Clippy, tests CPU, compilación sin ejecución y el auditor de licencias trasladado
del Hub por el PR 1. El auditor rechaza MPL-2.0, licencias desconocidas,
`ogg-audio` y dependencias de producto UI/runtime. Se ejecuta con:

```powershell
python native/overlays-rune/scripts/check_dependencies.py
```

Los tests de Rune usan únicamente `Runtime::new/frame` para layout CPU.
La defensa de entorno se prueba con valores inyectados, sin mutar el entorno
global ni arrancar el producto. Ningún test crea un Painter ni dispositivo.
Las capturas y mediciones de aceptación esperan al PC de juego; el Mac solo
sirve para compilación e iteración. No se abren ventanas delante de Isaac.

## F0 manual pendiente: PC de juego, únicamente en el horario de Isaac

No se ha ejecutado esta prueba. El orquestador dará la hora antes de iniciar
cualquier ventana. Fijar VANTARE_NATIVE_DATA_ROOT absoluto, LOCALAPPDATA y APPDATA
a carpetas QA vacías y separadas de los datos del usuario. Preparar una carpeta
QA con núcleo y ejecutable Rune hermanos;
usar `--overlays-bin` del supervisor existente y fuente `local`, sin cuentas ni
datos reales. La prueba comprueba:

1. Un HWND por monitor, límites físicos y DPI 100/125/150, incluidos orígenes negativos.
   El DPI por monitor depende del parche winit de la copia Rune fijada al commit
   d5338988; verificarlo en ese PC de juego, incluidos monitores con escalas distintas.
2. Clics y teclado llegan al juego; foco y ventana activa no cambian al iniciar.
3. Siempre encima, sin entrada en Alt-Tab o barra de tareas; OBS y VRR pendientes de prueba real.
4. Inicio oculto sin flash. La presentación desde el Hub espera el lector compartido.
5. Cerrar el supervisor termina todas las ventanas y el proceso; repetir con el padre vivo y cierre local.
6. Registrar fallos nativos y consumo/frames de reposo. Los contadores de presentación y los widgets llegan en PR 6/7.
7. Conectar/desconectar monitores, reordenarlos y cambiar resolución/DPI en marcha:
   queda una ventana por monitor, sin activar el Hub ni robar el foco. Comprobar
   que una retirada interna no termina el proceso y que reconectar vuelve a crear
   la superficie. Repetir con nombres duplicados, 100/125/150 y orígenes negativos.
8. Cerrar el supervisor mientras cambia la topología: no quedan procesos, lectores
   ni ventanas huérfanos. La prueba física de #2346 es requisito antes de F2.

Los tests CPU prueban la descripción de las ventanas, el EOF/cancelación con
pipes anónimos reales, los derechos con reloj inyectado y 30 s virtuales del
marco quieto. No prueban foco, GPU, OBS, VRR ni presentación en pantalla.
