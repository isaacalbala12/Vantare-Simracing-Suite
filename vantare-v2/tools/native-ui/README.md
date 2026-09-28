# VAN-776 · host Go y UI nativa de investigación

Este corte comprueba una frontera concreta: ventanas Qt Quick y Rust/Slint reciben el
contrato Overlay V2 de Go por SSE sin iniciar Wails ni WebView2. Una tercera
ventana Wails/React usa el mismo host y las mismas vistas como referencia local.
No cambia el runtime de Vantare ni selecciona el stack final. Continúa la [comparación
VAN-775](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1409).

## Datos y arquitectura del corte

`host` verifica el SHA-256 de `testdata/lmu-fixture.bin`, captura LMU real
sanitizada. Usa el parser LMU con evidencia de build 1.3.0, Fusion,
BatchMapper, Reducer, Pipeline, CachedProjector y el servidor SSE de producción.
Publica una sola proyección observada de 44 coches. No inventa ticks ni simula
telemetría viva: el estado `live` describe la captura original, no una sesión
LMU activa en este equipo.

`qtquick` y `slint` consumen `GET /telemetry/overlay-v2/projection` solo por
loopback y muestran sesión, instrumentos, 44 filas de Standings y Relative. El
modo `editor` añade un inspector nativo con título, número de filas, opacidad,
acento y visibilidad de Relative, además de una vista previa alimentada por
la misma captura Go. Es un borrador local sin persistencia ni efecto sobre el
overlay separado. Los overlays usan
una ventana transparente sin foco y click-through. El host y las ventanas son
procesos separados para que la medición incluya el coste de cada uno. La
referencia Wails usa el Wails v3 beta ya presente en el repositorio. Sirve
React desde un puerto local temporal y retransmite SSE hacia el host Go: el
servidor de assets embebido de Wails no entregó el primer evento de un stream
abierto en esta prueba. Este servidor local pertenece solo al ensayo.
Al detener el host con un SSE aún conectado, primero intenta cerrar con gracia
durante dos segundos y después fuerza el cierre de conexiones remanentes;
un test reprodujo el timeout anterior y verifica esta salida limpia.

## Reproducción Windows

Desde `vantare-v2/`, con Go, CMake, MinGW y Qt 6.10 disponibles:

```powershell
go test ./tools/native-ui/host ./internal/telemetry/drivers/lmu
go run ./tools/native-ui/host -fixture testdata/lmu-fixture.bin
```

El host imprime su URL local con puerto asignado. Para probar un arranque
tardío del host se puede usar `-port 54677`, siempre en loopback, y arrancar
la ventana antes que el host en ese mismo puerto. En otra terminal:

```powershell
cmake -S tools/native-ui/qtquick -B tools/native-ui/out/qtquick -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="<ruta a Qt 6.10/mingw_64>"
cmake --build tools/native-ui/out/qtquick -j 4
tools/native-ui/out/qtquick/vantare-native-go-qt.exe --endpoint "http://127.0.0.1:<puerto>/telemetry/overlay-v2/projection" --mode control --expect-rows 44
tools/native-ui/out/qtquick/vantare-native-go-qt.exe --endpoint "http://127.0.0.1:<puerto>/telemetry/overlay-v2/projection" --mode editor --expect-rows 44
tools/native-ui/out/qtquick/vantare-native-go-qt.exe --endpoint "http://127.0.0.1:<puerto>/telemetry/overlay-v2/projection" --mode overlay --expect-rows 44
```

`--expect-rows 44` termina con código 0 al recibir las 44 filas de Go, o 6
tras cinco segundos si no llegan. `--screenshot <ruta.png>` guarda solo la
ventana Qt para inspección visual; [control](evidence/qt-go-control.png) y
[overlay](evidence/qt-go-overlay.png) y
[editor](evidence/qt-go-editor.png) son capturas de este corte. El píxel de
esquina del overlay conserva alpha 0 en la captura propia. La composición y el
paso del clic en Windows se prueban más abajo.

Con Rust estable y Cargo, en otra terminal con el mismo host Go activo:

```powershell
cargo build --release --manifest-path tools/native-ui/slint/Cargo.toml
tools/native-ui/slint/target/release/vantare-native-go-slint.exe --endpoint "http://127.0.0.1:<puerto>/telemetry/overlay-v2/projection" --mode control --expect-rows 44
tools/native-ui/slint/target/release/vantare-native-go-slint.exe --endpoint "http://127.0.0.1:<puerto>/telemetry/overlay-v2/projection" --mode editor --expect-rows 44
tools/native-ui/slint/target/release/vantare-native-go-slint.exe --endpoint "http://127.0.0.1:<puerto>/telemetry/overlay-v2/projection" --mode overlay --expect-rows 44
```

El cliente Rust usa Slint 1.18.1 y ventanas Win32 para click-through y
topmost. La salida 0 confirma el contrato y la carga de 44 filas; no demuestra
por sí sola paridad visual, transparencia física ni captura en OBS. Las pruebas
físicas de composición, clic y captura aparecen más abajo. Con un
endpoint desconectado, ambos clientes terminan con código 6 tras cinco segundos.

Para reproducir la referencia Wails, primero construye el frontend y después
el ejecutable Go, con el mismo host de captura en ejecución:

```powershell
pnpm --dir frontend exec vite build --config ../tools/native-ui/wails/vite.config.mjs
go test ./tools/native-ui/wails
go build -o tools/native-ui/out/wails/vantare-native-go-wails.exe ./tools/native-ui/wails
tools/native-ui/out/wails/vantare-native-go-wails.exe -endpoint "http://127.0.0.1:<puerto>/telemetry/overlay-v2/projection" -mode editor -expect-rows 44
```

`-mode` admite también `control` y `overlay`; los tres confirmaron 44 filas.
`-expect-rows` espera hasta diez segundos y devuelve 6 si la vista no confirma
la recepción de la captura. El modo overlay es una ventana sin marco, superior,
transparente y click-through por configuración; su composición y captura OBS
se inspeccionaron en este escritorio Windows.

Para inspeccionar el editor Wails, se puede iniciar con `-mode editor
-debug-port 9223 -auto-close 60s` y ejecutar
`node tools/native-ui/wails/inspect.cjs 9223`. El puerto CDP solo se abre si se
pide explícitamente y queda en loopback. La inspección comprobó 44 filas y
todos los controles locales (título, filas, opacidad, acento, Relative y
restablecimiento). Guardó una [captura de la página](evidence/wails-go-editor.png)
desde WebView2, revisada visualmente; no sustituye una prueba de interacción
física, foco o OBS.

`inspect-editor-windows.ps1` abre Qt o Slint en modo editor con el mismo
endpoint, verifica el rótulo de 44 coches, escribe `NATIVE` mediante teclado,
captura la ventana y pulsa físicamente Restablecer. Ambos volvieron a
`STANDINGS`. Ejemplos:

```powershell
./tools/native-ui/inspect-editor-windows.ps1 -Candidate qt -Endpoint "http://127.0.0.1:<puerto>/telemetry/overlay-v2/projection" -QtBin "<ruta a Qt 6.10/mingw_64/bin>"
./tools/native-ui/inspect-editor-windows.ps1 -Candidate slint -Endpoint "http://127.0.0.1:<puerto>/telemetry/overlay-v2/projection"
```

Las capturas de [Qt](evidence/qt-go-editor-interaction.png) y
[Slint](evidence/slint-go-editor-interaction.png) fueron revisadas. La primera
pasada Slint reveló que Restablecer cambiaba la vista previa pero dejaba el
campo de título antiguo; `text <=> root.preview-title` corrigió ese fallo.

`inspect-overlay-windows.ps1` abre los tres overlays con el host Go activo,
coloca una ventana real debajo, la activa con un clic y comprueba que el color
de una esquina cambia al cambiar el fondo, que otro clic llega a la ventana
inferior y que el foco no se pierde. El ensayo inicial detectó que Slint
aplicaba los estilos Win32 a una ventana auxiliar de 16×16 en vez de la de
520×500. Se corrigió la selección y se añadió `WS_EX_LAYERED`, necesario para
el hit testing de ventanas superiores con `WS_EX_TRANSPARENT` según
[Microsoft](https://learn.microsoft.com/en-us/windows/win32/dwm/bestpractices-ovw).
La primera instrumentación de Qt dio falsos negativos porque la ventana
inferior no había obtenido el foco; ahora el script exige esa precondición.

```powershell
./tools/native-ui/inspect-overlay-windows.ps1 -Endpoint "http://127.0.0.1:<puerto>/telemetry/overlay-v2/projection" -QtBin "<ruta a Qt 6.10/mingw_64/bin>"
```

En tres rondas consecutivas con la captura Go, Qt Quick, Slint y Wails
devolvieron `CornerRespondsToUnderlay`, `ClickThrough`,
`ForegroundPreserved` y `HitIsUnderlay` verdaderos. Esto verifica composición
y ratón en este escritorio Windows; la captura OBS se comprueba por separado.
Quedan otras escalas DPI y el empaquetado. [Resultados completos](evidence/overlay-functional-results.csv).

OBS 32.1.2, en modo portátil aislado, capturó cada ventana mediante una fuente
`window_capture` seleccionada por su título. Se usó el
[`obs_capture.py` de la comparación #1409](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1409)
con WebSocket local, fuente y escena distintas por candidato. Los tres PNG
fueron revisados y muestran las filas procedentes del host Go: [Qt](evidence/obs-qt-go.png),
[Slint](evidence/obs-slint-go.png) y [Wails](evidence/obs-wails-go.png).
`GetSourceScreenshot` conservó alfa parcial en la esquina de los tres archivos
(185, 162 y 157, respectivamente, sobre 255); las ventanas seleccionadas y
tamaños constan en [los resultados](evidence/obs-capture-results.csv). Esto
acredita captura de ventana, no grabación sostenida, mezcla en una escena real,
rendimiento con OBS ni prueba LMU activa.

## Medición local preliminar

Windows 11 25H2, WebView2 153, Go 1.26.4, Qt 6.10.2, Slint 1.18.1. Una sola
captura fija de 44 coches, sin telemetría que cambie. Ejecutables Release,
mismo host Go aislado; cada ventana se abrió individualmente y se cerró antes
de medir la siguiente. El script [`measure-windows.ps1`](measure-windows.ps1)
cuenta la ventana y todos sus procesos hijos, incluidos los de WebView2;
después de dos segundos de calentamiento tomó cinco muestras separadas por un
segundo. El host común consumía 20,6 MiB de working set y 52,3 MiB privados y
no está incluido en la tabla.

| Vista editor | Working set mediano | Memoria privada mediana | Procesos |
| --- | ---: | ---: | ---: |
| Wails/React | 397,2 MiB | 249,2 MiB | 8 |
| Qt Quick | 91,8 MiB | 87,6 MiB | 2 |
| Rust/Slint | 109,2 MiB | 239,0 MiB | 2 |

En la misma pasada, control midió 389,2 / 90,1 / 107,5 MiB y overlay
388,5 / 82,6 / 106,1 MiB de working set para Wails / Qt / Slint,
respectivamente. Estas son mediciones de una escena pequeña, con una sola
pasada y sin paridad completa de Vantare. Working set suma páginas compartidas
entre procesos y no equivale a RAM exclusiva. La CPU en reposo osciló cerca de
cero y no permite afirmar un ahorro de CPU ni el objetivo del 20 % en la app.
Faltan carga dinámica, persistencia del editor, GPU, picos de inicio, repetición estadística
y una referencia del producto completo.

## Licencia sin coste de licencia

El prototipo Qt enlaza Core, Gui, Network, Quick y QuickControls2. La
[documentación de Qt 6.10](https://doc.qt.io/qt-6.10/licensing.html) distingue
los módulos disponibles bajo LGPLv3 de los que solo ofrece bajo GPLv3;
[Qt Quick](https://doc.qt.io/qt-6.10/qtquick-index.html) y
[Qt Quick Controls](https://doc.qt.io/qt-6.10/qtquickcontrols-index.html)
declaran LGPLv3 como opción. Antes de distribuir una app con Qt sin pagar
licencia, hay que comprobar todos los módulos y artefactos realmente
desplegados y satisfacer las
[obligaciones LGPL de Qt](https://www.qt.io/development/open-source-lgpl-obligations),
incluida la posibilidad de sustituir/re-enlazar las bibliotecas Qt.

El paquete usado aquí, Slint 1.18.1, declara
`GPL-3.0-only OR LicenseRef-Slint-Royalty-free-2.0 OR LicenseRef-Slint-Software-3.0`.
La [licencia comunitaria de escritorio de Slint](https://slint.dev/get-started)
se ofrece sin pago con atribución. La distribución final y sus avisos deben
revisarse antes de escoger stack; esta prueba local no certifica cumplimiento
legal ni selecciona licencia para Vantare.

Para la prueba de caída y vuelta, se inicia `host -port <puerto>` y luego
cada cliente con `--expect-rows 44 --expect-snapshots 2`. Tras el primer
snapshot se detiene el host y se reinicia en el mismo puerto. Ambos clientes
permanecieron abiertos durante el corte y salieron con código 0 tras el
segundo snapshot. En este modo el timeout es de quince segundos.

## Límites y siguiente prueba

La captura fija no prueba actualización continua,
rendimiento de Vantare completa ni ahorro del 20 %. El editor prueba controles
y vista previa locales; falta persistencia de producto,
DPI físico, grabación y medición con OBS, empaquetado y licencia de módulos Qt. Los
clientes nativos reintentan la conexión: ambas variantes recibieron 44 filas cuando
arrancaron antes que el host y volvieron a recibirlas tras reiniciarlo. Falta
probar cambios de telemetría en vivo. No se debe usar esta escena para elegir
arquitectura productiva.
