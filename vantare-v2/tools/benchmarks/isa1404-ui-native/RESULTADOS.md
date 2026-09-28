# ISA-1404 · resultados de comparación nativa Windows

Fecha de la ejecución: 27–28 de septiembre de 2026. Base: `origin/nightly`
`355e9cfee2fec3c27341fa96ec4e6a9297fab730`. Investigación aislada; no
integra una UI nueva en Vantare ni cambia el núcleo Go.

## Alcance y datos

La comparación larga usa una única escena Standings con ocho filas reales
sanitizadas del fixture LMU 1.3, posiciones 5–12 y jugador 9. Los tres programas
abren ventana de control y overlay. Reproducen un pulso visual a 20 Hz, pero
**no** alimentan un flujo real de telemetría ni incluyen el núcleo Go productivo.
El hash y procedencia de la captura constan en `shared/fixture.json`. La escena
no tiene rivales cercanos para un Radar; no se inventaron filas para incluirlo.

Windows, 16 procesadores lógicos; builds Release. Se midieron tres arranques
independientes por candidato, con 30 s de calentamiento, 60 s visibles y 20 s
ocultos. CPU = porcentaje de la capacidad total de los 16 procesadores; memoria
privada comprometida y working set privado = suma del árbol de procesos. Working
set total incluye páginas compartidas y no debe leerse como RAM exclusiva. El
muestreo de CPU de un segundo cuantiza valores tan pequeños y limita las
comparaciones porcentuales. El tamaño Qt es el despliegue generado por
`windeployqt` sin reducción de módulos. Scripts: `scripts/Measure-Performance.ps1`,
`scripts/Test-Functional.ps1`, `scripts/Test-Scale.ps1` y `scripts/Test-OBS.ps1`.
Las capturas muestran diferencias visuales reales: Wails tiene cabecera de
columnas, Qt Quick la omite y Slint traza separadores más brillantes. Por eso
las cifras no aíslan perfectamente el motor de renderizado; tampoco miden una
UI de complejidad equivalente a la suite futura.

| Escena overlay visible, media de tres rondas | Wails/WebView2 | C++/Qt Quick | Rust/Slint |
|---|---:|---:|---:|
| CPU total | 0,279 % | 0,105 % | 0,244 % |
| Memoria privada comprometida | 200,16 MiB | 70,48 MiB | 204,60 MiB |
| Working set privado | 94,61 MiB | 30,02 MiB | 61,42 MiB |
| Working set total, **con páginas compartidas** | 377,28 MiB | 85,39 MiB | 102,56 MiB |
| GPU dedicada atribuida | 24,57 MiB | 18,82 MiB | 92,25 MiB |
| Arranque hasta ventana | 489 ms | 535 ms | 568 ms |
| Despliegue observado | 11,46 MiB | 121,00 MiB | 13,09 MiB |
| Máximo de procesos del árbol | 7 | 2 | 2 |

Qt Quick redujo en esta escena un 65 % la memoria privada comprometida y un
68 % el working set privado frente a la referencia. Su CPU fue ~0,17 puntos
porcentuales menor; la cifra relativa (~63 %) es frágil por la escala de
muestreo. Slint redujo el working set privado ~35 %, pero no redujo la memoria
privada comprometida. Ninguna cifra demuestra todavía una reducción del 20 %
de la **app completa** ni predice el coste de futuras pantallas y gráficos.

La primera medición Qt quedó inválida: la ventana Win32 aparecía visible, pero
el `root.visible` de QML seguía falso y el pulso estaba detenido. Se reparó el
arranque con `window->show()` y se repitieron tres rondas. La fila Qt válida
procede exclusivamente de `evidence/performance-qt-corrected/`.
`evidence/summary.json` conserva un resumen portable. Las trazas de cada
ronda y los metadatos con rutas/identificador local de máquina permanecen
ignorados en este worktree; para repetirlas están los scripts y la captura
de entrada, no se deben tratar los resúmenes como muestras crudas.

## Comportamiento observable

- Las tres versiones principales abrieron y cerraron control y overlay en
  Release, editaron texto, alternaron intervalo, preservaron foco al abrir
  overlay, dejaron pasar el clic y completaron cinco ciclos sin residuo.
  La automatización de pegado WebView2 fue intermitente: una corrida pasó y la
  última falló; no se considera bug de producto demostrado. Su árbol UIA
  también apareció vacío en alguna corrida.
- OBS Studio portátil, captura de ventana WGC, capturó los tres overlays con
  alpha: [Wails](evidence/obs/wails-obs.png),
  [Qt Quick](evidence/obs/qtquick-obs.png) y
  [Slint](evidence/obs/slint-obs.png). La esquina Qt/Slint tuvo alpha 0; la de
  Wails, 34, por la sombra/borde CSS. Para que OBS enumerara Qt/Slint hubo que
  quitar `WS_EX_TOOLWINDOW` y conservar `WS_EX_APPWINDOW`; falta resolver cómo
  evitar presencia molesta en la barra de tareas sin perder capturabilidad.
- La prueba de escala con variables de entorno a 100 %/150 % mostró 736×689
  -> 1096×1014 en Qt/Slint, con última fila visible. Wails mantuvo 720×650
  bajo ese mecanismo y la última fila quedó dentro del scroll. No equivale a
  cambiar físicamente el DPI de un monitor de Windows.
- La medición en ventana oculta no reveló un fallo claro en Qt/Slint, pero
  Slint marcó ~0,325 % de CPU media en sus muestras ocultas frente a ~0,244 %
  visible. Hace falta entender ese resultado antes de prometer suspensión de
  trabajo cuando el overlay esté oculto.

## Criba adicional solicitada: variantes Rust y C++

Estas fuentes son pequeñas pruebas de **factibilidad**, no benchmarks ni
paridad visual. No puntúan RAM, CPU, OBS, foco, click-through o licencia final.

| Variante | Compilación y ventana Windows | Resultado de overlay | Lectura |
|---|---|---|---|
| C++/Qt Widgets 6.10.2 | Build Release y arranque correctos | Ventana de 360×120 configurada translúcida y topmost; estilo extendido `0x80c0028` incluye `WS_EX_TRANSPARENT` y `WS_EX_NOACTIVATE` | Opción viable para interfaces clásicas, con libertad de dibujo propia; falta verificar alpha, paridad de escena y OBS. |
| Rust/egui-eframe 0.36.2 | `cargo check`, build y ventana correctos | Una casilla UI Automation abrió una segunda ventana nativa de 360×120 configurada transparente/topmost | Viable para explorar herramientas y editores; click-through/no-activate y alpha real en OBS aún sin probar. |
| Rust/Iced 0.14.0 | `cargo check`, build y ventana correctos | Ventana adicional 360×120 sin decoración, transparente/topmost, confirmada en UI Automation | Viable en principio; árbol UIA de controles vacío en este smoke. Falta probar alpha, captura y comportamiento de clic. |
| Rust/GPUI 0.2.2 publicado | `cargo check` y build correctos | **No abrió ventana fiable**: arranque directo terminó con `0xC0000139` (punto de entrada DLL) en este equipo | No pasa el gate Windows de esta ronda. La rama fuente actual documenta Win32/DirectWrite, pero `gpui_platform` no estaba publicado en crates.io; requiere una prueba posterior con un commit fuente fijado y empaquetado controlado. |

Qt Quick y Qt Widgets son dos formas C++ distintas; la prueba Qt Widgets no
justifica sumar su consumo a la tabla Qt Quick. Dear ImGui/Win32-DX11 se revisó
como opción documental [oficial](https://github.com/ocornut/imgui/blob/master/docs/EXAMPLES.md):
es útil para herramientas inmediatas, pero otro build no resolvería las
incertidumbres actuales de overlay ni la visión de una suite compleja. Se
priorizó probar Widgets, que comparte SDK y permite contraste directo.

En licencias, Qt permite usar determinados módulos bajo LGPLv3 con obligaciones
de distribución y algunas piezas tienen condiciones distintas; la lista exacta
de módulos del producto aún no está cerrada. Slint ofrece una licencia gratuita
para escritorio con atribución. egui y GPUI tienen licencias MIT/Apache-2.0,
e Iced MIT. Esta criba no sustituye revisión jurídica de binarios y módulos.

## Estrés Qt heredado, separado del comparador

Se recompiló en esta máquina el renderer Qt histórico del commit
`b11ce4168d9eb50e324bc2a5597778cc8f356494`, con los replays `full` y
`stress104` de su propio contrato. Dos repeticiones, 500 muestras por escenario.
`modelApply` p95: 21,20 ms normal y 153,04 ms stress104; máximos 59,58 y
312,74 ms. Falló sus umbrales de 8 ms p95 y 16,67 ms máximo. Es evidencia de
un problema de **aquel renderer y aquel estrés**, no de que todo Qt Quick sea
incapaz ni de que el prototipo pequeño ya pueda sustituirlo.

## Decisión que sí permite la evidencia

Qt Quick merece la siguiente prueba de producto: mantiene la dirección C++
gratuita bajo cumplimiento de licencia y mostró el mejor consumo en la escena
medida. Slint sigue siendo el candidato Rust más cercano al comparador completo;
Iced y egui quedan como alternativas viables para estudios concretos. GPUI
queda abierto a una prueba Windows desde fuente, sin tratarlo como finalista
funcional hoy. **No se selecciona stack definitivo ni se inicia el port** con
esta muestra.

Antes de arquitectura productiva hacen falta: una pantalla compleja de la
suite, overlay/OBS con Vantare real y DPI físico, actualización de datos real, integración con
Go, licencias exactas de módulos/distribución y comparación del árbol completo
de Vantare contra una baseline Wails real. La ausencia de esas pruebas limita
la inferencia del objetivo de ahorro de RAM y CPU.

Fuentes de capacidades y condiciones: [Qt Widgets translucent background](https://doc.qt.io/qt-6/qwidget.html),
[licencia Qt](https://doc.qt.io/qt-6/licensing.html),
[licencia gratuita Slint](https://www.slint.dev/community),
[Iced window settings](https://docs.rs/iced/0.14.0/iced/window/struct.Settings.html),
[GPUI](https://github.com/zed-industries/zed/blob/main/crates/gpui/README.md),
[Dear ImGui examples](https://github.com/ocornut/imgui/blob/master/docs/EXAMPLES.md).
