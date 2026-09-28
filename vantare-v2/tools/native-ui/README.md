# VAN-776 · host Go y UI nativa de investigación

Este corte comprueba una frontera concreta: ventanas Qt Quick y Rust/Slint reciben el
contrato Overlay V2 de Go por SSE sin iniciar Wails ni WebView2. Una tercera
ventana Wails/React usa el mismo host y las mismas vistas como referencia local.
No cambia el runtime de Vantare ni selecciona el stack final. Continúa la [comparación
VAN-775](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1409).

LMU 1.4.2.0 estuvo disponible el 28/09/2026: el diagnóstico opt-in capturó
cuatro muestras reales sanitizadas con 18 coches y reloj cambiante. La versión
sigue fuera de la lista productiva del driver Go; aún no hay proyección Overlay
V2 viva para comparar las tres UI. [Evidencia y límite](evidence/lmu-1420-live-diagnostic.md).

## Datos y arquitectura del corte

`host` verifica el SHA-256 de `testdata/lmu-fixture.bin`, captura LMU real
sanitizada. Usa el parser LMU con evidencia de build 1.3.0, Fusion,
BatchMapper, Reducer, Pipeline, CachedProjector y el servidor SSE de producción.
Publica una sola proyección observada de 44 coches. No inventa ticks ni simula
telemetría viva: el estado `live` describe la captura original, no una sesión
LMU activa en este equipo.

El host ofrece además `go run ./tools/native-ui/host -live`: lee el driver LMU
real, pasa sus observaciones por BatchMapper, Reducer, Pipeline y CachedProjector
y publica cada proyección Overlay V2 por el mismo SSE. Rechaza explícitamente
una build sin fixtures pinneados. Con LMU 1.4.2.0 en pista, la ejecución acabó
con `evidence=unsupported;build=1.4.2.0`; no se atribuye a este modo ninguna
medición de UI viva todavía. El test del host alimenta esa ruta con la captura
real pinneada 1.3.0 y comprueba las 44 filas publicadas, pero una captura fija
no demuestra actualización ni rendimiento con la sesión actual.

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
Faltan carga dinámica, persistencia del editor, validación GPU, picos de inicio, repetición estadística
y una referencia del producto completo.

Una segunda serie de tres rondas rotó el orden de candidatos y sumó el árbol
de cada editor al mismo host Go ya calentado, incluido su proceso de consola.
Cada ronda tomó cinco muestras tras tres segundos de calentamiento. El script
`measure-windows.ps1` ahora acepta `-ExtraProcessIds` y recoge `GPU Process
Memory(*)\Local Usage` de los PID del árbol. El host medía unos 66 MiB de
working set al final de esta serie; por eso los totales no se comparan
directamente con la tabla anterior, que lo excluía y lo midió recién iniciado.
Con el host en un puerto fijo, un ejemplo de la medición Qt es:

```powershell
$port = 54682
$goHostPid = (Get-NetTCPConnection -LocalPort $port -State Listen).OwningProcess
./tools/native-ui/measure-windows.ps1 -Executable tools/native-ui/out/qtquick/vantare-native-go-qt.exe -Arguments @('--endpoint',"http://127.0.0.1:$port/telemetry/overlay-v2/projection",'--mode','editor') -Label editor -QtBin '<ruta a Qt 6.10/mingw_64/bin>' -ExtraProcessIds $goHostPid -WarmupSeconds 3 -Samples 5
```

| Editor + Go, mediana de tres rondas | Working set | Memoria privada | GPU local atribuida |
| --- | ---: | ---: | ---: |
| Wails/React | 457,3 MiB | 290,7 MiB | 44,6 MiB |
| Qt Quick | 160,3 MiB | 141,7 MiB | 35,1 MiB |
| Rust/Slint | 175,5 MiB | 291,1 MiB | 102,3 MiB |

[Las nueve filas](evidence/full-tree-static-results.csv) muestran también CPU,
picos y procesos. Qt redujo un 65 % el working set y un 51 % la memoria
privada frente a Wails en **este editor fijo**; Slint redujo un 62 % el
working set, pero no la memoria privada y su contador GPU local fue mayor.
Los porcentajes de CPU medidos fueron 0–0,044 % de la máquina, demasiado
pequeños para acreditar ahorro. Los contadores GPU son diagnósticos, no una
medida definitiva de VRAM: [Microsoft documenta casos de valores incorrectos](https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/gpu-process-memory-counters-report-wrong-value).
No hubo grabación OBS en esta serie ni telemetría que cambiase; antes de elegir
stack siguen haciendo falta carga real, GPU validada con otra herramienta y
paridad del producto completo.

### Comprobación adicional del contador GPU · 28/09/2026

Con el mismo host Go caliente y la captura LMU 1.3.0 real sanitizada, se
midió también `\GPU Adapter Memory(*)\Dedicated Usage`: total del adaptador
antes, durante y después de abrir **solo** un editor cada vez. La diferencia
de cada prueba es el valor mediano durante la ventana menos la media de los
valores previos y posteriores. Hubo tres rondas en orden rotado
Wails→Qt→Slint, Qt→Slint→Wails y Slint→Wails→Qt; cada ventana tuvo tres
segundos de calentamiento y cinco muestras. El host común permaneció abierto
y queda fuera del working set y memoria privada de las ventanas.

| Editor fijo · mediana de tres rondas | Aumento total del adaptador | `GPU Process Memory` local | Working set de ventana y descendientes |
| --- | ---: | ---: | ---: |
| Wails/React | 50,8 MiB (45,3–51,0) | 44,6 MiB | 395,8 MiB |
| Qt Quick | 37,7 MiB (37,0–39,6) | 35,1 MiB | 95,5 MiB |
| Rust/Slint | 102,3 MiB (99,9–106,6) | 102,3 MiB | 110,5 MiB |

[Las nueve filas](evidence/gpu-adapter-static-results.csv) incluyen los
valores antes/durante/después, memoria privada, CPU y procesos. La deriva
máxima entre antes y después fue 12,5 MiB (Wails), 5,3 MiB (Qt) y 8,2 MiB
(Slint). Las dos lecturas mantienen el mismo orden en esta escena; el total
del adaptador incluye **otras aplicaciones** y ambos contadores dependen de
Windows/WDDM, así que no son una medición independiente de VRAM física ni
prueba del consumo GPU de Vantare completa. La CPU siguió próxima a cero.
Una primera ejecución se descartó porque había incluido PID 0 en la suma de
procesos; `measure-windows.ps1` ahora rechaza IDs adicionales no positivos.

Para repetirla con el host de captura en `127.0.0.1:54677`, las tres ventanas
Release ya compiladas y el paquete Qt reducido presentes:

```powershell
./tools/native-ui/measure-gpu-adapter-windows.ps1 -Port 54677 -Rounds 3
```

Este ensayo no usa LMU 1.4.2.0 ni datos que cambien. El siguiente gate de
rendimiento sigue siendo la comparación con proyección viva, el producto
completo y una fuente GPU adicional que no dependa de los mismos contadores.

### Actualización de las tres UI con capturas reales · 28/09/2026

El modo aislado `host -recorded` usa tres frames distintos de LMU 1.4.0.0
capturados y sanitizados: pre-pit en pista, pit y salida. Verifica cada SHA-256
antes de arrancar el servidor, exige evidencia exacta de build y pasa los
frames por Fusion, BatchMapper, Reducer, Pipeline, CachedProjector y SSE. La
espera predeterminada de seis segundos **solo pauta el replay**: no
representa la cadencia original de LMU, una sesión viva ni una carga
suficiente para comparar CPU.
`-recorded-interval` permite ampliar esa espera para inspección visual sin
modificar los bytes de las capturas.
El test Go comprueba que la proyección cambia `track → pit → track` y rechaza
una captura alterada.

El [ensayo Windows](inspect-recorded-updates-windows.ps1) abrió cada candidato
en control, editor y overlay. Los nueve procesos terminaron con código 0 tras
recibir tres snapshots con una fila. [Resultados](evidence/recorded-update-results.csv).
Qt y Slint cuentan eventos válidos; la referencia Wails cuenta revisiones
distintas. La prueba Go demuestra que el origen contiene cambios reales, pero
el código de salida de la ventana no verifica cada píxel ni que los tres
clientes muestren visualmente el estado pit. Esta prueba tampoco habilita
LMU 1.4.2.0 en producción.

El wire compacto omite `v` cuando una magnitud válida vale cero; `q=fresh`
la distingue de un valor ausente. Los tres renderizadores del ensayo ahora
muestran `0` en ese caso. El ensayo de ventana
[`inspect-recorded-render-windows.ps1`](inspect-recorded-render-windows.ps1)
comprueba mediante UI Automation la marcha `0` en pit y `1` en salida en el
modo control. Lee texto real de la ventana, no píxeles; tampoco demuestra
paridad visual del producto ni rendimiento con LMU en vivo.
[Seis lecturas](evidence/recorded-render-results.csv) pasaron en este Windows.

Con los ejecutables Release de Qt y Slint, y el frontend Wails del ensayo
compilados como se indica arriba, se reproduce así desde `vantare-v2/`:

```powershell
go test ./tools/native-ui/host -run TestRecordedLMU -count=1
go build -o tools/native-ui/out/host-recorded.exe ./tools/native-ui/host
./tools/native-ui/inspect-recorded-updates-windows.ps1 -Mode editor
./tools/native-ui/inspect-recorded-render-windows.ps1 -Candidate qt
./tools/native-ui/inspect-recorded-render-windows.ps1 -Candidate slint
./tools/native-ui/inspect-recorded-render-windows.ps1 -Candidate wails
```

### Carga repetida de tres capturas reales · 28/09/2026

El host de ensayo acepta `-recorded-cycles` para repetir las tres capturas
LMU 1.4.0.0 fijadas por SHA, sin generar ni modificar datos de coches. La
cadencia de 100 ms es artificial y las capturas solo contienen una fila:
sirve para exigir actualizaciones sostenidas, **no** reproduce la carga ni
la cadencia de LMU en vivo. En Windows, control, editor y overlay de Qt,
Slint y Wails recibieron al menos diez snapshots en nueve ejecuciones.
[Los nueve resultados](evidence/recorded-burst-results.json) quedan fijados;
el modo anterior de un solo ciclo siguió pasando.

[`measure-recorded-windows.ps1`](measure-recorded-windows.ps1) reinicia el
host Go por candidato, rota el orden en tres rondas y mide editor más host:
ocho muestras por ejecución, tres segundos de calentamiento y publicación
comprobada de al menos 100 frames reales repetidos. Medianas de las tres
rondas en [los nueve registros](evidence/recorded-load-results.json):

| Editor + Go, replay repetido | CPU media (% de un núcleo) | Working set mediano | Memoria privada mediana |
| --- | ---: | ---: | ---: |
| Wails | 7,43 % | 438,1 MiB | 294,4 MiB |
| Qt Quick | 4,63 % | 131,2 MiB | 146,9 MiB |
| Rust/Slint | 5,58 % | 159,6 MiB | 295,1 MiB |

Frente a Wails, las medianas de CPU son 37,7 % menores con Qt y 24,9 %
menores con Slint **en esta prueba**. La CPU varió entre rondas; en la
segunda Qt registró 5,50 % y Wails 5,37 %. La carga de una fila, la
repetición de solo tres estados y la duración corta impiden extrapolar
estos porcentajes a Vantare completa o acreditar el objetivo del 20 %.
El contador GPU local sigue siendo diagnóstico, sin fuente independiente.

```powershell
go build -o tools/native-ui/out/host-recorded.exe ./tools/native-ui/host
./tools/native-ui/inspect-recorded-updates-windows.ps1 -Mode editor -Cycles 100 -IntervalMilliseconds 100 -ExpectedSnapshots 10
./tools/native-ui/measure-recorded-windows.ps1 -Rounds 3 -Samples 8
```

### Carga densa fija de 44 coches · 28/09/2026

La misma ruta del host puede repetir la captura LMU 1.3.0 real y sanitizada
de 44 coches, también fijada por SHA-256. El test Go comprueba 44 filas y
revisiones sucesivas; control, editor y overlay de Qt, Slint y Wails
recibieron diez snapshots en [nueve ejecuciones](evidence/recorded-burst-44-results.json).
Es una **captura fija repetida**: las filas no evolucionan como en LMU vivo.

El [mismo instrumento](measure-recorded-windows.ps1), con host reiniciado y
orden rotado, produjo [nueve mediciones](evidence/recorded-load-44-results.json).
Medianas de tres rondas de editor más host Go, ocho muestras por ejecución:

| 44 coches repetidos | CPU media (% de un núcleo) | Working set mediano | Memoria privada mediana |
| --- | ---: | ---: | ---: |
| Wails | 6,80 % | 454,7 MiB | 317,2 MiB |
| Qt Quick | 4,55 % | 138,5 MiB | 155,1 MiB |
| Rust/Slint | 11,49 % | 166,3 MiB | 298,1 MiB |

Qt redujo la mediana de CPU un 33,1 % frente a Wails en esta escena;
Slint la superó un 69,0 %. Las tres rondas mantuvieron el mismo orden
relativo de CPU. El prototipo Slint sustituye tres modelos de datos por
snapshot, por lo que hace falta perfilar o mejorar ese cliente antes de
atribuir el coste al toolkit. El resultado tampoco mide cambios reales de
44 coches ni acredita el objetivo de CPU de Vantare completa. La memoria
GPU local continúa sin corroboración independiente.

Se corrigió después esa sustitución en el cliente Slint del ensayo: conserva
los tres modelos y modifica solo las filas que cambian. El tamaño de la lista
puede cambiar sin perder el modelo. Con las mismas capturas, instrumento y
orden rotado, las [nueve mediciones de 44 coches](evidence/recorded-load-44-model-diff-results.json)
resultaron así (medianas de tres rondas):

| 44 coches, modelo Slint estable | CPU media (% de un núcleo) | Working set mediano | Memoria privada mediana |
| --- | ---: | ---: | ---: |
| Wails | 6,53 % | 450,9 MiB | 315,6 MiB |
| Qt Quick | 5,23 % | 137,3 MiB | 153,3 MiB |
| Rust/Slint | 3,41 % | 144,4 MiB | 296,3 MiB |

En la escena fija, Slint pasó de 11,49 % a 3,41 % de un núcleo y de 166,3 a
144,4 MiB de working set. Esta diferencia identifica un coste importante de
la implementación inicial, **no** una propiedad general del toolkit. Como
las mismas 44 filas se repiten, la nueva versión evita casi todas las
notificaciones de cambio: no se debe extrapolar a 44 coches evolucionando.
Los [nueve smokes de 44 coches](evidence/recorded-burst-44-model-diff-results.json)
recibieron al menos diez snapshots en control, editor y overlay.

La [secuencia de pista y boxes](evidence/recorded-load-model-diff-results.json)
sí cambia sus tres estados reales de una fila. Allí las medianas de CPU
Wails/Qt/Slint fueron 6,82/4,85/4,25 % de un núcleo; working set
438,3/131,4/159,6 MiB. Los [nueve smokes de esa secuencia](evidence/recorded-burst-model-diff-results.json)
pasaron. El script de inspección física confirmó marcha 0 en boxes y 1 al
salir con la versión nueva de Slint. Ninguna escena prueba aún la meta de
20 % de CPU o RAM en Vantare completa. La memoria privada de Slint se
mantiene cerca de Wails, y el contador GPU local no tiene corroboración
independiente.

```powershell
./tools/native-ui/inspect-recorded-updates-windows.ps1 -Mode editor -Scene standings-44 -Cycles 100 -IntervalMilliseconds 100 -ExpectedRows 44 -ExpectedSnapshots 10
./tools/native-ui/measure-recorded-windows.ps1 -Rounds 3 -Samples 8 -Scene standings-44
```

### Última comparación directa: GPUI frente a Qt Quick · 28/09/2026

Isaac pidió una última prueba de la parte visual entre Rust/GPUI y C++/Qt.
El GPUI 0.2.2 publicado no había abierto ventana en la criba anterior; esta
prueba fija la [revisión oficial de Zed](https://github.com/zed-industries/zed/tree/72d28c32c2ba77a579e1c02f984654518552124b/crates/gpui)
`72d28c32`, incluido `gpui_platform` para Win32. La ventana abrió en
Windows y recibió 44 filas y diez snapshots del host Go con salida 0.
Su `Cargo.lock` incluye 664 paquetes: es un coste de dependencia del ensayo,
no una dependencia añadida al producto.

El editor GPUI dibuja las mismas áreas visuales principales que Qt (tarjetas
de circuito/velocidad/motor, Standings, Relative e inspector), con la misma
captura LMU 1.3.0 sanitizada. Se revisó la [captura GPUI](evidence/gpui-go-editor.png)
junto a la [captura Qt](evidence/qt-go-editor.png). El inspector GPUI es
**solo visual**: no tiene controles editables ni se comprobó overlay
transparente/clic/OBS en esta variante. La paridad funcional sigue a favor del
prototipo Qt y estas cifras no deben interpretarse como comparación de producto
terminado.

Con `measure-recorded-windows.ps1 -Comparison gpui-qt -Scene standings-44`
se midió editor + host Go durante tres rondas alternadas, ocho muestras por
ronda y al menos 100 publicaciones por ejecución. La captura de 44 coches se
repite sin alterar filas a 100 ms artificiales. [Resultados brutos](evidence/recorded-load-44-gpui-qt-results.json):

| Editor + Go, 44 coches fijos | CPU media (% de un núcleo) | Working set mediano | Memoria privada mediana |
| --- | ---: | ---: | ---: |
| Qt Quick/C++ | 4,36 % | 138,2 MiB | 154,2 MiB |
| Rust/GPUI | 9,13 % | 94,5 MiB | 120,9 MiB |

GPUI redujo el working set un 31,6 % frente a Qt, pero consumió un 109,4 %
más CPU en la mediana. En las tres rondas GPUI ocupó menos RAM y más CPU que
Qt. La escena estática, el inspector no interactivo y la ausencia de overlay
GPUI impiden extrapolar la diferencia a Vantare completa. El contador GPU
local tampoco está corroborado. Para este corte, **Qt Quick sigue siendo el
candidato más completo y con menor CPU frente a GPUI**; GPUI conserva una
ventaja de RAM que necesitaría una implementación equivalente para decidir una
migración. No se abre otra variante en esta comparación.

```powershell
cargo build --release --manifest-path tools/native-ui/gpui/Cargo.toml
./tools/native-ui/measure-recorded-windows.ps1 -Comparison gpui-qt -Scene standings-44 -Rounds 3 -Samples 8
```

### Standings Eficiencia: GPUI y Qt Quick optimizados · 29/09/2026

La comparación anterior de editores no era una prueba final del widget: su
inspector GPUI solo era visual y las superficies tenían costes distintos.
Isaac pidió rehacerla con **Standings Eficiencia/Signature**. Se fijó una
configuración visual común de 428 × 364 px (cabecera integrada de 42 px,
diez filas de 30 px y pie de 22 px), columnas posición/piloto/gap/mejor
vuelta, jugador resaltado, tres primeras filas tonales, acento rojo y fondo
translúcido. Geometría y formato provienen de
`StandingsFunctional.tsx`, `tokens.css`, `functional-standings-layout.ts` y
`standings-formatting.ts`, con la
[referencia visual Eficiencia](../../design-evidence/functional/standings-joined-final.png)
como contraste; ambos clientes reciben **el mismo SSE Go**.
Se inspeccionaron visualmente ambas ventanas sobre LMU, pero las capturas
incluían texto de la sesión de fondo y se descartaron para no publicarlo.
[`inspect-efficiency-windows.ps1`](inspect-efficiency-windows.ps1) comprueba
que ambos ejecutables reciben 44 filas y diez snapshots sin capturar pantalla.
La captura de 44 coches tiene gaps y mejores vueltas sin
calidad válida, por lo que se muestran guiones; ningún tiempo fue inventado.

La ruta específica del widget solo materializa las diez filas visibles.
GPUI evita `cx.notify()` si filas, reloj, clase y pie no cambian y consulta
la cola cada 50 ms, con margen frente al replay de 100 ms; Qt evita emitir
`efficiencyChanged` si la misma vista llega repetida. Ambos conservan por separado el
contador de snapshots para el smoke. El parser respeta calidad ausente,
formatea tiempos con la precisión del producto y conserva el `LÍDER` de la
primera posición. La medición separa el proceso UI del conjunto UI+Go.
El modo Eficiencia usa la política visual sin blur: permite comparar el
renderizado translúcido sin cargar a uno de los candidatos con un efecto
distinto. No incluye aún el logo como imagen, la cinta de bandera, el rail
PIT, las animaciones, la selección de clase ni la ventana contextual del
producto. Por ello las capturas son **aproximaciones del diseño**, no una
paridad de píxel ni de comportamiento completo. El área cliente es 428 ×
364 px en los dos; DWM reporta 444 × 372 px para el marco invisible GPUI.

Con 44 coches reales sanitizados **fijos** repetidos a 100 ms artificiales,
se intercalaron cuatro variantes (Qt y GPUI, cada uno con y sin repintado
forzado), tres rondas y ocho muestras de un segundo por ejecución. Las
medianas de las variantes optimizadas en
[los doce registros brutos](evidence/recorded-load-44-efficiency-refresh-sweep-results.json)
son:

| 44 coches fijos | CPU UI (% de un núcleo) | Working set UI | Privada UI | CPU UI+Go | Working set UI+Go |
| --- | ---: | ---: | ---: | ---: | ---: |
| C++/Qt Quick | 1,86 % | 90,5 MiB | 72,1 MiB | 4,55 % | 123,3 MiB |
| Rust/GPUI | 2,20 % | 58,5 MiB | 44,5 MiB | 5,07 % | 90,8 MiB |

Qt gastó menos CPU visual en las tres rondas; GPUI ahorró 35,4 % de working
set y 38,3 % de memoria privada visual frente a Qt. La CPU del conjunto
varió más por el host común; no se atribuye esa variación al toolkit. Frente
al repintado forzado, la mediana de CPU UI GPUI bajó de 3,52 a 2,20 %
(37,5 %). En Qt, la mediana visual fue 1,82 % con repintado forzado y
1,86 % sin él; las rondas variaron de dirección, por lo que un ahorro de CPU
de esa supresión **no queda demostrado**.
El repintado forzado es una opción de diagnóstico, no la configuración de
uso. Ambos ejecutables se mantuvieron por encima de LMU durante las medidas;
el ensayo anterior de editores no controlaba esta equivalencia.
La secuencia real de pista/boxes/salida, con **una sola fila cambiante**,
produjo otras seis mediciones
([datos brutos](evidence/recorded-load-pit-efficiency-gpui-qt-results.json)):

| Pista/boxes/salida | CPU UI (% de un núcleo) | Working set UI | Privada UI | CPU UI+Go |
| --- | ---: | ---: | ---: | ---: |
| C++/Qt Quick | 2,01 % | 89,4 MiB | 72,9 MiB | 2,39 % |
| Rust/GPUI | 2,56 % | 57,4 MiB | 43,4 MiB | 2,85 % |

Qt volvió a usar menos CPU visual y GPUI menos RAM en las tres rondas.
Esta segunda escena comprueba la ruta de actualizaciones, pero no representa
una parrilla de 44 coches evolucionando ni una sesión viva de LMU 1.4.2.0.
El contador GPU local de Windows sigue sin fuente independiente, y aún
faltan OBS/GPUI, DPI mixto y medición del producto completo. No se elige
stack ni se acredita el 20 % global con estos prototipos.

```powershell
cargo test --release --manifest-path tools/native-ui/gpui/Cargo.toml
cargo clippy --release --manifest-path tools/native-ui/gpui/Cargo.toml -- -D warnings
cmake --build tools/native-ui/out/qtquick --config Release
./tools/native-ui/inspect-efficiency-windows.ps1
./tools/native-ui/measure-recorded-windows.ps1 -Comparison gpui-qt -Mode efficiency -Scene standings-44 -RefreshSweep -Rounds 3 -Samples 8
./tools/native-ui/measure-recorded-windows.ps1 -Comparison gpui-qt -Mode efficiency -Scene pit-sequence -Rounds 3 -Samples 8
```

### Reconexión de la referencia Wails

Con Wails abierto antes que el host Go, el proxy del ensayo respondía 502.
La ventana mostraba `RECONNECTING` pero conservaba cero filas incluso después
de arrancar el host: un `EventSource` cerrado por una respuesta distinta de
200 no reintenta por sí solo, según el
[estándar HTML](https://html.spec.whatwg.org/multipage/server-sent-events.html#the-eventsource-interface).
El cliente de referencia vuelve a abrirlo tras ese cierre, y deja al navegador
gestionar las desconexiones temporales que aún están en estado `CONNECTING`.

[`inspect-wails-late-host-windows.ps1`](inspect-wails-late-host-windows.ps1)
abre la ventana sin host y exige `RECONNECTING` con cero filas; arranca después
el host con una captura LMU 1.3.0 real sanitizada y exige 44 filas; detiene el
host, exige otra vez `RECONNECTING`, lo reinicia y comprueba que la vista
recupera las 44 filas. Pasó tres rondas físicas en Windows, registradas en
[`wails-reconnect-results.csv`](evidence/wails-reconnect-results.csv). Este
check valida el baseline Wails del ensayo, no la reconexión del producto
completo ni una sesión LMU viva.

```powershell
./tools/native-ui/inspect-wails-late-host-windows.ps1
```

## Licencia sin coste de licencia

El paquete Qt reducido local se cotejó ahora contra el mapeo íntegro de
`windeployqt`: 1.324 archivos de Qt idénticos por SHA-256, el backend
OpenSSL omitido expresamente y el ejecutable del ensayo adicional (1.325
archivos y 73,86 MiB en total). El backend Schannel permanece. Qt
[permite esta exclusión en Windows](https://doc.qt.io/qt-6.10/ssl.html) si no
se requieren funciones propias de OpenSSL; este ensayo usa solo HTTP local.
Control, editor y overlay siguieron recibiendo tres snapshots por candidato. El
[auditor](audit-qt-package-windows.ps1) y el
[resultado](evidence/qt-trimmed-provenance-results.csv) permiten repetir el
cotejo. La [matriz de procedencia](evidence/qt-package-license-inventory.md)
mantiene separados los hashes de la revisión de avisos y obligaciones que
faltan antes de distribuir.

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
se ofrece sin pago con atribución. La
[licencia Royalty-free 2.0](https://slint.dev/agreements/slint-royalty-free-license.pdf)
permite una app de escritorio con `AboutSlint` accesible desde Acerca de o
con el distintivo en una web pública visible; no cubre sistemas embebidos.
La distribución final y sus avisos deben
revisarse antes de escoger stack; esta prueba local no certifica cumplimiento
legal ni selecciona licencia para Vantare.

Como ensayo de empaquetado Windows, `windeployqt 6.10.2 --release --qmldir
tools/native-ui/qtquick --compiler-runtime` copió el ejecutable Qt y sus
dependencias detectadas a un directorio aislado. Resultaron 1.359 archivos y
121,1 MiB; el ejecutable empaquetado abrió el editor y cerró con código 0 sin
añadir Qt al `PATH` del proceso. El despliegue por defecto incluyó varios
estilos de Qt Quick Controls, traducciones y plugins: es una cota de este
ensayo, no un paquete optimizado ni una lista de licencia aprobada. El
ejecutable Rust/Slint mide 14,0 MiB y el Wails 17,2 MiB, ambos sin instalador;
el host Go separado mide 18,5 MiB. Wails además necesita WebView2 instalado,
y estos tamaños por sí solos no comparan el coste instalado ni el cumplimiento
de distribución. Antes de elegir Qt habrá que cerrar el conjunto de módulos
y sus avisos LGPL; antes de elegir Slint, su licencia y atribución aplicables.
El [inventario preliminar de la carpeta Qt](evidence/qt-package-license-inventory.md)
coteja las DLL copiadas con los SBOM de esta instalación: 77 de 83 coinciden
por SHA-256 y declaran la opción LGPLv3. Los 383 QML coinciden también con la
instalación y tienen cabecera SPDX con esa opción. Un cotejo posterior
identificó las 804 imágenes PNG en el SBOM de origen de Qt, todas con opción
LGPLv3, y rastreó el origen local de las seis DLL. Siguen abiertos los avisos,
traducciones y condiciones de redistribución de los componentes no Qt. No
acredita una distribución gratuita conforme a licencia.
La copia de prueba reducida previa, sin traducciones, DXC ni OpenGL software,
ocupó 73,9 MiB/1.325 archivos; control, editor y overlay recibieron las 44
filas con Qt/Vulkan fuera del `PATH`. Se revisaron capturas propias del
[editor](evidence/qt-trimmed-editor.png) y
[overlay](evidence/qt-trimmed-overlay.png), este último con alfa cero en la
esquina. El inventario explica sus límites.

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
