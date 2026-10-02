# Strategy nativo — ISA-1427 / referencia #1393

El crate `vantare-strategy` pertenece al workspace `native/` y Hub lo importa
como dependencia. Contiene documentos, preparación manual y automática,
correcciones, repositorio local, edición y cálculo sin runtime ni GPUI.
El cálculo con presupuesto numérico tiene un orden determinista; un deadline
real puede interrumpirlo en distintos puntos según la carga del equipo.

## Documento

Lee documentos `strategy.v2` con esquema `2.0.0` y `2.1.0`. Los documentos
nuevos usan `2.1.0`, que permite reglas de evento con evidencia, ventanas de
parada, límites de piloto y compuestos permitidos por clima. La migración de
`2.0.0` a `2.1.0` es explícita, idempotente y no añade reglas. `2.0.0` no admite
el campo `rules`.

Las ediciones validan el documento completo antes de guardar y conservan los
bytes de campos no editados. Las seis entradas de
`testdata/oracle/document-rules.json` se generaron contra Go en
`bd28ed40dd7d2079de7bcfeb9ee9f9d06950cd52`.

## Solver

El solver cubre Fuel, VE, formación, reservas, servicio de paradas, ventanas
obligatorias y degradación. La búsqueda extendida incorpora proyecciones de
Analysis, curvas de ritmo, inventario físico y compuestos, perfiles y límites
de piloto, clima y escenarios, ahorro y peso del combustible, y carreras por
duración. Valida las combinaciones admitidas; no convierte dimensiones
incompatibles en escalares ni inventa evidencia para datos ausentes.

`solve_v2_cancellable` devuelve el modelo `strategy.solver.v2`, coste y
certificado de optimalidad. `proven` y `no_solution` se refieren al ámbito y
la discretización efectiva del certificado. Al vencer presupuesto o deadline
devuelve el mejor plan completo encontrado con `not_proven`, si existe;
una cancelación o un input inválido falla sin publicar resultado. La API de
compatibilidad `solve_cancellable` mantiene el error ante agotamiento.
La búsqueda extendida conserva motivos y prueba explícitos cuando no puede
certificar optimalidad; no se promete un óptimo para todo input aceptado.

Los fixtures escalares y extendidos de `testdata/oracle/` proceden de Go en
`bd28ed40dd7d2079de7bcfeb9ee9f9d06950cd52`. `manifest.json` y
`solver-manifest.json`, verificados por `tests/oracle_hashes.rs`, fijan entradas,
resultados y hashes de fuentes. Los tests comparan decisiones, evaluación,
recursos, replay y los campos de certificado cubiertos por cada fixture.
Esto demuestra paridad del corpus congelado, no de todos los inputs posibles
ni del wire completo en cada caso.

## Application y Hub

La API de aplicación valida entradas manuales, exige una fuente abierta antes
de calcular y valida conjuntos completos de revisiones exactas de Analysis.
`prepare_automatic` resuelve cobertura y aplicabilidad de familias de una
proyección sin sustituir revisiones seleccionadas por otras más recientes.
Las correcciones de familias comprueban precondiciones e intervalos temporales,
se preparan contra una revisión exacta y se reaplican sin cambiar otras familias.
`recalculate_edited_plan` valida y reproduce stints/paradas editados.

El repositorio local guarda drafts y revisiones con generaciones, hash y
reemplazo atómico; migra v1 a v2 conservando el contrato JSON/hash de Go y
valida antes de publicar la migración. La lectura se acota a 64 MiB+1 y rechaza
entradas superiores a 64 MiB. Las operaciones son síncronas: el caller debe
situarlas fuera del renderizado/adquisición. El control de generación no
constituye exclusión entre escritores independientes.

Hub consume estas APIs y presenta resultados probados, parciales o sin solución.
Este crate no proporciona adquisición de Analysis, catálogos firmados ni su
transporte, y no certifica por sí solo la integración visual/operativa de Hub.
La UI v5 Go completa queda fuera de este corte.

## Verificación

Desde `native/strategy`:

```powershell
cargo fmt -p vantare-strategy --check
cargo clippy --workspace --all-targets -j 4 -- -D warnings
cargo test -p vantare-strategy -j 4
```

Desde `native`:

```powershell
cargo fmt -p vantare-strategy --check
cargo clippy --workspace --all-targets -j 4 -- -D warnings
cargo test --workspace -j 4
```

Los goldens son fixtures de contratos Go, no telemetría real ni evidencia de
rendimiento o paridad visual/operativa en Windows.
