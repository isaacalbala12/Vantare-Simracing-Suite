# Relative Rune de medición · VANTA-141 / #2213

No ejecutar este binario en el servidor, tampoco para consultar versión.
La interfaz queda pendiente de comprobar en el PC con gráfica de Isaac.

Usa el mismo `vantare-ipc::Subscriber` y la proyección canónica
`vantare-domain::relative::project_cached` que GPUI. La demanda compartida
conserva los 33 ms del Relative real; `sent` cuenta las escrituras completas
al pipe, `received` las entregas al consumidor y `origin` las publicaciones
internas completas para latencia. Las omisiones por cadencia no son pérdidas.

Una ventana overlay contiene 1, 4 o 10 widgets Relative. Conserva las fuentes
Inter estática, Rajdhani y Space Mono por celda, copiadas de los mismos ficheros
que incrusta GPUI; hashes en `assets/fuentes-sha256.json`, licencias incluidas.
El tamaño, columnas y tokens proceden del Relative Vantare estándar. El
historial de movimiento es una copia de las funciones puras del producto.
Se mantienen las claves por coche y las celdas LiveText entre fotografías.

El compositor registra `encoded` después de codificar el dibujo. NO se llama
`submit`: no es el instante DXGI Present ni demuestra latencia hasta pantalla.
El análisis requiere un cruce no ambiguo con PresentMon y debe conservar
las marcas y CSV originales. La validación física y ese cruce forman parte
del kit pendiente; no se atribuyen resultados de rendimiento a estos tests.

CLI del PC de juego: `--medicion-relative 1|4|10 --fuente pipe:NOMBRE
--control-stdin`. Cerrar stdin pide cierre ordenado y vacía el registro.
`VANTARE_MEASUREMENT_EXCLUDE_CAPTURE=1` solicita la exclusión mediante Rune;
OBS y las zonas pulsables se comprueban manualmente en el PC.

Verificado en Mac: 10/10 tests de Runtime y movimiento, Release; misma
cantidad y textos que la proyección, huecos sin reconstruir vista y claves
estables al reordenar. Ningún Runtime de test crea una ventana o dispositivo.
Fuente compilada Windows: `5b45c86119530c3d13b750e2d85e12d88c85e9a1`.
Rust 1.99.1; Rune y cuatro parches fijados a
`d5338988a7c1b3377adb60853815b6d0843dae7c` en este workspace aparte.
Perfil común: opt-level=3, lto=false, codegen-units=16, debug=0.
Cruce cargo-xwin: 48,97 s (incremental, NO medida limpia), 29.329.920 bytes;
SHA256 `efc0cfaccc8272acd63ae8194e1a649d8439c00e6223cdf78cd64b379352d2b3`.
Procedencia comprobada leyendo el PE. Dumpbin solo exige DLL de Windows y
VCRUNTIME140.dll, cuya copia redistribuible ya está preservada para el kit.

Target único del Mac: `~/target-isa-2213-rune`. Solo Release, debug=0 también
en dependencias, una compilación a la vez. Mínimo autorizado 10 GiB;
el guardián para a 10,25 GiB con comprobación cada 0,5 s. Compilación Windows:
`python3 compilar_mac.py --log RUTA_NUEVA -- rustup run 1.99.1 cargo-xwin xwin
build --release --locked --offline --target x86_64-pc-windows-msvc
-p vantare-overlays-rune --features medir-latencia -j 4 --timings`

El render visual, segundo monitor, DPI, foco, clics, transparencia y OBS,
la latencia hasta pantalla y el aguante siguen sin verificar hasta el PC.
No hay integración, migración de motor ni release.

## Revisión del pintor 13/11

Fuente 9ac390c75992f1f4db64a7de2e07a6988f7ae93b: incorpora el polígono
de marca del producto, líneas de cabecera, píldora de vueltas a 16 px,
limitador dinámico de boxes y los esqueletos e indicador de espera.
Runtime Release en Mac: 12/12 PASS, incluida activación/desactivación del
limitador sin cambiar de banner. Clippy estricto all-targets PASS.
Windows cruzado Release 24,87 s incremental (no comparable entre máquinas);
29.349.376 bytes, SHA256 438326b048bc641d4e74f421dfce79e4975ba3267c7be2de2d3c890ca07e05de.
Mínimo libre de esta compilación 10,9477 GiB; ningún límite vulnerado.
PE/procedencia y dumpbin comprobados; dibujo físico pendiente del PC.
