# Evidencia ISA-1232 — T02f2 tiempo de formación

## Alcance

- El evento Go acepta `formationSeconds` opcional como tiempo previo a la
  primera vuelta competitiva.
- Su presencia, incluido cero, alimenta el `solver.Formation` existente con
  procedencia explícita; la ausencia conserva el fallback cero y no añade el
  campo al resultado.
- Total, última vuelta y reloj de stints incluyen formación. Conducción y
  distribución por piloto la excluyen.
- La estimación inicial y las siguientes usan la duración competitiva disponible,
  pero la aceptación final conserva el reloj original del evento.

## Decisión mínima

No se modifica SolverV2 ni el cálculo manual. Application adapta el campo al
modelo temporal existente y separa el mismo valor que ya devuelve el replay.
No hay modelo de vueltas de formación ni consumo Fuel/VE.

## Pruebas

- Carrera por vueltas: 30 s aumentan el total exactamente 30 s sin cambiar
  conducción, combustible ni distribución por piloto.
- Carrera temporal 600/60/130: converge en ocho vueltas con depósito para ocho
  y cero paradas permitidas, aunque el horizonte inicial de diez sea inviable.
- Formación y parada explícita cumplen `total = formación + conducción + pit`;
  el reloj del último stint alcanza el total.
- Cero explícito se conserva; ausencia no publica el campo; negativos, infinito
  y formación que agota la carrera temporal se rechazan.
- Focales Formation, Application, SolverV2, `go vet ./internal/strategy/...` y
  `git diff --check`: PASS.
- Build frontend y `go test ./...`: PASS. El aviso de chunks del build es
  heredado.
- Roadmap: 23 + 64 + 21 tests y digest canónico `--check`: PASS.
- Astra high: sin P0/P1/P2 después de detectar y cerrar el horizonte inicial.

## Límites

Sin consumo ni vueltas de formación, TypeScript/custodia recorded, UI,
app/Wails/LMU, DuckDB, push, PR, CI remota, integración o release. T02f3 conecta
los contratos frontend existentes sin añadir otro modelo.
