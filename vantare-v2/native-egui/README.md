# Primer corte Rust + egui de Vantare

Tarea [VAN-779](https://app.notion.com/p/3e9e51695c6581fabd90d1e7efc3ad13), puente técnico [#1414](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1414). Esta carpeta es una prueba aislada del nuevo frontend para Windows. La app productiva actual continúa en Go/Wails/React durante la migración.

## Referencia visual

`evidence/hub-reference/inicio-1920x1080.png` y `inicio-1920x900.png` fueron generadas con `pnpm --dir frontend visual:orbit-home` desde `origin/nightly@c4c7a5ceb60995db191078aca03085a1e56a063e` el 29/09/2026. La ruta usa `orbit-home-harness.html`, `VITE_RUNTIME_MOCK=mock`, reloj fijo `2026-07-07T18:07:30Z`, dispositivo a escala 1 y perfil de prueba. Es una captura del frontend productivo con datos simulados controlados; no acredita Wails físico, LMU ni cuenta del usuario. La antigua `docs/design/orbit-v03/evidence/inicio.png` es un prototipo y difiere del código actual.

SHA-256 de 1080: `c89c29c8e4e1451d1d801d9d849f9f3cc855e82b9eb02b26d073cfd0cf0ba854`; de 900: `f7b05cc4b8aaf42c8c9e1221b9cfcc805e1dbdb5fb844381ff6e0b1fb4110db9`.

## Ejecución

```powershell
cargo run --manifest-path native-egui/Cargo.toml --release -- --mode hub
```

Para Standings, iniciar aparte el host Go aislado de la [prueba #1411](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1411), que publica la captura LMU sanitizada mediante el proyector Overlay V2 productivo. Copiar la URL local que imprime y usar:

```powershell
cargo run --manifest-path native-egui/Cargo.toml --release -- --mode standings --endpoint http://127.0.0.1:<puerto>/telemetry/overlay-v2/projection
```

La ventana Standings consume exclusivamente `127.0.0.1` o `::1`. Rechaza otra ruta o dirección. El transporte mantiene solo la proyección más reciente para dibujar; no se usa para grabar muestras. Una conexión caída se reintenta y el estado visual se marca obsoleto a los tres segundos. La fuente Go de la prueba #1411 procede de captura real sanitizada pero estática; no es una sesión LMU actual.

`assets/Inter-Variable.ttf` se convirtió del Inter WOFF2 ya versionado en `frontend/src/assets/fonts/orbit` con FontTools 4.66.0; `CascadiaCode.ttf` se copió del mismo directorio. Sus licencias OFL están junto a los assets.

## Estado y límites

- La ventana Hub reproduce una parte de Inicio y abre la paleta con clic o Ctrl+K. Usa Inter y Cascadia de la app actual, pero aún contiene datos de prueba, iconos provisionales, un mini-lienzo vacío y efectos incompletos; no es una réplica exacta.
- La ventana overlay dibuja diez filas del diseño Efficiency y recibe valores y calidades de Go. Falta paridad completa de cabecera, tipografía, columnas y comportamiento de Studio.
- En Windows se comprobaron físicamente la transparencia, el paso de clics y la ausencia de activación del overlay con una ventana de prueba situada debajo; véase [`evidence/windows-overlay.md`](evidence/windows-overlay.md). DPI y captura OBS siguen pendientes.
- La [medición preliminar de UI en reposo](evidence/hub-ui-only-performance-2026-09-29.md) detectó un núcleo de CPU ocupado con wgpu predeterminado en este PC; wgpu/OpenGL evitó ese consumo en el Hub actual. El Hub se cierra durante el juego según el flujo actual indicado por Isaac, así que la prioridad de rendimiento es medir el overlay activo. La comparación no tiene todavía paridad visual ni base Wails física.
- El objetivo siguiente es medir diferencias contra la referencia de este directorio y corregirlas antes de ampliar pantallas.

La comparación visual inicial está en [`evidence/hub-fidelity.md`](evidence/hub-fidelity.md). La captura nativa actual es una línea de base deliberadamente no aceptada: el objetivo de esta tarea sigue siendo copiar exactamente el Inicio productivo congelado arriba.

Validación local del primer corte: `cargo fmt --check`, `cargo test` (2/2), `cargo clippy --all-targets -- -D warnings` y `cargo build --release` aprobados en Windows. La compilación optimizada en frío tardó 10 min 49 s en esta máquina; esto es tiempo de build y no una medida de consumo en ejecución.
