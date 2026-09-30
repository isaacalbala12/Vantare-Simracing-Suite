# Referencias del Hub · ISA-1430

Comparación del corte `6b831395cdb013e443e6396a79615bf2ae030482`, 30/09/2026.
La [matriz](../../../docs/analysis/2026-09-30-hub-paridad.md) distingue
producto Wails, harnesses de demostración en WebView2 y proceso GPUI.

## Ubicación de la evidencia

Por la instrucción expresa del encargo, **ningún PNG, log ni hash de QA se
versiona**. Este directorio contiene el índice y las herramientas; los PNG
solicitados están en:

```text
C:/tmp/isa-1430-hub-referencias-evidence/
  wails-real/     backend Go, sin sesión: login, alta y recuperación
  wails-demo/     componentes productivos con fixtures de los harnesses
  native/         Hub GPUI con archivos locales aislados
  gallery.html    índice visual para abrir en el navegador
  images.json     dimensiones y SHA256 de los PNG
  gates.txt       códigos de salida de fmt, clippy y test
  cargo-*.log     salidas completas, incluidos intentos fallidos
```

Área cliente: **1440 × 900**, DPI de ventana **96 (100 %)**. Los PNG omiten
el marco del sistema operativo en ambos Hubs. No se redimensionaron imágenes
para fingir el tamaño. CDP comprueba también `devicePixelRatio === 1`.
La galería/contact sheet contiene miniaturas; la comparación usa los PNG originales.

Los nombres de la demo están en `tools/demo-states.json`; el resultado de cada
estado, URL, tamaño y hash queda en `wails-demo/manifest.json`. Los nombres de
estados inaccesibles no se sustituyen por imágenes de otra pantalla.

## Reproducción

1. Leer AGENTS, ADR 0099 y el plan. Usar el SHA indicado o registrar uno nuevo;
   esta evidencia no certifica el HEAD de otro worktree.
2. Crear una carpeta de evidencia nueva **fuera del repo**. Para Wails se usó
   una copia de archivos versionados obtenida con `git -C <raíz-git> archive
   --format=tar HEAD`, extraída con `C:/Windows/System32/tar.exe`. Esto evita
   que el build y los datos de la app modifiquen rutas fuera del encargo.
   No copiar `.env*`, perfiles personales ni cachés. Se reutilizaron los
   `node_modules` existentes mediante junctions en esa copia externa; no se
   añadieron dependencias ni se modificó el lockfile.
3. En el frontend de la copia: `pnpm build`. En el directorio Wails de la copia:
   `go build -p 2 -o <evidencia>/wails/vantare.exe ./cmd/vantare`.
   Copiar solo `configs/example-racing.json` a `<evidencia>/wails/configs/`.
4. Arrancar ese binario con `-live=false -profile <copia-del-perfil>
   -http 127.0.0.1:39430`, cwd `<evidencia>/wails`. Antes de arrancar configurar
   `VANTARE_WEBVIEW_DEBUG_PORT=9430`, `VANTARE_WEBVIEW_USER_DATA_FOLDER` con
   una ruta absoluta normalizada propia y `VANTARE_PERFORMANCE_SENSOR=off`.
   No proporcionar credenciales/Supabase: el producto queda sin sesión.
   Redirigir stdout/stderr a archivos externos y guardar su PID.
5. Ajustar la ventana con `capture-window.ps1` (también puede revelar la
   ventana que `Start-Process -WindowStyle Hidden` dejó oculta). Su HWND se
   busca exclusivamente dentro del PID y ejecutable verificados.
6. Capturar el producto con `capture-cdp.mjs` y `real-states.json`. No pulsar
   submit, OAuth, envío de correo ni reset de dispositivo.
7. Para la demo, arrancar Vite en la copia externa con `VITE_RUNTIME_MOCK=mock`,
   host `127.0.0.1`, puerto `51430`. Ejecutar el mismo capturador con
   `demo-states.json`. Navega el único target de **ese WebView2**, sin abrir
   Chromium ni cambiar dimensiones mediante emulación. Los parámetros
   `access=paid`, `updater=pending` y `telemetryDemo=1` son mecanismos de
   demostración existentes. La preparación selecciona Oscuro mediante la UI.
8. En `native/`: `cargo build -p vantare-hub -j 2` (sccache del entorno).
   Ejecutar `target/debug/vantare-hub.exe` con `--data-dir`, `--layout`,
   `--engineer-settings` y `--launcher-file` apuntando a rutas nuevas dentro
   de la evidencia, y `--pipe isa1430-visual-reference-no-producer`.
   No iniciar núcleo, juego, overlays ni aplicaciones del Launcher.
9. Ejecutar `capture-native.ps1` con ese PID y ruta exacta del ejecutable.
   Sus coordenadas pertenecen a este corte y DPI: revisar las capturas si
   cambia la navegación. Workshop usa el fixture distribuido `lmu47`; no es
   telemetría live. Studio añade un Standings únicamente al layout aislado.
10. Cerrar los procesos de esta sesión antes de ejecutar tests: Windows
    bloquea un `.exe` abierto cuando Cargo intenta reemplazarlo. Para una
    captura adicional puede usarse una copia del ejecutable en la evidencia.
    Conservar stderr y verificar que Wails/WebView2 y Vite propios han salido.

Ejemplos (sustituir PID y directorio de dependencias; redirigir las salidas):

```powershell
./native/hub/reference/tools/capture-window.ps1 -ProcessId 1234 `
  -ExpectedExecutable C:/tmp/mi-evidencia/wails/vantare.exe `
  -OutputPath C:/tmp/mi-evidencia/wails-real/cuenta-anonimo.png

node native/hub/reference/tools/capture-cdp.mjs http://127.0.0.1:9430 `
  C:/ruta/frontend/node_modules native/hub/reference/tools/demo-states.json `
  C:/tmp/mi-evidencia/wails-demo

./native/hub/reference/tools/capture-native.ps1 -HubProcessId 5678 `
  -Executable C:/ruta/native/target/debug/vantare-hub.exe `
  -EvidenceDirectory C:/tmp/mi-evidencia/native
```

El capturador CDP registra el bloqueo y continúa los estados siguientes;
devuelve 1 si alguno no se capturó. El capturador físico rechaza un ejecutable
distinto, otro DPI, un área cliente diferente, clicks fuera de ventana o falta
de foco. Ambos rechazan escribir dentro del repo.

## Límites

No hay sesión real ni servicios remotos configurados. La demo no prueba
licencias, actualizador, calendario vigente, Supabase, radio, solver, storage,
envío de informes o entrada al juego. Roadmap cargado y Agenda Owner quedan
pendientes. Cuenta/licencias son subpaneles de Ajustes en Wails; Notificaciones
es un popover y Workshop es una ruta de desarrollo independiente de la shell.
No se inventa una navegación equivalente a las 14 entradas nativas.

No se tocó código de producto. El orquestador debe revisar el diff y
reconciliar estas referencias con las entregas posteriores de otros workers.
Notion no se leyó ni actualizó, por la excepción explícita de Isaac; su
seguimiento no se declara completado. La issue técnica es
[#1430](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1430).
