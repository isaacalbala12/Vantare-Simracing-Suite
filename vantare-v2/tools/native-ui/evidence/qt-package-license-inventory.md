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
también contiene 383 ficheros `.qml`, 804 `.png` y 32 traducciones `.qm`;
el cotejo de DLL **no cubre** sus licencias ni avisos de terceros. Qt
[documenta licencias de terceros](https://doc.qt.io/qt-6.10/licenses-used-in-qt.html)
y recomienda atribuir solo los componentes que realmente se distribuyen.

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
