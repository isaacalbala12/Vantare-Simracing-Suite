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
`--start-hidden` crea las ventanas ocultas. Relative Vantare está conectado; el modo captura corresponde al PR 7.
El arreglo de conectar/desconectar monitores está en
[#2346](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/2346)
(padre #2333); su comprobación física sigue siendo obligatoria antes de F2.

`monitores.rs` mantiene un controlador `App::windowless`: no es otra ventana
oculta ni una superficie gráfica. Conserva el proceso cuando se retira el último
monitor. Un observador Windows consulta la topología una vez por segundo mediante
`EnumDisplayMonitors`/`GetMonitorInfoW` y el mismo DPI efectivo que winit de la
copia fijada. Solo publica cambios; una consulta idéntica o reordenada no despierta
la GUI. Si un monitor no se puede leer (límites o DPI), se considera ausente y
se siguen leyendo los demás. Si falla la enumeración global, conserva la última
topología; tras cinco segundos de fallos consecutivos registra un aviso claro,
sin cerrar los overlays en carrera. El aviso sale una vez por racha y se rearma
al recuperarse. Una enumeración completada sin monitores publica la lista vacía.
Las ventanas se identifican por HMONITOR, con generación al abrirlas; los nombres
duplicados no son claves. Cambiar límites/DPI recoloca la ventana existente;
un cambio solo de `primary` actualiza metadatos y no solicita `place`.
retirarla marca su cierre como interno y elimina su waker al destruir el estado.
El cierre del usuario o supervisor sigue cerrando todo. El observador cancela su
espera antes del join; no tiene un sueño de un segundo que bloquee la salida.
Una comprobación única tras abrir detecta errores de creación, sin reloj de GUI
en reposo. Diseño, fotos y cadencias no se modifican en este arreglo (Worker A).
En Mac/Linux se conserva por ahora la topología inicial; la aceptación es Windows.
El sondeo a 1 Hz es provisional. La alternativa por eventos es observar
`WM_DISPLAYCHANGE` / `WM_DPICHANGED`; no se cambia a ella dentro de estos nits.

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

### Diseño, fotos y cadencias compartidos

La CLI acepta `--layout RUTA`; sin ese argumento lee `ipc::layout::default_path`.
El documento se abre y vigila con `ipc::layout::Document`, sin inicializarlo ni
reescribirlo: un archivo ausente o vacío deja el host vacío hasta que el Hub lo
edite. Los errores posteriores conservan el último diseño válido y se reintentan.
`Presentation` sigue las nuevas solicitudes de mostrar/ocultar; una solicitud
vieja no se repite al reabrir. Las ventanas respetan inicio oculto y no solicitan
foco al mostrarse. La topología en caliente es la implementación de B (#2356); sus cambios
actualizan el viewport lógico y conservan la foto y la visibilidad vigentes.

`feed::DataFeed` posee un lector con cierre y join. Consume `source::layout_feed`
y `DemandHandle` en el pipe; `local` usa la misma fuente sintética de IPC.
El sondeo de documentos/apariencia ocurre cada 500 ms fuera del render; no pide
un frame si nada cambia. Las esperas del receptor se acotan a 50 ms para cerrar
sin esperar una nueva foto. Al salir se suelta el receptor y el transporte IPC
cancela su lectura. No se añade ninguna dependencia externa directa.

`scene::FrameSet` es el contrato de los pintores: diseño, fotos aceptadas por ID,
visibilidad y movimiento reducido. `domain::performance::Cadence` filtra cada
instancia antes de publicar su foto; se usa la misma identidad época/fuente.
Las fotos que no cubren la demanda vigente se descartan. Derechos, «Mostrar en»
y fuera de pista conservan sus reglas de domain/ipc; los filtros de sesión siguen
pidiendo la señal que permite volver a mostrarse. El permiso actual se contrasta
otra vez al enumerar instancias para no dibujar tras una revocación.
La precedencia es diseño v2, después apariencia legada. La geometría del monitor
convierte origen/tamaño físicos a lógicos igual que el backend Windows GPUI.

Relative Vantare es el primer pintor conectado. Conserva proyección de domain,
plantillas y orden de columnas personalizado, tonos Neo/Neutro, acentos, idiomas,
banners, tráfico, boxes y tira de pista. Solo adquiere datos de Looks migrados;
Relative Eficiencia corresponde al PR 7. Las campañas numéricas siguen rechazadas
hasta el modo captura del Worker B; un diseño normal puede tener diez Relative.
La paridad visual y el consumo real esperan a la comparación en el PC de juego.

`src/vantare` usa las fuentes del producto y los tokens del JSON canónico de UI.
`python tools/generar_vantare.py --check` verifica los tokens Rust generados;
regenerar sin `--check` al cambiar el JSON. No hay segundo parser ni librería nueva.
La CI se activa también al cambiar esas fuentes o estilos.

Textos, tintas, posición y opacidad se conservan en valores Rune `Live`. Solo los cambios de estructura o de texto que alteran el ancho intrínseco
(nombre/detalle/dorsal/cabecera) recomponen la vista; las celdas de ancho fijo
se actualizan sin reconstruirla. Los movimientos de filas, aparición y
flash tienen fin; una actualización de texto no reinicia su duración. El pulso de
tráfico es la excepción al reposo: mientras haya tráfico rápido mantiene un reloj
a la cadencia del widget (0 Hz usa 30 Hz). Reducir movimiento apaga ese pulso y
lleva las transiciones a su destino. Sin tráfico ni transiciones no hay reloj.

`relative::scene` es el contrato común de Vantare y Eficiencia: filas de domain,
posición interpolada, opacidad y aviso semántico con intensidad independiente.
`slot` es una coordenada del layout canónico, no un índice. Ese layout entrega
las posiciones objetivo a `Motion::update`, incluida la banda superior. El
muestreo es puro; no contiene colores ni valores Rune Live. El Look
traduce esa escena a sus medidas/colores y conserva sus valores Live. El pulso
(`traffic_opacity`) y el destello (`alert`) tienen intensidades independientes
y se superponen como en GPUI.
Tras `update` o `policy`, llamar a `advance` con los mismos datos e instante
antes de `visual_rows`/`sample`; el muestreo no avanza el estado.
La reconstrucción se decide en un solo punto al comparar la estructura anterior
y la nueva; las actualizaciones de valores de ancho fijo no reconstruyen.
La [plantilla de encargo](PLANTILLA.md) fija qué reutilizar para los otros widgets.

Al cerrar se imprimen contadores por ventana y del proceso: `frames`, `data`,
`animation`, `design` y `unattributed`. Se incrementan exclusivamente en
`on_frame_drawn`, después de presentar. Una imagen puede tener varias causas:
no se suman para calcular `frames`. Las solicitudes y vistas descartadas no
cuentan como imágenes. Los tests CPU comparan todos los campos del flujo de dibujo antes de simular
el aviso; el booleano de Runtime::frame solo indica animación en curso. No miden presentaciones
GPU ni sustituyen la campaña del PC de juego.

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
4. Inicio oculto sin flash. Las nuevas solicitudes de presentación del Hub muestran/ocultan sin activar.
5. Cerrar el supervisor termina todas las ventanas y el proceso; repetir con el padre vivo y cierre local.
6. Registrar fallos nativos y consumo; con Relative Vantare quieto, cero frames nuevos en 30 segundos tras asentarse. Con diez Relative, comprobar cadencia y contadores por causa; sin transiciones, no superar el widget visible más rápido.
7. Conectar/desconectar monitores, reordenarlos y cambiar resolución/DPI en marcha:
   queda una ventana por monitor, sin activar el Hub ni robar el foco. Comprobar
   que una retirada interna no termina el proceso y que reconectar vuelve a crear
   la superficie. Repetir con nombres duplicados, 100/125/150 y orígenes negativos.
8. Cerrar el supervisor mientras cambia la topología: no quedan procesos, lectores
   ni ventanas huérfanos. La prueba física de #2346 es requisito antes de F2.
9. Apagar o desactivar TODAS las pantallas y volver a activarlas: el proceso
   sigue vivo con el controlador sin ventanas y las superficies vuelven.
10. Cambiar resolución o DPI justo después de conectar un monitor: comprobar
    que no se pierde la petición `place` anterior a la creación de la ventana.


Los tests CPU prueban la descripción de las ventanas, el EOF/cancelación con
pipes anónimos reales, los derechos con reloj inyectado y 30 s virtuales del
marco quieto. No prueban foco, GPU, OBS, VRR ni presentación en pantalla.


## Captura ampliada: corte A (debug, sin ventana)

La captura usa `constructor()` del registro, `Widget::update` y el mismo pintor,
fuentes y ajustes del producto. No usa núcleo, derechos, feed, monitor ni sonido.
El guard `VANTARE_SIN_GRAFICOS=1` sigue siendo la primera operación del ejecutable;
no ejecutarlo en el servidor aunque Offscreen no abra ventana: requiere GPU.

```sh
vantare-overlays-rune --capture-scene --layout scene.layout.json --instance variant --snapshot photo.json --output scene.png --scale 1.25
vantare-overlays-rune --capture-scene --widget relative --settings settings.json --sequence photos.tsv --at-ms 500 --motion true --wall-ms 1767225600000 --output sequence.png
```

`--layout` exige una instancia o un `--instance` existente. La alternativa
`--widget KIND --settings archivo.json` admite el objeto Settings completo o
sus ajustes sin `kind`, validados por el mismo lector IPC. No combinar orígenes.
Se ignoran posición y resize del layout: el PNG usa el tamaño natural del widget.
`--snapshot` y `--sequence` son excluyentes; sin foto no hay demo implícita y se
responde `NO_DEMO` (no hay demos incorporadas). F prepara las entradas canónicas.

TSV: una fila `t_ms<TAB>ruta.json`; las rutas relativas parten de su directorio.
Tiempos enteros no decrecientes, empates en orden de archivo; cada foto llega
una vez a update aunque `sequence` se repita o retroceda. `--at-ms` no puede
preceder la última foto y por defecto vale su instante. El reloj es virtual,
incluye animate/schedule/Runtime y no usa settle_all. `--motion false` es el
valor por defecto; `--motion true` muestrea el movimiento en el instante pedido.
`--wall-ms` fija solo Avisos antes del primer update; su valor por defecto es
1767225600000 (2026-01-01T00:00:00Z), nunca la hora de la máquina.

Cotas: 60 s/10 000 pasos, 256 fotos/64 MiB de entradas fotográficas en total,
8 MiB por foto, 1 MiB para layout/ajustes/TSV. Escalas 1/1.25/1.5; dimensiones
round(size_for(Some(foto)) × escala), entre 1 y 4096 por eje y RGBA ≤64 MiB.
Un PNG RGBA transparente por llamada; se acepta un widget realmente vacío.

Contrato del código de proceso y primer token de stderr (detalle humano después):

| Código | Token | Caso |
| --- | --- | --- |
| 0 | OK | PNG completo |
| 2 | INVALID_INPUT | Flags/JSON/tiempos/cotas/widget no soportado |
| 3 | NO_DEMO | Sin demo canónica disponible |
| 4 | GPU_UNAVAILABLE | Sin adaptador/dispositivo |
| 5 | CAPTURE_FAILED | Assets/render/lectura/PNG/E/S/salida existente |
| 6 | GRAPHICS_DISABLED | Guard de máquina, antes de argumentos/hilos/GPU |

Este corte mantiene **solo debug**; Windows debug conserva consola, Release sigue
con windows_subsystem. El corte B habilita Release y completa assets/cierre y PNG
con create_new real. A añade capture_images (volante, mismos handles que view)
y set_wall_base (solo Avisos); el host de producción no usa esos hooks.
Aún no se adjunta una caché en captura: un widget con assets puede verse incompleto.
El PNG de A conserva la carrera exists/escritura de #2391; usar rutas distintas.
El .capture.txt sí usa create_new. El guard no se desactiva en servidor.
Tests de A solo CPU; el PNG y el cierre GPU se verifican en PC autorizado.
E monta v46 encima de esta CLI; alimentador/reproductor QA y medición de F aparte.
