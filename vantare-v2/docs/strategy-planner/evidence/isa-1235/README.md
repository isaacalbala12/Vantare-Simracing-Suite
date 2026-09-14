# Evidencia ISA-1235 — T02g1 perfil único antes de optimizar

## Alcance

- Si una variante tiene exactamente un piloto y reglas con límites, el cálculo
  crea su perfil antes de SolverV2.
- Cálculo normal, ruta meteorológica y evaluación final reutilizan el mismo
  input, por lo que los límites participan en la optimización y el replay.
- Fuel y VE se resuelven con la precedencia existente de SolverV2.
- Sin límites se conserva el camino anterior.

## Decisión mínima

Se reutilizan `DriverProfileV2`, `DriverLimits`, `orbitSolverInput` y la
evaluación final existentes. Un método público y pequeño expone la resolución
de escalares del solver para evitar duplicar su precedencia. No se añade otro
modelo, resolver, store, interfaz ni contrato TypeScript. Astra high confirmó
que no hay complejidad productiva que eliminar en este corte.

## Pruebas

- RED: un límite de piloto llegaba al solver sin `driverProfiles`.
- RED: el primer enlace usaba VE escalar cruda y perdía una proyección válida.
- RED ampliado: una referencia VE no podía prevalecer sobre la proyección.
- RED: la ruta meteorológica omitía el perfil temprano.
- GREEN: límite permisivo conserva el plan y límite estricto devuelve
  inviabilidad; el identificador se mantiene en todos los stints.
- GREEN: proyección VE 4,865 frente a referencia 1 conserva las dos paradas del
  baseline tanto con límites como sin ellos.
- Focales de límites, VE y meteorología: PASS.
- `go test ./internal/strategy/application/... ./internal/strategy/solver/...`:
  PASS.
- Build web previo a los paquetes con recursos embebidos: PASS, con el aviso
  heredado de chunks mayores de 500 kB.
- `go test ./...`: PASS.
- `go vet ./internal/strategy/application/... ./internal/strategy/solver/...`:
  PASS.
- Roadmap regenerado y estable: digest 23/23, Discord 64/64 y contrato 21/21.
- `git diff --check`: PASS.
- Astra high: sin P0/P1/P2.

## Límites

No define selección u orden multipiloto, disponibilidad, turnos, nuevos campos
persistidos, UI, app/Wails/LMU, DuckDB, push, PR, CI remota, integración o
release.
