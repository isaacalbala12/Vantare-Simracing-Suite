# Strategy nativo — ISA-1427 / referencia #1393

El crate `vantare-strategy` contiene documento, preparación manual y cálculo
determinista sin runtime ni GPUI. Sigue siendo autónomo; Hub compila estas
mismas fuentes con `#[path]` mientras el workspace no incluya este crate.

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

El solver cubre el subespacio escalar manual: Fuel, VE, formación, degradación
lineal, vida de neumático, reservas, paradas y ventanas obligatorias, con
discretización explícita. Rechaza dimensiones no portadas; no interpreta una
proyección, forecast, perfil de piloto, inventario físico o compuesto como
valores escalares.

`solve_v2_cancellable` devuelve el modelo `strategy.solver.v2`, coste y estado
de optimalidad. `proven` y `no_solution` solo describen búsqueda exhaustiva en
el subespacio escalar validado. Al vencer presupuesto o deadline devuelve el
mejor plan completo encontrado con `not_proven`; cancelar o entregar input
inválido sigue siendo un error. La API de compatibilidad `solve_cancellable`
mantiene el error ante agotamiento.

El fixture `solver-v2-results.json` procede de `SolveV2` en el mismo commit Go
y conserva hashes de los 36 archivos del paquete solver. Los tests comparan
factibilidad, stints, paradas y coste en 125 casos escalares. No es paridad del
wire completo `SolverResultV2`.

## Application y Hub

La API de aplicación valida entradas manuales, exige una fuente abierta antes
de calcular y valida conjuntos completos de revisiones exactas de Analysis.
Hub usa el cálculo manual y presenta si el resultado es probado, parcial o sin
solución.

No se porta aquí la derivación automática de proyecciones, el repositorio de
drafts/revisiones, correcciones de familias de Analysis ni catálogos firmados:
requieren servicios que este crate nativo no tiene. Tampoco hay edición nativa
de stints/paradas ni recálculo por esa edición; la UI v5 queda fuera de este
corte.

## Verificación

Desde `native/strategy`:

```powershell
cargo fmt --check
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo test -p vantare-strategy -j 2
```

Desde `native`:

```powershell
cargo fmt --all --check
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo test --workspace -j 2
```

Los goldens son fixtures de contratos Go, no telemetría real ni evidencia de
rendimiento o paridad visual/operativa en Windows.
