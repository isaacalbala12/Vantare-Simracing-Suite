# VAN-764 / GitHub #1379 — A/B del parser LMU con Go y Rust

Fecha: 2026-09-24. Rama experimental: `vantareapp/isa-1379-go-rust-telemetry`.
Equipo: Windows/amd64, AMD Ryzen 7 3700X, 16 procesadores lógicos; Go 1.26.4,
Rust 1.95.0. Entrada de rendimiento: la captura real sanitizada
`testdata/lmu-fixture.bin`, 324.820 bytes y 44 coches, SHA-256
`959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff`.

## Comparación directa

Las tres variantes producen la misma `Observation` completa del parser. Go
actual usa el parser productivo. Go fijo sustituye solo la correspondencia de
IDs de scoring/telemetría por tablas fijas de 104 entradas. Rust hace esa misma
correspondencia en una DLL, una llamada por frame, y Go construye los mismos
campos canónicos. La medición incluye llamada DLL y construcción de la salida.

| Variante | Mediana de tiempo/frame | B/frame | Asignaciones/frame |
| --- | ---: | ---: | ---: |
| Go actual | 29,128 µs | 32.096 | 151 |
| Go con tablas fijas | 26,836 µs | 30.398 | 146 |
| Rust para IDs + Go para campos | 25,582 µs | 30.422 | 147 |

Rust ahorra **3,546 µs/frame** frente a Go actual y **1,254 µs/frame** frente
al control Go de algoritmo equivalente. La mejora de memoria/asignaciones
proviene principalmente de evitar los mapas dinámicos: Rust asigna 24 B/frame
y una operación más que el Go de tablas fijas.

Medianas de diez ejecuciones por variante, en cinco rondas intercaladas
Go → Go fijo → Rust → Rust → Go fijo → Go; 500 ms por ejecución.
Salida íntegra: [`isa-1379-go-rust-parser.txt`](isa-1379-go-rust-parser.txt).

## CPU y memoria del proceso de prueba

Se compiló el mismo binario de pruebas y se lanzó un proceso separado por
variante, con 200.000 frames por proceso. Tres rondas en el mismo orden
intercalado; seis procesos por variante. Windows midió `TotalProcessorTime`.
Se muestreó el working set cada 20 ms mientras el proceso estaba activo.

| Variante | Mediana de CPU/200.000 frames | Mediana del pico de working set |
| --- | ---: | ---: |
| Go actual | 7,86 s | 30,6 MB |
| Go con tablas fijas | 7,52 s | 30,4 MB |
| Rust para IDs + Go para campos | 6,84 s | 17,2 MB |

Salida íntegra: [`isa-1379-go-rust-parser-process.csv`](isa-1379-go-rust-parser-process.csv).
Los rangos de CPU por proceso se solapan: Go 7,30–9,03 s, Go fijo 6,55–8,67 s,
Rust 6,27–7,83 s. El pico de memoria Rust varió entre 16,9 y 30,0 MB. La
mediana de pico es una observación de este proceso saturado, **no una ventaja
demostrada de memoria residente en Vantare**. La CPU tampoco es CPU de Wails
a 60 Hz.

## Paridad y alcance

La salida completa de Go actual, Go fijo y Rust+Go es idéntica con `reflect.DeepEqual`
en cuatro capturas LMU sanitizadas reales: 44, 38, 18 y 0 coches. Se iguala
también el rechazo de seis corrupciones del grid, usadas solo como pruebas de
correctitud, nunca como datos de rendimiento. `cargo test --release` y las
pruebas Go del paquete pasan. El código Rust y los comparadores viven en el
spike y en archivos de prueba; el lector productivo no cambia.

Esta es una comparación directa del **parser completo como salida y coste**,
pero Rust solo reemplaza la correspondencia de coches, no todo el parser ni el
motor de telemetría. Los campos, validaciones y objetos canónicos siguen en Go.

## Decisión de viabilidad futura

A 60 Hz, el ahorro observado de 3,546 µs/frame equivale aritméticamente a
**~0,0013 puntos porcentuales de CPU** normalizada sobre los 16 procesadores
lógicos de este equipo. Frente al control Go, ~0,0005 puntos. Incluso eliminar
por completo los 29,128 µs/frame del parser Go actual tendría un techo teórico
de ~0,011 puntos a 60 Hz. Por tanto, **este parser no puede aportar por sí solo
el punto de CPU deseado** con este tamaño de captura y frecuencia.

**Recomendación para una posible adopción futura:** no iniciar una migración de
Telemetry Core a Rust con esta evidencia. En la frontera probada, la ventaja
propia de Rust sobre un algoritmo equivalente en Go es ~1,254 µs/frame y no
alcanza ni una centésima del punto de CPU propuesto. Añadir la DLL implica una
frontera FFI y su empaquetado para un ahorro demasiado pequeño aquí. Los
[costes Go documentados](../../research/telemetry-architecture-2026/05-performance-and-benchmarks.md)
sitúan además la presión principal en payload, serialización y frontend, que
este cambio de lenguaje no aborda. Esa lectura del coste total procede de una
medición anterior; **no es un A/B actual de toda la aplicación**.

La prueba cumple el criterio de decisión para esta investigación: Rust es
técnicamente viable y algo más rápido en la correspondencia LMU, pero **no
merece adoptarse ahora** para esa ruta. Reabrir la opción solo si un perfil
actual de Vantare/Wails identifica una etapa atribuible a Go cuyo coste pueda
producir un ahorro material, y repetir entonces un A/B de esa etapa con salida
equivalente. No se afirma que un puerto íntegro del motor a Rust tenga el mismo
resultado; ese puerto no se ha construido ni medido.
