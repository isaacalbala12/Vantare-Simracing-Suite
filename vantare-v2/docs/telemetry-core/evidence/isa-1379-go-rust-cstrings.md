# VAN-764 / GitHub #1379 — comparación parcial Go/Rust del parser LMU

## Lectura rápida

La comparación A/B usa **el mismo frame real de LMU** y ejecuta **la misma
validación de cadenas**. Incluye la llamada a la DLL de Rust y la creación de
las cadenas que necesita Go.

| Métrica | Go actual | Rust + DLL | Diferencia |
| --- | ---: | ---: | ---: |
| Tiempo por frame | 9,346 µs | 6,330 µs | −3,016 µs |
| CPU para 300.000 frames | 3,36 s | 2,30 s | −1,06 s |
| Memoria por frame | 2.848 B | 2.488 B | −360 B |

**Veredicto de esta prueba:** Rust gana en este tramo, pero el ahorro a 60 Hz
equivale a aproximadamente **0,0011 puntos porcentuales de CPU** en el equipo
medido. No alcanza el objetivo orientativo de un punto y no demuestra que
migrar toda la telemetría valga la pena. La CPU de la tabla corresponde al
proceso de benchmark a máxima velocidad; la cifra de 60 Hz es una extrapolación.
La memoria es por operación; la memoria residente del proceso no mostró una
ventaja estable.
Un cambio pequeño en Go, eliminando una conversión redundante, reduce el
tiempo a 8,230 µs/frame y la memoria a 2.464 B/frame. Frente a ese control,
Rust ahorra 1,900 µs/frame y usa 24 B/frame más.

Para decidir la **viabilidad futura** de Rust en la telemetría completa haría
falta medir una etapa completa con las mismas salidas. Esta prueba parcial no
justifica todavía una migración.

Fecha: 2026-09-24. Base: `origin/nightly@5c73013ed59a4d69775a94fcc188d168310c59a5`.
Worktree: `vantareapp/isa-1379-go-rust-telemetry`. Windows/amd64, AMD Ryzen 7
3700X (16 procesadores lógicos), Go 1.26.4 y Rust 1.95.0.

## Alcance medido

Solo la validación de las cadenas C admitidas por el parser de memoria
compartida de LMU. La entrada repetida es la captura sanitizada real
`testdata/lmu-fixture.bin`, 324.820 bytes, 44 coches, SHA-256
`959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff`.
No se generó una parrilla sintética. Rust se llama una vez por frame mediante
DLL Windows y devuelve validez y longitud; Go materializa las mismas cadenas.
Las salidas Go/Rust se contrastaron en cuatro capturas sanitizadas reales.

El control `GoSingleConversion` conserva la semántica del Go productivo y evita
una conversión redundante de cada cadena. No modifica el parser productivo.

## Resultados

Cinco rondas intercaladas en orden Go → Go optimizado → Rust → Rust → Go
optimizado → Go, 500 ms por ejecución. La tabla muestra la mediana de diez
ejecuciones por variante. Salida cruda:
`isa-1379-go-rust-cstrings.txt`.

| Variante | ns/frame | B/frame | asignaciones/frame |
| --- | ---: | ---: | ---: |
| Go productivo | 9.346 | 2.848 | 141 |
| Go, una conversión | 8.230 | 2.464 | 133 |
| Rust + DLL + cadenas Go | 6.330 | 2.488 | 134 |

Rust ahorra 3,016 µs por frame frente al Go productivo en este subtramo y
1,900 µs frente al control Go. No reduce memoria/asignaciones frente al control
Go. Si este único ahorro se mantuviera a 60 Hz, equivaldría aritméticamente a
~0,0011 puntos porcentuales de CPU normalizada sobre 16 procesadores lógicos.
**Es una extrapolación, no CPU de proceso medida.**

Como contraste adicional se ejecutaron procesos de benchmark separados con
300.000 frames cada uno. El host leyó `TotalProcessorTime` de Windows al salir
el proceso y muestreó su working set cada 100 ms. Go/Rust se intercalaron en
tres rondas Go → Rust → Rust → Go. El control Go se ejecutó después en seis
procesos separados, por lo que su CPU no es un pareo térmico estricto.

| Proceso de benchmark | n | Mediana CPU para 300.000 frames | Pico de memoria |
| --- | ---: | ---: | --- |
| Go productivo | 6 | 3,36 s | variable, ~16–19 MB |
| Go, una conversión | 6 | 2,70 s | variable, ~16–17 MB |
| Rust + DLL | 6 | 2,30 s | variable, ~16–18 MB |

Salidas crudas: `isa-1379-go-rust-process.csv` y
`isa-1379-go-control-process.csv`. Esto mide CPU del **proceso de benchmark
saturado**, no CPU de Vantare/Wails a 60 Hz. Los picos de memoria son demasiado
variables y breves para atribuirles una ventaja de memoria. El ahorro medido
permanece del orden de microsegundos por frame.

## Estado de la investigación

La paridad y el tiempo de este subtramo son evidencia válida para el subtramo.
No se ha portado `Parse` completo, `TelemetryEngine.Apply`, el transporte ni la
aplicación Wails. No existe todavía una comparación de CPU del proceso completo,
memoria residente o latencia extremo a extremo. Este resultado no decide si
Rust merece usarse en Telemetry Core ni demuestra un ahorro de un punto de CPU.

Siguiente paso: escoger una frontera completa de coste suficiente, preservar su
salida y calidad semántica sobre el mismo replay real, medir Go/Rust con la
frontera incluida y luego comparar los procesos completos.

## Comprobaciones ejecutadas

- `cargo test --release`: 1 test Rust, PASS.
- `TestRustCStringProbeMatchesGoOnSanitizedLMUCaptures`: 4 capturas, PASS.
- `pnpm --dir frontend build`: PASS para disponer del `frontend/dist` embebido.
- `go test ./...`: PASS en todos los paquetes listados por Go.
- `cargo fmt --check` y `git diff --check`: PASS.
