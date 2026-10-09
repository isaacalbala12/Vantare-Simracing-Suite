# Soporte de compilación

`embed()` conserva el recurso Win32 ID 1 del icono, compilado con el Windows SDK.
Dependencia de build de Hub, UI y Admin, sin dependencias externas.
La ruta del icono se calcula respecto al `CARGO_MANIFEST_DIR` del consumidor;
en targets distintos de windows-msvc no añade recursos.
