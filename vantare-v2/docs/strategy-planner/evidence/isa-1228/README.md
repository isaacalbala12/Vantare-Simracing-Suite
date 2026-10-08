# Evidencia ISA-1228 — T02e backend de curvas e inventario físico

## Alcance

- `CalculateOrbit` ya aplica la curva combinada y la vida útil derivadas que
  recibe mediante `PlanningInputs`.
- El evento puede transportar el inventario físico individual y los parámetros
  de compuesto existentes de SolverV2.
- La evaluación final conserva compuesto, montaje y cambio/no cambio elegidos
  por el solver.

## Decisión mínima

No se adapta el inventario agregado del documento: no contiene identidad,
condición ni historial por rueda. El backend acepta únicamente inventario físico
explícito y delega toda su validación al dominio existente. Si una edición cambia
la distribución de vueltas con inventario físico, el cálculo la rechaza en vez de
fabricar otra asignación.

## Pruebas

- A/B de curva combinada: ocho segundos exactos sobre ocho vueltas.
- Vida útil derivada: limita el stint a cuatro vueltas.
- Un único juego conserva una parada de combustible sin cambio.
- Dos juegos y vida limitada conservan el cambio y ambos montajes físicos.
- Configuración parcial, doble autoridad de ritmo y redistribución incompatible:
  rechazo cerrado.
- Application, SolverV2 y dominio de neumáticos completos: PASS.
- `go test ./...`, `go vet ./internal/strategy/...`, build web y digest del
  roadmap: PASS. Tests del roadmap: 23 + 64 + 21 PASS.
- Astra high: sin P0/P1/P2 ni complejidad eliminable tras la corrección final.

## Límites

El contrato TypeScript, custodia recorded y UI pertenecen a T02e3–e4. No se
infieren códigos LMU ni individuos desde conteos agregados. Sin app/Wails/LMU,
DuckDB, precisión física real, push, PR, integración o release.
