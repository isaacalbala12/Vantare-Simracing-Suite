# Pruebas Rune — VANTA-141 / #2213

Workspace independiente; no se añade como miembro del producto.
Rune y sus cuatro parches se fijan a d5338988a7c1b3377adb60853815b6d0843dae7c.
Rust 1.99.1 se selecciona aquí; el producto conserva 1.95.0.

**Servidor: solo compilación y tests Runtime. No ejecutar el binario ni las
opciones --snap/--frames/--video/--tree: inicializan gráfica.**

Desde vantare-v2, por la cola del checkout:

```powershell
pwsh -NoProfile -File native/scripts/compilar.ps1 rustup run 1.99.1 cargo build --manifest-path native/pruebas-rune/Cargo.toml --release --locked --timings --target-dir D:/VantareServer/targets/rune-vs-gpui/hola -j 2
```

Perfil Release común: opt-level=3, lto=false, codegen-units=16,
incremental=false, debug=false. La medición limpia desactiva sccache y usa un
target vacío dedicado; las siguientes compilaciones reutilizan ese target.
