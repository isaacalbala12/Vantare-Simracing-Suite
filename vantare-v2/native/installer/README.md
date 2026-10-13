# Instalador propio (#1591)

Rust/GPUI Windows x64, revisión GPUI compartida del workspace, sin dependencias
externas nuevas. Dos bins fuera del ZIP de aplicación: `VantareSetup.exe` lleva
el ZIP/scripts y `Uninstall.exe`; el desinstalador no lleva el ZIP.
PowerShell 5.1 conserva la autoridad de generaciones, locks, datos y rollback.

`build-installer.ps1` se ejecuta por la cola después de `Build-NativeCandidate`.
Feature `setup-payload` exige las rutas y SHA del paquete final; los gates sin
esa feature no necesitan un ZIP y no producen un instalador distribuible.
`test-installer` equivale a `/DTEST_INSTALLER`: solo registro/accesos QA y raíz
explícita bajo `C:/tmp/ola2/1591-qa`. Nunca distribuir ese binario.

`/S` ejecuta el mismo motor sin GPUI, UAC ni apertura final del Hub. `/D=<ruta>`
preserva espacios/Unicode; un registro previo conserva su InstallLocation.
Salida: 0 éxito, 1 error, 2 sesión/binarios abiertos, 3 downgrade, 4 arranque
pendiente. Cancelación interactiva previa a la transacción devuelve 5.

Los datos se conservan siempre en `generations/<id>/data`; no hay borrado.
Escritorio ON/autostart OFF por defecto en interactivo; OFF/OFF en instalación
silenciosa nueva. Preferencias existentes se conservan al reinstalar.
Sin firma Authenticode: `publish-beta.ps1` mantiene la firma Ed25519 del feed.
