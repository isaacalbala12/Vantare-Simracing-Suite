# ISA-1222 — horizonte de cálculo por vueltas

Estado: cerrado localmente desde base `73a5b9ce`; sin push, PR, CI remota,
integración ni promoción.

## Cambio

- `CalculateOrbit` acepta `raceKind: "laps"`, `targetLaps` positivo y
  `durationMinutes: 0`.
- La ausencia de `raceKind` conserva el contrato temporal anterior.
- El modo por vueltas pasa por `manual.CalculateRace` y usa directamente el
  cálculo por vueltas ya existente. No convierte distancia a tiempo.
- TypeScript representa ambos casos con una unión discriminada y conserva el
  cero requerido por el transporte.

## Evidencia

- RED observado: los tests Go no compilaban al no existir `RaceKind` ni
  `TargetLaps`.
- Focal Go: horizonte exacto con ritmos distintos, suma de stints, errores y
  puente JSON.
- Focal frontend: transporte exacto del nuevo comando.
- Typecheck frontend: PASS.
- Frontend completo: 447 archivos y 3763 tests PASS; lint y build PASS.
- Go completo `./...`: PASS; vet focal Strategy/app/Analysis/vantare: PASS.
- Roadmap: digest regenerado y 23 tests del digest PASS; contrato validado
  separadamente sobre el commit final.
- Astra high: sin P0/P1/P2; confirmó que no hace falta otra abstracción.

No se abrió la aplicación de escritorio ni LMU y no se modificó ningún DuckDB.
