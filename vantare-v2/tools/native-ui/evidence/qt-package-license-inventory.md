# Inventario preliminar del paquete Qt 6.10.2 en Windows

Este inventario corresponde **solo** a `tools/native-ui/out/package-qt`, creado
con `windeployqt --release --qmldir tools/native-ui/qtquick --compiler-runtime`.
No es un instalador, una lista mínima de dependencias ni una certificación de
licencia para distribuir Vantare. La carpeta `out/` está ignorada por Git.

## Resultado observado

| Origen identificado en SBOM instalado | DLL copiadas | Licencia concluida en esos ficheros |
| --- | ---: | --- |
| `qtbase-6.10.2.spdx.json` | 12 | Incluye `LGPL-3.0-only` |
| `qtdeclarative-6.10.2.spdx.json` | 62 | Incluye `LGPL-3.0-only` |
| `qtsvg-6.10.2.spdx.json` | 3 | Incluye `LGPL-3.0-only` |
| Sin correspondencia en esos SBOM de Qt | 6 | Por determinar |

Las 77 DLL identificadas coincidieron byte a byte por SHA-256 con los
ficheros del mismo Qt 6.10.2 instalado. El valor SPDX completo de las 77 es
`LicenseRef-Qt-Commercial OR LGPL-3.0-only OR GPL-2.0-only OR GPL-3.0-only`.
No apareció una DLL de los módulos que la [lista oficial de Qt 6.10](https://doc.qt.io/qt-6.10/licensing.html) ofrece solo bajo GPLv3. El
`CMakeLists.txt` del prototipo enlaza Core, Gui, Network, Quick y
QuickControls2; `qt_add_qml_module` ejecuta `qmlcachegen` durante el build.
La [documentación de Qt](https://doc.qt.io/qt-6.10/qtqml-qtquick-compiler-tech.html)
distingue esa herramienta de las extensiones comerciales; este inventario
solo inspecciona lo copiado al paquete, no resuelve todas las condiciones del
build ni de redistribución.

Las seis DLL sin correspondencia en los SBOM inspeccionados son
`D3Dcompiler_47.dll`, `dxcompiler.dll`, `libgcc_s_seh-1.dll`,
`libstdc++-6.dll`, `libwinpthread-1.dll` y `opengl32sw.dll`. El paquete
también contiene 383 ficheros `.qml`, 804 `.png` y 32 traducciones `.qm`.
Los 383 QML son copias SHA-256 idénticas a los instalados y todos conservan
una cabecera SPDX con opción `LGPL-3.0-only`. Las imágenes no tienen una
cabecera equivalente. Las 804 PNG son copias SHA-256 idénticas a la instalación;
sus SHA-1 coinciden con 804 entradas del SBOM de **origen**
`qtdeclarative-6.10.2.source.spdx` (780 FluentWinUI3, 18 Windows y seis
Universal). Todas esas entradas incluyen `LGPL-3.0-only` en
`LicenseInfoInFile`, pero declaran `LicenseConcluded: NOASSERTION`: el
cotejo identifica procedencia y opción de licencia, no sustituye los avisos
exigibles ni una decisión de licencia para distribuir. Las traducciones
copiadas no coinciden por hash con
las `.qm` homónimas de la instalación; el cotejo simple no basta para
certificar su procedencia y licencias completas. El cotejo de DLL
**no cubre** traducciones ni avisos de terceros. Qt
[documenta licencias de terceros](https://doc.qt.io/qt-6.10/licenses-used-in-qt.html)
y recomienda atribuir solo los componentes que realmente se distribuyen.

Un `windeployqt --dry-run --list mapping` del mismo ejecutable localizó la
fuente exacta de las seis DLL por SHA-256. Cinco proceden del directorio `bin`
de la instalación Qt 6.10.2; `dxcompiler.dll` procede de
`C:\VulkanSDK\1.4.350.0\Bin` y tiene firma Authenticode válida de LunarG.
Entre las cinco de Qt están los tres runtimes MinGW, `D3Dcompiler_47.dll` y
`opengl32sw.dll`. Qt [identifica este último como Mesa llvmpipe](https://doc.qt.io/qt-6.10/qt-attribution-llvmpipe.html)
y publica sus avisos MIT/Boost. Microsoft [documenta la redistribución local](https://learn.microsoft.com/en-us/windows/win32/directx-sdk--august-2009-)
de `D3Dcompiler_47.dll`. El origen de `dxcompiler.dll` en este paquete depende
del SDK Vulkan instalado en esta máquina; no se ha probado que esa copia y los
runtimes MinGW satisfagan todos los términos de redistribución de Vantare.
La [guía de despliegue de Qt](https://doc.qt.io/qt-6.10/windows-deployment.html)
explica que `windeployqt` toma por defecto el runtime del compilador y ofrece
opciones para excluir los compiladores D3D/DXC, traducciones y OpenGL software;
antes de eliminar componentes hay que comprobar el paquete resultante en
Windows sin Qt ni SDK instalados.

Se creó una segunda carpeta ignorada por Git con `windeployqt --release
--qmldir tools/native-ui/qtquick --compiler-runtime --no-translations
--no-system-dxc-compiler --no-opengl-sw`. Tiene 1.325 archivos y 73,9 MiB,
frente a 1.359 archivos y 121,1 MiB del despliegue por defecto: 47,2 MiB
menos. No contiene `.qm`, `dxcompiler.dll` ni `opengl32sw.dll`. Con el `PATH`
del cliente limitado a directorios Windows y el mismo host Go de captura real
sanitizada, los modos control, editor y overlay recibieron 44 filas y
terminaron con código 0. Esto comprueba arranque local y contrato SSE, pero
no la captura OBS, todas las rutas gráficas, otros sistemas Windows ni una
instalación limpia; tampoco resuelve los avisos de los componentes restantes.

Una captura propia adicional del [editor reducido](qt-trimmed-editor.png)
muestra las 44 filas, el inspector y la vista previa; la del
[overlay reducido](qt-trimmed-overlay.png) muestra las filas y conserva alfa
cero en la esquina (520×500 píxeles). Ambas se revisaron visualmente después
de obtenerlas con `--screenshot`, con el host Go activo y el `PATH` limitado
a Windows. No prueban captura OBS ni composición física del paquete reducido.

## Procedencia comprobada del paquete reducido · 28/09/2026

Una segunda lectura, sin alterar el paquete, confirma 1.325 archivos/73,88 MiB
y 81 DLL: las 77 DLL Qt del cotejo anterior y estas cuatro DLL externas. Los
SHA-256 del paquete coinciden tanto con `6.10.2/mingw_64/bin` como con
`Tools/mingw1310_64/bin` para los tres runtimes MinGW. El compilador D3D
coincide con `6.10.2/mingw_64/bin`, no con el directorio del compilador.

| DLL externa | SHA-256 del paquete | Procedencia comprobada |
| --- | --- | --- |
| `libgcc_s_seh-1.dll` | `5e27589147caa6d7a30f4cc058a14c455dc62233901ffff9a1797ede425e9f86` | Qt 6.10.2 y MinGW 13.1.0 |
| `libstdc++-6.dll` | `8013488c5528bad7966ca07f3ea2e7a9b743cacb258fe76b46a326f821cc83b0` | Qt 6.10.2 y MinGW 13.1.0 |
| `libwinpthread-1.dll` | `c7c7dced65fff71c7bb61f80c771c562f533d26d72722d9d6091129a3b03d5ce` | Qt 6.10.2 y MinGW 13.1.0 |
| `D3Dcompiler_47.dll` | `e994847e01a6f1e4cbdc5a864616ac262f67ee4f14db194984661a8d927ab7f4` | Qt 6.10.2 |

La instalación del compilador incluye `licenses/gcc/COPYING.RUNTIME`
(excepción de runtime GCC 3.1), `licenses/gcc/COPYING3.LIB` y
`licenses/winpthreads/COPYING` (permiso y obligación de conservar el aviso).
[GNU delimita la excepción a bibliotecas con el aviso aplicable](https://www.gnu.org/licenses/gcc-exception-3.1.en.html)
y [Qt documenta la copia del runtime del compilador](https://doc.qt.io/qt-6.10/windows-deployment.html).
La carpeta de prueba no contiene ficheros cuyo nombre sea licencia, aviso,
`COPYING` o atribución: antes de distribuir habría que seleccionar y añadir
los textos exigibles para los componentes realmente incluidos. Este cotejo
identifica origen y textos candidatos, pero no resuelve por sí solo las
obligaciones legales de la app ni del instalador.

El paquete aún incluye 792 PNG en `qml/QtQuick/Controls/FluentWinUI3`
(845 ficheros, 5,18 MiB en ese directorio), aunque este prototipo solo importa
`QtQuick.Controls` y [Qt selecciona Windows por defecto en Windows](https://doc.qt.io/qt-6.10/qtquickcontrols-styles.html).
No se ha probado un paquete sin ese estilo: su presencia es una oportunidad
de reducción, no ahorro acreditado ni permiso para excluirlo sin comprobar
arranque, editor, overlay y rutas de respaldo.

Para repetir el cotejo, enumerar las DLL del paquete, buscar cada nombre en
`<Qt 6.10.2>/sbom/*.spdx.json` → `files[].fileName`, leer
`licenseConcluded` y comparar SHA-256 de la DLL copiada con la ruta indicada
por el SBOM dentro de la misma instalación Qt. Los nombres son una pista;
el hash es la comprobación de identidad. La prueba anterior encontró 83 DLL,
77 coincidencias exactas y seis sin mapa.

## Gate para una distribución sin pago de licencia Qt

Cerrar el conjunto de ficheros **realmente** distribuido, sus dependencias y
avisos de terceros; reducir los estilos y plugins no usados solo tras probar el
paquete resultante en Windows limpio. Después comprobar las
[obligaciones LGPL de Qt](https://www.qt.io/development/open-source-lgpl-obligations),
incluida la sustitución/re-enlace de DLL, copia de licencia y disponibilidad del
código fuente correspondiente de Qt. Este ensayo no acredita todavía que el
instalador, la firma, las condiciones de distribución ni la experiencia de
actualización de Vantare satisfagan esas obligaciones.
