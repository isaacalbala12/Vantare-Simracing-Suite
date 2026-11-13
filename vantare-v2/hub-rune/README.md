# Hub Rune · VANTA-143 / #2256

Vía paralela de desarrollo según ADR 0108. Workspace independiente de native;
no cambia los overlays, Electron ni la distribución. Ejecutable:
`vantare-hub-ui-rune`. El primer paso solo abre una ventana vacía.

Rune y sus cuatro parches están fijados a
`d5338988a7c1b3377adb60853815b6d0843dae7c`, Rust 1.99.1. Se conservan los
features por defecto salvo `ogg-audio`: el Hub no reproduce OGG y sus codecs
MPL-2.0 están prohibidos por decisión del orquestador. No activar defaults.

## Comprobaciones

Windows servidor: **nunca ejecutar el binario**, ni `--snap`, `--frames`,
`--video` o `--tree`. Compilar solo por la cola, desde `vantare-v2`, con
`RUSTUP_TOOLCHAIN=1.99.1`, cuatro jobs y targets persistentes del slot en D:.

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

El test Rune usa únicamente Runtime/frame, sin GPU. No ejecutar el test desde
un binario de aplicación ni añadir opciones gráficas en CI. El workflow propio
Windows no es obligatorio y los cambios solo en hub-rune no lanzan gates nativos.

La apertura y capturas se hacen en el Mac. La biblioteca hub-host se consume
directamente; no se copia el contrato. Pasos siguientes: sistema de diseño,
marco, conexión y anfitrión de escena, estado del núcleo y Roadmap de solo lectura.
