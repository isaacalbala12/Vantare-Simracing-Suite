# Backend Windows publicado con el delta de Vantare

**Base:** paquete `gpui-pre-windows 0.3.12` de crates.io, requerido por
`gpui-kit 0.9.1` / `gpui-pre-platform 0.3.12`. Snapshot Zed `d2a4fb6`;
Apache-2.0, licencia original conservada. El workspace lo selecciona mediante
`[patch.crates-io]`; no depende del git de Zed.

**Cambios propios:** `vantare.patch` compara los archivos publicados con esta
carpeta. Conserva spans TextLayout/GpuSubmit/Present, cobertura y gamma del texto,
guardas de alfa/sombras/dither, zoom por HWND y la creación oculta de ventanas
de captura fuera de los monitores. Se conserva el `render_to_image` original;
no es un renderer nuevo. DirectWrite de esta versión separa análisis, glifos
monocromos y capas de color: se adaptó allí la misma cobertura y su test.
El manifest solo añade `vantare-profiling` por ruta y aísla este paquete del
workspace principal. El código restante es el paquete publicado.

La feature `paint-stats` incorpora además HWND en los presents y consultas GPU
timestamp/disjoint asíncronas, iguales a las de la referencia de #2013. Solo se
activan con la variable de medición correspondiente. Ocho slots, DONOTFLUSH y
lectura explícita de S_FALSE evitan esperas y resultados sin completar. No se
compilan en el backend de producto por defecto. El módulo nuevo y la feature
también forman parte del patch reproducible.

Con `paint-stats` y `VANTARE_MEASUREMENT_RENDER_LOAD=1`, el modo estrés
omite la espera `DwmFlush` y cede el turno al planificador sin temporizador.
Es una carga deliberadamente saturada: el coste del hilo de pulsos forma parte
del proceso; los spans de pintado y timestamps GPU lo separan del render.
Sin esa variable se conserva la espera del compositor.

**Regenerar al actualizar:** descargar la versión exacta que fije Kit en una
carpeta temporal, comprobar SHA-256 con la API de crates.io y conservar licencia,
`Cargo.toml`, `build.rs` y `src/`. Aplicar `vantare.patch` a esa base (desde
`vantare-v2/`: `git apply --directory=native/vendor/gpui-pre-windows <patch>`).
Revisar cada rechazo contra el delta antiguo; no sustituir el backend publicado
por el antiguo. Regenerar el patch contra el paquete prístino, actualizar este
README, versión y lockfile. Ejecutar caracterización, arquitectura, capturas
reales y la misma campaña de medición antes/después antes de aceptar el porte.

Desde `vantare-v2`, para generar y comprobar el delta tras verificar el archivo
descargado (sustituir la carpeta prístina por la de la versión nueva):

```powershell
python native/scripts/vendor-backend-patch.py --pristine D:/VantareServer/evidence/isa-1996/crates/gpui-pre-windows-0.3.12 --vendor native/vendor/gpui-pre-windows
git apply --check --reverse --directory=native/vendor/gpui-pre-windows native/vendor/gpui-pre-windows/vantare.patch
```
