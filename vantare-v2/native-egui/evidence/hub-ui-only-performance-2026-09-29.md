# Medición preliminar de UI en reposo · 29/09/2026

## Resultado

En este PC, el Hub Rust/egui con el backend **predeterminado de wgpu** consume de forma sostenida prácticamente **un núcleo de CPU** incluso en reposo. No es un efecto del diseño del Hub: se reprodujo en una ventana eframe vacía. Al seleccionar `WGPU_BACKEND=opengl`, el mismo Hub baja por debajo de la resolución de esta muestra de CPU (0,0 % durante 10 s) sin cambiar componentes ni añadir dependencias. El experimento alternativo con `eframe::Renderer::Glow` también descansó, pero exige habilitar otra función/dependencias. La rama conserva wgpu y no fija aún un backend productivo.

| Variante, 1920 × 1080 en reposo | CPU, % de **un núcleo**, pasadas | Memoria privada residente USS, MiB, pasadas |
| --- | ---: | ---: |
| Frontend React en Chromium aislado | 3,28 / 1,88 | 247,94 / 248,16 |
| Hub egui/wgpu predeterminado | 99,53 / 99,53 | 133,63 / 134,03 |
| Hub egui/wgpu con OpenGL | 0,00 / 0,00 | 94,37 / 75,04 |
| Hub egui/Glow, **experimento temporal** | 0,00 / 0,00 | 63,97 / 50,68 |

La comparación Glow se hizo en otra secuencia alternada con Chromium (3,13 / 2,97 % de un núcleo; 251,76 / 259,33 MiB USS). Por ello no se debe combinar su cifra con la fila web de la primera secuencia como si fuera una sola ejecución. En wgpu/OpenGL la mediana de las dos pasadas es 84,7 MiB frente a 248,1 MiB de Chromium, **aproximadamente un 66 % menos de USS en este escenario**. Es una diferencia entre prototipos de distinta complejidad, no una estimación de ahorro de la aplicación final.

## Reproducción y controles

Equipo: Windows 10.0.26200, Ryzen 7 3700X (16 procesadores lógicos), Radeon RX 7800 XT, controlador 32.0.31041.1004; también hay un monitor virtual Meta. LMU y OBS permanecieron abiertos, por lo que la carga global varió. La métrica CPU suma el tiempo de los procesos de cada variante y lo divide por tiempo real; **100 % equivale a un núcleo**, no al 100 % del procesador completo. USS suma las páginas privadas residentes del árbol de procesos. Las muestras duran 10 s tras 5–7 s de estabilización y se toman cada segundo. La lectura 0,00 % significa que no se observó tiempo de CPU a la resolución de este muestreo, no consumo literalmente nulo.

El lado web ejecuta el `orbit-home-harness.html` del frontend productivo de `origin/nightly@c4c7a5ce`, `VITE_RUNTIME_MOCK=mock`, reloj fijo, movimiento reducido y transiciones desactivadas; cuenta el árbol Chromium, excluye el servidor Vite. El lado nativo ejecuta el binario Rust optimizado en modo Hub, sin Go ni telemetría. Orden A/B/B/A, con perfil temporal de navegador nuevo por pasada. El arnés actual contiene tres widgets de mini-escenario que el Hub Rust todavía no reproduce, además de otras diferencias visuales. Tampoco es una instancia física Wails/WebView2. Estas cifras **no validan paridad de interfaz, FPS, interacción, overlays, OBS ni el objetivo de reducción de CPU/RAM de Vantare completa**.

Para repetir las dos variantes wgpu tras `cargo build --manifest-path native-egui/Cargo.toml --release`:

```powershell
python native-egui/benchmarks/hub_ui_only.py --seconds 10 --order browser,rust,rust,browser --wgpu-backend opengl --output native-egui/evidence/repeticion-opengl.json
python native-egui/benchmarks/hub_ui_only.py --seconds 10 --order rust,rust --output native-egui/evidence/repeticion-default.json
```

La ventana mínima se construye con `cargo build --manifest-path native-egui/Cargo.toml --example idle_window` y se comprueba con `python native-egui/benchmarks/probe_wgpu_backends.py`. En esa prueba de 5 s: wgpu/OpenGL 0,0 % y 94,0 MiB; Vulkan 100,0 % y 96,9 MiB; DirectX 12 97,8 % y 157,8 MiB. `run_and_return=false` no alteró el consumo de wgpu predeterminado (~100 %), y minimizar tampoco. El experimento Glow habilitó temporalmente `glow` junto a `wgpu` en Cargo y seleccionó `Renderer::Glow`; esos cambios se retiraron después, de modo que el JSON de Glow es evidencia histórica y no corresponde al ejecutable actual.

Datos crudos: [`wgpu predeterminado`](hub-ui-only-wgpu-default-2026-09-29.json), [`wgpu/OpenGL`](hub-ui-only-wgpu-opengl-2026-09-29.json), [`Glow experimental`](hub-ui-only-glow-experiment-2026-09-29.json). Antes de elegir un backend productivo hay que verificar el comportamiento en otras GPU/Windows, el acabado visual y el renderizado de overlays. La siguiente medición de rendimiento válida para la decisión de migración exige fidelidad visual e interacciones equivalentes y un Wails/WebView2 real como base.
