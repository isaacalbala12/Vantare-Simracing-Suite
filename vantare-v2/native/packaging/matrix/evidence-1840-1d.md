# Paso 1d · evidencia (1-nov-2026)

VANTA-127 / #1840. Base final nightly 5bf636ef0. Paso 0 y 1a integrados por el
orquestador; 1b/#1847 y 1c/#1850 se revisan por separado. Sin merge/release del worker.

El Hub usa SetStartup de la generación instalada. Comparte el enlace Startup
y las opciones del instalador, sin crear valores Run nuevos. El proceso se posee,
espera con timer asíncrono y tiene plazo de 30 s; al cancelar se termina/recoge.
GPUI persiste autostart en installer-ui.json y actualiza su proyección en memoria
sin reescribir data/. Las instalaciones antiguas conservan la preferencia General.
Si esa escritura falla, se intenta restaurar el inicio anterior y se muestra el
error; no se pisan otras preferencias modificadas mientras responde el comando.

SetStartup valida referencia/manifiesto, identidad, ubicación y opciones/PE del
desinstalador. La CLI exige el script activo. Un acceso ajeno se conserva; si
guardar opciones falla se restauran bytes del enlace/opciones. El valor Run
legado se retira solo para la identidad validada, preservando otros valores.
Desinstalar hace lo mismo, también cuando se reanuda con registro ya retirado:
ese caso exige marker ligado por hash e identidad/carpeta del instalador.

- `startup-1d-01`: 11 checks, recorrido inicial instalar/activar/desactivar/
  desinstalar y rechazo de enlace ajeno, PASS.
- `startup-1d-02`: 13 checks; añade recuperación sin registro, PASS.
- `startup-1d-03`: 14 checks; añade fallo real inyectado de escritura de opciones
  después de cambiar el enlace y exige restaurar sus bytes exactos, PASS.
- `matrix-1d-01`: 88/88 contra baseline +54 inventario +13 Startup PASS. Tras
  añadir solo el caso de fallo del arnés se repite el hook final con 14 checks;
  los scripts de producto no cambian por esa adición. Hook final
  `matrix-1d-hook-01`: Probe +54 inventario +14 Startup PASS.
- Hub completo, todos los targets, sobre f8ccb1689: **586/586 PASS**, cuatro
  omisiones previas, 223,942 s. Incluye opciones Startup, fallo/plazo del comando,
  Drop/cancelación y arquitectura. Clippy all-targets -D warnings y fmt PASS.
  El primer diseño guardaba la tarea en Settings y excedía el techo del constructor
  en una línea; ahora la posee el Store de preferencias, sin subir techos ni lints.

Clippy all-targets -D warnings y fmt repetidos sobre 5bf636ef0: PASS. Parseo
PowerShell, fragmento, calidad/retirada (466 huellas) y diff --check: PASS.
Los 88 resultados coinciden con baseline y los tres scripts coinciden byte a byte
con la copia de QA usada en matrix-1d-01; el handoff conserva todo lo ajeno.

La prueba usa el driver real y la misma CLI que invoca el Hub, con PE inertes y
root con espacios; no pulsa una ventana física. HKCU y carpetas se inyectan en
padre, driver y CLI, y TEMP/TMP/LOCALAPPDATA se fijan antes de crear hijos. Datos
y carpetas vacías se comparan realmente; valores ajenos y accesos ajenos quedan
intactos. Ningún Setup/Uninstall EXE ni aplicación real se ejecuta.

Evidencia bajo D:/VantareServer/qa/isa-1840. Target D:/VantareServer/targets/isa-1840,
compilación por cola/jobs2. Sin dependencia nueva ni cambios propios de runtime,
domain, ipc o testdata: telemetría omitida. QA física en cuenta/VM independiente
pendiente. Plane intacto; CI y siguientes estados a cargo del orquestador.
