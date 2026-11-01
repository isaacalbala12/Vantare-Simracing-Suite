> La sección inicial conserva la entrega anterior a revisión (base5bf636ef0).
> Su guardado General para legacy fue sustituido: la revisión vigente está al final.
> Base nueva843913d24, 1c integrado y CI5/5 confirmado por el orquestador.

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

## Revisión sobre 1c integrado

Register y Setup migran únicamente Run con comando propio validado: host/File/Root
de beta.ps1 exactos, o Hub bajo esta raíz. El mismo nombre con otro comando se
conserva. Sin preferencia se adopta ON, con una previa se respeta. Installer UI
prevalece; legacy persiste startup-options.json {schema:1,autostart:bool} en raíz.
No se inventa un desinstalador GPUI ni se escribe data/general.json. El Hub carga
y adopta una migración posterior desde ese documento, sin reescribir General.

Sync-NativeRegistration y SetStartup poseen .operation.lock; Setup incluye opciones
y registro en la misma sección. Rollback usa el lock existente y solo repara un
acceso existente. Dos barreras comprueban Register antes/después de tomar el lock:
la preferencia OFF del usuario no se resucita y las escrituras no se intercalan.
Run se retira antes de crear Startup; con bootstrap raíz congelado se conserva
un acceso PowerShell compatible. El nuevo motor sigue usando el script activo.

Uninstall retira la Run válida solo tras finalizar correctamente programa/estado.
Si falla el borrado de Run, avisa y completa el resto; no aborta ni muestra un
falso cierre de app. Recuperación sin registro sigue ligada al marker/hash y a
la identidad/carpeta del instalador. Un valor ajeno con el mismo nombre se conserva.

El Hub posee el hijo, con plazo30s y cancelación/recogida. Solo desactiva el
interruptor Startup y muestra progreso; el resto de toggles sigue guardándose.
Al finalizar cambia solo el campo startup en memoria, conservando otros cambios
y sus errores. El poll adopta la preferencia creada por Register tras Store::load.
Tests Hub prueban carga GPUI sin crear/reescribir general.json, adopción legacy,
prioridad de installer-ui y habilitación independiente de otros controles.

Gates finales en curso: matrix-1d-review-03 y rust-1d-review-01. El baseline se
calculó a partir de las 88 capturas previas: solo candidate/beta en240 copias y
26 nuevos .operation.lock vacíos, en52 filas. Se conserva formato y se verifica
contra ejecución sin Record; no se cambia normalización ni invariantes.

Ensayos intermedios conservados:
- startup-1d-review-01 se detuvo porque la tercera reparación de fixture tenía
  arranque pendiente. Ahora Confirm-BetaBoot real confirma cada reparación con
  proceso inerte; no se relaja la guarda de producto.
- review-02 pasó33, pero cmd/more de la fixture imprimió un error de dispositivo;
  se sustituyó por PowerShell leyendo el pipe y review-03 pasó33 sin ese ruido.
- review-04 falló en una comparación de rutas con separadores distintos del test
  de bootstrap congelado. El assert usa GetFullPath; snapshot mantiene bytes exactos.
- matrix-1d-review-01 es preliminar, anterior al ajuste de compatibilidad del
  bootstrap raíz congelado. No acredita producto final; se sustituye por review-03.

Todo el arnés se copia a QA. Padre, driver y CLI remapean HKCU a UUID propio,
resuelven Programs/Startup/Desktop a carpetas de prueba y heredan entornos QA.
No se ejecuta Setup/Uninstall EXE ni una ventana física de producto. Se conservan
Root/Library de1b, registration-status de1c y hashes LF por política del repo.
Sin cambios propios de runtime/domain/ipc/testdata; telemetría/lifecycle runtime
omitidos por ámbito. Sin merge/release, cambios Plane, secretos o Downloads.

El ajuste final de P3-1 difiere Run hasta después de toda la finalización, no solo
los binarios. Beta anuncia defer-run-v1 y acepta KeepLegacyRun cuando el wrapper
exterior se encarga de retirar registro/accesos/metadatos; el wrapper no pasa ese
flag a bootstraps congelados sin capacidad. La prueba fuerza fallo del finalizador
exterior después de retirar programa: conserva Run/datos y el driver reanuda y
termina. startup-1d-review-05:35/35 PASS con ese recorrido, bootstrap congelado,
ambas carreras y borrado Run denegado. matrix-1d-review-02 precede a ese ajuste y
no acredita código final. Se completa review-03 con los hashes finales LF.
