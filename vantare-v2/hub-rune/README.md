# Hub Rune · VANTA-143 / #2256

Vía paralela de desarrollo según ADR 0108. Workspace independiente de native;
no cambia los overlays, Electron ni la distribución. Ejecutable:
`vantare-hub-ui-rune`. El primer paso solo abre una ventana vacía.

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
El worker espera hasta 250 ms entre lecturas (cuatro despertares/s en reposo,
sin medir aún CPU real); las peticiones salientes lo despiertan inmediatamente.
Las escrituras tienen un plazo de 5 s y las lecturas cancelables de 200 ms.

La apertura y capturas se hacen en el Mac. La biblioteca hub-host se consume
directamente; no se copia el contrato. Pasos siguientes: sistema de diseño,
marco, conexión y anfitrión de escena, estado del núcleo y Roadmap de solo lectura.
