# ISA-1404 · comparación ejecutable de UI nativa

Este directorio contiene prototipos de investigación aislados. No forma parte del
runtime productivo y no decide por sí solo una migración.

## Comparables

- `reference-wails`: referencia Go + Wails 3 + React + WebView2.
- `qtquick-cpp`: candidato C++20 + Qt Quick 6.10.2.
- `slint-rust`: candidato Rust 1.95 + Slint 1.18.1.

La ampliación pedida posteriormente añade **cribas cortas**, no comparables de
rendimiento: `qtwidgets-cpp`, `egui-rust`, `iced-rust` y `gpui-rust`. Sus ventanas
no implementan la misma escena ni se deben mezclar con la tabla de consumo.
`RESULTADOS.md` explica resultados, fallos y límites.

Los tres consumen `shared/fixture.json`, derivado sin inventar filas de la
captura LMU real sanitizada `testdata/lmu-fixture.*`. La escena muestra las
posiciones 5–12 para incluir al jugador. La captura disponible no contiene
rivales en rango próximo: por eso el radar queda fuera de esta comparación y
no se rellena con datos sintéticos.

## Modos comunes

Cada ejecutable acepta una ventana de control y una ventana overlay. Ambos
renderizan la misma tabla, actualizan un pulso a 20 Hz y permiten mostrar u
ocultar la columna de intervalo. El overlay debe ser transparente, topmost,
sin activación y click-through en Windows.

La automatización y la evidencia se guardan en `evidence/`; los binarios y SDK
locales quedan ignorados. Las pruebas físicas se ejecutan con builds Release y
la misma secuencia de calentamiento/medición.

## Puertas

1. build optimizada y arranque;
2. controles, foco, teclado y copiar/pegar;
3. alpha real del overlay;
4. click-through y no activación;
5. paridad de datos y escena;
6. cinco ciclos sin procesos residuales;
7. escalado de Windows;
8. captura OBS;
9. ventana oculta sin actualizaciones innecesarias;
10. cambio pequeño: alternar la columna de intervalo.

Los resultados de carga normal y del estrés histórico de Qt se reportan por
separado. No se transforma un caso patológico en promedio ni se extrapola una
microprueba de parser al coste de la UI completa.

## Reproducción rápida

En Windows, desde este directorio, con Rust 1.95 y Qt 6.10.2 MinGW instalados:

```powershell
cargo check --manifest-path egui-rust/Cargo.toml
cargo check --manifest-path iced-rust/Cargo.toml
cargo check --manifest-path gpui-rust/Cargo.toml
cmake -S qtwidgets-cpp -B out/qtwidgets -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER="$((Get-Command g++.exe).Source)" -DCMAKE_PREFIX_PATH="<ruta-a-Qt>/6.10.2/mingw_64"
cmake --build out/qtwidgets -j 4
```

Los comandos de la comparación principal y el hardware usado están en
`RESULTADOS.md`. Los SDK, binarios, sesiones OBS portátiles y salidas temporales
permanecen fuera de Git.

La medición usa `scripts/Measure-Performance.ps1` con `-Mode control` para P01
(control visible, overlay cerrado) y `-Mode combined` para P02 (control
minimizado, overlay visible). El modo `overlay` mide solo una ventana y sirve
como diagnóstico; no sustituye P02. Cada escenario requiere tres rondas
independientes y el script comprueba que las ventanas estén en el estado
esperado. `RESULTADOS.md` recoge las cifras y las limitaciones; P03, el coste
incremental de OBS, sigue sin medirse.
