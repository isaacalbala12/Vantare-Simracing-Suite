# Oráculo Strategy #1430

Desde `vantare-v2`:

```powershell
go run -p 2 ./tools/strategy-oracle --out native/strategy/testdata/nuevo-oraculo
```

La salida debe ser nueva. El exportador llama al `Validate` de documento V2 y
al `SolveV2` productivos de Go, nunca a Rust. Congela commit fuente, hashes
SHA-256 de los paquetes Strategy/StrategyProjection, inputs, salida Go completa
comprimida y una proyección semántica pequeña para comparación Rust.

- `documents.json`: 34 entradas y aceptación/rechazo del validador Go; incluye
  escenarios climáticos, proyecciones Analysis, metadatos/backups de migración
  y mutaciones inválidas.
- `solver.json`: 125 entradas escalares y resultado comparable; 6 errores,
  3 planes inviables y 116 óptimos (incluidas dos carreras de 139 vueltas).
- `solver-go.json.gz`: `SolverResultV2` íntegro; conserva la duración Go medida,
  que no se compara porque no es determinista.
- `sources.json`: huellas de las fuentes Go de referencia.
- `manifest.json`: SHA-256 de los cuatro archivos. El test Rust fija además el
  hash literal del manifiesto; regenerar exige revisar y actualizar ese pin.

La comparación por campo cubre factibilidad, stints, vueltas/cantidades/modo de
paradas, todos los componentes de `expected`, cantidades iniciales mínimas y
recursos restantes. Las entradas inválidas deben rechazarse; el texto exacto del
error Go no es contrato portado. No se comparan ranking, sensibilidades, riesgos,
estadísticas de búsqueda ni los demás campos todavía no producidos por Rust.

Los presupuestos Go del corpus permiten completar la búsqueda de referencia.
Rust verifica por separado cancelación, presupuesto agotado y rechazo de
dimensiones no portadas. Una paridad escalar no demuestra paridad completa de
SolveV2. Los fixtures son casos de prueba declarados, no mediciones LMU reales.
