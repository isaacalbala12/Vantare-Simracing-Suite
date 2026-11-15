# Overlays Rune · VANTA-144 / #2333

Base del PR 4 de [ADR 0110](../../docs/adr/0110-overlays-en-rune.md).
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

El ejecutable todavía devuelve error: el proceso, el supervisor y las ventanas
corresponden al PR 5 tras el traslado de tipos compartidos a domain/ipc (PR 3).
No se anuncia soporte de widgets, preview ni captura en esta base.

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
