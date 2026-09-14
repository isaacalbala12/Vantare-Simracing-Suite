# Evidencia ISA-1231 — T02f1 servicios explícitos de parada

## Alcance

- `OrbitCalculationEvent` acepta opcionalmente tránsito, tasas de Fuel y VE,
  tiempo de neumáticos y modo paralelo o secuencial.
- El adaptador convierte ese objeto completo al `PitCostModel` que ya utiliza
  SolverV2.
- Los valores explícitos sustituyen el modelo all-in anterior y prevalecen
  sobre `pitLossSeconds`, overrides y proyecciones históricas.
- Sin `pitServices`, el coste legacy conserva su valor, tasas centinela y modo.

## Decisión mínima

Se reutilizan el evento, el solver y el replay existentes. Sólo se añade el
contrato de producto y una función de adaptación compartida por validación y
cálculo. No hay un segundo modelo de parada, interfaz, repositorio ni validador.

## Pruebas

- 20 s de tránsito, 10 L a 2 L/s y 8 s de neumáticos: 28 s en paralelo y 33 s
  en secuencial.
- Un `pitLossSeconds=60`, un override de 99 s y una proyección contradictoria
  no se suman ni sustituyen el valor explícito.
- El replay es factible y la comparación usa el coste realmente reproducido.
- Objeto incompleto y tasa cero se rechazan; ausencia conserva el modelo legacy.
- `go test ./internal/strategy/application ./internal/strategy/solver`: PASS.
- Build frontend y `go test ./...`: PASS. El aviso de chunks del build es
  heredado.
- `go vet ./internal/strategy/...` y `git diff --check`: PASS.
- Roadmap: 23 + 64 + 21 tests y digest canónico `--check`: PASS.
- Astra high: sin P0/P1/P2 y sin capas eliminables.

## Límites

La tasa VE debe ser positiva incluso cuando el evento no usa VE porque este
corte exige un modelo completo. Formación y su efecto sobre consumo/horizonte
pertenecen a T02f2. TypeScript y custodia recorded pertenecen a T02f3. Sin UI,
app/Wails/LMU, DuckDB, push, PR, CI remota, integración o release.
