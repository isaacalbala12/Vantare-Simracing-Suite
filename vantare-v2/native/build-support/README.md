# Soporte de compilación

`embed()` conserva el recurso Win32 ID 1 del icono, compilado con el Windows SDK.
Dependencia de build de Hub, UI y Admin, sin dependencias externas.
Runtime usa `embed_binary("vantare")` para incrustar ICON1 solo en el supervisor,
sin añadir el recurso a sus herramientas CLI. La prueba `runtime/tests/windows_icon.rs`
inspecciona el PE construido y compara cada imagen con `assets/icon.ico`.
La ruta del icono se calcula respecto al `CARGO_MANIFEST_DIR` del consumidor;
en targets distintos de windows-msvc no añade recursos.
