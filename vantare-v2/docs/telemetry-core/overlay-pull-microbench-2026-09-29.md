# ISA-1403 — Dos rondas diagnósticas del pull Overlay Rust

Fecha: 2026-09-29. Equipo Windows local. Fuente: golden real de 44 coches
`internal/telemetry/projection/overlayv2/testdata/overlay_v2_44.golden.json`.
Comando: `cargo bench --manifest-path rust/telemetry/Cargo.toml --locked --bench overlay_pull`.
Cada modo ejecuta 100 operaciones de calentamiento y cinco bloques de 400;
prepara fuera de la ventana las versiones JSON del golden. Cada operación
publica snapshot, hace pull+ACK y codifica la respuesta. Se mide tiempo de
pared por operación; no CPU del producto. No incluye LMU, proyección, IPC,
Wails, Go ni renderizado. No comparar estas cifras con G0 o con la ruta final.

| Código | `sections=0`, microsegundos por operación, bloques 1–5 | `sections=1`, bloques 1–5 | Mediana 0 / 1 |
| --- | --- | --- | --- |
| `f8de46ab`: validación y secciones con árbol `Value` | 427,2 · 427,2 · 427,2 · 434,3 · 447,7 | 1510,5 · 1475,2 · 1430,2 · 1495,4 · 1498,5 | 427,2 / 1495,4 |
| Ronda 1 local: validar JSON con `RawValue`, conservar secciones `Value` | 41,1 · 41,1 · 41,6 · 41,3 · 41,0 | 1042,0 · 1038,3 · 1025,5 · 1031,4 · 1041,3 | 41,1 / 1038,3 |
| Ronda 2 local: extraer secciones crudas y comparar sin reconstruir el árbol | 45,0 · 42,5 · 43,8 · 42,9 · 41,8 | 90,6 · 87,8 · 89,0 · 88,9 · 96,4 | 42,9 / 89,0 |

El coste aislado fue la materialización y segunda serialización del árbol
JSON. La ronda 1 reduce el coste del modo completo unas diez veces en este
microbanco; la ronda 2 reduce el modo de secciones unas diecisiete veces
respecto al código inicial. La variación entre bloques y la ausencia de un
banco pareado impiden atribuir esos ratios al rendimiento live del producto.
`RawValue` es una feature de la dependencia `serde_json` ya existente; no se
añade una librería nueva. Se mantuvieron tests de replay, epoch, pérdida de
clave, golden de 1/20/44/104 coches y la suite Rust completa. El siguiente
perfil debe tomarse sobre el camino integrado antes de otra optimización.
